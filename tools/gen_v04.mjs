/* SERIAL v0.4 参考生成器：Form 层（共用）+ 动机层（A/B）
   复用 v0.3 页面的 R32（同一 48 字节键 + PCG32），不改音频引擎。
   运行：node F:\dsh\tmp\serial_probe\gen_v04.mjs
*/
import fs from 'node:fs';

/* ---------- 载入 v0.3 的 R32 / FORM / PAT ---------- */
const html = fs.readFileSync('F:/dsh/SERIAL_Sonic_Identity_Audition_v0.3.html', 'utf8');
const code = html.match(/<script>([\s\S]*)<\/script>/)[1];
const store = new Map();
const mkEl = id => ({
  id, value: id === 'seed' ? 'A7F209C13B8ED614' : '', textContent: '', innerHTML: '', dataset: {}, children: [], style: {},
  classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, f) { if (f === undefined) this._s.has(c) ? this._s.delete(c) : this._s.add(c); else f ? this._s.add(c) : this._s.delete(c); } },
  appendChild(c) { this.children.push(c); }, addEventListener() {}, onclick: null,
});
const doc = { getElementById(id) { if (!store.has(id)) store.set(id, mkEl(id)); return store.get(id); }, createElement: () => mkEl('el') };
const win = {};
new Function('document', 'window', 'setInterval', 'clearInterval', 'setTimeout', code)(doc, win, () => 0, () => 0, () => 0);
const S = win.SERIAL;
const SEED = S.SEED;

const TID = S.TRACK_ID;
const PU = { gate: 1, pitch: 2, velocity: 3, duration: 4, probability: 5, timbre: 6, eventId: 7, mutation: 8 };
const r32 = (tr, sec, bar, tick, p, att = 0) => S.R32(SEED, TID[tr], sec, bar, tick, PU[p], att);
const jitter = (tr, sec, bar, st) => ((r32(tr, sec, bar, st * 24, 'velocity', 1) >>> 8) / 16777216 - 0.5) * 0.04;

const hz = (root, semi) => root * Math.pow(2, semi / 12);
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nmSemi = (s, anchor = 69) => { const m = Math.round(s) + anchor; return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); };
const popcount = m => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };
const bit = (m, i) => (m >> i) & 1;
function euclid(n, k) {
  const p = new Uint8Array(n); let b = 0;
  for (let i = 0; i < n; i++) { b += k; if (b >= n) { b -= n; p[(i + 1) % n] = 1; } }
  return p;
}
const EU_BASS = euclid(16, 5);
const EU_KICK = euclid(16, 4);      // 0,4,8,12 —— 与 v0.3 同一函数
const EU_HAT = euclid(16, 8);       // 0,2,4,...,14
const SNARE_STEPS = [4, 12];        // v0.3 手写骨架，不随机

/* ---------- 音乐材料（两方案共用音高系统） ---------- */
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];              // A 自然小调
const VOICING = [
  [0, 3, 7, 10],   // 0 Am7    A3 C4 E4 G4
  [-4, 0, 3, 7],   // 1 Fmaj7  F3 A3 C4 E4
  [3, 7, 10, 14],  // 2 Cmaj7  C4 E4 G4 B4
  [-2, 2, 5, 7],   // 3 G6     G3 B3 D4 E4
];
const CHORD_LOOP = [0, 1, 2, 3];

/* ---------- 动机层 A / B ---------- */
const LEAD_CELLS = {
  HOLD: { steps: [7], len: 8.0 },
  ANTE: { steps: [3, 11], len: 3.0 },
  RESP: { steps: [2, 8, 14], len: 2.0 },
  PUSH: { steps: [1, 5, 9, 13], len: 1.6 },
  ROLL: { steps: [1, 3, 5, 7, 9, 11, 13, 15], len: 1.2 },
};
const PHRASE = {   // 音级（A 自然小调级数），句末落点是有意的
  A: [0, 2, 4, 1],   // A C E B  → 落 9 度，悬
  B: [4, 3, 2, 0],   // E D C A  → 落主音
  C: [0, 4, 5, 6],   // A E F G  → 落 7 度，推进
  D: [6, 4, 3, 2],   // G E D C  → 落 3 度，收
};
function xform(degs, op) {
  const d = degs.slice();
  switch (op) {
    case 'T+1': return d.map(x => x + 1);
    case 'T+2': return d.map(x => x + 2);
    case 'T-1': return d.map(x => x - 1);
    case 'T-2': return d.map(x => x - 2);
    case 'R': return d.reverse();
    case 'I': return d.map(x => 2 * d[0] - x);
    case 'O': return d.map((x, i) => (i === d.length - 1 ? x + 7 : x));
    case 'RO': return d.reverse().map((x, i, a) => (i === a.length - 1 ? x + 7 : x));
    default: return d;
  }
}

