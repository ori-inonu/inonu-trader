import {createHash} from 'node:crypto';
const base='C:/Users/gabri/.codex/worktrees/okx-real-integration/jev-trader/docs/real-integration/';
const research=await Bun.file(base+'G11-PUBLIC-METADATA-READ.json').json();
const rows=await Promise.all(research.chains.map(async(c:any)=>{
 const url='https://sourcify.dev/server/v2/contract/'+c.chainIndex+'/'+c.router+'?fields=all';
 const r:any={chainIndex:c.chainIndex,router:c.router,url,requestedAtMs:Date.now(),httpStatus:null,responseBytes:null,responseSha256:null,error:null};
 try{
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});r.httpStatus=response.status;
  const reader=response.body!.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{while(true){const v=await reader.read();if(v.done)break;size+=v.value.length;if(size>3000000)throw new Error('response-bound');chunks.push(v.value);}}finally{void reader.cancel().catch(()=>{});}
  const bytes=Buffer.concat(chunks);r.responseBytes=size;r.responseSha256=createHash('sha256').update(bytes).digest('hex');
  await Bun.write(base+'router-sourcify-'+c.chainIndex+'.json',bytes);
  if(!response.ok)throw new Error('http-'+response.status);
  const body=JSON.parse(bytes.toString('utf8'));r.bodyKeys=Object.keys(body);r.match=body.match??null;r.runtimeMatch=body.runtimeMatch??null;r.creationMatch=body.creationMatch??null;
 }catch(error){r.error=error instanceof Error?error.message:'unknown-error';}
 r.receivedAtMs=Date.now();return r;
}));
const out={scope:'public-source-metadata-research',singleRequestPerAddress:true,retryCount:0,executionEnabled:false,abiQualified:false,rows};
const path=base+'G11-SOURCIFY-LOOKUP.json',text=JSON.stringify(out,null,2)+'\n';await Bun.write(path,text);console.log(text);
