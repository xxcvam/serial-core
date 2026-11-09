# SERIAL Addressable RNG Contract v0.1

状态：`DRAFT` · 2026-11-09 · 未冻结，不得作为已实现能力对外引用
范围：S2 / Addressable Core 的位置寻址随机数与时间坐标契约
不在范围：S1-POC1 既有顺序协议（原样保留）、音频合成、具体生成算法（Euclidean / Markov / L-System 等）

---

## 0. 一句话

同一个 `(Serial, GeneratorVersion, 位置, 用途)` 在任何平台、任何时刻、任何生成顺序下，必须取到同一个 32-bit 整数。

---

## 1. 为什么不能只按 Step 派生

只按 Step 取一次种子、再顺序抽取多个参数，会产生隐性耦合：

```
u = R32(..., step)          // 一次
gate   = u % 100 < 60       // 抽第 1 个
pitch  = (u >> 8) % 12      // 抽第 2 个
```

此后新增“力度随机”，若从同一序列继续抽第 3 个，前两个不变；但只要新参数插到中间，或某参数改为拒绝采样，后续参数全部漂移 —— 老工程重新打开就变调。

结论：**每个位置上的每个用途各自独立寻址**，`Purpose` 必须进键。

---

## 2. 时间模型

| 单位 | 正式含义 | 用途 |
|---|---|---|
| Tick | 最小整数音乐时间坐标，唯一真值 | 音符起点、时值、微时序 |
| Step | 由 Grid 定义的编辑/量化位置，**不是固定时间单位** | 16-step 界面、Euclidean、多轨不同长度 |
| Bar | 由拍号定义的小节 | 缓存、量化切换、段落定位 |
| Section | 一组 Bar 及其规则 | A / B / Break / Outro |
| Form | Section 与转移关系 | 完整曲式 |

约定：

- 所有音乐位置以整数 Tick 存储，不使用浮点秒。
- `ticksPerBar = PPQ × beatsPerBar`。4/4 且 PPQ=96 时，1 Bar = 384 ticks。
- Grid 独立：7-step 轨道有自己的 `gridLength`，不强制 16 等分。16 等分 Step = `ticksPerBar / 16`。
- **PPQ 数值待冻结**（见 §11-1）。冻结前不得生成测试向量。

> 与现有协议的冲突：`SERIAL-LINK/0.1` 快照样例里出现 `"tick": 960`，但从未定义该字段是“每拍 tick 数”还是“当前位置”。这是同一字段的两种含义，必须在协议层定死其一（建议：`tick` = 绝对位置，另设 `ppq` 字段）。

---

## 3. 寻址键

### 3.1 逻辑形式

```
R32(Serial, GeneratorVersion, Domain, TrackID, SectionID, LocalBar, Tick, Purpose, Attempt) -> u32
```

### 3.2 编码（48 字节定长，小端）

不使用分隔符拼字符串。原因：分隔符拼串在字段含分隔符、或数值宽度变化时产生歧义，跨语言实现会分叉。改为定长二进制布局：

| 偏移 | 长度 | 字段 | 编码 |
|---|---|---|---|
| 0 | 12 | magic | 12 字节定长：ASCII `SERIALM/0.2`（11 字节）+ `0x00` 填充 |
| 12 | 8 | seed | u64 LE；16 位 hex 按大端解析为数值后写入 |
| 20 | 2 | generatorVersion | u16 LE |
| 22 | 1 | domain | u8，见 §3.3 |
| 23 | 2 | trackId | u16 LE |
| 25 | 2 | sectionId | u16 LE |
| 27 | 4 | localBar | u32 LE，段内 0 起 |
| 31 | 8 | tick | u64 LE，`localBar` 内偏移，0 起，必须 `< ticksPerBar` |
| 39 | 1 | purpose | u8，见 §3.4 |
| 40 | 4 | attempt | u32 LE，0 起 |
| 44 | 4 | reserved | u32 LE，当前恒 0 |

总长 48 字节。字节序统一 little-endian。magic 变更即视为协议大版本变更。

