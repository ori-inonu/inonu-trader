// Document integrity only. This does not exercise product behavior or certify UI, trading or performance.
import { readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
const plan=resolve(process.argv[2]??dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1')));
const repo=resolve(process.argv[3]??'C:/Users/gabri/jev-trader');
const errors=[]; let checkedLinks=0;
const req=await Bun.file(join(plan,'requirements.md')).text();
const tasks=await Bun.file(join(plan,'tasks.md')).text();
const requirementIds=[...req.matchAll(/^\| (R\d{2}) \|/gm)].map(m=>m[1]);
const taskRows=[...tasks.matchAll(/^\| (T\d{2}) \|([^\n]+)$/gm)];
const taskIds=taskRows.map(m=>m[1]);
for(let n=1;n<=20;n++) if(requirementIds.filter(x=>x===`R${String(n).padStart(2,'0')}`).length!==1) errors.push(`Requirement R${n} missing/duplicate`);
for(let n=0;n<=11;n++) if(taskIds.filter(x=>x===`T${String(n).padStart(2,'0')}`).length!==1) errors.push(`Task T${n} missing/duplicate`);
const mapped=new Set(taskRows.flatMap(m=>m[2].split('|')[1].match(/R\d{2}/g)??[]));
for(const id of requirementIds) if(!mapped.has(id)) errors.push(`${id} not mapped to a task`);
for(const id of mapped) if(!requirementIds.includes(id)) errors.push(`Unknown requirement ${id}`);
for(const row of taskRows) for(const id of row[2].split('|')[2].match(/T\d{2}/g)??[]) if(!taskIds.includes(id)) errors.push(`Unknown dependency ${id}`);
for(const f of await readdir(plan)) if(f.endsWith('.md')) {
 const s=await Bun.file(join(plan,f)).text();
 for(const m of s.matchAll(/\]\(([^)]+)\)/g)) {
  const target=m[1].replace(/^<|>$/g,'').split('#')[0];
  if(!target||/^https?:|^codex:/.test(target)) continue;
  let path=resolve(plan,target);
  if(target.startsWith('../')) path=resolve(repo,'docs/sdd/frontend-ux-20261013',target);
  checkedLinks++;
  if(!await Bun.file(path).exists()) errors.push(`${f}: missing link ${target}`);
 }
}
const inventory=await Bun.file(join(plan,'inventory.json')).json();
if(inventory.count!==inventory.files.length) errors.push('Inventory count mismatch');
if(inventory.markdown!==inventory.files.filter(f=>f.path.endsWith('.md')).length) errors.push('Markdown count mismatch');
for(const f of [...inventory.files,...inventory.frontendSources]) if(!/^[a-f0-9]{64}$/.test(f.sha256)) errors.push(`Invalid source hash ${f.path}`);
const decisions=await Bun.file(join(plan,'decisions.json')).json();
if(decisions.status!=='assessed'||decisions.authority!=='advisory_only'||decisions.human_response!==false||decisions.cost_usd!==null||decisions.decision_source!=='jev'||decisions.transport?.validatedResponse!==true) errors.push('Decision receipt invalid');
const acceptance=new Bun.CryptoHasher('sha256').update(await Bun.file(join(plan,'acceptance.md')).arrayBuffer()).digest('hex');
if(acceptance!=='96df61f77df70ada8b47f7c4cdeaabe8cb3b03709a15299f923e7aeec6e4a88f') errors.push('Frozen acceptance changed');
const result={status:errors.length?'failed':'passed',observedAt:new Date().toISOString(),scope:'Document integrity only; no product tests, build, wallet operations or performance measurement',requirements:requirementIds.length,tasks:taskIds.length,mappedRequirements:mapped.size,checkedLinks,inventoryFiles:inventory.count,sourceFiles:inventory.frontendSources.length,acceptanceSha256:acceptance,errors};
console.log(JSON.stringify(result,null,2));
if(errors.length) process.exitCode=1;
