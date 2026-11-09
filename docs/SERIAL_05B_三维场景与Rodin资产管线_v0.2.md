# 05B｜三维场景结构与 Rodin 资产管线（规划稿 v0.2）

> 定位：本章服务于 §05 Web 3D 的三种产品体验（Explore & Preview / Connect & Perform / Hardware-led A/V），补齐 05A 未覆盖的四块：**场景结构（相机/灯光/后处理）**、**Rodin 逐资产任务表**、**异步生成任务链的工程接法**、**Circuit Language 视觉层（v1.2 新增）**。
> 上游依赖：`SERIAL_书.md` §02.1 / §05 / §05.4 / §06 / §08 / §09 / §10（产品册 v1.2）；`SERIAL_05A_材质渲染资产流水线_v0.1.md`（材质、LOD、压缩、验收）；`SERIAL_Web_实现规划_v0.1.md`（技术栈、Link 契约、tier 分档）。
> **范围纪律：本章资产与场景代码全部不进入 G1。** §08 明令 G1 不含 Three.js 复杂场景与 Rodin 模型，v1.2 §08 进一步明令 **G1 不增加 PCB Art 设计/制板工作**。本章最早在 G2 启动，G3 收口。

---

## 0. 变更对照表（v0.1 → v0.2）

| # | 位置 | v0.1 | v0.2 | 依据 |
|---|---|---|---|---|
| C1 | 全文 | 无 Circuit Language | 新增 §2.5「Circuit Language 层」：分层、材质、后处理、与 8 个 Rodin 资产的共存矩阵 | 产品册 v1.2 §5.4 |
| C2 | 全文 | 无 visual_manifest | 新增 §5.5「visual_manifest 草案 schema」+ §2.5.3「入参→几何/光路」编译链 | 产品册 v1.2 §5.4 统一生成原则 |
| C3 | §1 阶段落位 | G2 无 Generative World，无粒子 | **拆 CL-0 / CL-1**：CL-0 在 G2（2D/SVG 形态页，不进 Three.js）；CL-1 在 G3（Three.js 光路/粒子/雕塑） | v1.2 §5.4「G2/G3 候选」与 §9 G2 验收要求「Web 3D 与 Serial Card 同一套形态」 |
| C4 | §6.1 预算表 | draw call 场景本体 24 / 48 / 90，粒子 Stage ≤1,200 | 重算：Stage 场景本体 90 → **94**（CL 追加 ≤4）；粒子行改为**合计口径**（声谱 900 + CL 300）；新增 CL 专项行 | 本章 C1、C2 |
| C5 | §6.2 帧预算 | Twin≤4.0 + World≤8.0 + CPU≤5.0 + 后处理≤3.0 + 余量≥2.0（合计 22.0 ms > 16.6 ms） | **修正为不可相加的分体验预算**，Stage 合计精确 16.6 ms；新增 Circuit Language 行 | v0.2 自查发现 v0.1 该表超配 |
| C6 | §6.3 降级矩阵 | 粒子 A 100% / B 50% / C 0 | CL 行独立：A 全语法 / B 减 trace / C 只留节点（**CL 是「低档保留音序结构可视化」的载体，不能比粒子先砍**） | v1.2 §5.3 |
| C7 | §6.4 性能测试 | 3 项 | 新增第 4 项「CL 开关对照测试」（帧时间 / drawcall 增量 / events 哈希不变） | 本章 C1、C2 |
| C8 | §5.1 命名 | 只有资产命名 | 新增 CL 派生缓存路径与命名；明确 **CL 不是资产，不进 `assets/`** | 本章 C2 |
| C9 | §5.3 `manifest.json` | 无 circuit 字段 | 新增 `circuit` 块（`anchors` / `pattern_version` / `vm_version`）；`circuit_anchors` 在转换期手工落点并写入，运行时不推导 | 本章 C1 |
| C10 | §5.2 版本 | 三条隔离 | 新增第四条：`pattern_version` ≠ `assetVersion` ≠ `structure_hash` ≠ `visual_seed` | v1.2 §5.2 |
| C11 | §7 | 风险 R1–R12 | 新增 **§7「G2 面板首件验证 × 3D 门禁」**（谁阻塞谁、明确不阻塞、四项证据分离） | v1.2 §5.4 设计验收 + §9 G2 |
| C12 | §8（原 §7） | 风险 R1–R12 | 新增 R13–R19（视觉流污染音乐流、CL 过绘制、面板返工连带、形态二次设计等） | 本章 C1–C11 |
| C13 | 章节号 | 0–9 | 0–10：原 §7/§8/§9 → §8/§9/§10；新增 §7 门禁章 | 本章 C11 |
| C14 | §1 G1 预留 | 落 `assets/manifest.schema.json` 两个空壳 | **G1 不新增任何交付物**。`visual_manifest.schema.json` 只在本章附录给出草案，**不进 G1 仓库** | v1.2 §08「G1 不增加 PCB Art 设计/制板工作」、§12「明确不变」 |
| C15 | §10 待确认 | 5 项 | 新增 4 项：visual_manifest 冻结时机、板厂工艺能力、CL 形态冻结责任人、Serial Card 与 CL 的 2D 编译器归属 | 本章 C2、C11 |

---

## 0.1 结论先行

| # | 结论 |
|---|---|
| 1 | 三种体验**不是三套场景，是一套 SceneRoot + 三套 CameraRig / LightRig / PostStack 配置**。共享材质与 HDRI 是为了让 05A 的 ΔE 验收在三处同时成立。 |
| 2 | **Rodin 只做两类资产**：① 无 CAD 期间的 Explore 概念整机（须带 `stage: "concept"`）；② Generative World 的程序化雕塑基础网格。任何 < 1 mm 精度的控件、接口、螺丝**一律不走 Rodin**。**v1.2 变更：Circuit Language 不新增任何 Rodin 资产，8 个资产的锁定清单不变。** |
| 3 | Rodin 生成**不可复现**（同 prompt 不出同模型）。因此管线必须把「生成」当**一次性采购**：入 `_incoming` 即冻结，哈希入库，禁止「再生成一次试试」。 |
| 4 | 异步链的幂等键是 `sha256(assetId + promptRev + mode + refsHash)`，不是 task_uuid。task_uuid 是执行凭证，job_key 是业务凭证。 |
| 5 | 批量生成**不在 agent 会话里跑**，走独立脚本 + MCP stdio client。agent 会话只用于「提示词定稿与选片决策」。 |
| 6 | draw call 有两套口径，必须分开写：**Twin 单资产 ≤ 12（05A）** ／ **整帧提交 ≤ 120（G2）、≤ 200（G3）（Web 规划）**。前者是后者的子集，验收时按各自口径查。**【v1.2 变更】Circuit Language 追加第三套口径：CL 自身 ≤ 4（A/B）、≤ 1（C），由 `renderer.info` 开关差值断言。** |
| 7 | **【v1.2 变更】Circuit Language 是可摘除的叠加层，不是第四套场景。** 它不是 ContentLayer 的兄弟节点，是 ContentLayer 内一个可整层卸载的 additive 子层；CL 全部关闭时，Twin、World、音乐、Card 功能零影响。 |
| 8 | **【v1.2 变更】视觉侧必须走独立随机流。** `visual_seed` 由域分离 hash 从 `(版本, Seed)` 派生，**不消耗音乐 PRNG 的任何一位**。CL 参数变化导致 `structure_hash` 变化 = 一级事故，有 CI 黄金测试卡死，不是口头纪律。 |
| 9 | **【v1.2 变更】G2 要「Web 3D 与 Serial Card 同一套节点/线路形态」的证据，但 G2 不许有 Generative World**（v0.1 §1 与 v1.2 §5.4 冲突）。解法：拆 **CL-0**（Graph IR → SVG/Canvas，独立形态页，不进 Three.js、不占场景预算）与 **CL-1**（Three.js 光路/粒子/雕塑，G3）。CL-0 是面板打样的唯一 3D-adjacent 依据。 |
| 10 | **【v1.2 变更】面板首件打样阻塞 CL-1 的形态定稿，不阻塞 CL-1 的技术预研，也不阻塞本章任何其他交付物。** 反向：CL-0 形态稿不阻塞打样（用 rev 稿开工），但形态冻结必须等打样实测。 |

---

## 1. 阶段落位（先锁死，再谈技术）

| 阶段 | 允许的场景内容 | 允许的 Rodin 资产 | 明确不做 |
|---|---|---|---|
| **G1** | 无。只有 Canvas 2D / SVG 的 hash 派生静态视觉。 | **0 个** | 不加载 `.glb` / `.hdr` / `.ktx2`；不 import `three`；不调 Rodin；**不做 PCB Art 设计/制板；不落 visual_manifest schema** |
| **G2** | Explore 单场景（Physical Twin 转台）+ Connect 单场景（Twin + 参数镜像）。无 Generative World，无粒子，后处理仅 Bloom。**【v1.2 变更】另加 `/circuit` 独立形态页：CL-0 的 Graph IR → SVG 渲染，纯 2D，不 import `three`。** | `twin_body_concept`（仅当 CAD 未到位）、`twin_card` | 不做舞台、不做程序化雕塑、不做 Crack 视觉、**不做 Three.js 光路（CL-1）** |
| **G3** | 三场景全开：加入 Generative World、**Circuit Language（CL-1）**、Crack 视觉重组、`/stage` 全屏演出。 | `world_*` 全系 5 个资产族 | 不做角色/骨骼；不做用户自定义模型上传；不做按 Seed 实时生成实体 PCB 图案 |

**为什么 G2 只做 Twin**：Twin 的价值是「旋钮动了网页跟着动」的状态映射证据（§10「Digital Twin 只是一张漂亮模型」风险）。Generative World 的价值是舞台视觉，没有 G2 的连接证据就没有 G3 的舞台理由。顺序不能倒。

**【v1.2 变更】CL-0 为什么不算破坏这条顺序**：CL-0 不加载 `.glb`、不进 `Canvas`/R3F 树、不参与任何相机灯光后处理，它是**一张与面板版稿 1:1 叠合的矢量图**。它的存在理由不是「好看」，是 v1.2 §9 要求 G2 拿出「Web 3D 与 Serial Card 使用同一套节点/线路形态」的验收物——没有 CL-0，这条验收项在 G2 无物可验。它与 Twin 场景零耦合：删掉 `/circuit` 路由，G2 其余验收项一个不受影响。

**G1 的唯一预留**：本章只在仓库里落两个**空壳契约**——`assets/manifest.schema.json` 与命名规范，不落任何资产、不落任何场景代码。G1 的构建期断言（Web 规划 5.2 第 2 条）必须能 grep 到 `three` 为 0 命中。

**【v1.2 变更】G1 不扩充**：`visual_manifest.schema.json` **不落 G1**。v1.2 §08 与 §12 两处写明「G1 不增加 PCB Art 设计/制板工作」「明确不变：G1 仍是 12 人日」。把 schema 空壳塞进 G1 是范围蔓延，本章拒绝。草案只存在于 §5.5 与附录 A，供 G2 开工时转为正式 schema。

---

## 2. 场景结构

### 2.1 统一骨架

