# SERIAL · Sonic Identity Audition v0.4 实现方案

状态：`PLAN` · 2026-11-09
输入：`SERIAL_Sonic_Identity_Audition_v0.3.html`（script 821 行，原样保留作对照）、`SERIAL_Percussion_Glitch_Rework_v0.1.md`、`SERIAL_Addressable_RNG_Contract_v0.1.md`、`SERIAL_v0.3_GoldenVectors.json`
产出：新建 `SERIAL_Sonic_Identity_Audition_v0.4.html` + `SERIAL_v0.4_GoldenVectors.json` + `tmp/verify_v04.js` + `tmp/audit_v04.mjs`
约束：无构建依赖、单文件双击运行、Chromium 桌面、不引 three.js、不改 v0.3 任何字节

---

## 0. 结论先行

1. **端序必须先定，否则 v0.4 一天都开不了工。** 契约正文与参考实现写的是小端（§4 `u64_LE`、§14.1 `getBigUint64(0,true)`），v0.3 实现与已生成向量是大端（`getBigUint64(0,false)`，`SERIAL_v0.3_GoldenVectors.json` `digest.initstate` 亦写 "big-endian"）。实测同键 `digest[0..8]=dc10d84756ebc2ba`，LE 得 `bac2eb5647d810dc`，BE 得 `dc10d84756ebc2ba`，8 条向量只在 BE 下成立。**建议冻结大端**，契约升 v0.2 改 §4/§14.1 两处，向量不重出；代价最小，且与十六进制摘要的阅读习惯一致。若选择小端，则实现改 1 行、8 条向量全部重出、v0.3 对照页失去可比性。
2. **v0.3 的 Golden Vectors 是自证，不是向量。** `tmp\verify_v03.js` 从同一份 HTML 抽出 `R32` 再跑一遍，等于同一份实现验自己。契约 §12.3 要求两份独立实现；v0.4 必须在测试脚本内另写一份 40 行独立 `encodeKey + PCG32`（照文档抄，不 import 页面函数）做交叉验证。
3. **`gate 长度分布` 在当前数据模型里是退化量。** 实测 11 个 bar、6 个声部的连续命中长度全部为 `{1: N}`，只有 COMP B 的 arp 出现 `{1:18, 2:11, 3:29}`。原因：`PAT` 每步只存"触发/不触发"，没有门长字段。验收前必须把 `gateTicks` 写进事件模型，否则这个验收项无法定义。
4. **`Math.random` 两处（IR、`noiseBuf`）让"频谱能量比"和"两次渲染逐位一致"都不可能成立。** 必须换确定性源，否则 B 层验收天然 flaky。
5. **专家方案有两处结构性冲突**：§3.4 把 `glitchGate` 串在 `drumBus` 之后会把 kick/snare 一起门控，与"独立 glitch 层"矛盾；§4.1 的 `cap + break` 让 glitch 起点系统性偏向 bar 头（p=70 时首个 1/32 大概率通过即 break）。
6. **交付形态：单文件 HTML，内部按 8 个 IIFE 段拆分并显式依赖注入。** `file://` 下 `<script type="module">` 被 CORS 阻断，"可双击"与"ES module 拆分"互斥；不引构建就没有物理文件边界，只能用内部边界换维护性。

---

## 1. 音频图重构（不破坏既有契约）

### 1.1 Voice 注册表：唯一身份源

v0.3 的 `TRACK_ID` 是对象字面量，`TRACKS` 数组（UI 用）是第二份，`audible()` 用字符串第三份——三处会漂。v0.4 合并为一张表，其余全部派生：

