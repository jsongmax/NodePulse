import { DurableObject } from 'cloudflare:workers';
import type { Env } from './types.js';

export class Hub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(_req: Request): Promise<Response> {
    return new Response('Hub DO skeleton', { status: 200 });
  }

  async alarm(): Promise<void> {
    // Alarm inspection logic implemented in M1/M4
  }

  async webSocketMessage(
    _ws: WebSocket,
    _message: ArrayBuffer | string
  ): Promise<void> {
    // Message dispatch implemented in M1
  }

  async webSocketClose(
    _ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): Promise<void> {
    // Socket close handler implemented in M1
  }

  async webSocketError(_ws: WebSocket, _error: unknown): Promise<void> {
    // Socket error handler implemented in M1
  }

  // RPC methods for Worker callers
  async syncConfig(_partial?: unknown): Promise<void> {
    // RPC sync config implemented in M1
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