```tsx
<Canvas
  gl={{ antialias: tier === 'A', powerPreference: 'high-performance', alpha: false }}
  dpr={TIER_DPR[tier]}          // A: min(dpr,2)  B: 1.5  C: 1
  shadows={tier !== 'C' ? 'soft' : false}
  camera={{ fov: RIG.fov, near: 0.05, far: 50 }}
>
  <SceneRoot experience="explore" | "connect" | "stage">
    <EnvironmentRig />          // HDRI 或纯黑，按 experience 选
    <LightRig />                // 05A.1.3 三灯，强度按 experience 曲线
    <ContentLayer />            // Twin / World / 二者混合
      <TwinLayer />             // 05A 资产
      <WorldLayer />            // Rodin world_* 资产
      <CircuitLayer />          // 【v1.2 变更】CL-1，仅 stage 挂载，可整层卸载
    <ContactShadow />           // 预烘焙贴片，非实时 SSAO
    <PostStack />               // 按 tier + experience 挂载
  </SceneRoot>
</Canvas>
```

三条结构纪律：

1. **体验切换 = 卸载 + 重建，不复用**。`experience` 变化时 `SceneRoot` 换 key，旧场景 `dispose()` 全部 geometry / material / render target。跨体验复用对象是「Explore 的 Bloom 参数污染 Stage」这类事故的唯一来源。
2. **灯光 rig 是常量表，不是组件内的 if**。三种体验读同一份 `LIGHT_RIG` 常量，只改强度倍率与色温偏移。改主光方向 = 改材质验收基线 = 05A 的 ΔE 全部作废。
3. **相机不进 React state**。机位由 `CameraRig` 直接写 `camera.position / quaternion`，`useFrame` 内插值。

**【v1.2 变更】第 4 条纪律**：**CircuitLayer 只能读 `transport` 快照与 `events`，不能写任何音乐状态，也不能 import 音乐 PRNG 模块。** 依赖方向单向：`scene/circuit → {types, transport-readonly}`，禁止 `scene/circuit → music/*`。落地为 ESLint `no-restricted-imports` 规则 + CI 断言，见 §2.5.5。

### 2.2 Explore & Preview

**职责**：让访客理解「一台机器 + 一个 Serial = 一段可复现的音乐」。这是一个**产品摄影棚**，不是游戏场景。

| 项 | 方案 |
|---|---|
| 内容 | Twin 概念件（或 CAD 正式件）+ 展台接触阴影贴片。无地面、无背景板、无环境道具。**【v1.2 变更】不加 Circuit Language**——Twin 层是实体对应层，在其表面虚构丝印/焊盘会把「概念面板」误读成「已打样 PCB」，直接踩 §10「Rodin 概念误导买家」 |
| 相机 | `PerspectiveCamera` fov **35°**（长焦压缩，工业产品感；50mm 等效的克制版本） |
| 默认机位 | target `(0, 0.06, 0)`，pos `(0.34, 0.16, 0.42)`，距离 ≈ 0.56 m，仰角 12°，方位 39°（3/4 Hero） |
| 交互 | `OrbitControls`：`enablePan=false`，`minPolarAngle=55°`，`maxPolarAngle=95°`，`minDistance=0.25`，`maxDistance=1.20`，`dampingFactor=0.08` |
| 自动旋转 | 仅 `Locked` 且 **6 s 无交互**时以 6°/s 环绕；一交互即停，停后 8 s 不恢复 |
| 灯光 | 05A.1.3 原样：主光 `(-0.4, 0.8, 0.5)` / 2.2 / 唯一投影；补光 `(0.6, 0.2, -0.4)` / 0.6；轮廓光 `(0.2, 0.3, -0.9)` / `#8FB6C8` / 0.8 |
| 环境 | 单张 2K studio HDRI，`PMREMGenerator` 预过滤一次 |
| 后处理 | tier A/B：`UnrealBloomPass`(0.85 / 0.6 / 0.4) + `OutputPass`。**不开 DOF**——景深会把面板细节糊掉，这是产品册不是人像 |
| 降级 | tier C：关 Bloom、关阴影、HDRI 换纯色环境（`envMapIntensity` 置 0，靠三盏方向光出形） |

**四态动效**（数值沿用 05A.4.3，此处只定义相机与几何响应）：

| 状态 | 相机 | 几何 / 材质 |
|---|---|---|
| Locked | 静止或 6°/s 环绕 | emissive 0.0–0.15 低位呼吸（周期 4 s）；全机低频单一频闪，不随音乐 |
| Generate | 0.9 s `easeInOutCubic` dolly 到 distance 0.42，仰角抬到 16° | 16 步逐级点亮：第 n 步点亮由 `events[n].gate` 驱动，**不是通用开机动画** |
| Perform | 稳定 3/4，仅 ±0.8° 微呼吸 | emissive 跟 `params.intensity`；`EC11#3` 改材质 roughness ±0.05（可见但不破坏 ΔE ≤ 0.05 阈值需另测） |
| Crack / Archive | 0.15 s 内 ±8 mm 高频位移 3 次后归位 | emissive 瞬时 1.8 + 结构件错位；**克制**，不做爆炸 |

**硬约束**：Generate 的点亮序列必须是 `structure_hash` 的函数。同一 Serial 在两次会话里的点亮顺序必须一致——这是「Same Serial → Same Musical Structure」在视觉侧的唯一可验收延伸。

### 2.3 Connect & Perform

**职责**：证明「网页是数字孪生，不是独立播放器」。视觉的全部合法性来自「它反映了硬件正在做什么」。

| 项 | 方案 |
|---|---|
| 内容 | Twin + 控件高亮层（非几何：用 emissive 遮罩或屏幕空间描边）+ 状态徽标（DOM，不进 3D） |
| 相机 | 双预设机位，0.6 s `cubic-bezier(0.4,0,0.2,1)` 切换 |
| P0 Overview | 同 Explore Hero（distance 0.56，fov 35°） |
| P1 Detail | 对角当前操作控件，distance **0.18**，fov **28°**（更强的长焦压缩，让旋钮占满画面） |
| 机位选择 | `EC11#1/#2/#3/#4` → P1 对准对应旋钮；`B10K#1/#2` → P1 对准对应推子/旋钮；`CRACK` → 强制回 P0；5 s 无控件事件 → 自动回 P0 |
| 交互 | 允许自由 Orbit（同 Explore 限制），但**任何控件事件覆盖用户机位**——用户手动转到的角度不能压过「硬件正在拧 3 号旋钮」这件事 |
| 灯光 | 主光方向**锁死**（与 05A 基线一致）。可变项仅三项：`emissiveAccent` 强度、轮廓光色温（±400 K）、雾密度 |
| 后处理 | 同 Explore（Bloom + Output）。**禁止 DOF**：Detail 机位已经用 fov 压缩，再叠 DOF 会失去焦点可靠性 |
| 参数镜像 | `params` 分「目标值 / 生效值」两套（Web 规划 4.1）。视觉只读**生效值**，`edit_request` 未 `ack` 前不改画面。**【v1.2 变更】`EC11#4 Visual / Scene` 在此只切视觉宏参数，不切场景；切场景属于 G3 `/stage` 的能力** |

**为什么灯光不能跟着音乐变**：Connect 场景的隐性验收项是「用户能看清按钮位置与材质」。一旦主光方向随音乐摆动，05A.4.2 的 ΔE ≤ 3.0 与控件位置 < 1.5 mm 两项在同一会话内就无法稳定复现。要「有反应」，用 emissive 与轮廓光，不用主光。

### 2.4 Hardware-led A/V（`/stage`）

**职责**：外接屏幕上的演出视觉。**这是唯一允许「视觉盖过产品」的场景**，因为它本来就不卖产品。

| 项 | 方案 |
|---|---|
| 内容 | Generative World 主导；Twin 退为远景图腾（`world_totem`）。全黑背景，无展台。**【v1.2 变更】Circuit Language（CL-1）在此挂载，是 16-step 语义的显性载体** |
| 相机 | `CatmullRomCurve3` 闭环路径，6 控制点，`curveType='centripetal'`。位置由 `musicalTime` 采样，**不由 rAF 时间** |
| 路径集 | 三条预设：`calm`（半径 3.2 m，慢）/ `build`（半径 1.8 m，抬升）/ `drop`（半径 1.1 m，俯冲）。由 `params.intensity` 做权重混合，混合在曲线参数域做，不在位置域做（否则会穿模） |
| 相机 fov | **24°**（舞台长焦，压缩纵深，让结构块在屏幕上有体积感） |
| 灯光 | **不用 HDRI**。纯黑 ambient 0.02 + 3 盏 `SpotLight`（不投影），色相由 `step` 索引与 `structure_hash` 派生 |
| 阴影 | 关闭。舞台不需要接地阴影，省一半 GPU |
| 后处理 | A 档：Bloom + DOF + 灰阶染色；B 档：Bloom；C 档：无。**Crack 瞬时**叠加 chromatic aberration（仅 A 档，≤ 200 ms）。**【v1.2 变更】不为 CL 新增任何 pass；CL 的"发光"由它自身的 HDR 亮度 + 既有 Bloom 产生** |
| 黑场 | 快捷键 `B` / MIDI CC：`renderer.clear()` 后跳过全部绘制。**音频与 AudioContext 完全不动** |
| 隐藏 UI | `H`：DOM chrome 淡出，3D 不动。OSD 连接状态徽标**不可隐藏**（现场排障需要） |

**舞台铁律**：视觉的任何降级、暂停、黑场、崩溃都不得触碰 `AudioContext`。降档只改 renderer 状态（pixelRatio / pass 挂载 / 阴影开关），**不改 bpm、不改 tick 源、不重建 graph**。

**【v1.2 变更】CL 追加铁律**：黑场（`B`）时 CL 与 World 一同跳过绘制，但 **CL 的内部状态机（相位、断裂进度）不得回退**——黑场结束要无缝接上当前 `tick`，不能从零重放。实现上 CL 只持有 `f(tick)` 的纯函数，不持有自增进度。

### 2.5 Circuit Language 层【v1.2 变更】

#### 2.5.1 定位与两级拆分

产品册 v1.2 §5.4 把 PCB Art / Circuit Language 定义为三媒介共用的视觉语法：实体面板（丝印/露铜）、Three.js Generative World（光路/粒子/雕塑）、Serial Card（线路纹样）。本章只负责第二项在 Web 侧的落地，但必须同时给出与实体、卡片的接口。

| 级 | 载体 | 阶段 | 是否 import `three` | 用途 |
|---|---|---|---|---|
| **CL-0** | Graph IR → SVG / Canvas 2D | **G2** | **否** | 与面板版稿 1:1 叠合比对；Serial Card 卡面；形态冻结的验收物 |
| **CL-1** | Graph IR → `BufferGeometry` + `ShaderMaterial` | **G3** | 是 | `/stage` 的光路、粒子路径、对雕塑的微扰 |

两级共用同一个中间表示与同一份 `visual_manifest`。**CL-0 与 CL-1 不允许各自定义一套节点/线路语法**——那会让 G2 的「同一套形态」验收变成两张图各说各话。

#### 2.5.2 场景图分层

CL-1 挂在 `ContentLayer` 内部，四个子层，全部 additive 混合、`depthWrite=false`、`depthTest=true`（保留被雕塑遮挡的正确性）：

```
CircuitLayer (可整层卸载)
├─ CL_Traces      merged BufferGeometry   renderOrder 10   ← 线路（ribbon）
├─ CL_LightPath   1 个 merged mesh        renderOrder 11   ← 光路（条带 + 相位遮罩）
├─ CL_Nodes       InstancedMesh (SDF)     renderOrder 12   ← 节点/焊盘，≤ 128 实例
└─ CL_Particles   Points                  renderOrder 13   ← 沿路径采样的粒子
```