### 3.3 Domain

域分离必须粗粒度，且与 `trackId` / `sectionId` 正交 —— 否则新增一个域会改动既有键。

| code | domain | 说明 |
|---|---|---|
| 1 | `music` | 音乐事件生成 |
| 2 | `visual` | visual_seed / visual_manifest 派生 |
| 3 | `card` | 卡面图形派生 |

`music` 与 `visual` 使用**不同 code**，因此视觉侧改粒子数、改材质不会消耗音乐侧任何一次取数。这是「改视觉不改 structure_hash」的结构保证，不依赖代码纪律。

### 3.4 Purpose

同一位置不同参数必须不同 purpose。初版枚举（**待冻结，见 §11-2**）：

| code | purpose | 说明 |
|---|---|---|
| 1 | `gate` | 是否触发 |
| 2 | `pitch` | 音高 |
| 3 | `velocity` | 力度 |
| 4 | `duration` | 时值 |
| 5 | `probability` | 概率阈值 |
| 6 | `timbre` | 音色选择 |
| 7 | `eventId` | 事件稳定身份（见 §7） |
| 8 | `mutation` | 变异 |
| 16+ | 预留 | 新增用途只占新 code，不复用旧 code |

规则：**purpose code 一经发布不复用**。删除某用途时保留其 code 空号，改用途必须升 `generatorVersion`。

### 3.5 Attempt 与 retry 分离

- `attempt`：同一 `(位置, purpose)` 上第 n 次取数的序号，0 起，**确定性递增**。用于拒绝采样（§5.3）与同一用途需要多个值时（如 `mutation` 取 3 个值 = attempt 0,1,2）。
- `retry`：网络/IO/超时等错误重试。**retry 绝不进入键**，也不递增 `attempt`。重试必须得到逐位相同的结果，这是可复现性的定义本身。

把两者混为一谈，则一次偶发失败会让同一工程重新打开后音高改变。

---

## 4. 从键到随机数

```
key    = encode48(...)                // §3.2
digest = SHA-256(key)                 // 32 字节
initstate = u64_BE(digest[0..7])
initseq   = u64_BE(digest[8..15])     // 调用处不预置 |1
pcg32_srandom_r(state, initstate, initseq)  // 内部 state = seq<<1|1
u = pcg32_next_r(state)               // 一次 32-bit 输出
```

要点：

1. **取 16 字节，不是 8**。只取 8 字节作 `initstate` 会让状态空间退化为 2^64；在 2^64 量级的键集合上，不同 `(bar, tick)` 撞 `initstate` 的概率不可忽略，且 `initseq` 也需要独立熵。前后各取 8 字节是零成本的修正。
2. `initseq` 由 `pcg32_srandom_r` 内部做 `seq<<1|1`；**调用处不得预置 `|1`**。预置会把 `initseq` 的最低位信息压进 `<<1` 后丢弃，损失流标识；且与 §14.2 的参考实现产生一次隐式偏差。
3. 一次调用只取一个 32-bit。需要多个值用 `attempt` 递增，不用连续 `pcg32_next`。原因：连续取数会把“同位置多用途”重新耦合成顺序依赖，回到 §1 的问题。
4. 算法固定为 PCG32 XSH-RR（64/32），常量 `6364136223846793005`、`1442695040888963407`。不得替换为 PCG32-8/16 或 PCG64。
5. 不使用 `Math.random`、`rand()`、`std::mt19937` 或任何平台 RNG。

---

## 5. 采样

### 5.1 无偏整数区间 `[0, n)`

```
u      = R32(...)                            // attempt = a
m      = u * n                               // 64-bit 乘法
low    = m & 0xFFFFFFFF
if (low < n):
    threshold = (2^32 - n) % n               // n 需在初始化时预计算
    while (low < threshold):
        a += 1
        u = R32(..., attempt = a)
        m = u * n
        low = m & 0xFFFFFFFF
return (m >> 32)
```

