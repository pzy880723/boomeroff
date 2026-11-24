import json
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

ERP_ORIGIN = 'https://erp.boomeroff.com'


class Fault(Exception):
    def __init__(self, status, code):
        self.status, self.code = status, code
        super().__init__(code)


@dataclass(frozen=True)
class Actor:
    user_id: str
    roles: tuple
    shops: tuple

    @property
    def manager(self):
        return bool(set(self.roles) & {'super_admin', 'store_manager'})

    @property
    def can_write_tasks(self):
        return self.manager or ('store_staff' in self.roles and len(self.shops) == 1)

    def require_shop(self, shop_id):
        if not isinstance(shop_id, str) or shop_id not in {shop[0] for shop in self.shops}:
            raise Fault(403, 'forbidden')


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args):
        return None


class Erp:
    def __init__(self, get=None):
        self.get = get or self._get

    def _get(self, path, headers):
        try:
            with build_opener(NoRedirect()).open(Request(ERP_ORIGIN + path, headers=headers), timeout=6) as response:
                raw = response.read(1024 * 1024 + 1)
                if len(raw) > 1024 * 1024:
                    raise Fault(503, 'erp_unavailable')
                return json.loads(raw)
        except HTTPError as error:
            raise Fault(error.code if error.code in (401, 403) else 503,
                        'unauthorized' if error.code in (401, 403) else 'erp_unavailable') from None
        except (URLError, TimeoutError, ValueError, OSError):
            raise Fault(503, 'erp_unavailable') from None

    def verify(self, headers):
        authorization = headers.get('Authorization', '')
        device = headers.get('X-Device-Token', '')
        if (not authorization.startswith('Bearer ') or len(authorization) > 8192
                or not authorization[7:] or any(c.isspace() for c in authorization[7:])
                or not device or len(device) > 512 or any(c.isspace() for c in device)):
            raise Fault(401, 'unauthorized')
        forwarded = {'Authorization': authorization, 'X-Device-Token': device, 'Accept': 'application/json'}
        me = self.get('/api/public/handheld/auth/me', forwarded)
        data = me.get('data') if isinstance(me, dict) and me.get('ok') is True else None
        user = data.get('user') if isinstance(data, dict) else None
        if (not isinstance(user, dict) or not isinstance(user.get('user_id'), str)
                or not user['user_id'] or not data.get('device') or not isinstance(user.get('roles'), list)):
            raise Fault(401, 'unauthorized')
        roles = tuple(role for role in user['roles'] if isinstance(role, str))
        if not set(roles) & {'super_admin', 'hq_operator', 'store_manager', 'store_staff'}:
            raise Fault(403, 'forbidden')
        scope = self.get('/api/public/handheld/locations', forwarded)
        items = scope.get('data', {}).get('items') if isinstance(scope, dict) and scope.get('ok') is True and isinstance(scope.get('data'), dict) else None
        if not isinstance(items, list):
            raise Fault(503, 'erp_scope_unavailable')
        shops = tuple((item['id'], item['name']) for item in items
                      if isinstance(item, dict) and item.get('kind') == 'shop'
                      and item.get('is_active') is True and isinstance(item.get('id'), str)
                      and isinstance(item.get('name'), str))
        if not shops or (not set(roles) & {'super_admin', 'hq_operator'} and len(shops) != 1):
            raise Fault(403, 'ambiguous_shop_scope')
        return Actor(user['user_id'], roles, shops)
