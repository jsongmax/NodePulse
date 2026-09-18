import { spawn } from 'node:child_process';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'docs', 'screenshots', 'm3');
const COMPARE_DIR = path.join(OUT_DIR, 'compare');
const FRAMES_DIR = path.join(ROOT, 'docs', 'design', 'figma', 'frames');
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8787';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) {
          reject(new Error(msg.error.message));
        } else {
          resolve(msg.result);
        }
      } else if (msg.method) {
        for (const l of this.listeners) l(msg);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) =>
      this.pending.set(id, { resolve, reject })
    );
  }

  waitFor(method, sessionId, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners = this.listeners.filter((x) => x !== l);
        reject(new Error(`timeout waiting ${method}`));
      }, timeoutMs);
      const l = (msg) => {
        if (msg.method === method && msg.sessionId === sessionId) {
          clearTimeout(timer);
          this.listeners = this.listeners.filter((x) => x !== l);
          resolve(msg.params);
        }
      };
      this.listeners.push(l);
    });
  }
}

async function launchChrome() {
  const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!chrome) throw new Error('未找到 Chrome/Edge');
  const profile = await mkdtemp(path.join(tmpdir(), 'np-capture-'));
  const port = 9500 + Math.floor(Math.random() * 400);
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--window-size=1920,1080',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      wsUrl = (await res.json()).webSocketDebuggerUrl;
    } catch {
      await sleep(250);
    }
  }

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
  const cdp = new CDP(ws);

  const close = async () => {
    try {
      await cdp.send('Browser.close');
    } catch {
      /* ignore */
    }
    proc.kill();
    await sleep(300);
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  };

  return { cdp, close };
}

async function capturePage(cdp, route, width, height, theme = 'dark') {
  const { targetId } = await cdp.send('Target.createTarget', {
    url: 'about:blank',
  });
  const { sessionId } = await cdp.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  });

  try {
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 1, mobile: width < 768 },
      sessionId
    );

    const loaded = cdp.waitFor('Page.loadEventFired', sessionId);
    await cdp.send('Page.navigate', { url: BASE + route }, sessionId);
    await loaded;
    await sleep(2000);

    // Set theme
    await cdp.send(
      'Runtime.evaluate',
      {
        expression: `(() => {
          document.documentElement.setAttribute('data-theme', '${theme}');
          if ('${theme}' === 'dark') {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
          } else {
            document.documentElement.classList.add('light');
            document.documentElement.classList.remove('dark');
          }
        })()`,
      },
      sessionId
    );
    await sleep(600);

    const { data } = await cdp.send(
      'Page.captureScreenshot',
      { format: 'png' },
      sessionId
    );
    return Buffer.from(data, 'base64');
  } finally {
    await cdp.send('Target.closeTarget', { targetId });
  }
}

