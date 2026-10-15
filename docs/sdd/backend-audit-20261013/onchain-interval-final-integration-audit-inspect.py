from pathlib import Path
import hashlib, json, difflib, re
from datetime import datetime, timezone

reviewer_id = 'audit_intelligence'
task = Path('C:/Users/gabri/.codex/tmp/backend-01a1361d-v2')
live = Path('C:/Users/gabri/jev-trader')
iso = task / 'implementation'
docrel = Path('docs/sdd/backend-audit-20261013')
research = task / 'research'
prefix = 'onchain-interval-final-integration-audit'

def data(path):
    return path.read_bytes()
def sha_bytes(value):
    return hashlib.sha256(value).hexdigest()
def sha(path):
    return sha_bytes(data(path)) if path.is_file() else None
def loadj(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

manifest_path = docrel / 'evidence/onchain-interval-integration-manifest.json'
record_path = docrel / 'evidence/onchain-interval-final-live.json'
manifest = loadj(live / manifest_path)
record = loadj(live / record_path)
plan = loadj(task / 'onchain-interval-integration-plan.json')
progress = loadj(task / 'onchain-interval-integration-progress.json')
before = loadj(research / (prefix + '-before-hashes.json'))
source_rows = []
for row in manifest['sourceRows']:
    rel = Path(row['path'])
    pre_rel = docrel / 'evidence/onchain-interval-preintegration' / (row['path'] + '.txt')
    before_row = next(item for item in before['files'] if item['path'] == row['path'])
    live_bytes = data(live / rel)
    isolated_bytes = data(iso / rel)
    pre_bytes = data(live / pre_rel)
    old_text = pre_bytes.decode('utf-8').splitlines(keepends=True)
    new_text = live_bytes.decode('utf-8').splitlines(keepends=True)
    source_rows.append({
        **row,
        'live_sha256': sha_bytes(live_bytes),
        'isolated_sha256': sha_bytes(isolated_bytes),
        'live_equal_isolated_bytes': live_bytes == isolated_bytes,
        'live_matches_approved_after': sha_bytes(live_bytes) == row['after'],
        'preserved_during_audit': sha_bytes(live_bytes) == before_row['live_sha256'] and sha_bytes(isolated_bytes) == before_row['isolated_sha256'],
        'preimage_path': pre_rel.as_posix(),
        'preimage_live_sha256': sha_bytes(pre_bytes),
        'preimage_isolated_sha256': sha(iso / pre_rel),
        'preimage_matches_before': sha_bytes(pre_bytes) == row['before'] and sha(iso / pre_rel) == row['before'],
        'source_changed': pre_bytes != live_bytes,
        'preimage_to_live_unified_diff': ''.join(difflib.unified_diff(old_text, new_text, fromfile=pre_rel.as_posix(), tofile=row['path'], n=3)),
        'test_declarations': [ {'line': idx, 'literal': line} for idx, line in enumerate(live_bytes.decode('utf-8').splitlines(),1) if re.search(r'\b(?:test|test\.each|it)\(', line) ] if rel.name.endswith('.test.ts') else []
    })
written_checks = [{**row, 'live_sha256': sha(live / row['path']), 'isolated_sha256': sha(iso / row['path']), 'live_matches_after': sha(live / row['path']) == row['after'], 'isolated_matches_after': sha(iso / row['path']) == row['after']} for row in manifest['written']]
log_checks = []
for row in record['logs']:
    rel_log = docrel / 'evidence' / (row['name'] + '.log')
    rel_metrics = docrel / 'evidence' / (row['name'] + '.metrics.json')
    metrics = loadj(live / rel_metrics)
    log_bytes = data(live / rel_log)
    log_text = log_bytes.decode('utf-8')
    check = {
        **row,
        'log_live_sha256': sha_bytes(log_bytes),
        'log_isolated_sha256': sha(iso / rel_log),
        'log_original_sha256': sha(task / 'verification' / (row['name'] + '.log')),
        'log_hashes_match': all(h == row['logSha256'] for h in [sha_bytes(log_bytes), sha(iso / rel_log), sha(task / 'verification' / (row['name'] + '.log'))]),
        'metrics_live_sha256': sha(live / rel_metrics),
        'metrics_isolated_sha256': sha(iso / rel_metrics),
        'metrics_original_sha256': sha(task / 'verification' / (row['name'] + '.metrics.json')),
        'metrics_hashes_match': all(h == row['metricsSha256'] for h in [sha(live / rel_metrics), sha(iso / rel_metrics), sha(task / 'verification' / (row['name'] + '.metrics.json'))]),
        'metrics': metrics,
        'metrics_contains_exit_code': any('exit' in key.lower() for key in metrics),
        'log_bytes': len(log_bytes),
        'literal_log_tail': '\n'.join(log_text.splitlines()[-8:]),
        'literal_file_headers': [line for line in log_text.splitlines() if line.startswith('src\\') and line.endswith(':')],
        'native_exit_code_evidence': {'value':0,'provenance':'Parent root: native commandExecution exits captured; not encoded in RTK metrics, not rerun by this auditor.'}
    }
    log_checks.append(check)
docs = {}
for name in ['ONCHAIN-SPEC.md','ONCHAIN-INTERVAL-FINAL-LIVE-VERIFICATION.md','ONCHAIN-INTERVAL-FINAL-SPEC-REVIEW.md','ONCHAIN-INTERVAL-FINAL-STANDARDS-REVIEW.md','evidence/onchain-interval-integration-manifest.json','evidence/onchain-interval-final-live.json']:
    docs[name] = {'live_sha256':sha(live / docrel / name),'isolated_sha256':sha(iso / docrel / name),'equal':sha(live / docrel / name)==sha(iso / docrel / name)}
helper = task / 'integrate-onchain-interval.mjs'
result = {
    'version':1, 'reviewer_id':reviewer_id, 'observed_utc':datetime.now(timezone.utc).isoformat(),
    'commands_executed_by_auditor':'Read-only PowerShell Get-Content/Get-FileHash/Select-String and this Python hashlib/json/difflib inspector; no Git, tests, environment reads or source writes.',
    'source_rows':source_rows, 'written_checks':written_checks, 'logs':log_checks, 'document_hashes':docs,
    'integration': {
        'manifest_sha256':sha(live / manifest_path), 'manifest_hash_matches_verification_record':sha(live / manifest_path)==record['integrationManifestSha256'],
        'integrated_at':manifest['integratedAt'], 'manifest_verification':manifest['verification'],
        'separate_verification_record_captured_at':record['capturedAt'], 'record_results':record['results'],
        'helper_sha256':sha(helper),'helper_lines':{str(idx):line for idx,line in enumerate(helper.read_text(encoding='utf-8').splitlines(),1) if 47<=idx<=50 or 58<=idx<=90},
        'plan_sha256':sha(task / 'onchain-interval-integration-plan.json'), 'progress_sha256':sha(task / 'onchain-interval-integration-progress.json'),
        'plan_captured_at':plan['capturedAt'], 'plan_rows':len(plan['rows']), 'manifest_written_rows':len(manifest['written']),
        'progress_status':progress['status'], 'progress_written_matches_manifest':progress['written']==manifest['written'],
        'plan_mutated_rows_equal_manifest_written':[row for row in plan['rows'] if row['before']!=row['after']]==manifest['written'],
        'first_four_written_are_preimages':all(row['kind']=='preimage' for row in manifest['written'][:4]),
        'source_writes_only_client_and_tests':[row['path'] for row in manifest['written'] if row['kind']=='source']==['src/onchain-read/client.ts','src/onchain-read/client.test.ts'],
        'concurrent_writer_lock_claim':manifest['concurrentWriterLockClaim'],
        'cas_limit':'Immediate precondition hash check and postwrite check are evidenced in helper; check/write is not an atomic writer lock.'
    },
    'reported_test_inventory':record['testInventory'],
    'current_operational_limit':'Writes limited to exclusive research prefix. Historical rejected reviews and their operational deviations are preserved; this audit grants no retroactive approval.'
}
output = research / (prefix + '-evidence.json')
output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'evidence_path':str(output),'evidence_sha256':sha(output),'all_source_approved':all(r['live_matches_approved_after'] and r['live_equal_isolated_bytes'] for r in source_rows),'source_preserved':all(r['preserved_during_audit'] for r in source_rows),'preimages_match':all(r['preimage_matches_before'] for r in source_rows),'written_all_match':all(r['live_matches_after'] and r['isolated_matches_after'] for r in written_checks),'logs_all_match':all(r['log_hashes_match'] and r['metrics_hashes_match'] for r in log_checks),'docs_all_equal':all(r['equal'] for r in docs.values()),'progress_match':result['integration']['progress_written_matches_manifest'],'plan_match':result['integration']['plan_mutated_rows_equal_manifest_written'],'changed_sources':[r['path'] for r in source_rows if r['source_changed']],'metrics_contain_exit':[r['metrics_contains_exit_code'] for r in log_checks]},ensure_ascii=False,indent=2))