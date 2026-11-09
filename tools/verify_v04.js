/* v0.4 自测 + 事件统计。可在任意目录运行：node tools/verify_v04.js
   页面路径相对本文件解析，克隆到任何机器都不需要改。 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const AUDITION = path.join(__dirname, '..', 'audition', 'SERIAL_Sonic_Identity_Audition_v0.4.html');
if (!fs.existsSync(AUDITION)) {
  console.error('找不到页面文件：' + AUDITION);
  process.exit(2);
}
const html = fs.readFileSync(AUDITION, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('页面里没有内联 <script>'); process.exit(2); }
const code = m[1];

function el() {
  return {
    textContent: '', className: '', value: 'A7F209C13B8ED614', dataset: {}, style: {}, children: [], innerHTML: '',
    classList: {
      _s: new Set(), add(c) { this._s.add(c) }, remove(c) { this._s.delete(c) },
      toggle(c, v) { if (v === undefined) v = !this._s.has(c); v ? this._s.add(c) : this._s.delete(c); return v },
      contains(c) { return this._s.has(c) }
    },
    appendChild(c) { this.children.push(c) }, addEventListener() {}, onclick: null, onpointerdown: null, onpointerup: null
  };
}
const ids = {};
const doc = {
  getElementById(id) { if (!ids[id]) ids[id] = el(); return ids[id] },
  createElement() { return el() }, querySelector() { return el() }
};
const sandbox = {
  document: doc, console, setInterval() { return 0 }, clearInterval() {}, setTimeout() {},
  Math, BigInt, DataView, Uint8Array, Uint32Array, Float32Array, TextEncoder, JSON,
  Number, Error, Object, String, Set, Array, Map, isFinite, parseInt
};
sandbox.window = sandbox;
sandbox.window.AudioContext = undefined;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const S = sandbox.window.SERIAL;
if (!S) { console.error('页面未导出 window.SERIAL'); process.exit(2); }

const r = S.selftest();
console.log(r.results.map(x => (x.ok ? 'PASS ' : 'FAIL ') + x.n + (x.x ? '  [' + x.x + ']' : '')).join('\n'));
const failed = r.results.filter(x => !x.ok).length;
console.log('\n' + (failed === 0 ? 'ALL PASS (' + r.results.length + ')' : failed + ' FAILED / ' + r.results.length));

const PAT = S.build('B');
let n = 0; const per = {};
for (const sec of S.FORM04) {
  per[sec.name] = {};
  for (const bar of PAT[sec.id]) for (const e of bar) {
    for (const k of Object.keys(e)) { n++; per[sec.name][k] = (per[sec.name][k] || 0) + 1; }
  }
}
console.log('\nevents total ' + n);
for (const sec of S.FORM04) {
  const line = Object.entries(per[sec.name]).map(([k, v]) => k + ':' + v).join(' ');
  console.log(sec.name.padEnd(8) + ' bars=' + sec.bars + '  ' + line);
}

/* glitch 计划：位置分布与小节内落点，用于回归 P0 */
if (S.GL) {
  const bars = [];
  S.GL.forEach((arr, secId) => (arr || []).forEach((p, bi) => { for (const g of p) bars.push({ secId, bar: bi, tick: g.tick }); }));
  const front = bars.filter(g => g.tick < 96).length;
  const odd = bars.filter(g => g.tick % 24 !== 0).length;
  console.log('\nglitch events ' + bars.length + '  前1/4=' + front + '  奇数1/16落点=' + odd);
  console.log(bars.map(g => 's' + g.secId + 'b' + g.bar + 't' + g.tick).join(' '));
}
process.exit(failed === 0 ? 0 : 1);
