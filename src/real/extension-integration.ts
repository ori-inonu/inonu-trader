import type { RealExtensionsInput, RealExtensionsSample } from './extensions';
import type { CoreSample, Capability } from './types';

/** Qualified input is supplied by a separate evidence owner; production defaults OFF. */
export async function attachRealExtensions(sample: CoreSample, input: RealExtensionsInput,
 port: { read(input: RealExtensionsInput, signal?: AbortSignal): Promise<RealExtensionsSample> }, signal?: AbortSignal): Promise<CoreSample> {
 const same=(value:{correlationId:string;chainIndex:string;revision:number})=>value.correlationId===sample.correlationId&&value.chainIndex===sample.chainIndex&&value.revision===sample.revision;
 if(signal?.aborted||!same(input))return sample;
 const extension=await port.read(input,signal);
 if(signal?.aborted||!same(extension))return sample;
 const key=(row:Capability)=>JSON.stringify([row.family,row.chainIndex,row.endpoint]);
 const replacements=new Map(extension.capabilities.map(row=>[key(row),row]));
 const capabilities=sample.capabilities.map(row=>{const replacement=replacements.get(key(row));replacements.delete(key(row));return replacement??row});
 return {...sample,envelopes:{...sample.envelopes,...extension.envelopes},capabilities:[...capabilities,...replacements.values()]};
}
