import { spawnSync } from 'node:child_process';
import process from 'node:process';

const env = { ...process.env };
if (process.platform === 'win32') {
  env.GOOS = 'windows';
}

const res = spawnSync('go', ['test', './...'], {
  cwd: 'agent',
  stdio: 'inherit',
  env,
});

if (res.status !== 0) {
  process.exit(res.status ?? 1);
}
