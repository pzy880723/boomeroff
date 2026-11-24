import json
import os
import re
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

from erp import Erp, Fault
from learning import ENTRY_ID, LearningStore
from learning_generator import configured_generator
from store import MAX_PHOTO, Store

VERSION = '2026.11.25.1'


def make_server(address, store, erp, read_only=False, learning=None):
    slots = threading.BoundedSemaphore(12)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def setup(self):
            super().setup()
            self.connection.settimeout(15)

        def handle(self):
            def expire():
                try:
                    self.connection.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
            timer = threading.Timer(20, expire)
            timer.daemon = True
            timer.start()
            try:
                super().handle()
            finally:
                timer.cancel()

        def reply(self, status, body, mime='application/json; charset=utf-8'):
            raw = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(raw)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(raw)

        def body(self, binary=False, maximum=16384):
            if self.headers.get('Transfer-Encoding'):
                raise Fault(400, 'invalid_body')
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if length <= 0 or length > (MAX_PHOTO if binary else maximum):
                    raise ValueError()
                raw = self.rfile.read(length)
                if len(raw) != length:
                    raise ValueError()
                return raw if binary else json.loads(raw)
            except (ValueError, UnicodeError):
                raise Fault(400, 'invalid_body') from None

        def handle_request(self):
            try:
                self.dispatch()
            except Fault as error:
                self.reply(error.status, {'ok': False, 'code': error.code})
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception as error:
                # Exception types aid diagnosis without tokens, bodies or private paths.
                print('request_failed:' + type(error).__name__, flush=True)
                self.reply(503, {'ok': False, 'code': 'service_unavailable'})

        def dispatch(self):
            parsed = urlsplit(self.path)
            path = parsed.path
            if self.command == 'GET' and path == '/healthz':
                with store.db() as conn:
                    conn.execute('SELECT 1').fetchone()
                health = {'ok': True, 'service': 'boomer-go-operations', 'version': VERSION, 'read_only': read_only}
                if learning:
                    with learning.db() as conn:
                        conn.execute('SELECT id FROM entries LIMIT 1').fetchone()
                    health.update(learning=True, learning_fresh_start=learning.fresh_start,
                                  learning_generator_configured=bool(learning.generate))
                return self.reply(200, health)
            actor = erp.verify(self.headers)
            if self.command != 'GET' and read_only:
                raise Fault(503, 'release_read_only')
            if self.command == 'GET' and path == '/v1/session':
                return self.reply(200, {'ok': True, 'data': {'user_id': actor.user_id, 'roles': actor.roles,
                    'shops': [{'id': key, 'name': name} for key, name in actor.shops],
                    'can_manage_tasks': actor.manager, 'task_writes_enabled': not read_only,
                    'can_update_tasks': actor.can_write_tasks,
                    'can_generate_cards': bool(learning and not read_only and learning.can_generate(actor))}})
            if learning and path.startswith('/v1/learning'):
                status, data, mime = self.learning_route(actor, path, parsed.query)
                if mime:
                    return self.reply(status, data, mime)
                return self.reply(status, {'ok': True, 'data': data})
            if path == '/v1/tasks' and self.command == 'GET':
                query = parse_qs(parsed.query)
                if set(query) != {'shop_id', 'date'} or any(len(v) != 1 for v in query.values()):
                    raise Fault(400, 'invalid_query')
                tasks = store.list(actor, query['shop_id'][0], query['date'][0])
                return self.reply(200, {'ok': True, 'data': {'items': tasks, 'total': len(tasks),
                    'completed': sum(task['status'] == 'completed' for task in tasks)}})
            if path == '/v1/tasks' and self.command == 'POST':
                return self.reply(201, {'ok': True, 'data': store.create(actor, self.body())})
            match = re.fullmatch(r'/v1/tasks/([a-f0-9]{32})(?:/(photos|complete|audit))?', path)
            if match:
                task_id, action = match.groups()
                if self.command == 'GET' and not action:
                    result = store.detail(actor, task_id)
                elif self.command == 'GET' and action == 'audit':
                    result = store.audit(actor, task_id)
                elif self.command == 'POST' and action == 'complete':
                    result = store.complete(actor, task_id, self.body())
                elif self.command == 'POST' and action == 'photos':
                    result = store.photo(actor, task_id, self.body(True), self.headers.get('Content-Type', ''))
                    return self.reply(201, {'ok': True, 'data': result})
                else:
                    raise Fault(405, 'method_not_allowed')
                return self.reply(200, {'ok': True, 'data': result})
            photo = re.fullmatch(r'/v1/photos/([a-f0-9]{32})', path)
            if self.command == 'GET' and photo:
                content, mime = store.read_photo(actor, photo[1])
                return self.reply(200, content, mime)
            raise Fault(404, 'not_found')

        def learning_route(self, actor, path, query):
            get = self.command == 'GET'
            if path == '/v1/learning' and get:
                values = parse_qs(query, keep_blank_values=True)
                if (set(values) - {'tab', 'q', 'category', 'sort', 'page', 'record_kind'} or 'tab' not in values
                        or any(len(x) != 1 for x in values.values())):
                    raise Fault(400, 'invalid_query')
                params = {k: v[0] for k, v in values.items()}
                if 'page' in params:
                    if not re.fullmatch(r'[1-9][0-9]{0,2}', params['page']):
                        raise Fault(400, 'invalid_query')
                    params['page'] = int(params['page'])
                return 200, learning.list(actor, **params), None
            if query:
                raise Fault(400, 'invalid_query')
            if path == '/v1/learning/drafts' and not get:
                learning._author(actor)
                return 202, learning.generate_draft(actor, self.body()), None
            found = re.fullmatch(r'/v1/learning/(cards|drafts|attempts|covers)/(' + ENTRY_ID + r')(?:/(favorite|start|retry|save|photo|clear-photo|complete-training))?', path)
            if not found:
                raise Fault(404, 'not_found')
            kind, key, action = found.groups()
            if kind == 'covers' and get and not action:
                return 200, learning.cover(actor, key), 'image/jpeg'
            if kind == 'cards':
                if get and not action:
                    return 200, learning.detail(actor, key), None
                if not get and action == 'favorite':
                    return 200, learning.favorite(actor, key, self.body()), None
                if not get and action == 'start':
                    return 201, learning.start_quiz(actor, key, self.body()), None
                if not get and action == 'complete-training':
                    return 200, learning.complete_training(actor, key, self.body()), None
            if kind == 'drafts':
                learning._author(actor)
                if get and not action:
                    return 200, learning.draft(actor, key), None
                if not get and action == 'retry':
                    return 202, learning.retry(actor, key, self.body()), None
                if not get and action == 'save':
                    return 201, learning.save(actor, key, self.body(maximum=49152)), None
                if not get and action == 'photo':
                    return 200, learning.attach(actor, key, self.body(True)), None
                if not get and action == 'clear-photo':
                    return 200, learning.clear_photo(actor, key, self.body()), None
            if kind == 'attempts' and not get and not action:
                return 200, learning.submit(actor, key, self.body()), None
            raise Fault(405, 'method_not_allowed')

        do_GET = handle_request
        do_POST = handle_request

    class BoundedServer(ThreadingHTTPServer):
        def process_request(self, request, address):
            if not slots.acquire(blocking=False):
                self.shutdown_request(request)
                return
            try:
                super().process_request(request, address)
            except Exception:
                slots.release()
                raise

        def process_request_thread(self, request, address):
            try:
                super().process_request_thread(request, address)
            finally:
                slots.release()

    server = BoundedServer(address, Handler)
    server.daemon_threads = True
    return server


if __name__ == '__main__':
    os.umask(0o077)
    storage = Store(os.environ['GO_OPERATIONS_STATE'])
    learning = LearningStore(storage.root, configured_generator(), recover=True,
                             fresh_start=os.environ.get('GO_LEARNING_FRESH_START') == '1')
    make_server(('127.0.0.1', int(os.environ.get('PORT', '3987'))), storage, Erp(),
                read_only=os.environ.get('GO_OPERATIONS_READ_ONLY', '1') != '0', learning=learning).serve_forever()
