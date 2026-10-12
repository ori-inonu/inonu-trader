import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const BASE = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PW='C:/Users/gabri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const require=createRequire(import.meta.url);
const {chromium}=require(PW);
const build=resolve(process.argv[2]);
const out=join(BASE,'evidence','mounted-browser-'+randomUUID());
await mkdir(out);
const report={playwrightVersion:require(PW+'/package.json').version,checks:[],requests:[],deniedRoutes:[],pageErrors:[],console:[],build,executionQualified:false};
const assert=(label,actual,expected)=>{const pass=JSON.stringify(actual)===JSON.stringify(expected);report.checks.push({label,actual,expected,pass});if(!pass)throw new Error('Assertion: '+label+' actual='+JSON.stringify(actual)+' expected='+JSON.stringify(expected));};
let browser;
try {
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,timeout:15000,args:['--disable-background-networking','--disable-extensions','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND']});
  report.browserVersion=browser.version();
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1100,height:1000}});
  await context.route('**/*',async route=>{report.deniedRoutes.push({url:route.request().url(),method:route.request().method()});await route.abort('blockedbyclient');});
  await context.routeWebSocket('**/*',ws=>{report.deniedRoutes.push({url:ws.url(),type:'websocket'});ws.close();});
  const page=await context.newPage();page.setDefaultTimeout(5000);
  page.on('request',r=>report.requests.push({url:r.url(),method:r.method()}));
  page.on('pageerror',e=>report.pageErrors.push({name:e.name,message:e.message,stack:e.stack}));
  page.on('console',m=>report.console.push({type:m.type(),text:m.text()}));
  await page.setContent('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body><div id="mount"></div></body></html>');
  await page.evaluate(() => {
    let clock=1800000000000, visibility='visible', account='0x2222222222222222222222222222222222222222',chainId='0xc4', nextId=1, providerId=0;
    const calls=[],pending=[],intervals=new Map(),lifecycle=new Map(),providers=[],network=[];
    const track=(surface)=>{const add=surface.addEventListener.bind(surface),remove=surface.removeEventListener.bind(surface);surface.addEventListener=function(type,listener,options){if(['resume','pageshow','visibilitychange','focus','eip6963:announceProvider'].includes(type)){if(!lifecycle.has(type))lifecycle.set(type,new Set());lifecycle.get(type).add(listener);}return add(type,listener,options);};surface.removeEventListener=function(type,listener,options){lifecycle.get(type)?.delete(listener);return remove(type,listener,options);};};
    track(window);track(document);
    window.setInterval=function(callback,delay,...args){const id=nextId++;intervals.set(id,{delay,callback:()=>callback(...args)});return id;};window.clearInterval=id=>intervals.delete(id);
    Date.now=()=>clock;Object.defineProperty(document,'visibilityState',{get:()=>visibility,configurable:true});
    window.fetch=(...args)=>{network.push({method:'fetch',url:String(args[0])});return Promise.reject(new Error('probe network denied'));};
    window.WebSocket=class{constructor(url){network.push({method:'WebSocket',url:String(url)});throw new Error('probe network denied');}};
    window.XMLHttpRequest=class{open(method,url){network.push({method:'XHR',url:String(url)});throw new Error('probe network denied');}};
    let holdAt=0,readIndex=0;
    const createProvider=()=>{const listeners=new Map(),id=++providerId;const provider={async request(args){calls.push({provider:id,...JSON.parse(JSON.stringify(args))});
      if(holdAt>0&&['eth_accounts','eth_chainId'].includes(args.method)&&++readIndex===holdAt)await new Promise(resolve=>pending.push(resolve));
      switch(args.method){case'eth_requestAccounts':case'eth_accounts':return[account];case'eth_chainId':return chainId;case'eth_blockNumber':return'0x2a';case'eth_getBalance':return'0x0';case'eth_call':return'0x'+'0'.repeat(64);default:throw new Error('Unexpected financial/permission method: '+args.method);}
    },on(event,listener){if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event).add(listener);},removeListener(event,listener){listeners.get(event)?.delete(listener);}};providers.push({provider,listeners,id});return provider;};
    let current=createProvider();
    const emit=(event,payload)=>{for(const callback of [...(providers.at(-1).listeners.get(event)??[])])callback(payload);};
    window.fakeReview={attach(replace=false){if(replace)current=createProvider();window.okxwallet=current;window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:'isolated-'+providerId,name:'OKX fake',icon:'',rdns:'com.okx.wallet'},provider:current}}));},
      account(next){account=next;emit('accountsChanged',[next]);},chain(next){chainId=next;emit('chainChanged',next);},disconnect(){emit('disconnect',{code:4900,message:'fake private message'});},
      setClock(value){clock=value;},advance(delta){clock+=delta;},setVisibility(next){visibility=next;},
      hold(index){holdAt=index;readIndex=0;},release(){holdAt=0;for(const resolve of pending.splice(0))resolve();},
      tick(){for(const entry of [...intervals.values()])entry.callback();},
      stats(){return{clock,visibility,calls:structuredClone(calls),pending:pending.length,intervals:[...intervals.values()].map(x=>x.delay),listeners:Object.fromEntries([...lifecycle].map(([k,v])=>[k,v.size])),providerListeners:providers.map(x=>({id:x.id,count:[...x.listeners.values()].reduce((n,s)=>n+s.size,0)})),network:structuredClone(network)};}};
  });
  await page.addStyleTag({content:await readFile(join(build,'review.css'),'utf8')});
  await page.addScriptTag({content:await readFile(join(build,'review.js'),'utf8')});
  await page.evaluate(()=>window.mountedReview.mount());
  assert('real panel mounts new manual review section',await page.getByRole('heading',{name:'Revisar proposta'}).count(),1);
  assert('empty manual input',await page.getByLabel('Proposta em JSON').inputValue(),'');
  assert('disconnected conference disabled',await page.getByRole('button',{name:'Conferir na carteira'}).isDisabled(),true);
  await page.waitForFunction(()=>window.mountedReview.wallet()?.ready);
  assert('real public hook exposes readonly preflight',await page.evaluate(()=>typeof window.mountedReview.wallet().preflightTransaction),'function');
  assert('hook without session blocks without RPC',await page.evaluate(async()=>({result:await window.mountedReview.wallet().preflightTransaction({}),calls:window.fakeReview.stats().calls})),{result:{status:'blocked',reason:'session_unavailable',executionQualified:false},calls:[]});
  await page.evaluate(()=>window.fakeReview.attach());
  await page.getByRole('button',{name:'Conectar OKX',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-review-status]')&& ![...document.querySelectorAll('button')].find(x=>x.textContent==='Conferir na carteira').disabled);
  const proposal={version:1,planId:'<img src=x onerror="window.attack=1">',quoteHash:'unverified-quote',chainId:'0xc4',from:'0x2222222222222222222222222222222222222222',to:'0x3333333333333333333333333333333333333333',data:'0xABCD',valueAtomic:'9007199254740993',gasLimitAtomic:'21000',maxFeePerGasAtomic:'2',maxPriorityFeePerGasAtomic:'1',createdAtMs:1799999999900,expiresAtMs:1800000005000};
  const before=await page.evaluate(()=>window.fakeReview.stats().calls.length);
  await page.getByLabel('Proposta em JSON').fill(JSON.stringify(proposal));
  assert('typing does not call provider',await page.evaluate(()=>window.fakeReview.stats().calls.length),before);
  await page.getByRole('button',{name:'Conferir na carteira'}).click();
  await page.waitForFunction(()=>document.querySelector('[data-review-status]').dataset.reviewStatus==='ready_for_review');
  assert('conference calls exact four readonly methods',await page.evaluate(i=>window.fakeReview.stats().calls.slice(i).map(x=>x.method),before),['eth_accounts','eth_chainId','eth_accounts','eth_chainId']);
  assert('integer preserved above safe number',await page.locator('[data-review-status]').innerText().then(x=>x.includes('9007199254740993')),true);
  assert('exact atomic gas ceiling',await page.locator('[data-review-status] dd').allTextContents().then(x=>x.includes('42000')),true);
  assert('captured normalized full calldata',await page.locator('[data-review-status] pre').textContent(),'0xabcd');
  assert('HTML-like valid label stays text',await page.locator('[data-review-status] img, [data-review-status] script, [data-review-status] a').count(),0);
  assert('execution remains false',await page.locator('[data-review-status]').getAttribute('data-execution-qualified'),'false');
  report.dom=await page.locator('#mount').innerHTML();
  report.reactVersion=await page.evaluate(()=>window.mountedReview.reactVersion);
  const NOW=1800000000000;
  const restart=async(strict=false)=>{
    await page.evaluate(({now,strict})=>{window.mountedReview.unmount();window.fakeReview.release();window.fakeReview.setClock(now);window.fakeReview.setVisibility('visible');window.fakeReview.account('0x2222222222222222222222222222222222222222');window.fakeReview.chain('0xc4');window.fakeReview.attach(true);window.mountedReview.mount(strict);},{now:NOW,strict});
    await page.getByRole('button',{name:'Conectar OKX',exact:true}).click();
    await page.waitForFunction(()=>![...document.querySelectorAll('button')].find(x=>x.textContent==='Conferir na carteira').disabled);
  };
  const qualify=async(overrides={})=>{
    const start=await page.evaluate(()=>window.fakeReview.stats().calls.length);
    await page.getByLabel('Proposta em JSON').fill(JSON.stringify({...proposal,...overrides}));
    await page.getByRole('button',{name:'Conferir na carteira'}).click();
    await page.waitForFunction(()=>document.querySelector('[data-review-status]').dataset.reviewStatus==='ready_for_review');
    assert('eligible conference never adds other RPC',await page.evaluate(i=>window.fakeReview.stats().calls.slice(i).map(x=>x.method),start),['eth_accounts','eth_chainId','eth_accounts','eth_chainId']);
  };
  report.lifecycleCases=[];
  for(const event of ['resume','pageshow','visibilitychange','focus']){
    await restart();await qualify();
    const state=await page.evaluate(event=>{
      const before=window.fakeReview.stats().calls.length;
      window.fakeReview.setVisibility('hidden');document.dispatchEvent(new Event('visibilitychange'));
      window.fakeReview.advance(5000);
      const hiddenStatus=document.querySelector('[data-review-status]').dataset.reviewStatus;
      if(event==='visibilitychange')window.fakeReview.setVisibility('visible');
      (event==='resume'||event==='visibilitychange'?document:window).dispatchEvent(new Event(event));
      return{hiddenStatus,status:document.querySelector('[data-review-status]').dataset.reviewStatus,text:document.querySelector('[data-review-status] [role=status]').textContent,callsDelta:window.fakeReview.stats().calls.length-before,execution:document.querySelector('[data-review-status]').dataset.executionQualified};
    },event);
    report.lifecycleCases.push({event,...state});
    assert(event+' retains hidden result without ticks',state.hiddenStatus,'ready_for_review');
    assert(event+' synchronously removes expired result before next action',state.status,'blocked');
    assert(event+' shows expired Portuguese message',state.text,'A validade da proposta terminou. Informe uma proposta atual.');
    assert(event+' never automatically calls provider',state.callsDelta,0);
    assert(event+' execution remains false',state.execution,'false');
  }
  for(const invalid of ['NaN','Infinity','negative','fractional','regressed']){
    await restart();await qualify();
    const state=await page.evaluate(({invalid,now})=>{const before=window.fakeReview.stats().calls.length;const values={NaN:NaN,Infinity:Infinity,negative:-1,fractional:now+.5,regressed:now-1};window.fakeReview.setClock(values[invalid]);window.dispatchEvent(new Event('focus'));return{status:document.querySelector('[data-review-status]').dataset.reviewStatus,text:document.querySelector('[data-review-status] [role=status]').textContent,callsDelta:window.fakeReview.stats().calls.length-before};},{invalid,now:NOW});
    assert(invalid+' clock blocks synchronously',state.status,'blocked');
    assert(invalid+' clock message',state.text,invalid==='regressed'?'O relógio recuou. A conferência foi invalidada.':'Não foi possível validar o relógio desta sessão.');
    assert(invalid+' clock gate is readonly without RPC',state.callsDelta,0);
  }
  await restart();await qualify({expiresAtMs:NOW+2147483648+5000});
  assert('long TTL preserves balance timer and adds finite review timer',await page.evaluate(()=>window.fakeReview.stats().intervals),[1000,1000]);
  const foreground=await page.evaluate(()=>{window.fakeReview.advance(2147483648+5000);const before=window.fakeReview.stats().calls.length;window.fakeReview.tick();return{status:document.querySelector('[data-review-status]').dataset.reviewStatus,callsDelta:window.fakeReview.stats().calls.length-before};});
  assert('foreground first opportunity expires long TTL',foreground.status,'blocked');assert('foreground clock check does not call provider',foreground.callsDelta,0);
  report.identityCases=[];
  for(const change of ['accountABA','networkABA','providerReplacement','disconnect']){
    await restart();await qualify();
    const state=await page.evaluate(change=>{
      const before=window.mountedReview.wallet().getSessionToken();
      if(change==='accountABA'){window.fakeReview.account('0x4444444444444444444444444444444444444444');window.fakeReview.account('0x2222222222222222222222222222222222222222');}
      if(change==='networkABA'){window.fakeReview.chain('0x8f');window.fakeReview.chain('0xc4');}
      if(change==='providerReplacement')window.fakeReview.attach(true);
      if(change==='disconnect')window.fakeReview.disconnect();
      return{before,after:window.mountedReview.wallet().getSessionToken(),status:document.querySelector('[data-review-status]').dataset.reviewStatus,capturedCount:document.querySelectorAll('[data-review-status] dl').length};
    },change);
    report.identityCases.push({change,...state});
    assert(change+' invalidates before React batch flush',state.status,'blocked');
    assert(change+' monotonic generation advances',state.after>state.before,true);
    assert(change+' removes captured proposal immediately',state.capturedCount,0);
  }
  await restart();await qualify();
  const refresh=await page.evaluate(()=>{const button=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Atualizar saldo');button.click();return document.querySelector('[data-review-status]').dataset.reviewStatus;});
  assert('existing refresh action invalidates before delegation',refresh,'blocked');
  await restart();
  await page.evaluate(()=>window.fakeReview.hold(1));
  await page.getByLabel('Proposta em JSON').fill(JSON.stringify(proposal));await page.getByRole('button',{name:'Conferir na carteira'}).click();
  await page.waitForFunction(()=>window.fakeReview.stats().pending===1);
  const pendingHidden=await page.evaluate(()=>{const before=window.fakeReview.stats().calls.length;window.fakeReview.setVisibility('hidden');window.fakeReview.advance(5000);document.dispatchEvent(new Event('resume'));return{status:document.querySelector('[data-review-status]').dataset.reviewStatus,callsDelta:window.fakeReview.stats().calls.length-before};});
  assert('pending result expires hidden before receipt returns',pendingHidden.status,'blocked');assert('pending resume adds no RPC',pendingHidden.callsDelta,0);
  await page.evaluate(()=>window.fakeReview.release());await page.waitForTimeout(20);
  assert('late expired response cannot restore ready',await page.locator('[data-review-status]').getAttribute('data-review-status'),'blocked');
  for(const action of ['edit','clear','duplicate','unmount']){
    await restart();await page.evaluate(()=>window.fakeReview.hold(1));
    await page.getByLabel('Proposta em JSON').fill(JSON.stringify(proposal));await page.getByRole('button',{name:'Conferir na carteira'}).click();await page.waitForFunction(()=>window.fakeReview.stats().pending===1);
    if(action==='edit')await page.getByLabel('Proposta em JSON').fill('{}');
    if(action==='clear')await page.getByRole('button',{name:'Limpar',exact:true}).click();
    if(action==='duplicate'){
      const before=await page.evaluate(()=>window.fakeReview.stats().calls.length);
      await page.evaluate(()=>[...document.querySelectorAll('button')].find(x=>x.textContent==='Conferir na carteira').click());
      assert('pending duplicate disabled and no extra read',await page.evaluate(()=>window.fakeReview.stats().calls.length),before);
    }
    if(action==='unmount')await page.evaluate(()=>window.mountedReview.unmount());
    await page.evaluate(()=>window.fakeReview.release());await page.waitForTimeout(20);
    assert('pending '+action+' never restores stale result',await page.evaluate(()=>document.querySelector('[data-review-status]')?.dataset.reviewStatus??'unmounted'),{edit:'edited',clear:'empty',duplicate:'ready_for_review',unmount:'unmounted'}[action]);
  }
  await restart(true);await qualify();
  assert('strict mode preserves actual mounting and conference',await page.locator('[data-review-status]').getAttribute('data-review-status'),'ready_for_review');
  await page.getByLabel('Proposta em JSON').focus();await page.keyboard.press('Tab');
  assert('keyboard reaches conference',await page.evaluate(()=>document.activeElement.textContent),'Conferir na carteira');
  await page.keyboard.press('Tab');assert('keyboard reaches clear',await page.evaluate(()=>document.activeElement.textContent),'Limpar');
  await page.keyboard.press('Tab');assert('keyboard reaches calldata details',await page.evaluate(()=>document.activeElement.tagName),'SUMMARY');
  await page.keyboard.press('Enter');assert('keyboard expands full calldata',await page.locator('[data-review-status] details').getAttribute('open'),'');
  await page.evaluate(()=>window.mountedReview.unmount());
  report.finalStats=await page.evaluate(()=>window.fakeReview.stats());
  assert('all review intervals cleaned',report.finalStats.intervals,[]);
  assert('all lifecycle and discovery listeners cleaned',Object.values(report.finalStats.listeners).every(x=>x===0),true);
  assert('all fake provider listeners cleaned including replaced providers',report.finalStats.providerListeners.every(x=>x.count===0),true);
  assert('no external fetch/XHR/WebSocket attempt',report.finalStats.network,[]);
  assert('no browser page network request',report.requests,[]);
  assert('no page errors',report.pageErrors,[]);
  assert('no console logs of proposal or private exception',report.console,[]);
} catch(error) { report.error={name:error.name,message:error.message,stack:error.stack};process.exitCode=1; }
finally { await browser?.close();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({reportPath:join(out,'report.json'),checks:report.checks.length,failed:report.checks.filter(x=>!x.pass),error:report.error??null})); }