```js
const VOICE_LIST = [
  // id 一经发布不复用；新增声部从 8 起，禁止插入重排
  { key:'kick',   id:1, name:'KICK',   bus:'drumBus',   family:'drum', gate:{mode:'euclid', n:16, k:4} },
  { key:'snare',  id:2, name:'SNARE',  bus:'drumBus',   family:'drum', gate:{mode:'fixed', steps:[4,12]} },
  { key:'hat',    id:3, name:'HAT',    bus:'drumBus',   family:'drum', gate:{mode:'euclid', n:16, k:8} },
  { key:'bass',   id:4, name:'BASS',   bus:'bassBus',   family:'tone', gate:{mode:'euclid', n:16, k:5},
    range:{root:55,  semis:[0,0,0,3,5,7,10], lo:-36, hi:-26} },
  { key:'arp',    id:5, name:'ARP',    bus:'arpBus',    family:'tone', gate:{mode:'euclid', n:16, k:12},
    range:{root:220, semis:[0,3,7,10], lo:-12, hi:-2, octaveLocked:true} },
  { key:'lead',   id:6, name:'LEAD',   bus:'leadBus',   family:'tone', gate:{mode:'euclid', n:16, k:3},
    range:{root:440, semis:[0,2,3,5,7], lo:0, hi:7} },
  { key:'glitch', id:7, name:'GLITCH', bus:'glitchBus', family:'fx',   gate:{mode:'plan', grid:12} }
];
const VOICES = Object.freeze(Object.fromEntries(VOICE_LIST.map(v => [v.key, Object.freeze(v)])));
const VOICE_KEYS = Object.freeze(VOICE_LIST.map(v => v.key));
```

启动断言（不通过就 `throw`，不降级）：

- `id` 唯一、`1 ≤ id ≤ 65535`（键布局 `trackId` 是 u16）
- `VOICE_KEYS` 与 UI 行、调度分支、`PARAMS.voice` 三方集合相等
- `VOICES[key].id` 与 `SERIAL_v0.4_GoldenVectors.json.trackId` 逐项相等

`per-voice` 的函数选择也进注册表，消除 `scheduleStep` 里 7 个 `if`：

```js
const SYNTH = {
  v03: { kick:vKick,   snare:vSnare,   hat:vHat,   bass:vBass, arp:vArp,   lead:vLead,   glitch:vGlitch },
  v02: { kick:vKick02, snare:vSnare02, hat:vHat02, bass:vBass, arp:vArp02, lead:vLead02, glitch:vGlitch }
};
// bass 两侧共用，是"Bass 为唯一音色基准"这条产品口径的代码表达，不是遗漏
```

### 1.2 参数集中配置

v0.3 的数值散落在 7 个 synth 函数体内（如 `0.018`、`2350`、`421/632/777`）。v0.4 全部上移到 `PARAMS`，synth 只读：

```js
const PARAMS = Object.freeze({
  clock:  { bpm:140, ppq:96, beatsPerBar:4, stepsPerBar:16, stepTicks:24 },
  master: { level:0.72, fadeIn:0.06, fadeOut:0.06 },
  buses:  { drum:0.9, bass:0.55, arp:0.34, lead:0.28, glitch:0.5,
            delayBeats:0.75, delayFb:0.23, delayLp:2600,
            verbLen:1.7, verbMix:0.13, predelay:0.018 },
  comp:   { threshold:-12, knee:12, ratio:3.2, attack:0.004, release:0.16 },
  crack:  { lp:420, in:0.05, out:0.45, gateDiv:12, gateDepth:0.35, duck:0.55 },
  voice: {
    kick:  { body:{f0:165,f1:55,t1:0.028}, amp:{peak:0.85,d1:0.09,d2:0.34},
             click:{hp:3000,lvl:0.28,dur:0.010}, sat:{drive:2.0,trim:0.71} },
    snare: { shell1:{f0:185,f1:168,t1:0.012,dec:0.085,lvl:0.38},
             shell2:{f0:330,f1:300,t1:0.010,dec:0.055,lvl:0.19},
             noise:{hp:700,bp:2200,q:1.5,dec:0.13,lvl:0.44},
             trans:{hp:3000,dec:0.004,lvl:0.12}, sat:{drive:1.8,trim:0.71} },
    hat:   { metal:[205.3,304.4,369.6,522.7,540,800], hp:6000, bp:9500, q:1.0,
             dec:{closed:0.045,open:0.210}, noiseLvl:0.30, noiseDecRatio:0.6, choke:0.003, gain:1/6 },
    bass:  { lp:{q:7, hz:[190,720,160], t:[0,0.02,0.6]}, attack:0.004, sub:0.5 },
    arp:   { harm:0.12, harmRatio:2, lp:{q:0.65, lo:850, hi:2600}, dec:0.145 },
    lead:  { detune:[-7,0,7], sub:0.22, subRatio:0.5, lp:{q:0.6, peak:3800, floor:1150}, dec:0.18 },
    glitch:{ bp:{q:9, f0:400, f1:90, sweep:0.12}, pulse:{count:3, gap:0.018, dec:0.028, hp:1600} }
  }
});
```

