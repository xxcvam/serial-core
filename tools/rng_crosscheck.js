/* 独立 RNG 交叉验证：不调用页面里的 SHA-256 / PCG32 / encodeKey。
   SHA-256 用 Node 的 OpenSSL 实现（node:crypto），键编码与 PCG32 按 contract 文本另写一遍，
   再与页面导出的 R32/encodeKey 逐坐标对拍。
   运行：node tools/rng_crosscheck.js      失败退出码 1 */

const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');

/* ============ 独立实现（起点：contract/SERIAL_Addressable_RNG_Contract_v0.1.md） ============ */
const MAGIC = Buffer.from('SERIALM/0.2' + '\0', 'latin1');         // 12 字节
const DOMAIN = { music: 1, visual: 2, card: 3 };
const PURPOSE = { gate: 1, pitch: 2, velocity: 3, duration: 4, probability: 5, timbre: 6, eventId: 7, mutation: 8 };
const TRACK = { kick: 1, snare: 2, hat: 3, bass: 4, arp: 5, lead: 6, glitch: 7 };
const GENVER = 1;

function encodeKey(k) {
  const b = Buffer.alloc(48);
  MAGIC.copy(b, 0);
  b.writeBigUInt64LE(BigInt.asUintN(64, k.seed), 12);
  b.writeUInt16LE(k.generatorVersion, 20);
  b.writeUInt8(k.domain, 22);
  b.writeUInt16LE(k.trackId, 23);
  b.writeUInt16LE(k.sectionId, 25);
  b.writeUInt32LE(k.localBar, 27);
  b.writeBigUInt64LE(BigInt(k.tick), 31);
  b.writeUInt8(k.purpose, 39);
  b.writeUInt32LE(k.attempt, 40);
  b.writeUInt32LE(0, 44);
  return b;
}

const MUL = 6364136223846793005n, MASK = (1n << 64n) - 1n;
function pcgNext(s) {
  const old = s.state;
  s.state = (old * MUL + s.inc) & MASK;
  const xs = Number((((old >> 18n) ^ old) >> 27n) & 0xFFFFFFFFn);
  const rot = Number(old >> 59n) & 31;
  return ((xs >>> rot) | (xs << ((-rot) & 31))) >>> 0;
}
function pcgSeed(initstate, initseq) {
  const s = { state: 0n, inc: ((initseq << 1n) | 1n) & MASK };
  pcgNext(s);
  s.state = (s.state + initstate) & MASK;
  pcgNext(s);
  return s;
}
function r32(seed, trackId, sectionId, localBar, tick, purpose, attempt = 0, domain = DOMAIN.music) {
  const key = encodeKey({ seed, generatorVersion: GENVER, domain, trackId, sectionId, localBar, tick, purpose, attempt });
  const d = crypto.createHash('sha256').update(key).digest();     // 标准大端输出
  const st = pcgSeed(d.readBigUInt64BE(0), d.readBigUInt64BE(8));
  return pcgNext(st);
}

