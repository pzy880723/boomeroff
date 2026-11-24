import hashlib
import io
import json
import os
import re
import shutil
import sqlite3
import uuid
import threading
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from PIL import Image, UnidentifiedImageError

from erp import Fault

MAX_PHOTO = 6 * 1024 * 1024
RESERVED_DISK = 2 * 1024 * 1024 * 1024
DECODE_SLOT = threading.BoundedSemaphore(1)


def now():
    return datetime.now(timezone.utc).isoformat()


def fields(body, allowed, required):
    if not isinstance(body, dict) or set(body) - set(allowed) or set(required) - set(body):
        raise Fault(400, 'invalid_body')


def day(value):
    try:
        if not isinstance(value, str) or len(value) != 10 or date.fromisoformat(value).isoformat() != value:
            raise ValueError()
    except ValueError:
        raise Fault(400, 'invalid_date') from None
    return value


def text(value, maximum, empty=True):
    if not isinstance(value, str) or len(value) > maximum or (not empty and not value.strip()):
        raise Fault(400, 'invalid_body')
    return value.strip()


class Store:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        (self.root / 'photos').mkdir(mode=0o700, exist_ok=True)
        self.db_path = self.root / 'operations.sqlite'
        with self.db() as conn:
            conn.executescript('''
              PRAGMA journal_mode=WAL;
              CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY, shop_id TEXT NOT NULL, date TEXT NOT NULL,
                title TEXT NOT NULL, description TEXT NOT NULL, required_photos INTEGER NOT NULL,
                status TEXT NOT NULL, version INTEGER NOT NULL, created_by TEXT NOT NULL,
                created_at TEXT NOT NULL, completed_by TEXT, completed_at TEXT, note TEXT NOT NULL DEFAULT ''
              );
              CREATE INDEX IF NOT EXISTS tasks_shop_date ON tasks(shop_id,date,created_at);
              CREATE TABLE IF NOT EXISTS photos (
                id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id),
                mime TEXT NOT NULL, sha256 TEXT NOT NULL, size INTEGER NOT NULL,
                uploaded_by TEXT NOT NULL, created_at TEXT NOT NULL,
                UNIQUE(task_id,sha256)
              );
              CREATE TABLE IF NOT EXISTS audit (
                id INTEGER PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id),
                actor_id TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL, detail TEXT NOT NULL
              );
            ''')
        os.chmod(self.db_path, 0o600)

    @contextmanager
    def db(self):
        conn = sqlite3.connect(self.db_path, timeout=5)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys=ON')
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def _task(self, conn, actor, task_id):
        row = conn.execute('SELECT * FROM tasks WHERE id=?', (task_id,)).fetchone()
        if not row:
            raise Fault(404, 'not_found')
        actor.require_shop(row['shop_id'])
        return dict(row)

    def _detail(self, conn, task):
        task['photos'] = [dict(row) for row in conn.execute(
            'SELECT id,mime,size,uploaded_by,created_at FROM photos WHERE task_id=? ORDER BY created_at', (task['id'],))]
        return task

    def _audit(self, conn, task_id, actor, action, detail):
        conn.execute('INSERT INTO audit(task_id,actor_id,action,created_at,detail) VALUES(?,?,?,?,?)',
                     (task_id, actor.user_id, action, now(), json.dumps(detail)))

    def list(self, actor, shop_id, task_date):
        actor.require_shop(shop_id)
        day(task_date)
        with self.db() as conn:
            return [self._detail(conn, dict(row)) for row in conn.execute(
                'SELECT * FROM tasks WHERE shop_id=? AND date=? ORDER BY created_at', (shop_id, task_date))]

    def create(self, actor, body):
        if not actor.manager:
            raise Fault(403, 'forbidden')
        fields(body, ('shop_id', 'date', 'title', 'description', 'required_photos', 'request_id'),
               ('shop_id', 'date', 'title', 'required_photos'))
        actor.require_shop(body['shop_id'])
        title = text(body['title'], 120, False)
        description = text(body.get('description', ''), 3000)
        count = body['required_photos']
        if type(count) is not int or not 0 <= count <= 9:
            raise Fault(400, 'invalid_body')
        task_id = body.get('request_id', uuid.uuid4().hex)
        if not isinstance(task_id, str) or not re.fullmatch(r'[a-f0-9]{32}', task_id):
            raise Fault(400, 'invalid_body')
        values = (body['shop_id'], day(body['date']), title, description, count)
        with self.db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            prior = conn.execute('SELECT * FROM tasks WHERE id=?', (task_id,)).fetchone()
            if prior:
                original = tuple(prior[field] for field in ('shop_id', 'date', 'title', 'description', 'required_photos'))
                if prior['created_by'] != actor.user_id or original != values:
                    raise Fault(409, 'request_conflict')
                return self._detail(conn, dict(prior))
            conn.execute('INSERT INTO tasks(id,shop_id,date,title,description,required_photos,status,version,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
                         (task_id, *values, 'pending', 1, actor.user_id, now()))
            self._audit(conn, task_id, actor, 'created', {'required_photos': count})
            return self._detail(conn, self._task(conn, actor, task_id))

    def detail(self, actor, task_id):
        with self.db() as conn:
            return self._detail(conn, self._task(conn, actor, task_id))

    def photo(self, actor, task_id, content, mime):
        if not actor.can_write_tasks:
            raise Fault(403, 'forbidden')
        with self.db() as conn:
            if self._task(conn, actor, task_id)['status'] == 'completed':
                raise Fault(409, 'task_completed')
        valid = ((mime == 'image/jpeg' and content.startswith(b'\xff\xd8\xff'))
                 or (mime == 'image/png' and content.startswith(b'\x89PNG\r\n\x1a\n'))
                 or (mime == 'image/webp' and content.startswith(b'RIFF') and content[8:12] == b'WEBP'))
        if not content or len(content) > MAX_PHOTO or not valid:
            raise Fault(400, 'invalid_photo')
        if shutil.disk_usage(self.root).free < RESERVED_DISK + len(content):
            raise Fault(503, 'photo_storage_full')
        with DECODE_SLOT:
            try:
                with Image.open(io.BytesIO(content), formats=['JPEG', 'PNG', 'WEBP']) as image:
                    expected = {'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WEBP'}[mime]
                    if (image.format != expected or image.width < 32 or image.height < 32
                            or image.width * image.height > 12000000 or getattr(image, 'n_frames', 1) != 1):
                        raise ValueError()
                    image.verify()
                with Image.open(io.BytesIO(content), formats=['JPEG', 'PNG', 'WEBP']) as image:
                    image.load()
            except (ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombError):
                raise Fault(400, 'invalid_photo') from None
        digest = hashlib.sha256(content).hexdigest()
        photo_id = uuid.uuid4().hex
        path = self.root / 'photos' / photo_id
        with self.db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            task = self._task(conn, actor, task_id)
            if task['status'] == 'completed':
                raise Fault(409, 'task_completed')
            duplicate = conn.execute('SELECT id,sha256 FROM photos WHERE task_id=? AND sha256=?', (task_id, digest)).fetchone()
            if duplicate:
                try:
                    self._photo_content(duplicate)
                    return {'id': duplicate['id'], 'version': task['version']}
                except Fault:
                    photo_id = duplicate['id']
                    path = self.root / 'photos' / photo_id
            if not duplicate and conn.execute('SELECT COUNT(*) FROM photos WHERE task_id=?', (task_id,)).fetchone()[0] >= 9:
                raise Fault(409, 'photo_limit')
            try:
                temporary = path.with_suffix('.' + uuid.uuid4().hex + '.upload')
                with temporary.open('xb') as output:
                    os.chmod(temporary, 0o600)
                    output.write(content)
                    output.flush()
                    os.fsync(output.fileno())
                os.replace(temporary, path)
                if not duplicate:
                    conn.execute('INSERT INTO photos VALUES(?,?,?,?,?,?,?)',
                                 (photo_id, task_id, mime, digest, len(content), actor.user_id, now()))
                conn.execute("UPDATE tasks SET version=version+1,status='in_progress' WHERE id=?", (task_id,))
                self._audit(conn, task_id, actor, 'photo_repaired' if duplicate else 'photo_uploaded', {'photo_id': photo_id, 'sha256': digest})
            except Exception:
                temporary.unlink(missing_ok=True)
                if not duplicate:
                    path.unlink(missing_ok=True)
                raise
            return {'id': photo_id, 'version': task['version'] + 1}

    def read_photo(self, actor, photo_id):
        with self.db() as conn:
            row = conn.execute('SELECT * FROM photos WHERE id=?', (photo_id,)).fetchone()
            if not row:
                raise Fault(404, 'not_found')
            self._task(conn, actor, row['task_id'])
            return self._photo_content(row), row['mime']

    def _photo_content(self, row):
        try:
            content = (self.root / 'photos' / row['id']).read_bytes()
        except OSError:
            raise Fault(503, 'photo_unavailable') from None
        if hashlib.sha256(content).hexdigest() != row['sha256']:
            raise Fault(503, 'photo_unavailable')
        return content

    def complete(self, actor, task_id, body):
        if not actor.can_write_tasks:
            raise Fault(403, 'forbidden')
        fields(body, ('expected_version', 'note'), ('expected_version',))
        if type(body['expected_version']) is not int or body['expected_version'] < 1:
            raise Fault(400, 'invalid_body')
        note = text(body.get('note', ''), 2000)
        with self.db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            task = self._task(conn, actor, task_id)
            if task['status'] == 'completed':
                if task['completed_by'] == actor.user_id and task['note'] == note:
                    return self._detail(conn, task)
                raise Fault(409, 'task_completed')
            if task['version'] != body['expected_version']:
                raise Fault(409, 'version_conflict')
            photos = conn.execute('SELECT id,sha256 FROM photos WHERE task_id=?', (task_id,)).fetchall()
            if len(photos) < task['required_photos']:
                raise Fault(409, 'photos_required')
            for photo in photos:
                self._photo_content(photo)
            conn.execute("UPDATE tasks SET status='completed',version=version+1,completed_by=?,completed_at=?,note=? WHERE id=?",
                         (actor.user_id, now(), note, task_id))
            self._audit(conn, task_id, actor, 'completed', {'version': task['version'] + 1})
            return self._detail(conn, self._task(conn, actor, task_id))

    def audit(self, actor, task_id):
        if not actor.manager:
            raise Fault(403, 'forbidden')
        with self.db() as conn:
            self._task(conn, actor, task_id)
            return [dict(row) for row in conn.execute('SELECT * FROM audit WHERE task_id=? ORDER BY id', (task_id,))]