async function createComparison(cdp, figmaPngPath, actualPngBuffer, title, outPath) {
  if (!existsSync(figmaPngPath)) {
    console.warn(`跳过对比图生成，未找到设计稿原图: ${figmaPngPath}`);
    return;
  }

  const figmaBase64 = readFileSync(figmaPngPath).toString('base64');
  const actualBase64 = actualPngBuffer.toString('base64');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { margin: 0; background: #05070B; font-family: -apple-system, sans-serif; display: flex; flex-direction: column; }
        .header { background: #0A0E15; padding: 12px 24px; border-bottom: 1px solid rgba(255,255,255,0.1); color: #fff; font-size: 16px; font-weight: 600; display: flex; justify-content: space-between; }
        .columns { display: flex; flex: 1; }
        .col { flex: 1; display: flex; flex-direction: column; }
        .col-header { padding: 10px; text-align: center; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; background: #10161F; color: #94A3B3; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .col-left { border-right: 2px solid #38BDF8; }
        img { width: 100%; display: block; }
      </style>
    </head>
    <body>
      <div class="header">
        <span>NodePulse M3 视觉设计对比 · ${title}</span>
        <span style="color: #38BDF8; font-size: 13px;">左: Figma 设计稿 / 右: 实际实现</span>
      </div>
      <div class="columns">
        <div class="col col-left">
          <div class="col-header">Figma Design Frame</div>
          <img src="data:image/png;base64,${figmaBase64}">
        </div>
        <div class="col">
          <div class="col-header">Actual Implementation (Live)</div>
          <img src="data:image/png;base64,${actualBase64}">
        </div>
      </div>
    </body>
    </html>
  `;

  const { targetId } = await cdp.send('Target.createTarget', {
    url: 'about:blank',
  });
  const { sessionId } = await cdp.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  });

  try {
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 2880, height: 1800, deviceScaleFactor: 1, mobile: false },
      sessionId
    );
    const dataUrl =
      'data:text/html;base64,' + Buffer.from(html).toString('base64');
    await cdp.send('Page.navigate', { url: dataUrl }, sessionId);
    await sleep(2000);

    const { data } = await cdp.send(
      'Page.captureScreenshot',
      { format: 'png' },
      sessionId
    );
    await writeFile(outPath, Buffer.from(data, 'base64'));
    console.log(`✓ 已生成对比图: ${outPath}`);
  } finally {
    await cdp.send('Target.closeTarget', { targetId });
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(COMPARE_DIR, { recursive: true });

  console.log('启动 Chrome 截图引擎...');
  const { cdp, close } = await launchChrome();

  try {
    // 1. /login
    console.log('截取 /login ...');
    const loginDark1440 = await capturePage(cdp, '/login', 1440, 900, 'dark');
    await writeFile(path.join(OUT_DIR, 'login-1440x900-dark.png'), loginDark1440);
    const loginLight1440 = await capturePage(cdp, '/login', 1440, 900, 'light');
    await writeFile(path.join(OUT_DIR, 'login-1440x900-light.png'), loginLight1440);

    const loginDark1920 = await capturePage(cdp, '/login', 1920, 1080, 'dark');
    await writeFile(path.join(OUT_DIR, 'login-1920x1080-dark.png'), loginDark1920);

    const loginDark390 = await capturePage(cdp, '/login', 390, 844, 'dark');
    await writeFile(path.join(OUT_DIR, 'login-390x844-dark.png'), loginDark390);

    // 2. /setup
    console.log('截取 /setup ...');
    const setupDark = await capturePage(cdp, '/setup', 1440, 900, 'dark');
    await writeFile(path.join(OUT_DIR, 'setup-1440x900-dark.png'), setupDark);
    const setupLight = await capturePage(cdp, '/setup', 1440, 900, 'light');
    await writeFile(path.join(OUT_DIR, 'setup-1440x900-light.png'), setupLight);

    // 3. / (Dashboard)
    console.log('截取 / (总览) ...');
    const overviewDark = await capturePage(cdp, '/', 1440, 900, 'dark');
    await writeFile(path.join(OUT_DIR, 'overview-1440x900-dark.png'), overviewDark);
    const overviewLight = await capturePage(cdp, '/', 1440, 900, 'light');
    await writeFile(path.join(OUT_DIR, 'overview-1440x900-light.png'), overviewLight);

    // 4. /server/:id
    console.log('截取 /server/srv_demo0001 (详情) ...');
    const serverDark = await capturePage(cdp, '/server/srv_demo0001', 1440, 900, 'dark');
    await writeFile(path.join(OUT_DIR, 'server-detail-1440x900-dark.png'), serverDark);
    const serverLight = await capturePage(cdp, '/server/srv_demo0001', 1440, 900, 'light');
    await writeFile(path.join(OUT_DIR, 'server-detail-1440x900-light.png'), serverLight);

    // 5. /admin/servers
    console.log('截取 /admin/servers ...');
    const adminDark = await capturePage(cdp, '/admin/servers', 1440, 900, 'dark');
    await writeFile(path.join(OUT_DIR, 'admin-servers-1440x900-dark.png'), adminDark);
    const adminLight = await capturePage(cdp, '/admin/servers', 1440, 900, 'light');
    await writeFile(path.join(OUT_DIR, 'admin-servers-1440x900-light.png'), adminLight);

    // 6. Generate side-by-side comparison images
    console.log('生成对比图 (compare/)...');
    await createComparison(
      cdp,
      path.join(FRAMES_DIR, 'login-1440x900.png'),
      loginDark1440,
      '登录卡片 1440×900',
      path.join(COMPARE_DIR, 'compare-login-1440x900.png')
    );

    await createComparison(
      cdp,
      path.join(FRAMES_DIR, 'login-1920x1080.png'),
      loginDark1920,
      '登录卡片 1920×1080',
      path.join(COMPARE_DIR, 'compare-login-1920x1080.png')
    );

    await createComparison(
      cdp,
      path.join(FRAMES_DIR, 'login-390x844.png'),
      loginDark390,
      '登录卡片 手机 390×844',
      path.join(COMPARE_DIR, 'compare-login-390x844.png')
    );

    await createComparison(
      cdp,
      path.join(FRAMES_DIR, 'admin-servers-1440x900.png'),
      adminLight,
      '后台服务器管理 1440×900',
      path.join(COMPARE_DIR, 'compare-admin-servers-1440x900.png')
    );

    console.log('所有截图与对比图处理完成！');
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
