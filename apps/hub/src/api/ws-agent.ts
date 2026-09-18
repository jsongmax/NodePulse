import { Hono } from 'hono';
import type { Env } from '../types.js';
import * as db from '../db/index.js';
import {
  DEFAULT_TOKEN_PEPPER,
  constantTimeEqual,
  hashIp,
  hmacSha256,
} from '../auth/crypto.js';
import { getClientIp } from '../middleware/ratelimit.js';

export const wsAgentRouter = new Hono<{ Bindings: Env }>();

// GET /ws/agent
wsAgentRouter.get('/', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.text('Expected WebSocket Upgrade', 426);
  }

  const authHeader = c.req.header('Authorization');
  const pepper = c.env.TOKEN_PEPPER || DEFAULT_TOKEN_PEPPER;
  const ip = getClientIp(c);
  const now = Math.floor(Date.now() / 1000);

  const authFail = async (target: string | null, details: string) => {
    if (c.env.RL_AGENT) {
      await c.env.RL_AGENT.limit({ key: ip });
    }
    const ipHash = await hashIp(ip, pepper);
    await db.recordAudit(c.env.DB, {
      ts: now,
      user_id: null,
      action: 'agent_auth_failed',
      target,
      details,
      ip_hash: ipHash,
    });
    return c.text('Unauthorized', 401);
  };

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return authFail(null, 'Missing or malformed Authorization header');
  }

  const token = authHeader.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'np1') {
    return authFail(null, 'Invalid token structure or prefix');
  }

  const [, serverId, secret] = parts;
  if (!serverId || !secret) {
    return authFail(serverId || null, 'Empty server ID or secret in token');
  }

  const server = await db.findServerById(c.env.DB, serverId);

  if (!server) {
    return authFail(serverId, 'Server ID not found');
  }

  // Calculate HMAC-SHA256(pepper, secret)
  const calculatedHash = await hmacSha256(pepper, secret);
  const storedHash =
    server.token_hash instanceof Uint8Array
      ? server.token_hash
      : new Uint8Array(server.token_hash);

  if (!constantTimeEqual(calculatedHash, storedHash)) {
    return authFail(serverId, 'Token HMAC mismatch');
  }

  // SECURITY §4.5 & §14: Reconstruct Request completely before forwarding to Hub DO
  // Only copy standard WebSocket negotiation headers, discard all client X-NP-* headers
  const forwardHeaders = new Headers();
  for (const [k, v] of c.req.raw.headers) {
    const lk = k.toLowerCase();
    if (
      lk === 'upgrade' ||
      lk === 'connection' ||
      lk.startsWith('sec-websocket-')
    ) {
      forwardHeaders.set(k, v);
    }
  }

  // Set trusted internal headers
  forwardHeaders.set('X-NP-Kind', 'agent');
  forwardHeaders.set('X-NP-Server-Id', server.id);
  forwardHeaders.set('X-NP-Interval', String(server.interval_s));

  const forwardReq = new Request(c.req.url, {
    method: 'GET',
    headers: forwardHeaders,
  });

  const hubId = c.env.HUB.idFromName('main');
  const hubStub = c.env.HUB.get(hubId);
  return hubStub.fetch(forwardReq);
});
