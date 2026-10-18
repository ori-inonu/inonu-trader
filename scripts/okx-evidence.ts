import {openSync,fstatSync,readSync,closeSync,realpathSync,constants} from 'node:fs';
import {resolve} from 'node:path';
import {EvidenceError,joinEvidence} from '../src/okx-evidence/report';
import {createSyntheticEvidenceReport} from '../src/okx-evidence/fixture';

const MAX_BYTES=1024*1024;
function localPath(path:string):string{
  // Reject URLs, network/device namespaces, alternate streams and DOS devices before IO.
  if(!path||path.includes('\0')||/^[\\/]{2}/.test(path)||/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)&&! /^[A-Za-z]:[\\/]/.test(path))throw new EvidenceError('invalid_input');
  const withoutDrive=path.replace(/^[A-Za-z]:/,'');
  if(withoutDrive.includes(':')||withoutDrive.split(/[\\/]/).some(part=>/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part)))throw new EvidenceError('invalid_input');
  return resolve(path);
}
function options(args:string[]){
  if(!args.length)return {mode:'synthetic' as const};
  if(args.length===1&&args[0]==='--help')return {mode:'help' as const};
  const values=new Map<string,string>();
  for(let i=0;i<args.length;i++){
    const flag=args[i]!;
    if(!['--signals','--scan','--max-age-ms'].includes(flag)||values.has(flag))throw new EvidenceError('invalid_input');
    const value=args[++i];if(!value||value.startsWith('--'))throw new EvidenceError('invalid_input');values.set(flag,value);
  }
  const signals=values.get('--signals'),scan=values.get('--scan'),age=values.get('--max-age-ms');
  if(!signals||!scan||!age||!/^[1-9][0-9]{0,6}$/.test(age)||Number(age)>3600000)throw new EvidenceError('invalid_input');
  return {mode:'files' as const,signals:localPath(signals),scan:localPath(scan),maxAgeMs:Number(age)};
}
function readReport(path:string):unknown{
  let fd:number|undefined;
  let bytes:Buffer;
  try{
    const actual=realpathSync(path);localPath(actual);
    fd=openSync(actual,constants.O_RDONLY|constants.O_NONBLOCK);
    const stat=fstatSync(fd);if(!stat.isFile()||stat.size>MAX_BYTES)throw new EvidenceError('file_error');
    bytes=Buffer.alloc(MAX_BYTES+1);let total=0;
    while(total<bytes.length){const count=readSync(fd,bytes,total,bytes.length-total,null);if(count===0)break;total+=count;}
    if(total>MAX_BYTES)throw new EvidenceError('file_error');bytes=bytes.subarray(0,total);
  }catch{throw new EvidenceError('file_error');}
  finally{if(fd!==undefined)closeSync(fd);}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw new EvidenceError('invalid_report');}
}
async function main(){
  const selected=options(process.argv.slice(2));
  if(selected.mode==='help'){
    console.log('GEV: comparação offline de evidências OKX\nSem flags: demo sintética determinística.\nArquivos: --signals <JSON local> --scan <JSON local> --max-age-ms <1..3600000>\nUse bun --no-env-file run scripts/okx-evidence.ts. Origem não verificada; execução não qualificada.');return;
  }
  const output=selected.mode==='synthetic'?await createSyntheticEvidenceReport():joinEvidence({signals:readReport(selected.signals),scan:readReport(selected.scan),nowMs:Date.now(),maxAgeMs:selected.maxAgeMs});
  console.log(JSON.stringify(output,null,2));
}
if(import.meta.main)main().catch(error=>{console.error(`OKX Evidence: ${error instanceof EvidenceError?error.code:'file_error'}`);process.exitCode=1;});
