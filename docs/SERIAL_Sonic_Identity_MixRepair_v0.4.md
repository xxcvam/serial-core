# SERIAL 声音身份 Audition v0.3 — 混音返修方案 v0.4

测量对象：`F:\dsh\SERIAL_Sonic_Identity_Audition_v0.3.html`
测量工具：`F:\dsh\SERIAL_mix_probe.mjs`（headless Chrome + OfflineAudioContext，48 kHz，8 小节 CLIMAX）
原始数据：`F:\dsh\SERIAL_mix_probe_v04.json`
滤波器取值依据：`F:\dsh\SERIAL_biquad_check.mjs`、`F:\dsh\SERIAL_hp_shape.mjs`

---

## 0 结论

**音色设计不是问题，总线路由和静态增益是。**

七声部单独听都对，合起来不对，原因按实测幅度排序：

| # | 问题 | 实测证据 | 性质 |
|---|------|---------|------|
| 1 | Arp 比 Bass 低 21.1 dB（LUFS −39.9 vs −18.8） | 200–400 Hz 帧级归属：bass 49% / lead 36% / **arp 8%** | 静态增益，纯算术错误 |
| 2 | 混响+延迟并联的湿声 ≈ 干声本身 | FX 开启比关闭多 +3.0 dB（= 湿/干功率比 1.0） | 无返回增益 + 无预延迟 |
| 3 | 250–500 Hz 是 Bass 的 LP 共振尾巴说了算 | bass −0.5 / lead −7.7 / arp −15.0，bass 领先 7.2 dB | Q=7 的 LP 在 500–900 扫频，+7 dB 共振 |
| 4 | 2–5 kHz 只有 Lead 一家，Snare 低 6.5 dB | lead −14.9 / snare −21.4；同段 5–10k 是 Hat 噪声 −17.7，比第二名高 11 dB | 顶上是嘶声、中间是空的 |
| 5 | Lead 的 f/2 次振荡器（220–330 Hz）压在 Arp 基频区（220–392 Hz）上 | 400–700：lead 62% / **bass 34%**；250–500 三声部并列 | 结构性占位冲突 |
| 6 | 三件打击乐共用 drumBus 0.9 | kick pk −4.1 / snare −11.4 / hat −15.1，差 11 dB 且无法单独配平 | 路由缺陷 |
| 7 | 七声部 LUFS 跨度 26.2 dB | bass −18.8 … glitch −45.0 | 静态增益 |

返修后（v0.4 图，同一测量窗口、同一噪声种子）：200–400 Hz 归属 arp 60%，400–700 Hz lead 90%，Kick 在自己击打时刻 30–60 Hz 100% 第一、60–120 Hz 75% 第一，FX 湿声降到 +0.1 dB。**结构问题全部关闭；剩 3–6 kHz 存在感不足（−11.2 dB vs 400–700 的 −0.1 dB），这一项必须靠耳朵定幅度。**

---

## 1 测量方法（可复现）

```
node F:\dsh\SERIAL_mix_probe.mjs > SERIAL_mix_probe_v04.json
```

- 渲染 8 小节 CLIMAX（`SEC=3`），步长 0.1071 s，小节 1.714 s，采样率 48 kHz
- `Math.random` 固定为 `mulberry32(0xA7F209C1)` — 页面里 `noiseBuf`（L369）和 IR（L359）都用 `Math.random`，不固定种子则 6–20 kHz 每次差 ±1 dB，验收不可复核
- 频段能量：8192 点 Hann FFT、hop 2048（42.7 ms 帧），能量 dB 相对 0.5 满幅
- LUFS：K-weighting biquad + 400 ms/100 ms block + −70 LUFS 绝对门限 + −10 LU 相对门限
- 归属率：逐帧统计「该频段内能量最大的声部」，得出百分比
- 击中时刻判定：在每个 kick 触发点取该帧，比较 kick 与 bass 在 30–60 / 60–120 的大小

两组频段网格都要看。**250–500 / 500–1k 这种整百网格在本曲里不可用**：Arp 最高 392 Hz、Lead 最低 440 Hz，500 Hz 正好把两个声部的基频切进同一格。归属判定必须用音乐网格（200–400 / 400–700）。

---

## 2 频段占用与掩蔽（v0.3 实测）

单位 dB。列 = 频段，行 = 声部。

