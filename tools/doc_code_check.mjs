// Verifies the code blocks *as written in the doc* actually run in Chromium.
// Loads the v0.4 audition page, then evaluates doc blocks [0]=leadWaves, [4]=vLead,
// [5]=bus chain inside an OfflineAudioContext, renders one note.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MD = 'F:/dsh/serial-repo/docs/SERIAL_Lead_Rework_and_Rise_Layers_v0.5.md';
const PAGE = 'file:///F:/dsh/serial-repo/audition/SERIAL_Sonic_Identity_Audition_v0.4.html';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9337;

const md = readFileSync(MD, 'utf8');
const blocks = [...md.matchAll(/```js\n([\s\S]*?)```/g)].map(m => m[1]);

const expr = `(async()=>{
  const oc=new OfflineAudioContext(2, 48000*3, 48000);
  ctx=oc;
  const comp=oc.createGain(); comp.gain.value=1; comp.connect(oc.destination);
${blocks[5]}
  G={leadBus};
${blocks[0]}
${blocks[4]}
  const notes=[[440,3,1600],[988,1.6,2400],[174.6,8,900]];
  for(const [f,len,cut] of notes) vLead(0.05,{f,v:0.3,len,cut});
  const b=await oc.startRendering();
  const d=b.getChannelData(0);
  let pk=0,rms=0;
  for(let i=0;i<d.length;i++){ pk=Math.max(pk,Math.abs(d[i])); rms+=d[i]*d[i]; }
  return {blocks:${blocks.length}, peak:+pk.toFixed(4), rms:+(Math.sqrt(rms/d.length)).toFixed(5),
          finite: Number.isFinite(pk)};
})()`;

const userDir = mkdtempSync(join(tmpdir(), 'serial-doc-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--allow-file-access-from-files', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDir}`, PAGE], { stdio: 'ignore' });

const wait = ms => new Promise(r => setTimeout(r, ms));
let code = 1;
try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = l.find(t => t.type === 'page' && t.url.includes('SERIAL'));
    } catch { }
    if (!target) await wait(300);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = (id, method, params) => new Promise(res => {
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id === id) res(m); };
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send(1, 'Runtime.enable', {});
  for (let i = 0; i < 40; i++) {
    const m = await send(2, 'Runtime.evaluate', { expression: '!!(window.SERIAL && window.SERIAL.PAT)', returnByValue: true });
    if (m.result?.result?.value) break;
    await wait(250);
  }
  const m = await send(3, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (m.result?.exceptionDetails) { console.error('EXC', JSON.stringify(m.result.exceptionDetails).slice(0, 1500)); }
  else { console.log(JSON.stringify(m.result.result.value)); code = 0; }
  ws.close();
} catch (e) { console.error('FAILED', e.message); }
finally { chrome.kill(); }
process.exit(code);
