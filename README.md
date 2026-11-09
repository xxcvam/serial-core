# SERIAL — Sonic Identity Audition

SERIAL 是 ECLIPTICA STUDIO / 月枢製品 的原创确定性生成式视听乐器。本仓库只保存**声音身份与生成内核的候选实现与规划**，不含硬件固件、不含 Rodin 资产、不含产品册原文。

进度截点：2026-11-09，v0.4 Audition。

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

## 当前验收状态

用户已认可：INTRO、GROOVE、BASS 音色、新鼓整体。
仍不满意：RISE 段内动作、CLIMAX 相对 GROOVE 的提升、BREAK 长度与内容、LEAD 结构、GLITCH 定义、ARP 亮度曲线。

已冻结：INTRO+GROOVE 的和声为 Am7；鼓骨架（euclid kick/hat、SNARE_STEPS）不变。
不可冻结：GROOVE 的 arp 音级——v0.3 是每步随机取音，改为位置寻址后必然变化。

## 运行

`audition/*.html` 直接在 Chromium 打开（`file://` 可用，代码是单文件内联，不引 module）。

## 验证

```bash
node tools/verify_v04.js     # 15 项断言：寻址、端序、互质、亮度递增、让位、glitch 落点
node tools/smoke_v04.js      # 伪 AudioContext 驱动 30s，验证建图/调度/CRACK/STOP 不抛
node tools/probe_hat.js      # hat 三种设计离线测峰值/RMS/频段占比
node tools/gen_v04.mjs       # 编配规则探针（33/33）
```

`tools/verify_v04.js` 与 `tools/smoke_v04.js` 里各有一段桩代码（伪 document / 伪 AudioContext），只用于在没有浏览器的环境跑断言。

## RNG 契约要点（contract/）

- 键是 48 字节定长二进制，不是拼串：`magic | seed u64LE | genVer u16 | domain u8 | trackId u16 | sectionId u16 | localBar u32 | tick u64 | purpose u8 | attempt u32 | reserved`。
- `SHA-256(key)` 取标准大端 digest：`initstate = digest[0..7]` 大端读 u64，`initseq = digest[8..15]` 大端读后 `| 1`。
- PCG32 XSH-RR；采样用 Lemire 乘法归约 + 拒绝，`attempt` 只用于拒绝重抽，**retry 永不进键**。
- 浮点：`(u >>> 8) * (1/16777216)`。
- 哈希拆 `window_hash / loop_hash / form_hash` 三个字段，S1 与 S2 禁止跨协议比较。

## 已知缺口

- 未做 Web Audio 实际渲染测量；hat 与各声部的频段占比来自 `tools/probe_hat.js` 的加法合成模型与专家脚本，未在浏览器内复测。
- 听感结论全部待用户判定：这个仓库里没有任何音频文件。
- 契约仍是 DRAFT，7 项待冻结（见 contract 文末）。
