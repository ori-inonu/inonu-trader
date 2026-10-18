"""Offline checks for the additive documentation wiki. No network or dependencies."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

REQUIRED = {'title', 'created', 'updated', 'type', 'tags', 'sources', 'confidence'}
ALLOWED_TYPES = {'entity', 'concept', 'comparison', 'query', 'summary'}
WIKILINK = re.compile(r'\[\[([^\]\n]+)\]\]')
MARKDOWN_LINK = re.compile(r'!?\[[^\]\n]*\]\(([^\)\n]+)\)')
PROVENANCE = re.compile(r'\^\[((?:docs|src|scripts|web|python|installer)/[^\]\n]+)\]')


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def strip_code(text: str) -> str:
    without_fences = re.sub(r'(?ms)^\s*(`{3,}|~{3,}).*?^\s*\1\s*$', '', text)
    return re.sub(r'(`+)[^`\n]*?\1', '', without_fences)


def frontmatter(text: str) -> tuple[dict, str]:
    match = re.match(r'\A---\r?\n(.*?)\r?\n---\r?\n', text, re.S)
    if not match:
        return {}, text
    fields = {}
    lines = iter(match[1].splitlines())
    for line in lines:
        if line.startswith((' ', '\t')) or not line.strip():
            continue
        key, separator, value = line.partition(':')
        if not separator:
            continue
        value = value.strip()
        if value.startswith('['):
            while not value.rstrip().endswith(']'):
                try:
                    value += '\n' + next(lines)
                except StopIteration:
                    raise ValueError('Unterminated frontmatter array: ' + key)
            try:
                fields[key] = json.loads(value)
            except json.JSONDecodeError:
                fields[key] = [part.strip().strip('\"\'') for part in value[1:-1].split(',') if part.strip()]
        elif value.startswith('\"'):
            fields[key] = json.loads(value)
        elif not value:
            fields[key] = []
        else:
            fields[key] = value
    for key in ('tags', 'sources', 'contradictions'):
        block = re.search(r'^' + key + r':\s*\n((?:[ \t]+-[^\n]*\n?)+)', match[1], re.M)
        if block:
            fields[key] = [line.strip()[2:].strip().strip('\"\'') for line in block[1].splitlines()]
        if key in fields and not isinstance(fields[key], list):
            raise ValueError('Frontmatter field must be a list: ' + key)
    return fields, text[match.end():]


def resolve_local_link(source: Path, target: str, root: Path) -> Path | None:
    target = target.strip()
    if target.startswith('<') and '>' in target:
        target = target[1:target.index('>')]
    else:
        target = re.split(r'\s+[\"\']', target, maxsplit=1)[0]
    if not target or target.startswith('#') or urlsplit(target).scheme or target.startswith('//'):
        return None
    target = unquote(target.split('#', 1)[0].split('?', 1)[0])
    if not target:
        return None
    return ((root / target) if target.startswith('docs/') else (source.parent / target)).resolve()


def collect_checks(root: Path) -> dict:
    docs = root / 'docs'
    baseline = json.loads((docs / '_meta/source-manifest-20261013.json').read_text(encoding='utf-8'))
    catalog = json.loads((docs / '_meta/catalog.json').read_text(encoding='utf-8'))
    generated_receipt = json.loads((docs / '_meta/generated-files.json').read_text(encoding='utf-8'))
    status_path = docs / '_meta/document-status.json'
    status = json.loads(status_path.read_text(encoding='utf-8')) if status_path.is_file() else {'files': []}
    sensitive_paths = {item['path'] for item in status.get('files', []) if item.get('read_mode') == 'not_opened_sensitive'}
    original = {item['path']: item for item in baseline['files']}
    for additions_path in sorted((docs / '_meta').glob('source-additions-*.json')):
        additions = json.loads(additions_path.read_text(encoding='utf-8'))
        for item in additions['files']:
            if item['path'] in original:
                raise ValueError('Source additions must not overwrite the initial baseline: ' + item['path'])
            original[item['path']] = item
    drift_path = docs / '_meta/source-drift-20261013.json'
    drift_records = {}
    if drift_path.is_file():
        drift = json.loads(drift_path.read_text(encoding='utf-8'))
        if drift.get('format') != 'docs-source-drift-v1':
            raise ValueError('Unsupported source drift manifest format')
        for item in drift.get('records', []):
            if item['path'] in drift_records:
                raise ValueError('Duplicate source drift path: ' + item['path'])
            drift_records[item['path']] = item
    generated = set(generated_receipt['files'])
    visible_original = {path for path, item in original.items() if not item['hidden']}
    indexed = [item['path'] for item in catalog['files']]
    current = {path.relative_to(root).as_posix() for path in docs.rglob('*') if path.is_file()}
    errors = []
    warnings = []
    def error(code, **data): errors.append({'code':code, **data})
    if len(generated) != len(generated_receipt['files']): error('duplicate_generated_paths')
    missing = sorted(set(original) - current)
    changed = sorted(path for path in original if path in current and path not in sensitive_paths and sha256(root / path) != original[path]['sha256'])
    if missing: error('original_missing', paths=missing)
    registered_drift = []
    invalid_drift = []
    sensitive_drift_unverified = []
    for relative, item in drift_records.items():
        if relative in sensitive_paths:
            sensitive_drift_unverified.append(relative)
            continue
        if relative not in original or relative not in current or item.get('baseline_sha256') != original.get(relative, {}).get('sha256'):
            invalid_drift.append(relative)
            continue
        actual = sha256(root / relative)
        if item.get('current_sha256') != actual or item.get('bytes') != (root / relative).stat().st_size:
            invalid_drift.append(relative)
        elif relative not in changed:
            invalid_drift.append(relative)
        else:
            registered_drift.append(relative)
    unregistered_drift = sorted(set(changed) - set(registered_drift))
    stale_drift = sorted(set(drift_records) - set(registered_drift) - set(sensitive_drift_unverified))
    if unregistered_drift: error('original_hash_drift', paths=unregistered_drift)
    if invalid_drift or stale_drift:
        error('source_drift_manifest_invalid', paths=sorted(set(invalid_drift + stale_drift)))
    if registered_drift:
        warnings.append({'code':'registered_original_hash_drift','paths':sorted(registered_drift),'note':'Current bytes differ from the immutable initial manifest; each change is recorded, but this is not byte-for-byte preservation.'})
    if sensitive_paths:
        warnings.append({'code':'sensitive_source_not_hashed','paths':sorted(sensitive_paths),'note':'Only path existence is checked; contents and current hashes are deliberately not read.'})
    uncatalogued = sorted(current - set(original) - generated)
    if uncatalogued: error('uncatalogued_new_files', paths=uncatalogued)
    if set(indexed) != visible_original:
        error('catalog_coverage', missing=sorted(visible_original-set(indexed)), extra=sorted(set(indexed)-visible_original))
    if len(indexed) != len(set(indexed)): error('duplicate_catalog_paths')
    if generated & set(original): error('generated_overlaps_original', paths=sorted(generated & set(original)))
    if generated - current: error('generated_missing', paths=sorted(generated-current))
    declared_documents = sum(item['path'].lower().endswith('.md') for item in catalog['files'])
    if catalog['source_files'] != len(indexed) or catalog['documents'] != declared_documents or catalog['supporting_artifacts'] != len(indexed)-declared_documents:
        error('catalog_count_mismatch')
    schema = (docs / 'SCHEMA.md').read_text(encoding='utf-8')
    taxonomy = set(re.findall(r'^- `([a-z-]+)`$', schema, re.M))
    all_markdown = [root / path for path in current if path.endswith('.md')]
    by_stem = defaultdict(list)
    for page in all_markdown: by_stem[page.stem].append(page)
    inbound = Counter()
    pages = sorted(path for path in generated if path.endswith('.md'))
    navigation = (docs / 'index.md').read_text(encoding='utf-8') + (docs / '_meta/topic-map.md').read_text(encoding='utf-8')
    navigation_targets = {target.split('|', 1)[0].split('#', 1)[0] for target in WIKILINK.findall(navigation)}
    link_count = 0
    catalog_links = []
    content_pages = []
    for relative in pages:
        path = root / relative
        if not path.is_file():
            continue  # generated_missing was recorded above; keep the receipt usable.
        text = path.read_text(encoding='utf-8')
        fields, body = frontmatter(text)
        absent = REQUIRED - fields.keys()
        if absent: error('frontmatter_missing', path=relative, fields=sorted(absent))
        if fields.get('type') not in ALLOWED_TYPES: error('frontmatter_type', path=relative)
        for key in ('created','updated'):
            try: datetime.strptime(fields.get(key,''), '%Y-%m-%d')
            except ValueError: error('frontmatter_date', path=relative, field=key)
        if fields.get('confidence') not in {'high','medium','low'}: error('frontmatter_confidence', path=relative)
        for tag in fields.get('tags',[]):
            if tag not in taxonomy: error('unknown_tag', path=relative, tag=tag)
        for source in fields.get('sources',[]):
            if not (root/source).is_file(): error('source_missing', path=relative, source=source)
        rendered = strip_code(body)
        for source in PROVENANCE.findall(rendered):
            if not (root/source).is_file(): error('provenance_source_missing', path=relative, source=source)
        if len(fields.get('sources',[])) >= 3 and relative.startswith(('docs/concepts/', 'docs/entities/', 'docs/comparisons/', 'docs/queries/')) and not PROVENANCE.search(rendered):
            error('provenance_markers_missing', path=relative)
        targets = set()
        for raw_target in WIKILINK.findall(rendered):
            target = raw_target.split('|',1)[0].split('#',1)[0]
            if not target: continue
            candidates = by_stem.get(target,[]) if '/' not in target else [docs / (target + ('' if target.endswith('.md') else '.md'))]
            if len(candidates) != 1 or not candidates[0].is_file():
                error('broken_or_ambiguous_wikilink', path=relative, target=target)
            else:
                resolved = candidates[0].relative_to(root).as_posix()
                if resolved != relative:
                    targets.add(resolved)
                    inbound[resolved] += 1
            link_count += 1
        if len(targets) < 2: error('outbound_links', path=relative, actual=len(targets))
        for raw_target in MARKDOWN_LINK.findall(rendered):
            target = resolve_local_link(path,raw_target,root)
            if target is None: continue
            link_count += 1
            if not target.exists(): error('broken_markdown_link', path=relative, target=raw_target)
            if relative.startswith('docs/_meta/catalogs/'):
                catalog_links.append(target.relative_to(root).as_posix())
        if len(text.splitlines()) > 200: error('generated_page_too_large', path=relative, lines=len(text.splitlines()))
        if any(char in rendered for char in '·—–'): error('forbidden_typography', path=relative)
        if relative.startswith(('docs/concepts/', 'docs/entities/', 'docs/comparisons/', 'docs/queries/')):
            content_pages.append(relative)
            if path.stem not in navigation_targets: error('page_missing_from_index', path=relative)
        if relative.startswith('docs/_meta/catalogs/') and relative[5:-3] not in navigation_targets and path.stem not in navigation_targets:
            error('catalog_missing_from_topic_map', path=relative)
        if relative.startswith('docs/_meta/catalogs/'):
            rows = [line for line in rendered.splitlines() if line.startswith('| [')]
            if len(rows) > 50: error('catalog_page_too_large', path=relative, entries=len(rows))
        if fields.get('contested') == 'true' or fields.get('confidence') == 'low' or fields.get('contradictions'):
            warnings.append({'code':'quality_review', 'path':relative})
    for page in content_pages:
        if not inbound[page]: error('orphan_page', path=page)
    if set(catalog_links) != visible_original or len(catalog_links) != len(visible_original):
        error('rendered_catalog_coverage', missing=sorted(visible_original-set(catalog_links)), extra=sorted(set(catalog_links)-visible_original), links=len(catalog_links))
    large_sources = [{'path':item['path'],'lines':item['lines']} for item in catalog['files'] if item.get('lines',0) and item['lines']>200]
    hashes = defaultdict(list)
    for item in catalog['files']:
        if item['extension']=='.md': hashes[item['sha256']].append(item['path'])
    duplicate_groups = [group for group in hashes.values() if len(group)>1]
    legacy_broken = []
    for relative in sorted(visible_original):
        if not relative.endswith('.md') or relative not in current: continue
        if relative in sensitive_paths: continue
        text = strip_code((root/relative).read_text(encoding='utf-8-sig',errors='replace'))
        for raw_target in MARKDOWN_LINK.findall(text):
            target = resolve_local_link(root/relative,raw_target,root)
            if target is not None and not target.exists(): legacy_broken.append({'path':relative,'target':raw_target})
    entries = len(re.findall(r'^## \[', (docs/'log.md').read_text(encoding='utf-8'),re.M))
    if entries>500: warnings.append({'code':'log_rotation_due','entries':entries})
    preservation_codes = {'original_missing', 'original_hash_drift', 'source_drift_manifest_invalid'}
    return {'format':'docs-wiki-verification-v1', 'checked_at':datetime.now().astimezone().isoformat(), 'ok':not errors,
        'navigation_ok':not any(item['code'] not in preservation_codes for item in errors),
        'preservation_ok':not missing and not changed and not sensitive_paths,
        'drift_inventory_ok':not unregistered_drift and not invalid_drift and not stale_drift,
        'checks':{'original_files':len(original),'original_files_unchanged':len(original)-len(missing)-len(changed)-len(sensitive_paths & set(original)),'registered_original_drifts':len(registered_drift),'unregistered_original_drifts':len(unregistered_drift),'sensitive_sources_unverified':len(sensitive_paths),'sensitive_source_paths':sorted(sensitive_paths),'source_files_catalogued':len(indexed),'markdown_sources':declared_documents,'supporting_artifacts':len(indexed)-declared_documents,'hidden_files_excluded_from_navigation':len(original)-len(visible_original),'generated_files':len(generated),'generated_markdown_pages':len(pages),'thematic_pages':len(content_pages),'links_checked':link_count,'rendered_catalog_source_links':len(catalog_links),'log_entries':entries},
        'errors':errors, 'warnings':warnings, 'legacy_maintenance':{'large_markdown_sources':large_sources,'exact_markdown_duplicate_groups':duplicate_groups,'unresolved_local_markdown_links':legacy_broken,'limits':'File-target scan only, not anchor/external-URL verification or technical truth audit. Historical links may intentionally refer to external archived work.'}}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[3])
    parser.add_argument('--output',type=Path,help='Optional JSON receipt; use a declared generated path or scratch.')
    args = parser.parse_args()
    root = args.root.resolve()
    if args.output:
        destination = args.output.resolve()
        receipt = root / 'docs/_meta/generated-files.json'
        allowed = set(json.loads(receipt.read_text(encoding='utf-8')).get('writable_receipts', ['docs/_meta/verification.json']))
        inside_root = destination.is_relative_to(root)
        if inside_root and destination.relative_to(root).as_posix() not in allowed:
            parser.error('--output must not overwrite a source or an undeclared repository file')
        if destination.suffix.lower() != '.json':
            parser.error('--output must be a JSON receipt')
    result = collect_checks(root)
    rendered = json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    if args.output:
        args.output.resolve().write_text(rendered,encoding='utf-8')
    print(json.dumps({'ok':result['ok'],'navigation_ok':result['navigation_ok'],'preservation_ok':result['preservation_ok'],'checks':result['checks'],'errors':result['errors'],'warnings':result['warnings'],'legacy_maintenance_counts':{key:len(value) for key,value in result['legacy_maintenance'].items() if isinstance(value,list)}},ensure_ascii=False,indent=2))
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