**可执行的约束**：synth 函数体内除 `0` / `1` / 数组下标外不得出现数值字面量。这条用静态检查断言（Tier A A15），比人肉 review 可靠。

### 1.3 每声部独立 trackId 与 `randomFor` 寻址

```js
function randomFor(voiceKey, sectionId, localBar, tick, purpose, attempt = 0) {
  const v = VOICES[voiceKey];
  if (!v) throw new Error('unknown voice: ' + voiceKey);
  return R32(SEED, v.id, sectionId, localBar, tick, purpose, attempt);
}
// 段级动机：同一 Section 共享，改全局位置不改动机（契约 §7）
function randomForSection(voiceKey, sectionId, purpose, attempt = 0) {
  return randomFor(voiceKey, sectionId, 0, 0, purpose, attempt);
}
```

三条硬约束：

1. `R32` 内 `tick` 断言 `< TICKS_PER_BAR`（契约 §3.2），`attempt` 断言为 0..2^32−1 整数。
2. `localBar = 0` 只能通过 `randomForSection` 出现，不允许在 `build()` 里裸写 `0,0`。v0.3 的 arp/lead 动机就是裸写（L287、L294、L306），读代码看不出是有意还是笔误。
3. 新增声部只增 `id`，不动其他键；`generatorVersion` 仅在"既定键的取数语义变了"时才升。

### 1.4 双轴切换的开关矩阵

状态收敛到单一对象，UI 只能通过 `set()` 改，禁止像 v0.3 那样 8 处直接写 `TONE` / `COMP` / `soloVoice`：

```js
const S = { seed, tone:'v03', comp:'A', solo:null, crack:false, playing:false };
function set(patch) { /* validate → apply → refresh() → repaint() */ }
```

| 轴 | 取值 | 应用点 | 重建 PAT | 改音频图 | 生效时机 |
|---|---|---|---|---|---|
| SOUND | `v03` / `v02` | `SYNTH[tone][voice]` 查表 | 否 | 否 | 下一 bar 边界（`pending.tone`） |
| COMP | `A` / `B` | `build()` | 是 | 否 | 下一 bar 边界（`pending.comp`），保留 `pos` |
| SOLO | `all` / 单声部 | `audible()` 过滤排程 | 否 | 否 | ≤ lookahead（120 ms） |
| CRACK | `held` / `released` | `crackGate` + `toneLP` + `duck` | 否 | 否 | 50 ms 进 / 450 ms 出 |
| TRANSPORT | `playing` / `stopped` | 调度器 | 否 | 否 | 立即 |

2×2 语义：

| | COMP A | COMP B |
|---|---|---|
| **SOUND v0.3** | 基准格（golden 对比锚点） | 只换动机：音色对象不变，事件集合变 |
| **SOUND v0.2** | 只换合成：事件集合逐位不变 | 双替换，仅用于对照，不作验收锚点 |

不变式（全部进 Tier A）：

- **I1**：`PAT` 哈希仅由 `(seed, comp, FORM, PARAMS 中的 gate 参数)` 决定；`tone` / `solo` / `crack` / `playing` 取任意值哈希不变。
- **I2**：音频图节点集合仅由 `(PARAMS.buses, PARAMS.voice, tone)` 决定；`comp` / `seed` 不影响。
- **I3**：5 轴全部组合可达且语义有定义（`2×2×8×2×2 = 128` 状态），切换不抛错、不静默降级。

延迟切换的原因：A/B 判断必须"整段同一套"，bar 中途换会让听者把拼接感误判成音色差异。停止态下立即生效。

---

## 2. 事件模型 v2

### 2.1 数据形状

```js
// 旧：PAT[sec][bar][step] = { kick:0.9, hat:{v,open}, ... }   —— 每步一桶，表达不了跨步
// 新：PAT[sec][bar] = { events:[...], glitch:[...] }           —— bar 级，绝对 tick
Event = { v:'kick', tick:0, gateTicks:24, vel:0.93, p:{ /* 合成参数 */ } }
Glitch = { tick:12, div:12, lenTicks:36, depth:0.28, kind:'stutter' }
```

规则：

- `tick` 为 bar 内局部坐标，`0 ≤ tick < 384`，整数。
- `gateTicks` 为整数，`1 ≤ gateTicks ≤ 384 − tick`；来自 `PURPOSE.duration` 的取数，不再用浮点 `len` 乘 `stepDur()`。
- 同 voice 同 tick 只允许一个事件；`events` 按 `(tick, voiceId)` 排序。
- `eventId = randomFor(v, sec, bar, tick, PURPOSE.eventId, 0)`，为后续 Variant 覆写提供稳定身份（契约 §8.1）。v0.3 定义了这个 purpose 但从未使用。