| 声部 | 30-60 | 60-120 | 120-200 | 200-400 | 400-700 | 700-1.5k | 1.5-3k | 3-6k | 6-12k | 12-20k | peak | LUFS |
|------|------|--------|---------|---------|---------|----------|--------|------|-------|--------|------|------|
| kick | 0.2 | **3.7** | −2.7 | −11.2 | −19.8 | −25.1 | −33.6 | −30.5 | −27.2 | −29.5 | **−4.1** | −22.3 |
| snare | −37.1 | −30.7 | −15.6 | −20.6 | −28.6 | −23.7 | −22.7 | −22.9 | −23.4 | −28.0 | −11.4 | −34.2 |
| hat | −125 | −110 | −101.5 | −79.5 | −63.7 | −52.6 | −40.0 | −24.2 | −16.8 | **−18.0** | −15.1 | −35.9 |
| bass | **3.9** | **4.3** | **2.2** | **0.3** | −4.7 | −14.7 | −34.7 | −45.6 | −49.6 | −52.5 | −3.9 | **−18.8** |
| arp | −42.7 | −37.5 | −27.7 | −13.9 | −25.3 | −31.0 | −36.3 | −47.2 | −66.5 | −84.2 | −23.2 | −39.9 |
| lead | −54.7 | −49.2 | −36.4 | −8.9 | −7.5 | −10.1 | −13.2 | −20.5 | −38.2 | −58.7 | −16.4 | −29.2 |
| glitch | −85.7 | −74.3 | −71.0 | −57.3 | −41.0 | −32.9 | −31.9 | −31.3 | −28.6 | −31.3 | −24.4 | −45.0 |
| **mix** | 7.1 | 8.2 | 5.0 | 3.0 | −1.0 | −6.6 | −10.6 | −15.3 | −12.4 | −13.2 | −0.72 | −15.34 |

### 2.1 谁在抢 200–500 Hz

**答案是 Bass，而且是它的 LP 共振，不是它的基频。**

- 200–400 Hz 帧级归属：bass 49%、lead 36%、arp 8%、kick 7%
- 250–500 Hz 电平：bass −0.5、lead −7.7、arp −15.0 → bass 领先 7.2 dB
- Bass 的 200–500 来自两处：① 55–98 Hz 的 3–5 次谐波（220–490 Hz）；② `vBass`（L449）的 LP `Q=7` 在 500–900 Hz 扫频时 +7 dB 共振（实测 `getFrequencyResponse`，见第 8 节）

**次低频不是这个问题的原因，但要单独处理**：`vBass` 的 `square(f/2)` 给出 27.5–49 Hz，K-weighting 几乎不计入 LUFS，却占 Limiter 头部空间（bass peak −3.9 是全轨最高）。

### 2.2 谁在抢 2–5 kHz

**只有 Lead 一家，上面的顶是 Hat 噪声。**

- 2–5k：lead −14.9、snare −21.4、hat −28.0 → lead 领先 6.6 dB，snare 在自己的击打频段被压 6.5 dB
- 5–10k：hat −17.7，比第二名 snare −23.1 高 5.4 dB，比 glitch 高 11 dB
- Hat 的金属感是假的：`vHat`（L428）的 421/632/777 Hz 方波基频全部被 HP5800 切掉，只剩 ≥14 次谐波（约 −23 dB 再 ×0.04），**实际听不到的振荡器在占 CPU，听感全是噪声**。这是设计层问题，本方案不动它，但顶端的"嘶"必须知道来源

### 2.3 谁该做侧链

**只有一个：kick → bass。**

判据不是"低音总是要侧链"，是这三条同时成立：

1. 60–120 Hz 电平差只有 0.6 dB（bass 4.3 / kick 3.7）— 静态已经分不开
2. 两者包络相关 0.009 — 它们**完全没有互相让位**，纯平行叠加
3. kick 在自己 32 个击打时刻里只有 59% 是 30–60 Hz 最大值（另 41% 被 bass 盖住）

参数（写入代码的区间）：−3.0 ~ −4.5 dB，attack 3–6 ms，release 80–130 ms（τ 30–40 ms），**key 用 kick 本体，不要用 drumBus**（否则 hat 也会压 bass）。

不需要侧链的：

- **arp / lead**：包络相关 0.18（已时间错开），冲突是频率占位，用 HPF 分离（见 3.2）
- **hat / glitch**：瞬态，无持续重叠，靠电平阶梯解决

