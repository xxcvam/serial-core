# SERIAL — Sonic Identity Audition

SERIAL 是 ECLIPTICA STUDIO / 月枢製品 的原创确定性生成式视听乐器。本仓库只保存**声音身份与生成内核的候选实现与规划**，不含硬件固件、不含 Rodin 资产、不含产品册原文。

进度截点：2026-11-10，v0.4.1 Stability & Reproducibility Pass。

## 目录

```
audition/   可试听的单文件 Web Audio 程序（双击即开，无依赖、无构建）
contract/   Addressable RNG 契约（时间寻址随机数，DRAFT 未冻结）
docs/       规划与返修规格（Web / 3D / 材质 / 编配 / 混音 / 实现方案）
tools/      验证脚本与黄金向量
```

## audition/ 版本关系

| 文件 | 状态 | 说明 |
|---|---|---|
| `SERIAL_Sonic_Identity_Prototype_v0.1.html` | 归档 | 首版；Snare/Hat 不触发、Sub 无包络、全声部共享 trackId、SHA-256 字节序错 |
| `SERIAL_Sonic_Identity_v0.2.html` | 归档 | 修上述缺陷；Arp 改八步动机锁单八度；CRACK 改按住式 |
| `SERIAL_Sonic_Identity_Audition_v0.3.html` | 归档 | 合并外部 Audition 的鼓与和声；14→10 项自测通过 |
| `SERIAL_Sonic_Identity_Audition_v0.4.html` | **当前** | 鼓组全部重做（909 式 hat）+ 编配返修（和声走动、互质旋转、LEAD_CELLS/PHRASE/算子）+ 混音链路 |

`v0.4` 里 `SYNTH` 三档（v0.4 新鼓 / v0.3 旧鼓 / 中性替换）与 `SCHEME A/B` 是给对照实验用的，不是产品分支。

### v0.4.1 修了什么（在 v0.4 文件内）

| 项 | 之前 | 现在 |
|---|---|---|
| Glitch 位置偏置 | `planGlitch` 取到 cap 个就 break，故障事件全堆在小节前部 | 收集全部 1/32 候选 → RNG 洗牌 → 按 minGap=24 tick 抽 cap=3 |
| Glitch 时间保真 | 播放时 `Math.round(tick/24)` 映射到 1/16 步，1/32 落点被吃掉或偏移 | 按真实 `tick` 精确排入 `t + (tick/PPQ)*beat` |
| Glitch 进实时路径 | `playStep()` 每步重算 planGlitch（SHA-256 在调度线程） | `build()` 期一次预计算 `GL[secId][bar]`，播放只查表 |
| Glitch / CRACK 总线 | 两者共用 `glitchGate` | 拆成 `glitchGate`（故障效果）与 `crackGate`（CRACK 门控），链路 `drumBus→drumComp→glitchGate→crackGate→comp` |
| STOP 竞态 | 110ms 延时回调无条件 `panic()`，快速重播会杀掉新的一次运行 | `runId` 令牌，旧回调发现 runId 变化即退出 |
| 音色版本 | vBass 无版本标识 | 注释标注 `SERIAL-BASS/SINE-55`（v0.3 起沿用，非早期 Saw+Sub） |

## 当前验收状态

用户已认可：INTRO、GROOVE、BASS 音色、新鼓整体。
仍不满意：RISE 段内动作、CLIMAX 相对 GROOVE 的提升、BREAK 长度与内容、LEAD 结构、GLITCH 定义、ARP 亮度曲线。

已冻结：INTRO+GROOVE 的和声为 Am7；鼓骨架（euclid kick/hat、SNARE_STEPS）不变。
不可冻结：GROOVE 的 arp 音级——v0.3 是每步随机取音，改为位置寻址后必然变化。

## 运行

`audition/*.html` 直接在 Chromium 打开（`file://` 可用，代码是单文件内联，不引 module）。

## 验证

克隆后直接跑，不需要改路径（脚本按自身位置解析 `../audition/`）：

```bash
node tools/verify_v04.js       # 18 项断言：寻址、端序、互质、亮度递增、让位、glitch 栅格与位置分布
node tools/smoke_v04.js        # 伪 AudioContext 驱动 30s：建图/调度/CRACK/STOP/快速重启不抛
node tools/rng_crosscheck.js   # 独立 SHA-256(node:crypto)+PCG32+键编码，与页面 R32 对拍 4480 坐标
node tools/probe_hat.js        # hat 三种设计离线测峰值/RMS/频段占比
node tools/gen_v04.mjs         # 编配规则探针（33/33）
```

三个检查脚本的退出码：0 = 全过，1 = 有失败，2 = 找不到文件。

`tools/rng_crosscheck.js` 的 SHA-256 走 `node:crypto`、PCG32 与键编码按 contract 文本另写，页面里那套实现是另一份代码——**它才是"自己验自己"之外的那一条对照**。Golden Vector 打在同一脚本的输出里。

## RNG 契约要点（contract/）