（Lemire 乘法归约 + 拒绝。拒绝是确定性的：同一键必然得到同一拒绝次数，因此跨平台一致。）

### 5.2 浮点

```
f = (R32(...) >>> 8) * (1.0 / 16777216.0)    // [0,1)，24-bit
```

禁止用 `u / 4294967295`（会取到 1.0，破坏半开区间与直方图端点）。

### 5.3 拒绝采样与 attempt 上限

任何拒绝循环必须有 `attemptMax`（建议 8）。超限即视为实现错误，抛错而不是换个种子继续 —— 否则同键不同结果。

---

## 6. 生成器两类

不能向产品承诺任何算法都可 O(1) 跳转。

| 类别 | 定义 | 例 | 跳转方式 |
|---|---|---|---|
| Random-Access Generator | 状态只依赖位置与键 | 独立概率事件、Euclidean、查表 | 直接定位 |
| Checkpointed Stateful Generator | 未来状态依赖历史 | Markov Chain、Cellular Automata、反馈系统 | 从最近检查点重放 |

Checkpoint 规则：

- 检查点间隔 `checkpointBars`（建议 4），落在 `localBar % checkpointBars == 0` 且该 Bar 起点。
- 跳转到第 N 小节：取 `floor(N / checkpointBars) × checkpointBars` 的快照，向前重放到 N。
- 检查点内容必须包含该生成器全部状态，且可序列化（不含函数、闭包）。
- 检查点哈希进工程文件，读入时校验；不匹配即拒绝加载，不做静默修补。

产品侧口径：**“任意位置秒跳”只对第一类成立**。第二类的最坏跳转成本 = 一个检查点间隔的重放。

---

## 7. Form 数据模型

```
Form        = Section[]  (n <= 16)   + 播放序列
Section     = { sectionId, bars (<= 8), rules, gridConfig }
PlayOrder   = [{ sectionId, visitIndex }]
```

- `visitIndex`：同段重复出现时的第几次访问，0 起。完整曲式可重复，128 Bar 不是乐器的最大演奏长度。
- 键里只出现 `sectionId` + `localBar` + `tick`（**全部段内局部坐标**）。因此把 A 段从第 9 小节移到第 17 小节，A 段生成的音乐动机逐位不变 —— 只有它在全局时间线上的位置变了。
- 需要绝对位置时，用 `absoluteTick = Σ(前序 Section 长度) + localBar × ticksPerBar + tick` 现算，不入键。
- 依赖 `visitIndex` 的算法（如“第二遍 A 加花”）必须把 `visitIndex` 显式进入该生成器自己的键扩展位，并升 `generatorVersion`；不得默认进键。

---

## 8. Variant：三层，事件覆写优先

| 层 | 保存内容 | 优先关系 |
|---|---|---|
| Base Generation | 原始 Seed 对应的生成结果（不存全量事件，只存使其可复现所需：seed / generatorVersion / form / 参数） | 基础 |
| Parameter Patch | Scale、Density、Mutation、Filter 等参数变化 | 覆盖生成参数 |
| Event Override | 手动改音高、力度、静音、插入、删除 | 最终优先 |

### 8.1 事件身份

```
eventId = R32(..., purpose = eventId, attempt = 0)   // u32，位置派生，稳定
identity = (trackId, sectionId, localTick, eventId)
```

用户手动改过的音符以 `identity` 索引，**不以数组下标索引**。否则插入新轨、改曲式、加花之后，覆写会指向另一个音符 —— 这是不可接受的静默数据损坏。

### 8.2 演奏录制

完整重放一场演奏，必须记录带 Tick 时间戳的**参数自动化与操作事件流**，不是结束时的参数快照。快照只能还原终态，不能还原演奏。

```
AutomationEvent = { tick, targetId, value, seq }
ControlEvent    = { tick, controlId, action, value, seq }
```

`seq` 用于同 Tick 多事件的定序，跨端必须一致。

---

## 9. structure_hash 的作用域

三者共用同一套序列化规则，但**不是同一个数值**，字段名必须分开：