/* ---------- Form 层（共用） ---------- */
const REP = (v, n) => Array(n).fill(v);
const S4 = 0x1111, S8 = 0x5555, S16 = 0x7777, FULL = 0xffff, Z = 0;   // arp 占格 mask
const ON = 1, OFF = 0;                                  // 鼓组逐小节开关

const FORM04 = [
  { id: 0, name: 'INTRO', bars: 4, density: 70, lead: false,
    arpMask: [S4, S4, S8, S8], cut: [900, 1000, 1100, 1200], lift: [0, 0, 0, 1],
    kick: REP(OFF, 4), snare: REP(OFF, 4), hat: REP(OFF, 4), glitch: REP(OFF, 4) },

  { id: 1, name: 'GROOVE', bars: 8, density: 88, lead: true,
    arpMask: REP(S8, 8), cut: [1700, 1800, 1900, 2000, 1850, 1950, 2050, 2150], lift: REP(0, 8),
    kick: REP(ON, 8), snare: REP(ON, 8), hat: REP(ON, 8), glitch: REP(OFF, 8),
    cellsA: [null, null, null, null, null, null, null, null],
    cellsB: [null, null, null, null, 'ANTE', 'RESP', 'ANTE', 'RESP'],
    phA: REP('A', 8), phB: REP('A', 8), opA: REP('', 8), opB: ['', 'R', '', 'T-1', '', 'R', '', 'T-1'] },

  { id: 2, name: 'RISE', bars: 4, density: 92, lead: true,
    arpMask: REP(S16, 4), cut: [2000, 2100, 2250, 2400], lift: [0, 0, 0, 1],
    kick: REP(ON, 4), snare: REP(ON, 4), hat: REP(ON, 4), glitch: REP(OFF, 4),
    cellsA: ['ANTE', 'ANTE', 'PUSH', 'PUSH'],
    cellsB: ['ANTE', 'PUSH', 'PUSH', 'ROLL'],
    phA: ['C', 'C', 'C', 'C'], phB: ['C', 'C', 'C', 'C'],
    opA: ['', 'T+1', 'T+2', 'T+2'], opB: ['', 'T+1', 'T+2', 'T+2O'] },

  { id: 3, name: 'CLIMAX', bars: 8, density: 100, lead: true,
    arpMask: REP(FULL, 8), cut: [2400, 2500, 2600, 2500, 2400, 2500, 2600, 2500],
    lift: [0, 0, 0, 1, 0, 0, 0, 1],
    kick: REP(ON, 8), snare: REP(ON, 8), hat: REP(ON, 8), glitch: REP(ON, 8),
    cellsA: ['RESP', 'PUSH', 'RESP', 'PUSH', 'RESP', 'PUSH', 'RESP', 'PUSH'],
    cellsB: ['RESP', 'PUSH', 'RESP', 'PUSH', 'RESP', 'PUSH', 'RESP', 'ROLL'],
    phA: REP('B', 8), phB: REP('B', 8),
    opA: ['', '', '', 'T+1', '', 'R', '', 'T+2'], opB: ['', 'I', '', 'RO', '', 'I', '', 'RO'] },

  { id: 4, name: 'BREAK', bars: 4, density: 55, lead: true,
    arpMask: [S4, S8, 0b0000000000111100 & 0xffff, FULL], cut: [1200, 950, 850, 900], lift: REP(0, 4),
    kick: [OFF, OFF, OFF, ON], snare: [OFF, OFF, OFF, ON], hat: [OFF, ON, OFF, ON], glitch: [OFF, OFF, OFF, ON],
    cellsA: ['HOLD', 'HOLD', null, null], cellsB: ['HOLD', 'HOLD', null, null],
    phA: REP('D', 4), phB: REP('D', 4), opA: ['', '', '', ''], opB: ['', '', '', ''] },

  { id: 5, name: 'RETURN', bars: 8, density: 92, lead: true,
    arpMask: [S16, S16, S8, S8, S8, S8, S8, S8],
    cut: [2500, 2400, 2300, 2250, 2200, 2150, 2100, 2050], lift: [0, 0, 0, 0, 0, 0, 0, 1],
    kick: REP(ON, 8), snare: REP(ON, 8), hat: REP(ON, 8), glitch: REP(OFF, 8),
    cellsA: ['RESP', 'ANTE', 'RESP', 'ANTE', 'RESP', 'ANTE', 'RESP', 'ANTE'],
    cellsB: ['RESP', 'ANTE', 'PUSH', 'RESP', 'ANTE', 'RESP', 'PUSH', 'ANTE'],
    phA: REP('B', 8), phB: ['B', 'A', 'D', 'B', 'A', 'B', 'D', 'A'],
    opA: ['', '', 'T-1', 'T-1', '', '', 'T-1', 'T-1'],
    opB: ['R', '', 'T-1', 'T-1', 'R', '', 'T-1', 'T-1'] },
];

