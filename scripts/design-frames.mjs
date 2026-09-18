#!/usr/bin/env node
/**
 * design-frames.mjs — 抓取 Figma Make 发布站点的各页面/场景/分辨率截图到 docs/design/figma/frames/
 *
 * 零依赖：用本机 Chrome 的 DevTools Protocol（Node 22+ 自带 fetch / WebSocket）。
 * 用法：
 *   node scripts/design-frames.mjs                 # 抓取全部
 *   node scripts/design-frames.mjs wall-map login  # 只抓指定名称
 *   CHROME_PATH=... DESIGN_BASE_URL=... node scripts/design-frames.mjs
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'docs', 'design', 'figma', 'frames');
const BASE =
  process.env.DESIGN_BASE_URL ?? 'https://prong-froth-69885592.figma.site';

const SIZES = {
  '1920x1080': [1920, 1080],
  '3840x2160': [3840, 2160],
  '3440x1440': [3440, 1440],
  '1080x1920': [1080, 1920],
  '1440x900': [1440, 900],
  '390x844': [390, 844],
};
const WALL_SIZES = ['1920x1080', '3840x2160', '3440x1440', '1080x1920'];

/** name → 输出文件名前缀；path → 路由；keys → 加载后按键；click → 加载后按文本点击；settle → 加载后等待 ms */
const FRAMES = [
  { name: 'login', path: '/', sizes: ['1920x1080', '1440x900', '390x844'] },
  { name: 'wall-map', path: '/wall', sizes: WALL_SIZES, settle: 7000 },
  {
    name: 'wall-grid',
    path: '/wall',
    sizes: ['1920x1080', '3840x2160'],
    keys: ['2'],
    settle: 7000,
  },
  {
    name: 'wall-focus',
    path: '/wall',
    sizes: ['1920x1080'],
    keys: ['3'],
    settle: 7000,
  },
  {
    name: 'wall-alerts',
    path: '/wall',
    sizes: ['1920x1080'],
    keys: ['4'],
    settle: 7000,
  },
  { name: 'admin-servers', path: '/admin', sizes: ['1440x900'] },
  // Make 目前只实现了"服务器"页；下面四个导航项点击无效。Make 补做后取消注释即可。
  // { name: 'admin-rules', path: '/admin', sizes: ['1440x900'], click: '告警规则' },
  // { name: 'admin-notify', path: '/admin', sizes: ['1440x900'], click: '通知' },
  // { name: 'admin-security', path: '/admin', sizes: ['1440x900'], click: '安全' },
  // { name: 'admin-settings', path: '/admin', sizes: ['1440x900'], click: '设置' },
];

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
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
  if (!chrome) throw new Error('未找到 Chrome/Edge，请设置 CHROME_PATH');
  const profile = await mkdtemp(path.join(tmpdir(), 'np-frames-'));
  const port = 9300 + Math.floor(Math.random() * 500);
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
      '--window-size=3840,2160',
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
  if (!wsUrl) {
    proc.kill();
    throw new Error('Chrome 未在 15 s 内就绪');
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

async function capture(cdp, frame, sizeKey) {
  const [width, height] = SIZES[sizeKey];
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
    await cdp.send('Page.navigate', { url: BASE + frame.path }, sessionId);
    await loaded;
    await sleep(frame.settle ?? 4000);
    if (frame.click) {
      const expr = `(() => { const el=[...document.querySelectorAll('a,button,[role=button],li,span,div')].find(e=>e.children.length<=2 && e.textContent.trim()===${JSON.stringify(frame.click)}); if(el){el.click();return 'ok'} return 'not-found' })()`;
      const r = await cdp.send(
        'Runtime.evaluate',
        { expression: expr, returnByValue: true },
        sessionId
      );
      if (r.result.value !== 'ok')
        console.warn(`  ! 未找到可点击文本 "${frame.click}"`);
      await sleep(1800);
    }
    for (const key of frame.keys ?? []) {
      const code = /^\d$/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`;
      const vk = key.toUpperCase().charCodeAt(0);
      await cdp.send(
        'Input.dispatchKeyEvent',
        { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, text: key },
        sessionId
      );
      await cdp.send(
        'Input.dispatchKeyEvent',
        { type: 'keyUp', key, code, windowsVirtualKeyCode: vk },
        sessionId
      );
      await sleep(2500);
    }
    const { data } = await cdp.send(
      'Page.captureScreenshot',
      { format: 'png' },
      sessionId
    );
    const file = path.join(OUT_DIR, `${frame.name}-${sizeKey}.png`);
    await writeFile(file, Buffer.from(data, 'base64'));
    console.log(`  ✓ ${path.relative(ROOT, file)}`);
  } finally {
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

async function main() {
  const only = process.argv.slice(2);
  const frames = only.length
    ? FRAMES.filter((f) => only.includes(f.name))
    : FRAMES;
  if (!frames.length)
    throw new Error(
      `未知名称：${only.join(', ')}；可用：${FRAMES.map((f) => f.name).join(', ')}`
    );
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`基地址 ${BASE}\n输出到 ${path.relative(ROOT, OUT_DIR)}\n`);
  const { cdp, close } = await launchChrome();
  try {
    for (const frame of frames) {
      console.log(
        `${frame.name}  (${frame.path}${frame.click ? ` → 点击 "${frame.click}"` : ''}${frame.keys ? ` → 按键 ${frame.keys.join(',')}` : ''})`
      );
      for (const size of frame.sizes) {
        try {
          await capture(cdp, frame, size);
        } catch (e) {
          console.error(`  ✗ ${frame.name}-${size}: ${e.message}`);
        }
      }
    }
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
