"""Validate an operator-reviewed, normalized export without touching the live ledger by default."""
import argparse
import hashlib
import json
import os
import tempfile
from pathlib import Path

from learning import LearningStore
from erp import Fault


def load_verified(path, sha256, limit):
    with path.open('rb') as f:
        raw = f.read(limit + 1)
    if len(raw) > limit or hashlib.sha256(raw).hexdigest() != sha256:
        raise SystemExit('Export size or checksum does not match the reviewed manifest')
    return json.loads(raw)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, required=True)
    parser.add_argument('--identity-map', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--apply-to', type=Path, help='Explicitly apply into an isolated, backed-up state directory')
    args = parser.parse_args()
    os.umask(0o077)
    metadata = json.loads(args.manifest.read_text())
    if not isinstance(metadata.get('source'), str) or not metadata['source'].strip():
        raise SystemExit('Identify the reviewed authoritative source')
    snapshot = load_verified(args.snapshot, metadata.get('snapshot_sha256'), 256 * 1024 * 1024)
    identity = load_verified(args.identity_map, metadata.get('identity_sha256'), 16 * 1024 * 1024)
    if not isinstance(snapshot, dict) or any(not isinstance(v, list) for v in snapshot.values()):
        raise SystemExit('Invalid normalized export')
    counts = {k: len(v) for k, v in snapshot.items()}
    if counts != metadata.get('counts'):
        raise SystemExit('Export counts do not match the reviewed manifest')
    try:
        with tempfile.TemporaryDirectory(prefix='go-learning-validate-') as sandbox:
            rehearsal = LearningStore(sandbox)
            rehearsal.import_legacy(snapshot, identity)
            with rehearsal.db() as conn:
                if conn.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                    raise SystemExit('Staging integrity check failed')
            if args.apply_to:
                if not args.apply_to.is_dir():
                    raise SystemExit('Refusing to create a state directory implicitly')
                LearningStore(args.apply_to).import_legacy(snapshot, identity)
    except Fault as error:
        raise SystemExit('Import rejected: ' + error.code) from None
    print(json.dumps({'applied': bool(args.apply_to), 'counts': counts}))


if __name__ == '__main__':
    main()