/* 动机层 table：arp 音型循环（长度 L 必须与 popcount(mask) 互质）
   值语义：vi%4 = voicing 内序号，floor(vi/4) = 八度抬升 → 4..7 = 同音级 +12
   A（保守）只用 0..3，单八度内；B（激进）允许 4..7，含八度跳进 */
const ARP_CYCLE = {
  A: { 0: [0, 1, 2], 1: [0, 2, 1, 3, 2], 2: [0, 1, 2, 3, 2], 3: [0, 3, 2, 1, 3], 4: [2, 1, 0], 5: [3, 1, 2, 0, 1, 3, 2] },
  B: { 0: [0, 1, 2], 1: [0, 2, 1, 3, 5], 2: [0, 1, 2, 3, 2, 4, 1], 3: [0, 3, 2, 5, 1], 4: [2, 1, 0], 5: [3, 1, 2, 0, 1, 7, 3] },
};

/* ---------- 生成 ---------- */
function build(scheme) {
  const PAT = [];
  for (const sec of FORM04) {
    const bars = [];
    for (let bar = 0; bar < sec.bars; bar++) {
      const ev = Array.from({ length: 16 }, () => ({}));
      const leadOn = new Uint8Array(16);
      const take = (arr, i) => arr[Math.min(i, arr.length - 1)];

      /* --- 1. Lead 先写（应答优先，占格） --- */
      if (sec.lead) {
        const cellName = (scheme === 'A' ? sec.cellsA : sec.cellsB)[bar];
        if (cellName) {
          const cell = LEAD_CELLS[cellName];
          const ph = (scheme === 'A' ? sec.phA : sec.phB)[bar];
          const op = (scheme === 'A' ? sec.opA : sec.opB)[bar];
          const degs = xform(PHRASE[ph], op);
          const n = cell.steps.length;
          const cutRange = { GROOVE: [1500, 2400], RISE: [1600, 2800], CLIMAX: [2000, 3400], BREAK: [900, 1150], RETURN: [1700, 2600] }[sec.name] || [1200, 2000];
          cell.steps.forEach((st, i) => {
            const deg = degs[i % degs.length];
            const semi = AEOLIAN[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);
            const cut = i === n - 1
              ? Math.round(cutRange[1] * 0.82)
              : Math.round(cutRange[0] + (cutRange[1] - cutRange[0]) * (n === 1 ? 1 : i / (n - 1)));
            leadOn[st] = 1;
            ev[st].lead = {
              f: hz(440, semi), v: 0.30 + jitter('lead', sec.id, bar, st),
              len: (i === n - 1 ? cell.len * 1.3 : cell.len), cut, deg, semi,
            };
          });
        }
      }

      /* --- 2. Arp：mask → 位置序号 → 循环表 → voicing --- */
      const mask = take(sec.arpMask, bar);
      const N = popcount(mask);
      const cyc = (scheme === 'A' ? ARP_CYCLE.A : ARP_CYCLE.B)[sec.id];
      const L = cyc.length;
      const chord = scheme === 'A' ? (bar % 2 === 0 ? 0 : 1) : CHORD_LOOP[bar % 4];
      const V = VOICING[chord];
      const lift = take(sec.lift, bar);
      let ord = 0;
      for (let st = 0; st < 16; st++) {
        if (!bit(mask, st)) continue;
        const cycIdx = (bar * N + ord) % L;
        const vi = cyc[cycIdx];
        ord++;
        if (leadOn[st]) continue;              // 旋律优先，arp 让格
        let semi = V[vi % 4] + 12 * Math.floor(vi / 4);
        if (lift && semi < 8) semi += 12;       // 八度提升只抬低音区
        const accent = (st % 4 === 0 ? 0.07 : st % 4 === 2 ? 0.03 : 0) + (cycIdx === 0 ? 0.05 : 0);
        if (sec.name === 'BREAK' && bar === 3) {
          ev[st].arp = { f: hz(220, semi), v: 0.22 + accent, cut: Math.round(900 + (st / 15) * 1600), vi };
        } else {
          ev[st].arp = { f: hz(220, semi), v: 0.20 + accent + jitter('arp', sec.id, bar, st), cut: take(sec.cut, bar), vi };
        }
      }

      /* --- 3. 鼓组：骨架（euclid/手写）与 v0.3 逐字相同，只加"逐小节开关" ---
         开关值为 0 = 整轨静音，非 0 = 本小节按骨架发声。骨架本身不随机。 */
      const roll = sec.name === 'BREAK' && bar === 3;
      const onK = take(sec.kick, bar) !== 0, onS = take(sec.snare, bar) !== 0,
        onH = take(sec.hat, bar) !== 0, onG = take(sec.glitch, bar) !== 0;
      for (let st = 0; st < 16; st++) {
        if (onK && EU_KICK[st]) ev[st].kick = 0.85 + Math.abs(jitter('kick', sec.id, bar, st)) * 2;
        if (onS && (roll || SNARE_STEPS.includes(st))) ev[st].snare = 0.50 + (roll ? 0.10 : 0);
        if (onH && EU_HAT[st] && (r32('hat', sec.id, bar, st * 24, 'gate') % 100) < 78) {
          ev[st].hat = { v: st % 4 === 2 ? 0.34 : 0.20, open: st % 8 === 6 };
        }
        if (onG && (r32('glitch', sec.id, bar, st * 24, 'gate') % 100) < (sec.id === 4 ? 38 : 12)) {
          ev[st].glitch = { v: 0.22, rate: 1.0 };
        }
      }

      /* --- 4. Bass：与 v0.3 完全同一套键与规则（逐位可对照） --- */
      if (sec.name !== 'INTRO' && sec.name !== 'BREAK') {
        for (let st = 0; st < 16; st++) {
          if (!EU_BASS[st]) continue;
          const g = r32('bass', sec.id, bar, st * 24, 'gate');
          if ((g % 100) < sec.density) {
            const deg = r32('bass', sec.id, bar, st * 24, 'pitch') % [0, 0, 0, 3, 5, 7, 10].length;
            ev[st].bass = {
              f: hz(55, [0, 0, 0, 3, 5, 7, 10][deg]),
              v: 0.55 + (r32('bass', sec.id, bar, st * 24, 'velocity') % 25) / 100,
              len: st % 2 === 0 ? 2.2 : 1.4,
            };
          }
        }
      }

      bars.push(ev);
    }
    PAT[sec.id] = bars;
  }
  return PAT;
}

