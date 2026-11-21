import json
import io
import tempfile
import threading
import unittest
from datetime import date
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from PIL import Image


def jpeg(color):
    output = io.BytesIO()
    Image.new('RGB', (128, 128), color).save(output, format='JPEG')
    return output.getvalue()


PHOTO, PHOTO2, PHOTO3 = jpeg('red'), jpeg('blue'), jpeg('green')

try:
    from erp import Actor, Fault, Erp
    from store import Store
    from server import make_server
except ImportError:
    Actor = Fault = Erp = Store = make_server = None


class OperationsTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(Store, 'Independent operations service is not implemented')
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store = Store(Path(self.tmp.name))
        self.manager = Actor('manager', ('store_manager',), (('shop-a', 'Store A'),))
        self.staff = Actor('staff', ('store_staff',), (('shop-a', 'Store A'),))
        self.other = Actor('other', ('store_staff',), (('shop-b', 'Store B'),))
        self.day = date.today().isoformat()

    def create(self, **patch):
        body = dict(shop_id='shop-a', date=self.day, title='Opening display',
                    description='Clean and photograph the entrance', required_photos=1)
        body.update(patch)
        return self.store.create(self.manager, body)

    def denied(self, code, fn):
        with self.assertRaises(Fault) as caught:
            fn()
        self.assertEqual(caught.exception.code, code)

    def test_manager_creation_and_staff_read_persist(self):
        task = self.create()
        self.assertEqual(task['status'], 'pending')
        reopened = Store(Path(self.tmp.name))
        self.assertEqual(reopened.list(self.staff, 'shop-a', self.day)[0]['id'], task['id'])
        self.denied('forbidden', lambda: self.store.create(self.staff, dict(
            shop_id='shop-a', date=self.day, title='Task', required_photos=0)))

    def test_scope_controls_list_detail_and_photo(self):
        task = self.create()
        self.denied('forbidden', lambda: self.store.list(self.other, 'shop-a', self.day))
        self.denied('forbidden', lambda: self.store.detail(self.other, task['id']))
        self.denied('forbidden', lambda: self.store.photo(self.other, task['id'], PHOTO, 'image/jpeg'))
        photo = self.store.photo(self.staff, task['id'], PHOTO, 'image/jpeg')
        self.denied('forbidden', lambda: self.store.read_photo(self.other, photo['id']))
        content, mime = self.store.read_photo(self.staff, photo['id'])
        self.assertEqual(content, PHOTO)
        self.assertEqual(mime, 'image/jpeg')

    def test_completion_requires_uploaded_photo_and_version(self):
        task = self.create(required_photos=2)
        self.denied('photos_required', lambda: self.store.complete(self.staff, task['id'], {'expected_version': 1}))
        self.store.photo(self.staff, task['id'], PHOTO, 'image/jpeg')
        self.denied('version_conflict', lambda: self.store.complete(self.staff, task['id'], {'expected_version': 1}))
        self.denied('photos_required', lambda: self.store.complete(self.staff, task['id'], {'expected_version': 2}))
        self.store.photo(self.staff, task['id'], PHOTO2, 'image/jpeg')
        done = self.store.complete(self.staff, task['id'], {'expected_version': 3, 'note': 'Checked'})
        self.assertEqual(done['status'], 'completed')
        self.assertEqual(done['completed_by'], 'staff')
        self.assertEqual(done['version'], 4)
        again = self.store.complete(self.staff, task['id'], {'expected_version': 3, 'note': 'Checked'})
        self.assertEqual(again['version'], 4)
        self.denied('task_completed', lambda: self.store.photo(self.staff, task['id'], PHOTO3, 'image/jpeg'))
        self.assertEqual(len(self.store.audit(self.manager, task['id'])), 4)
        self.denied('forbidden', lambda: self.store.audit(self.staff, task['id']))

    def test_invalid_fields_and_photos_do_not_mutate(self):
        for patch in ({'date': '2026-02-30'}, {'title': ''}, {'required_photos': True},
                      {'required_photos': 10}, {'user_id': 'forged'}, {'shop_id': 'shop-b'}):
            with self.assertRaises(Fault):
                self.create(**patch)
        task = self.create()
        for data, mime in ((b'<html>fake', 'image/jpeg'), (b'\xff\xd8\xfffoo', 'text/html'),
                           (b'\xff\xd8\xff', 'image/jpeg'), (PHOTO[:300], 'image/jpeg'),
                           (b'\xff\xd8\xff' + b'x' * (6 * 1024 * 1024), 'image/jpeg')):
            self.denied('invalid_photo', lambda: self.store.photo(self.staff, task['id'], data, mime))
        self.assertEqual(self.store.detail(self.staff, task['id'])['version'], 1)
        self.assertEqual(self.store.detail(self.staff, task['id'])['photos'], [])

    def test_duplicate_photo_is_not_counted_twice(self):
        task = self.create(required_photos=2)
        first = self.store.photo(self.staff, task['id'], PHOTO, 'image/jpeg')
        repeated = self.store.photo(self.staff, task['id'], PHOTO, 'image/jpeg')
        self.assertEqual(first, repeated)
        self.denied('photos_required', lambda: self.store.complete(self.staff, task['id'], {'expected_version': 2}))

    def test_missing_evidence_cannot_complete(self):
        task = self.create()
        photo = self.store.photo(self.staff, task['id'], PHOTO, 'image/jpeg')
        (Path(self.tmp.name) / 'photos' / photo['id']).unlink()
        self.denied('photo_unavailable', lambda: self.store.complete(self.staff, task['id'], {'expected_version': 2}))
        self.assertEqual(self.store.detail(self.staff, task['id'])['status'], 'in_progress')

    def test_retry_repairs_missing_evidence_without_double_count(self):
        task = self.create()
        receipt = self.store.photo(self.staff, task['id'], PHOTO, 'image/jpeg')
        (Path(self.tmp.name) / 'photos' / receipt['id']).unlink()
        retry = self.store.photo(self.staff, task['id'], PHOTO, 'image/jpeg')
        self.assertEqual(retry['id'], receipt['id'])
        result = self.store.complete(self.staff, task['id'], {'expected_version': retry['version']})
        self.assertEqual(result['status'], 'completed')

    def test_daily_list_does_not_silently_truncate_records(self):
        for index in range(501):
            self.create(title='Task ' + str(index))
        self.assertEqual(len(self.store.list(self.staff, 'shop-a', self.day)), 501)

    def test_http_boundary_and_real_task_round_trip(self):
        actors = {'manager': self.manager, 'staff': self.staff, 'other': self.other}

        class Auth:
            def verify(_, headers):
                actor = actors.get(headers.get('Authorization', '').removeprefix('Bearer '))
                if not actor:
                    raise Fault(401, 'unauthorized')
                return actor

        server = make_server(('127.0.0.1', 0), self.store, Auth())
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        base = 'http://127.0.0.1:' + str(server.server_port)

        def request(path, actor=None, body=None, method=None, mime='application/json'):
            headers = {'Content-Type': mime}
            if actor:
                headers['Authorization'] = 'Bearer ' + actor
            data = json.dumps(body).encode() if isinstance(body, dict) else body
            req = Request(base + path, data=data, headers=headers, method=method)
            try:
                response = urlopen(req)
            except HTTPError as error:
                response = error
            with response:
                raw = response.read()
                self.assertEqual(response.headers['Cache-Control'], 'no-store')
                return response.status, json.loads(raw)

        self.assertEqual(request('/healthz')[0], 200)
        self.assertEqual(request('/v1/session')[0], 401)
        self.assertEqual(request('/v1/session', 'staff')[1]['data']['shops'][0]['id'], 'shop-a')
        self.assertEqual(request('/v1/tasks?shop_id=shop-a&date=' + self.day, 'other')[0], 403)
        status, result = request('/v1/tasks', 'manager', dict(shop_id='shop-a', date=self.day,
                                title='Photo check', required_photos=1))
        self.assertEqual(status, 201)
        task = result['data']
        self.assertEqual(request('/v1/tasks/' + task['id'] + '/photos', 'staff',
                                 PHOTO, mime='image/jpeg')[0], 201)
        status, result = request('/v1/tasks/' + task['id'] + '/complete', 'staff', {'expected_version': 2})
        self.assertEqual(status, 200)
        self.assertEqual(result['data']['status'], 'completed')
        self.assertEqual(request('/not-found', 'staff')[0], 404)
        self.assertEqual(request('/v1/tasks', 'manager', b'not-json')[0], 400)

    def test_release_read_only_gate(self):
        class Auth:
            def verify(_self, _headers):
                return self.manager

        server = make_server(('127.0.0.1', 0), self.store, Auth(), read_only=True)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        with self.assertRaises(HTTPError) as caught:
            urlopen(Request('http://127.0.0.1:' + str(server.server_port) + '/v1/tasks', data=b'{}'))
        self.assertEqual(caught.exception.code, 503)
        self.assertEqual(json.loads(caught.exception.read())['code'], 'release_read_only')