| 子层 | 几何来源 | 实例/顶点上限 | draw call |
|---|---|---|---|
| `CL_Traces` | `traces[]` 折线 → ribbon（每段 4 顶点） | ≤ 600 段 / 2,400 顶点 | 1（合并） |
| `CL_LightPath` | 选定 `traces[]` 子集加粗成条带 | ≤ 200 段 | 1 |
| `CL_Nodes` | `nodes[]` × 实例矩阵 | ≤ 128 实例 | 1 |
| `CL_Particles` | 沿 `traces[]` 参数化采样 | ≤ 300 点（计入 §6.1 粒子总口径） | 1 |
| **合计** | — | ≈ 8k 顶点、无贴图 | **≤ 4** |

**为什么必须合并到 4**：CL 的几何量小但逻辑简单，天然适合实例化与合批。任何超过 4 的实现都是「没合并」而不是「CL 太复杂」。这条由 §6.4 第 4 项测试的 drawcall 差值断言卡死。

**四层不许做的事**：

1. 不产生阴影（`castShadow=false`）。
2. 不进 `EnvironmentRig` 的反射探针（不参与 PMREM）。
3. 不写 `depth` 到后期（无 depth pass 依赖；DOF 对 CL 不产生景深，这正好——光路本来就不该被糊）。
4. 不新增 PBR 材质（见下）。

#### 2.5.3 材质与后处理

CL 的材质策略一句话：**CL 不是 PBR，不进 ΔE 基线。**

| 材质 | 类型 | 关键参数 | 理由 |
|---|---|---|---|
| `M_CL_Node` | `ShaderMaterial`（unlit，additive） | SDF 圆形 + 环；`uSize` / `uRole` 实例属性 | 节点是符号不是表面，不应被光照改变；否则换 HDRI 就换验收基线 |
| `M_CL_Trace` | `ShaderMaterial`（unlit，additive，ribbon） | `uWidth` 顶点属性、沿长度 alpha 衰减 | 丝印/走线在实体上也不吃光 |
| `M_CL_Path` | 同上 + 相位遮罩 | `uTickPhase`、`uGate[i]`（16 float） | 光路必须由 `events[n].gate` 驱动 |
| `M_CL_Particle` | `Points` + 同款 unlit | `uDensity`、`uPalette` | 粒子是路径采样，不是独立随机 |

三条材质纪律：

1. **线性空间亮度上限 ≤ 2.0**。超过这个值，Bloom 阈值（0.85 / 0.9）在不同分辨率下会把整帧洗白。CL 的"亮"靠对比，不靠数值。
2. **不依赖 Bloom 才可读**。tier C 无 Bloom，CL 必须仅靠自身 alpha 与色相区分主次。这条在 §6.4 第 4 项测试的 C 档分支里验。
3. **ΔE 验收时 CL 必须整层关闭**（`cl_enabled=false`）。05A.4.2 的 ΔE ≤ 3.0 测的是 PBR 材质，additive 叠加层参与截图会让基线不可复现。验收脚本必须显式设置该开关并断言截图哈希。

**后处理**：不动。CL 不新增 pass、不改 Bloom 参数、不改 tone mapping。唯一交互是「CL 的 HDR 值会被既有 Bloom 拾取」——这是设计意图，不是副作用。

#### 2.5.4 与 8 个 Rodin 资产的共存矩阵

8 个资产锁定不变（§3.2）。CL 不修改任何网格拓扑、不新增资产族、不重做 UV。共存方式是**锚点挂载**：

| 资产 | CL 角色 | 锚点 | 行为 | draw |
|---|---|---|---|---|
| `world_core_sculpt` | 主节点矩阵（光路汇聚点） | 12 个，写在 `manifest.circuit.anchors` | 核体表面节点环；光路向核体收束；Archive 态转暗 | 共享 |
| `world_step_module.a/b/c` ×16 | **step 节点 1:1 映射** | 3 个（每变体 1 个局部锚点，实例化复制） | 第 i 个实例 = 第 i 个 step；节点亮度 = `events[i].gate`；这是「16-step 语义在 3D 里的唯一合法位置」 | 共享（1 instanced） |
| `world_crack_shard.01–06` | 断裂断口 | 每 shard 2 个 | Crack 时 trace 沿断口断开，**不新增节点、不随机增删**；断口位置由 shard 的静态锚点决定，非随机 | 共享 |
| `world_totem` | 远景，CL 关闭 | 0 | 屏幕投影高度 < 30 px 时 cull；远景图腾不需要电路语法 | 0 |
| `world_archive_relic` | 「封存」语法 | 4 个 | trace 冻结（无相位）、节点 alpha 0.35、无脉冲 | 共享 |
| `twin_body_concept` | **不承载 CL** | — | Twin 层是实体对应层；在上面虚构丝印＝把概念面板说成已打样 PCB | 0 |
| `twin_card` | 不承载 CL-1；卡面由 CL-0 渲染 | — | 2D 与 3D 同源：同一个 Graph IR，两个 Adapter | 0 |

**锚点为什么必须写进 manifest、不能运行时推导**：运行时从减面后的 30k 面几何推导锚点，拓扑一改全错，且会让 `assetVersion` 与 CL 形态隐式耦合（换一版减面 → 光路位置漂移 → 形态验收失效）。正确做法是在 05A 转换阶段用 Blender 手工落点，导出 `circuit.anchors` 写入 `manifest.json`，与资产同版本冻结。

**锚点数据结构**（坐标为该资产局部空间，单位 m，与 `pivot` 同基准）：

```jsonc
"circuit": {
  "vm_version": "VM/0.1",
  "pattern_version": "CL-01",
  "anchors": [
    { "id": "n0",  "p": [0.000, 0.031, 0.004], "n": [0.00, 0.00, 1.00], "role": "pad",  "step": 0 },
    { "id": "n1",  "p": [0.018, 0.031, 0.004], "n": [0.00, 0.00, 1.00], "role": "pad",  "step": 1 },
    { "id": "hub", "p": [0.000, 0.060, 0.000], "n": [0.00, 1.00, 0.00], "role": "hub",  "step": null }
  ]
}
```

`role` 枚举：`pad`（焊盘/节点）｜`via`（过孔）｜`hub`（汇聚，非 step）｜`silk`（纯丝印图形，无电气语义）。`step` 为 `null` 表示非 step 节点——**只有 `step` 非空的锚点才允许与 `events[i]` 绑定**，这是防止「线路随便闪」的硬约束。

#### 2.5.5 visual_manifest 如何驱动几何与光路

产品册 v1.2 §5.4 的统一生成原则是：从版本与 Seed 派生 `visual_seed` → 输出 `visual_manifest` → 供网页与卡片共用。本章的落地拆成三段**纯函数**：

```
(engine_version, seed)
   └─derive→ visual_seed            // 域分离 hash，独立流，不碰音乐 PRNG
        └─expand→ visual_manifest   // 纯函数：visual_seed + pattern_version
             └─compile→ GraphIR     // 纯函数：manifest + anchors → 拓扑图
                  ├─→ SvgAdapter          (CL-0 / Serial Card)
                  └─→ GeometryAdapter     (CL-1 / Three.js)
```

**域分离（关键论证，为什么不能"顺手用音乐 PRNG 取几个数"）**：音乐侧的 PRNG 是**有状态、顺序敏感**的。若视觉侧从同一流里取样，则"粒子数从 300 改成 200"会消耗不同数量的随机数，后续所有音乐事件的取值全变，`structure_hash` 直接漂移。这不是理论风险，是必然。因此：

```ts
// visual/seed.ts —— 与 music/prng.ts 零共享状态
export function deriveVisualSeed(engineVersion: string, seed: string): Uint8Array {
  return sha256(Buffer.from(`SERIAL/visual/v1|${engineVersion}|${seed}`)).subarray(0, 16);
}
```

三条文件级隔离（CI 断言，非注释）：

1. `src/visual/**` 禁止 import `src/music/**`（ESLint `no-restricted-imports`）。
2. `src/visual/**` 禁止 `Math.random()`、禁止 `Date.now()`、禁止 `performance.now()` 参与 manifest 生成（ESLint `no-restricted-properties` + `no-restricted-globals`）。
3. **黄金测试**：同一 Seed 下，`density ∈ {0, 0.42, 1}`、`cl_enabled ∈ {true,false}`、`pattern_version ∈ {CL-00, CL-01}` 的 12 组组合，输出的 `events` 序列与 `structure_hash` 必须 **bit-identical**。任一组不等 = 构建失败。

**manifest 只给语义，不给几何**——这是分层的核心决定：

| manifest 字段 | 编译产物 | 渲染载体 | 视觉结果 |
|---|---|---|---|
| `nodes[].grid` | 归一化网格坐标（0–1，与资产尺寸解耦） | 实例矩阵 × anchor 变换 | 节点位置 |
| `nodes[].role` | 实例属性 `uRole` | `M_CL_Node` | 主/次节点尺寸与亮度层级 |
| `traces[].from/to` | 折线端点 | `CL_Traces` 顶点 | 连线拓扑 |
| `traces[].bend` | 中间控制点偏移（整数格） | 折线拐点 | 走线形状（直角/45°/弧） |
| `traces[].layer` | 可见性掩码 | `M_CL_Trace.uLayerMask` | `silk`（丝印，常显）/ `deco`（装饰，随 gate 显隐） |
| `density` | 采样步长、可见 trace 比例 | `uDensity` | 线路密度、粒子数 |
| `palette` | 3 × vec3 | `uPalette` | 色系 |
| `pattern_version` | 选择 graph 模板与 shader 变体 | material variant | 整体语法族 |

**为什么不给世界坐标**：同一份 manifest 要同时贴到「40 mm 的面板」「85 × 54 mm 的卡」「3 m 的舞台雕塑」。manifest 里的坐标是**归一化网格**，世界定位由 `anchors` × 实例 transform 决定。给绝对坐标会让三端各写一套缩放，形态一致性验收直接作废。

**光路的驱动公式**（唯一允许的驱动源）：

```glsl
// 节点亮度：只读 transport 快照与 events
float lit(int step) { return uGate[step] * sin(uTickPhase + float(step) * 0.0625); }
```

- `uTickPhase = 2π * fract(transport.tick / ticksPerStep)`，来自 Link 快照。
- 未连接（Unconnected Preview）时 `transport.tick` 由本地 WebAudio 时钟推进，**仍不用 rAF**。
- `events[n].gate` 是 16 个 float uniform，每帧最多更新一次，从快照拷贝，不做插值。

#### 2.5.6 schema 未冻结时的容错设计

v1.2 明确：`visual_manifest` 的正式 schema、散列/域分离方法、测试向量**都未冻结**。因此客户端必须按"永远可能收到不认识的 manifest"来写。

| 故障 | 行为 | 用户可见后果 |
|---|---|---|
| `vm_version` 未知 | 回落 `CL-00 固定拓扑`（16 节点均匀环形，无 trace，无粒子） | CL 退化为一圈节点，语义仍正确 |
| `nodes` 缺失/空 | 同上 | 同上 |
| `traces[].from/to` 指向不存在的 node | 丢弃该条，其余照常；记一次 warning（去重后只打一条） | 少几条线，不影响功能 |
| `bend` / `layer` 缺省 | 取默认值（`bend=0`、`layer='silk'`） | 走线变直角 |
| `density` 越界或非数值 | clamp 到 `[0, 1]`；`NaN` → `0.42` | 密度异常但不崩 |
| `palette` 未知枚举 | 回落 `smoked / milk / accent` 三色默认 | 配色回默认 |
| `pattern_version` 未知 | 回落 `CL-00`（不是"用最新的"） | 形态保守 |
| 整个 manifest 解析失败 | **CL 整层不挂载**，`CircuitLayer` 返回 `null` | 无光路；Twin / World / 音乐 / 交互零影响 |
| anchors 数量与 `nodes` 不匹配 | 按 `min(len)` 截断，多余锚点忽略 | 少节点，不崩 |