---

## 3 返修后实测（v0.4 图）

### 3.1 频段表

| 声部 | 30-60 | 60-120 | 120-200 | 200-400 | 400-700 | 700-1.5k | 1.5-3k | 3-6k | 6-12k | 12-20k | peak | LUFS |
|------|------|--------|---------|---------|---------|----------|--------|------|-------|--------|------|------|
| kick | 0.5 | 2.9 | −4.7 | −13.6 | −22.4 | −27.7 | −35.5 | −36.0 | −31.0 | −32.3 | −6.0 | −23.1 |
| snare | −35.9 | −29.5 | −14.5 | −19.4 | −26.6 | −25.2 | −21.3 | −21.8 | −22.1 | −26.8 | −9.0 | −33.2 |
| hat | −124 | −111 | −104 | −82.8 | −65.8 | −57.0 | −42.4 | −26.4 | −18.6 | −19.8 | −16.4 | −37.7 |
| bass | −1.9 | 0.9 | −1.5 | −6.8 | −20.3 | −38.7 | −72.3 | −96.2 | −114 | −133 | −8.9 | −23.5 |
| arp | −34.5 | −29.0 | −19.3 | **−5.7** | −16.9 | −22.7 | −27.9 | −38.8 | −57.7 | −74.3 | −12.0 | −31.7 |
| lead | −66.1 | −60.8 | −47.4 | −16.8 | **−3.5** | −5.5 | −8.5 | −15.7 | −33.0 | −52.5 | −13.5 | −25.8 |
| glitch | −77.2 | −70.6 | −67.3 | −50.8 | −38.1 | −29.3 | −23.0 | −27.8 | −23.6 | −24.4 | −16.0 | −37.8 |
| **mix** | 5.2 | 7.1 | 2.9 | 0.4 | −0.1 | −2.0 | −4.8 | −11.2 | −12.0 | −12.5 | −0.33 | −16.23 |

### 3.2 归属率（帧级，v0.3 → v0.4）

| 频段 | 指定归属 | v0.3 归属率 | v0.4 归属率 | 判决 |
|------|---------|------------|------------|------|
| 30-60 | kick | 22% (bass 59%) | 32% (bass 47%) | 改判：见下条 |
| 60-120 | kick | 27% (bass 53%) | 30% (bass 49%) | 同上 |
| 120-200 | bass | 55% ✓ | 50% ✓ | 通过 |
| 200-400 | **arp** | **8%** (bass 49%) | **60%** (bass 32%) | 通过 |
| 400-700 | **lead** | 62% (bass 34%) | **90%** | 通过 |
| 700-1.5k | lead | 79% ✓ | **96%** ✓ | 通过 |
| 1.5-3k | lead | 97% ✓ | 92% ✓ | 通过 |
| 3-6k | lead | 68% ✓ | 64% ✓ | 通过 |
| 6-12k | **hat** | 48% | 40%（glitch 25/lead 19/snare 16） | **未通过** |
| 12-20k | hat | 54% ✓ | 46%（glitch 24/snare 17） | 勉强 |

**30–60 / 60–120 不能用帧级归属判 Kick**：bass 是连续声部，Kick 每小节只有 4 次、300 ms 衰减，按帧统计 bass 必然占多数。Kick 的判据必须是**击打时刻**：

| 指标 | v0.3 | v0.4 | 目标 |
|------|------|------|------|
| 击打时刻 30–60 Hz 第一 | 59% | **100%** | 100% |
| 击打时刻 60–120 Hz 第一 | 59% | **75%** | ≥ 90% |
| 两声部包络相关 | 0.009 | −0.047 | < 0.3（说明已时间分离） |

60–120 差 25% 的原因：duck 只到 −3.5 dB，且 kick 的 60–120 尾巴短。把 duck 加到 −4.5 dB、release 缩到 90 ms 可补齐 — 这是 stage-2 微调项，不影响结构结论。

### 3.3 FX 湿声（dry − withFX，负值 = 湿声更大）

| 声部/频段 | v0.3 | v0.4 |
|-----------|------|------|
| arp 200-500 | −3.14 | −0.11 |
| arp 500-1k | −2.99 | −0.16 |
| lead 200-500 | −3.12 | −0.17 |
| lead 500-1k | −3.27 | +0.08 |

