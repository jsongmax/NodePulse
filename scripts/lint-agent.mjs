import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_DIR = path.join(ROOT, 'agent');

// 1. Run go vet
console.log('Running go vet ./... in agent...');
const vetRes = spawnSync('go', ['vet', './...'], {
  cwd: 'agent',
  stdio: 'inherit',
});

if (vetRes.status !== 0) {
  process.exit(vetRes.status ?? 1);
}

// 2. Security grep gate: ban os/exec, net.Listen, syscall.Exec per SECURITY §9 & §14
console.log('Running security capability gate for Go agent...');
const FORBIDDEN_PATTERNS = [
  { re: /\bos\/exec\b/, name: 'os/exec' },
  { re: /\bnet\.Listen\b/, name: 'net.Listen' },
  { re: /\bsyscall\.Exec\b/, name: 'syscall.Exec' },
];

function scanDir(dir) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      scanDir(fullPath);
    } else if (entry.endsWith('.go')) {
      const content = readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comment lines
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*')) {
          continue;
        }
        for (const { re, name } of FORBIDDEN_PATTERNS) {
          if (re.test(line)) {
            console.error(
              `\x1b[31mSECURITY VIOLATION\x1b[0m in ${path.relative(ROOT, fullPath)}:${i + 1}:`
            );
            console.error(`  Line: ${line.trim()}`);
            console.error(
              `  Matched forbidden API: \x1b[1m${name}\x1b[0m (Strictly forbidden by SECURITY §9 & §14)`
            );
            process.exit(1);
          }
        }
      }
    }
  }
}

scanDir(AGENT_DIR);
console.log('✓ Agent security capability gate passed (0 forbidden APIs found).');
