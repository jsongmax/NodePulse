import { execSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hubDir = path.resolve(__dirname, '../apps/hub');
const wranglerPath = path.resolve(hubDir, 'wrangler.jsonc');

console.log('=== NodePulse Cloudflare Setup ===\n');

function runCommand(cmd, cwd = hubDir) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8' });
  } catch {
    return null;
  }
}

async function putSecret(name, value) {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'pnpm.cmd' : 'pnpm';
    const child = spawn(cmd, ['wrangler', 'secret', 'put', name], {
      cwd: hubDir,
      stdio: ['pipe', 'inherit', 'inherit'],
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Failed to put secret ${name}, exit code ${code}`));
      }
    });

    child.stdin.write(value);
    child.stdin.end();
  });
}

async function main() {
  // Step 1: Check login status
  console.log('1. Checking Cloudflare login status...');
  const whoami = runCommand('pnpm wrangler whoami');
  if (
    !whoami ||
    whoami.includes('Not logged in') ||
    whoami.includes('OAuth token is invalid')
  ) {
    console.error(
      'Error: Please run `pnpm --filter @nodepulse/hub wrangler login` first.'
    );
    process.exit(1);
  }
  console.log('✓ Cloudflare authentication verified.\n');

  // Step 2: Create D1 database or get existing
  console.log('2. Provisioning D1 database (nodepulse)...');
  let databaseId = null;

  const createOutput = runCommand('pnpm wrangler d1 create nodepulse');
  if (createOutput) {
    const match =
      createOutput.match(/database_id\s*=\s*"([a-f0-9-]+)"/i) ||
      createOutput.match(/"database_id":\s*"([a-f0-9-]+)"/i);
    if (match) {
      databaseId = match[1];
    }
  }

  if (!databaseId) {
    // Attempt to list existing databases
    const listOutput = runCommand('pnpm wrangler d1 list --json');
    if (listOutput) {
      try {
        const dbs = JSON.parse(listOutput);
        const npDb = dbs.find((db) => db.name === 'nodepulse');
        if (npDb) {
          databaseId = npDb.uuid;
        }
      } catch {
        // Fall through
      }
    }
  }

  if (!databaseId) {
    console.error(
      'Failed to retrieve or create D1 database ID. Please inspect `wrangler d1 list`.'
    );
    process.exit(1);
  }
  console.log(`✓ D1 database ready: ${databaseId}\n`);

  // Step 3: Write back database_id into wrangler.jsonc
  console.log('3. Updating database_id in wrangler.jsonc...');
  let configRaw = fs.readFileSync(wranglerPath, 'utf-8');
  configRaw = configRaw.replace(
    /"database_id":\s*"[^"]*"/,
    `"database_id": "${databaseId}"`
  );
  fs.writeFileSync(wranglerPath, configRaw, 'utf-8');
  console.log('✓ apps/hub/wrangler.jsonc updated.\n');

  // Step 4: Run D1 migrations
  console.log('4. Applying D1 migrations on remote database...');
  execSync('pnpm wrangler d1 migrations apply nodepulse --remote', {
    cwd: hubDir,
    stdio: 'inherit',
  });
  console.log('✓ D1 migrations applied successfully.\n');

  // Step 5: Generate and upload secrets
  console.log(
    '5. Generating and configuring secrets (SETUP_TOKEN, TOKEN_PEPPER, MASTER_KEY)...'
  );
  const setupToken = crypto.randomBytes(32).toString('hex');
  const tokenPepper = crypto.randomBytes(32).toString('hex');
  const masterKey = crypto.randomBytes(32).toString('hex');

  await putSecret('SETUP_TOKEN', setupToken);
  await putSecret('TOKEN_PEPPER', tokenPepper);
  await putSecret('MASTER_KEY', masterKey);

  console.log('\n============================================================');
  console.log('🎉 Cloudflare infrastructure configured successfully!');
  console.log('============================================================');
  console.log('IMPORTANT: Your one-time SETUP_TOKEN is:');
  console.log(`\n  ${setupToken}\n`);
  console.log(
    'Save this token! You will need it to initialize your admin Passkey'
  );
  console.log('at https://<your-worker-subdomain>.workers.dev/setup');
  console.log('============================================================\n');
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