v0.3 的 −3.0 dB 意味着 **湿声功率 ≈ 干声功率**（10^(3.0/10) = 2.0，总功率翻倍）。v0.4 降到 0.1–0.2 dB（湿/干功率比 0.02–0.05，即 −13 ~ −17 dB），落在正常混响量级。

---

## 4 总线结构

### 4.1 现状（v0.3，L333–372）

```
master(0.72) → comp(−12dB,12knee,3.2:1,4ms,160ms) → toneLP(20k,Q0.7) → destination
  ├ drumBus(0.9) ← kick / snare / hat
  ├ bassBus(0.55)
  ├ arpBus(0.34)  ─┬→ master
  │                 ├→ delay ──────────→ master   ← 无返回增益
  │                 └→ verb(0.13) ─────→ master   ← 无预延迟
  ├ leadBus(0.28) ─┘（同上）
  └ fxBus(0.5) → master / delay
```

三个结构性缺陷：**drumBus 共用一个增益**（三件打击乐锁死在 0.9，实测峰值差 11 dB）、**FX 返回直连 master 无衰减**、**无母线 EQ / 无侧链**。

### 4.2 目标结构

```
                 ┌ kickBus(0.74) → EQ(52Hz,+3dB,Q0.9) ─┐
 percussion ─────┼ snareBus(1.14) ────────────────────┤
                 └ hatBus(0.80) ──────────────────────┤
                                                      │
 bass ─ bassBus(0.45) → duck(kick key) → HP45 → LP240 ┤
                                                      ├→ master(0.65) → comp → toneLP(Crack) → limiter → out
 arp  ─ arpBus(1.37) ────────────────────────────────┤     │
 lead ─ leadBus(0.76) → HP(BW4@380) ─────────────────┤     │
                                                      │     │
 glitch ─ fxBus(1.42) ───────────────────────────────┤     │
                                                      │     │
 发送：arp→verb 0.50 / lead→verb 0.60 ──→ predelay(26ms) → convolver(1.0s) → ret 0.075 ─→ master
      arp→delay 0.35 / lead→delay 0.25 / glitch→delay 0.40 → delay(0.3214s) → HP300+LP2200+fb0.20 → ret 0.62 → master
```

### 4.3 母线增益表（写入代码）

| 母线 | v0.3 | v0.4 | 依据 |
|------|------|------|------|
| kickBus | 0.9（共用） | **0.74** | 目标 peak −6.0 dBFS |
| snareBus | 0.9（共用） | **1.14** | 目标 peak −9.0 |
| hatBus | 0.9（共用） | **0.80** | LUFS ≈ −37.5，6–12k 不与 glitch 打架 |
| bassBus | 0.55 | **0.45** | peak −8.9；LP240 削掉 200+ 后需回补 3.5 dB |
| arpBus | 0.34 | **1.37** | peak −12.0（原 −23.2，差 11.2 dB 全靠这里） |
| leadBus | 0.28 | **0.76** | peak −13.5；HP 削掉次振荡器后需回补 |
| fxBus | 0.5 | **1.42** | glitch peak −16.0 |
| master | 0.72 | **0.65** | 见 4.5 |

母线 EQ / 侧链（全部插在母线之后、master 之前）：

| 位置 | 类型 | 参数 | 理由 |
|------|------|------|------|
| kickBus | peaking | 52 Hz, Q **0.9（线性）**, +3.0 dB | 47–62 Hz 尾巴抬 3 dB，让 30–60 归属可判 |
| bassBus | highpass | 45 Hz, Q **−3.01 dB** | 切 27.5 Hz 次低频，省 headroom |
| bassBus | lowpass | 240 Hz, Q **−3.01 dB** | 把 200–500 让给 arp（实测 bass 250–500：**−0.5 → −9.9 dB**；200–400 归属 arp 8% → 60%） |
| bassBus | duck | −3.5 dB / 5 ms / τ35 ms，key = kick | 见 2.3 |
| leadBus | highpass ×2 | 380 Hz, Q **−5.33 / +2.32 dB** | 4 阶 Butterworth，切 f/2 次振荡器。实测 220→−19 dB、330→−6.1、440→−1.2 |

### 4.4 压缩与饱和位置

