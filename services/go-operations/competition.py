import hashlib
import hmac
import json
import os
import re
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode
from urllib.request import Request, build_opener, ProxyHandler

from competition_bridge import ACCESS, HEX, PREFIX, STORES
from erp import Fault, NoRedirect

BATTLE_ORIGIN = 'https://battle.boomeroff.top'
BATTLE_LOOPBACK = 'http://127.0.0.1:31887'
DATE = re.compile(r'[0-9]{4}-[0-9]{2}-[0-9]{2}')


class Competition:
    def __init__(self, secret, stores, transport=None):
        if (not HEX.fullmatch(secret) or not isinstance(stores, dict)
                or len(stores) != 3 or set(stores.values()) != STORES):
            raise ValueError('Invalid GO competition configuration')
        self.secret = secret
        self.stores = stores
        self.transport = transport or self._request

    @staticmethod
    def _request(request):
        with build_opener(ProxyHandler({}), NoRedirect()).open(request, timeout=4) as response:
            return json.loads(response.read(1024 * 1024))

    def route(self, actor, method, route, query, body):
        if (method, route) not in ACCESS:
            raise Fault(404, 'not_found')
        shops = {self.stores[key] for key, _ in actor.shops if key in self.stores}
        if 'super_admin' in actor.roles:
            role, scope = 'admin', 'admin'
        elif len(shops) == 1 and set(actor.roles) & {'store_staff', 'store_manager'}:
            role, scope = 'store', 'store:' + next(iter(shops))
        else:
            raise Fault(403, 'competition_outside_scope')
        if role not in ACCESS[(method, route)]:
            raise Fault(403, 'competition_forbidden')
        values = parse_qs(query, keep_blank_values=True)
        if query and (route != 'state' or set(values) != {'date'} or len(values['date']) != 1
                      or not DATE.fullmatch(values['date'][0])):
            raise Fault(400, 'invalid_query')
        url = BATTLE_LOOPBACK + PREFIX + route
        if query:
            url += '?' + urlencode({'date': values['date'][0]})
        raw = json.dumps(body(), separators=(',', ':')).encode() if method == 'POST' else None
        subject = hmac.new(bytes.fromhex(self.secret), ('go-battle:' + actor.user_id).encode(), hashlib.sha256)
        request = Request(url, method=method, data=raw, headers={
            'Host': 'battle.boomeroff.top', 'Origin': BATTLE_ORIGIN, 'Content-Type': 'application/json',
            'X-Go-Battle-Key': self.secret, 'X-Go-Battle-Scope': scope, 'X-Go-Battle-Actor': subject.hexdigest(),
        })
        try:
            result = self.transport(request)
            if not isinstance(result, dict):
                raise ValueError('Invalid Battle response')
            return result
        except HTTPError as error:
            status = error.code
            error.close()
            if status == 409:
                raise Fault(409, 'competition_conflict') from None
            if status == 400:
                raise Fault(400, 'competition_invalid_report') from None
            raise Fault(503, 'competition_unavailable') from None
        except (URLError, TimeoutError, OSError, ValueError):
            raise Fault(503, 'competition_unavailable') from None


def configured_competition():
    key = os.environ.get('GO_BATTLE_BRIDGE_KEY')
    return Competition(key, json.loads(os.environ['GO_BATTLE_STORES_JSON'])) if key else None
