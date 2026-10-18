"""Additive, offline compiler for the project's documentary evolution graph.
No network, model, product imports, credential reads, Git writes or original rewrites.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
import hashlib
import json
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
import re
import unicodedata
from urllib.parse import unquote, urlsplit

BASE = 'docs/_meta/evolucao'
HUB = 'docs/concepts/evolucao-do-projeto.md'
STATE = 'docs/concepts/estado-atual-do-projeto.md'
SENSITIVE = {'docs/sdd/mesa-decisao-20261013/credential-evidence.md'}
WIKI = re.compile(r'\[\[([^\]\n]+)\]\]')
LINK = re.compile(r'!?\[[^\]\n]*\]\(([^\)\n]+)\)')
ID = re.compile(r'^(?:T(?:\d|-[A-Z])|A\d|INT-|[EF]\d)[A-Za-z0-9.\-]*$')
DATE = '2026-10-15'
STATIC_INPUTS = {f'{BASE}/{name}' for name in ('SPEC.md','RUNBOOK.md','compiler.py','test_compiler.py','curation.json','acceptance.py')}
PRIVATE_COMPONENTS = {'.git','.obsidian','data'}

def sha(data): return hashlib.sha256(data).hexdigest()

def _relative_parts(value):
    if not isinstance(value,str) or not value or value!=value.strip() or '\x00' in value:
        raise ValueError('Path must be a non-empty repository-relative string')
    windows=PureWindowsPath(value)
    if '\\' in value or PurePosixPath(value).is_absolute() or windows.is_absolute() or windows.drive or ':' in value:
        raise ValueError('Absolute or non-portable path rejected: '+value)
    parts=value.split('/')
    if any(part in ('','.','..') for part in parts):
        raise ValueError('Traversal or non-canonical path rejected: '+value)
    return parts

def _path_key(value): return PurePosixPath(value).as_posix().casefold()

def _is_private_relative(value):
    parts=PurePosixPath(value).parts
    return any(part.casefold() in PRIVATE_COMPONENTS or part.casefold()=='.env' or part.casefold().startswith('.env.') for part in parts)

def _resolve_repo_path(root,value,sensitive=SENSITIVE):
    parts=_relative_parts(value); relative='/'.join(parts)
    root_path=Path(root).resolve(); candidate=root_path.joinpath(*parts)
    try: resolved=candidate.resolve(strict=False)
    except (OSError,RuntimeError,ValueError) as exc: raise ValueError('Unable to resolve repository path: '+relative) from exc
    try: resolved_relative=resolved.relative_to(root_path).as_posix()
    except ValueError as exc: raise ValueError('Path resolves outside repository root: '+relative) from exc
    sensitive_keys={_path_key(x) for x in sensitive}
    is_sensitive=_path_key(relative) in sensitive_keys or _path_key(resolved_relative) in sensitive_keys
    is_private=_is_private_relative(relative) or _is_private_relative(resolved_relative)
    return resolved,relative,resolved_relative,is_sensitive,is_private

def validate_repo_path(root,value,*,for_read=False,sensitive=SENSITIVE):
    """Resolve a repository-relative path and enforce read restrictions before I/O."""
    resolved,relative,_,is_sensitive,is_private=_resolve_repo_path(root,value,sensitive)
    if for_read and is_sensitive: raise ValueError('Sensitive source may not be read: '+relative)
    if for_read and is_private: raise ValueError('Private source may not be read: '+relative)
    return resolved

def _curation_path_values(curation):
    metadata=[]; readable=[]
    for item in curation.get('versions',[]): metadata.extend(item.get('sources',[]))
    for item in curation.get('current_claims',[]): metadata.extend(item.get('sources',[]))
    for relation in curation.get('relations',[]):
        metadata.extend(relation.get(key) for key in ('new','old') if relation.get(key))
        if relation.get('evidence'): readable.append(relation['evidence'])
    for item in curation.get('additional_task_sources',[]):
        if item.get('source'): readable.append(item['source'])
    metadata.extend(curation.get('document_overrides',{}).keys())
    metadata.extend(curation.get('unresolved_contradictions',[]))
    return metadata,readable

def validate_curation_paths(root,curation):
    metadata,readable=_curation_path_values(curation)
    for value in metadata: validate_repo_path(root,value)
    for value in readable: validate_repo_path(root,value,for_read=True)

def _skip_inventory_path(rel,parts,generated):
    if any(x.startswith('.') for x in parts) or '__pycache__' in parts or _is_private_relative(rel): return True
    return rel in generated and rel not in STATIC_INPUTS

def slug(text):
    value=unicodedata.normalize('NFKD',text).encode('ascii','ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+','-',value).strip('-') or 'sem-nome'
def display(text, limit=None):
    value=re.sub(r'\s+',' ',str(text)).replace('·',',').replace('—',':').replace('–','-')
    value=value.replace('[[','(').replace(']]',')')
    return value if limit is None or len(value)<=limit else value[:limit-3]+'...'
def cells(line):
    parts=[]; token=[]; ticks=0; i=0
    line=line.strip().strip('|')
    while i<len(line):
        ch=line[i]
        if ch=='\\' and i+1<len(line): token.extend(line[i:i+2]); i+=2; continue
        if ch=='`':
            j=i
            while j<len(line) and line[j]=='`': j+=1
            size=j-i; ticks=0 if ticks==size else (size if ticks==0 else ticks)
            token.append(line[i:j]); i=j; continue
        if ch=='|' and not ticks: parts.append(''.join(token).strip()); token=[]
        else: token.append(ch)
        i+=1
    parts.append(''.join(token).strip())
    return parts

def clean(text): return re.sub(r'[*`_]','',text).strip()
def state_class(text):
    value=clean(text).casefold()
    if any(x in value for x in ('bloquead','aguarda')): return 'bloqueada_declarada'
    if any(x in value for x in ('não iniciado','nao iniciado','não tentado','aberta','pendente','elegível','proposta')): return 'planejada_declarada'
    if any(x in value for x in ('parcial','falta','até onde')): return 'parcial_declarada'
    if any(x in value for x in ('em curso','em andamento')): return 'em_andamento_declarada'
    if value.startswith(('feito','feita','verificado','implementado','corrigido','recebida')): return 'concluida_declarada'
    return 'nao_informado'

def stream_key(path):
    parts=Path(path).as_posix().split('/')
    if len(parts)>3 and parts[1]=='sdd': return '/'.join(parts[2:-1])
    return '/'.join(parts[1:-1]) or 'documentos-raiz'

def group_kind(title):
    for pattern,kind in ((r'^Fase\s+\d','fase'),(r'^M\d','milestone_nativo'),(r'^W\d','onda'),(r'^C\d','ciclo'),(r'^Objetivo\s+\d','objetivo')):
        if re.match(pattern,title,re.I): return kind
    return 'secao_sem_fase_atribuida'

def parse_tasks(path,text):
    stream=stream_key(path); groups={}; tasks=[]; heading='Tarefas sem fase explícita'; head_line=1; header=None; seen=set(); fence=False
    def group():
        key=stream+'::'+slug(heading)
        if key not in groups:
            groups[key]={'id':'grupo:'+key,'kind':'agrupamento','title':heading,'stream':stream,'native_kind':group_kind(heading),'source':path,'sources':[path],'line':head_line,'path':f'{BASE}/fases/{slug(stream)}--{slug(heading)}.md'}
        return groups[key]
    heading_titles={m[1]:m[2] for m in re.finditer(r'^###\s+([A-Za-z0-9.\-]+):\s*(.+)$',text,re.M)}
    for number,line in enumerate(text.splitlines(),1):
        if line.lstrip().startswith(('```','~~~')): fence=not fence; continue
        if fence: continue
        match=re.match(r'^##\s+(.+)$',line)
        if match:
            heading=match[1]; head_line=number; header=None
            if group_kind(heading)!='secao_sem_fase_atribuida': group()
            continue
        if not line.strip().startswith('|'): header=None; continue
        values=cells(line)
        lower=[clean(x).casefold() for x in values]
        if any(x in {'id','task','tarefa','fatia'} for x in lower) and not (values and ID.fullmatch(clean(values[0]))):
            if 'id' in lower or 'task' in lower or 'fatia' in lower or (lower[0]=='tarefa' and 'estado' in lower): header=lower
            continue
        if all(re.fullmatch(r':?-+:?',x.replace(' ','')) for x in values): continue
        if not header: continue
        if len(values)!=len(header): raise ValueError(f'Malformed task row {path}:{number}: {len(values)} != {len(header)}')
        record=dict(zip(header,values)); raw_id=clean(record.get('id',record.get('task',record.get('fatia',''))))
        if raw_id and not ID.fullmatch(raw_id): continue
        if not raw_id and header[0]!='tarefa': continue
        local=raw_id or 'item-'+sha(record['tarefa'].encode())[:12]
        if local in seen: raise ValueError(f'Duplicate task ID {path}:{number}: {local}')
        seen.add(local); parent=group(); declared=record.get('estado','nao_informado')
        title=heading_titles.get(raw_id) or record.get('resultado',record.get('tarefa',record.get('conteudo',record.get('condição de conclusão',raw_id))))
        dep=next((v for k,v in record.items() if k.startswith('dep')), '')
        task={'id':'tarefa:'+stream+'::'+local,'kind':'tarefa','stream':stream,'local_id':local,'original_id':raw_id or None,'title':display(clean(title),120),'parent':parent['id'],'native_parent_kind':parent['native_kind'],'source':path,'sources':[path],'line':number,'declared_state':declared,'declared_state_class':state_class(declared),'implementation_verified':False,'release_id':None,'dependency_tokens':re.findall(r'\b(?:T(?:\d|-[A-Z])|A\d|INT-)[A-Za-z0-9.\-]*',dep),'path':f'{BASE}/tarefas/{slug(stream)}--{slug(local)}.md'}
        tasks.append(task)
    return list(groups.values()),tasks

def parse_heading_tasks(path,text,allowed_ids):
    """Index explicitly selected delivery headings, not every hypothesis or requirement."""
    headings=list(re.finditer(r'^###\s+([EF]\d[A-Za-z]?)\.\s+(.+)$',text,re.M))
    selected=[m for m in headings if m[1] in allowed_ids]
    synthetic='## Fatias arquiteturais explicitamente identificadas\n| ID | Resultado | Estado |\n|---|---|---|\n'
    metadata={}
    for m in selected:
        line=text[:m.start()].count('\n')+1
        end=next((other.start() for other in headings if other.start()>m.start()),len(text))
        section=text[m.end():end]
        state=re.search(r'^Estado[^\n:]*:\s*(.+)$',section,re.M)
        declared=state[1].split('. ',1)[0] if state else 'nao_informado'
        synthetic+='| '+m[1]+' | '+m[2].replace('|','\\|')+' | '+declared.replace('|','\\|')+' |\n'
        metadata[m[1]]=(line,declared)
    groups,tasks=parse_tasks(path,synthetic)
    for g in groups:
        g['line']=text[:selected[0].start()].count('\n')+1 if selected else 1
        g['native_kind']='agrupamento_derivado_de_fatias'
    for t in tasks:
        t['line'],t['declared_state']=metadata[t['original_id']]
        t['native_parent_kind']='agrupamento_derivado_de_fatias'
    return groups,tasks

def inventory(root,generated,sensitive,previous):
    root=Path(root).resolve(); rows=[]
    for p in sorted((root/'docs').rglob('*')):
        rel=p.relative_to(root).as_posix(); parts=p.relative_to(root/'docs').parts
        if _skip_inventory_path(rel,parts,generated): continue
        try: resolved,relative,resolved_relative,is_sensitive,is_private=_resolve_repo_path(root,rel,sensitive)
        except ValueError: continue
        if is_sensitive:
            rows.append({'path':rel})
            continue
        if is_private or not resolved.is_file(): continue
        safe_source=validate_repo_path(root,rel,for_read=True,sensitive=sensitive)
        item={'path':rel,'extension':p.suffix.lower(),'area':('sdd/'+parts[1] if len(parts)>2 and parts[0]=='sdd' else (parts[0] if len(parts)>1 else 'documentos-raiz')),'bytes':safe_source.stat().st_size,'sha256':sha(safe_source.read_bytes()),'read_mode':'inventory_only','review_status':'nao_revisado_semanticamente'}
        old=previous.get(rel)
        if old:
            item['legacy_review']={k:old[k] for k in ('classification','last_reviewed','reason','current_sha256','read_mode') if k in old}
            item['changed_since_legacy_review']=item['sha256']!=old.get('current_sha256')
            item['review_status']='revisao_anterior_com_deriva' if item['changed_since_legacy_review'] else 'revisao_anterior_nao_revalidada'
        rows.append(item)
    return rows

def coverage_paths(root,generated,sensitive=SENSITIVE):
    """Independently enumerate expected paths without inventory() or source reads."""
    root=Path(root).resolve(); found=set()
    for candidate in sorted((root/'docs').rglob('*')):
        relative=candidate.relative_to(root).as_posix(); parts=candidate.relative_to(root/'docs').parts
        if _skip_inventory_path(relative,parts,generated): continue
        try: resolved,_,_,is_sensitive,is_private=_resolve_repo_path(root,relative,sensitive)
        except ValueError: continue
        if is_sensitive:
            found.add(relative)
        elif not is_private and resolved.is_file():
            found.add(relative)
    return found

def wiki(path,label=None):
    target=path.removeprefix('docs/').removesuffix('.md')
    return '[['+target+('|' + display(label) if label else '')+']]'
def relative_link(origin,target,label):
    rel=Path(os.path.relpath(target,Path(origin).parent)).as_posix().replace(' ','%20')
    return '['+display(label).replace('[','(').replace(']',')')+']('+rel+')'
def page(title,kind,sources,body,extra=None):
    fields={'title':display(title),'created':DATE,'updated':DATE,'type':kind,'tags':['documentacao','governanca'],'sources':sorted(set(sources)),'confidence':'medium'}
    fields.update(extra or {})
    front='---\n'+'\n'.join(k+': '+json.dumps(v,ensure_ascii=False) for k,v in fields.items())+'\n---\n\n'
    return front+'# '+display(title)+'\n\n'+body.rstrip()+'\n'

def compile_graph(root,rows,curation):
    root=Path(root).resolve(); validate_curation_paths(root,curation)
    normalized=[]
    for original in rows:
        _,path,_,is_sensitive,is_private=_resolve_repo_path(root,original.get('path'))
        if is_private: raise ValueError('Private inventory source refused: '+path)
        normalized.append({'path':path} if is_sensitive else dict(original))
    rows=normalized
    pages={}; nodes=[]; edges=[]; groups=[]; tasks=[]; bypath={r['path']:r for r in rows}; stream_sources=defaultdict(list)
    def edge(a,b,relation,**data): edges.append({'from':a,'to':b,'relation':relation,**data})
    for row in rows:
        path=row['path']; _,_,_,is_sensitive,_=_resolve_repo_path(root,path)
        override=curation.get('document_overrides',{}).get(path)
        if override and not is_sensitive: row['current_context']=override
        if is_sensitive:
            nodes.append({'id':'fonte:'+path,'kind':'fonte_sensivel','path':path,'title':'Fonte sensível (não aberta)','sources':[],'read_mode':'not_opened_sensitive'})
        else:
            nodes.append({'id':'fonte:'+path,'kind':'documento' if row['extension']=='.md' else 'artefato','path':path,'title':Path(path).name,'sources':[],'read_mode':row['read_mode']})
        if Path(path).name.lower()=='tasks.md' and not is_sensitive:
            source=validate_repo_path(root,path,for_read=True)
            gg,tt=parse_tasks(path,source.read_text(encoding='utf-8-sig')); groups+=gg; tasks+=tt
        if path.startswith('docs/sdd/'):
            stream_sources[stream_key(path) if Path(path).name.lower()=='tasks.md' else path.split('/')[2]].append(path)
    for extra in curation.get('additional_task_sources',[]):
        path=extra['source']
        if path not in bypath: raise ValueError('Additional task source unavailable: '+path)
        source=validate_repo_path(root,path,for_read=True)
        text=source.read_text(encoding='utf-8-sig')
        gg,tt=parse_heading_tasks(path,text,extra['ids']) if extra['mode']=='headings' else parse_tasks(path,text)
        groups+=gg; tasks+=tt
    for task in tasks:
        task['source_sha256']=bypath[task['source']].get('sha256'); edge(task['id'],task['parent'],'pertence_a'); edge(task['id'],'fonte:'+task['source'],'documentada_em',line=task['line'])
    task_ids={t['id'] for t in tasks}
    for task in tasks:
        for token in task['dependency_tokens']:
            target='tarefa:'+task['stream']+'::'+token
            if target in task_ids: edge(task['id'],target,'depende_de_declarado')
    unknown={'id':'release:nao-atribuida','kind':'release_nao_atribuida','title':'Trabalho sem release atribuída','path':f'{BASE}/marcos/sem-release-atribuida.md','sources':[r['path'] for r in rows if Path(r['path']).name.lower()=='tasks.md']}
    nodes.append(unknown)
    for v in curation.get('versions',[]):
        node={'id':'release:'+v['id'],'kind':'versao' if v.get('verified',True) else 'referencia_de_versao_nao_comprovada','title':v['id'],'path':f'{BASE}/marcos/{slug(v["id"])}.md','sources':v['sources'],'facts':v['facts']}; nodes.append(node)
        pages[node['path']]=page(v['id']+' | '+v['title'],'entity',v['sources'],'\n'.join('- '+display(x) for x in v['facts'])+'\n\nTarefas recentes não são atribuídas automaticamente a esta versão.\n\n'+wiki(HUB)+' | '+wiki(unknown['path'])+'\n\n'+ '\n'.join('- '+relative_link(node['path'],x,x) for x in v['sources']),{'entity_kind':node['kind'],'release_id':v['id'] if v.get('verified',True) else None})
    streams=sorted(set(stream_sources)|{t['stream'] for t in tasks}|{g['stream'] for g in groups})
    for stream in streams:
        sp=f'{BASE}/pacotes/{slug(stream)}.md'; sn='pacote:'+stream; src=sorted(set(stream_sources.get(stream,[])) | {t['source'] for t in tasks if t['stream']==stream})
        nodes.append({'id':sn,'kind':'pacote','title':stream,'path':sp,'sources':src,'release_id':None}); edge(sn,unknown['id'],'release_nao_atribuida')
        own=[g for g in groups if g['stream']==stream]
        body='Pacote documental, não uma release comprovada. O nome `v1` de um módulo não equivale a `v0.0.1` do produto.\n\n'
        body+=wiki(HUB)+' | '+wiki(unknown['path'])+'\n\n## Fases e agrupamentos originais\n\n'
        body+='\n'.join('- '+wiki(g['path'],g['title'])+f' ({g["native_kind"]})' for g in own) or 'Nenhum quadro canônico de tarefas foi localizado neste pacote; não foram inventadas fases.'
        body+='\n\n## Fontes do pacote\n\n'
        body+='\n'.join('- '+relative_link(sp,x,Path(x).name) for x in src[:40])
        if len(src)>40: body+='\n\nDemais fontes no '+wiki(f'{BASE}/catalogo/catalogo-de-fontes.md','catálogo completo')+'.'
        pages[sp]=page('Pacote: '+stream,'entity',src,body,{'entity_kind':'pacote','release_assignment':'nao_atribuida'})
    for g in groups:
        nodes.append(g); edge(g['id'],'pacote:'+g['stream'],'pertence_a'); edge(g['id'],'fonte:'+g['source'],'documentado_em',line=g['line'])
        own=[t for t in tasks if t['parent']==g['id']]
        body=f'Tipo original: `{g["native_kind"]}`. Release não atribuída. Estado de cada item é uma alegação da fonte, não verificação atual.\n\n'
        body+=wiki(f'{BASE}/pacotes/{slug(g["stream"])}.md','Pacote')+' | '+wiki(HUB)+'\n\n'
        body+=relative_link(g['path'],g['source'],'Fonte canônica')+f', linha {g["line"]}.\n\n## Tarefas\n\n'
        body+='\n'.join('- '+wiki(t['path'],(t['original_id'] or t['local_id'])+': '+t['title'])+' | '+t['declared_state_class'] for t in own) or 'Não há tarefas individualizadas neste cabeçalho. Consulte a fonte; nenhuma tarefa foi inventada.'
        pages[g['path']]=page(g['title'],'entity',g['sources'],body,{'entity_kind':g['native_kind'],'stream':g['stream']})
    for t in tasks:
        nodes.append(t)
        label=t['original_id'] or t['local_id']+' (ID só de navegação)'
        body=f'ID com namespace: `{t["stream"]}::{t["local_id"]}`.\n\n'
        body+='ID original: '+('`'+t['original_id']+'`.' if t['original_id'] else 'ausente. O identificador `item-*` foi criado apenas para navegação, não é ID histórico.')+'\n\n'
        body+='- Estado documental normalizado: `'+t['declared_state_class']+'`.\n- Implementação verificada nesta organização: **não**.\n- Release atribuída: **desconhecida**.\n\n'
        body+='Estado literal da fonte, preservado como dado:\n\n```text\n'+t['declared_state']+'\n```\n\n'
        body+=relative_link(t['path'],t['source'],'Abrir tarefa na fonte canônica')+f', linha {t["line"]}. O plano, os critérios, arquivos e evidências permanecem exclusivamente na fonte; esta página é um ponteiro.\n\n'
        body+=wiki(next(g['path'] for g in groups if g['id']==t['parent']),'Fase ou agrupamento original')+' | '+wiki(f'{BASE}/pacotes/{slug(t["stream"])}.md','Pacote')+'\n\n'
        resolved=[e['to'] for e in edges if e['from']==t['id'] and e['relation']=='depende_de_declarado']
        if resolved: body+='Dependências declaradas: '+', '.join(wiki(next(x['path'] for x in tasks if x['id']==target),target.split('::')[-1]) for target in resolved)+'.\n'
        pages[t['path']]=page(label+': '+t['title'],'entity',t['sources'],body,{'entity_kind':'tarefa','original_id':t['original_id'],'namespace':t['stream'],'implementation_verified':False,'release_assignment':'nao_atribuida'})
    extra_sources={s for v in curation.get('versions',[]) for s in v.get('sources',[])}
    extra_sources.update(s for claim in curation.get('current_claims',[]) for s in claim.get('sources',[]))
    extra_sources.update(relation[k] for relation in curation.get('relations',[]) for k in ('new','old','evidence'))
    for source in sorted(extra_sources-set(bypath)):
        _,source,_,is_sensitive,_=_resolve_repo_path(root,source)
        kind='fonte_sensivel' if is_sensitive else 'referencia_local_fora_do_corpus_docs'
        title='Fonte sensível (não aberta)' if is_sensitive else Path(source).name
        nodes.append({'id':'fonte:'+source,'kind':kind,'path':source,'title':title,'sources':[]})
    for relation in curation.get('relations',[]):
        edge('fonte:'+relation['new'],'fonte:'+relation['old'],relation['kind'],scope=relation['scope'],evidence=relation['evidence'],line=relation['line'])
    # Resolve document-to-document references without following external URLs or executing content.
    unresolved=[]
    for row in rows:
        path=row['path']; _,_,_,is_sensitive,_=_resolve_repo_path(root,path)
        if is_sensitive or Path(path).suffix.lower()!='.md': continue
        source=validate_repo_path(root,path,for_read=True)
        text=source.read_text(encoding='utf-8-sig',errors='replace')
        text=re.sub(r'(?ms)^```.*?^```\s*$','',text)
        for target in LINK.findall(text):
            target=target.strip().split('#',1)[0].split('?',1)[0]
            if not target or urlsplit(target).scheme or target.startswith('//'): continue
            p=(root/target) if target.startswith('docs/') else (root/path).parent/unquote(target)
            try: relative=p.resolve().relative_to(root.resolve()).as_posix()
            except ValueError: continue
            try: _,_,_,is_sensitive,is_private=_resolve_repo_path(root,relative)
            except ValueError:
                unresolved.append({'source':path,'target':target}); continue
            if relative in bypath: edge('fonte:'+path,'fonte:'+relative,'referencia_documental')
            elif not is_sensitive and not is_private and not p.exists(): unresolved.append({'source':path,'target':target})
    areas=defaultdict(list)
    for row in rows:
        _,_,_,is_sensitive,_=_resolve_repo_path(root,row['path'])
        areas['fontes-sensiveis' if is_sensitive else row['area']].append(row)
    catalog_pages=[]
    for area,items in sorted(areas.items()):
        for start in range(0,len(items),50):
            pp=f'{BASE}/catalogo/{slug(area)}-{start//50+1:02d}.md'; catalog_pages.append(pp)
            body=wiki(f'{BASE}/catalogo/catalogo-de-fontes.md','Catálogo')+' | '+wiki(HUB)+'\n\nInventário completo desta área; classificação antiga não é revalidação semântica atual.\n\n'
            for item in items[start:start+50]:
                _,_,_,is_sensitive,_=_resolve_repo_path(root,item['path'])
                state='fonte_sensivel_nao_lida' if is_sensitive else item.get('current_context',{}).get('classification',item['review_status'])
                body+='- '+relative_link(pp,item['path'],('Fonte sensível (conteúdo sensível não lido)' if is_sensitive else item['path'].removeprefix('docs/')))+' | '+state+'\n'
            pages[pp]=page('Fontes: '+area+f' ({start//50+1})','summary',[i['path'] for i in items[start:start+50]],body)
    ci=f'{BASE}/catalogo/catalogo-de-fontes.md'
    pages[ci]=page('Catálogo atual de fontes','summary',[],wiki(HUB)+' | '+wiki(STATE)+'\n\n'+f'{len(rows)} fontes inventariadas. '+str(sum(r.get('extension')=='.md' for r in rows))+' Markdown; demais são artefatos ou referências de conteúdo não lido. Configurações ocultas e derivados registrados ficam fora deste catálogo.\n\n'+'\n'.join('- '+wiki(p,Path(p).stem) for p in catalog_pages))
    pages[unknown['path']]=page('Trabalho sem release atribuída','entity',unknown['sources'],'Não há mapeamento documental comprovado das tarefas recentes para as versões do produto. Permanecem aqui sem inventar uma release nova. `v1`, `v2`, `rev-3` e hashes são rótulos locais até prova de vínculo a uma versão.\n\n'+wiki(HUB)+' | '+wiki(STATE)+'\n\n'+'\n'.join('- '+wiki(f'{BASE}/pacotes/{slug(s)}.md',s) for s in streams))
    versions=[n for n in nodes if n['kind'] in {'versao','referencia_de_versao_nao_comprovada'}]
    nodes.extend([{'id':'mapa:evolucao','kind':'mapa','path':HUB,'sources':[]},{'id':'mapa:atual','kind':'mapa','path':STATE,'sources':[]}])
    body='## Leitura em 30 segundos\n\n1. '+wiki(STATE,'O que existe hoje e o que ficou histórico')+'.\n2. Escolha uma versão comprovada ou o trabalho sem release atribuída.\n3. Abra o pacote, a fase/agrupamento original e a tarefa; a tarefa aponta à fonte exata.\n\n## Versões e milestones\n\n'
    body+='\n'.join('- '+wiki(n['path'],n['title']+(' (não comprovada)' if n['kind']=='referencia_de_versao_nao_comprovada' else '')) for n in versions+[unknown])
    body+='\n\n## Pacotes de trabalho\n\n'+'\n'.join('- '+wiki(f'{BASE}/pacotes/{slug(s)}.md',s) for s in streams)
    body+='\n\n## Busca e manutenção\n\n- '+wiki(ci,'Todos os arquivos, por área')+'.\n- IDs originais são preservados: `A0.1`, `T1.1`, `T00`, `INT-0.1`. Pesquise junto do pacote para evitar homônimos.\n- Grafo estruturado: '+relative_link(HUB,BASE+'/graph.json','graph.json')+'.\n- '+wiki(BASE+'/SPEC.md','Critérios desta organização')+'; '+wiki('docs/SCHEMA.md','schema')+'.\n- Estado é um retrato datado, não monitoramento. Nenhuma tarefa de produto foi executada por esta organização.\n'
    pages[HUB]=page('Evolução do projeto: versões, fases e tarefas','concept',[BASE+'/curation.json'],body)
    claims=curation.get('current_claims',[]); sources=sorted({x for claim in claims for x in claim['sources']})
    body='Retrato de 15 de outubro de 2026. Inspeção estática/documental, não verificação de runtime ou de retorno financeiro.\n\n'+wiki(HUB)+' | '+wiki(ci,'Catálogo completo')+'\n\n## Produto e limites atuais\n\n'
    for claim in claims:
        body+='- '+display(claim['text'])+' '+' '.join('^['+s+']' for s in claim['sources'])+'\n'
    body+='\n## Substituições explícitas e parciais\n\n'
    for rel in curation.get('relations',[]):
        body+='- '+relative_link(STATE,rel['new'],Path(rel['new']).name)+' '+display(rel['kind'])+' '+relative_link(STATE,rel['old'],rel['old'])+': '+display(rel['scope'])+f'. Evidência: `{rel["evidence"]}:{rel["line"]}`.\n'
    body+='\n## O que não foi resolvido artificialmente\n\n- Release das tarefas recentes permanece não atribuída.\n- As marcações "feito" e "não iniciado" das fontes não foram reescritas. Abertura de código, teste com fixture, recibo real e ganho medido são provas distintas.\n- O catálogo anterior de 2026-10-13 continua histórico. Sua validação tinha falhas antes desta organização; não foi rebaselinado para aparentar sucesso.\n- Uma fonte marcada como sensível só foi inventariada por caminho, sem leitura nem hash.\n\n## Fontes da síntese\n\n'+'\n'.join('- '+relative_link(STATE,s,s) for s in sources)
    pages[STATE]=page('Estado atual e documentos superados','concept',sources,body,{'contested':True,'contradictions':curation.get('unresolved_contradictions',[])})
    for n in nodes:
        if n.get('kind') in {'pacote','versao','release_nao_atribuida','referencia_de_versao_nao_comprovada'}: edge('mapa:evolucao',n['id'],'navega_para')
    edges=list({json.dumps(e,ensure_ascii=False,sort_keys=True):e for e in edges}.values())
    counts=dict(Counter(n['kind'] for n in nodes))
    graph={'format':'jev-documentary-graph-v1','captured_at':curation.get('captured_at',DATE),'head':curation.get('head'),'scope':'documentary_graph_not_runtime_or_release_certification','inventory':rows,'nodes':nodes,'edges':edges,'counts':counts,'unresolved_legacy_links':unresolved,'limits':['Task extraction covers dedicated tasks.md tables and explicitly curated delivery slices, not every inline task mention or hypothesis.','Inventory and legacy classifications are not a fresh semantic review of every source.','No release membership is inferred from package.json.']}
    return graph,pages

def validate(root,graph,pages):
    root=Path(root).resolve(); errors=[]; ids=[n['id'] for n in graph['nodes']]; idset=set(ids)
    def error(code,**data): errors.append({'code':code,**data})
    inventory_paths=[row['path'] for row in graph.get('inventory',[])]
    if len(inventory_paths)!=len(set(inventory_paths)): error('duplicate_inventory_paths')
    for row in graph.get('inventory',[]):
        path=row.get('path')
        try: _,relative,_,is_sensitive,is_private=_resolve_repo_path(root,path)
        except (ValueError,TypeError) as exc:
            error('inventory_path_invalid',path=path,reason=str(exc)); continue
        if is_sensitive:
            if row!={'path':relative}: error('sensitive_inventory_not_path_only',path=relative)
            continue
        if is_private:
            error('inventory_path_private',path=relative); continue
        source=validate_repo_path(root,relative,for_read=row.get('sha256') is not None)
        if not source.is_file(): error('inventory_source_missing',path=relative)
        elif row.get('sha256') is not None and sha(source.read_bytes())!=row['sha256']: error('source_drift',path=relative)
    registry=validate_repo_path(root,'docs/_meta/generated-files.json')
    if registry.is_file():
        registry=validate_repo_path(root,'docs/_meta/generated-files.json',for_read=True)
        declared=set(json.loads(registry.read_text(encoding='utf-8'))['files'])|set(pages)
        outputs=validate_repo_path(root,BASE+'/outputs.json')
        if outputs.is_file():
            outputs=validate_repo_path(root,BASE+'/outputs.json',for_read=True)
            declared.update(json.loads(outputs.read_text(encoding='utf-8')).get('files',{}))
        actual=coverage_paths(root,declared)
        if actual!=set(inventory_paths): error('inventory_coverage',missing=sorted(actual-set(inventory_paths)),extra=sorted(set(inventory_paths)-actual))
    if len(ids)!=len(idset): error('duplicate_node_ids')
    paths=[n.get('path') for n in graph['nodes'] if n.get('path')]
    generated_paths=[p for p in paths if p.startswith(BASE+'/') or p in (HUB,STATE)]
    if len(generated_paths)!=len(set(generated_paths)): error('duplicate_generated_paths')
    for node in graph['nodes']:
        for source in node.get('sources',[]):
            try: resolved=validate_repo_path(root,source)
            except (ValueError,TypeError) as exc:
                error('source_path_invalid',node=node['id'],source=source,reason=str(exc)); continue
            _,_,_,is_sensitive,is_private=_resolve_repo_path(root,source)
            if is_private: error('source_path_private',node=node['id'],source=source)
            elif not is_sensitive and not resolved.is_file() and source not in pages: error('source_missing',node=node['id'],source=source)
        if node['kind']=='tarefa':
            if node.get('parent') not in idset: error('task_without_parent',node=node['id'])
            if node.get('implementation_verified') is not False: error('unproved_implementation',node=node['id'])
    for e in graph['edges']:
        if e['from'] not in idset or e['to'] not in idset: error('edge_endpoint_missing',edge=e)
        if e['relation'].startswith('substitui') and (not e.get('scope') or not e.get('evidence') or not e.get('line')): error('supersession_without_scope',edge=e)
        if e.get('evidence'):
            try: source=validate_repo_path(root,e['evidence'],for_read=True)
            except (ValueError,TypeError) as exc:
                error('relation_evidence_path_invalid',edge=e,reason=str(exc)); continue
            if not source.is_file(): error('relation_evidence_missing',edge=e)
            elif e.get('line',0)<1 or e['line']>len(source.read_text(encoding='utf-8-sig').splitlines()): error('relation_line_invalid',edge=e)
    targets={p.removeprefix('docs/').removesuffix('.md') for p in pages}
    output_destinations=set()
    for output in [*pages,BASE+'/graph.json',BASE+'/verification.json']:
        try: output_destinations.add(validate_repo_path(root,output))
        except (ValueError,TypeError): pass
    outbound=Counter(); inbound=Counter()
    for path,text in pages.items():
        match=re.match(r'\A---\n(.*?)\n---\n',text,re.S)
        fields={}
        if match:
            try: fields={line.split(': ',1)[0]:json.loads(line.split(': ',1)[1]) for line in match[1].splitlines()}
            except (ValueError,IndexError): error('frontmatter_invalid',path=path)
        required={'title','created','updated','type','tags','sources','confidence'}
        if required-set(fields): error('frontmatter_missing',path=path,fields=sorted(required-set(fields)))
        for source in fields.get('sources',[]):
            try: resolved=validate_repo_path(root,source)
            except (ValueError,TypeError) as exc:
                error('source_path_invalid',path=path,source=source,reason=str(exc)); continue
            _,_,_,is_sensitive,is_private=_resolve_repo_path(root,source)
            if is_private: error('source_path_private',path=path,source=source)
            elif not is_sensitive and not resolved.is_file() and source not in pages: error('source_missing',path=path,source=source)
        try: dest=validate_repo_path(root,path)
        except (ValueError,TypeError):
            error('output_outside_scope',path=path); continue
        if not (path.startswith(BASE+'/') or path in (HUB,STATE)): error('output_outside_scope',path=path)
        if len(text.splitlines())>200: error('page_too_large',path=path)
        body=re.sub(r'(?ms)^```.*?^```\s*$','',text)
        unique=set()
        for raw in WIKI.findall(body):
            target=raw.split('|',1)[0].split('#',1)[0]
            if target not in targets:
                try: candidate=validate_repo_path(root,'docs/'+target+'.md')
                except (ValueError,TypeError): error('broken_wikilink',path=path,target=target)
                else:
                    _,_,_,is_sensitive,is_private=_resolve_repo_path(root,'docs/'+target+'.md')
                    if is_private or (not is_sensitive and not candidate.is_file()): error('broken_wikilink',path=path,target=target)
            if target in targets and target!=path.removeprefix('docs/').removesuffix('.md'): unique.add(target); inbound[target]+=1
        outbound[path]=len(unique)
        if outbound[path]<2: error('insufficient_links',path=path)
        for raw in LINK.findall(body):
            target=raw.split('#',1)[0].split('?',1)[0]
            if not target or urlsplit(target).scheme or target.startswith('//'): continue
            resolved=(root/path).parent/unquote(target)
            try:
                target_path=resolved.resolve(strict=False)
                relative=target_path.relative_to(root).as_posix()
                _,_,_,is_sensitive,is_private=_resolve_repo_path(root,relative)
            except (OSError,RuntimeError,ValueError):
                error('broken_markdown_link',path=path,target=target); continue
            if is_private: error('broken_markdown_link',path=path,target=target)
            elif not is_sensitive and not target_path.exists() and target_path not in output_destinations:
                error('broken_markdown_link',path=path,target=target)
    for path in pages:
        if not inbound[path.removeprefix('docs/').removesuffix('.md')]: error('orphan_generated_page',path=path)
    return {'format':'jev-evolution-verification-v1','ok':not errors,'counts':graph.get('counts',{}),'sources':len(graph.get('inventory',[])),'pages':len(pages),'edges':len(graph['edges']),'errors':errors,'limits':graph.get('limits',[])}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[3])
    parser.add_argument('--write',action='store_true')
    args=parser.parse_args(); root=args.root.resolve()
    generated=set(json.loads((root/'docs/_meta/generated-files.json').read_text(encoding='utf-8'))['files'])
    prior_outputs=root/BASE/'outputs.json'
    if prior_outputs.is_file(): generated.update(json.loads(prior_outputs.read_text(encoding='utf-8'))['files'])
    previous={x['path']:x for x in json.loads((root/'docs/_meta/document-status.json').read_text(encoding='utf-8'))['files']}
    curation=json.loads((root/BASE/'curation.json').read_text(encoding='utf-8'))
    validate_curation_paths(root,curation)
    rows=inventory(root,generated,SENSITIVE,previous)
    graph,pages=compile_graph(root,rows,curation); report=validate(root,graph,pages)
    if args.write and not report['ok']: print(json.dumps(report,ensure_ascii=False,indent=2)); return 1
    if args.write:
        prior_path=root/BASE/'outputs.json'; prior=json.loads(prior_path.read_text(encoding='utf-8')) if prior_path.is_file() else {'files':{}}
        outputs=dict(pages)
        outputs[BASE+'/graph.json']=json.dumps(graph,ensure_ascii=False,indent=2)+'\n'
        outputs[BASE+'/verification.json']=json.dumps(report,ensure_ascii=False,indent=2)+'\n'
        for path,content in outputs.items():
            dest=root/path
            if dest.exists() and (path not in prior['files'] or sha(dest.read_bytes())!=prior['files'][path]):
                raise ValueError('Refusing to overwrite unowned or concurrently changed output: '+path)
        for path,content in outputs.items():
            dest=root/path; dest.parent.mkdir(parents=True,exist_ok=True); dest.write_text(content,encoding='utf-8',newline='\n')
        prior_path.write_text(json.dumps({'format':'jev-evolution-outputs-v1','files':{p:sha((root/p).read_bytes()) for p in outputs}},ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps(report,ensure_ascii=False,indent=2)); return 0 if report['ok'] else 1

if __name__=='__main__': raise SystemExit(main())
