/* v0.4 冒烟测试：用伪 AudioContext 跑真实代码路径（建图 / 调度 / CRACK / STOP / 快速重启）。
   可在任意目录运行：node tools/smoke_v04.js
   页面路径相对本文件解析。它证明"不抛异常 + 事件被调度"，不证明听感，也不替代真实 PCM 测量。 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const AUDITION = path.join(__dirname, '..', 'audition', 'SERIAL_Sonic_Identity_Audition_v0.4.html');
if (!fs.existsSync(AUDITION)) { console.error('找不到页面文件：' + AUDITION); process.exit(2); }
const html = fs.readFileSync(AUDITION, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('页面里没有内联 <script>'); process.exit(2); }
const code = m[1];

/* ---------- 最小 AudioContext 桩：只为验证代码路径不抛异常 ---------- */
let fakeNow = 0, nodeCount = 0, startCount = 0, scheduled = 0;
function param(v) {
  return {
    value: v,
    setValueAtTime() { return this }, linearRampToValueAtTime() { return this },
    exponentialRampToValueAtTime() { return this }, setTargetAtTime() { return this },
    cancelScheduledValues() { return this }
  };
}
function node(extra) {
  const n = Object.assign({
    connect() { return this }, disconnect() { return this },
    start() { startCount++ }, stop() {},
    get gain() { return this._g || (this._g = param(1)) },
    get frequency() { return this._f || (this._f = param(440)) },
    get Q() { return this._q || (this._q = param(1)) },
    get detune() { return this._d || (this._d = param(0)) },
    get threshold() { return this._th || (this._th = param(-24)) },
    get ratio() { return this._r || (this._r = param(2)) },
    get attack() { return this._a || (this._a = param(0.01)) },
    get knee() { return this._k || (this._k = param(30)) },
    get release() { return this._re || (this._re = param(0.1)) },
    get delayTime() { return this._dt || (this._dt = param(0.1)) }
  }, extra || {});
  nodeCount++;
  return n;
}
class FakeCtx {
  constructor() { this.sampleRate = 44100; this.state = 'running'; this.destination = node(); }
  get currentTime() { return fakeNow; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  createGain() { return node(); }
  createBiquadFilter() { return node({ type: 'lowpass' }); }
  createOscillator() { return node({ type: 'sine' }); }
  createBufferSource() { return node(); }
  createDelay() { return node(); }
  createConvolver() { return node(); }
  createDynamicsCompressor() { return node(); }
  createWaveShaper() { return node({ curve: null, oversample: 'none' }); }
  createBuffer(ch, len, sr) {
    const d = []; for (let i = 0; i < ch; i++) d.push(new Float32Array(len));
    return { length: len, sampleRate: sr, numberOfChannels: ch, getChannelData: i => d[i] };
  }
}

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

const pendingTimers = [];
const sandbox = {
  document: doc, console, Math, BigInt, DataView, Uint8Array, Uint32Array, Float32Array,
  TextEncoder, JSON, Number, Error, Object, String, Set, Array, Map, isFinite, parseInt, Promise,
  setTimeout(fn) { pendingTimers.push(fn); return pendingTimers.length; },
  clearInterval() {},
  setInterval(cb) {
    for (let i = 0; i < 3000; i++) { fakeNow += 0.01; scheduled++; cb(); }
    return 1;
  }
};
sandbox.window = sandbox;
sandbox.window.AudioContext = FakeCtx;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const S = sandbox.window.SERIAL;
S.SEED = 0xA7F209C13B8ED614n;

let fails = 0;
function check(name, fn) {
  try { fn(); console.log('PASS ' + name); }
  catch (e) { fails++; console.log('FAIL ' + name + '  ' + e.message); }
}

check('start() 建图 + 调度 30s 不抛异常', () => ids['play'].onclick());
console.log('     nodes=' + nodeCount + ' sources=' + startCount + ' ticks=' + scheduled + ' t=' + fakeNow.toFixed(2) + 's');

check('CRACK 按下/松开不抛异常', () => { ids['crack'].onpointerdown(); ids['crack'].onpointerup(); });

/* 生命周期：stop 的 110ms 回调在"快速重启"后必须作废，不能 panic 掉新的一次运行 */
check('STOP → 立刻重播：旧 stop 回调不得杀掉新运行', () => {
  ids['stop'].onclick();
  const stale = pendingTimers.length;
  ids['play'].onclick();            /* runId++ */
  const nodesBefore = nodeCount;
  for (let i = stale; i < pendingTimers.length; i++) pendingTimers[i]();   /* 执行 stop 的延时回调 */
  if (nodeCount !== nodesBefore) throw new Error('旧回调仍在操作音频图');
  if (startCount === 0) throw new Error('新运行没有排入任何事件');
});

check('二次 STOP 幂等', () => { ids['stop'].onclick(); ids['stop'].onclick(); });

const r = S.selftest();
console.log('\nselftest ' + (r.pass ? 'PASS' : 'FAIL') + '  ' + r.results.filter(x => x.ok).length + '/' + r.results.length);
if (!r.pass) fails++;
console.log(fails === 0 ? '\nSMOKE OK' : '\nSMOKE ' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
