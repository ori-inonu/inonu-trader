"""Offline regression tests. Fixtures are synthetic, never product evidence."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

if os.name=='nt':
    hermes_scratch=Path.home()/'AppData'/'Local'/'hermes'/'cache'/'scratch'
    hermes_scratch.mkdir(parents=True,exist_ok=True)
    tempfile.tempdir=str(hermes_scratch)

MODULE = Path(__file__).with_name('compiler.py')
spec = importlib.util.spec_from_file_location('evolution_compiler', MODULE)
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


class CompilerTests(unittest.TestCase):
    def test_inline_and_escaped_pipes(self):
        self.assertEqual(c.cells('| A0.1 | `a|b` e x\\|y | feito |'), ['A0.1', '`a|b` e x\\|y', 'feito'])

    def test_native_groups_and_ids(self):
        text = '# Plano\n\n## Fase 0: agente\n\n| ID | Resultado | Estado |\n|---|---|---|\n| A0.1 | Modelo | feito (modelo falso) |\n\n## Fase 3: alavancagem\nSomente especificada.\n'
        groups, tasks = c.parse_tasks('docs/sdd/agente/tasks.md', text)
        self.assertEqual(tasks[0]['original_id'], 'A0.1')
        self.assertEqual(tasks[0]['line'], 7)
        self.assertEqual(tasks[0]['declared_state'], 'feito (modelo falso)')
        self.assertEqual(tasks[0]['implementation_verified'], False)
        self.assertEqual(len(groups), 2)
        self.assertEqual(groups[0]['native_kind'], 'fase')
        self.assertIsNone(tasks[0]['release_id'])

    def test_same_id_different_namespaces(self):
        text='## M1 Exemplo\n| ID | Resultado | Estado |\n|---|---|---|\n| T1.1 | Algo | verificado |\n'
        a=c.parse_tasks('docs/sdd/a/TASKS.md', text)[1][0]
        b=c.parse_tasks('docs/sdd/b/TASKS.md', text)[1][0]
        self.assertNotEqual(a['id'], b['id'])
        self.assertEqual(a['original_id'], b['original_id'])
        self.assertEqual(a['native_parent_kind'], 'milestone_nativo')

    def test_duplicate_in_same_source_is_rejected(self):
        text='| ID | Resultado |\n|---|---|\n| T01 | A |\n| T01 | B |'
        with self.assertRaises(ValueError): c.parse_tasks('docs/sdd/a/tasks.md', text)

    def test_unnamed_task_is_not_fabricated_original_id(self):
        text='| Tarefa | Estado | Prova |\n|---|---|---|\n| Fechar ciclo | parcial | fixture |'
        tasks=c.parse_tasks('docs/sdd/host/tasks.md',text)[1]
        self.assertIsNone(tasks[0]['original_id'])
        self.assertTrue(tasks[0]['local_id'].startswith('item-'))

    def test_frontend_task_header_and_no_implementation_claim(self):
        text='## Gates\n| Task | Prioridade | Requisitos |\n|---|---|---|\n| T00 | P0 | RQ01 |'
        t=c.parse_tasks('docs/sdd/ux/tasks.md',text)[1][0]
        self.assertEqual(t['original_id'],'T00')
        self.assertEqual(t['declared_state'],'nao_informado')
        self.assertFalse(t['implementation_verified'])

    def test_task_dependencies_are_scoped_not_global(self):
        text='## M1\n| ID | Resultado | Dep | Estado |\n|---|---|---|---|\n| T1.1 | A | nada | feito |\n| T1.2 | B | T1.1, D1 | aberta |'
        t=c.parse_tasks('docs/sdd/a/tasks.md',text)[1][1]
        self.assertIn('T1.1',t['dependency_tokens'])
        self.assertNotIn('D1',t['dependency_tokens'])

    def test_negation_and_partial_do_not_become_verified(self):
        self.assertEqual(c.state_class('não iniciado'),'planejada_declarada')
        self.assertEqual(c.state_class('feito com fixtures; falta real'),'parcial_declarada')
        self.assertEqual(c.state_class('bloqueado: falta acesso'),'bloqueada_declarada')

    def test_sensitive_and_hidden_are_never_read(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=Path(tmp); (r/'docs/.obsidian').mkdir(parents=True)
            (r/'docs/.obsidian/app.json').write_text('private')
            (r/'docs/data').mkdir(); (r/'docs/data/private.md').write_text('private data')
            (r/'docs/a.md').write_text('# Example')
            (r/'docs/secret.md').write_bytes(b'\xff\xfeSECRET')
            sensitive=r/'docs/secret.md'; original_read_bytes=Path.read_bytes
            def guarded_read_bytes(source,*args,**kwargs):
                if source.resolve()==sensitive.resolve(): raise AssertionError('sensitive source was read')
                return original_read_bytes(source,*args,**kwargs)
            with mock.patch.object(Path,'read_bytes',guarded_read_bytes):
                rows=c.inventory(r,set(),{'docs/secret.md'}, {})
            self.assertEqual({x['path'] for x in rows},{'docs/a.md','docs/secret.md'})
            secret=next(x for x in rows if x['path']=='docs/secret.md')
            self.assertEqual(secret,{'path':'docs/secret.md'})
            self.assertNotIn('SECRET',str(rows))

    def test_sensitive_source_remains_a_labeled_metadata_only_pointer(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=Path(tmp); path=next(iter(c.SENSITIVE)); p=r/path
            p.parent.mkdir(parents=True); p.write_bytes(b'SYNTHETIC-SENSITIVE-CONTENT')
            old={'classification':'legacy','last_reviewed':'2026-10-13','reason':'legacy','current_sha256':'legacy-secret-hash','read_mode':'read'}
            original_read_bytes=Path.read_bytes; original_read_text=Path.read_text
            def deny_sensitive_read(source,*args,**kwargs):
                if source.resolve()==p.resolve(): raise AssertionError('sensitive source was read')
                return original_read_bytes(source,*args,**kwargs)
            def deny_sensitive_text(source,*args,**kwargs):
                if source.resolve()==p.resolve(): raise AssertionError('sensitive source was read')
                return original_read_text(source,*args,**kwargs)
            with mock.patch.object(Path,'read_bytes',deny_sensitive_read),mock.patch.object(Path,'read_text',deny_sensitive_text):
                rows=c.inventory(r,set(),c.SENSITIVE,{path:old})
                graph,pages=c.compile_graph(r,rows,{'versions':[],'current_claims':[],'relations':[],'document_overrides':{}})
                report=c.validate(r,graph,pages)
            self.assertEqual(rows,[{'path':path}])
            self.assertEqual(graph['inventory'],[{'path':path}])
            self.assertTrue(any(n.get('path')==path and n.get('kind')=='fonte_sensivel' for n in graph['nodes']))
            catalog=next(text for name,text in pages.items() if '/catalogo/' in name and 'fontes-sensiveis' in name)
            self.assertIn(path,catalog)
            self.assertIn('sensível não lido',catalog)
            self.assertNotIn('legacy-secret-hash',json.dumps(graph,ensure_ascii=False))
            self.assertNotIn('source_drift',[error['code'] for error in report['errors']])
            legacy_row={'path':path,'extension':'.md','area':'sdd/mesa-decisao-20261013','bytes':23,'sha256':None,'read_mode':'not_opened_sensitive','legacy_review':{'current_sha256':'legacy-secret-hash'},'changed_since_legacy_review':None}
            rebuilt,_=c.compile_graph(r,[legacy_row],{'versions':[],'current_claims':[],'relations':[],'document_overrides':{}})
            self.assertEqual(rebuilt['inventory'],[{'path':path}])
            self.assertNotIn('legacy-secret-hash',json.dumps(rebuilt,ensure_ascii=False))

    def test_relation_evidence_traversal_is_rejected_before_read(self):
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp); r=base/'root'; (r/'docs').mkdir(parents=True)
            (base/'outside.txt').write_text('one line')
            evidence_paths=['../outside.txt',str((base/'outside.txt').resolve())]
            for evidence in evidence_paths:
                with self.subTest(evidence=evidence):
                    graph={'nodes':[{'id':'new','kind':'fixture'},{'id':'old','kind':'fixture'}], 'edges':[{'from':'new','to':'old','relation':'substitui_parcialmente','scope':'fixture','evidence':evidence,'line':1}], 'inventory':[], 'counts':{}}
                    report=c.validate(r,graph,{})
                    self.assertFalse(report['ok'])
                    self.assertTrue(any(e['code']=='relation_evidence_path_invalid' for e in report['errors']))

    def test_curation_paths_are_prevalidated_before_graph_construction(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=Path(tmp); (r/'docs').mkdir()
            curation={'versions':[],'current_claims':[],'relations':[{'new':'docs/a.md','old':'docs/b.md','evidence':'../outside.md','line':1,'scope':'fixture','kind':'substitui_parcialmente'}],'document_overrides':{}}
            with self.assertRaises(ValueError): c.compile_graph(r,[],curation)

    def test_relation_evidence_symlink_outside_root_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp); r=base/'root'; docs=r/'docs'; docs.mkdir(parents=True)
            outside=base/'outside'; outside.mkdir(); (outside/'evidence.txt').write_text('one line')
            link=docs/'evidence-link'
            if os.name=='nt':
                created=subprocess.run(['cmd.exe','/c','mklink','/J',str(link),str(outside)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
            else:
                try:
                    link.symlink_to(outside,target_is_directory=True); created=True
                except (OSError,NotImplementedError):
                    created=False
            if not created: self.skipTest('directory symlinks/junctions unavailable')
            try:
                graph={'nodes':[{'id':'new','kind':'fixture'},{'id':'old','kind':'fixture'}], 'edges':[{'from':'new','to':'old','relation':'substitui_parcialmente','scope':'fixture','evidence':'docs/evidence-link/evidence.txt','line':1}], 'inventory':[], 'counts':{}}
                report=c.validate(r,graph,{})
                self.assertFalse(report['ok'])
                self.assertTrue(any(e['code']=='relation_evidence_path_invalid' for e in report['errors']))
            finally:
                if link.exists(): os.rmdir(link)

    def test_relation_evidence_private_paths_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=Path(tmp); (r/'docs').mkdir()
            evidence_paths=['.env','.env.local','data/evidence.txt','docs/.obsidian/evidence.txt','.git/config']
            for evidence in evidence_paths:
                target=r/evidence; target.parent.mkdir(parents=True,exist_ok=True); target.write_text('one line')
            for evidence in evidence_paths:
                with self.subTest(evidence=evidence):
                    graph={'nodes':[{'id':'new','kind':'fixture'},{'id':'old','kind':'fixture'}], 'edges':[{'from':'new','to':'old','relation':'substitui_parcialmente','scope':'fixture','evidence':evidence,'line':1}], 'inventory':[], 'counts':{}}
                    report=c.validate(r,graph,{})
                    self.assertFalse(report['ok'])
                    self.assertTrue(any(e['code']=='relation_evidence_path_invalid' for e in report['errors']))

    def test_unknown_release_is_not_current_package_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=Path(tmp); (r/'docs/sdd/a').mkdir(parents=True)
            (r/'docs/sdd/a/tasks.md').write_text('| ID | Resultado |\n|---|---|\n| T01 | exemplo |')
            rows=c.inventory(r,set(),set(),{})
            graph,pages=c.compile_graph(r,rows,{'versions':[{'id':'v0.0.2','title':'Release candidate','facts':['Declarada, não publicação'],'sources':['docs/sdd/a/tasks.md']}], 'current_claims':[], 'relations':[], 'document_overrides':{}})
            tasks=[n for n in graph['nodes'] if n['kind']=='tarefa']
            self.assertIsNone(tasks[0]['release_id'])
            self.assertFalse(any(e['relation']=='released_in' and e['from']==tasks[0]['id'] for e in graph['edges']))
            self.assertTrue(any(n['kind']=='release_nao_atribuida' for n in graph['nodes']))
            self.assertTrue(any('T01' in p for p in pages.values()))

    def test_explicit_supersession_has_scope_and_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=Path(tmp); (r/'docs').mkdir()
            (r/'docs/a.md').write_text('# Antigo')
            (r/'docs/b.md').write_text('# Atual')
            rows=c.inventory(r,set(),set(),{})
            relation={'new':'docs/b.md','old':'docs/a.md','scope':'Só interface','evidence':'docs/b.md','line':1,'kind':'substitui_parcialmente'}
            graph,_=c.compile_graph(r,rows,{'versions':[], 'current_claims':[], 'relations':[relation], 'document_overrides':{}})
            edge=next(e for e in graph['edges'] if e['relation']=='substitui_parcialmente')
            self.assertEqual(edge['scope'],'Só interface')
            self.assertEqual(edge['evidence'],'docs/b.md')

    def test_missing_evidence_is_validation_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=Path(tmp); (r/'docs').mkdir()
            graph={'nodes':[{'id':'a','kind':'versao','path':'docs/_meta/evolucao/a.md','sources':['docs/missing.md']}], 'edges':[], 'inventory':[], 'counts':{}}
            report=c.validate(r,graph,{'docs/_meta/evolucao/a.md':'# Page'})
            self.assertFalse(report['ok'])
            self.assertTrue(any(e['code']=='source_missing' for e in report['errors']))

    def test_path_traversal_not_accepted(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=Path(tmp); (r/'docs').mkdir()
            graph={'nodes':[],'edges':[],'inventory':[],'counts':{}}
            report=c.validate(r,graph,{'../escape.md':'# Wrong'})
            self.assertFalse(report['ok'])
            self.assertTrue(any(e['code']=='output_outside_scope' for e in report['errors']))

    def test_plain_inventory_not_semantic_review(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=Path(tmp); (r/'docs').mkdir(); (r/'docs/new.md').write_text('# New')
            row=c.inventory(r,set(),set(),{})[0]
            self.assertEqual(row['review_status'],'nao_revisado_semanticamente')

    def test_evolution_controls_are_sources_and_outputs_are_explicitly_excluded(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=Path(tmp); base=r/c.BASE; base.mkdir(parents=True)
            controls={'SPEC.md','RUNBOOK.md','compiler.py','test_compiler.py','curation.json','acceptance.py'}
            for name in controls: (base/name).write_text('static source')
            (base/'unregistered.txt').write_text('new source')
            (base/'checkpoint.md').write_text('derived receipt')
            (base/'outputs.json').write_text('{}')
            (base/'catalogo').mkdir(); (base/'catalogo/compiled.md').write_text('derived page')
            generated={c.BASE+'/'+name for name in controls|{'checkpoint.md','outputs.json','catalogo/compiled.md'}}
            rows=c.inventory(r,generated,set(),{})
            paths={row['path'] for row in rows}
            self.assertEqual(paths,{c.BASE+'/'+name for name in controls}|{c.BASE+'/unregistered.txt'})

    def test_coverage_enumerates_independently_and_finds_unregistered_meta_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=Path(tmp); base=r/'docs/_meta/evolucao'; base.mkdir(parents=True)
            (base/'SPEC.md').write_text('static source')
            (base/'unregistered.md').write_text('new source')
            generated_registry=r/'docs/_meta/generated-files.json'; generated_registry.parent.mkdir(parents=True,exist_ok=True)
            generated_registry.write_text('{"files":["docs/_meta/generated-files.json","docs/_meta/evolucao/derived.md"]}')
            (base/'derived.md').write_text('compiled output')
            graph={'nodes':[],'edges':[],'inventory':[{'path':'docs/_meta/evolucao/SPEC.md'}],'counts':{}}
            with mock.patch.object(c,'inventory',side_effect=AssertionError('coverage reused inventory')):
                report=c.validate(r,graph,{})
            coverage=next(error for error in report['errors'] if error['code']=='inventory_coverage')
            self.assertEqual(coverage['missing'],['docs/_meta/evolucao/unregistered.md'])

    def test_curated_control_source_is_local_inventory_node(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=Path(tmp); p=r/c.BASE/'SPEC.md'; p.parent.mkdir(parents=True); p.write_text('# static input')
            rows=c.inventory(r,set(),set(),{})
            graph,_=c.compile_graph(r,rows,{'versions':[{'id':'v-test','title':'fixture','sources':[c.BASE+'/SPEC.md'],'facts':[]}], 'current_claims':[], 'relations':[], 'document_overrides':{}})
            node=next(n for n in graph['nodes'] if n.get('path')==c.BASE+'/SPEC.md')
            self.assertEqual(node['kind'],'documento')
            self.assertFalse(any(n.get('path')==c.BASE+'/SPEC.md' and n['kind']=='referencia_local_fora_do_corpus_docs' for n in graph['nodes']))

    def test_normal_curated_root_references_remain_valid(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=Path(tmp); (r/'docs').mkdir()
            curation_source=r/c.BASE/'curation.json'; curation_source.parent.mkdir(parents=True); curation_source.write_text('{}')
            references=['AGENTS.md','README.md','package.json','web/src/page.tsx']
            for source in references:
                target=r/source; target.parent.mkdir(parents=True,exist_ok=True); target.write_text('static fixture')
            curation={'versions':[],'current_claims':[{'text':'fixture','sources':references}],'relations':[],'document_overrides':{}}
            rows=c.inventory(r,set(),set(),{})
            graph,pages=c.compile_graph(r,rows,curation)
            report=c.validate(r,graph,pages)
            unsafe={'source_path_invalid','source_path_private','source_missing'}
            self.assertFalse([error for error in report['errors'] if error['code'] in unsafe])

    def test_inventory_drift_is_not_certified(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=Path(tmp); (r/'docs').mkdir(); p=r/'docs/a.md'; p.write_text('# Before')
            rows=c.inventory(r,set(),set(),{})
            p.write_text('# Changed after snapshot')
            graph={'nodes':[],'edges':[],'inventory':rows,'counts':{}}
            report=c.validate(r,graph,{})
            self.assertFalse(report['ok'])
            self.assertTrue(any(e['code']=='source_drift' for e in report['errors']))

    def test_missing_frontmatter_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=Path(tmp); (r/'docs').mkdir()
            report=c.validate(r,{'nodes':[],'edges':[],'inventory':[],'counts':{}},{c.HUB:'# No metadata'})
            self.assertTrue(any(e['code']=='frontmatter_missing' for e in report['errors']))

    def test_unverified_version_not_classified_as_proven(self):
        with tempfile.TemporaryDirectory() as tmp:
            r=Path(tmp); (r/'docs').mkdir(); (r/'docs/a.md').write_text('# Example')
            rows=c.inventory(r,set(),set(),{})
            graph,_=c.compile_graph(r,rows,{'versions':[{'id':'v0.0.1','verified':False,'title':'Não comprovada','facts':['Não há evidência local'],'sources':['docs/a.md']}], 'current_claims':[], 'relations':[], 'document_overrides':{}})
            node=next(n for n in graph['nodes'] if n['id']=='release:v0.0.1')
            self.assertEqual(node['kind'],'referencia_de_versao_nao_comprovada')

    def test_architecture_slices_preserve_original_ids(self):
        text='## 6. Fatias\n| Fatia | Conteudo | Aceite | Risco |\n|---|---|---|---|\n| F1a | Leitura offline | fixtures | nenhum |'
        tasks=c.parse_tasks('docs/sdd/agente/viabilidade.md',text)[1]
        self.assertEqual(tasks[0]['original_id'],'F1a')
        self.assertEqual(tasks[0]['declared_state'],'nao_informado')

    def test_explicit_heading_slices_capture_native_line_and_state(self):
        text='## 3. Decisoes\n\n### E1. Pulse\nDescricao.\nEstado (2026-10-15): IMPLEMENTADA e DESLIGADA por padrao.\n'
        groups,tasks=c.parse_heading_tasks('docs/sdd/agente/adendo-e.md',text,['E1'])
        self.assertEqual(tasks[0]['original_id'],'E1')
        self.assertEqual(tasks[0]['line'],3)
        self.assertIn('DESLIGADA',tasks[0]['declared_state'])
        self.assertFalse(tasks[0]['implementation_verified'])

if __name__=='__main__': unittest.main(verbosity=2)