/* ---------- 统计（cut 一律取"引擎实际接收值"：按合成器内 clamp 折算） ---------- */
const EFF = { arp: [850, 2600], lead: [1150, 3800] };   // 与 vArp / vLead 内 clamp 一致
const eff = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
function pct(a, q) {
  if (!a.length) return NaN;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))];
}

function stats(PAT, label) {
  const out = [];
  for (const sec of FORM04) {
    const bars = PAT[sec.id]; const nb = bars.length;   // 用真实小节数，不借 FORM04 的声明值
    let n = 0, sub = 0, cutSum = 0, cutN = 0, regSum = 0, regN = 0, sync = 0, pitchN = 0;
    let arpCutSum = 0, arpCutN = 0;
    const arpCutBars = [], arpMaxBars = [];
    let leadN = 0, maxSemi = -99, minSemi = 99, leadBassHit = 0, arpN = 0;
    const arpSemis = [], leadSemis = [], leadBars = [];
    for (const bar of bars) {
      let bcSum = 0, bcN = 0, bcMax = 0, lc = 0;
      for (let st = 0; st < 16; st++) {
        const e = bar[st];
        for (const k of ['kick', 'snare', 'hat', 'bass', 'arp', 'lead', 'glitch']) if (e[k]) n++;
        if (e.kick) sub++; if (e.bass) sub++;
        if (e.arp) {
          const c = eff(e.arp.cut, EFF.arp);
          arpN++;
          cutSum += c; cutN++; arpCutSum += c; arpCutN++; bcSum += c; bcN++;
          if (c > bcMax) bcMax = c;
          const s = 12 * Math.log2(e.arp.f / 440);
          arpSemis.push(s);
          if (s > maxSemi) maxSemi = s; if (s < minSemi) minSemi = s;
          regSum += s; regN++; pitchN++; if (st % 4) sync++;
        }
        if (e.lead) {
          leadN++; lc++; if (e.bass) leadBassHit++;
          cutSum += eff(e.lead.cut, EFF.lead); cutN++;
          const s = 12 * Math.log2(e.lead.f / 440);
          leadSemis.push(s);
          if (s > maxSemi) maxSemi = s; if (s < minSemi) minSemi = s;
          regSum += s; regN++; pitchN++; if (st % 4) sync++;
        }
      }
      arpCutBars.push(bcN ? bcSum / bcN : 0); arpMaxBars.push(bcMax); leadBars.push(lc);
    }
    out.push({
      sec, nb, density: n / nb, sub: sub / nb,
      cut: cutN ? cutSum / cutN : 0, reg: regN ? regSum / regN : 0,
      sync: pitchN ? sync / pitchN : 0,
      arpCut: arpCutN ? arpCutSum / arpCutN : 0,
      arpCutBars, arpMaxBars, leadN, leadBars, leadPerBar: leadN / nb, arpN, arpPerBar: arpN / nb,
      bassHitRatio: leadN ? leadBassHit / leadN : NaN,
      maxSemi, minSemi, span: maxSemi - minSemi,
      arpMed: pct(arpSemis, 0.5), arpP80: pct(arpSemis, 0.8),
      leadMed: leadSemis.length ? pct(leadSemis, 0.5) : NaN,
      leadP20: leadSemis.length ? pct(leadSemis, 0.2) : NaN,
    });
  }
  return out;
}
const fmt = (t, tag) => {
  console.log(`\n=== ${tag} ===`);
  console.log('name     bars  ev/bar  arp/bar  lead/bar  sub/bar  meanCut  meanReg  arpCut');
  for (const r of t) console.log(
    r.sec.name.padEnd(8), String(r.nb).padEnd(5),
    r.density.toFixed(2).padStart(6), r.arpPerBar.toFixed(2).padStart(8),
    r.leadPerBar.toFixed(2).padStart(8), r.sub.toFixed(2).padStart(8),
    r.cut.toFixed(0).padStart(8), r.reg.toFixed(2).padStart(8),
    r.arpCut.toFixed(0).padStart(7));
};