| 位置 | v0.3 | 建议 | 依据 |
|------|------|------|------|
| 鼓组 bus | 无 | **新增**：thr −18 dBFS, ratio 4:1, attack 3 ms, release 80 ms, GR 3–5 dB | 现在 kick/snare 峰值靠 coincidence 叠加到 −0.33 dBFS，全靠 Limiter 硬压；鼓组先吃掉 3–5 dB 最省 |
| 主 bus | −12 dB, knee 12, 3.2:1, 4 ms/160 ms | **−16 dB, knee 6, 2.0:1, 20 ms/200 ms** | 实测 v0.3 的主压缩净增益 +2.0 dB、峰值只压掉 0.42 dB、500–2k 包络调制 3.1 dB — 它不是压缩器，是 Chrome 的 makeup 增益在抬电平（见 4.6）。改成慢 attack / 低 ratio 当 glue，真正的峰值控制交给 Limiter |
| Limiter | 无 | **新增**：ceiling −1.0 dBTP, GR ≤ 2.6 dB, 输出 +1.7 dB | 见 4.5 |
| 饱和 | 无 | **不建议加** | 七声部已经是 saw/square 主导，本曲缺的不是谐波密度，是 3–6k 存在感和顶端排序。加饱和会同时抬 3–6k 和 6–12k，把 Hat 的嘶声问题放大 |

### 4.5 电平目标（数值区间）

母线层（master = 0.65，未过 Limiter 时的实测值，可直接当验收线）：

| 声部 | peak 目标 | v0.4 实测 |
|------|-----------|-----------|
| kick | −6.0 ± 1.0 | −6.0 |
| snare | −9.0 ± 1.0 | −9.0 |
| bass | −9.0 ± 1.0 | −8.9 |
| arp | −12.0 ± 1.0 | −12.0 |
| lead | −13.5 ± 1.0 | −13.5 |
| glitch | −16.0 ± 1.5 | −16.0 |
| hat | −16.5 ± 1.5 | −16.4 |

Master 层（两种交付口径，二选一写进验收）：

| 口径 | integrated LUFS | true peak | Limiter GR |
|------|----------------|-----------|------------|
| 评审/流媒体 | **−14.5 ± 0.7** | ≤ −1.0 dBTP | ≤ 2.6 dB |
| 动态优先 | **−16.5 ± 0.7** | ≤ −1.0 dBTP | ≤ 1.0 dB |

推算依据：v0.4 母线层实测 −16.23 LUFS / peak −0.33 dBFS（crest 15.9 dB）。取 +1.7 dB 输出增益后 peak 到 +1.37，Limiter 压 2.4 dB 到 −1.0，LUFS 落在 −14.5。crest 收窄到 13.5 dB，属于正常舞曲母带。

**硬约束**：Limiter GR 超过 2.6 dB 时不要继续加输出增益，回母线层找问题（通常是鼓组 coincidence 或某个声部峰值过高），否则 PLR 会塌到 10 dB 以下。

### 4.6 必须知道的实现陷阱：BiquadFilter 的 Q 是 dB

`SERIAL_biquad_check.mjs` 实测（Chrome）：

| 设置 | 1 kHz 处响应 |
|------|-------------|
| highpass, Q=0.707 | +0.7 dB |
| highpass, Q=7 | **+7.0 dB** |
| lowpass, Q=7 | +7.0 dB |

**WebAudio 的 highpass / lowpass，Q 单位是 dB，不是线性 Q。** 影响两处：

1. `vBass`（L449）的 `Q=7` 是 +7 dB 共振，不是 +17 dB。所以 500–900 Hz 的鼓包比"看起来"小，但确实存在，且随 cutoff 扫动 → 这就是 250–500 归属混乱的来源之一
2. 本方案所有 Q 值按 `20*log10(Q_linear)` 写：线性 0.707 → **−3.01**，Butterworth 4 阶的两节 → **−5.33 / +2.32**

第一次尝试按线性值写（0.5412 / 1.3066），实测 250–500 反而**升高 2.8 dB**（两节都在 340 Hz 附近各带 +2 dB 峰）— 这是必须写进代码规范的一条。

---

## 5 空间

### 5.1 发送量与返回