**四条容错原则**：

1. **CL 永远是可摘除层**。任何 CL 侧异常不得冒泡到 `SceneRoot`。这要求挂载点外包一层 error boundary，且该 boundary 的 fallback 是 `null` 而非占位几何。
2. **回落方向唯一**：未知 → `CL-00`。不允许"尝试解析后随便渲染"，那会让同一份坏 manifest 在不同端产生不同画面。
3. **非严格解析期（G2–G3）**：忽略未知字段，收集 unknown keys 打一条汇总日志（不是每条一次）。`vm_version` 升 MAJOR 时切 strict，未知字段直接构建失败——但那只发生在 schema 冻结之后。
4. **不把未冻结的 schema 写进任何对外承诺**。产品册 v1.2 §5.4 的原话是"目前不把某种算法当作已实现标准"。本章的 `VM/0.1` 是内部开发号，README 必须标注 `draft`。

---

## 3. Rodin 逐资产任务表

### 3.1 先说边界（与 05A.2.1 一致，此处只补工程判据）

| 用途 | 允许 | 工程判据 |
|---|---|---|
| Explore 概念整机（CAD 未到位时） | ✅ | `manifest.stage = "concept"`，UI 强制渲染标注 |
| Generative World 基础网格 | ✅ | 必须重拓扑 + 重做 UV + 重建材质，原贴图只取色相分布 |
| 精确控件 / 接口 / 螺丝 / 分件缝 | ❌ | 精度需求 < 1 mm → CAD |
| 带文字、logo、QR 的表面 | ❌ | Rodin 会幻觉乱码凸起（05A.5 缺陷 #14） |
| 角色 / 人体 / 生物 | ❌ | 无相关资产需求，`rodin_generate_rigging` 不在计划内。**【v1.2 变更】Circuit Language 的节点/线路/光路同样不走 Rodin**——它是参数化几何，生成模型无法保证拓扑与 manifest 对齐 |

**工具语义映射**（参数名以 MCP server 的 `inputSchema` 为准，本文按语义命名，落地前必须核对一次）：

| 工具 | 语义 | 本项目用法 |
|---|---|---|
| `rodin_generate` | 标准生成（文/图 → 网格） | 形制简单、参考图明确的资产 |
| `rodin_generate_agentic` | 高质量代理模式，多视角一致性优先 | Hero 资产、需要多视角自洽的整机 |
| `rodin_generate_bang` | 快速低成本档 | **仅体块探索与剪影试错**，产出永不进管线 |
| `rodin_generate_rigging` | 自动骨骼绑定 | **不用**。无角色资产；且骨骼与权重会让 glb 体积 +15–40%，与 Twin 预算冲突 |
| `rodin_create_uploads` / `rodin_list_uploads` | 参考图上传通道 | 提交前完成上传，记录 `upload_id` 与过期时间 |
| `rodin_get_status` | 任务状态 | 轮询主通道 |
| `rodin_wait` | 阻塞等待 | **仅交互探索时用**，批量管线禁用（会挂死长连接） |
| `rodin_get_result` | 取结果（含下载 URL） | 下载前调用，URL 有时效 |
| `rodin_list_animation_presets` | 内置动画预设 | **不用**。内置动画与 `transport` 时钟冲突，所有动效程序化生成 |

### 3.2 资产清单（8 个，锁定，禁止扩张）

| ID | 层 | 用途 / 出现场景 | LOD0 面数 | 阶段 |
|---|---|---|---|---|
| `twin_body_concept` | Physical Twin | Explore 转台主角（无 CAD 期间） | 30,000 | G2 |
| `twin_card` | Physical Twin | Serial Card 实体展示（Explore 结束态） | 4,000 | G2 |
| `world_core_sculpt` | Generative World | 场景中心核体（Stage 主视觉，**CL 主节点矩阵挂载点**） | 20,000 | G3 |
| `world_step_module.a/b/c` | Generative World | 16-step 模块，实例化 ×16（**CL step 节点 1:1**） | 3,000 ×3 | G3 |
| `world_crack_shard.01–06` | Generative World | Crack 断裂碎片，实例化（**CL 断口**） | 1,200 ×6 | G3 |
| `world_totem` | Generative World | Stage 远景图腾 | 12,000 | G3 |
| `world_archive_relic` | Generative World | Archive 状态遗物（**CL 冻结语法**） | 8,000 | G3 |

**【v1.2 变更】数量不变**：Circuit Language 是参数化几何层，不是资产族。引入 CL 后资产清单仍是 8 个 / 15 个网格。任何"给 CL 加一个电路板模型"的提议直接驳回——那是 Canvas/SVG 或 shader，不是网格。

**不做清单（出现即驳回）**

| 项 | 原因 |
|---|---|
| 旋钮、键帽、推子帽 | 圆柱 + 倒角 + 防滑纹，精度 < 1 mm，程序化 lathe 或 CAD 更快更准 |
| 接口 / USB / 电源孔 | 同上，且装配关系必须真实 |
| 螺丝、轴、分件缝 | 05A.5「不可修复清单」直接判死 |
| 展台、地面、背景板 | 一个 `BoxGeometry` + 接触阴影贴图解决，不值得走生成 |
| 屏幕内容 | Canvas 纹理 / SDF 字体，不是几何 |
| 任何带文字或 QR 的平面 | Rodin 必然幻觉 |
| **【v1.2 变更】电路板 / 面板几何** | CL 用归一化网格 + shader 绘制；用 Rodin 生成"好看的电路板"会得到不可参数化的碎面，与 manifest 完全对不上 |

### 3.3 逐资产任务表

> 「提示词要点」是**英文**（Rodin 对英文形制描述稳定），列的是必写项与禁止项，不是完整 prompt。完整 prompt 存 `provenance.json`。

| ID | 提示词要点（必写 / 禁止） | 参考图需求 | 生成模式 | 导出 | 人日 |
|---|---|---|---|---|---|
| `twin_body_concept` | 必写：`single desktop electronic instrument`、`monolithic smoked-metal chassis`、`240 mm wide`、`4.3 inch screen recessed on front face`、`six cylindrical knobs in one row below screen`、`one metal dome button`、`matte milk-white polymer panel insert`、`precision machined steel bezel`、`closed manifold`、`symmetric`。禁止：`text`、`logo`、`cable`、`hands`、`background`、`multi-object`、`organic curves` | **3 张**：正视图 / 3-4 视图 / 侧视图，**白底无投影**，≥ 2048 px；+ 1 张尺寸标注草图（若 CAD 未出，用概念草图，标注「非生产尺寸」）。多图必须同比例同机位 | `agentic`（多视角自洽是整机唯一硬需求） | `glb`（主）+ `obj`（仅供拓扑检查） | 5–6 |
| `twin_card` | 必写：`credit-card sized object`、`85 × 54 × 0.8 mm`、`smoked translucent polymer`、`recessed QR square 20 mm`、`steel edge chamfer`、`single flat object`。禁止：**任何文字与 QR 图案本体**（刻槽可以，内容必须后期贴） | **1 张**：卡面平面设计稿（只取几何分区与刻槽位置，不含文字像素）+ 1 张厚度侧视示意 | `generate`（形制简单，标准档足够） | `glb` | 2 |
| `world_core_sculpt` | 必写：`abstract procedural sculpture`、`faceted polyhedral core`、`industrial archaeology`、`machined smoked metal with milk-white polymer inlays`、`sharp chamfers`、`radially symmetric about Y axis`、`single closed mesh`。禁止：`organic`、`smooth blob`、`text`、`thin wires`（减面必炸）；**【v1.2 变更】禁止 `circuit board`、`pcb`、`traces`、`solder pads`**——CL 节点是挂载上去的，不是生成进网格的 | **无**（纯文本）。可附 1 张情绪板作内部对齐，不作输入 | `agentic` | `glb` | 4 |
| `world_step_module.a/b/c` | 必写：`small modular mechanical unit`、`~16 mm`、`milled aluminium block`、`one cylindrical aperture`、`one steel pin`、`chamfered edges`、`stackable`。禁止：`text`、`rounded soft edges`（要和核体的硬边语言一致） | **无** | 先 `bang` 探 6 次定体块 → 选定后 `generate` ×3 出变体 | `glb` | 1.5 / 变体 |
| `world_crack_shard.01–06` | 必写：`fracture shard from a machined metal shell`、`sharp planar break faces`、`thin steel cross-section`、`irregular but angular`。禁止：`organic`、`dripping`、`melted` | **无** | `bang` 批量出 20 个 → 人工选 6 个 → 直接进管线（不做 agentic，剪影够用） | `glb` | 1 / 个 |
| `world_totem` | 必写：`tall monolithic machine totem`、`2.4 m`、`vertical ribbed smoked metal`、`one vertical emissive slot`、`brutalist`、`single object`。禁止：`text`、`windows`、`figures` | **无** | `agentic`（远景剪影要干净，标准档容易出碎面） | `glb` | 4 |
| `world_archive_relic` | 必写：`sealed memorial artifact`、`cube-ish smoked glass block`、`suspended machined gear inside`、`engraved edge`。禁止：`text`、`chain`、`pedestal` | **无** | `generate` | `glb` | 3 |

**人日口径**：以上为「Rodin 原始件 → 可上线 Web 资产」的**转换**人力，按 05A.5 基线（清理 1.5 + 减面 UV 1 + 烘焙材质 2 + 集成验收 1 ≈ 5–6 人日/件）折算，简单件打折。**不含** Rodin 排队与重试时间，不含 CAD 建模。

**【v1.2 变更】CL 人日单列**（不进 Rodin 任务表，因为不产生资产）：

| 项 | 人日 | 说明 |
|---|---|---|
| CL-0（Graph IR + SVG Adapter + `/circuit` 页） | 3 | G2 交付 |
| 面板叠合比对工具（1:1 缩放、偏差量测） | 1 | G2 交付 |
| CL-1（Geometry Adapter + 4 个材质 + 相位驱动） | 6 | G3 交付，含性能调优 |
| anchor 落点（8 资产共 ~35 个锚点，Blender 手工） | 2 | 与 05A 转换同步做 |
| **合计** | **12** | — |

**G2 资产总量**：2 件 ≈ 7–8 人日；**【v1.2 变更】加 CL-0 与比对工具 4 人日 → G2 三维侧合计 11–12 人日**。**G3 资产总量**：6 个资产族（含变体共 15 个网格）≈ 28–34 人日；**【v1.2 变更】加 CL-1 与 anchor 4 人日 → G3 三维侧合计 32–38 人日**。这与 Web 规划 6.3 的「G2 资产管线 3.0 人日」冲突——**以本章为准**，Web 规划那 3.0 人日只覆盖管线代码，不含逐资产转换与 CL。此处必须回写修正。

---

## 4. 异步任务链工程接法

### 4.1 纪律先于代码