const S03 = S.PAT;                     // v0.3（COMP A）
const PA = build('A'), PB = build('B');

function seq(PAT, secId, barFrom, barTo, track) {
  const r = [];
  for (let b = barFrom; b <= barTo; b++) for (let st = 0; st < 16; st++) {
    const e = PAT[secId][b][st][track];
    if (e) r.push(`${b}.${st}:${nmSemi(12 * Math.log2(e.f / 440))}`);
  }
  return r.join(' ');
}
console.log('— v0.4 A：GROOVE 前 3 小节 ARP —\n  ' + seq(PA, 1, 0, 2, 'arp'));
console.log('— v0.4 B：GROOVE 前 3 小节 ARP（含 4 小节进行）—\n  ' + seq(PB, 1, 0, 2, 'arp'));
console.log('— v0.4 B：GROOVE 第 5-6 小节 LEAD（应答入 Groove）—\n  ' + seq(PB, 1, 4, 5, 'lead'));
console.log('— v0.4 B：RISE 4 小节 ARP（L=7 与 12 互质）—\n  ' + seq(PB, 2, 0, 3, 'arp'));
console.log('— v0.4 B：CLIMAX 前 4 小节 LEAD —\n  ' + seq(PB, 3, 0, 3, 'lead'));
console.log('— v0.4 B：BREAK 4 小节全事件（看留白与 build）—');
for (let b = 0; b < 4; b++) {
  const s = [];
  for (let st = 0; st < 16; st++) { const e = PB[4][b][st]; const k = Object.keys(e); if (k.length) s.push(`${st}:${k.join('+')}`); }
  console.log(`  bar${b}  ${s.join(' ') || '(空)'}`);
}
console.log('— v0.4 B：RETURN 前 2 小节 —\n  ' + seq(PB, 5, 0, 1, 'arp'));