| 参数 | v0.3 | v0.4 | 理由 |
|------|------|------|------|
| delay 时间 | 0.3214 s（附点八分 = 3 步） | **不变** | 与 140 BPM 咬合，改了就是编曲改动 |
| delay 返回增益 | **无（=1.0）** | **0.62** | v0.3 稳态 1/(1−0.23)=1.30，湿声比干声大 |
| delay 反馈 | 0.23 | **0.20** | 配合返回增益，尾巴 5–6 次衰减到 −40 dB |
| delay 反馈滤波 | 只有 LP 2600 | **HP 300 + LP 2200** | 反馈环没有 HPF → 每次重复都变暗，尾巴收敛成 200–420 Hz 的泥；Crack 期间它就成了唯一有音高的内容 |
| reverb IR | 1.7 s（实测 RT60 ≈ 1.5 s） | **1.0 s** | 1.5 s 在 140 BPM 下跨 2.6 小节，糊掉 16 分 arp |
| reverb 预延迟 | **0（IR 第 0 样本满幅）** | **26 ms** | 26 ms ≈ 1/4 拍的一半，让干声瞬态先出来；不打散 arp 的 16 分 |
| reverb 返回 | 0.13 | **0.075** | 配合发送增益，湿/干到 −13 ~ −17 dB |
| 发送：arp→verb | 1.0（直连） | **0.50** | v0.3 是"干声+两路湿声并联"，没有发送量概念 |
| 发送：lead→verb | 1.0（直连） | **0.60** | 同上 |
| 发送：arp→delay | 1.0（直连） | **0.35** | |
| 发送：lead→delay | 1.0（直连） | **0.25** | |
| 发送：glitch→delay | 0.5（走 fxBus） | **0.40** | glitch 是空间化的主角，保留 |

### 5.2 Crack（420 Hz 全局低通）与混响是否冲突

**不是频谱冲突，是"谁在被切"的冲突。**

信号路径事实（L333–341 + L365–367）：`master → comp → toneLP → destination`，而 delay 和 verb 的返回都汇入 `master`。所以 **Crack 会把干声和湿声一起切**，两者的频谱被同等处理 — 从频率响应看，没有冲突。

真正的问题在时序上：

1. **湿声比干声长得多**（IR 1.5 s vs 干声 145 ms），当 dry 被压到 420 Hz 以下后，420 Hz 以上只剩混响的尾巴在响 → 听感是"空间突然顶到前面"，不是"世界变暗"
2. **delay 反馈环只有 LPF 没有 HPF**（L348–352），衰减后稳在 200–420 Hz。Crack 期间这个频段里 dry 是 Bass（本来就满），wet 是 delay 的 200–420 积累 → 两路叠在同一个凹陷里
3. 若 v0.3 的湿声真是 +3 dB（实测确认），Crack 一开，湿声立刻成为 420 Hz 以上的唯一声源

返修后的判据（可写成验收项）：

- **Crack 开启期间，FX-only 母线在 200–420 Hz 必须 ≤ dry-only −6 dB**
- 实现手段：① delay 反馈环加 HP 300（已做）；② reverb 发送侧加 HP 300（建议加，与 delay 对称）；③ 若要更保险，Crack 的 gain 自动化同时给 delayRet / verbRet 打 −4 dB（时间常数跟 toneLP 的 0.05 s 下潜、0.45 s 回升走）
- **toneLP 的 Q 从 0.7 改成 −3.01**：当前 Q=0.7 是 +0.7 dB，Crack 落到 420 Hz 时会在 420 附近留一个小鼓包，听感上"闷但是有个嗡嗡的坎"

### 5.3 顶端的空间分配

三个空间别叠在同一个频段：

| 空间 | 频段 | 只给 |
|------|------|------|
| reverb | 700–3k | arp / lead（人耳定位区） |
| delay | 300–2.2k | arp / lead / glitch（节奏重复） |
| Crack | 全带 → 420 | 全局，0.05 s 下 / 0.45 s 上 |

hat 和 snare **不进 reverb**（现在也没进，保持）。它们的空间感靠 6–12k 的自然衰减，一进 reverb 就会在顶上糊成一片。

---

## 6 判定方法

### 6.1 不听就能证明「Arp / Lead / Bass 分工清晰」的三个指标

**指标 A：帧级归属率**（本文第 3.2 节）。对每个 42.7 ms 帧、每个频段，取七声部能量最大者，统计百分比。判定：

- 200–400 Hz：arp ≥ 55%，且 bass ≤ 35%
- 400–700 Hz：lead ≥ 85%，且 bass ≤ 10%
- 120–200 Hz：bass ≥ 45%，且 arp ≤ 30%
- 700–1.5k：lead ≥ 90%

