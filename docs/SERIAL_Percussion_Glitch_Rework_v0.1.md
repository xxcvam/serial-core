# SERIAL 打击乐与故障层结构性重做方案 v0.1

状态：`DRAFT` · 2026-11-09 · 基于 Audition v0.3 实现（script 821 行）
范围：Kick / Snare / Hat / Glitch 四层的合成路线与路由
不在范围：Bass（已获认可，不动）、旋律层、母带响度目标

改动标记：
- **【参】** 调参数——只改数值、曲线、时间常数
- **【构-声部】** 换结构——单个 voice 函数内新增/改接节点
- **【构-总线】** 换结构——总线、路由、发送
- **【构-调度】** 换结构——调度器或事件数据模型

---

## 0. 结论

1. 四层的共同问题不是增益，是**层数不足**：kick 缺 click 层与饱和，snare 缺第二壳模与房间发送，hat 的金属源被 HP 滤成一个 −40 dB 的装饰，glitch 根本不是 gate/stutter。
2. Kick 基频 47 Hz 与 Bass 根音 55 Hz 相差 8 Hz，同处 40–100 Hz 带且无 relative ducking——这是结构性掩蔽，不是音色偏好问题。
3. 现有 master 压缩器已经在做全带宽 pump（每次 kick 约 3.7–5.5 dB 衰减），但它同时压 kick 自身，且 `DynamicsCompressorNode` 没有 key 输入，做不了真 sidechain。pump 必须改成显式 gain automation。
4. Glitch 必须重做为**事件级 gate + 事件级 retrigger**，走独立总线（当前走 fxBus→delay，每次都被 321 ms 延迟复制，时间对齐已破坏）。真·音频 stutter 在当前图里做不到，需要 AudioWorklet。
5. `PAT` 每步一个 `ev` 的结构表达不了跨步事件，glitch 必须升到 bar 级规划。

---

## 1. 现状测绘（可核对）

### 1.1 图

```
kick/snare/hat ──► drumBus(0.9) ──┐
bass ────────────► bassBus(0.55) ─┤
arp ─────────────► arpBus(0.34) ──┼──► master(0.72) ──► comp ──► toneLP ──► out
lead ────────────► leadBus(0.28) ─┘
glitch ──────────► fxBus(0.5) ──┬──► master
                                └──► delay(321ms, fb 0.23, LP 2600)
arp/lead ────────► delay, verb(1.7s, 0.13)
```

- `comp`: threshold −12, knee 12, ratio 3.2, attack 4 ms, release 160 ms（L337–339）
- **全文件无 WaveShaperNode、无 StereoPannerNode、无 per-bus 压缩**
- **drumBus 没有 verb send**（只有 arpBus / leadBus 送，L365–366）
- **glitch 没有独立总线**，走 fxBus，而 fxBus 接 delay（L367）

### 1.2 时钟

| 量 | 值 |
|---|---|
| BPM | 140 |
| 1/16 | 107.14 ms |
| 1/32 | 53.57 ms |
| 1/16 三连 | 71.43 ms |
| 1 Bar | 1714.29 ms |
| 1 Tick（PPQ 96） | 4.464 ms |

调度：`setInterval(tick, 25)` + 120 ms lookahead，事件用绝对 `AudioContext` 时间排程（L655–666）。音频侧是样本精确的，UI 侧不是。

### 1.3 电平

kick 峰值 = `v*0.85 × drumBus 0.9 × master 0.72`，v ∈ [0.85, 1.14] → **−6.6 ~ −4.0 dBFS**。
进 comp 时超 threshold 5.96–7.96 dB，ratio 3.2 → **GR 3.7–5.5 dB**（knee 12 dB 内为渐入，取上限估计）。
release 160 ms < kick 间隔 428.6 ms → 每次 kick 独立触发一次全带宽压缩，恢复完再下一次。

---

## 2. 四层缺什么

### 2.1 Kick（`vKick` L382–400）

| 缺 | 依据 |
|---|---|
| 无独立 beater/click 层 | 只有 sine body + 10 ms HP 噪声；909 的 click 与 body 是两条独立包络 |
| 基频落点冲突 | 47 Hz ≈ F#1，不在 A 自然小调内；与 `BASS_ROOT=55`（A1）构成 8 Hz 拍频，且同在 40–100 Hz |
| 无饱和 | 纯 sine 无谐波；不能重放 47 Hz 的扬声器上这一层等于不存在。909/808 都靠饱和或 click 提供 100–300 Hz 替代能量 |
| 无 sidechain | kick 不影响 bass；唯一压缩器在 master，压不到单一分轨 |
| pitch envelope 拖尾 | 三段 165→62(18 ms)→47(65 ms)，基频在 body 衰减的前 65 ms 仍在移动 |

