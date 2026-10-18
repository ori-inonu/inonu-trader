"""Read-only freshness check for the integrated wiki snapshot. No network or writes."""
from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path
import sys

EXCLUDED = {'node_modules', '__pycache__', '.venv', 'dist', 'build', '.next', '.cache', '.git'}
WIKI_ROOT_FILES = {'README.md', 'SCHEMA.md', 'index.md', 'log.md'}
WIKI_DIRS = {'_meta', 'concepts', 'raw', 'entities', 'comparisons', 'queries'}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_paths(root: Path) -> set[str]:
    paths = set()
    for prefix in ('src', 'scripts', 'web/src', 'python', 'installer'):
        directory = root / prefix
        if not directory.is_dir():
            continue
        for path in directory.rglob('*'):
            parts = path.relative_to(directory).parts
            if not path.is_file() or any(part in EXCLUDED for part in parts):
                continue
            if path.name.startswith('.env') or '.env.' in path.name:
                continue
            paths.add(path.relative_to(root).as_posix())
    for path in root.iterdir():
        if path.is_file() and not path.name.startswith('.') and (path.suffix.lower() in {'.md', '.json', '.toml', '.ts', '.yaml', '.yml'} or path.name == 'Dockerfile'):
            paths.add(path.relative_to(root).as_posix())
    for name in ('package.json', 'README.md', 'OKX-WALLET.md', 'AGENTS.md', 'next.config.ts', 'tsconfig.json'):
        path = root / 'web' / name
        if path.is_file():
            paths.add(path.relative_to(root).as_posix())
    return paths


def documentation_paths(root: Path) -> set[str]:
    paths = set()
    for path in (root / 'docs').rglob('*'):
        if not path.is_file():
            continue
        parts = path.relative_to(root / 'docs').parts
        if parts[0].startswith('.') or parts[0] in WIKI_DIRS or (len(parts) == 1 and parts[0] in WIKI_ROOT_FILES):
            continue
        paths.add(path.relative_to(root).as_posix())
    return paths


def compare(root: Path, recorded: list[dict], current: set[str], unverified: set[str] | None = None) -> dict:
    expected = {item['path']: item for item in recorded}
    unverified = unverified or set()
    changed = []
    for relative in sorted(current & expected.keys()):
        if relative in unverified:
            continue
        observed = digest(root / relative)
        if observed != expected[relative]['sha256']:
            changed.append({'path': relative, 'snapshot_sha256': expected[relative]['sha256'], 'current_sha256': observed})
    return {'expected': len(expected), 'current': len(current), 'changed': changed, 'missing': sorted(expected.keys() - current), 'new': sorted(current - expected.keys()), 'unverified': sorted((current & expected.keys()) & unverified)}


def check(root: Path, snapshot: dict) -> dict:
    code = compare(root, snapshot['code_files'], source_paths(root))
    sensitive = {item['path'] for item in snapshot['documentation_sources'] if item.get('content_unverified_sensitive') is True}
    docs = compare(root, snapshot['documentation_sources'], documentation_paths(root), sensitive)
    ok = not any(section[key] for section in (code, docs) for key in ('changed', 'missing', 'new', 'unverified'))
    return {'format': 'docs-wiki-freshness-v1', 'checked_at': datetime.now().astimezone().isoformat(), 'snapshot_captured': snapshot['captured'], 'ok': ok, 'code': code, 'documentation': docs, 'sensitive_sources_not_read': sorted(sensitive), 'limits': 'Hashes and path inventory only, not semantic review, runtime qualification or autonomous monitoring. Files marked content_unverified_sensitive are inventoried by path only and make the freshness result incomplete; build outputs and secrets are excluded.'}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[3])
    parser.add_argument('--snapshot', type=Path, help='Explicit versioned snapshot, relative to the repository root or absolute.')
    args = parser.parse_args()
    root = args.root.resolve()
    catalog_path = root / 'docs/_meta/catalog.json'
    current_snapshot = json.loads(catalog_path.read_text(encoding='utf-8')).get('current_snapshot')
    default = current_snapshot or 'docs/_meta/project-state-final-20261013.json'
    path = root / (args.snapshot or default)
    snapshot = json.loads(path.read_text(encoding='utf-8'))
    result = check(root, snapshot)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