为什么这个指标能替代耳朵：**它逐帧回答"此刻这个频段是谁在响"**，而不像总能量表那样把时间抹平。v0.3 的 200–400 Hz 是 bass 49% / arp 8%，等于 arp 在这个频段里 92% 的时间处于下风 — 这就是"单听都对、合起来 arp 不见了"的量化定义。

**指标 B：击打时刻第一**（第 3.2 节）。对 kick 的每个触发点取所在帧，判断 kick 是否在 30–60 / 60–120 最大。要求 100% / ≥ 90%。

为什么不能用帧级归属：bass 是连续声部、kick 是瞬态，按帧统计永远对 kick 不利。**归属率指标对瞬态声部无效，这是它的边界，必须写清楚。**

**指标 C：FX 湿声增量**。同一 stem 渲染两次（FX 开 / 关），比同一频段能量差。要求 dry − withFX 落在 **−0.5 ~ +1.5 dB**（即湿声比干声低 6–15 dB）。v0.3 是 −3.0 dB，直接判失败。

这三条能证明"分工清晰"，因为它们各自回答了不同的问题：A 管持续声部的频段所有权，B 管瞬态的优先权，C 管空间有没有盖过本体。

### 6.2 必须靠耳朵的（给出为什么不能测）

| 项目 | 为什么测不了 | 可测到什么程度 |
|------|-------------|---------------|
| 3–6 kHz 存在感（snare crack / lead 边缘） | −6 dB 和 −9 dB 都可能是"对"，取决于曲风意图；测不出"刺耳" | 能测出缺失量：v0.4 的 3–6k 比 400–700 低 **11.1 dB**，行业常见区间 −6 ~ −9 dB，所以**方向确定是"偏暗 2–5 dB"，具体补多少必须耳听** |
| 饱和/失真的质感 | 谐波失真在频谱上和原信号无法区分 | 只能给"不加"的建议 |
| 26 ms 预延迟是否够 | 取决于 arp 的 145 ms 包络与房间感的取舍 | 能给区间 18–35 ms，落点靠听 |
| Crack 的 0.45 s 回升是否自然 | 时间感知 | 能给区间 0.35–0.60 s |
| 60–120 Hz 相位（kick 47 Hz vs bass 55 Hz） | 相位关系依赖每个音的起始相位，同一代码不同 BPM 段结果不同 | 只能测电平差（0.6 dB），不能测相位对消 |
| 环路 321 ms 听成 groove 还是 smear | 心理声学 | 能给"5–6 次衰减到 −40 dB"的客观衰减曲线 |

**一条纪律**：以上任何一项都不允许用"多听几遍"当整改措施。要么给出数值区间让耳朵只做区间内的落点选择，要么承认这项没有验收标准。

### 6.3 建议的最小验收流程

1. `node SERIAL_mix_probe.mjs`，确认 `corr` 里三个相关值都 < 0.3（否则 stem 渲染没对齐）
2. 校验归属率表（6.1 的 A / B / C 三组阈值）
3. 校验母线 peak 阶梯（4.5 的表，±1 dB）
4. 校验 integrated LUFS 与 true peak（4.5 的 master 表）
5. 只有第 1–4 步全过，才进入 6.2 的耳听项 —— 否则耳朵在替工程错误背锅

---

## 7 补丁清单（按文件行序）

