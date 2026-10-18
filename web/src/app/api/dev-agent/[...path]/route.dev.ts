import { handleDevAgentProxy } from "../../../../lib/dev-agent-proxy";

export function GET(request: Request): Promise<Response> {
  return handleDevAgentProxy(request);
}

export function HEAD(request: Request): Promise<Response> {
  return handleDevAgentProxy(request);
}

export function POST(request: Request): Promise<Response> {
  return handleDevAgentProxy(request);
}

export function PUT(request: Request): Promise<Response> {
  return handleDevAgentProxy(request);
}

export function PATCH(request: Request): Promise<Response> {
  return handleDevAgentProxy(request);
}

export function DELETE(request: Request): Promise<Response> {
  return handleDevAgentProxy(request);
}

export function OPTIONS(request: Request): Promise<Response> {
  return handleDevAgentProxy(request);
}