### 2.2 排程改为 bar 级

```js
const SEC_PER_TICK = (60 / PARAMS.clock.bpm) / PARAMS.clock.ppq;   // 4.464 ms
function scheduleBar(sec, bar, barStart) {
  for (const e of PAT[sec.id][bar].events) {
    if (!audible(e.v)) continue;
    SYNTH[S.tone][e.v](barStart + e.tick * SEC_PER_TICK, e);
  }
  for (const g of PAT[sec.id][bar].glitch) scheduleGlitch(g, barStart);
}
```

好处：glitch 事件时间不再依赖"步循环的第几次"，`barStart + tick × SEC_PER_TICK` 直接给绝对时间，B07（与 tick 网格偏差 < 1 sample）才有定义。

### 2.3 Glitch 重做（修正专家方案两处）

**修正一：cap + break 的起点偏置。** 专家 §4.1 在 1/32 栅格上边扫边 push，达到 cap 立即 break；p=70 时第一个 1/32 有 70% 概率通过，glitch 几乎总落在 tick 0。改为"先全收集、再确定性选取"：

```js
function planGlitch(sec, bar) {
  const p   = ({ 3:45, 4:70 })[sec.id] ?? 0;      // 其余 Section 为 0
  const cap = (sec.id === 3 || sec.id === 4) ? 2 : 1;
  const cand = [];
  for (let tick = 0; tick <= TICKS_PER_BAR - 12; tick += 12) {
    if (randomFor('glitch', sec.id, bar, tick, PURPOSE.gate) % 100 >= p) continue;
    cand.push(tick);
  }
  if (!cand.length) return [];
  const order = detShuffle(cand.length, sec.id, bar);   // 用 PURPOSE.mutation 取数，稳定可复现
  return order.slice(0, cap).sort((a, b) => a - b).map(tick => buildGlitchEvent(sec, bar, tick));
}
```

`detShuffle` 用 `randomFor('glitch', sec.id, bar, i, PURPOSE.mutation, 0)` 做 Fisher-Yates，不引入新 purpose、不改键布局。

**修正二：`glitchGate` 的位置。** 专家 §3.4 把 gate 串在 `drumBus` 后，会同时切掉 kick/snare（`drumBus` 是三件套的公共出口），与"独立 glitch 层"的目标矛盾。拆成两个东西：

| 对象 | 位置 | 触发源 | 作用 |
|---|---|---|---|
| `glitchBus` | glitch voice → master（**不接 delay**） | 生成侧 bar plan | 独立故障层，可 solo |
| `crackGate` | drumBus 之后、master 之前 | 仅 CRACK 按住 | 总线级 stutter，是演奏动作而非事件 |

两者可同时存在，互不替代。B08（glitch 总线上 321 ms 自相关 ≈ 0）验证前者确实绕开了 delay。

---

## 3. 生命周期：Stop / 淡出 / Crack 按住态

### 3.1 三类残留

| 残留 | 来源 | v0.3 现状 |
|---|---|---|
| 已排程未发声的源 | 120 ms lookahead 内已 `start(t_future)` | STOP 只淡 master，源照常触发 |
| 效果器环路 | `delay` fb 0.23 自循环、`verb` 1.7 s 尾 | `ctx.suspend()` 把尾音**冻结**，下次 PLAY 原样吐出 |
| 按住态未释放 | `crackHeld=true` 时 STOP | `toneLP` 停在 420 Hz，下次播放直接是闷的 |

### 3.2 节点账本

所有发声源经统一入口登记，`onended` 负责注销：

```js
const LIVE = new Set();
function spawn(node, tEnd) {
  LIVE.add(node);
  node.onended = () => { try { node.disconnect(); } catch {} LIVE.delete(node); };
  node.stop(tEnd);
  return node;
}
function panic(t) {
  for (const n of LIVE) { try { n.stop(Math.max(t, n.__start ?? t)); } catch {} }
  // onended 异步触发；t+0.25 再扫一次，兜住不触发 onended 的实现差异
  setTimeout(() => { for (const n of LIVE) { try { n.disconnect(); } catch {} } LIVE.clear(); }, 250);
}
```