| # | 纪律 | 违反后果 |
|---|---|---|
| 1 | 生产管线走**独立脚本 + MCP stdio client**，不在 agent 会话里批量跑 | 会话超时 = 任务丢失，且无法并发控制 |
| 2 | `job_key` 幂等，不是 `task_uuid` | 重启后重复提交 = 重复计费 |
| 3 | 只对 5xx / 网络错误重试，**4xx 一律不重试** | 无效 prompt 被重试 3 次，浪费配额且掩盖问题 |
| 4 | 下载 URL 过期时用 `task_uuid` 重新 `rodin_get_result`，**绝不重新生成** | 拿不到同一个模型，provenance 断裂 |
| 5 | 生成物进 `_incoming` 即冻结，**永不修改** | 原始件被「顺手清理」后再也追不回 |
| 6 | 管线并发 ≤ 2 | 触发限流后所有任务一起失败 |
| 7 | **【v1.2 变更】`visual_manifest` 不进本管线** | 它不是 Rodin 产物，是 `(visual_seed, pattern_version)` 的纯函数输出；混进资产管线会让 `pattern_version` 被误当 `assetVersion`，缓存全乱 |

### 4.2 状态机

```
draft ──upload──▶ uploaded ──submit──▶ submitted ──poll ok──▶ ready
                                                      │
                                                      ├─dl──▶ downloaded
                                                      │         │
                                                      │      qc ┴─ fail ─▶ rejected
                                                      │         │
                                                      │      convert ─▶ converted
                                                      │                    │
                                                      │              publish ─▶ published
                                                      └─poll err(5xx,≤3)──▶ submitted
                                                      └─poll err(4xx)──────▶ rejected
```

`jobs.jsonl` 是 **append-only 事件日志**，每行一个状态变更；当前状态 = 最后一条。重放日志即可重建全部任务状态，不需要数据库。

**【v1.2 变更】`convert` 阶段的范围外声明**：05A.2.2 七步在 v0.2 追加一步「anchor 落点 + 写入 `manifest.circuit.anchors`」，但**这一步不阻塞 `converted`**。锚点缺失时 `manifest.circuit.anchors = []`，该资产在 G3 只参与几何渲染、不参与 CL。理由：锚点是视觉增强，多一道门会让 8 个资产全部卡在 `qc` 之后等美术。

### 4.3 骨架（示意，非完整实现）

```ts
// tools/rodin-pipeline/src/job.ts
type JobState = 'draft'|'uploaded'|'submitted'|'ready'|'downloaded'
              | 'qc'|'converted'|'published'|'rejected';

interface JobRecord {
  job_key: string;          // sha256(assetId|promptRev|mode|refsHash)
  asset_id: string;
  task_uuid?: string;
  upload_ids?: string[];
  state: JobState;
  attempts: number;
  last_error?: { kind: '5xx'|'4xx'|'net'; message: string };
  at: string;               // ISO8601
}

export function jobKey(assetId: string, promptRev: string,
                       mode: string, refs: Buffer[]): string {
  const h = createHash('sha256');
  h.update(`${assetId}|${promptRev}|${mode}|`);
  for (const b of refs) h.update(createHash('sha256').update(b).digest());
  return h.digest('hex');
}
```

```ts
// tools/rodin-pipeline/src/run.ts —— 单任务推进
async function advance(job: JobRecord, mcp: RodinClient) {
  switch (job.state) {
    case 'draft': {
      // 1) 参考图上传（若有）
      const ids = await mcp.createUploads(job.refs);          // rodin_create_uploads
      return log(job, { state: 'uploaded', upload_ids: ids });
    }
    case 'uploaded': {
      // 2) 提交：mode 决定调哪个工具
      const t = await mcp.submit({
        tool: job.mode === 'agentic' ? 'rodin_generate_agentic'
            : job.mode === 'bang'    ? 'rodin_generate_bang'
            :                          'rodin_generate',
        prompt: job.prompt,
        uploadIds: job.upload_ids,
      });
      return log(job, { state: 'submitted', task_uuid: t.uuid });
    }
    case 'submitted': {
      // 3) 轮询：2s → 4s → 8s 封顶，总超时 20min
      const s = await mcp.getStatus(job.task_uuid!);         // rodin_get_status
      if (s.status === 'failed') return fail(job, s.error);
      if (s.status !== 'done') return sleepBackoff(job);
      return log(job, { state: 'ready' });
    }
    case 'ready': {
      // 4) 取结果 → 立即下载 → 算哈希
      const r = await mcp.getResult(job.task_uuid!);         // rodin_get_result
      const dir = path.join(INCOMING, job.task_uuid!);
      await downloadAll(r.files, dir);
      await writeFile(path.join(dir, 'sha256.txt'), await hashDir(dir));
      return log(job, { state: 'downloaded' });
    }
    case 'downloaded': {
      // 5) QC：面数 / 非流形 / 包围盒 / 材质槽数（05A.4.4 第 1 项）
      const rep = await qc(dirOf(job));
      return log(job, rep.pass ? { state: 'qc' } : { state: 'rejected', last_error: rep.reason });
    }
    // qc → convert（05A.2.2 七步 + anchors）→ publish（写 manifest + provenance）
  }
}
```

**轮询参数**：`2 s → 4 s → 8 s`（8 s 封顶），单任务总超时 **20 min**；超时置 `rejected` 并附 `last_error.kind='net'`，**不自动重提**（重提等于重新计费，必须人工判定）。

**`rodin_wait` 何时可用**：只在交互式探索（「我现在就想看这个体块」）时用，单次上限 5 min。批量管线一律轮询——阻塞等待在 Node 里会占死连接，且拿不到中间状态做日志。

### 4.4 落库目录与写盘顺序

```
assets/
├─ _incoming/<task_uuid>/           # 原始输出，只读，git-ignored
│   ├─ raw.glb / raw.obj
│   ├─ textures/…
│   └─ sha256.txt
├─ _jobs/jobs.jsonl                 # append-only 事件日志（入库，git 跟踪）
├─ _jobs/<job_key>.lock             # 进程锁，防并发重复提交
└─ public/assets/<layer>/<assetId>/<assetVersion>/
    ├─ <assetId>_lod0_<hash8>.glb
    ├─ <assetId>_lod1_<hash8>.glb
    ├─ tex/<assetId>_bc_<hash8>.ktx2
    ├─ tex/<assetId>_orm_<hash8>.ktx2
    ├─ tex/<assetId>_n_<hash8>.ktx2
    ├─ manifest.json                 # 含 circuit.anchors（v1.2 新增）
    └─ provenance.json
```

写盘顺序不可调：**先写资产文件 → 再写 manifest → 最后 append 状态为 `published`**。反过来的话，崩在中间会留下「manifest 说有、文件没有」的幽灵资产，比缺资产更难查。

**【v1.2 变更】派生缓存目录（与 `assets/` 平行，不在其中）**：

```
public/derived/cl/<vmHash>/
├─ graph.json          # GraphIR，可从 manifest 重建
└─ svg/<pattern_version>.svg   # CL-0 预渲染，供 /circuit 与卡片导出
```

`vmHash = sha256(visual_seed | pattern_version | vm_version)` 前 12 位。此目录 **git-ignored、可重建、CDN `immutable`**。它不写 `manifest.json`、不写 `provenance.json`——派生数据没有 provenance，只有重建脚本。

---

## 5. 命名 / 版本 / 清单规范

### 5.1 命名

| 对象 | 规则 | 示例 |
|---|---|---|
| `assetId` | `<layer>_<object>[_<variant>]`，全小写，下划线分段，变体点分 | `twin_body_concept`、`world_step_module.a` |
| 文件名 | `<assetId>_lod<N>_<hash8>.glb` | `twin_body_concept_lod0_9f3c1a2b.glb` |
| 贴图 | `<assetId>_<bc\|orm\|n\|em>_<hash8>.ktx2` | `twin_body_concept_bc_9f3c1a2b.ktx2` |
| 目录 | `assets/<layer>/<assetId>/<assetVersion>/` | `assets/twin/twin_body_concept/1.2.0/` |
| 概念标注 | `manifest.stage` 枚举，**不可为空** | `concept` \| `cad` \| `derived` |
| **【v1.2 变更】CL 派生** | `derived/cl/<vmHash>/`，**不是资产，不进 `assets/`** | `derived/cl/8f3c1a2b9d04/` |
| **【v1.2 变更】`pattern_version`** | `CL-<2 位序号>`，只增不改 | `CL-00`（固定拓扑）、`CL-01`（首版 Seed 派生语法） |
| **【v1.2 变更】anchor id** | `n<N>` / `via<N>` / `hub` / `silk<N>`，在单资产内唯一 | `n00`…`n15`、`hub` |

`hash8` = 该文件内容的 sha256 前 8 位。**文件名带哈希**是为了让 CDN 缓存与「到底加载的是哪一版」这两个问题同时消失。

### 5.2 版本

`assetVersion = MAJOR.MINOR.PATCH`，语义只约束这三件事：

| 位 | 触发条件 | 后果 |
|---|---|---|
| MAJOR | 拓扑重做 / 换来源（concept → cad） | 缓存全失效，需重跑 05A.4 全套验收；**anchors 必须重落【v1.2】** |
| MINOR | 减面 / 重做 UV / 换 LOD 链 | 需重跑 LOD 剪影 IoU 检；**anchors 需复核偏移【v1.2】** |
| PATCH | 材质数值微调 / 修法线 | 仅需重跑 ΔE 检 |

**四条隔离**（前三条与 Web 规划 3.1 一致，第四条为 v1.2 新增）：

- `assetVersion` ≠ `engine_version`。换模型不得被读成「声音变了」。
- `assetVersion` ≠ `structure_hash`。资产与 Serial 无关，**任何资产不得由 `structure_hash` 派生版本号**——那会让「换 Serial」变成「换模型」。
- `provenance.rodin.task_uuid` ≠ `job_key`。前者是执行凭证（不可复用），后者是业务凭证（可去重）。
- **【v1.2 变更】`pattern_version` ≠ `assetVersion` ≠ `structure_hash` ≠ `visual_seed`**。四者互不派生：
  - `pattern_version` 是**语法族**（同一套节点/线路形态），跨 Serial 共享；
  - `visual_seed` 是**单个 Serial 的图形身份**；
  - `assetVersion` 是**网格资产**版本；
  - `structure_hash` 是**音乐结构**哈希，与上述三者全部无关。
  混用任一对，都会让「换个图案」被读成「换台机器」或「换个模型」。

### 5.3 `manifest.json`