- 键是 48 字节定长二进制，不是拼串：`magic | seed u64LE | genVer u16 | domain u8 | trackId u16 | sectionId u16 | localBar u32 | tick u64 | purpose u8 | attempt u32 | reserved`。
- `SHA-256(key)` 取标准大端 digest：`initstate = digest[0..7]` 大端读 u64，`initseq = digest[8..15]` 大端读后 `| 1`。
- PCG32 XSH-RR；采样用 Lemire 乘法归约 + 拒绝，`attempt` 只用于拒绝重抽，**retry 永不进键**。
- 浮点：`(u >>> 8) * (1/16777216)`。
- 哈希拆 `window_hash / loop_hash / form_hash` 三个字段，S1 与 S2 禁止跨协议比较。

## 已知缺口

- 未做 Web Audio 实际渲染测量（没有 headless Chrome 的 PCM 抓取）；hat 与各声部的频段占比来自 `tools/probe_hat.js` 的加法合成模型与专家脚本，未在浏览器内复测。`tools/verify_v04.js`、`tools/smoke_v04.js`、`tools/rng_crosscheck.js` 只证明代码路径与数值一致，**不证明听感**。
- 听感结论全部待用户判定：这个仓库里没有任何音频文件。
- 契约仍是 DRAFT，7 项待冻结（见 contract 文末）。
- C++ / JavaScript 双向对照只做了 JavaScript 侧（`rng_crosscheck.js`）；C++ 侧实现尚未出生。


## v0.4.2（分支 feat/lead-rise-v0.4.2，未合 main）

LEAD 与 RISE 的结构性重修，按两位专家文档 + 用户四项更正落地。

### 编配层
- LEAD 落格改在**奇数 1/16 格**（`ODD_GRID`），与 arp 的八分偶数格物理互补，不再抢同一批格子。
- `LEAD_CELLS` 扩为 HOLD/HEAD/HOOK/ROLL/LINK/PUSH，每个 cell 带 `len[]`/`acc[]` 数组；`PHRASE` 换成 M4/M6/M8/E4/E6/N4/N6/D4。
- 每小节 cutoff 走 `sec.lcut[bar]` 曲线（GROOVE 1600→2000、RISE 1900→3000、CLIMAX 3200→3700、BREAK 1000→1150、RETURN 2800→1900），不再由段级常量 clamp 抹平。
- 音高 = `PHRASE × 算子(T±n/R/I/O/RO) + loct`，末音 +15% 时长，重音 0.26+acc。

### 合成层（vLead 重写）
- 三支振荡器改成 **saw + square + triangle 三种不同频谱、无相位偏移**。原 0/120/240° 方案实测起音 20ms 基频 −16.5 dB（`tools/lead_phase_probe.mjs`），波峰更低但那是相消不是余量，已弃用。
- 低通加入 keytrack `(f/440)^0.35` 与滤波包络（起音 ×2.2 → τ55ms 衰减到 cutBase）；`Q.value=0`（WebAudio lowpass 的 Q 单位是 dB）。
- 包络 release 自适应 `clamp(dur*0.25, 18ms, 75ms)`，不再硬切。
- sub 改同度正弦（0.18），去掉 f/2（原来侵占 220–392Hz 与 arp 抢空间）。
- LEAD 独立发送：`leadRevSend 0.50`、`leadDlySend 0.22`，不再与 arp/glitch 共用 fxSend。

### RISE
- R1 噪声带通 Q2.5 400→9000Hz（段内一次）；R2 saw 110→440Hz + sine 55→110Hz（低电平 0.055/0.035，避免与 arp 220–784Hz 正面重叠）；R3 末小节末步 15ms 让位；R4 reverb 0.50→0.85、delay 0.22→0.10。

### 真实 PCM 渲染（新增验收工装）
`tools/pcm_render.mjs` 用本机 Chrome 的 CDP 驱动页面里新增的 `window.__renderPCM()`，在 `OfflineAudioContext` 里渲染整段混音并测量 peak/RMS/削波。零 npm 依赖。

实测（Seed 1234567890123，Scheme A，44.1kHz，12s）：

| 场景 | peak | RMS | 削波 |
|---|---|---|---|
| GROOVE | −5.61 dBFS | −18.95 dB | 0 |
| CLIMAX | −2.68 dBFS | −17.77 dB | 0 |
| BREAK（6s 窗口） | −5.11 dBFS | −25.37 dB | 0 |
| Seed 20260101 / 777 / 4242424242 | −5.3 ~ −6.3 dBFS | −18.1 ~ −19.3 dB | 0 |

单声部 peak（CLIMAX 段 12s）：kick 0.295 / snare 0.200 / hat 0.079 / bass 0.212 / arp 0.105 / lead 0.120 / glitch 0.375。

### 已知代价
- LEAD 移到奇数格后，arp 不再需要让位，GROOVE 的 arp 事件数由 58 变 64（+6）。这是解耦的直接结果，不是 bug；若要保住原来的 58 需人为挖掉 6 个落点，待用户裁定。
- 仍无听感结论。以上全部是数据与 PCM 电平，**没有一个字来自耳朵**。