### 2.2 Snare（`vSnare` L402–426）

| 缺 | 依据 |
|---|---|
| 单壳模 | 一个 triangle 190→133 的**下滑音**，不是两个共振壳模；缺 200–400 Hz 的第二共振峰 |
| 噪声无共振 | HP 850 → BP 2350 **Q 0.5**：带宽 ≈ f/Q ≈ 4.7 kHz，等于没有带通 |
| 三个瞬时起音叠加 | body / noise / 5.2k 层全部 `setValueAtTime` 在 t 起音（L408/416/423），无 attack 整形 |
| 无房间 | drumBus 无 verb send |
| 顶部有断层 | 5.2 kHz 层 45 ms 独立存在，与主体不共享饱和 |

### 2.3 Hat（`vHat` L428–446）

| 缺 | 依据 |
|---|---|
| 金属源被滤没了 | 3 支方波 421/632/777 → HP 5800。方波奇次谐波，421 的第 15 次才到 6315 Hz，幅度 ≈ −21 dB；再乘 `metal` 增益 0.04，相对噪声层 0.45 低约 **40 dB**。实际输出基本只有噪声 |
| 无带通 | 909/808 都是 HP + BP 两级；单 HP 给不出定义共振峰 |
| open 与 pattern 解耦 | `open` 由步序号 `st%8===6` 决定，不由力度或 pattern 决定；velocity 与 decay 无耦合 |
| 无 choke | 当前 8 分网格（214 ms）下 190 ms 开镲恰好不重叠；一旦加密到 16 分（107 ms）就会叠 |
| 噪声无偏移 | 每次从 buffer 0 开始，相位完全一致 |

### 2.4 Glitch（`vGlitch` L514–530）

| 缺 | 依据 |
|---|---|
| 不是 gate/stutter | BP 扫频噪声 + 3 个 18 ms 间隔噪声点，是音效型 one-shot |
| 内部节奏不在网格上 | 18 ms 与 1/32（53.57 ms）、1/16（107.14 ms）都无关 |
| 无重触发机制 | 没有捕获、没有 gate 节点、没有重复已发生音频的路径 |
| 被延迟污染 | 走 fxBus，fxBus 接 321 ms delay、fb 0.23 → 每次 glitch 被复制一次 |
| 生成侧过薄 | 只有每步 12% / BREAK 38% 的概率；无 division / length / accent；未使用 `duration` / `eventId` purpose |

---

## 3. 参数级方案

### 3.1 Kick

| 层 | 实现 | 参数 | 改动 |
|---|---|---|---|
| Beater | noise → HP | HP 3.0 kHz，12 dB/oct，Q 0.7；电平 0.5 ms → peak → 6 ms 衰到 −60 dB；相对 body −16 dB | 【构-声部】 |
| Body osc | sine | 165 Hz @t → 55 Hz @t+28 ms（exp），之后恒定 | 【参】 |
| Body amp | gain | 0.5 ms 到 peak；exp 到 0.35·peak @90 ms；exp 到 −60 dB @340 ms | 【参】 |
| 饱和 | WaveShaper tanh，drive 2.0，`oversample='4x'`，后置 LP 7 kHz | 输出 trim −3 dB | 【构-声部】 |
| Duck | bassBus → duckGain → master | 1 → 0.55 @t−4 ms（2 ms 斜坡）；从 t+10 ms 起 `setTargetAtTime(1, τ=30 ms)` | 【构-总线】 |

要点：
- 55 Hz 与 `BASS_ROOT` 同度，消除 8 Hz 拍频；若要更低的听感重心，用 41.2 Hz（E1，仍在 A 小调内），但需同步把 `BASS_MOV` 的最低音移开 E。
- 单段 pitch 到基频（去掉第三段），基频在 28 ms 后稳定，尾音只剩幅度衰减。
- 饱和放在 click 与 body 的求和点之后，click 也会被削，得到统一的密度。
- 不送混响；或 3% 短 room（0.4 s）防干死。

### 3.2 Snare

| 层 | 实现 | 参数 | 改动 |
|---|---|---|---|
| 壳模 1 | triangle | 185 Hz → 168 Hz @12 ms；decay 85 ms；电平 0 dB | 【构-声部】 |
| 壳模 2 | sine | 330 Hz → 300 Hz @10 ms；decay 55 ms；电平 −6 dB | 【构-声部】 |
| 噪声 | white → HP 700（12 dB/oct）→ BP 2200 Q 1.5 | decay 130 ms；电平 −3 dB | 【参】 |
| Transient | noise → HP 3 kHz | 4 ms；电平 −12 dB | 【构-声部】 |
| 饱和 | tanh 1.8，`oversample='4x'`，作用于四层求和 | trim −3 dB | 【构-声部】 |
| 发送 | drumBus → predelay 18 ms → verb，15% | Convolver 无 predelay 参数，必须前置 DelayNode | 【构-总线】 |