fmt(stats(S03, 'v0.3'), 'v0.3 现状');
fmt(stats(PA, 'A'), 'v0.4 · 方案 A（保守）');
fmt(stats(PB, 'B'), 'v0.4 · 方案 B（激进）');

/* ---------- 断言 ---------- */
const A_ = [];
const ok = (n, c, x = '') => A_.push([n, !!c, x]);

// 1) arp 音高必须落在当前小节 voicing 内（+0/+12）
let bad = [];
for (const sec of FORM04) for (let b = 0; b < sec.bars; b++) for (let st = 0; st < 16; st++) {
  const e = PB[sec.id][b][st].arp; if (!e) continue;
  const semi = 12 * Math.log2(e.f / 220);
  const V = VOICING[CHORD_LOOP[b % 4]];
  if (!V.some(v => v === Math.round(semi) || v + 12 === Math.round(semi))) bad.push(`${sec.name}/${b}.${st}=${semi}`);
}
ok('arp 音级全部来自当前小节 voicing', bad.length === 0, bad.slice(0, 4).join(','));

// 2) 互质检查
for (const sec of FORM04) {
  const N = popcount(sec.arpMask[0]), L = ARP_CYCLE.B[sec.id].length;
  const g = (a, b) => (b ? g(b, a % b) : a);
  ok(`L 与 N 互质 · ${sec.name} (N=${N},L=${L})`, g(N, L) === 1, `周期=${N * L / g(N, L)} 音`);
}

// 3) Bass 与 v0.3 逐位一致（0..1 小节）
let same = true;
for (const sec of FORM04) for (let b = 0; b < 2; b++) for (let st = 0; st < 16; st++) {
  const a = S03[sec.id]?.[b]?.[st]?.bass, c = PB[sec.id]?.[b]?.[st]?.bass;
  if (JSON.stringify(a) !== JSON.stringify(c)) same = false;
}
ok('Bass 与 v0.3 逐位一致（各段 0-1 小节）', same);

// 3b) 鼓组：骨架与概率门与 v0.3 同源 → 共同小节上的发声位置一致
let drumSame = true, drumDetail = [];
for (const sec of FORM04) {
  const n3 = S03[sec.id]?.length ?? 0;
  for (let b = 0; b < Math.min(2, n3); b++) for (let st = 0; st < 16; st++) for (const k of ['kick', 'snare', 'hat']) {
    const a = S03[sec.id][b][st][k], c = PB[sec.id][b][st][k];
    if (!!a !== !!c) { drumSame = false; drumDetail.push(`${sec.name}/${b}.${st}.${k}`); }
    else if (a && c && k === 'hat' && a.open !== c.open) { drumSame = false; drumDetail.push(`${sec.name}/${b}.${st}.hat.open`); }
  }
}
ok('鼓组骨架（kick/snare/hat）与 v0.3 逐位一致（各段 0-1 小节，含 hat 概率门）', drumSame, drumDetail.slice(0, 4).join(','));

// 3c) Glitch 编排：只在 CLIMAX 全段 + BREAK 末小节（v0.3 的"最吵 breakdown"被撤掉）
const glitchBars = [];
for (const sec of FORM04) sec.glitch.forEach((v, b) => { if (v) glitchBars.push(`${sec.name}${b}`); });
ok('glitch 只在 CLIMAX 全段与 BREAK 末小节',
  glitchBars.length === 8 + 1 && glitchBars.filter(x => x.startsWith('CLIMAX')).length === 8 &&
  glitchBars.includes('BREAK3'), glitchBars.join(' '));