```js
// L331
const MASTER_LEVEL = 0.65;        // was 0.72

// L336-346 主压缩
comp.threshold.value = -16; comp.knee.value = 6; comp.ratio.value = 2.0;
comp.attack.value = 0.020; comp.release.value = 0.20;

// L343 拆母线（drumBus 从 1 个变 3 个）
kickBus  = ctx.createGain(); kickBus.gain.value  = 0.74;
snareBus = ctx.createGain(); snareBus.gain.value = 1.14;
hatBus   = ctx.createGain(); hatBus.gain.value   = 0.80;
// vKick(...) 内部 .connect(drumBus) → .connect(kickBus)，其余同理

// 新增：kick 低频抬升
kEQ = ctx.createBiquadFilter(); kEQ.type='peaking';
kEQ.frequency.value=52; kEQ.Q.value=0.9; kEQ.gain.value=3.0;   // peaking 的 Q 是线性值
kickBus.connect(kEQ).connect(master);

// L344 bass
bassBus.gain.value = 0.45;
bassHP = ctx.createBiquadFilter(); bassHP.type='highpass';
bassHP.frequency.value=45;  bassHP.Q.value=-3.01;              // dB！
bassLP = ctx.createBiquadFilter(); bassLP.type='lowpass';
bassLP.frequency.value=240; bassLP.Q.value=-3.01;              // dB！
duck = ctx.createGain();                                        // kick key 自动化
bassBus.connect(duck).connect(bassHP).connect(bassLP).connect(master);

// duck 自动化（每个 kick 触发点）
duck.gain.setValueAtTime(1, t);
duck.gain.linearRampToValueAtTime(0.667, t + 0.005);            // −3.5 dB
duck.gain.setTargetAtTime(1, t + 0.005, 0.035);                 // release τ≈35ms

// L345-346
arpBus.gain.value  = 1.37;
leadBus.gain.value = 0.76;
lh1 = ctx.createBiquadFilter(); lh1.type='highpass'; lh1.frequency.value=380; lh1.Q.value=-5.33;
lh2 = ctx.createBiquadFilter(); lh2.type='highpass'; lh2.frequency.value=380; lh2.Q.value=2.32;
leadBus.connect(lh1).connect(lh2).connect(master);

// L348-352 delay
delay.delayTime.value = (60/BPM)*(3/4);        // 不变
fb.gain.value = 0.20;                          // was 0.23
delayHP.type='highpass'; delayHP.frequency.value=300;  delayHP.Q.value=-3.01;   // 新增
delayLP.type='lowpass';  delayLP.frequency.value=2200; delayLP.Q.value=-3.01;   // was 2600
delay.connect(delayHP).connect(delayLP).connect(fb).connect(delayIn);
delayRet = ctx.createGain(); delayRet.gain.value=0.62;                          // 新增
delay.connect(delayRet).connect(master);

// L354-363 reverb
verb.buffer = mkIR(1.0);                       // was 1.7
pre = ctx.createDelay(0.2); pre.delayTime.value = 0.026;                        // 新增
vg.gain.value = 0.075;                         // was 0.13
verbIn.connect(pre).connect(verb).connect(vg).connect(master);

// L365-367 发送（替代直连）
arpBus.connect(send(0.50)).connect(verbIn);
leadBus.connect(send(0.60)).connect(verbIn);
arpBus.connect(send(0.35)).connect(delayIn);
leadBus.connect(send(0.25)).connect(delayIn);
fxBus.gain.value = 1.42;  fxBus.connect(master);
fxBus.connect(send(0.40)).connect(delayIn);

// L770-795 Crack：Q 从 0.7 改成 -3.01 dB，其余不动
```

---

## 8 未通过项与 stage-2

| 项 | 现状 | 目标 | 动作 |
|----|------|------|------|
| 击打时刻 60–120 Hz 第一 | 75% | ≥ 90% | duck −3.5 → −4.5 dB，τ 35 → 28 ms |
| 6–12k 归属 | hat 40%（glitch 25 / lead 19 / snare 16） | hat ≥ 55% | 二选一：hatBus 0.80 → 0.95；或 glitch 在 6–12k 加 LP 9k |
| 3–6k 存在感 | 比 400–700 低 11.1 dB | −6 ~ −9 dB | snare 3.5k +2 dB（Q 1.0）+ lead 3k +2 dB（Q 0.7），**补多少靠耳听**，测只能告诉你差了 2–5 dB |
| mix 倾斜 | 60–120 → 3–6k 差 18.3 dB（v0.3 是 23.5） | ≤ 16 dB | 由上一条带来 |

后三条互相牵制：抬 3–6k 会同时抬 6–12k 里 lead 的占比，从而进一步压低 hat 的归属率。**建议顺序：先做 3–6k（听感最明显），再补 hat，最后微调 duck。**

---

## 9 一句话交付口径

音色设计逐条拆开听是对的；把它们并进同一条 master 时，七声部 LUFS 跨度 26 dB、drumBus 三件共用一路增益、FX 湿声与干声等响、Arp 在 200–400 Hz 只有 8% 的时间占优 — 这四条是"合起来不对"的全部原因，且全部可由频段能量表和帧级归属率复现。返修后归属率 8% → 60%，FX +3.0 dB → +0.1 dB，kick 击打时刻 30–60 Hz 100% 第一。