```jsonc
{
  "asset_id": "world_core_sculpt",
  "asset_version": "1.2.0",
  "layer": "world",                 // twin | world | env
  "stage": "derived",               // concept | cad | derived  ← UI 标注的唯一来源
  "engine_min": "0.2.0",            // 允许加载该资产的最低 Web 版本
  "units": "m",
  "up_axis": "Y",
  "forward": "+Z",
  "pivot": "bottom-center",
  "bounds": { "x": 0.24, "y": 0.06, "z": 0.15 },
  "lods": [
    { "level": 0, "file": "world_core_sculpt_lod0_9f3c1a2b.glb", "tris": 20000, "switch": 0.18 },
    { "level": 1, "file": "world_core_sculpt_lod1_4a7e02c1.glb", "tris": 8000,  "switch": 0.06 },
    { "level": 2, "file": "world_core_sculpt_lod2_11b9d3f0.glb", "tris": 3000,  "switch": 0.015 },
    { "level": 3, "file": "world_core_sculpt_lod3_7c02aa91.glb", "tris": 900,   "switch": 0.0 }
  ],
  "materials": ["M_SERIAL_SmokedMetal", "M_SERIAL_MilkPolymer", "M_SERIAL_PrecisionSteel",
                "M_SERIAL_EmissiveAccent", "M_SERIAL_ScreenGlass"],
  "textures": { "bc": "…_bc_….ktx2", "orm": "…_orm_….ktx2", "n": "…_n_….ktx2" },
  "draw_calls": 9,
  "bytes_total": 5242880,
  "sha256": "<asset 目录树整体哈希>",

  // 【v1.2 变更】Circuit Language 锚点；无锚点时为 []，资产照常上线，只是不参与 CL
  "circuit": {
    "vm_version": "VM/0.1",
    "pattern_version": "CL-01",
    "anchors": [
      { "id": "n00", "p": [0.000, 0.031, 0.004], "n": [0, 0, 1], "role": "pad", "step": 0 },
      { "id": "n01", "p": [0.018, 0.031, 0.004], "n": [0, 0, 1], "role": "pad", "step": 1 },
      { "id": "hub", "p": [0.000, 0.060, 0.000], "n": [0, 1, 0], "role": "hub", "step": null }
    ]
  }
}
```

**`manifest` 是唯一真相源**。运行时**只读 manifest**，不扫目录、不硬编码路径。`stage === 'concept'` 时 UI 层必须渲染「CONCEPT ASSET / NOT PRODUCTION CAD」标注，且该标注**不参与任何降级**（见 6.3）。

**【v1.2 变更】`circuit` 块的三条规则**：

1. **可选**。缺失等价于 `anchors: []`，不报错、不阻塞加载。
2. **`pattern_version` 只是"该资产被设计给哪一族语法"，不是"运行时用哪一族"**。运行时用哪个 `pattern_version` 由 `visual_manifest` 决定；两者不一致时以 runtime 为准，仅记一次 warning。理由：资产是长期件，语法会迭代，不能让 8 个资产的 manifest 各写死一个语法版本。
3. **`anchors` 不参与 `sha256`（目录树哈希）的语义判断**，但包含在文件内容里。改锚点 = 改 manifest = manifest 自身哈希变 = CDN 刷新。这是想要的：锚点变了形态就变了。

### 5.4 `provenance.json`（可追溯，不是日志）

```jsonc
{
  "source": "rodin",
  "tool": "rodin_generate_agentic",
  "task_uuid": "…",
  "job_key": "…",
  "prompt": "<完整原文>",
  "prompt_rev": "p03",
  "mode": "agentic",
  "refs": [{ "name": "front.png", "sha256": "…", "upload_id": "…" }],
  "generated_at": "2026-12-02T10:14:00+08:00",
  "raw_sha256": "…",
  "pipeline": "05A.2.2/7-step",
  "operator": "…",
  "note": "不修 UV，直接重做",

  // 【v1.2 变更】视觉侧派生记录（不是生成物，是"这件资产被赋予了哪套语法"）
  "visual": {
    "vm_version": "VM/0.1",
    "pattern_version": "CL-01",
    "anchors_rev": "a01"
  }
}
```

没有 provenance 的资产**不得上架**。理由不是洁癖：Rodin 不可复现，provenance 是「这件东西从哪来」的唯一证据；出了视觉争议（撞形、疑似侵权），没有它就无法回溯。

**【v1.2 变更】`visual` 块只记"语法版本"与"锚点修订号"，不记 `visual_seed` 本身**。理由：一个资产会被所有 Serial 使用，把某一台的 `visual_seed` 写进资产 provenance 是范畴错误；单个 Serial 的派生结果由客户端缓存（`derived/cl/<vmHash>/`）承载，可随时重建。

### 5.5 `visual_manifest` 草案 schema【v1.2 变更】

> **状态：DRAFT。** 产品册 v1.2 §5.4 明确"正式 schema、散列/域分离方法和测试向量另行设计；目前不把某种算法当作已实现标准"。本节是内部开发用的最小可行形状，**不得对外作为规范引用**。

```jsonc
{
  "vm_version": "VM/0.1",          // schema 大版本；未知 → 回落 CL-00
  "pattern_version": "CL-01",      // 语法族；未知 → 回落 CL-00
  "domain": "SERIAL/visual/v1",    // 域分离标签，写进派生输入
  "nodes": [
    { "id": 0, "grid": [0.12, 0.50], "role": "pad" },
    { "id": 1, "grid": [0.24, 0.50], "role": "pad" },
    { "id": 2, "grid": [0.50, 0.18], "role": "hub" }
  ],
  "traces": [
    { "from": 0, "to": 2, "bend": 0, "layer": "silk" },
    { "from": 1, "to": 2, "bend": 2, "layer": "deco" }
  ],
  "density": 0.42,
  "palette": "smoked-milk-accent",
  "notes": "human-readable, ignored by clients"
}
```

字段约束：

| 字段 | 类型 | 约束 | 缺省 |
|---|---|---|---|
| `vm_version` | string | `VM/<MAJOR>.<MINOR>` | `VM/0.1` |
| `pattern_version` | string | `CL-<2 位>` | `CL-00` |
| `domain` | string | 固定 `SERIAL/visual/v1`；变更即换 domain 并升 MAJOR | 同左 |
| `nodes[].id` | int | 0–127，唯一 | — |
| `nodes[].grid` | [float, float] | 0–1 归一化，非世界坐标 | `[0.5, 0.5]` |
| `nodes[].role` | enum | `pad` \| `via` \| `hub` \| `silk` | `pad` |
| `traces[].from/to` | int | 必须指向存在的 `nodes[].id` | — |
| `traces[].bend` | int | −4…4，单位=网格格 | `0` |
| `traces[].layer` | enum | `silk`（常显）\| `deco`（随 gate 显隐） | `silk` |
| `density` | float | 0–1 | `0.42` |
| `palette` | enum | `smoked-milk-accent` \| `smoked-milk-accent-cool` | 前者 |

**未冻结部分（明确列出，避免被当成已定）**：① `visual_seed` 的派生是否用 HKDF 还是单次 SHA-256；② `structure_hash` 与 `visual_seed` 的域标签命名是否进入正式协议；③ 是否需要 golden vectors（本章建议需要，至少 3 组，与 S1 的 3 组对称）；④ `pattern_version` 的演进是否允许同一个 Serial 跨版本变化（本轮倾向：**允许，但 `visual_seed` 不变，仅语法解读变**）。

---

## 6. 性能预算与降级

### 6.1 预算表

**【v1.2 变更】整表重算。CL 单列，粒子行改为合计口径，Stage 场景本体 90 → 94。**

| 指标 | G1 | G2 Explore | G2 Connect | G3 Stage | 口径 |
|---|---|---|---|---|---|
| 首屏 JS（gzip） | ≤ 120 KB | ≤ 260 KB | ≤ 260 KB | **≤ 340 KB** | Web 规划 5.1；CL-1 +14 KB（shader 与编译器） |
| 首屏 GLB（首帧必需） | — | ≤ 1.5 MB | ≤ 1.5 MB | ≤ 1.5 MB | 指 LOD2 + 512 贴图 |
| GLB 全 LOD 全集 | — | ≤ 8 MB 桌面 / 4 MB 移动 | 同左 | ≤ 12 MB | 05A.2.2⑦ |
| 首屏纹理合计 | — | ≤ 12 MB | ≤ 14 MB | ≤ 16 MB | KTX2；**CL 不新增贴图** |
| 帧率 A / B / C | — | 60 / 60 / 30 | 60 / 45 / 30 | 60 / 45 / 30 | fps @1080p |
| 帧预算（60fps） | — | 16.6 ms | 16.6 ms | 16.6 ms | 见 6.2 拆分 |
| draw call（Twin 单资产） | — | ≤ 12 | ≤ 12 | ≤ 12 | **05A 口径** |
| draw call（场景本体） | — | ≤ 24 | ≤ 48 | **≤ 94** | 本文口径（含 CL） |
| ├ 其中 CL 自身 | — | 0 | 0 | **≤ 4** | **v1.2 新增第三口径** |
| draw call（整帧提交） | — | ≤ 120 | ≤ 120 | ≤ 200 | **Web 规划 5.1 口径** |
| 三角面（场景合计） | — | 30 k | 40 k | ≤ 150 k | 含实例；**【v1.2 变更】CL 另计 ≤ 4 k tris（8 k 顶点，全 quad、`side=FrontSide`）；CL 计入本行上限，不另设预算** |
| 粒子（单帧上限，**合计**） | — | 300 | 800 | **1,200（建议 声谱 900 + CL 300）** | 05A.4.3；**v1.2 变更：同一行内合计，不各算一份** |
| 后处理 pass 数 | 0 | 1 | 1 | ≤ 3 | — |
| CL 屏幕覆盖率 | — | 0 | 0 | **≤ 35%** | v1.2 新增；additive 层最容易在满屏上炸 |
| CL 自身 overdraw | — | 0 | 0 | **≤ 2×** | v1.2 新增；超过说明 trace 叠层失控 |
| GPU 显存 | — | ≤ 180 MB 移动 / 400 MB 桌面 | 同左 | 同左（**CL ≤ +1 MB**） | 含 render target |
| 音频 underrun | 0 | 0 | 0 | 0 | 全阶段铁律 |

**三套 draw call 口径的说明（必须同时写进验收脚本注释）**：05A 的 `≤ 12` 指 **Twin 单资产**（M1–M6 材质合并后的提交数）；Web 规划的 `≤ 120 / ≤ 200` 指 **整帧**（含后处理全屏 quad、UI 叠加层、天空/地面）；本章的 `24 / 48 / 94` 是「场景本体」——介于两者之间，用来卡住「场景越做越肥」而不误伤后处理。**【v1.2 变更】第三套：CL 自身 `≤ 4`，由 `renderer.info.render.calls` 的开关差值断言，不是目测。**

**整帧账（Stage，证明 94 与 200 不冲突）**：

| 组成 | 提交数 |
|---|---|
| 场景本体（含 CL 4） | 94 |
| 后处理全屏 quad（Bloom 4 级 mip + 合成 + Output） | 7 |
| 天空/背景（`renderer.clear` 不算 draw；若开背景球 +1） | 0–1 |
| UI 叠加层（DOM，不占 GPU draw） | 0 |
| **合计** | **101–102 ≤ 200** ✓ |

余量 98，足够容纳 Crack 瞬时的 chromatic aberration 与 DOF 的额外 pass。

### 6.2 帧预算拆分（60 fps，16.6 ms）

**【v1.2 变更】修正 v0.1 的算术错误**：v0.1 表为 CPU 5.0 + Twin 4.0 + World 8.0 + 后处理 3.0 + 余量 2.0 = **22.0 ms > 16.6 ms**。原表把不同体验的项放在一张表里相加，实际超配。v0.2 改为**按体验分表**，每表合计精确等于 16.6 ms（Stage 为绑定约束，Explore/Connect 留白）。

**Stage / tier A（绑定约束）**

| 项 | 预算 |
|---|---|
| CPU JS（R3F 更新、图遍历、CL uniform 上传） | 4.0 ms |
| World 渲染（Rodin 6 资产族 + 实例） | 5.5 ms |
| **Circuit Language（4 子层合计）** | **1.5 ms** |
| 后处理（Bloom + DOF + 染色） | 3.0 ms |
| 小计 | 14.0 ms |
| 余量 | **2.6 ms** |

