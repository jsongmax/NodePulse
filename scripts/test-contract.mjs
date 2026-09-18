import { spawnSync } from 'node:child_process';
import process from 'node:process';
import {
  agentHelloSchema,
  agentSampleSchema,
} from '../packages/protocol/src/agent.ts';

function runGoGen(type) {
  const env = { ...process.env };
  if (process.platform === 'win32') {
    env.GOOS = 'windows';
  }
  const res = spawnSync('go', ['run', './cmd/gen-contract-json', '-type', type], {
    cwd: 'agent',
    encoding: 'utf8',
    env,
  });

  if (res.status !== 0) {
    console.error(`Error running go gen for ${type}:`, res.stderr);
    process.exit(1);
  }

  return JSON.parse(res.stdout);
}

console.log('Validating Go generated Hello with @nodepulse/protocol zod schema...');
const helloJson = runGoGen('hello');
const helloResult = agentHelloSchema.safeParse(helloJson);
if (!helloResult.success) {
  console.error('Hello validation failed:', JSON.stringify(helloResult.error.format(), null, 2));
  process.exit(1);
}
console.log('✓ Go Hello matches agentHelloSchema');

console.log('Validating Go generated Sample with @nodepulse/protocol zod schema...');
const sampleJson = runGoGen('sample');
const sampleResult = agentSampleSchema.safeParse(sampleJson);
if (!sampleResult.success) {
  console.error('Sample validation failed:', JSON.stringify(sampleResult.error.format(), null, 2));
  process.exit(1);
}
console.log('✓ Go Sample matches agentSampleSchema');

console.log('Validating Go generated Sample with Bucket with @nodepulse/protocol zod schema...');
const sampleBucketJson = runGoGen('sample_with_bucket');
const sampleBucketResult = agentSampleSchema.safeParse(sampleBucketJson);
if (!sampleBucketResult.success) {
  console.error('Sample with Bucket validation failed:', JSON.stringify(sampleBucketResult.error.format(), null, 2));
  process.exit(1);
}
console.log('✓ Go Sample with Bucket matches agentSampleSchema');

console.log('All agent contract schema validations passed!');