`noise()` 也必须走 `spawn()`：v0.3 里它是裸 `createBufferSource + start + stop`，是节点账本的漏网口。

### 3.3 STOP 序列

```
playing = false
clearInterval(timer)
master.gain: cancelScheduledValues → setValueAtTime(current) → linearRamp(0.0001, +60ms)
panic(now)
fxReturn.gain: ramp 0 over 60ms          // 切断 delay/verb 返回，防止冻结尾音
```

**不再 `ctx.suspend()`。** 理由是 suspend 冻结的是完整图状态，尾音会在 resume 后原样出现，这正是 A/B 判断最怕的"上一轮的混响"。代价是空闲期 CPU 略高，用 `visibilitychange` + 60 s 无操作再 suspend，且 resume 前先把 `fxReturn` 归零再 250 ms 回升。

验收：STOP 后 2.5 s，`LIVE.size === 0` 且输出 RMS < −80 dBFS。

### 3.4 CRACK 按住态

v0.3 只绑了 `pointerup / pointercancel / pointerleave` 在按钮上，缺三种真实路径：鼠标移出窗口后松开、窗口失焦、播放中按 STOP。v0.4：

```js
btn.addEventListener('pointerdown', e => { btn.setPointerCapture(e.pointerId); crackDown(); });
for (const ev of ['pointerup','pointercancel','lostpointercapture']) btn.addEventListener(ev, crackUp);
window.addEventListener('blur', crackUp);
document.addEventListener('visibilitychange', () => { if (document.hidden) crackUp(); });
// STOP 内、以及任何 transport 变化前，先 crackUp()
```

`crackUp()` 幂等；`crackDown()` 在 `!playing` 时只登记意图、不扫滤波器（避免空转把 `toneLP` 留在 420 Hz）。验收：三条释放路径各跑一次，600 ms 后 `toneLP.frequency.value ≥ 15000` 且 `crackGate.gain.value === 1`。

---

## 4. 自测扩展

分三层。**能自动化的绝不靠耳朵，能靠耳朵的绝不假装自动化。**

### Tier A · 纯 JS（node + vm，复用现有 stub document 模式）

| # | 断言 | 阈值/期望 | v0.3 是否覆盖 |
|---|---|---|---|
| A01 | `SHA256("abc")` | 标准向量 | ✅ |
| A02 | 键布局 48 字节 + 字段偏移往返 | 逐字段读写一致 | 部分（只测长度） |
| A03 | `R32` 确定性 | 同键两次相等 | ✅ |
| A04 | 七声部独立寻址 | 7 值互不相等 | ✅ |
| A05 | v0.4 golden vectors | 8 条逐位相等 | ✅（换版本号） |
| A06 | **独立实现交叉验证** | 测试内另写 encodeKey+PCG，8 条全等 | ❌ 新增 |
| A07 | seed 改动 → PAT 哈希变；改回 → 复原 | 三次哈希 | 部分 |
| A08 | COMP A/B → PAT 哈希不同，A 与 golden 一致 | 固定值 | 部分 |
| A09 | **SOUND 切换不改变 PAT 哈希（I1）** | 相等 | ❌ 新增 |
| A10 | 事件数：每 Section × 每声部精确值 | 见下表 | ❌ 新增 |
| A11 | 音域：逐音检查，非 min/max | bass −36..−26、arp −12..−2 且只含 {0,3,7,10} mod 12、lead 0..7 | 部分 |
| A12 | `gateTicks` 直方图精确匹配；边界不越段尾 | 每事件 `1 ≤ gateTicks ≤ 384−tick` | ❌ 新增 |
| A13 | glitch：`tick%12===0`、`lenTicks∈{12,24,36,48}`、每 bar ≤ cap、起点不集中在 tick 0 | ≥3 个不同起点 | ❌ 新增 |
| A14 | 同 voice 同 bar 无重复 tick；events 已排序 | — | ❌ 新增 |
| A15 | 参数外置 lint：synth 区无裸数值字面量 | allowlist {0,1} | ❌ 新增 |
| A16 | `selftest()` 无副作用 | 调用前后 `snapshot()` 相等 | ❌ 新增（v0.3 有 bug） |
| A17 | 未知 voice 抛错、`tick ≥ 384` 抛错 | throws | ❌ 新增 |

v0.3 事件数基线（seed `A7F209C13B8ED614`，实测）：

