/**
 * lead_ab_test.mjs — Lead 音色三档 A/B/C 的真实渲染对照
 *
 * 为什么单独一个脚本：音色轴必须与旋律轴分开验，且三档要在「同一组事件、同一
 * 滤波包络、同一发送」下**等响度**比较，否则听的人分不清差异来自音色还是电平。
 *
 * 做法：真 Chromium + OfflineAudioContext，solo=lead，同一 Seed/Scheme/窗口，
 * 只切 window.SERIAL.leadVoice。
 * 判据：三档都出声、无削波、RMS 极差 ≤ 1.0 dB（等响度门槛）。
 * 用法：node tools/lead_ab_test.mjs [--seconds 12] [--section 3]
 * 退出码：0 通过 / 1 失败 / 2 缺文件或缺 Chrome
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
const SECONDS = Number(argOf('seconds', 12));
const SECTION = Number(argOf('section', 3));   // CLIMAX
const SEED = argOf('seed', '1234567890123');

if (!existsSync(PAGE)) { console.error('MISSING page: ' + PAGE); process.exit(2); }
const chrome = CHROMES.find((p) => existsSync(p));
if (!chrome) { console.error('MISSING chrome'); process.exit(2); }

const PORT = 9677 + (process.pid % 200);
const profile = mkdtempSync(join(tmpdir(), 'lpa-'));
const child = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--mute-audio', '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, pathToFileURL(PAGE).href,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const die = (msg, code = 1) => { console.error(msg); try { child.kill(); } catch {} process.exit(code); };

async function targets() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p;
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
      let m; try { m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); } catch { return; }
      if (m.id !== myId) return;
      ws.removeEventListener('message', onMsg);
      if (m.error) reject(new Error(JSON.stringify(m.error))); else resolve(m.result);
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}

async function evaluate(ws, expression) {
  const res = await rpc(ws, 'Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true, userGesture: true, timeout: 180000,
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'eval error');
  }
  return res.result.value;
}

const page = await targets();
if (!page) die('chrome 未就绪（CDP ' + PORT + '）', 2);
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
await rpc(ws, 'Runtime.enable', {});

for (let i = 0; i < 100; i++) {
  const ok = await evaluate(ws, 'typeof window.__renderPCM').catch(() => 'unknown');
  if (ok === 'function') break;
  if (i === 99) die('页面未暴露 __renderPCM', 2);
  await sleep(100);
}

const rows = [];
let bad = 0;
for (const mode of ['A', 'B', 'C']) {
  const r = await evaluate(ws,
    `(function(){ SERIAL.leadVoice='${mode}'; return __renderPCM(${SEED},'A',${SECONDS},${SECTION},'lead'); })()`);
  rows.push([mode, r]);
  if (!(r.peak > 0.01)) { console.error(`FAIL ${mode} 无声 peak=${r.peak}`); bad++; }
  if (r.clip > 0) { console.error(`FAIL ${mode} 削波 ${r.clip}`); bad++; }
}
const rmss = rows.map(([, r]) => r.rmsDb);
const spread = Math.max(...rmss) - Math.min(...rmss);
if (spread > 1.0) { console.error(`FAIL 三档不等响：极差 ${spread.toFixed(2)} dB`); bad++; }

// 全混音：B/C 峰值更高（pulse+FM 波峰因数大），必须验证不削波
const mix = [];
for (const mode of ['A', 'B', 'C']) {
  const r = await evaluate(ws,
    `(function(){ SERIAL.leadVoice='${mode}'; return __renderPCM(${SEED},'A',${SECONDS},${SECTION}); })()`);
  mix.push([mode, r]);
  if (r.clip > 0) { console.error(`FAIL ${mode} 全混音削波 ${r.clip}`); bad++; }
  if (!(r.peakDb < -0.3)) { console.error(`FAIL ${mode} 全混音峰顶过近 0 dBFS：${r.peakDb}`); bad++; }
}

// 旋律轴：CLIMAX 的音乐内容在两种规则下几乎一致（实测 0/32 音高不同），
// 差异只在 RISE（5/16，A 方案），所以这里用 RISE 段落比对，不做等响度要求。
const RISE_SEC = 2;
const mel = [];
for (const m of ['CURRENT', 'CHORD']) {
  const r = await evaluate(ws,
    `(function(){ SERIAL.leadVoice='B'; SERIAL.melody='${m}'; return __renderPCM(${SEED},'A',6,${RISE_SEC},'lead'); })()`);
  mel.push([m, r]);
  if (!(r.peak > 0.01)) { console.error(`FAIL MELODY=${m} 无声 peak=${r.peak}`); bad++; }
}
await evaluate(ws, `SERIAL.melody='CURRENT'`);

for (const [mode, r] of rows) {
  console.log(`LEAD ${mode} solo  peak=${String(r.peak).padEnd(7)} (${String(r.peakDb).padStart(6)} dBFS)  ` +
    `rms=${String(r.rmsDb).padStart(6)} dB  clip=${r.clip}`);
}
console.log(`等响度极差 ${spread.toFixed(2)} dB（门槛 ≤1.0）`);
for (const [mode, r] of mix) console.log(`LEAD ${mode} full  peak=${String(r.peakDb).padStart(6)} dBFS  rms=${String(r.rmsDb).padStart(6)} dB  clip=${r.clip}`);
for (const [m, r] of mel) console.log(`MELODY ${m.padEnd(8)} RISE peak=${String(r.peak).padEnd(7)} rms=${String(r.rmsDb).padStart(6)} dB`);

try { ws.close(); } catch {}
child.kill();
await sleep(120);

if (bad) { console.error('\nLEAD A/B/C FAIL (' + bad + ')'); process.exit(1); }
console.log('\nLEAD A/B/C OK — 三档同事件、等响度、无削波');
process.exit(0);
