/**
 * pcm_render.mjs — 真实 Chromium WebAudio 离线渲染验收
 *
 * 为什么需要它：verify_v04.js 只做数据层断言，从不发声。合成器是否真的出声、
 * 是否削波、段落亮度是否可听，只能在真实 AudioContext 里渲染 PCM 后测量。
 *
 * 依赖：本机 Chrome（--remote-debugging-port + CDP），零 npm 依赖。
 * 用法：node tools/pcm_render.mjs [--seconds 8] [--section 1]
 * 退出码：0 全部场景通过 / 1 有场景失败 / 2 找不到 Chrome 或页面
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = join(HERE, '..', 'audition', 'SERIAL_Sonic_Identity_Audition_v0.4.html');
const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

const args = process.argv.slice(2);
const argOf = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const SECONDS = Number(argOf('seconds', 8));
const SECTION = Number(argOf('section', 1));

if (!existsSync(PAGE)) {
  console.error('MISSING page: ' + PAGE);
  process.exit(2);
}
const chrome = CHROMES.find((p) => existsSync(p));
if (!chrome) {
  console.error('MISSING chrome（找过 ' + CHROMES.length + ' 个路径）');
  process.exit(2);
}

const PORT = 9411 + (process.pid % 200);
const profile = mkdtempSync(join(tmpdir(), 'pw-'));
const child = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  pathToFileURL(PAGE).href,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { console.error('FAIL ' + msg); try { child.kill(); } catch {} process.exit(1); };

async function targets() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {}
    await sleep(100);
  }
  return null;
}

let id = 0;
function rpc(ws, method, params) {
  const myId = ++id;
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      let m;
      try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); } catch { return; }
      if (m.id !== myId) return;
      ws.removeEventListener('message', onMsg);
      if (m.error) reject(new Error(JSON.stringify(m.error)));
      else resolve(m.result);
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}

async function evaluate(ws, expression) {
  const res = await rpc(ws, 'Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true, userGesture: true, timeout: 120000,
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'eval error');
  }
  return res.result.value;
}

const page = await targets();
if (!page) fail('chrome 未就绪（CDP 端口 ' + PORT + '）');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
await rpc(ws, 'Runtime.enable', {});

// 页面脚本就绪
for (let i = 0; i < 100; i++) {
  const ok = await evaluate(ws, 'typeof window.__renderPCM').catch(() => 'unknown');
  if (ok === 'function') break;
  if (i === 99) fail('页面未暴露 __renderPCM');
  await sleep(100);
}

const results = [];
let bad = 0;

// 场景 1：全混音 GROOVE（默认 Seed / Scheme A）
const groove = await evaluate(ws, `__renderPCM(1234567890123,'A',${SECONDS},${SECTION})`);
results.push(['GROOVE 全混音', groove]);
if (!(groove.peak > 0.02)) { console.error('FAIL 无声：peak=' + groove.peak); bad++; }
if (groove.peakDb > -0.3) { console.error('FAIL 削波风险：peak=' + groove.peakDb + ' dBFS'); bad++; }
if (groove.clip > 0) { console.error('FAIL 采样级削波 ' + groove.clip + ' samples'); bad++; }

// 场景 2：CLIMAX 必须比 GROOVE 响（同一 Seed）
const climax = await evaluate(ws, `__renderPCM(1234567890123,'A',${SECONDS},3)`);
results.push(['CLIMAX 全混音', climax]);
if (!(climax.rmsDb > groove.rmsDb + 0.5)) {
  console.error(`FAIL CLIMAX 不比 GROOVE 响：${climax.rmsDb} vs ${groove.rmsDb} dB`);
  bad++;
}

// 场景 3：BREAK 必须明显更轻（BREAK 只有 4 小节 ≈ 6.9s，窗口必须落在段内）
const brk = await evaluate(ws, `__renderPCM(1234567890123,'A',6,4)`);
results.push(['BREAK 全混音', brk]);
if (!(brk.rmsDb < groove.rmsDb - 3.0)) {
  console.error(`FAIL BREAK 未明显降低：${brk.rmsDb} vs ${groove.rmsDb} dB`);
  bad++;
}

// 场景 4：三个不同 Seed 都出声且不削波
for (const seed of [20260101, 777, 4242424242]) {
  const r = await evaluate(ws, `__renderPCM(${seed},'A',3,1)`);
  results.push([`Seed ${seed}`, r]);
  if (!(r.peak > 0.02) || r.clip > 0) { console.error(`FAIL Seed ${seed} peak=${r.peak} clip=${r.clip}`); bad++; }
}

for (const [name, r] of results) {
  console.log(
    name.padEnd(16) +
    `peak=${String(r.peak).padEnd(7)} (${String(r.peakDb).padStart(6)} dBFS)  ` +
    `rms=${String(r.rmsDb).padStart(6)} dB  clip=${r.clip}`,
  );
}

try { ws.close(); } catch {}
child.kill();
await sleep(120);

if (bad) { console.error('\nPCM RENDER FAIL (' + bad + ')'); process.exit(1); }
console.log('\nPCM RENDER OK — 真实 Chromium WebAudio 渲染，' + results.length + ' 场景');
process.exit(0);