| COMP | kick | snare | hat | bass | arp | lead | glitch | 合计 |
|---|---|---|---|---|---|---|---|---|
| A | 32 | 16 | 47 | 35 | 86 | 18 | 10 | 244 |
| B | 32 | 16 | 47 | 35 | 127 | 18 | 10 | 285 |

v0.4 换 glitch 生成后 glitch 计数会变，A10 必须用新表；其余 6 个声部的事件数必须与上表**逐位相同**，这是"重构不改既有契约"的最硬证据。

`gateTicks` 与"连续命中长度"是两个量，分开验收：前者是事件字段（发音时长），后者是派生节奏量。实测 v0.3 的连续命中长度对 6 个声部全为 `{1:N}`，仅 COMP B arp 出现 `{1:18,2:11,3:29}`；A12 用前者，另加一条断言锁住后者的这个形状（用来证明轮廓动机不是均匀网格）。

### Tier B · Chromium OfflineAudioContext（Playwright 加载 `file://`，仍无构建）

| # | 指标 | 阈值 |
|---|---|---|
| B01 | 4 bar 渲染两次的 Float32 SHA-256 | 逐位一致（要求 A 层的确定性噪声/IR） |
| B02 | kick 峰值 / T60 | ≤ −3 dBFS / 300–360 ms |
| B03 | kick 40–60 Hz vs 100–300 Hz | 后者 ≥ −12 dB |
| B04 | bass 包络 6–10 Hz 分量 | 无峰（duck 生效） |
| B05 | hat 8–12 kHz 能量占比 | ≥ 25%；metal 层与 noise 层差 ≤ 12 dB |
| B06 | snare 2–4 kHz 共振带宽 | 1.4–1.7 kHz |
| B07 | glitch 事件与 `barStart + tick×SEC_PER_TICK` 偏差 | < 1 sample（1/48000 s） |
| B08 | glitch 总线 321 ms 自相关 | < 0.05（无 delay 复制） |
| B09 | STOP 后 2.5 s | RMS < −80 dBFS 且 `LIVE.size === 0` |
| B10 | CRACK 三条释放路径 | 600 ms 后 `toneLP ≥ 15000`、`crackGate === 1` |
| B11 | 128 状态随机游走 30 s | `LIVE` 无单调增长（每 3 s 采样） |

B01 的前提是替换两处 `Math.random`：`noiseBuf` 与 IR。建议用 `SHA256(MAGIC || seed)` 派生一个本地 xorshift 填充，**不经过 R32 键**——它们不是音乐事件，不该占 `purpose` code，也不该影响任何 golden vector。

### Tier C · 必须人工试听

| # | 项 | 为什么自动测不了 |
|---|---|---|
| C01 | kick 与 bass 是否仍互相掩蔽 | 频谱只证明 100–300 Hz 有能量，不证明那是 body 谐波而不是 click 噪声 |
| C02 | SOUND A/B 是否"像换了一套鼓" | 参数差异可量化，可辨识度不可 |
| C03 | COMP A/B 的动机方向感 | 音高集合能验，旋转/轮廓的听感走向不能 |
| C04 | CRACK 是否"有音乐性" | 门控深度与时值可测，"破坏得好听"不可 |
| C05 | 20 分钟疲劳度、hat 金属感 | 无参考曲线，只能人耳 |

C01 与 B03 不是二选一：B03 是准入门槛（能量比不达标直接打回），C01 是终审（达标了也可能闷）。

---

## 5. 交付物拆分

| 方案 | 双击可运行 | 维护性 | 测试可注入 | 结论 |
|---|---|---|---|---|
| 单 HTML + 内联 classic script | ✅ | 中（预估 55–70 KB） | ✅ 现有正则抽取模式可复用 | **选它** |
| 单 HTML + 外链 `.js`（classic） | ⚠️ 可行但两份文件易漂 | 中 | 好 | 否 |
| 单 HTML + `<script type="module">` | ❌ `file://` 下 origin 为 `null`，模块加载被 CORS 阻断 | 高 | 需起 http | 否 |
| 多 `.js` + 构建 | ❌ | 高 | 好 | 否（直接违背约束） |

理由：`file://` + `type="module"` 在 Chromium 下必然失败，"可双击"与"物理文件拆分"在本项目里互斥；不引构建就不可能有多文件产物。所以只能在**单文件内部**做模块边界。

内部结构（8 段，每段一个 IIFE，显式依赖注入，不用共享全局）：