Q 1.5 @2200 Hz → 带宽 ≈ 1467 Hz，这是"有共振"与"宽带噪声"的分界；当前 0.5 是 4400 Hz。

### 3.3 Hat

| 层 | 实现 | 参数 | 改动 |
|---|---|---|---|
| 金属源 | 6 × square，808 复刻常用值 205.3 / 304.4 / 369.6 / 522.7 / 540 / 800 Hz | 每支 1/6 增益 | 【构-声部】 |
| 滤波 | HP 6.0 kHz（12 dB/oct）→ BP 9.5 kHz Q 1.0 | — | 【构-声部】 |
| 噪声层 | white → HP 7.2 kHz，每击随机 offset | 电平 0.30；decay 为金属层的 0.6× | 【参】 |
| 包络 | closed 45 ms / open 210 ms | accent 时 decay ×1.3 | 【参】 |
| Choke | 闭镲触发时对开镲 gain 做 3 ms 斜坡到 0 | 模块级保存 lastOpenGain | 【构-声部】 |

要点：
- 金属感来自 6 个**基频**的不谐和叠加，不是来自高次谐波。现行 3 方波 + HP 5800 恰好把基频全部滤掉、只留稀疏高次，所以听起来是噪声。
- BP 9.5 kHz 的目的是选出这 6 个基频的高次簇（约 8–11 kHz），而不是保留基频。
- 6 个频率为 808 复刻惯例值，若要对标具体参考需另行核对原理图。

### 3.4 Glitch

| 层 | 实现 | 参数 | 改动 |
|---|---|---|---|
| Gate | `glitchGate` GainNode 串在 drumBus 之后 | 2 ms 斜坡，关闭电平 0–0.35，占空比 50% | 【构-总线】 |
| Retrigger | 按网格重复最近 L tick 的事件（重调合成函数，不做音频捕获） | 1/32 或 1/16T | 【构-调度】 |
| 总线 | 独立的 `glitchBus` → master，**不接 delay** | verb 8% | 【构-总线】 |
| 噪声纹理 | 保留现有 BP 扫频，仅作 20% 概率的附加层 | 不作为主事件 | 【参】 |

---

## 4. Glitch 与 transport 对齐的触发规则

### 4.1 数据模型

当前 `PAT[sec][bar][step]` 是每步单事件，表达不了跨步。新增 bar 级规划：

```js
// build() 内，每 bar 生成一次；替代 L315 的逐 step 概率
function planGlitch(sec, bar){
  const out = [];
  const p = sec.id===4 ? 70 : sec.id===3 ? 45 : sec.id===2 ? 25 : 0;   // 百分比
  const cap = (sec.id===3 || sec.id===4) ? 2 : 1;
  for (let tick = 0; tick < TICKS_PER_BAR; tick += 12) {               // 1/32 栅格
    if ((R32(SEED,TRACK_ID.glitch,sec.id,bar,tick,PURPOSE.gate)%100) >= p) continue;
    const div   = [12,16,24][R32(SEED,7,sec.id,bar,tick,PURPOSE.timbre)%3];
    const slices= 1 + R32(SEED,7,sec.id,bar,tick,PURPOSE.duration)%4;  // ×12 ticks
    const depth = (R32(SEED,7,sec.id,bar,tick,PURPOSE.velocity)%100)/100*0.35;
    const kind  = (R32(SEED,7,sec.id,bar,tick,PURPOSE.mutation)%100) < 35 ? 'stutter' : 'gate';
    out.push({ tick, div, lenTicks: slices*12, depth, kind });
    if (out.length >= cap) break;
  }
  return out;
}
```

### 4.2 规则

| 规则 | 值 |
|---|---|
| 允许起点 | `tick % 12 === 0`（1/32 栅格）；不在段落最后 12 tick 内新起 |
| 时长 | `lenTicks` ∈ {12, 24, 36, 48}，并 clamp 到段尾 |
| 重复分割 | `div` ∈ {12, 16, 24} tick（1/32、1/16T、1/16） |
| gate 关闭电平 | 0.65–1.0（即 depth 0–0.35） |
| gate 斜坡 | 2 ms 线性；禁止 `setValueAtTime` 直接跳变 |
| retrigger 长度 | 最近 1 或 2 步的已生成事件，第 0 片原样，后续片衰减 0.8^i |
| 每 bar 上限 | CLIMAX / BREAK 2 次，其余 1 次 |
| 概率 | 由 Section 决定（70/45/25/0），不再用平铺 12% |

