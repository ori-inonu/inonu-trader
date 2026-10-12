import {createHash} from 'node:crypto';
const base='C:/Users/gabri/.codex/worktrees/okx-real-integration/jev-trader/docs/real-integration/';
const research=await Bun.file(base+'G11-PUBLIC-METADATA-READ.json').json();
const rows=await Promise.all(research.chains.map(async(c:any)=>{
 const url='https://ipfs.io/ipfs/'+c.ipfsCidV0+'?format=raw';
 const r:any={chainIndex:c.chainIndex,cid:c.ipfsCidV0,url,requestedAtMs:Date.now(),httpStatus:null,contentType:null,bytes:null,blockSha256:null,blockHashMatched:false,metadataRetrieved:false,error:null};
 try{
  const response=await fetch(url,{headers:{Accept:'application/vnd.ipld.raw'},redirect:'follow',signal:AbortSignal.timeout(15000)});r.httpStatus=response.status;r.contentType=response.headers.get('content-type');r.finalUrl=response.url;
  if(!response.ok){void response.body?.cancel();throw new Error('http-'+response.status);}
  const reader=response.body!.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{while(true){const v=await reader.read();if(v.done)break;size+=v.value.length;if(size>1000000)throw new Error('response-bound');chunks.push(v.value);}}finally{void reader.cancel().catch(()=>{});}
  const bytes=Buffer.concat(chunks);r.bytes=size;r.blockSha256=createHash('sha256').update(bytes).digest('hex');
  r.blockHashMatched=r.blockSha256===c.metadata.ipfs.bytesHex.slice(4);
  if(!r.blockHashMatched)throw new Error('ipfs-raw-block-hash-mismatch');
  await Bun.write(base+'router-metadata-'+c.chainIndex+'.ipld-block',bytes);
 }catch(error){r.error=error instanceof Error?error.message:'unknown-error';}
 r.receivedAtMs=Date.now();return r;
}));
const out={scope:'public-ipfs-metadata-research',singleRequestPerCid:true,retryCount:0,executionEnabled:false,abiQualified:false,rows};
const path=base+'G11-IPFS-RETRIEVAL.json',text=JSON.stringify(out,null,2)+'\n';await Bun.write(path,text);console.log(text);