// 4) 亮度判据（一律用引擎 clamp 后的有效值；不比"声明值"）
const st03 = stats(S03, ''), stA = stats(PA, ''), stB = stats(PB, '');
const byName = (t, n) => t.find(r => r.sec.name === n);
const i03 = byName(st03, 'INTRO'), g03 = byName(st03, 'GROOVE'), r03 = byName(st03, 'RISE'),
  c03 = byName(st03, 'CLIMAX'), b03 = byName(st03, 'BREAK'), t03 = byName(st03, 'RETURN');
const iB = byName(stB, 'INTRO'), gB = byName(stB, 'GROOVE'), rB = byName(stB, 'RISE'),
  cB = byName(stB, 'CLIMAX'), bB = byName(stB, 'BREAK'), tB = byName(stB, 'RETURN');

ok('v0.3 现症：RISE/CLIMAX/RETURN 的 arp 有效截止三者全等（亮度在上升后冻结）',
  r03.arpCut === c03.arpCut && c03.arpCut === t03.arpCut,
  `${r03.arpCut.toFixed(0)}/${c03.arpCut.toFixed(0)}/${t03.arpCut.toFixed(0)}`);
ok('v0.3 现症：上升路径 INTRO<GROOVE<RISE<CLIMAX 不成立',
  !(i03.arpCut < g03.arpCut && g03.arpCut < r03.arpCut && r03.arpCut < c03.arpCut),
  `${i03.arpCut.toFixed(0)}→${g03.arpCut.toFixed(0)}→${r03.arpCut.toFixed(0)}→${c03.arpCut.toFixed(0)}`);
ok('v0.4B：上升路径 arp 有效截止严格递增 INTRO<GROOVE<RISE<CLIMAX',
  iB.arpCut < gB.arpCut && gB.arpCut < rB.arpCut && rB.arpCut < cB.arpCut,
  `${iB.arpCut.toFixed(0)}→${gB.arpCut.toFixed(0)}→${rB.arpCut.toFixed(0)}→${cB.arpCut.toFixed(0)}`);
ok('v0.4B：BREAK 低谷（前 3 小节）比 GROOVE 暗 ≥ 30%',
  bB.arpCutBars.slice(0, 3).reduce((a, x) => a + x, 0) / 3 <= gB.arpCut * 0.7,
  `${(bB.arpCutBars.slice(0, 3).reduce((a, x) => a + x, 0) / 3).toFixed(0)} vs ${gB.arpCut.toFixed(0)}`);
ok('v0.4B：CLIMAX / BREAK 低谷（前 3 小节）有效亮度 ≥ 2.4×',
  cB.arpCut / (bB.arpCutBars.slice(0, 3).reduce((a, x) => a + x, 0) / 3) >= 2.4,
  (cB.arpCut / (bB.arpCutBars.slice(0, 3).reduce((a, x) => a + x, 0) / 3)).toFixed(2) + '×');
ok('v0.4B：BREAK 末小节峰值亮度 ≥ 低谷 2.4× 且达到 CLIMAX 均值的 90%',
  bB.arpMaxBars[3] >= bB.arpCutBars[2] * 2.4 && bB.arpMaxBars[3] >= cB.arpCut * 0.9,
  `${bB.arpMaxBars[3].toFixed(0)} vs 谷${bB.arpCutBars[2].toFixed(0)} / CLIMAX${cB.arpCut.toFixed(0)}`);
ok('v0.4 A/B：stats 无 NaN（lead cut 已取区间本身而非首元素）',
  [...stA, ...stB].every(r => Number.isFinite(r.cut) && Number.isFinite(r.arpCut) && Number.isFinite(r.reg)));
ok('v0.4B：BREAK 低频 ≤ CLIMAX 的 20%', bB.sub / cB.sub <= 0.2, (bB.sub / cB.sub * 100).toFixed(0) + '%');
ok('v0.4B：BREAK 第 4 小节 snare ≥ 10（roll）', PB[4][3].filter(e => e.snare).length >= 10, PB[4][3].filter(e => e.snare).length);