### 4.3 排程

```js
const SEC_PER_TICK = (60/BPM) / PPQ;                 // 4.464 ms
const barStart = t - step * stepDur();               // tick() 内已知
const t0 = barStart + g.tick * SEC_PER_TICK;

for (let i = 0; i < Math.ceil(g.lenTicks / g.div); i++) {
  const s = t0 + i * g.div * SEC_PER_TICK;
  gate.gain.setValueAtTime(1, s - 0.002);
  gate.gain.linearRampToValueAtTime(g.depth, s);
  gate.gain.setValueAtTime(g.depth, s + g.div*SEC_PER_TICK*0.5);
  gate.gain.linearRampToValueAtTime(1, s + g.div*SEC_PER_TICK*0.5 + 0.002);
}
```

事件时间由绝对 `AudioContext` 时间给出，与 140 BPM 的 tick 一一对应；只要 `barStart` 从调度器取而不是从 UI 取，就没有累积漂移。

### 4.4 CRACK 重绑定

当前 CRACK 只把 master `toneLP` 拉到 420 Hz（L778）。改为：`toneLP` 420 Hz + `glitchGate` 以 1/32 门控 drumBus + 冻结 duckGain 在 0.55。三者同一时间常数（50 ms 进、450 ms 出）。

---

## 5. 当前 WebAudio 图做不到的事

| # | 做不了 | 原因 | 需要 |
|---|---|---|---|
| 1 | 真 sidechain 压缩 | `DynamicsCompressorNode` 无 key/sidechain 输入 | 换 gain automation（duck）；或 AudioWorklet 自写压缩器 |
| 2 | 真·音频 stutter / freeze | 无总线捕获。`MediaStreamAudioDestinationNode` + `MediaRecorder` 是压缩流、有编码延迟、非样本精确 | AudioWorklet + ring buffer（`addModule` 用 Blob URL，避免 file:// 限制） |
| 3 | 跨步事件 | `PAT` 每步一个 `ev`，无时长字段 | 换数据模型：bar 级 plan（§4.1） |
| 4 | glitch 与网格对齐 | 走 fxBus → delay 321 ms、fb 0.23 | 换总线：独立 glitchBus，不接 delay |
| 5 | drumBus 房间 | 无 send | 换总线：drumBus → predelay → verb |
| 6 | 多段压缩 / 分频处理 | 无原生 multiband | Biquad 分频或 Worklet |
| 7 | 立体声鼓组 | 全链路 mono、无 `StereoPannerNode` | 逐声部 panner + 双声道噪声 buffer |
| 8 | 可复现渲染 | `noiseBuf` 与 IR 用 `Math.random`（L371、L359），违反 RNG 契约 §4.5 | 换确定性源：R32 取 offset / IR 用固定种子生成 |
| 9 | 后台稳定播放 | `setInterval(25 ms)` + 120 ms lookahead，后台标签页节流到 1 s 会断 | Worker 定时器或加大 lookahead |
| 10 | 909 原厂 hat | 909 的 hat 是 6-bit PCM 采样，合成只能逼近 | 采样资产管线 |

---

## 6. 验收（不依赖听感）

用 `OfflineAudioContext` 渲染单次 hit 与 4 bar loop，对每个断言取数：

| 层 | 指标 | 目标 |
|---|---|---|
| Kick | 峰值 / −60 dB 衰减时间 | 峰值 ≤ −3 dBFS；T60 300–360 ms |
| Kick | 40–60 Hz 与 100–300 Hz 能量比 | 饱和后 100–300 Hz 至少 −12 dB（当前为 −∞，纯 sine） |
| Kick×Bass | 同时触发时的包络调制频率 | 无 8 Hz 分量（当前 47 vs 55 必然存在） |
| Kick | master comp `reduction` 读数 | 每次 kick ≤ 2 dB（当前 3.7–5.5 dB） |
| Snare | 2–4 kHz 共振带宽 | 1.4–1.7 kHz（Q 1.5 @2200） |
| Snare | verb 返回电平 | −18 ~ −14 dBFS @150 ms |
| Hat | 8–12 kHz 能量占比 | ≥ 25% 总能量；金属层与噪声层差值 ≤ 12 dB（当前约 40 dB） |
| Glitch | gate 事件时间与 tick 网格偏差 | < 1 sample（22.7 µs @44.1 kHz） |
| Glitch | delay 复制 | 0 次（总线隔离后） |
| 全局 | 4 bar 渲染两次的 SHA-256 | 逐位一致（当前 `Math.random` 下不可能） |
