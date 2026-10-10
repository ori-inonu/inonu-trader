export interface IngressLimits { payloadBytes: number; ingressBytes: number; pending: number }
export interface IncompleteEvidence { reason: string; size: number | string; provenance: "observed_lower_bound" | "source_declared"; units: number; completeHash: null; callbackTime: null }
export interface IngressMessage { id: string; payload: Buffer; encoding: "application_binary"; release(): void; reservation: Reservation }
export interface Reservation { bytes: number; released: boolean }
/** Shared counters include incomplete assemblies, ready bodies and pending collector records. */
export class IngressBudget {
  bytes = 0; units = 0;
  constructor(readonly limits: IngressLimits) {
    if (![limits.payloadBytes, limits.ingressBytes, limits.pending].every(n => Number.isSafeInteger(n) && n > 0) || limits.payloadBytes > 1048576 || limits.ingressBytes > 8388608 || limits.pending > 16) throw Error("invalid_ingress_limits");
  }
  open(): Reservation { if (this.units >= this.limits.pending) throw Error("backpressure_limit"); this.units++; return { bytes: 0, released: false }; }
  grow(r: Reservation, bytes: number): void { if (r.released || bytes < 0 || this.bytes + bytes > this.limits.ingressBytes) throw Error("aggregate_ingress_limit"); this.bytes += bytes; r.bytes += bytes; }
  shrink(r: Reservation, bytes: number): void { this.bytes -= bytes; r.bytes -= bytes; }
  release(r: Reservation): void { if (!r.released) { r.released = true; this.bytes -= r.bytes; r.bytes = 0; this.units--; } }
}
interface Assembly { id: string; reservation: Reservation; chunks: Buffer[]; size: number; opcode: number }
/** Incremental RFC6455 server frames and identity HTTP bodies. No decompressor is created. */
export class BoundedIngress {
  readonly budget: IngressBudget;
  private http = new Map<string, Assembly>();
  private assembly: Assembly | null = null;
  private header = Buffer.alloc(10); private headerBytes = 0; private headerNeed = 2;
  private frame: { remaining: number; length: number; fin: boolean; opcode: number; control: Buffer[]; reservation?: Reservation } | null = null;
  private stopped = false;
  constructor(readonly limits: IngressLimits, private sink: { message(message: IngressMessage): void; incomplete(evidence: IncompleteEvidence): void; control?(opcode: number, payload: Buffer): void }, budget?: IngressBudget) { this.budget = budget ?? new IngressBudget(limits); }
  get heldBytes(): number { return this.budget.bytes; }
  get pendingUnits(): number { return this.budget.units; }
  private reject(reason: string, size: number | string, provenance: IncompleteEvidence["provenance"], extraUnits = 0): void {
    if (this.stopped) return;
    this.stopped = true;
    const units = this.http.size + (this.assembly ? 1 : 0) + (this.frame?.reservation ? 1 : 0) + extraUnits;
    for (const a of this.http.values()) this.budget.release(a.reservation);
    if (this.assembly) this.budget.release(this.assembly.reservation);
    if (this.frame?.reservation) this.budget.release(this.frame.reservation);
    this.http.clear(); this.assembly = null; this.frame = null;
    this.sink.incomplete({ reason, size, provenance, units: Math.max(1, units), completeHash: null, callbackTime: null });
  }
  beginHttp(id: string, encoding: string | undefined): void {
    if (this.stopped) return;
    if (encoding && encoding.toLowerCase() !== "identity") { this.reject("unsupported_content_encoding", 0, "observed_lower_bound", 1); return; }
    if (this.http.has(id)) { this.reject("duplicate_body", 0, "observed_lower_bound"); return; }
    try { this.http.set(id, { id, reservation: this.budget.open(), chunks: [], size: 0, opcode: 2 }); }
    catch (e) { this.reject((e as Error).message, 0, "observed_lower_bound", 1); }
  }
  pushHttp(id: string, chunk: Uint8Array): void {
    if (this.stopped) return;
    const a = this.http.get(id); if (!a) { this.reject("unknown_body", chunk.length, "observed_lower_bound", 1); return; }
    if (a.size + chunk.length > this.limits.payloadBytes) { this.reject("encoded_body_limit", a.size + chunk.length, "observed_lower_bound"); return; }
    try { this.budget.grow(a.reservation, chunk.length); a.chunks.push(Buffer.from(chunk)); a.size += chunk.length; }
    catch (e) { this.reject((e as Error).message, a.size + chunk.length, "observed_lower_bound"); }
  }
  endHttp(id: string): void {
    if (this.stopped) return;
    const a = this.http.get(id); if (!a) { this.reject("unknown_body", 0, "observed_lower_bound", 1); return; }
    this.http.delete(id); this.deliver(a);
  }
  private deliver(a: Assembly): void {
    try {
      // Concatenation temporarily holds old fragments and the contiguous application body.
      this.budget.grow(a.reservation, a.size);
      const payload = Buffer.concat(a.chunks, a.size); a.chunks = [];
      this.budget.shrink(a.reservation, a.size);
      this.sink.message({ id: a.id, payload, encoding: "application_binary", reservation: a.reservation, release: () => this.budget.release(a.reservation) });
    } catch (e) { this.budget.release(a.reservation); this.reject((e as Error).message, a.size, "observed_lower_bound", 1); }
  }
  /** Input chunks are external runtime-owned; qualified adapter must separately bound those allocations. */
  pushWebSocket(chunk: Uint8Array): void {
    if (this.stopped) return;
    let offset = 0;
    while (offset < chunk.length && !this.stopped) {
      if (!this.frame) {
        const take = Math.min(this.headerNeed - this.headerBytes, chunk.length - offset);
        this.header.set(chunk.subarray(offset, offset + take), this.headerBytes); this.headerBytes += take; offset += take;
        if (this.headerBytes < this.headerNeed) continue;
        if (this.headerNeed === 2) {
          const b0 = this.header[0]!, b1 = this.header[1]!;
          if ((b0 & 0x70) !== 0) { this.reject("unsupported_websocket_compression", 0, "observed_lower_bound", this.assembly ? 0 : 1); break; }
          if (b1 & 0x80) { this.reject("masked_server_frame", 0, "observed_lower_bound", this.assembly ? 0 : 1); break; }
          const n = b1 & 0x7f; this.headerNeed = n === 126 ? 4 : n === 127 ? 10 : 2;
          if (this.headerBytes < this.headerNeed) continue;
        }
        const n = this.header[1]! & 0x7f;
        const length = n === 126 ? BigInt(this.header.readUInt16BE(2)) : n === 127 ? this.header.readBigUInt64BE(2) : BigInt(n);
        const fin = !!(this.header[0]! & 0x80), opcode = this.header[0]! & 0x0f;
        if (length > BigInt(this.limits.payloadBytes)) { this.reject("encoded_frame_limit", length > BigInt(Number.MAX_SAFE_INTEGER) ? String(length) : Number(length), "source_declared", this.assembly ? 0 : 1); break; }
        if ((n === 126 && length < 126n) || (n === 127 && length < 65536n) || ![0, 1, 2, 8, 9, 10].includes(opcode) || (opcode >= 8 && (!fin || length > 125n))) { this.reject("invalid_websocket_frame", Number(length), "source_declared", this.assembly ? 0 : 1); break; }
        if (opcode < 8) {
          if ((opcode === 0 && !this.assembly) || (opcode !== 0 && this.assembly)) { this.reject("invalid_fragment_order", Number(length), "source_declared", this.assembly ? 0 : 1); break; }
          if (!this.assembly) {
            try { this.assembly = { id: "websocket", reservation: this.budget.open(), chunks: [], size: 0, opcode }; }
            catch (e) { this.reject((e as Error).message, 0, "observed_lower_bound", 1); break; }
          }
          if (this.assembly.size + Number(length) > this.limits.payloadBytes) { this.reject("assembled_message_limit", this.assembly.size + Number(length), "source_declared"); break; }
        }
        let reservation: Reservation | undefined;
        if (opcode >= 8) {
          try { reservation = this.budget.open(); }
          catch (e) { this.reject((e as Error).message, 0, "observed_lower_bound", 1); break; }
        }
        this.frame = { remaining: Number(length), length: Number(length), fin, opcode, control: [], reservation }; this.headerBytes = 0; this.headerNeed = 2;
        if (this.frame.remaining === 0) this.finishFrame();
        continue;
      }
      const f = this.frame, take = Math.min(f.remaining, chunk.length - offset);
      if (f.opcode >= 8) {
        try { this.budget.grow(f.reservation!, take); f.control.push(Buffer.from(chunk.subarray(offset, offset + take))); }
        catch (e) { this.reject((e as Error).message, f.length - f.remaining + take, "observed_lower_bound"); break; }
      }
      else {
        const a = this.assembly!;
        try { this.budget.grow(a.reservation, take); a.chunks.push(Buffer.from(chunk.subarray(offset, offset + take))); a.size += take; }
        catch (e) { this.reject((e as Error).message, a.size + take, "observed_lower_bound"); break; }
      }
      f.remaining -= take; offset += take;
      if (!f.remaining) this.finishFrame();
    }
  }
  private finishFrame(): void {
    const f = this.frame!; this.frame = null;
    if (f.opcode >= 8) {
      try {
        this.budget.grow(f.reservation!, f.length);
        const payload = Buffer.concat(f.control, f.length); f.control = [];
        this.budget.shrink(f.reservation!, f.length);
        this.sink.control?.(f.opcode, payload);
      } catch (e) { this.reject((e as Error).message, f.length, "observed_lower_bound", 1); }
      finally { this.budget.release(f.reservation!); }
      return;
    }
    if (f.fin) { const a = this.assembly!; this.assembly = null; this.deliver(a); }
  }
  abort(reason = "transport_aborted"): void { if (this.http.size || this.assembly || this.frame || this.headerBytes) this.reject(reason, this.assembly?.size ?? [...this.http.values()].reduce((n, a) => n + a.size, 0), "observed_lower_bound"); }
}