// 6) 音域与让位规则
const both = [];
for (const sec of FORM04) for (let b = 0; b < sec.bars; b++) for (let st = 0; st < 16; st++) {
  const e = PB[sec.id][b][st];
  if (e.arp && e.lead) both.push(`${sec.name}/${b}.${st}`);
}
ok('arp 让位：任一 tick 不同时出现 arp 与 lead', both.length === 0, both.slice(0, 4).join(','));
ok('arp 音域带：A 方案 cycle 全部 <4（单八度）', Object.values(ARP_CYCLE.A).every(c => c.every(v => v < 4)));
ok('arp 音域带：B 方案高位项占比 ≤ 25%',
  Object.values(ARP_CYCLE.B).every(c => c.filter(v => v >= 4).length / c.length <= 0.25),
  Object.values(ARP_CYCLE.B).map(c => (c.filter(v => v >= 4).length / c.length * 100).toFixed(0) + '%').join('/'));
ok('lead 音域带：A 方案 ≤ B5（maxSemi ≤ 14）',
  stA.every(r => r.maxSemi <= 14.01), Math.max(...stA.map(r => r.maxSemi)).toFixed(1));
ok('lead 音域带：B 方案达 E6（maxSemi ≥ 19）',
  Math.max(...stB.map(r => r.maxSemi)) >= 19, Math.max(...stB.map(r => r.maxSemi)).toFixed(1));

// 7) A/B 判据（各自可判定）
const gA = byName(stA, 'GROOVE'), cA = byName(stA, 'CLIMAX');
const OPS_HIGH = new Set(['I', 'O', 'RO']);
const opsUsed = (secs, key) => secs.flatMap(s => s[key]).filter(Boolean);
ok('A 保守：GROOVE 段无 lead（已认可段落零改动）', gA.leadN === 0, gA.leadN);
ok('A 保守：算子只用 T±/R，不含 I/O/RO',
  [...opsUsed(FORM04, 'opA')].every(o => !OPS_HIGH.has(o)),
  [...new Set(opsUsed(FORM04, 'opA'))].join(','));
ok('A 保守：lead 每小节 ≤ 4 音（不铺满）',
  stA.every(r => Math.max(...r.leadBars) <= 4), Math.max(...stA.map(r => Math.max(...r.leadBars))));
ok('B 激进：GROOVE 后半引入应答（bar4-7 leadN > 0）',
  gB.leadBars.slice(4).reduce((a, x) => a + x, 0) > 0, gB.leadBars.join(''));
ok('B 激进：CLIMAX 出现 ≥ E6 高点（maxSemi ≥ 19）', cB.maxSemi >= 19, cB.maxSemi.toFixed(1));
ok('B 激进：RISE 末小节 8 连滚奏（lead 每小节 8 音）',
  byName(stB, 'RISE').leadBars[3] === 8, byName(stB, 'RISE').leadBars.join(''));
ok('A/B 产生不同 PAT', JSON.stringify(PA) !== JSON.stringify(PB));

// 8) 与 Bass 的关系：lead 落点与 bass 落点重合率（避开低频的"拍点重合"）
const hitA = stA.filter(r => Number.isFinite(r.bassHitRatio));
const hitB = stB.filter(r => Number.isFinite(r.bassHitRatio));
ok('lead 与 bass 落点重合率 ≤ 1/3（问句不被低频顶掉）',
  hitA.every(r => r.bassHitRatio <= 1 / 3) && hitB.every(r => r.bassHitRatio <= 1 / 3),
  'A:' + hitA.map(r => (r.bassHitRatio * 100).toFixed(0) + '%').join('/') +
  ' B:' + hitB.map(r => (r.bassHitRatio * 100).toFixed(0) + '%').join('/'));

// 5) 重建确定性
ok('同 Seed 重建逐位一致', JSON.stringify(build('B')) === JSON.stringify(PB));

console.log('\n=== 断言 ===');
for (const [n, c, x] of A_) console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  [' + x + ']' : ''}`);
console.log(`\n${A_.filter(a => a[1]).length}/${A_.length} 通过`);
console.log(`FORM v0.4 合计 ${FORM04.reduce((a, s) => a + s.bars, 0)} 小节 = ${(FORM04.reduce((a, s) => a + s.bars, 0) * 1.7143).toFixed(1)}s`);
