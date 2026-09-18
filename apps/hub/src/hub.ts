import { DurableObject } from 'cloudflare:workers';
import type { Env } from './types.js';
import {
  agentHelloSchema,
  agentSampleSchema,
  agentPingSchema,
  type SampleWithoutBucket,
  type RingPoint,
} from '@nodepulse/protocol';

interface AgentAttachment {
  kind: 'agent';
  id: string;
  name?: string;
  interval: number;
  connectedAt: number;
  lastTs: number;
  helloReceived?: boolean;
  fastCount?: number;
  last?: SampleWithoutBucket;
}

interface ViewerAttachment {
  kind: 'viewer';
  scope: 'full' | 'public';
  uid: string;
}

type SocketAttachment = AgentAttachment | ViewerAttachment;

export function sanitizeHostForPublic(host?: unknown): unknown {
  if (!host || typeof host !== 'object') return host;
  const h = host as Record<string, unknown>;
  const {
    hostname: _hostname,
    kernel: _kernel,
    platform_ver: _platform_ver,
    cpu_model: _cpu_model,
    ...rest
  } = h;
  return rest;
}

export function sanitizeSampleForPublic(
  sample?: SampleWithoutBucket | null
): SampleWithoutBucket | null {
  if (!sample) return null;
  return {
    ...sample,
    dsk: sample.dsk.map(({ m: _m, ...rest }) => ({ ...rest, m: '' })),
  };
}

const SERVER_STATE_OFFLINE_SQL =
  'INSERT INTO server_state (server_id, online, last_ts, last_json) ' +
  'VALUES (?, 0, ?, ?) ' +
  'ON CONFLICT(server_id) DO UPDATE SET ' +
  'online = 0, last_ts = excluded.last_ts, last_json = excluded.last_json';

