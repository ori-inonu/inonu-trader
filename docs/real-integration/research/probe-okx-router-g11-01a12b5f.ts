import { createHash } from 'node:crypto';
import { utils } from 'C:/Users/gabri/jev-trader/node_modules/ethers';
const chains=[{chainIndex:'196',endpoint:'https://rpc.xlayer.tech',router:'0x7c5bee2a8091c3ef39072f64f18fac913060aeaf'},{chainIndex:'143',endpoint:'https://rpc.monad.xyz',router:'0xc1c76e784db8d68585fb608ce68fc5dcff14000e'}];
const output:any={scope:'public-router-research-only',exercisedReal:true,financiallyQualified:false,executionEnabled:false,abiQualified:false,decoderQualified:false,startedAtMs:Date.now(),chains:[]};
for(const chain of chains){
 const start=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 const result:any={...chain,receipts:[],block:null,runtimeCodeHash:null,runtimeCodeSha256:null,runtimeCodeBytes:null,blockConsistent:false,qualified:false,reason:null};
 let id=0;
 const rpc=async(method:string,params:unknown[])=>{
  const receipt:any={method,id:++id,requestedAtMs:Date.now(),receivedAtMs:null,httpStatus:null,responseSha256:null,responseBytes:null};result.receipts.push(receipt);
  try{
   const response=await fetch(chain.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:receipt.id,method,params}),signal:controller.signal,redirect:'error'});
   receipt.httpStatus=response.status;
   if(!response.ok){void response.body?.cancel();throw new Error('http-status-'+response.status);}
   const reader=response.body!.getReader(),chunks:Uint8Array[]=[];let size=0;
   try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>300000)throw new Error('response-too-large');chunks.push(part.value);}}finally{void reader.cancel().catch(()=>{});}
   const bytes=Buffer.concat(chunks);receipt.responseBytes=size;receipt.responseSha256=createHash('sha256').update(bytes).digest('hex');
   const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   if(body.jsonrpc!=='2.0'||body.id!==receipt.id||Object.hasOwn(body,'error')||!Object.hasOwn(body,'result'))throw new Error('rpc-envelope-error');
   return body.result;
  }finally{receipt.receivedAtMs=Date.now();}
 };
 try{
  const actual=await rpc('eth_chainId',[]);if(typeof actual!=='string'||BigInt(actual).toString()!==chain.chainIndex)throw new Error('chain-mismatch');
  const block=await rpc('eth_getBlockByNumber',['latest',false]);if(!block||!/^0x[0-9a-f]+$/i.test(block.number)||!/^0x[0-9a-f]{64}$/i.test(block.hash))throw new Error('block-invalid');
  result.block={number:block.number,hash:block.hash};
  const code=await rpc('eth_getCode',[chain.router,block.number]);if(typeof code!=='string'||!/^0x(?:[0-9a-f]{2})+$/i.test(code))throw new Error('runtime-code-empty-or-invalid');
  result.runtimeCodeHash=utils.keccak256(code);result.runtimeCodeSha256=createHash('sha256').update(Buffer.from(code.slice(2),'hex')).digest('hex');result.runtimeCodeBytes=(code.length-2)/2;
  const end=await rpc('eth_getBlockByNumber',[block.number,false]);if(!end||end.hash?.toLowerCase()!==block.hash.toLowerCase())throw new Error('block-changed');
  const actualEnd=await rpc('eth_chainId',[]);if(typeof actualEnd!=='string'||BigInt(actualEnd).toString()!==chain.chainIndex)throw new Error('chain-changed');
  result.blockConsistent=true;result.reason='observed-runtime-only-abi-proxy-spender-decoder-unknown';
 }catch(error){result.reason=error instanceof Error?error.message:'unknown-error';}
 finally{clearTimeout(timer);controller.abort();result.finishedAtMs=Date.now();result.elapsedMs=result.finishedAtMs-start;output.chains.push(result);}
}
output.finishedAtMs=Date.now();
const path='C:/Users/gabri/.codex/worktrees/okx-real-integration/jev-trader/docs/real-integration/G11-PUBLIC-ROUTER-READ.json';
const text=JSON.stringify(output,null,2)+'\n';await Bun.write(path,text);console.log(JSON.stringify({path,sha256:createHash('sha256').update(text).digest('hex'),chains:output.chains.map((c:any)=>({chainIndex:c.chainIndex,block:c.block,runtimeCodeBytes:c.runtimeCodeBytes,runtimeCodeHash:c.runtimeCodeHash,blockConsistent:c.blockConsistent,reason:c.reason}))}));
