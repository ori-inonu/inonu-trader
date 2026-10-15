"""Read-only acceptance checks; writes only its explicit local JSON receipt."""
from pathlib import Path
from collections import Counter
from datetime import datetime
import copy
import hashlib
import importlib.util
import json
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[3]
BASE=ROOT/'docs/_meta/evolucao'
ALLOWED_EXISTING={'docs/README.md','docs/index.md','docs/SCHEMA.md','docs/_meta/currentness.md','docs/log.md','docs/_meta/generated-files.json'}
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def load(name): return json.loads((BASE/name).read_text(encoding='utf-8'))
def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    obj=importlib.util.module_from_spec(spec); spec.loader.exec_module(obj); return obj
def run(*args):
    result=subprocess.run(args,cwd=ROOT,capture_output=True,text=True,encoding='utf-8',errors='replace')
    return {'command':list(args),'exit_code':result.returncode,'stdout':result.stdout,'stderr':result.stderr}
def atomic_errors(report):
    found=set()
    for item in report['errors']:
        code=item['code']; expanded=False
        for key in ('paths','missing','extra'):
            if isinstance(item.get(key),list):
                expanded=True
                for path in item[key]: found.add((code,key,json.dumps(path,ensure_ascii=False,sort_keys=True)))
        if not expanded: found.add((code,'record',json.dumps(item,ensure_ascii=False,sort_keys=True)))
    return found

compiler=module('evolution_compiler_acceptance',BASE/'compiler.py')
legacy=module('legacy_wiki_acceptance',ROOT/'docs/_meta/tools/verify.py')
graph=load('graph.json'); outputs=load('outputs.json'); curation=load('curation.json')
materialized_drift=[p for p,h in outputs['files'].items() if not (ROOT/p).is_file() or digest(ROOT/p)!=h]
rebuilt_graph,pages=compiler.compile_graph(ROOT,copy.deepcopy(graph['inventory']),curation)
rebuilt_report=compiler.validate(ROOT,rebuilt_graph,pages)
page_drift=[p for p,text in pages.items() if not (ROOT/p).is_file() or (ROOT/p).read_text(encoding='utf-8')!=text]
graph_deterministic=rebuilt_graph==graph
baseline=load('baseline-20261015.json')
missing=[]; modified=[]; allowed_modified=[]
for path,record in baseline['files'].items():
    p=ROOT/path
    if not p.is_file(): missing.append(path)
    elif digest(p)!=record['sha256']:
        (allowed_modified if path in ALLOWED_EXISTING else modified).append(path)
drift_path=BASE/'observed-source-drift-20261015.json'
drift_rows=json.loads(drift_path.read_text(encoding='utf-8'))['records'] if drift_path.is_file() else []
accounted=set()
for record in drift_rows:
    path=record['path']; target=ROOT/path
    if path in modified and record.get('reason') and record.get('attribution') and record.get('baseline_sha256')==baseline['files'][path]['sha256'] and target.is_file() and record.get('observed_sha256')==digest(target): accounted.add(path)
unaccounted=sorted(set(modified)-accounted)
legacy_current=legacy.collect_checks(ROOT)
old=load('legacy-baseline-20261015.json')
new_errors=sorted(atomic_errors(legacy_current)-atomic_errors(old))
tests=[run(sys.executable,'-B','docs/_meta/evolucao/test_compiler.py'),run(sys.executable,'-B','docs/_meta/tools/verify.test.py')]
receipt={'format':'jev-evolution-acceptance-v1','checked_at':datetime.now().astimezone().isoformat(),'ok':not any((materialized_drift,page_drift,missing,unaccounted,new_errors)) and graph_deterministic and rebuilt_report['ok'] and all(t['exit_code']==0 for t in tests),'documentary_only':True,'counts':{'sources':len(graph['inventory']),'markdown_sources':sum(x.get('extension')=='.md' for x in graph['inventory']),'supporting_artifacts':sum(x.get('extension') not in (None,'.md') for x in graph['inventory']),'sensitive_path_only_sources':sum(set(x)=={'path'} for x in graph['inventory']),'nodes':len(graph['nodes']),'edges':len(graph['edges']),'task_nodes':sum(x['kind']=='tarefa' for x in graph['nodes']),'group_nodes':sum(x['kind']=='agrupamento' for x in graph['nodes']),'compiled_markdown_pages':len(pages)},'preservation':{'baseline_paths':len(baseline['files']),'allowed_existing_edits':sorted(allowed_modified),'unexpected_modified':sorted(modified),'missing':missing,'hidden_obsidian':'not_modified_by_task; not part of byte baseline','sensitive_source':'not_opened_or_hashed'},'materialization':{'manifest_drift':materialized_drift,'rebuilt_page_drift':page_drift,'graph_rebuild_identical':graph_deterministic,'validation':rebuilt_report},'legacy':{'baseline_ok':old['ok'],'current_ok':legacy_current['ok'],'new_atomic_errors':new_errors,'baseline_error_codes':dict(Counter(x['code'] for x in old['errors'])),'current_error_codes':dict(Counter(x['code'] for x in legacy_current['errors'])),'current_errors':legacy_current['errors']},'tests':tests,'implementation_hashes':{p:digest(ROOT/p) for p in ['docs/_meta/evolucao/compiler.py','docs/_meta/evolucao/test_compiler.py','docs/_meta/evolucao/curation.json']},'limits':['This checks documents and graph structure, not product implementation, publication, runtime or financial performance.','Unexpected original drift is reported without attribution; do not revert concurrent owners.']}
receipt['preservation'].update({'byte_preservation_ok':not missing and not modified,'recorded_source_changes':sorted(accounted),'unaccounted_source_changes':unaccounted,'source_drift_inventory_ok':not unaccounted})
(BASE/'acceptance.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({k:receipt[k] for k in ('ok','checked_at','counts','preservation','implementation_hashes')},ensure_ascii=False,indent=2))
print('MATERIALIZATION',json.dumps({'manifest_drift':materialized_drift,'page_drift':page_drift,'graph_identical':graph_deterministic,'validation_ok':rebuilt_report['ok']},ensure_ascii=False))
print('LEGACY',json.dumps({'baseline_ok':old['ok'],'current_ok':legacy_current['ok'],'new_errors':new_errors,'current_error_codes':receipt['legacy']['current_error_codes']},ensure_ascii=False))
print('TESTS',json.dumps([{'command':t['command'],'exit_code':t['exit_code'],'summary':t['stderr'].splitlines()[-4:]} for t in tests],ensure_ascii=False))
raise SystemExit(0 if receipt['ok'] else 1)
