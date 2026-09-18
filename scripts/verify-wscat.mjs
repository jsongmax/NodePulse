import { WebSocket } from 'ws';

const APP_ORIGIN = 'http://localhost:8787';
const VIEWER_WS_URL = 'ws://127.0.0.1:8787/ws/view';
const AGENT_WS_URL = 'ws://127.0.0.1:8787/ws/agent';
const AGENT_TOKEN =
  'np1.srv_demo0001.Pa2hbt5U5pCH0NLU27LLuEI_cQ93yC4gnvy8aiBEAiw';

console.log('=== Starting End-to-End WebSocket Verification ===\n');

async function runTest() {
  const viewerLogs = [];
  const agentLogs = [];

  function logViewer(direction, data) {
    const line = `[Viewer WS] ${direction} ${typeof data === 'string' ? data : JSON.stringify(data)}`;
    viewerLogs.push(line);
    console.log(line);
  }

  function logAgent(direction, data) {
    const line = `[Agent WS]  ${direction} ${typeof data === 'string' ? data : JSON.stringify(data)}`;
    agentLogs.push(line);
    console.log(line);
  }

  // 1. Connect Viewer
  console.log('1. Connecting Viewer to /ws/view...');
  const viewerWs = new WebSocket(VIEWER_WS_URL, {
    headers: {
      Origin: APP_ORIGIN,
    },
  });

  const viewerReadyPromise = new Promise((resolve, reject) => {
    viewerWs.on('open', () => {
      logViewer('CONNECTED', `Connected to ${VIEWER_WS_URL}`);
    });
    viewerWs.on('message', (msg) => {
      const parsed = JSON.parse(msg.toString());
      logViewer('RECEIVED', parsed);
      if (parsed.t === 'snapshot') {
        resolve(parsed);
      }
    });
    viewerWs.on('error', reject);
  });

  await viewerReadyPromise;
  console.log('✓ Viewer received snapshot.\n');

  // 2. Connect Agent
  console.log('2. Connecting Agent to /ws/agent...');
  const agentWs = new WebSocket(AGENT_WS_URL, {
    headers: {
      Authorization: `Bearer ${AGENT_TOKEN}`,
      'User-Agent': 'nodepulse-agent/1.0.0',
    },
  });

  let welcomeReceived = false;
  let deltaReceived = false;

  const agentReadyPromise = new Promise((resolve, reject) => {
    agentWs.on('open', () => {
      logAgent('CONNECTED', `Connected to ${AGENT_WS_URL}`);
      resolve();
    });
    agentWs.on('message', (msg) => {
      const parsed = JSON.parse(msg.toString());
      logAgent('RECEIVED', parsed);
      if (parsed.t === 'welcome') {
        welcomeReceived = true;
      }
    });
    agentWs.on('error', reject);
  });

  await agentReadyPromise;

  // 3. Agent sends hello
  console.log('3. Agent sending hello message...');
  const helloMsg = {
    t: 'hello',
    v: 1,
    agent: '1.0.0',
    host: {
      hostname: 'tokyo-demo-node',
      os: 'linux',
      platform: 'debian',
      platform_ver: '12',
      kernel: '6.1.0-21-amd64',
      arch: 'amd64',
      virt: 'kvm',
      cpu_model: 'AMD EPYC 7B13',
      cpu_cores: 2,
      mem_total: 2048000000,
      swap_total: 0,
      disk_total: 40000000000,
      boot_ts: 1758000000,
    },
    ip: { v4: '203.0.113.5', v6: null },
  };

  logAgent('SENT', helloMsg);
  agentWs.send(JSON.stringify(helloMsg));

  // Wait for welcome
  await new Promise((r) => setTimeout(r, 400));
  if (!welcomeReceived) {
    throw new Error('Agent did not receive welcome message');
  }
  console.log('✓ Agent received welcome, Viewer received server.online.\n');

  // 4. Agent sends sample
  console.log('4. Agent sending sample message...');
  const sampleMsg = {
    t: 's',
    ts: Math.floor(Date.now() / 1000),
    cpu: 24.5,
    ld: [0.35, 0.4, 0.38],
    mem: { u: 1024000000, t: 2048000000 },
    swp: { u: 0, t: 0 },
    dsk: [{ m: '/', u: 15000000000, t: 40000000000 }],
    net: {
      rx: 50000000,
      tx: 25000000,
      rxs: 1250000,
      txs: 640000,
    },
    cn: { tcp: 18, udp: 4 },
    pr: 95,
    up: 86400,
    tmp: 42.5,
  };

  // Listen for delta on viewer
  const deltaPromise = new Promise((resolve) => {
    viewerWs.on('message', (msg) => {
      const parsed = JSON.parse(msg.toString());
      if (parsed.t === 'delta') {
        deltaReceived = true;
        resolve(parsed);
      }
    });
  });

  logAgent('SENT', sampleMsg);
  agentWs.send(JSON.stringify(sampleMsg));

  await deltaPromise;
  console.log('✓ Viewer received delta!\n');

  // Cleanup
  agentWs.close();
  viewerWs.close();

  console.log('============================================================');
  console.log('🎉 Live WebSocket verification PASSED successfully!');
  console.log('============================================================\n');
}

runTest().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
