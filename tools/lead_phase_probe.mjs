/* LEAD 振荡器相位策略验证：三支同频振荡器用 0/120/240° 相位偏移，基频与非三倍谐波会不会相消。
   纯 JS 解析叠加（不依赖浏览器），输出 基频保留率 / 谐波谱 / 峰值 / 基频调制深度。
   运行：node tools/lead_phase_probe.mjs */

const SR = 48000, DUR = 1.0, N = 64, F0 = 440;
const CENTS = c => Math.pow(2, c / 1200);

/* 谐波振幅表：saw 全谐波 1/k；square 奇次 1/k；tri 奇次 1/k² 带交替符号 */
function harmTable(kind) {
  const a = [];
  for (let k = 1; k <= N; k++) {
    if (kind === 'saw') a.push(1 / k);
    else if (kind === 'square') a.push(k % 2 === 1 ? 1 / k : 0);
    else a.push(k % 2 === 1 ? (1 / (k * k)) * (k % 4 === 1 ? 1 : -1) : 0);
  }
  return a;
}

/* 三支振荡器：每支 { kind, phaseTurns, detuneCents, gain } */
function renderOscs(oscs) {
  const len = Math.floor(SR * DUR);
  const out = new Float64Array(len);
  for (const o of oscs) {
    const h = harmTable(o.kind);
    const f = F0 * CENTS(o.detuneCents);
    for (let k = 1; k <= N; k++) {
      const a = h[k - 1] * o.gain;
      if (!a) continue;
      const ph = 2 * Math.PI * (k * o.phaseTurns) - Math.PI / 2 * 0; /* 相位偏移按谐波次数放大 */
      const w = 2 * Math.PI * k * f / SR;
      for (let i = 0; i < len; i++) out[i] += a * Math.sin(w * i + ph);
    }
  }
  return out;
}

/* 单一频率分量的解析包络（用于测基频调制深度与保留率） */
function toneEnv(oscs, harmonic) {
  const len = Math.floor(SR * DUR);
  const env = new Float64Array(len);
  const parts = oscs.map(o => {
    const h = harmTable(o.kind);
    return { a: (h[harmonic - 1] || 0) * o.gain, f: F0 * CENTS(o.detuneCents), ph: 2 * Math.PI * (harmonic * o.phaseTurns) };
  }).filter(p => p.a);
  for (let i = 0; i < len; i++) {
    let re = 0, im = 0;
    for (const p of parts) {
      const ang = 2 * Math.PI * harmonic * p.f / SR * i + p.ph;
      re += p.a * Math.cos(ang); im += p.a * Math.sin(ang);
    }
    env[i] = Math.hypot(re, im);
  }
  return env;
}

function stats(x) {
  let peak = 0, s2 = 0;
  for (const v of x) { const a = Math.abs(v); if (a > peak) peak = a; s2 += v * v; }
  return { peak, rms: Math.sqrt(s2 / x.length) };
}
function envStats(e, t0, t1) {
  let mn = Infinity, mx = 0, s2 = 0, n = 0;
  for (let i = Math.floor(t0 * SR); i < Math.floor(t1 * SR); i++) {
    const v = e[i]; if (v < mn) mn = v; if (v > mx) mx = v; s2 += v * v; n++;
  }
  return { min: mn, max: mx, rms: Math.sqrt(s2 / n), modDepth: (mx - mn) / (mx + mn || 1) };
}

const G = [0.34, 0.30, 0.34];
const strategies = {
  'A 同相表 0/120/240° + ±11c': [
    { kind: 'saw', phaseTurns: 0, detuneCents: -11, gain: G[0] },
    { kind: 'saw', phaseTurns: 1 / 3, detuneCents: 0, gain: G[1] },
    { kind: 'saw', phaseTurns: 2 / 3, detuneCents: 11, gain: G[2] }
  ],
  'B 无相位偏移 + ±11c': [
    { kind: 'saw', phaseTurns: 0, detuneCents: -11, gain: G[0] },
    { kind: 'saw', phaseTurns: 0, detuneCents: 0, gain: G[1] },
    { kind: 'saw', phaseTurns: 0, detuneCents: 11, gain: G[2] }
  ],
  'C 三种波形无相位偏移 + ±11c': [
    { kind: 'saw', phaseTurns: 0, detuneCents: -11, gain: G[0] },
    { kind: 'square', phaseTurns: 0, detuneCents: 0, gain: G[1] },
    { kind: 'tri', phaseTurns: 0, detuneCents: 11, gain: G[2] }
  ],
  'D 单支 saw（参考）': [{ kind: 'saw', phaseTurns: 0, detuneCents: 0, gain: 1 }]
};

const ref = toneEnv(strategies['D 单支 saw（参考）'], 1);
const refRms = envStats(ref, 0.05, 1.0).rms;

/* 以 B（同波形、无相位偏移）为对照：A 的每个谐波相对 B 的保留率才是相消量 */
function harmRms(oscs, k) { return envStats(toneEnv(oscs, k), 0.05, 1.0).rms; }
const bOscs = strategies['B 无相位偏移 + ±11c'];
const rows = [];
for (const [name, oscs] of Object.entries(strategies)) {
  const wf = renderOscs(oscs);
  const s = stats(wf);
  const e1 = toneEnv(oscs, 1);
  const s1 = envStats(e1, 0.0, 1.0);
  const attack = envStats(e1, 0, 0.02).rms;
  const spec = [1, 2, 3, 4, 5, 6].map(k => {
    const r = harmRms(oscs, k);
    const b = name.startsWith('D') ? r : harmRms(bOscs, k);
    return { k, rms: +r.toFixed(4), vsB: b ? +(r / b).toFixed(3) : 1 };
  });
  rows.push({
    name,
    peak: +s.peak.toFixed(3),
    rms: +s.rms.toFixed(4),
    crest: +(s.peak / s.rms).toFixed(2),
    fundRms: +s1.rms.toFixed(4),
    attack: +attack.toFixed(4),
    spec
  });
}

console.log('LEAD 振荡器相位策略对照（F0=440 Hz, N=64, 1.0 s）');
console.log('vsB = 该谐波 RMS / 同波形无相位偏移组的同一谐波 RMS（<1 即被相消）\n');
for (const r of rows) {
  console.log(`${r.name}`);
  console.log(`  peak=${r.peak}  rms=${r.rms}  波峰因数=${r.crest}  基频RMS=${r.fundRms}  起音20ms基频RMS=${r.attack}`);
  console.log(`  H1..H6 vsB: ` + r.spec.map(s => `H${s.k}=${s.vsB}`).join('  '));
  console.log('');
}

const A = rows.find(r => r.name.startsWith('A'));
console.log(`A 相对 B：基频 -${(20 * Math.log10(A.fundRms / rows.find(r => r.name.startsWith('B')).fundRms)).toFixed(1)} dB，` +
  `起音 20 ms 内 -${(20 * Math.log10(A.attack / rows.find(r => r.name.startsWith('B')).attack)).toFixed(1)} dB`);
console.log('H3/H6（三倍次谐波）vsB 接近 1 说明只有 3 的倍数留下，其余被相消。');
