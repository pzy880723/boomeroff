import io
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from PIL import Image

from erp import Actor, Fault
from learning import LearningStore
from server import make_server
from store import Store


CARD = {'summary': 'A documented porcelain cup.', 'details': 'Blue and white decoration.',
        'tips': 'Check the maker mark.'}
SEED = {'entries': [{'id': 'old-cup', 'kind': 'knowledge', 'title': 'Porcelain cup',
                     'category': '欧瓷', 'summary': 'A cup', 'body': 'Old content',
                     'quiz': [{'prompt': 'Which is the cup?', 'options': ['Cup', 'Plate'], 'answer': 0}]},
                    {'id': 'sop', 'kind': 'training', 'title': 'Opening SOP',
                     'category': '', 'summary': '', 'body': 'Check the store'}],
        'favorites': [{'legacy_user': 'legacy-staff', 'entry_id': 'old-cup'}], 'records': []}


class LearningTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.calls = []
        self.fail_once = False
        def generate(kind, title, note):
            self.calls.append((kind, title, note))
            if self.fail_once:
                self.fail_once = False
                raise Fault(503, 'generation_failed')
            return CARD.copy()
        self.learning = LearningStore(Path(self.tmp.name), generate)
        self.addCleanup(self.learning.close)
        self.actors = {role: Actor(role, (role,), (('shop-a', 'A'),)) for role in
                       ('store_staff', 'store_manager', 'hq_operator', 'super_admin')}
        class Auth:
            def verify(_, headers):
                actor = self.actors.get(headers.get('Authorization', '').removeprefix('Bearer '))
                if not actor:
                    raise Fault(401, 'unauthorized')
                return actor
        server = make_server(('127.0.0.1', 0), Store(Path(self.tmp.name)), Auth(), learning=self.learning)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.url = 'http://127.0.0.1:' + str(server.server_port) + '/v1'

    def req(self, path, role='store_staff', body=None):
        headers = {'Authorization': 'Bearer ' + role, 'Content-Type': 'application/json'}
        if isinstance(body, bytes):
            headers['Content-Type'] = 'image/jpeg'
        req = Request(self.url + path, headers=headers, data=body if isinstance(body, bytes) else
                      json.dumps(body).encode() if body is not None else None)
        try:
            res = urlopen(req, timeout=4)
        except HTTPError as err:
            res = err
        with res:
            return res.status, json.load(res)

    def data(self, *args):
        status, payload = self.req(*args)
        self.assertIn(status, (200, 201, 202), payload)
        return payload['data']

    def wait(self, key):
        for _ in range(80):
            draft = self.data('/learning/drafts/' + key, 'super_admin')
            if draft['status'] != 'generating':
                return draft
            time.sleep(.01)
        self.fail('draft did not finish')

    def seeded(self):
        return self.learning.import_legacy(SEED, {'legacy-staff': 'store_staff'})

    def test_library_migration_and_favorites_are_actor_bound(self):
        self.assertFalse(self.data('/learning?tab=knowledge')['legacy_ready'])
        self.assertEqual(self.seeded(), {'entries': 2, 'favorites': 1, 'records': 0})
        self.seeded()
        first = self.data('/learning?tab=knowledge&q=porcelain')['items']
        self.assertEqual([r['id'] for r in first], ['old-cup'])
        self.assertEqual(self.data('/learning?tab=training')['items'][0]['id'], 'sop')
        self.assertEqual(self.data('/learning?tab=favorites')['items'][0]['id'], 'old-cup')
        self.assertEqual(self.data('/learning?tab=favorites', 'store_manager')['items'], [])
        self.assertEqual(self.req('/learning?tab=favorites&user_id=store_staff', 'store_manager')[0], 400)
        self.assertFalse(self.data('/learning/cards/old-cup/favorite', 'store_staff', {'selected': False})['favorite'])
        self.seeded()
        self.assertEqual(self.data('/learning?tab=favorites')['items'], [])

    def test_fresh_start_is_ready_without_claiming_a_legacy_import(self):
        with tempfile.TemporaryDirectory() as root:
            fresh = LearningStore(root, fresh_start=True)
            out = fresh.list(self.actors['store_staff'], 'knowledge')
            self.assertEqual(out['items'], [])
            self.assertTrue(out['library_ready'])
            self.assertFalse(out['legacy_ready'])

    def test_generators_are_admin_only_and_save_is_explicit(self):
        form = {'kind': 'product', 'title': 'Porcelain cup', 'note': 'Blue', 'request_id': '1' * 32}
        for role in ('store_staff', 'store_manager', 'hq_operator'):
            self.assertFalse(self.data('/session', role)['can_generate_cards'])
            self.assertEqual(self.req('/learning/drafts', role, form)[0], 403)
        self.assertEqual(self.calls, [])
        self.assertTrue(self.data('/session', 'super_admin')['can_generate_cards'])
        draft = self.data('/learning/drafts', 'super_admin', form)
        key = draft['id']
        self.assertEqual(self.wait(key)['status'], 'ready')
        self.assertEqual(self.data('/learning?tab=knowledge')['items'], [])
        self.assertEqual(self.req('/learning/drafts/' + key)[0], 403)
        self.assertEqual(self.data('/learning/drafts', 'super_admin', form)['id'], key)
        self.assertEqual(len(self.calls), 1)
        edit = {'title': 'Corrected cup', 'summary': 'Corrected intro', 'details': 'Details', 'tips': 'Care'}
        saved = self.data('/learning/drafts/' + key + '/save', 'super_admin', edit)
        self.assertEqual(saved['id'], key)
        self.assertEqual(self.data('/learning/cards/' + key)['title'], 'Corrected cup')
        self.assertEqual(self.data('/learning/drafts/' + key + '/save', 'super_admin', edit)['id'], key)
        edit['title'] = 'Overwrite'
        self.assertEqual(self.req('/learning/drafts/' + key + '/save', 'super_admin', edit)[0], 409)

    def test_failed_generation_can_retry_same_input_without_writing_a_card(self):
        self.fail_once = True
        key = self.data('/learning/drafts', 'super_admin',
            {'kind': 'knowledge', 'title': 'Tea', 'note': '', 'request_id': '2' * 32})['id']
        self.assertEqual(self.wait(key)['status'], 'failed')
        self.assertEqual(self.req('/learning/cards/' + key)[0], 404)
        self.data('/learning/drafts/' + key + '/retry', 'super_admin', {'request_id':'b'*32})
        self.assertEqual(self.wait(key)['status'], 'ready')
        self.assertEqual([x[0] for x in self.calls], ['knowledge', 'knowledge'])

    def test_quiz_does_not_expose_answers_or_other_employees_records(self):
        self.seeded()
        item = self.data('/learning/cards/old-cup')
        self.assertNotIn('quiz', item)
        run = self.data('/learning/cards/old-cup/start', 'store_staff', {})
        self.assertNotIn('answer', run['questions'][0])
        path = '/learning/attempts/' + run['id']
        self.assertEqual(self.req(path, 'store_manager', {'answers': [0]})[0], 404)
        result = self.data(path, 'store_staff', {'answers': [0]})
        self.assertEqual((result['score'], result['total']), (1, 1))
        self.assertEqual(self.data(path, 'store_staff', {'answers': [0]}), result)
        self.assertEqual(self.req(path, 'store_staff', {'answers': [1]})[0], 409)
        self.assertEqual(len(self.data('/learning?tab=records')['items']), 1)
        self.assertEqual(self.data('/learning?tab=records', 'store_manager')['items'], [])

    def test_draft_reference_is_private_and_can_be_removed_before_save(self):
        output = io.BytesIO()
        Image.new('RGB', (96, 96)).save(output, format='JPEG')
        photo = output.getvalue()
        key = 'a' * 32
        root = '/learning/drafts/' + key
        self.data('/learning/drafts', 'super_admin', {'kind':'knowledge','title':'Tea','request_id':key})
        self.assertEqual(self.req(root + '/photo', 'store_manager', photo)[0], 403)
        self.assertTrue(self.data(root + '/photo', 'super_admin', photo)['has_photo'])
        self.assertEqual(self.req('/learning/covers/' + key)[0], 404)
        self.assertFalse(self.data(root + '/clear-photo', 'super_admin', {})['has_photo'])
        self.assertFalse(self.wait(key)['has_photo'])
        self.assertNotIn('cover_id', self.data(root + '/save', 'super_admin', {'title':'Tea', **CARD}))
        self.assertEqual(self.req(root + '/photo', 'super_admin', photo)[0], 409)

    def test_legacy_import_rolls_back_when_identity_is_missing(self):
        with self.assertRaises(Fault):
            self.learning.import_legacy(SEED,{})
        self.assertEqual(self.data('/learning?tab=knowledge')['items'], [])
        self.assertFalse(self.data('/learning?tab=favorites')['legacy_ready'])

    def test_legacy_reimport_cannot_move_an_identity(self):
        self.seeded()
        with self.assertRaises(Fault):
            self.learning.import_legacy(SEED, {'legacy-staff': 'store_manager'})
        self.assertEqual(self.data('/learning?tab=favorites', 'store_manager')['items'], [])

    def test_retry_replay_does_not_start_another_paid_call(self):
        self.fail_once = True
        key = self.data('/learning/drafts', 'super_admin',
            {'kind': 'knowledge', 'title': 'Tea', 'request_id': '7' * 32})['id']
        self.assertEqual(self.wait(key)['status'], 'failed')
        self.fail_once = True
        retry = '/learning/drafts/' + key + '/retry'
        request = {'request_id': 'c' * 32}
        self.data(retry, 'super_admin', request)
        self.assertEqual(self.wait(key)['status'], 'failed')
        self.assertEqual(self.data(retry, 'super_admin', request)['status'], 'failed')
        self.assertEqual(len(self.calls), 2)

    def test_maximum_chinese_fields_can_be_saved(self):
        key = '8' * 32
        self.data('/learning/drafts','super_admin',{'kind':'product','title':'瓷杯','request_id':key})
        self.wait(key)
        edit = {'title':'杯'*120,'summary':'简介'*275,'details':'主要'*1600,'tips':'注意'*800}
        self.assertEqual(self.data('/learning/drafts/'+key+'/save','super_admin',edit)['details'], edit['details'])

    def test_late_upload_cannot_restore_a_removed_reference(self):
        output = io.BytesIO()
        Image.new('RGB', (96, 96)).save(output, format='JPEG')
        key = 'f' * 32
        root = '/learning/drafts/' + key
        self.data('/learning/drafts', 'super_admin', {'kind':'knowledge','title':'Tea','request_id':key})
        entered, release = threading.Event(), threading.Event()
        response = []
        def decode(image):
            entered.set()
            if not release.wait(2):
                raise ValueError('test timeout')
            return image
        with patch('learning.ImageOps.exif_transpose', decode):
            late = threading.Thread(target=lambda: response.append(self.req(root+'/photo','super_admin',output.getvalue())))
            late.start()
            try:
                self.assertTrue(entered.wait(2))
                self.data(root+'/clear-photo','super_admin',{})
            finally:
                release.set()
                late.join(3)
        self.assertEqual(response[0][0], 409)
        self.assertFalse(self.wait(key)['has_photo'])

    def test_training_scope_sections_and_personal_completion(self):
        snapshot = json.loads(json.dumps(SEED))
        snapshot['entries'][1]['shop_ids'] = ['shop-b']
        snapshot['entries'][0]['sections'] = [{'label': '速记卡', 'body': '先看底款'}]
        self.learning.import_legacy(snapshot, {'legacy-staff':'store_staff'})
        self.assertEqual(self.data('/learning?tab=training')['items'], [])
        self.assertEqual(self.req('/learning/cards/sop')[0], 404)
        self.assertEqual(self.data('/learning/cards/old-cup')['sections'][0]['body'], '先看底款')
        self.actors['other_staff'] = Actor('other_staff', ('store_staff',), (('shop-b', 'B'),))
        for _ in range(2):
            self.assertTrue(self.data('/learning/cards/sop/complete-training','other_staff',{})['training_complete'])
        rows=self.data('/learning?tab=records&record_kind=training','other_staff')['items']
        self.assertEqual([(r['entry_id'],r['record_kind']) for r in rows],[('sop','training')])
        self.assertEqual(self.data('/learning?tab=records','store_staff')['items'], [])
