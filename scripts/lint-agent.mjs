import { spawnSync } from 'node:child_process';
import process from 'node:process';

const res = spawnSync('go', ['vet', './...'], {
  cwd: 'agent',
  stdio: 'inherit',
});

if (res.status !== 0) {
  process.exit(res.status ?? 1);
}