```js
'use strict';
const Rng    = (() => { /* SHA256, encodeKey, PCG, R32, randomFor, randomForSection */ return {...}; })();
const Params = (() => ({ /* PARAMS, FORM, EU, VOICES */ }))();
const Gen    = (({Rng, Params}) => { /* build() → PAT v2 */ return {build, PAT}; })({Rng, Params});
const Graph  = (({Params}) => { /* initAudio, spawn, panic, buses */ return {...}; })({Params});
const Sched  = (({Gen, Graph, Rng, Params}) => { /* scheduleBar, transport */ return {...}; })(...);
const UI     = (({Sched, Graph}) => { /* grid, formbar, 按钮 */ return {...}; })(...);
const Audit  = (({Rng, Gen}) => { /* selftest() 纯函数 + audit() 异步 */ return {...}; })(...);
window.SERIAL = Object.freeze({ version:'0.4.0', Rng, Params, Gen, Graph, Sched, UI, Audit });
```

这样 Tier A 可以在 node 里直接 `Gen.build({seed, comp})`，不需要 DOM；Tier B 在页面里调 `SERIAL.Audit.audit()`。`window.SERIAL` 同时保留 v0.3 的旧字段别名（`R32`、`TRACK_ID`、`PAT`、`selftest`），保证对照脚本还能跑。

拆文件的触发条件（写进文档，别靠感觉）：单文件 > 80 KB，或出现第二个消费者（S2 Core / 独立播放器）。届时必须引入 http 服务或构建，"双击运行"这条约束要重新谈判。

---

## 6. 实施顺序与门槛

| Gate | 内容 | 通过条件 |
|---|---|---|
| G0 | 端序冻结 + 契约 v0.2 修订 | §4 / §14.1 改一处；v0.4 向量标注读取方式 |
| G1 | 注册表 + 参数外置 + 事件模型 v2（不动合成） | A01–A17 全绿；6 个非 glitch 声部事件数与基线逐位相同 |
| G2 | 合成层按返修方案替换（kick / snare / hat） | B02–B06 达标 |
| G3 | glitch bar plan + `glitchBus` + 修 cap 偏置 | A13、B07、B08 达标 |
| G4 | 生命周期（ledger / panic / crack） | B09–B11 达标 |
| G5 | 双轴矩阵 + bar 边界延迟切换 | A09、I1 / I2 / I3 |
| G6 | 人工试听 + v0.4 golden 冻结 | C01–C05 记录 + 向量入库 |

任何一 Gate 未过不进下一 Gate。G1 之前不动合成，是因为合成一改，事件数与音域的回归基线就全混了。

---

## 7. 未决项与风险

1. **端序**（G0）：默认按大端冻结，若选择小端则 v0.3 对照页失去可比性，需重出 8 条向量。
2. **专家 §3.4 `glitchGate` 位置**：本方案拆成 `glitchBus`（生成侧）+ `crackGate`（演奏侧），若产品意图是"CRACK 时整组鼓一起 stutter"，则保留 `crackGate` 即可，不冲突。
3. **专家 §4.1 cap 偏置**：已改为全收集 + 确定性洗牌，需在 A13 里锁"起点不少于 3 个不同值"。
4. **kick 47 → 55 Hz 与 bass 根音同度**：消除 8 Hz 拍频，但同度意味着最大谱重叠，掩蔽完全由 duck 承担（0.55 / τ=30 ms）。duck 一旦失效，结果比现在更差——B04 是硬门槛。
5. **`setInterval(25ms)` 后台节流**：后台标签页会断。v0.4 不改（超出本次范围），在 footer 标注为已知限制；若要做，用 Worker 定时器，别加大 lookahead。
6. **OfflineAudioContext 含 Convolver 渲染成本**：4 bar 全轨可能 > 5 s。Tier B 默认 2 bar + 单 stem，全轨渲染只在 G6 跑一次。
7. **v0.3 自测的两个既有缺陷**（v0.4 必须修）：`selftest()` 依赖调用时的 `COMP` 全局（实测 `setCOMP('B')` 后跑，`同一 Seed 的 PAT 可复现` 一项 FAIL，因为快照取的是 B、对照组重建的是 A）；依赖调用时的 `SEED`（改种子后 golden 必失败）。v0.4 的 `selftest()` 改为纯函数 `selftest({seed = DEFAULT_SEED, comp = 'A'})`，内部现场重建，不读也不改全局。