**Explore / tier A**

| 项 | 预算 |
|---|---|
| CPU JS | 3.5 ms |
| Twin 渲染 | 4.0 ms |
| 后处理（Bloom only） | 2.0 ms |
| 小计 | 9.5 ms |
| 余量 | 7.1 ms（空窗，不必填满） |

**Connect / tier A**

| 项 | 预算 |
|---|---|
| CPU JS | 4.5 ms |
| Twin 渲染 | 4.5 ms |
| 后处理 | 2.0 ms |
| 小计 | 11.0 ms |
| 余量 | 5.6 ms |

**CL 的 1.5 ms 怎么花**：CL 是 fill-rate 约束不是顶点约束。按 1080p、覆盖率 35% 估：`CL_Traces` 0.5 ms + `CL_LightPath` 0.6 ms（条带更宽）+ `CL_Nodes` 0.2 ms + `CL_Particles` 0.2 ms。超了先砍顺序固定：粒子 → 光路宽度 → trace 密度 → 节点数量（**节点是最后砍的，它是结构语义本身**）。

**B / C 档**（45 / 30 fps → 22.2 / 33.3 ms）：按比例放宽，但 CL 的砍法不按比例——见 6.3。

### 6.3 降级矩阵

| 特性 | Tier A | Tier B | Tier C |
|---|---|---|---|
| DPR | `min(devicePixelRatio, 2)` | `1.5` | `1.0` |
| HDRI | 2K | 1K | 关闭（纯色环境 + 三灯） |
| 实时阴影 | 2048，PCFSoft | 1024，PCF | 关闭 |
| 法线贴图 | 开 | 开 | 关（仅 BaseColor + ORM） |
| 屏幕玻璃 transmission | 开 | 关（不透明黑 + 自发光） | 关 |
| Bloom | 全分辨率 | 半分辨率 | 关 |
| DOF | Stage 开 / Twin 关 | 关 | 关 |
| 粒子（声谱 + CL 合计） | 100% | 50% | 0 |
| **【v1.2 变更】CL 语法** | **全语法**（trace + 光路 + 节点 + 粒子） | **减 trace**（`density` 减半，粒子 0） | **只留节点**（trace/光路/粒子全关） |
| **【v1.2 变更】CL 节点** | 全部（≤128） | 全部 | **16 个 step 节点必留** |
| 后处理 | 全 | 部分 | 无 |
| 概念标注 | **必显** | **必显** | **必显** |

**降级规则**（沿用 Web 规划 5.3）：

- 判定在首帧后 2 s 内完成：A = 平均帧时间 < 12 ms；B < 22 ms；C ≥ 22 ms 或 WebGL context 创建失败。
- **只降不升**。运行中连续 60 帧超阈值降一档；升档需连续 10 s 达标。最多降 2 档，之后锁死并上报。
- **降档动作只改 renderer 状态**，不改 `AudioContext`、不改 `bpm`、不改 tick 源。降档在同帧完成，不分帧（分帧会产生闪烁）。
- **概念标注不可降级**。它是 §10「Rodin 概念误导买家」的工程对策；性能降级顺手关掉它，等于把合规防线关掉。

**【v1.2 变更】CL 的三条降级纪律**：

1. **CL 不能比粒子先砍完**。v1.2 §5.3 要求"低档设备保留音序结构可视化"；CL 的 16 个 step 节点**就是**那个可视化。C 档砍 trace 与光路，不砍节点。
2. **CL 降档不重建材质**。用 `material.visible` 与 `uDensity` 切换，不 `dispose()` 重建——重建会在同帧内产生编译停顿（stage 现场可见的卡顿）。
3. **CL 降档不改 `tick` 相位**。相位是 `f(tick)`，与 tier 无关；tier 变化不得让光路跳相位。

### 6.4 必须跑的四个性能测试

1. **60 s 录制**：桌面集显 + 一台中端 Android。统计帧时间 P95 与 GPU time；Twin 部分 GPU ≤ 4 ms（05A.4.4 第 4 项）。
2. **热降频测试**：移动端连续 3 min，末段帧时间相对首段退化 > 25% 判不通过。30 秒预览看起来顺、第 4 分钟开始掉帧，是移动端最常见的事故形态。
3. **舞台彩排 30 min**：`/stage` 连续运行，无 underrun、无内存增长（堆快照前后差 < 10%）。
4. **【v1.2 变更】CL 开关对照测试**：同 Seed、同机位、同 tier，`cl_enabled` on/off 各录 60 s，比对三项：
   - (a) 帧时间 P95 增量 ≤ **1.5 ms**（tier A）/ ≤ 2.5 ms（tier B）；
   - (b) `renderer.info.render.calls` 增量 ≤ **4**（tier A/B）/ ≤ **1**（tier C）；
   - (c) 同 Seed 的 `events` 序列与 `structure_hash` **完全不变**。
   (c) 是红线：它证明 CL 没有污染音乐流。这一项失败时，(a)(b) 通过也没有意义。

---

## 7. G2 面板首件验证 × 3D 门禁【v1.2 变更】

> 产品册 v1.2 §5.4 把「完成一张可制造的艺术面板 / PCB 版稿，至少做一件实物打样，并让 Web 3D 与 Serial Card 使用同一套节点/线路形态」放在 **G2** 设计验收；§9 把「PCB/面板 Art 制作首件验证」写进 G2 交付物。同时 §5.4 明确：**此验收与电路可靠性、光学效果、成本验证分开记录**。
> 本节只回答一个问题：**它和 3D 谁阻塞谁，什么明确不阻塞。**

### 7.1 依赖链（先有鸡还是蛋，怎么破）

```
[G2-W1..W2]  CL-0 形态稿 rev0（SVG 矢量语法 + KiCad 分层稿）
                    │  不阻塞
                    ▼
[G2-W3..W4]  1:1 面板打样（丝印 + 刻度 + 16-step 标记）
                    │  阻塞
                    ▼
[G2-W4]      叠合比对 → 形态冻结：pattern_version = CL-01
                    │  阻塞
                    ▼
[G3]         CL-1 定稿（Three.js 光路/粒子/雕塑）
```

**为什么不是"面板等 3D"**：形态稿是矢量的，2 天能出 rev0；打样要 2 周。让打样等 3D 定稿，等于把 G2 尾巴推到 G3。
**为什么不是"3D 等面板"**：CL-1 的 shader、编译器、性能压测全都可以用 `CL-00` 固定拓扑先做，不依赖形态冻结。
**唯一真正串行的接口**是「形态冻结」这一个点：面板实测（刻度可读、丝印清晰、装配无干涉）会反向修正形态，形态一旦冻结就进 `pattern_version`，CL-1 只消费已冻结版本。

### 7.2 阻塞矩阵

| 上游状态 | **阻塞** | **明确不阻塞** |
|---|---|---|
| 面板打样未过（DRC / 装配干涉 / 刻度不可读） | ① CL-1 的**形态定稿**；② `pattern_version` 冻结；③ G3 Stage 的 CL 验收 | ① Explore / Connect 场景（与 CL 无关）；② 8 个 Rodin 资产的转换与 05A 验收；③ 音乐事件、`structure_hash`、golden vectors；④ CL-1 的**技术预研**（用 CL-00 跑管线、压测、写 shader）；⑤ Serial Card 印制（G2 卡面用 CL-00 固定语法即可）；⑥ 音频 / 固件 / Link 协议 |
| `visual_manifest` schema 未冻结 | ① CL-1 的正式接入（strict parser）；② Serial Card 的"按 Seed 生成图案"（v1.2 §7 本就列为后续） | ① CL-0 / CL-1 用 `VM/0.1` 草案的开发版接入（§2.5.6 容错路径）；② 面板打样（形态不依赖 schema，只依赖 Graph IR）；③ G2 全部验收项 |
| CL-1 未完成 | G3 Stage 的完整视听验收（v1.2 §9 G3 含"优质 Three.js 视听演出界面"） | ① G2 任何交付物；② 面板首件验收；③ Serial Card；④ Rodin `world_*` 资产制作（可先做完等 CL） |
| 某个 Rodin 资产缺 anchors | 该资产参与 CL 的能力（`manifest.circuit.anchors=[]` 时跳过） | ① 该资产本身的几何渲染与 05A 验收；② 其余资产的 CL；③ CL-0（锚点是 3D 侧概念，CL-0 用归一化网格） |
| G1 未达门槛 | G2 全部（v1.2 §9 前置条件） | — |

### 7.3 四项证据分离（照 v1.2 §5.4 原文，不许合并）

| # | 证据 | 验收物 | 通过判据 |
|---|---|---|---|
| E1 | **电气 / 可制造性** | KiCad DRC 报告、板厂工艺确认单 | 最小线宽/间距/开窗/装配干涉全部通过；**装饰图不得被误认为真实走线**（人工审一遍） |
| E2 | **光学 / 可读性** | 1:1 实物照片 + 现场识别测试 | 旋钮刻度可读；16-step 状态在正常观看距离可辨；丝印在烟熏底色上对比足够 |
| E3 | **成本 / 工艺产出率** | 打样报价 + 良率说明 | 单板成本落在 G3 预算假设内 |
| E4 | **形态一致性** | CL-0 与面板 1:1 叠合图 + 偏差量测 | 节点中心偏差 ≤ 0.3 mm；线宽偏差 ≤ 0.1 mm；16-step 节点与刻度同轴偏差 ≤ 0.2 mm（**阈值待与板厂工艺能力对齐后定稿，当前为建议值**） |

**E4 通过不能替代 E1/E2/E3**。产品册 v1.2 原文要求"分开记录"，本章照办：四份证据分别存档，任一份不通过都单独记录，不打包成一个"面板通过"。

**E4 的工具归属**：比对工具（1:1 缩放 + 偏差量测）是 CL-0 的配套件，1 人日，G2 交付（§3.3 人日表已列）。没有它，E4 只能靠肉眼，等于没有 E4。

### 7.4 形态冻结的三个硬条件

`pattern_version` 从 `CL-00`（固定拓扑）升到 `CL-01`（Seed 派生语法），必须同时满足：

1. E1 与 E2 通过（E3 可挂账，E4 必需）。
2. CL-0 与面板叠合偏差在 E4 阈值内。
3. **CL-1 用 `CL-00` 跑通全链路**——证明管线不依赖具体语法。否则冻结的是一张图，不是一个系统。

第 3 条容易被跳过，代价最大：形态一冻结就要改 shader 与编译器，如果这时才发现管线耦合了 `CL-00` 的具体节点数，返工的是整个 CL-1。

---

## 8. 风险点

> 本节只列**新增**风险。产品册 §10 与 Web 规划 §8 已覆盖的不重复，仅在需要补工程手段时引用。**【v1.2 变更】R13–R19 为新增。**

