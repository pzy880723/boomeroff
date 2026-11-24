import io
import json
import os
import re
import shutil
import sqlite3
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from erp import Fault
from store import DECODE_SLOT, RESERVED_DISK, fields, text


ENTRY_ID = r'[A-Za-z0-9_-]{1,80}'
TABS = {'knowledge', 'training', 'quiz', 'records', 'favorites'}
LIMITS = {'title': 120, 'summary': 550, 'details': 3200, 'tips': 1600}
LEGACY_MAX = 50_000
SCOPED_ENTRY = "(json_array_length(e.shop_ids)=0 OR EXISTS (SELECT 1 FROM json_each(e.shop_ids) s WHERE s.value IN (SELECT value FROM json_each(?))))"


def packed(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def row_id(value):
    if not isinstance(value, str) or not re.fullmatch(ENTRY_ID, value):
        raise Fault(400, 'invalid_body')
    return value


def card_edit(body):
    fields(body, LIMITS, LIMITS)
    return {key: text(body[key], size, key == 'tips') for key, size in LIMITS.items()}


def quiz_items(value):
    if not isinstance(value, list) or len(value) > 30:
        raise Fault(400, 'invalid_body')
    clean = []
    for q in value:
        fields(q, ('prompt', 'options', 'answer'), ('prompt', 'options', 'answer'))
        options = q['options']
        if (not isinstance(options, list) or not 2 <= len(options) <= 6
                or type(q['answer']) is not int or not 0 <= q['answer'] < len(options)):
            raise Fault(400, 'invalid_body')
        clean.append({'prompt': text(q['prompt'], 600, False),
                      'options': [text(o, 320, False) for o in options], 'answer': q['answer']})
    return clean


class LearningStore:
    def __init__(self, root, generate=None, recover=False, fresh_start=False):
        self.path = Path(root) / 'learning.sqlite'
        self.generate = generate
        self.fresh_start = fresh_start
        self.pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix='go-knowledge') if generate else None
        with self.db() as conn:
            conn.executescript("""
              PRAGMA journal_mode=WAL;
              CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL,
                category TEXT NOT NULL, data TEXT NOT NULL, quiz TEXT NOT NULL, created REAL NOT NULL,
                shop_ids TEXT NOT NULL DEFAULT '[]');
              CREATE TABLE IF NOT EXISTS favorites (actor TEXT NOT NULL, entry TEXT NOT NULL REFERENCES entries(id),
                selected INTEGER NOT NULL, updated REAL NOT NULL, PRIMARY KEY(actor,entry));
              CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, actor TEXT NOT NULL,
                entry TEXT NOT NULL REFERENCES entries(id), quiz TEXT NOT NULL, answers TEXT, result TEXT, submitted REAL,
                created REAL NOT NULL);
              CREATE INDEX IF NOT EXISTS attempts_actor ON attempts(actor,submitted);
              CREATE TABLE IF NOT EXISTS training_reads (actor TEXT NOT NULL, entry TEXT NOT NULL REFERENCES entries(id),
                completed REAL NOT NULL, PRIMARY KEY(actor,entry));
              CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, actor TEXT NOT NULL, input TEXT NOT NULL,
                status TEXT NOT NULL, output TEXT, saved TEXT, created REAL NOT NULL, tries INTEGER NOT NULL,
                image BLOB, image_rev INTEGER NOT NULL DEFAULT 0);
              CREATE TABLE IF NOT EXISTS draft_retries (draft TEXT NOT NULL REFERENCES drafts(id), nonce TEXT NOT NULL,
                PRIMARY KEY(draft,nonce));
              CREATE TABLE IF NOT EXISTS legacy_identities (source TEXT PRIMARY KEY, actor TEXT UNIQUE NOT NULL);
              CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            """)
            if 'image_rev' not in {row['name'] for row in conn.execute('PRAGMA table_info(drafts)')}:
                conn.execute('ALTER TABLE drafts ADD image_rev INTEGER NOT NULL DEFAULT 0')
            if 'shop_ids' not in {row['name'] for row in conn.execute('PRAGMA table_info(entries)')}:
                conn.execute("ALTER TABLE entries ADD shop_ids TEXT NOT NULL DEFAULT '[]'")
            # A restarted process does not silently repeat an uncertain paid request.
            if recover:
                conn.execute("UPDATE drafts SET status='failed' WHERE status='generating'")
        os.chmod(self.path, 0o600)

    @contextmanager
    def db(self):
        conn = sqlite3.connect(self.path, timeout=5)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys=ON')
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def close(self):
        if self.pool:
            self.pool.shutdown(wait=True)

    def can_generate(self, actor):
        return bool(self.generate and actor.can_author_knowledge)

    @staticmethod
    def _author(actor):
        if not actor.can_author_knowledge:
            raise Fault(403, 'forbidden')

    @staticmethod
    def _entry(conn, key, actor=None):
        row = conn.execute('SELECT * FROM entries WHERE id=?', (key,)).fetchone()
        if row is None:
            raise Fault(404, 'not_found')
        allowed = set(json.loads(row['shop_ids']))
        if actor and allowed and not allowed.intersection(shop[0] for shop in actor.shops):
            raise Fault(404, 'not_found')
        return row

    @staticmethod
    def _view(row, favorite=False, detail=False):
        data = json.loads(row['data'])
        keys = ('summary', 'cover_url', 'cover_id', 'brand', 'origin', 'era', 'importance')
        if detail:
            keys += ('body', 'tips', 'details', 'card_type', 'sections')
        return {**{key: data[key] for key in keys if key in data},
                'id': row['id'], 'kind': row['kind'], 'title': row['title'], 'category': row['category'],
                'favorite': bool(favorite), 'quiz_available': row['quiz'] != '[]'}

    def list(self, actor, tab, q='', category='', sort='latest', page=1, record_kind='all'):
        if (tab not in TABS or sort not in {'latest', 'hot', 'importance'} or not 1 <= page <= 500
                or record_kind not in ('all', 'quiz', 'training') or tab != 'records' and record_kind != 'all'):
            raise Fault(400, 'invalid_query')
        q, category = text(q, 100), text(category, 50)
        with self.db() as conn:
            ready = conn.execute("SELECT 1 FROM metadata WHERE key='legacy_imported'").fetchone() is not None
            offset = (page - 1) * 30
            mine = (actor.user_id,)
            scope = packed([k for k, _ in actor.shops])
            if tab == 'records':
                rows = conn.execute("""SELECT r.*,e.title FROM (
                        SELECT a.id,a.entry,a.result,a.submitted,'quiz' AS record_kind FROM attempts a WHERE a.actor=? AND a.result IS NOT NULL
                        UNION ALL
                        SELECT 'course-'||t.entry,t.entry,'{}',t.completed,'training' FROM training_reads t WHERE t.actor=?
                      ) r JOIN entries e ON e.id=r.entry WHERE (?='all' OR r.record_kind=?) AND """ + SCOPED_ENTRY +
                                    ' ORDER BY r.submitted DESC,r.id LIMIT 31 OFFSET ?',
                                    (*mine, *mine, record_kind, record_kind, scope, offset)).fetchall()
                items = [{'id': r['id'], 'entry_id': r['entry'], 'title': r['title'], 'submitted': r['submitted'],
                          'record_kind': r['record_kind'], **json.loads(r['result'])} for r in rows[:30]]
                return {'items': items, 'legacy_ready': ready, 'library_ready': ready or self.fresh_start,
                        'has_more': len(rows) > 30}
            where, args = ["(? = '' OR instr(lower(e.title || ' ' || COALESCE(json_extract(e.data,'$.summary'),'') || ' ' || COALESCE(json_extract(e.data,'$.brand'),'')),lower(?))>0)",
                           "(? = '' OR e.category=?)", SCOPED_ENTRY], [q, q, category, category, scope]
            if tab in {'knowledge', 'training'}:
                where.append('e.kind=?')
                args.append(tab)
            elif tab == 'quiz':
                where.append("e.quiz<>'[]'")
            else:
                where.append('f.selected=1')
            order = {'latest': 'e.created DESC', 'importance': "COALESCE(json_extract(e.data,'$.importance'),0) DESC,e.created DESC",
                     'hot': '(SELECT COUNT(*) FROM favorites ff WHERE ff.entry=e.id AND ff.selected=1) DESC,e.created DESC'}[sort]
            if tab == 'favorites':
                order = 'f.updated DESC'
            rows = conn.execute("""SELECT e.*,f.selected FROM entries e LEFT JOIN favorites f ON f.entry=e.id AND f.actor=?
                                    WHERE """ + ' AND '.join(where) + ' ORDER BY ' + order + ', e.id LIMIT 31 OFFSET ?',
                                (*mine, *args, offset)).fetchall()
            return {'items': [self._view(r, r['selected']) for r in rows[:30]],
                    'legacy_ready': ready, 'library_ready': ready or self.fresh_start, 'has_more': len(rows) > 30}

    def detail(self, actor, key):
        with self.db() as conn:
            item = self._entry(conn, key, actor)
            picked = conn.execute('SELECT selected FROM favorites WHERE actor=? AND entry=?', (actor.user_id, key)).fetchone()
            result = self._view(item, picked and picked['selected'], detail=True)
            if item['kind'] == 'training':
                result['training_complete'] = conn.execute('SELECT 1 FROM training_reads WHERE actor=? AND entry=?',
                                                           (actor.user_id, key)).fetchone() is not None
            return result

    def favorite(self, actor, key, body):
        fields(body, ('selected',), ('selected',))
        if type(body['selected']) is not bool:
            raise Fault(400, 'invalid_body')
        with self.db() as conn:
            self._entry(conn, key, actor)
            conn.execute("""INSERT INTO favorites VALUES(?,?,?,?) ON CONFLICT(actor,entry)
                           DO UPDATE SET selected=excluded.selected,updated=excluded.updated""",
                         (actor.user_id, key, body['selected'], time.time()))
        return {'favorite': body['selected']}

    def complete_training(self, actor, key, body):
        fields(body, (), ())
        with self.db() as conn:
            if self._entry(conn, key, actor)['kind'] != 'training':
                raise Fault(409, 'training_unavailable')
            conn.execute('INSERT OR IGNORE INTO training_reads VALUES(?,?,?)', (actor.user_id, key, time.time()))
        return {'training_complete': True}

    def start_quiz(self, actor, key, body):
        fields(body, (), ())
        attempt = uuid.uuid4().hex
        with self.db() as conn:
            item = self._entry(conn, key, actor)
            quiz = json.loads(item['quiz'])
            if not quiz:
                raise Fault(409, 'quiz_unavailable')
            conn.execute('DELETE FROM attempts WHERE actor=? AND result IS NULL AND created < ?',
                         (actor.user_id, time.time() - 7 * 86400))
            conn.execute('INSERT INTO attempts(id,actor,entry,quiz,created) VALUES(?,?,?,?,?)',
                         (attempt, actor.user_id, key, item['quiz'], time.time()))
        return {'id': attempt, 'questions': [{k: q[k] for k in ('prompt', 'options')} for q in quiz]}

    def submit(self, actor, key, body):
        fields(body, ('answers',), ('answers',))
        answers = body['answers']
        with self.db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            run = conn.execute('SELECT * FROM attempts WHERE actor=? AND id=?', (actor.user_id, key)).fetchone()
            if not run:
                raise Fault(404, 'not_found')
            self._entry(conn, run['entry'], actor)
            if run['result']:
                if run['answers'] != packed(answers):
                    raise Fault(409, 'request_conflict')
                return json.loads(run['result'])
            quiz = json.loads(run['quiz'])
            if (not isinstance(answers, list) or len(answers) != len(quiz)
                    or any(type(a) is not int or not 0 <= a < len(q['options']) for a, q in zip(answers, quiz))):
                raise Fault(400, 'invalid_body')
            correct = [a == q['answer'] for a, q in zip(answers, quiz)]
            result = {'score': sum(correct), 'total': len(correct), 'correct': correct}
            conn.execute('UPDATE attempts SET answers=?,result=?,submitted=? WHERE id=?',
                         (packed(answers), packed(result), time.time(), key))
            return result

    @staticmethod
    def _draft(conn, actor, key):
        row = conn.execute('SELECT * FROM drafts WHERE actor=? AND id=?', (actor.user_id, key)).fetchone()
        if not row:
            raise Fault(404, 'not_found')
        return row

    @staticmethod
    def _draft_view(row):
        return {'id': row['id'], 'status': row['status'], **json.loads(row['input']),
                'fields': json.loads(row['output']) if row['output'] else None, 'has_photo': row['image'] is not None}

    def draft(self, actor, key):
        self._author(actor)
        with self.db() as conn:
            return self._draft_view(self._draft(conn, actor, key))

    def _admit(self, conn, actor):
        if not self.pool:
            raise Fault(503, 'generation_unavailable')
        if (conn.execute("SELECT COUNT(*) FROM drafts WHERE status='generating'").fetchone()[0] >= 8
                or conn.execute("SELECT COUNT(*) FROM drafts WHERE status='generating' AND actor=?",
                                (actor.user_id,)).fetchone()[0]):
            raise Fault(409, 'generation_busy')

    def generate_draft(self, actor, body):
        self._author(actor)
        fields(body, ('kind', 'title', 'note', 'request_id'), ('kind', 'title', 'request_id'))
        key = body['request_id']
        if not isinstance(key, str) or not re.fullmatch('[a-f0-9]{32}', key) or body['kind'] not in ('product', 'knowledge'):
            raise Fault(400, 'invalid_body')
        data = {'kind': body['kind'], 'title': text(body['title'], 120, False),
                'note': text(body.get('note', ''), 1500)}
        with self.db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            row = conn.execute('SELECT * FROM drafts WHERE id=?', (key,)).fetchone()
            if row:
                if row['actor'] != actor.user_id or row['input'] != packed(data):
                    raise Fault(409, 'request_conflict')
                return self._draft_view(row)
            self._admit(conn, actor)
            if conn.execute('SELECT COUNT(*) FROM drafts WHERE actor=? AND created>=?', (actor.user_id, time.time() - 86400)).fetchone()[0] >= 24:
                raise Fault(429, 'generation_limit')
            conn.execute("INSERT INTO drafts(id,actor,input,status,created,tries) VALUES(?,?,?,'generating',?,1)",
                         (key, actor.user_id, packed(data), time.time()))
        self.pool.submit(self._generate, key, data)
        return self.draft(actor, key)

    def _generate(self, key, data):
        try:
            result = self.generate(data['kind'], data['title'], data['note'])
            result = card_edit({**result, 'title': data['title']})
            state, output = 'ready', packed(result)
        except Exception:
            state, output = 'failed', None
        with self.db() as conn:
            conn.execute("UPDATE drafts SET status=?,output=? WHERE id=? AND status='generating'", (state, output, key))

    def retry(self, actor, key, body):
        self._author(actor)
        fields(body, ('request_id',), ('request_id',))
        nonce = body['request_id']
        if not isinstance(nonce, str) or not re.fullmatch('[a-f0-9]{32}', nonce):
            raise Fault(400, 'invalid_body')
        with self.db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            row = self._draft(conn, actor, key)
            if conn.execute('SELECT 1 FROM draft_retries WHERE draft=? AND nonce=?', (key, nonce)).fetchone():
                return self._draft_view(row)
            if row['status'] != 'failed':
                raise Fault(409, 'draft_not_ready')
            if row['tries'] >= 3:
                raise Fault(429, 'generation_limit')
            self._admit(conn, actor)
            data = json.loads(row['input'])
            conn.execute('INSERT INTO draft_retries VALUES(?,?)', (key, nonce))
            conn.execute("UPDATE drafts SET status='generating',tries=tries+1 WHERE id=?", (key,))
        self.pool.submit(self._generate, key, data)
        return self.draft(actor, key)

    def attach(self, actor, key, raw):
        self._author(actor)
        with self.db() as conn:
            before = self._draft(conn, actor, key)
            if before['status'] == 'saved':
                raise Fault(409, 'request_conflict')
        if shutil.disk_usage(self.path).free < RESERVED_DISK + 2 * len(raw):
            raise Fault(503, 'photo_storage_full')
        if not DECODE_SLOT.acquire(blocking=False):
            raise Fault(429, 'photo_busy')
        try:
            with Image.open(io.BytesIO(raw), formats=['JPEG', 'PNG', 'WEBP']) as image:
                w, h = image.size
                if w < 32 or h < 32 or w * h > 10_000_000 or getattr(image, 'n_frames', 1) != 1:
                    raise ValueError()
                image = ImageOps.exif_transpose(image)
                image.thumbnail((1100, 1100))
                output = io.BytesIO()
                image.convert('RGB').save(output, format='JPEG', quality=84)
                cover = output.getvalue()
                if len(cover) > 750_000:
                    raise ValueError()
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
            raise Fault(400, 'invalid_photo') from None
        finally:
            DECODE_SLOT.release()
        with self.db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            current = self._draft(conn, actor, key)
            if current['status'] == 'saved' or current['image_rev'] != before['image_rev']:
                raise Fault(409, 'request_conflict')
            conn.execute('UPDATE drafts SET image=?,image_rev=image_rev+1 WHERE id=?', (cover, key))
        return {'has_photo': True}

    def clear_photo(self, actor, key, body):
        self._author(actor)
        fields(body, (), ())
        with self.db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            if self._draft(conn, actor, key)['status'] == 'saved':
                raise Fault(409, 'request_conflict')
            conn.execute('UPDATE drafts SET image=NULL,image_rev=image_rev+1 WHERE id=?', (key,))
        return {'has_photo': False}

    def cover(self, actor, key):
        with self.db() as conn:
            row = conn.execute('SELECT actor,status,image FROM drafts WHERE id=?', (key,)).fetchone()
            if (not row or not row['image']
                    or (row['status'] != 'saved' and not (actor.can_author_knowledge and row['actor'] == actor.user_id))):
                raise Fault(404, 'not_found')
            return row['image']

    def save(self, actor, key, body):
        self._author(actor)
        data = card_edit(body)
        with self.db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            row = self._draft(conn, actor, key)
            if row['status'] == 'saved':
                if row['saved'] != packed(data):
                    raise Fault(409, 'request_conflict')
                return self._view(self._entry(conn, key), detail=True)
            if row['status'] != 'ready':
                raise Fault(409, 'draft_not_ready')
            if conn.execute('SELECT 1 FROM entries WHERE id=?', (key,)).fetchone():
                raise Fault(409, 'request_conflict')
            entry = {**data, 'card_type': json.loads(row['input'])['kind']}
            if row['image']:
                entry['cover_id'] = key
            conn.execute("INSERT INTO entries(id,kind,title,category,data,quiz,created) VALUES(?, 'knowledge', ?, '', ?, '[]', ?)",
                         (key, data['title'], packed(entry), time.time()))
            conn.execute("UPDATE drafts SET status='saved',saved=? WHERE id=?", (packed(data), key))
            return self._view(self._entry(conn, key), detail=True)

    def import_legacy(self, snapshot, identity):
        if (not isinstance(identity, dict) or any(not isinstance(k, str) or not k or not isinstance(v, str) or not v
                for k, v in identity.items()) or len(set(identity.values())) != len(identity)):
            raise Fault(400, 'invalid_identity_map')
        fields(snapshot, ('entries', 'favorites', 'records'), ('entries', 'favorites', 'records'))
        if any(not isinstance(v, list) or len(v) > LEGACY_MAX for v in snapshot.values()):
            raise Fault(400, 'invalid_body')
        if not snapshot['entries']:
            raise Fault(400, 'invalid_body')
        with self.db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            for source, actor in identity.items():
                previous = conn.execute('SELECT source,actor FROM legacy_identities WHERE source=? OR actor=?',
                                        (source, actor)).fetchall()
                if any((r['source'], r['actor']) != (source, actor) for r in previous):
                    raise Fault(409, 'invalid_identity_map')
                if not previous:
                    conn.execute('INSERT INTO legacy_identities VALUES(?,?)', (source, actor))
            for entry in snapshot['entries']:
                allowed = ('id', 'kind', 'title', 'category', 'summary', 'body', 'quiz', 'cover_url', 'brand', 'era', 'origin',
                           'importance', 'shop_ids', 'sections', 'updated')
                fields(entry, allowed, ('id', 'kind', 'title'))
                key = row_id(entry['id'])
                if entry['kind'] not in ('knowledge', 'training'):
                    raise Fault(400, 'invalid_body')
                record = {k: text(entry[k], 24000 if k == 'body' else 1000) for k in
                          ('summary', 'body', 'cover_url', 'brand', 'era', 'origin') if k in entry}
                if 'cover_url' in record and not record['cover_url'].startswith('https://'):
                    raise Fault(400, 'invalid_body')
                if 'importance' in entry:
                    if type(entry['importance']) is not int or not 0 <= entry['importance'] <= 100:
                        raise Fault(400, 'invalid_body')
                    record['importance'] = entry['importance']
                if 'sections' in entry:
                    if not isinstance(entry['sections'], list) or len(entry['sections']) > 18:
                        raise Fault(400, 'invalid_body')
                    record['sections'] = []
                    for section in entry['sections']:
                        fields(section, ('label', 'body'), ('label', 'body'))
                        record['sections'].append({'label': text(section['label'], 50, False), 'body': text(section['body'], 4000, False)})
                shops = entry.get('shop_ids', [])
                if not isinstance(shops, list) or len(shops) > 500:
                    raise Fault(400, 'invalid_body')
                shops = sorted(set(row_id(shop) for shop in shops))
                updated = entry.get('updated', time.time())
                if type(updated) not in (int, float) or not 0 < updated < 4102444800:
                    raise Fault(400, 'invalid_body')
                value = (entry['kind'], text(entry['title'], 120, False), text(entry.get('category', ''), 50),
                         packed(record), packed(quiz_items(entry.get('quiz', []))), packed(shops))
                old = conn.execute('SELECT kind,title,category,data,quiz,shop_ids FROM entries WHERE id=?', (key,)).fetchone()
                if old and tuple(old) != value:
                    raise Fault(409, 'legacy_conflict')
                conn.execute('INSERT OR IGNORE INTO entries(id,kind,title,category,data,quiz,shop_ids,created) VALUES(?,?,?,?,?,?,?,?)',
                             (key, *value, updated))
            for data in snapshot['favorites'] + snapshot['records']:
                if not isinstance(data, dict) or not isinstance(data.get('legacy_user'), str) or data['legacy_user'] not in identity:
                    raise Fault(400, 'invalid_identity_map')
            for data in snapshot['favorites']:
                fields(data, ('legacy_user', 'entry_id'), ('legacy_user', 'entry_id'))
                self._entry(conn, row_id(data['entry_id']))
                conn.execute('INSERT OR IGNORE INTO favorites VALUES(?,?,1,?)',
                             (identity[data['legacy_user']], row_id(data['entry_id']), time.time()))
            for data in snapshot['records']:
                keys = ('id', 'legacy_user', 'entry_id', 'score', 'total', 'submitted')
                fields(data, keys, keys)
                score, total, timestamp = data['score'], data['total'], data['submitted']
                if (type(score) is not int or type(total) is not int or not 0 <= score <= total <= 1000
                        or total < 1 or type(timestamp) not in (float, int) or not 0 < timestamp < 4102444800):
                    raise Fault(400, 'invalid_body')
                key = 'legacy-' + row_id(data['id'])
                result = packed({'score': score, 'total': total})
                values = (identity[data['legacy_user']], row_id(data['entry_id']), result, timestamp)
                self._entry(conn, values[1])
                old = conn.execute('SELECT actor,entry,result,submitted FROM attempts WHERE id=?', (key,)).fetchone()
                if old and tuple(old) != values:
                    raise Fault(409, 'legacy_conflict')
                conn.execute("INSERT OR IGNORE INTO attempts VALUES(?,?,?,'[]',NULL,?,?,?)", (key, *values, timestamp))
            conn.execute("INSERT OR REPLACE INTO metadata VALUES('legacy_imported','true')")
        return {k: len(v) for k, v in snapshot.items()}
