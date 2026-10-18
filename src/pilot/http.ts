import { evaluatePilot, type PilotDeps } from "./service";
import { DEFAULT_PILOT_PORTS, validPilotPort, type PilotPorts } from "./ports";

const MAX_BODY = 4096;
async function readBody(request: Request): Promise<string> {
  const length=request.headers.get("content-length");
  if (length && (!/^[0-9]+$/.test(length) || Number(length)>MAX_BODY)) throw new Error("body_too_large");
  const reader=request.body?.getReader();
  if (!reader) throw new Error("invalid_request");
  const chunks: Uint8Array[]=[];let bytes=0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async()=>{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>MAX_BODY)throw new Error("body_too_large");chunks.push(part.value);}})(),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>{void reader.cancel();reject(new Error("body_timeout"));},2000);}),
    ]);
    const output=new Uint8Array(bytes);let offset=0;
    for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}
    return new TextDecoder("utf-8",{fatal:true}).decode(output);
  } finally {clearTimeout(timer);void reader.cancel().catch(()=>{});}
}
/** The service listens on ports.port and only the page on ports.uiPort may call it; both default to 3020 and 3021. */
export function createPilotHandler(deps: PilotDeps & {journal: NonNullable<PilotDeps["journal"]>}, ports: PilotPorts = DEFAULT_PILOT_PORTS) {
  if(!validPilotPort(ports.port) || !validPilotPort(ports.uiPort) || ports.port===ports.uiPort)throw new Error("invalid_pilot_ports");
  const ORIGINS = new Set([`http://127.0.0.1:${ports.uiPort}`,`http://localhost:${ports.uiPort}`]);
  const HOSTS = new Set([`127.0.0.1:${ports.port}`,`localhost:${ports.port}`]);
  let active=false;
  return async (request: Request): Promise<Response> => {
    const origin=request.headers.get("origin");
    const headers=new Headers({"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"});
    if(origin && ORIGINS.has(origin)){headers.set("access-control-allow-origin",origin);headers.set("vary","Origin");}
    const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
    const url=new URL(request.url);
    if(!HOSTS.has(url.host) || !HOSTS.has(request.headers.get("host") ?? url.host))return reply(403,{error:"host_rejected"});
    if(url.pathname==="/health" && request.method==="GET")return reply(200,{mode:"simulation",execution:"disabled",protocol:"gev-wallet-pilot-v1"});
    if(url.pathname!=="/pilot/cycles")return reply(404,{error:"route_unavailable"});
    if(request.method!=="POST" && request.method!=="OPTIONS")return reply(405,{error:"method_unavailable"});
    if(!origin || !ORIGINS.has(origin))return reply(403,{error:"origin_rejected"});
    if(request.method==="OPTIONS"){
      if(request.headers.get("access-control-request-method")!=="POST" ||
        (request.headers.get("access-control-request-headers")??"").toLowerCase().split(",").some(h=>h.trim() && h.trim()!=="content-type"))return reply(403,{error:"preflight_rejected"});
      headers.set("access-control-allow-methods","POST");headers.set("access-control-allow-headers","Content-Type");
      return new Response(null,{status:204,headers});
    }
    if(request.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json")return reply(415,{error:"json_required"});
    if(active)return reply(429,{error:"cycle_in_progress"});
    active=true;
    try {
      let input:unknown;
      try {input=JSON.parse(await readBody(request));}catch(error){
        const code=error instanceof Error?error.message:"";
        return reply(code==="body_too_large"?413:code==="body_timeout"?408:400,{error:code==="body_too_large"?code:"invalid_request"});
      }
      try {return reply(200,await evaluatePilot(input,deps));}
      catch(error){return reply(error instanceof Error && error.message==="invalid_pilot_request"?400:500,{error:"cycle_not_recorded"});}
    } finally {active=false;}
  };
}
