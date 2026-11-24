"""Shared route and authentication contract; copied into the Battle release."""
import hmac
import re

STORES = frozenset(('xtd', 'citic', 'metro'))
PREFIX = '/api/internal/go/'
ACCESS = {
    ('GET', 'state'): ('admin', 'store'),
    ('GET', 'rules'): ('admin', 'store'),
    ('POST', 'report'): ('store',),
    ('GET', 'admin/cycle'): ('admin',),
    ('POST', 'admin/cycle'): ('admin',),
    ('POST', 'admin/report'): ('admin',),
}
HEX = re.compile('[a-f0-9]{64}')


def bridge_request(config, method, path, headers, peer):
    secret = config.get('goBattleKey')
    received = headers.get('x-go-battle-key', '')
    actor = headers.get('x-go-battle-actor', '')
    if (peer != '127.0.0.1' or 'x-real-ip' in headers or not path.startswith(PREFIX)
            or not secret or not HEX.fullmatch(received) or not hmac.compare_digest(secret, received)
            or not HEX.fullmatch(actor)):
        return None
    route = path[len(PREFIX):]
    role, _, store = headers.get('x-go-battle-scope', '').partition(':')
    if role not in ACCESS.get((method, route), ()):
        return None
    if (role == 'store' and store not in STORES) or (role == 'admin' and store):
        return None
    return '/api/' + route, {'role': role, 'store': store or None, 'token_hash': actor}
