import { chromium } from 'file:///C:/Users/gabri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
const base='C:/Users/gabri/.codex/visualizations/2026/10/13/01a135ff-362e-7cf0-ac4f-ef678d322188';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const observations=[];
const assert=(x,message)=>{if(!x)throw Error(message);};
try {
 for(const [width,height] of [[1440,900],[390,844]]) {
  const page=await browser.newPage({viewport:{width,height}});
  const errors=[];page.on('pageerror',x=>errors.push(x.message));
  await page.goto('http://127.0.0.1:3017',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(2500);
  if(width>820) {
   const asset=page.getByRole('list',{name:'Lista de ativos'}).getByRole('button',{name:/^ETH\s/}).first();
   await asset.click();
   await page.waitForFunction(el=>el.getAttribute('aria-current')==='true',await asset.elementHandle());
  }
  const intervals=page.getByRole('group',{name:'Intervalo das velas'});
  const five=intervals.getByRole('button',{name:'5m',exact:true});
  await five.click();await page.waitForFunction(el=>el.getAttribute('aria-pressed')==='true',await five.elementHandle());
  const types=page.getByRole('group',{name:'Tipo do grafico'});
  const line=types.getByRole('button',{name:'Linha',exact:true});
  await line.click();await page.waitForFunction(el=>el.getAttribute('aria-pressed')==='true',await line.elementHandle());
  const indicators=page.getByRole('button',{name:'Indicadores',exact:true});
  await indicators.click();
  const ema=page.getByRole('dialog',{name:'Indicadores'}).getByRole('checkbox').first();
  const original=await ema.isChecked();
  await ema.setChecked(!original);
  const dialog=page.getByRole('dialog',{name:'Indicadores'});
  const lastLayer=dialog.getByRole('checkbox').last();
  const lastOriginal=await lastLayer.isChecked();
  await lastLayer.setChecked(!lastOriginal);
  const menuGeometry=await lastLayer.evaluate(x=>{
   const menu=x.closest('[role="dialog"]'), panel=x.closest('section[data-feed]');
   const box=y=>{const r=y.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
   const r=x.getBoundingClientRect(), hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
   return {checkbox:box(x),menu:box(menu),panel:box(panel),scrollTop:menu.scrollTop,scrollHeight:menu.scrollHeight,clientHeight:menu.clientHeight,viewport:{width:innerWidth,height:innerHeight},centerVisible:hit===x||x.parentElement.contains(hit),label:x.parentElement.textContent,checked:x.checked};
  });
  assert(menuGeometry.centerVisible,'Last layer checkbox is clipped or covered');
  assert(menuGeometry.checked===!lastOriginal,'Last layer checkbox did not change');
  const layersBefore=await page.getByRole('dialog',{name:'Indicadores'}).locator('input[type="checkbox"]').evaluateAll(xs=>xs.map(x=>({label:x.parentElement.textContent,checked:x.checked})));
  await page.keyboard.press('Escape');
  const assetBefore=await page.locator('[data-slot="grafico"]').getByRole('button',{name:/^(ETH|BTC)-USDT$/}).first().innerText();
  const panel=page.locator('[data-slot="grafico"] section[data-feed]').first();
  const normalPanel=await panel.boundingBox();
  const layout=width>820 ? page.getByRole('region',{name:'Mesa de decisao'}).locator('[data-tool="layout"]') : page.locator('[data-slot="grafico"] [data-tool="layout"]');
  assert(await layout.isVisible(),'Layout button not visible');
   await layout.click();await page.waitForFunction(el=>el.getAttribute('aria-pressed')==='true',await layout.elementHandle());
   const expandedPanel=await panel.boundingBox();
   assert(expandedPanel.height>normalPanel.height,'Chart did not expand');
   await layout.click();await page.waitForFunction(el=>el.getAttribute('aria-pressed')==='false',await layout.elementHandle());
   const restoredPanel=await panel.boundingBox();
   assert(Math.abs(restoredPanel.height-normalPanel.height)<1,'Chart did not restore');
  assert(await five.getAttribute('aria-pressed')==='true','Interval lost after layout');
  assert(await line.getAttribute('aria-pressed')==='true','Chart style lost after layout');
  const assetAfter=await page.locator('[data-slot="grafico"]').getByRole('button',{name:/^(ETH|BTC)-USDT$/}).first().innerText();
  assert(assetAfter===assetBefore,'Asset lost after layout');
  await indicators.click();
  const layersAfter=await page.getByRole('dialog',{name:'Indicadores'}).locator('input[type="checkbox"]').evaluateAll(xs=>xs.map(x=>({label:x.parentElement.textContent,checked:x.checked})));
  assert(JSON.stringify(layersAfter)===JSON.stringify(layersBefore),'Layers lost after layout');
  await page.keyboard.press('Escape');
  await five.focus();await page.keyboard.press('Tab');
  const focus=await page.evaluate(()=>{const x=document.activeElement,s=getComputedStyle(x);return {label:x.getAttribute('aria-label')??x.textContent,outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth};});
  assert(focus.outlineStyle!=='none'&&parseFloat(focus.outlineWidth)>0,'No visible keyboard focus');
  const body=await page.locator('body').innerText();assert(!/[\u00b7\u2013\u2014]/.test(body),'Forbidden rendered character');
  const motion=await page.evaluate(()=>[...document.querySelectorAll('*')].map(x=>getComputedStyle(x).animationName).filter(x=>/blink|pulse|puls/i.test(x)));
  assert(motion.length===0,'Blink or pulse animation');assert(errors.length===0,errors.join(';'));
  const overflow=await page.evaluate(()=>({body:document.body.scrollWidth,root:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert(overflow.body===width&&overflow.root===width,'Horizontal overflow');
  observations.push({width,height,interval:'5m',chartType:'Linha',assetBefore,assetAfter,layersBefore,layersAfter,menuGeometry,expandedAndRestored:true,normalPanel,expandedPanel,restoredPanel,overflow,focus,motion,errors,qualification:'production UI on isolated static server, public price feeds only; no private wallet/model/orders'});
  await page.close();
 }
} finally {await browser.close();await writeFile(base+'/chart-ui-results.json',JSON.stringify(observations,null,2));}
console.log(JSON.stringify(observations));
