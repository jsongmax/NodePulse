import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pepper = 'local_dev_pepper_32_bytes_random_dev_val';
const serverId = 'srv_demo0001';
const secretBytes = crypto.randomBytes(32);
const secretBase64Url = secretBytes.toString('base64url');
const fullToken = `np1.${serverId}.${secretBase64Url}`;

const tokenHash = crypto
  .createHmac('sha256', pepper)
  .update(secretBase64Url)
  .digest('hex');
const now = Math.floor(Date.now() / 1000);

console.log('Seeding local D1 database for wscat testing...');
console.log(`Server ID: ${serverId}`);
console.log(`Agent Token: ${fullToken}`);

const sql = `
INSERT INTO settings (key, value) VALUES ('public_mode', '1') ON CONFLICT(key) DO UPDATE SET value = '1';
INSERT INTO settings (key, value) VALUES ('site_name', 'NodePulse Live Demo') ON CONFLICT(key) DO UPDATE SET value = 'NodePulse Live Demo';
INSERT INTO servers (
  id, name, group_id, token_hash, token_prefix, note, sort_order, public,
  interval_s, created_at, updated_at
) VALUES (
  '${serverId}', 'Demo Server 1', NULL, X'${tokenHash}', '${fullToken.slice(0, 6)}', 'Local Demo', 0, 1,
  10, ${now}, ${now}
) ON CONFLICT(id) DO UPDATE SET token_hash = X'${tokenHash}';
`;

execSync(
  `pnpm --filter @nodepulse/hub exec wrangler d1 execute nodepulse --local --command "${sql.replace(/\n/g, ' ')}"`,
  {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  }
);

console.log('Seeding completed successfully!');
console.log('\nUse these commands to test live wscat:');
console.log(
  `Viewer: npx wscat -c "ws://127.0.0.1:8787/ws/view" -H "Origin: http://localhost:8787"`
);
console.log(
  `Agent:  npx wscat -c "ws://127.0.0.1:8787/ws/agent" -H "Authorization: Bearer ${fullToken}" -H "User-Agent: nodepulse-agent/1.0.0"`
);