| # | 风险 | 触发信号 | 影响 | 对策 |
|---|---|---|---|---|
| R1 | **Rodin 不可复现被当成可复现** | 有人「再生成一次看看会不会更好」 | provenance 断裂、验收基线漂移、重复计费 | 生成物入 `_incoming` 即冻结；改 prompt 必须升 `prompt_rev`；`published` 资产禁止重生成，只能升 MAJOR 版本 |
| R2 | **概念件被当 Twin** | 页面出现 `stage: "concept"` 但无标注 | §10 诚实性风险直接爆 | `manifest.stage` 为必填枚举；CI 断言「`stage='concept'` 的资产在 UI 层必须存在标注节点」；标注不参与降级（6.3） |
| R3 | **异步链在 CI 里不可跑** | CI 依赖真实 Rodin 服务 | 外部服务抖动 = 全组红；无法离线复现 | 录制 fixture：`_fixtures/<job_key>/{status.json, result.json, raw.glb}`；CI 只跑 `MockRodinClient` |
| R4 | **重复提交导致重复计费** | 重启后任务重跑 | 预算失守 | `job_key` 幂等 + `<job_key>.lock` 文件锁；`submitted` 及之后状态不自动重提 |
| R5 | **下载 URL 过期被误判为任务失败** | `get_result` 返回 403/过期 | 重新生成 = 拿不到同一个模型 + 二次计费 | URL 过期一律重调 `rodin_get_result`（用 `task_uuid`），**不重生成** |
| R6 | **无 LOD / 无 UV 的生成物直奔线上** | 首帧卡顿、贴图串色 | 05A 全套验收失效 | 状态机强制卡 `qc` 闸门；不过检不得进 `converted` |
| R7 | **跨体验对象复用导致参数污染** | Stage 的 Bloom 参数出现在 Explore | 画面失控且难复现 | `experience` 变化时 `SceneRoot` 换 key + 全量 `dispose()`；禁止跨体验共享 material 实例（共享**定义**，不共享**实例**） |
| R8 | **主光被「音乐驱动」改掉** | Connect 场景主光方位随参数摆动 | 05A.4.2 的 ΔE 与控件位置验收在同一会话内不可复现 | 主光方向写进常量并加类型级 `readonly`；可变项白名单只有 emissive / 轮廓光色温 / 雾密度 |
| R9 | **投影仪/外接屏色偏** | 现场投出来偏绿或发灰 | Stage 观感崩塌，且无法现场调 | 演出前 15 min 校准流程：灰阶 + 白点截图，按 ΔE 调 `toneMappingExposure` 与输出 LUT；LUT 随 `/stage` 打包，不走运行时上传 |
| R10 | **移动端热降频** | 首 30 s 顺、第 4 min 掉帧 | 预览体验断崖 | 6.4 第 2 项测试为门槛项；tier B 移动端默认关阴影与 DOF |
| R11 | **`hash8` 与 CDN 缓存策略冲突** | 换资产后用户仍看旧模型 | 「改了没生效」类误判，浪费排查时间 | 文件名带内容哈希 → 内容变则文件名变；`manifest` 本身设 `max-age=60`，资产设 `immutable` |
| R12 | **Rodin 产出与既有设计撞形** | 视觉比对发现与某产品高度相似 | 商用法律风险 | 概念用途先不追；转正式资产前做一次反向图搜 + 法务确认；`stage: 'concept'` 不进入销售物料 |
| **R13** | **视觉流污染音乐流** | 改 `density` 后 `structure_hash` 变了 | 「Same Serial → Same Musical Structure」承诺当场失效，且是隐性失效（画面变了没人想到去查哈希） | 域分离 `visual_seed`；`src/visual/**` 禁 import `src/music/**`；禁 `Math.random`；§2.5.5 的 12 组黄金测试进 CI，任一组不等即构建失败 |
| **R14** | **CL 过绘制拖垮 Stage** | additive 层在满屏时帧时间暴涨、移动端首 30 s 就掉帧 | 舞台事故；且很难定位到"是那几条线干的" | 屏幕覆盖率 ≤ 35%、overdraw ≤ 2× 写进预算（6.1）；§6.4 第 4 项对照测试卡 1.5 ms 增量；超了按固定顺序砍（粒子→光路宽→trace 密度→节点） |
| **R15** | **CL 的 drawcall 失控** | 每条 trace 一个 mesh，或每个节点一个 Mesh | 场景本体从 94 涨到 200+，整帧口径跟着破 | 4 子层必须合并/实例化；`renderer.info` 开关差值断言 ≤ 4；超 4 即视为"没合并"，禁止以"CL 本来就复杂"结案 |
| **R16** | **面板返工连带形态重设计** | G2 末打样失败 → 改节点布局 → CL-1 已完成的光路全部返工 | G3 排期崩，且返工量不可估 | §7.3 的 E4 比对工具前置；CL-1 严禁在形态冻结前写死节点数/布局；用 `CL-00` 打通全链路作为冻结前置条件（§7.4 第 3 条） |
| **R17** | **CL 语法在三个媒介各写一套** | 面板一种节点布局、卡面另一种、3D 又一种 | G2 的「同一套形态」验收变成三张图各说各话，v1.2 §5.4 的设计语言承诺落空 | 单一 Graph IR + 两个 Adapter（SVG / Geometry）；`pattern_version` 全局唯一；三端渲染必须引用同一 `vmHash` 的 `graph.json` |
| **R18** | **概念面板被 CL 美化后误导买家** | Twin 概念件表面出现"电路丝印"效果 | 直接踩 §10「Rodin 概念误导买家」+「PCB Art 破坏功能或抬高成本」 | Twin 层禁 CL（§2.5.4）；`stage='concept'` 时 `/circuit` 页也加「形态稿，非实物」标注 |
| **R19** | **`visual_manifest` 被当成已冻结标准对外引用** | 对外材料写"我们的视觉由 visual_manifest 驱动" | 与 v1.2 §5.4「不把某种算法当作已实现标准」冲突；一旦被外部依赖，改不动 | 代码里 `vm_version` 保持 `0.x`；README 标 `draft`；对外材料只描述设计方向，不写字段名与版本号 |

---

## 9. 与其他章节的接口

| 章节 | 接口 |
|---|---|
| §02.1 三种体验 | 第 2 章逐体验给出场景结构；体验定义本身不改 |
| §05.3 技术取舍 | 第 2 章的后处理与降级在 WebGL2 路线上闭合；WebGPU 仍为可选实验 |
| **§05.4 PCB Art / Circuit Language【v1.2】** | **§2.5 是其 Three.js 侧的完整落地；§5.5 是其 `visual_manifest` 草案；§7 是其 G2 门禁关系** |
| §06 Link 契约 | CL 只读 `transport.tick` 与 `events[].gate`，不写回、不发 `edit_request` |
| §07 Serial Card | CL-0 与卡面共用 Graph IR；卡面按 Seed 生成图案属**后续项**，G1 用固定简洁卡面 |
| §08 G1 | 第 1 章明确 G1 = 0 资产、0 场景代码、0 PCB 工作；只落 `manifest.schema.json` |
| §09 G2/G3 | G2 = 2 个 Twin 资产 + 两场景 + **CL-0 + 面板首件**；G3 = 6 个 World 资产族 + Stage + **CL-1** |
| §10 风险 | R2 / R12 / R18 是「Rodin 概念误导买家」的工程落地；R13 是「双端生成结果分叉」在视觉侧的防线 |
| 05A.2.2 七步 | 第 4.2 状态机的 `convert` 阶段**即** 05A.2.2 七步，不另立流程；v1.2 追加 anchor 落点，但不阻塞 `converted` |
| 05A.4.4 验收 | 第 4.3 的 `qc` 阶段 = 05A.4.4 第 1 项「资产入库检」 |
| 05A.4.2 ΔE | **ΔE 验收时 CL 必须整层关闭**（§2.5.3），否则基线不可复现 |
| Web 规划 3.1 | 第 5.2 的版本隔离与其一致，v1.2 追加第四条隔离 |
| Web 规划 5.1 | **需回写修正**：draw call 整帧口径不变（120/200），但场景本体上限从 90 改为 94，需同步 |
| Web 规划 6.3 | **需回写修正**：G2「资产管线 3.0 人日」只含管线代码，不含逐资产转换（本文 3.3 已单列）。**v1.2 追加：G2 三维侧 11–12 人日、G3 三维侧 32–38 人日** |

---

## 10. 待确认（需产品或硬件侧拍板）

1. **CAD 可用时间点**。它决定 `twin_body_concept` 是「G2 必需的过渡资产」还是「可以跳过」。若 CAD 在 G2 开始前可用，本章 G2 资产从 2 件降到 1 件（只留 `twin_card`）。
2. **Rodin MCP 的实际 `inputSchema`**。本文的 `mode` / `uploadIds` / `files` 均为语义命名，落地前必须逐字段核对一次，并写进 `tools/rodin-pipeline/README`。
3. **Rodin 的配额与并发上限**。直接决定 `_jobs` 的并发度（当前假设 2）与 G3 的 15 个网格的排期。
4. **`world_core_sculpt` 是否需要顶点动画**。若需要（Crack 时形变），4 人日的重拓扑预算不够，需 +2 人日做可形变拓扑。
5. **`/stage` 的现场分辨率与投影比例**。它决定 Stage 的 fov 与 DOF 强度，也决定 R9 的 LUT 是否要按场地出多份。
6. **【v1.2 新增】`visual_manifest` 的冻结时机**。本章按「G2 结束前只到 `VM/0.x`，G3 中期冻结 `VM/1.0`」排；若产品侧希望更早冻结，则 §2.5.6 的容错层可以在 G2 就切 strict，但需要先在 G2 拿出至少 3 组 golden vectors。
7. **【v1.2 新增】面板选定板厂的工艺能力**。§7.3 E4 的三个偏差阈值（0.3 / 0.1 / 0.2 mm）是建议值，必须以选定板厂的**最小线宽、丝印套准精度、开窗公差**为准重算；板厂未定则 E4 不可执行。
8. **【v1.2 新增】CL 形态冻结的责任人**。产品册 v1.2 把 PCB Art 定义为"横跨三者的工业设计与视觉识别语言"，那它就不是纯 3D 侧能拍的。谁签 `pattern_version = CL-01`，需要在 G2 开始前明确——否则 §7.4 的冻结会变成"没人敢签，于是永远用 CL-00"。
9. **【v1.2 新增】Serial Card 的 2D 渲染器归属**。CL-0 的 SVG Adapter 与卡面设计工具是同一套还是两套？若同一套，G2 的 4 人日里有 1 人日应划给卡面组；若两套，`pattern_version` 的"同一套形态"验收需要额外做一次双端比对。

---

## 附录 A：`visual_manifest` 派生伪代码（DRAFT，不外引）

```ts
// 域分离：与音乐 PRNG 完全无关
const visualSeed = sha256(`SERIAL/visual/v1|${engineVersion}|${seed}`).slice(0, 16);

// 纯函数：同输入必同输出，无 Date.now / Math.random / performance.now
function expand(visualSeed: Uint8Array, patternVersion: string): VisualManifest {
  const rng = xoshiro128starstar(visualSeed);        // 独立流，与 PCG32 无关
  const tmpl = PATTERN_TEMPLATES[patternVersion] ?? PATTERN_TEMPLATES['CL-00'];
  return tmpl.expand(rng);                            // 节点数、bend、layer、density 全部来自模板 + 独立流
}

// 纯函数：manifest + anchors → 拓扑图（三端共用）
function compile(m: VisualManifest, anchors: Anchor[]): GraphIR {
  const nodes = m.nodes.map((n, i) => ({ ...n, anchor: anchors[i] ?? null }));
  const edges = m.traces.filter(t => nodes[t.from] && nodes[t.to]);
  return { nodes, edges, density: clamp01(m.density), palette: PALETTES[m.palette] ?? PALETTES.default };
}
```

**注意**：`xoshiro128**` 只是示例，不是标准。正式选型前必须先定 `visual_seed` 的域标签与散列方式——这是 §10 第 6 项的待确认内容。