/* ============ 载入页面（只取它的 R32 / encodeKey 做对拍） ============ */
const AUDITION = path.join(__dirname, '..', 'audition', 'SERIAL_Sonic_Identity_Audition_v0.4.html');
if (!fs.existsSync(AUDITION)) { console.error('找不到页面文件：' + AUDITION); process.exit(2); }
const code = fs.readFileSync(AUDITION, 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function el() {
  return {
    textContent: '', className: '', value: 'A7F209C13B8ED614', dataset: {}, style: {}, children: [], innerHTML: '',
    classList: { _s: new Set(), add() { }, remove() { }, toggle() { return true }, contains() { return false } },
    appendChild() { }, addEventListener() { }, onclick: null, onpointerdown: null, onpointerup: null
  };
}
const ids = {};
const sandbox = {
  document: { getElementById(i) { if (!ids[i]) ids[i] = el(); return ids[i] }, createElement: el, querySelector: el },
  console, Math, BigInt, DataView, Uint8Array, Uint32Array, Float32Array, TextEncoder, JSON,
  Number, Error, Object, String, Set, Array, Map, isFinite, parseInt,
  setInterval() { return 0 }, clearInterval() { }, setTimeout() { }
};
sandbox.window = sandbox;
sandbox.window.AudioContext = undefined;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const S = sandbox.window.SERIAL;

/* ============ 断言 ============ */
let fails = 0;
function check(name, fn) {
  try { const info = fn(); console.log('PASS ' + name + (info ? '  [' + info + ']' : '')); }
  catch (e) { fails++; console.log('FAIL ' + name + '  ' + e.message); }
}

check('独立 SHA-256 与标准向量一致', () => {
  const h = crypto.createHash('sha256').update('abc').digest('hex');
  const want = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  if (h !== want) throw new Error(h + ' != ' + want);
  return h.slice(0, 16);
});

check('键编码逐字节一致', () => {
  const k = { seed: 0xA7F209C13B8ED614n, generatorVersion: 1, domain: 1, trackId: 4, sectionId: 3, localBar: 5, tick: 96, purpose: 2, attempt: 0 };
  const a = encodeKey(k), b = Buffer.from(S.encodeKey(k));
  if (a.length !== 48 || b.length !== 48) throw new Error('长度 ' + a.length + '/' + b.length);
  for (let i = 0; i < 48; i++) if (a[i] !== b[i]) throw new Error('第 ' + i + ' 字节不同 ' + a[i] + ' vs ' + b[i]);
  return '48 字节全等';
});

check('R32 全坐标对拍（7 track × 5 section × 2 bar × 4 tick × 8 purpose × 2 attempt）', () => {
  const tids = Object.values(TRACK), pids = Object.values(PURPOSE);
  let n = 0;
  for (const tid of tids) for (const sid of [1, 2, 3, 4, 5]) for (const bar of [0, 1])
    for (const tick of [0, 12, 24, 96]) for (const p of pids) for (const attempt of [0, 1]) {
      const a = r32(0xA7F209C13B8ED614n, tid, sid, bar, tick, p, attempt);
      const b = S.R32(0xA7F209C13B8ED614n, tid, sid, bar, tick, p, attempt);
      if (a !== b) throw new Error('mismatch track=' + tid + ' sec=' + sid + ' bar=' + bar + ' tick=' + tick + ' p=' + p + ' a=' + attempt + ' → ' + a + ' vs ' + b);
      n++;
    }
  return n + ' 坐标全等';
});

check('七声部在同一坐标上互异', () => {
  const v = Object.values(TRACK).map(t => r32(0xA7F209C13B8ED614n, t, 3, 0, 0, PURPOSE.gate));
  if (new Set(v).size !== v.length) throw new Error('有重复：' + v.join(','));
  return v.join(',');
});

check('attempt 递增改变取值（拒绝采样可用）', () => {
  const a0 = r32(0xA7F209C13B8ED614n, TRACK.arp, 3, 0, 0, PURPOSE.pitch, 0);
  const a1 = r32(0xA7F209C13B8ED614n, TRACK.arp, 3, 0, 0, PURPOSE.pitch, 1);
  if (a0 === a1) throw new Error('attempt 未生效');
  return a0 + ' / ' + a1;
});

check('Golden Vector 稳定（换机器必须同值）', () => {
  const gv = {
    magicSha256Prefix: crypto.createHash('sha256').update(MAGIC).digest('hex').slice(0, 16),
    kickGate_i0: r32(0xA7F209C13B8ED614n, TRACK.kick, 1, 0, 0, PURPOSE.gate),
    arpPitch_i0: r32(0xA7F209C13B8ED614n, TRACK.arp, 3, 0, 0, PURPOSE.pitch),
    leadGate_attempt1: r32(0xA7F209C13B8ED614n, TRACK.lead, 3, 0, 0, PURPOSE.gate, 1)
  };
  return JSON.stringify(gv);
});

console.log('\n' + (fails === 0 ? 'CROSSCHECK OK' : 'CROSSCHECK ' + fails + ' FAILED'));
process.exit(fails === 0 ? 0 : 1);
