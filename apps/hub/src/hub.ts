import { DurableObject } from 'cloudflare:workers';
import type { Env } from './types.js';

export class Hub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(req: Request): Promise<Response> {
    const kind = req.headers.get('X-NP-Kind');
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    if (kind === 'agent') {
      const id = req.headers.get('X-NP-Server-Id') ?? 'unknown';
      const interval = Number(req.headers.get('X-NP-Interval') ?? 10);

      // SECURITY §14: Disconnect old socket for same server_id
      for (const old of this.ctx.getWebSockets('agent:' + id)) {
        old.close(4001, 'replaced');
      }

      this.ctx.acceptWebSocket(server, ['agent', 'agent:' + id]);
      server.serializeAttachment({
        kind: 'agent',
        id,
        interval,
        state: 'pending',
        connectedAt: Date.now(),
        lastTs: 0,
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    if (kind === 'viewer') {
      const scope = req.headers.get('X-NP-Scope') ?? 'public';
      const uid = req.headers.get('X-NP-Uid') ?? 'anon';

      this.ctx.acceptWebSocket(server, ['viewer', 'scope:' + scope]);
      server.serializeAttachment({
        kind: 'viewer',
        scope,
        uid,
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not found', { status: 404 });
  }

  async alarm(): Promise<void> {
    // Alarm inspection logic implemented in M1/M4
  }

  async webSocketMessage(
    _ws: WebSocket,
    _message: ArrayBuffer | string
  ): Promise<void> {
    // Message dispatch implemented in M1-T7
  }

  async webSocketClose(
    _ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): Promise<void> {
    // Socket close handler implemented in M1-T7
  }

  async webSocketError(_ws: WebSocket, _error: unknown): Promise<void> {
    // Socket error handler implemented in M1-T7
  }

  // RPC methods for Worker callers
  async syncConfig(_partial?: unknown): Promise<void> {
    // RPC sync config implemented in M1-T9
  }

  async getSeries(_serverId: string, _range: string): Promise<Response> {
    return new Response(JSON.stringify({ points: [] }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  async getSnapshot(_scope?: string): Promise<unknown> {
    return { servers: [] };
  }
}