export class Hub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ensureSchema();
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}')
    );
  }

  private ensureSchema(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS ring_1m (
        server_id TEXT NOT NULL,
        slot INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        cpu_a REAL, cpu_m REAL,
        mem_a REAL, mem_m REAL,
        swap_a REAL, disk_a REAL,
        load1_a REAL, load1_m REAL,
        nin_a REAL, nin_m REAL,
        nout_a REAL, nout_m REAL,
        rxb INTEGER, txb INTEGER,
        tcp_a REAL, udp_a REAL,
        proc_a REAL, n INTEGER,
        PRIMARY KEY (server_id, slot)
      ) WITHOUT ROWID;

      CREATE TABLE IF NOT EXISTS server_state (
        server_id TEXT PRIMARY KEY,
        online INTEGER NOT NULL,
        last_ts INTEGER,
        since_ts INTEGER,
        static_json TEXT,
        last_json TEXT
      );

      CREATE TABLE IF NOT EXISTS alert_state (
        rule_id TEXT NOT NULL,
        server_id TEXT NOT NULL,
        state TEXT NOT NULL,
        since_ts INTEGER,
        last_notified_ts INTEGER,
        PRIMARY KEY (rule_id, server_id)
      ) WITHOUT ROWID;

      CREATE TABLE IF NOT EXISTS config_kv (
        key TEXT PRIMARY KEY,
        json TEXT NOT NULL
      );
    `);
  }

  async ensureAlarm(): Promise<void> {
    const current = await this.ctx.storage.getAlarm();
    if (!current) {
      await this.ctx.storage.setAlarm(Date.now() + 60000);
    }
  }

  async fetch(req: Request): Promise<Response> {
    const kind = req.headers.get('X-NP-Kind');
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    if (kind === 'agent') {
      const id = req.headers.get('X-NP-Server-Id') ?? 'unknown';
      const interval = Number(req.headers.get('X-NP-Interval') ?? 10);

      // SECURITY §14: Terminate existing socket for this server_id
      for (const old of this.ctx.getWebSockets('agent:' + id)) {
        old.close(4001, 'replaced');
      }

      this.ctx.acceptWebSocket(server, ['agent', 'agent:' + id]);
      const att: AgentAttachment = {
        kind: 'agent',
        id,
        interval,
        connectedAt: Date.now(),
        lastTs: 0,
        helloReceived: false,
        fastCount: 0,
      };
      server.serializeAttachment(att);
      await this.ensureAlarm();

      return new Response(null, { status: 101, webSocket: client });
    }

    if (kind === 'viewer') {
      const scope =
        (req.headers.get('X-NP-Scope') as 'full' | 'public') ?? 'public';
      const uid = req.headers.get('X-NP-Uid') ?? 'anon';

      this.ctx.acceptWebSocket(server, ['viewer', 'scope:' + scope]);
      const att: ViewerAttachment = {
        kind: 'viewer',
        scope,
        uid,
      };
      server.serializeAttachment(att);

      // Send initial snapshot to newly connected viewer
      const snapshot = this.buildSnapshot(scope);
      server.send(JSON.stringify(snapshot));

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not found', { status: 404 });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: ArrayBuffer | string
  ): Promise<void> {
    let raw: string;
    if (typeof message === 'string') {
      raw = message;
    } else {
      raw = new TextDecoder().decode(message);
    }

    // 1. Message size check: max 16 KB per SECURITY §6
    if (raw.length > 16384) {
      ws.close(1009, 'message too large');
      return;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      ws.close(1008, 'invalid json');
      return;
    }

    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att) {
      ws.close(1008, 'missing attachment');
      return;
    }

    if (att.kind === 'agent') {
      await this.handleAgentMessage(ws, att, parsedJson);
    } else {
      await this.handleViewerMessage(ws, att, parsedJson);
    }
  }

  private async handleAgentMessage(
    ws: WebSocket,
    att: AgentAttachment,
    data: unknown
  ): Promise<void> {
    if (!data || typeof data !== 'object' || !('t' in data)) {
      ws.close(4000, 'unknown message type');
      return;
    }

    const t = (data as { t: unknown }).t;

    if (t === 'ping') {
      const parsed = agentPingSchema.safeParse(data);
      if (!parsed.success) {
        ws.close(1008, 'invalid ping');
        return;
      }
      ws.send(JSON.stringify({ t: 'pong' }));
      return;
    }

    if (t === 'hello') {
      // Duplicate hello per API §2.4 -> 1008
      if (att.helloReceived) {
        ws.close(1008, 'duplicate hello');
        return;
      }

      const parsed = agentHelloSchema.safeParse(data);
      if (!parsed.success) {
        ws.close(1008, 'invalid hello schema');
        return;
      }

      att.helloReceived = true;
      ws.serializeAttachment(att);

      const now = Math.floor(Date.now() / 1000);
      const hostJson = JSON.stringify(parsed.data.host);

      // Record online in server_state
      this.ctx.storage.sql.exec(
        `INSERT INTO server_state (server_id, online, last_ts, since_ts, static_json)
         VALUES (?, 1, ?, ?, ?)
         ON CONFLICT(server_id) DO UPDATE SET
           online = 1, last_ts = excluded.last_ts, since_ts = excluded.since_ts,
           static_json = excluded.static_json`,
        att.id,
        now,
        now,
        hostJson
      );

      // Reply with welcome
      ws.send(
        JSON.stringify({
          t: 'welcome',
          server_id: att.id,
          name: att.name ?? att.id,
          interval: att.interval,
          bucket_minutes: 1,
          now_ms: Date.now(),
          max_bytes: 16384,
        })
      );

      // Broadcast server.online to viewers (sanitized for public scope per SECURITY §4.4 & §13)
      this.broadcastToViewers((scope) => ({
        t: 'server.online',
        id: att.id,
        ts: now,
        static:
          scope === 'public'
            ? (sanitizeHostForPublic(parsed.data.host) as typeof parsed.data.host)
            : parsed.data.host,
      }));
      return;
    }

    if (t === 's') {
      const parsed = agentSampleSchema.safeParse(data);
      if (!parsed.success) {
        ws.close(1008, 'invalid sample schema');
        return;
      }

      const now = Date.now();
      // Overclock rate check: fast interval < interval / 2
      const minIntervalMs = Math.floor((att.interval * 1000) / 2);
      if (att.lastTs > 0 && now - att.lastTs < minIntervalMs) {
        att.fastCount = (att.fastCount ?? 0) + 1;
        if (att.fastCount >= 3) {
          ws.close(4008, 'overclocked');
          return;
        }
      } else {
        att.fastCount = 0;
      }

      att.lastTs = now;
      const sample = parsed.data;
      const { b, ...sampleWithoutBucket } = sample;

      att.last = sampleWithoutBucket;
      ws.serializeAttachment(att);

      // Broadcast delta to all viewers (sanitized for public scope)
      this.broadcastToViewers((scope) => ({
        t: 'delta',
        id: att.id,
        ts: sample.ts,
        s:
          scope === 'public'
            ? sanitizeSampleForPublic(sampleWithoutBucket)!
            : sampleWithoutBucket,
      }));

      // If bucket is present, upsert into ring_1m
      if (b) {
        const hubNowSec = Math.floor(now / 1000);
        // SECURITY §6: Drop bucket if drift > 5 min (300s) from Hub clock
        if (Math.abs(b.ts - hubNowSec) > 300) {
          return;
        }

        const slot = Math.floor(b.ts / 60) % 2880;
        this.ctx.storage.sql.exec(
          `INSERT INTO ring_1m (
            server_id, slot, ts, cpu_a, cpu_m, mem_a, mem_m, swap_a, disk_a,
            load1_a, load1_m, nin_a, nin_m, nout_a, nout_m, rxb, txb, tcp_a, udp_a, proc_a, n
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(server_id, slot) DO UPDATE SET
            ts = excluded.ts,
            cpu_a = excluded.cpu_a, cpu_m = excluded.cpu_m,
            mem_a = excluded.mem_a, mem_m = excluded.mem_m,
            swap_a = excluded.swap_a, disk_a = excluded.disk_a,
            load1_a = excluded.load1_a, load1_m = excluded.load1_m,
            nin_a = excluded.nin_a, nin_m = excluded.nin_m,
            nout_a = excluded.nout_a, nout_m = excluded.nout_m,
            rxb = excluded.rxb, txb = excluded.txb,
            tcp_a = excluded.tcp_a, udp_a = excluded.udp_a,
            proc_a = excluded.proc_a, n = excluded.n`,
          att.id,
          slot,
          b.ts,
          b.cpu[0] ?? 0,
          b.cpu[1] ?? b.cpu[0] ?? 0,
          b.mem[0] ?? 0,
          b.mem[1] ?? b.mem[0] ?? 0,
          b.swp[0] ?? 0,
          b.dsk[0] ?? 0,
          b.ld1[0] ?? 0,
          b.ld1[1] ?? b.ld1[0] ?? 0,
          b.nin[0] ?? 0,
          b.nin[1] ?? b.nin[0] ?? 0,
          b.nout[0] ?? 0,
          b.nout[1] ?? b.nout[0] ?? 0,
          b.rxb,
          b.txb,
          b.tcp[0] ?? 0,
          b.udp[0] ?? 0,
          b.pr[0] ?? 0,
          b.n
        );

        // Convert bucket to RingPoint for viewer broadcast
        const ringPoint: RingPoint = [
          b.ts,
          b.cpu[0] ?? 0,
          b.cpu[1] ?? b.cpu[0] ?? 0,
          b.mem[0] ?? 0,
          b.mem[1] ?? b.mem[0] ?? 0,
          b.swp[0] ?? 0,
          b.dsk[0] ?? 0,
          b.ld1[0] ?? 0,
          b.ld1[1] ?? b.ld1[0] ?? 0,
          b.nin[0] ?? 0,
          b.nin[1] ?? b.nin[0] ?? 0,
          b.nout[0] ?? 0,
          b.nout[1] ?? b.nout[0] ?? 0,
          b.rxb,
          b.txb,
          b.tcp[0] ?? 0,
          b.udp[0] ?? 0,
          b.pr[0] ?? 0,
        ];

        this.broadcastToViewers({
          t: 'bucket',
          id: att.id,
          p: ringPoint,
        });
      }
      return;
    }

    // Any unknown message type -> close 4000
    ws.close(4000, 'unknown message type');
  }

  private async handleViewerMessage(
    ws: WebSocket,
    _att: ViewerAttachment,
    data: unknown
  ): Promise<void> {
    if (!data || typeof data !== 'object' || !('t' in data)) {
      ws.close(1008, 'invalid viewer message');
      return;
    }
    const t = (data as { t: unknown }).t;
    if (t === 'ping') {
      ws.send(JSON.stringify({ t: 'pong' }));
      return;
    }
    // Viewer has no command capability
    ws.close(1008, 'command not supported');
  }

  private broadcastToViewers(
    msgOrFn: unknown | ((scope: 'full' | 'public') => unknown)
  ): void {
    for (const ws of this.ctx.getWebSockets('viewer')) {
      try {
        const att = ws.deserializeAttachment() as ViewerAttachment | null;
        const scope = att?.scope ?? 'public';
        const msg =
          typeof msgOrFn === 'function' ? msgOrFn(scope) : msgOrFn;
        ws.send(JSON.stringify(msg));
      } catch {
        // Closed socket will be cleaned by runtime
      }
    }
  }

  buildSnapshot(scope: 'full' | 'public'): unknown {
    const now = Math.floor(Date.now() / 1000);
    const serversList: Array<{
      id: string;
      online: boolean;
      last: SampleWithoutBucket | null;
      last_ts: number;
    }> = [];

    // Collect online agents from socket attachments
    const seenServerIds = new Set<string>();
    for (const ws of this.ctx.getWebSockets('agent')) {
      const att = ws.deserializeAttachment() as AgentAttachment | null;
      if (att && att.id && !seenServerIds.has(att.id)) {
        seenServerIds.add(att.id);
        serversList.push({
          id: att.id,
          online: true,
          last:
            scope === 'public'
              ? sanitizeSampleForPublic(att.last)
              : (att.last ?? null),
          last_ts: Math.floor(att.lastTs / 1000) || now,
        });
      }
    }

    // Read offline servers from server_state
    const cursor = this.ctx.storage.sql.exec(
      'SELECT server_id, online, last_ts, last_json FROM server_state WHERE online = 0'
    );
    for (const row of cursor) {
      const sid = row.server_id as string;
      if (!seenServerIds.has(sid)) {
        seenServerIds.add(sid);
        let last: SampleWithoutBucket | null = null;
        if (row.last_json) {
          try {
            last = JSON.parse(row.last_json as string);
          } catch {
            last = null;
          }
        }
        serversList.push({
          id: sid,
          online: false,
          last: scope === 'public' ? sanitizeSampleForPublic(last) : last,
          last_ts: (row.last_ts as number) || 0,
        });
      }
    }

    return {
      t: 'snapshot',
      now,
      servers: serversList,
    };
  }

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): Promise<void> {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att || att.kind !== 'agent') return;

    const now = Math.floor(Date.now() / 1000);
    const lastJson = att.last ? JSON.stringify(att.last) : null;

    // Record offline in server_state
    this.ctx.storage.sql.exec(
      SERVER_STATE_OFFLINE_SQL,
      att.id,
      now,
      lastJson
    );

    // Broadcast server.offline to viewers
    this.broadcastToViewers((scope) => ({
      t: 'server.offline',
      id: att.id,
      ts: now,
      last:
        scope === 'public'
          ? sanitizeSampleForPublic(att.last)
          : (att.last ?? null),
    }));
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    await this.webSocketClose(ws, 1006, String(error), false);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    // 1. Inspect connected sockets for timeout (> 3 * interval)
    for (const ws of this.ctx.getWebSockets('agent')) {
      const att = ws.deserializeAttachment() as AgentAttachment | null;
      if (att && att.lastTs > 0 && now - att.lastTs > 3 * att.interval * 1000) {
        ws.close(4000, 'heartbeat timeout');
      }
    }
    // Schedule next alarm
    await this.ctx.storage.setAlarm(Date.now() + 60000);
  }

  // RPC: syncConfig
  async syncConfig(mutation?: {
    action: string;
    serverId?: string;
    changes?: Record<string, unknown>;
  }): Promise<void> {
    if (!mutation || typeof mutation !== 'object') return;

    // 1. Record mutation in config_kv
    const key = 'last_sync';
    this.ctx.storage.sql.exec(
      'INSERT INTO config_kv (key, json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json',
      key,
      JSON.stringify(mutation)
    );

    // 2. Action-specific handling
    if (mutation.action === 'server_deleted' && mutation.serverId) {
      // SECURITY §4.5: Kick deleted agent
      for (const ws of this.ctx.getWebSockets('agent:' + mutation.serverId)) {
        ws.close(4403, 'server deleted');
      }
    } else if (mutation.action === 'token_rotated' && mutation.serverId) {
      // SECURITY §4.5: Kick agent immediately on token rotation
      for (const ws of this.ctx.getWebSockets('agent:' + mutation.serverId)) {
        ws.close(4401, 'token rotated');
      }
    } else if (
      mutation.action === 'server_updated' &&
      mutation.serverId &&
      mutation.changes
    ) {
      // If interval changed, send config hot update to agent
      const newInterval = mutation.changes.interval_s as number | undefined;
      if (newInterval !== undefined) {
        for (const ws of this.ctx.getWebSockets('agent:' + mutation.serverId)) {
          const att = ws.deserializeAttachment() as AgentAttachment | null;
          if (att) {
            att.interval = newInterval;
            ws.serializeAttachment(att);
          }
          ws.send(JSON.stringify({ t: 'config', interval: newInterval }));
        }
      }
    }

    // 3. Broadcast config change to viewers
    this.broadcastToViewers({
      t: 'config',
      action: mutation.action,
      serverId: mutation.serverId,
      changes: mutation.changes,
    });
  }

  // RPC: getSeries
  async getSeries(serverId: string, range: string): Promise<Response> {
    const now = Math.floor(Date.now() / 1000);
    let since = now - 86400; // default 24h
    if (range === '1h') since = now - 3600;

    const cursor = this.ctx.storage.sql.exec(
      `SELECT * FROM ring_1m WHERE server_id = ? AND ts >= ? ORDER BY ts ASC`,
      serverId,
      since
    );

    const points: RingPoint[] = [];
    for (const row of cursor) {
      points.push([
        row.ts as number,
        (row.cpu_a as number) ?? 0,
        (row.cpu_m as number) ?? 0,
        (row.mem_a as number) ?? 0,
        (row.mem_m as number) ?? 0,
        (row.swap_a as number) ?? 0,
        (row.disk_a as number) ?? 0,
        (row.load1_a as number) ?? 0,
        (row.load1_m as number) ?? 0,
        (row.nin_a as number) ?? 0,
        (row.nin_m as number) ?? 0,
        (row.nout_a as number) ?? 0,
        (row.nout_m as number) ?? 0,
        (row.rxb as number) ?? 0,
        (row.txb as number) ?? 0,
        (row.tcp_a as number) ?? 0,
        (row.udp_a as number) ?? 0,
        (row.proc_a as number) ?? 0,
      ]);
    }

    return new Response(JSON.stringify({ points }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
      },
    });
  }

  // RPC: getSnapshot
  async getSnapshot(scope = 'public'): Promise<unknown> {
    return this.buildSnapshot(scope as 'full' | 'public');
  }
}