| 字段 | 覆盖内容 |
|---|---|
| `window_hash` | 当前 16-step 窗口（或等价 1 Bar）的事件摘要 |
| `loop_hash` | 指定 Loop（若干 Section 的播放序列）的事件摘要 |
| `form_hash` | 完整 Form 规范化内容摘要（含 Section、PlayOrder、Variant 层，不含绝对播放位置） |

规则：

1. 取消笼统的 `structure_hash` 作为协议字段名；S1-POC1 的 `structure_hash` 保留原含义，仅在 S1 语境使用。
2. **跨协议不比较**。S1-POC1 与 S2 的哈希即使字节长度相同也不同义，禁止用于“新旧一致性”断言。
3. `form_hash` 不含绝对播放位置与 `visitIndex` 导致的重复次数，否则移动段落会改哈希。

---

## 10. 实时约束

- `crypto.subtle.digest()` 是异步 Promise，**不能**在音频回调里当同步随机函数用。
- AudioWorklet 内不得执行 SHA-256，也不得做 PCG 初始化。事件在非实时线程（主线程或 Worker）按 Bar 预计算，通过消息队列交给 worklet。
- 预取策略：lookahead ≥ 1 Bar，double-buffer 交换；切换在小节边界完成，不在回调中途替换。
- 目标：回调路径上只做整数运算与查表。若性能测试证明需要更轻的哈希，替换必须升 `generatorVersion` 并重出全部向量。

---

## 11. 待冻结项（冻结前不得发布向量）

1. **PPQ 数值**：暂定 96（1 Bar = 384 ticks）。冻结前不得生成 golden vectors。
2. **Purpose 枚举全集**：§3.4 为初版，新增用途在向量生成前可任意追加；生成后只能追加新 code。
3. **`SERIAL-LINK` 的 `tick` 字段语义**：绝对位置 vs 每拍 tick 数，必须二选一并改协议。
4. **`checkpointBars` 取值**：建议 4，需性能测试确认。
5. **`visual` domain 的键扩展**：视觉侧是否需要 `motifVersion` 等额外字段入键（当前 48 字节布局预留了 4 字节 reserved，不足以扩展时升 magic）。
6. **`visitIndex` 是否进键**：当前只允许生成器自行扩展并升版本。
7. **`eventId` 的生日悖论面**：u32 在单曲目 10^4 量级事件下碰撞概率可接受（约 1%），但若未来单工程事件数上 10^5，需改 64-bit。当前判定：可接受，记录在案。

---

## 12. 测试

### 12.1 四类核心测试

| 类 | 断言 |
|---|---|
| Random Seek | 直接生成第 17 小节，与从头连续生成至第 17 小节逐位相同 |
| Isolation | 在某位置新增 `timbre` 取数，不改变该位置其他 purpose，也不改变其他任何位置 |
| Cross-platform | TypeScript 与 C++ 对同一键输出逐位相同的 u32 |
| Variant Replay | 覆写一个音符后重载 Variant，该音符保持覆写值，其余事件不漂移 |

### 12.2 兼容测试

S1-POC1 三组 Golden Vectors 原样保留，作为**独立**兼容套件，不被新版本覆盖，也不参与新协议断言。

### 12.3 向量格式

```json
{"protocol":"SERIALM/0.2","generatorVersion":1,"domain":"music","seed":"A7F209C13B8ED614","trackId":0,"sectionId":0,"localBar":17,"tick":96,"purpose":"pitch","attempt":0,"expect":3735928559}
```

每条向量必须由两份独立实现产出后才可入库；单实现产出的向量不叫向量，叫快照。

---

## 13. S1 兼容

| 协议 | 定位 |
|---|---|
| S1-POC1 | 已存在的顺序式 PCG32 实验协议，原样保留、原样可用 |
| S2 / Addressable Core | 位置寻址、统一时间线、Form、Variant 的新架构 |
| S1 Adapter | 把 S1 的 16-step 事件转换为统一时间线视图，**不重新生成历史内容** |

