import unittest
from urllib.error import HTTPError
from io import BytesIO

from competition import Competition
from competition_bridge import bridge_request
from erp import Actor, Fault


class CompetitionTest(unittest.TestCase):
    def setUp(self):
        self.key = 'a' * 64
        self.shops = {'store-1': 'xtd', 'store-2': 'citic', 'store-3': 'metro'}
        self.calls = []
        self.admin = Actor('admin', ('super_admin',), ())
        self.staff = Actor('staff', ('store_staff',), (('store-1', 'Any display name'),))
        self.outside = Actor('staff2', ('store_staff',), (('other', '新天地'),))
        self.hq = Actor('hq', ('hq_operator',), (('store-1', '新天地'),))
        self.cross_shop = Actor('hq-manager', ('hq_operator', 'store_manager'),
                                (('store-1', '新天地'), ('other', '其他门店')))
        self.service = Competition(self.key, self.shops, lambda req: self.calls.append(req) or {})

    def test_database_identity_not_display_name_and_no_foreign_writes(self):
        self.service.route(self.staff, 'GET', 'state', 'date=2026-11-24', None)
        req = self.calls.pop()
        self.assertEqual(req.get_header('X-go-battle-scope'), 'store:xtd')
        self.assertTrue(req.full_url.endswith('/api/internal/go/state?date=2026-11-24'))
        self.assertNotIn('staff', str(req.headers))
        for actor, method, route in [(self.outside, 'GET', 'state'), (self.hq, 'POST', 'report'),
                                     (self.cross_shop, 'POST', 'report'),
                                     (self.staff, 'GET', 'admin/cycle'), (self.admin, 'POST', 'report')]:
            with self.assertRaises(Fault) as failure:
                self.service.route(actor, method, route, '', lambda: self.fail('BODY_READ'))
            self.assertEqual(failure.exception.status, 403)
        self.assertEqual(self.calls, [])

    def test_does_not_accept_extra_query_or_forward_raw_request_path(self):
        for path, query in [('state', 'date=2026-11-24&date=2026-11-25'), ('rules', 'x=1'),
                            ('state', 'date=../../admin'), ('../admin/report', '')]:
            with self.assertRaises(Fault):
                self.service.route(self.admin, 'GET', path, query, None)
        self.assertEqual(self.calls, [])

    def test_requires_exact_private_route_role_peer_and_shared_secret(self):
        config = {'goBattleKey': self.key}
        self.service.route(self.staff, 'POST', 'report', '', lambda: {'orders': 4})
        headers = {k.lower(): v for k, v in self.calls.pop().headers.items()}
        result = bridge_request(config, 'POST', '/api/internal/go/report', headers, '127.0.0.1')
        self.assertEqual(result[0], '/api/report')
        self.assertEqual((result[1]['role'], result[1]['store']), ('store', 'xtd'))
        self.assertRegex(result[1]['token_hash'], '^[a-f0-9]{64}$')
        for peer, route, changes in [('1.2.3.4', 'report', {}), ('127.0.0.1', 'report', {'x-real-ip': '127.0.0.1'}),
                                     ('127.0.0.1', 'admin/report', {}), ('127.0.0.1', 'bind', {}),
                                     ('127.0.0.1', 'report', {'x-go-battle-key': 'b' * 64})]:
            self.assertIsNone(bridge_request(config, 'POST', '/api/internal/go/' + route, headers | changes, peer))

    def test_rejected_or_conflicting_writes_are_not_reported_as_success(self):
        def transport(req):
            raise HTTPError(req.full_url, 409, 'conflict', {}, BytesIO(b'{}'))
        service = Competition(self.key, self.shops, transport)
        with self.assertRaises(Fault) as failure:
            service.route(self.admin, 'POST', 'admin/report', '', lambda: {})
        self.assertEqual((failure.exception.status, failure.exception.code), (409, 'competition_conflict'))


if __name__ == '__main__':
    unittest.main()