class ErpTests(unittest.TestCase):
    def test_erp_verifies_both_identity_and_current_locations(self):
        self.assertIsNotNone(Erp, 'ERP authorization is not implemented')
        calls = []

        def get(path, headers):
            calls.append((path, headers))
            if path.endswith('/auth/me'):
                return {'ok': True, 'data': {'user': {'user_id': 'employee', 'roles': ['store_staff']}, 'device': {'id': 'device'}}}
            return {'ok': True, 'data': {'items': [{'id': 'shop-a', 'name': 'Store A', 'kind': 'shop', 'is_active': True},
                                                  {'id': 'warehouse', 'name': 'Warehouse', 'kind': 'warehouse', 'is_active': True}]}}

        actor = Erp(get=get).verify({'Authorization': 'Bearer erp-token', 'X-Device-Token': 'erp-device'})
        self.assertEqual(actor.shops, (('shop-a', 'Store A'),))
        self.assertEqual(actor.user_id, 'employee')
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0][1]['X-Device-Token'], 'erp-device')
        self.assertFalse(actor.manager)

    def test_invalid_upstream_fails_closed(self):
        self.assertIsNotNone(Erp, 'ERP authorization is not implemented')
        for value in ({'ok': False}, {'ok': True, 'data': {'user': None}}, {'ok': True, 'data': []}):
            with self.assertRaises(Fault):
                Erp(get=lambda *_: value).verify({'Authorization': 'Bearer token', 'X-Device-Token': 'device'})
        with self.assertRaises(Fault) as error:
            Erp(get=lambda *_: None).verify({})
        self.assertEqual(error.exception.status, 401)

    def test_upstream_outage_or_revoke_never_reuses_an_actor(self):
        self.assertIsNotNone(Erp, 'ERP authorization is not implemented')
        calls = []

        def get(*_):
            calls.append(1)
            raise Fault(503, 'erp_unavailable')

        erp = Erp(get=get)
        for _ in range(2):
            with self.assertRaises(Fault) as error:
                erp.verify({'Authorization': 'Bearer token', 'X-Device-Token': 'device'})
            self.assertEqual(error.exception.status, 503)
        self.assertEqual(len(calls), 2)


if __name__ == '__main__':
    unittest.main()