- S1 的 16-step 结果可表示为统一时间线的第一个 16-step 窗口，但**更换寻址方式后不得再称其为 S1**，即使对象格式相同。
- S1 Adapter 是只读视图转换：不改事件、不补生成、不重算哈希。
- 两套协议可在同一工程内共存，字段必须带协议前缀（`s1.` / `s2.`），禁止同名混用。

---

## 14. 参考实现

### 14.1 编码 + 派生（TypeScript）

```ts
const MAGIC = new TextEncoder().encode('SERIALM/0.2'); // 12 bytes

function encodeKey(k: {
  seed: bigint; generatorVersion: number; domain: number;
  trackId: number; sectionId: number; localBar: number;
  tick: bigint; purpose: number; attempt: number;
}): Uint8Array {
  const b = new Uint8Array(48);
  b.set(MAGIC, 0);
  const dv = new DataView(b.buffer);
  dv.setBigUint64(12, k.seed, true);
  dv.setUint16(20, k.generatorVersion, true);
  dv.setUint8(22, k.domain);
  dv.setUint16(23, k.trackId, true);
  dv.setUint16(25, k.sectionId, true);
  dv.setUint32(27, k.localBar, true);
  dv.setBigUint64(31, k.tick, true);
  dv.setUint8(39, k.purpose);
  dv.setUint32(40, k.attempt, true);
  dv.setUint32(44, 0, true);
  return b;
}

async function r32(k: Parameters<typeof encodeKey>[0]): Promise<number> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', encodeKey(k)));
  const dv = new DataView(d.buffer);
  const initstate = dv.getBigUint64(0, false);
  const initseq = dv.getBigUint64(8, false);   // 不预置 |1，由 pcg32Srandom 内部处理
  const s = pcg32Srandom(initstate, initseq);
  return pcg32Next(s);
}
```

### 14.2 PCG32（与官方参考实现一致）

```ts
const MUL = 6364136223846793005n;
const INC = 1442695040888963407n;
const MASK64 = (1n << 64n) - 1n;

function pcg32Srandom(initstate: bigint, initseq: bigint) {
  const s = { state: 0n, inc: ((initseq << 1n) | 1n) & MASK64 };
  pcg32Next(s);                       // 官方初始化：先推进一次
  s.state = (s.state + initstate) & MASK64;
  pcg32Next(s);
  return s;
}

function pcg32Next(s: { state: bigint; inc: bigint }): number {
  const old = s.state;
  s.state = (old * MUL + s.inc) & MASK64;
  const xorshifted = Number(((old >> 18n) ^ old) >> 27n) >>> 0;
  const rot = Number(old >> 59n) & 31;
  return ((xorshifted >>> rot) | (xorshifted << ((-rot) & 31))) >>> 0;
}
```

### 14.3 C++ 侧

用同一套 §14.2 逻辑，`uint64_t` 状态，SHA-256 用任意经过向量验证的实现。注意：`pcg32_srandom_r` 的官方签名是 `(initstate, initseq)`，不是 `(seed, stream)`；两者差一次状态推进，跨语言分叉最常见的来源就在这里。

---

## 15. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| 0.1 | 2026-11-09 | 首版草案：定寻址键为 48 字节定长编码；SHA-256 取 16 字节分别作 initstate / initseq（seq 置奇数）；Purpose 进键、Attempt 与 retry 分离；Domain 粗粒度三分；Time 模型 Tick 为唯一真值；生成器分两类；Form 用段内局部坐标入键；Variant 三层 + 事件稳定身份；structure_hash 拆 window/loop/form 三作用域；明确 S1 与 S2 不得跨协议比较 |
| 0.2 | 2026-11-09 | 更正 §4 与 §14.1：`digest[0..7]` / `digest[8..15]` 一律按**大端**读 u64（与标准 SHA-256 输出字节序一致，跨语言才对得上）；调用处不再预置 `|1`，`seq<<1|1` 只在 `pcg32_srandom_r` 内部做。48 字节键本体仍为小端。已发布向量不重出，v0.3 Golden Vectors 保持有效 |
