import { createHash } from 'node:crypto';
import { utils } from 'C:/Users/gabri/jev-trader/node_modules/ethers';
const base='C:/Users/gabri/.codex/worktrees/okx-real-integration/jev-trader/docs/real-integration/';
const prior=await Bun.file(base+'G11-PUBLIC-ROUTER-READ.json').json();
function cbor(bytes:Buffer){
 let at=0;
 const read=(depth=0):any=>{
  if(depth>8||at>=bytes.length)throw new Error('CBOR-bound');
  const h=bytes[at++],major=h>>5,ai=h&31;
  let n:number;
  if(ai<24)n=ai;else if(ai===24){if(at>=bytes.length)throw new Error('CBOR-short');n=bytes[at++];}
  else if(ai===25){if(at+2>bytes.length)throw new Error('CBOR-short');n=bytes.readUInt16BE(at);at+=2;}
  else throw new Error('CBOR-unsupported-length');
  if(major===0)return n;
  if(major===2||major===3){if(at+n>bytes.length)throw new Error('CBOR-short');const b=bytes.subarray(at,at+n);at+=n;return major===2?{bytesHex:b.toString('hex')}:new TextDecoder('utf-8',{fatal:true}).decode(b);}
  if(major===5){if(n>20)throw new Error('CBOR-map-bound');const map:any={};for(let j=0;j<n;j++){const key=read(depth+1);if(typeof key!=='string'||Object.hasOwn(map,key))throw new Error('CBOR-key');map[key]=read(depth+1);}return map;}
  if(major===7&&(n===20||n===21))return n===21;
  throw new Error('CBOR-unsupported-type');
 };
 const result=read();if(at!==bytes.length)throw new Error('CBOR-trailing');return result;
}
function base58(buf:Buffer){const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=BigInt('0x'+buf.toString('hex')),out='';while(n>0){out=alphabet[Number(n%58n)]+out;n/=58n;}for(const b of buf){if(b!==0)break;out='1'+out;}return out;}
const out:any={scope:'public-runtime-metadata-research',executionEnabled:false,abiQualified:false,decoderQualified:false,startedAtMs:Date.now(),chains:[]};
for(const item of prior.chains){
 const r:any={chainIndex:item.chainIndex,router:item.router,block:item.block,runtimeHashExpected:item.runtimeCodeHash,metadata:null,reason:null};
 try{
  const response=await fetch(item.endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getCode',params:[item.router,item.block.number]}),signal:AbortSignal.timeout(15000)});
  r.httpStatus=response.status;if(!response.ok)throw new Error('http-'+response.status);
  const text=await response.text();if(text.length>300000)throw new Error('response-bound');r.responseSha256=createHash('sha256').update(text).digest('hex');
  const body=JSON.parse(text);if(body.id!==1||body.jsonrpc!=='2.0'||body.error||typeof body.result!=='string'||!/^0x(?:[0-9a-f]{2})+$/i.test(body.result))throw new Error('rpc-invalid');
  const code=body.result;if(utils.keccak256(code)!==item.runtimeCodeHash)throw new Error('runtime-hash-changed');
  r.runtimeHashMatched=true;const bytes=Buffer.from(code.slice(2),'hex');r.runtimeCodeBytes=bytes.length;
  await Bun.write(base+'router-runtime-'+item.chainIndex+'.hex',code+'\n');
  const len=bytes.readUInt16BE(bytes.length-2);if(len<1||len>4096||len>bytes.length-2)throw new Error('metadata-length-invalid');
  r.metadataCborLength=len;const trailer=bytes.subarray(bytes.length-2-len,bytes.length-2);r.metadataCborHex=trailer.toString('hex');r.metadata=cbor(trailer);
  const ipfs=r.metadata.ipfs?.bytesHex;if(ipfs){const hash=Buffer.from(ipfs,'hex');if(hash.length===34&&hash[0]===0x12&&hash[1]===0x20)r.ipfsCidV0=base58(hash);else r.reason='unsupported-multihash';}
  r.reason??='metadata-reference-only';
 }catch(error){r.reason=error instanceof Error?error.message:'unknown-error';}
 r.finishedAtMs=Date.now();out.chains.push(r);
}
out.finishedAtMs=Date.now();const path=base+'G11-PUBLIC-METADATA-READ.json',text=JSON.stringify(out,null,2)+'\n';await Bun.write(path,text);
console.log(JSON.stringify({path,sha256:createHash('sha256').update(text).digest('hex'),chains:out.chains}));
