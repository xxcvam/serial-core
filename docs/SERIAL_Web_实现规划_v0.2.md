# SERIAL Web 端实现规划（v0.2）

> 版本：v0.2 / 2026-11-09。v0.1（`SERIAL_Web_实现规划_v0.1.md`）原件保留，未被覆盖。
> 依据：`SERIAL_Product_Book_v1.2_2026-11-09.docx` 全文（v1.2）。凡产品册标注"拟议/待冻结/未验证/草案"的内容，本文同样标注，不作升级。
> 适用范围：SERIAL Web 3D 界面（Explore & Preview / Connect & Perform / Hardware-led A/V）。
> 与 G1 冻结口径的关系：G1 仍为 12 人日（协议 3 + Web 4 + 卡/埋点 2 + 现场 2 + 判读 1），**v1.2 不向 G1 增加一克范围**。PCB Art 与 visual_manifest 全部落在"仅文档 / G2 / G3"三档，不进 G1。

---

## 变更对照表（v0.1 → v0.2）

| # | v0.2 位置 | v0.1 位置 | 变更内容 | 性质 |
| --- | --- | --- | --- | --- |
| 1 | §0 结论先行 | §0 | 结论表新增三行：`visual-core` 独立包、Circuit Language 渲染层、浏览器不产出制造数据 | 【v1.2 变更】 |
| 2 | §1.1 选型表 | §1.1 | 新增 `visual-core`（纯 TS、无 DOM、独立 PRNG 实例）；哈希用 `crypto.subtle`/`node:crypto`，不引第三方 hash 库 | 【v1.2 变更】 |
| 3 | §1.2 明确不选 | §1.2 | 新增三条不选：浏览器内生成 Gerber/KiCad 文件、AI 网格直接当 CAD/PCB、位图当卡片母版 | 【v1.2 变更】 |
| 4 | §1.3 支持矩阵 | §1.3 | 新增两行：visual_manifest 渲染（全平台 ✅）、PCB 制造导出（全平台 ❌，不提供） | 【v1.2 变更】 |
| 5 | §2.1 / §2.3 | §2.1 / §2.3 | 无新增路由；`/about` 增补"设计语言与制造边界"说明段；Archive 态"导出卡面"明确为 G2 且仅出评审稿 | 【v1.2 变更】 |
| 6 | §3.1 资产边界 | §3.1 | 由"两层"改为"**三层**"：Physical Twin / Generative World / **Circuit Language Layer**（程序化，无 GLB） | 【v1.2 变更】 |
| 7 | §3.2 场景结构 | §3.2 | `<SceneRoot>` 增加 `<CircuitLayer />`，并声明它是 `visual_manifest` 的唯一三维消费者 | 【v1.2 变更】 |
| 8 | §3.3–3.5 契约 | §3.3–3.5 | **不改**。`SERIAL-LINK/0.1` 零字段变更，`Snapshot` 不含任何视觉字段（理由见 §4.6） | 【保留】 |
| 9 | §4（全新章） | — | visual_manifest 的前端落位：定位、派生契约、四道隔离闸、类型草案、渲染入口、演进策略 | 【v1.2 变更】新增 |
| 10 | §5（全新章） | — | PCB Art / Circuit Language 的前端边界：KiCad/SVG/Fusion 分层职责、评审稿纪律、可读性与无障碍硬指标 | 【v1.2 变更】新增 |
| 11 | §6.1 Store 分片 | §4.1 `visual` 分片 | `visual` 分片扩写：持 manifest 引用 + motifVersion + 渲染后端 + 降级态；manifest 与 score 同批 adopt | 【v1.2 变更】 |
| 12 | §7.1 预算 | §5.1 | 新增四行预算：manifest ≤ 8 KB（gzip）、评审稿 SVG ≤ 120 KB、Circuit Layer draw call ≤ 24、派生耗时 ≤ 8 ms | 【v1.2 变更】 |
| 13 | §8.1 目录 | §6.1 | 新增 `packages/visual-core`、`apps/web/src/features/circuit`、`tools/visual-ref` | 【v1.2 变更】 |
| 14 | §8.2 里程碑 | §6.2 | 新增 G2-c（Circuit Language 渲染 + 卡面评审稿），G1 里程碑 M0–M3 一字未改 | 【v1.2 变更】 |
| 15 | §8.3 工作量 | §6.3 | G1 新增"零影响核验表"（12 项全不变）；G2 由 13.0 → **20.5** 人日，G3 由 16.0 → **21.5** 人日（非承诺估算） | 【v1.2 变更】 |
| 16 | §9 代码骨架 | §7 | 新增 9.4（派生）、9.5（渲染器接口）、9.6（隔离测试）、9.7（评审稿导出）；原 7.1–7.3 顺延为 9.1–9.3，原 7.4（R3F 逐帧直写）并入 9.5，原 7.5 顺延为 9.8 | 【v1.2 变更】 |
| 17 | §10 风险 | §8 | 新增 8 行风险（含"视觉改动反噬 structure_hash""浏览器 SVG 被当制造数据""频闪"） | 【v1.2 变更】 |
| 18 | §11 待确认 | §9 | 新增 5 项（schema/motifVersion/visualSeed 位宽/卡面归属/板厂工艺口径） | 【v1.2 变更】 |

**章节映射（v0.1 → v0.2）**：0→0、1→1、2→2、3→3、4→6、5→7、6→8、7→9、8→10、9→11。

### 决策台账

| 决策 | 出处 | v0.2 处置 |
| --- | --- | --- |
| G1 不引入 three.js（构建期断言 chunk 不含 three） | v0.1 §1.2 / §5.2 | **保留，不动** |
| AudioWorklet 作时钟，rAF 只驱动画面 | v0.1 §7.3 | **保留，不动** |
| 只承诺 Chromium 桌面 Web Serial + 局域网 WebSocket | v0.1 §1.3 | **保留，不动** |
| `/play`、`/stage` 未连接不得白屏，降级只读预览 | v0.1 §2.1 | **保留，不动** |
| 硬件是 transport 与参数权威，网页只读订阅 + 受控回传 | v0.1 §0 / §2.3 | **保留，不动** |
| `SERIAL-LINK/0.1` 字段以产品册 6.2 为准，未冻结 | v0.1 §3.4 | **保留，且 v1.2 未新增字段** |
| visual 派生从版本 + Seed 出发，与音乐 PRNG 流隔离，绝不改 structure_hash | v1.2 §5.4 | **新增，落到 §4** |
| 浏览器只出评审稿，不出 Gerber/KiCad/Fusion 文件 | v1.2 §5.4 制造纪律 | **新增，落到 §5** |
| G1 不增加 PCB Art 与复杂 3D，仍 12 人日（Web 4） | v1.2 §8 / §12 | **新增为硬约束，落到 §8.3 零影响核验表** |

---

## 0. 结论先行

| 结论 | 内容 |
| --- | --- |
| 技术栈 | Vite + React 18 + TypeScript；three.js + @react-three/fiber；原生 WebAudio（AudioWorklet 提供时钟）；Zustand 分片状态；Zod 做契约运行时校验 |
| 渲染分层 | G1 用 Canvas 2D/SVG 做 hash 派生静态视觉；G2 起引入 R3F，Physical Twin 用 GLB，Generative World 用程序化几何 + GLSL |
| 视觉派生 | **【v1.2 变更】**新增 `visual-core`：`(engineVersion, seed) → visual_seed → visual_manifest`，独立 PRNG 实例，与 `s1-core` 零共享状态。它是 G2 起的第三层视觉（Circuit Language），不是 G1 的一部分 |
| 时钟 | 音频（或硬件）时钟权威。`requestAnimationFrame` 只驱动画面，绝不驱动音序 |
| 状态权威 | Offline Hardware / Unconnected Preview / Connected Performance 三模式；连上后硬件是 transport 与参数的权威，网页只读订阅 + 受控回传 Edit Request |
| 契约 | `SERIAL-LINK/0.1`（草案）。传输层抽象为 `Link` 接口：WebSerialLink / WebSocketLink / MockLink 三实现。**【v1.2 变更】**协议零变更：visual_manifest 不上线，本地派生 |
| 硬约束 | iOS Safari 无 Web Serial；连接失败不得影响实体演奏；不把概念渲染当现货展示。**【v1.2 变更】**浏览器不产出可制造数据；视觉派生不得触碰 `structure_hash` |

---

## 1. 技术栈选型与理由

### 1.1 选型表

| 层 | 选型 | 版本基线 | 理由（含反面） |
| --- | --- | --- | --- |
| 构建 | Vite | 5.x/6.x | 冷启动与 HMR 快；G1 只需静态产物上 CDN，不需要 SSR。Next.js 在"无后端、无 SEO 强需求、纯客户端音频"场景下是净负担 |
| 框架 | React + TypeScript | React 18，TS 5.x | R3F 生态绑定 React；TS 是契约层（`SERIAL-LINK` 消息）可校验的前提 |
| 3D | three.js（WebGL2 优先） + @react-three/fiber + @react-three/drei | three 0.16x | 文档 5.3 已指定 Three.js/WebGL2 路线；R3F 只解决"场景对象如何随应用状态组织"，性能关键路径仍直写 three 对象与 uniform |
| 后处理 | @react-three/postprocessing（G3） | — | 仅在 tier A 设备启用；低端直接关掉 |
| 音频 | 原生 WebAudio + AudioWorklet | — | 30 秒事件调度需要样本级精度；Worklet 提供独立线程时钟。**不用 Tone.js 作为时钟来源**：其 Transport 依赖主线程调度，页签后台会被节流 |
| **视觉派生** | **`visual-core`（纯 TS 包，自研）** | **SERIAL-VISUAL/0.1** | **【v1.2 变更】**必须是独立包而不是 `s1-core` 的一个函数：包边界是隔离随机数消耗顺序唯一可靠的强制手段（§4.3）。反面：塞进 `s1-core` 后，任何"加一个视觉字段"的改动都可能改变 draw 顺序，`structure_hash` 静默漂移，而三组 Golden Vectors 只覆盖旧路径 |
| **哈希** | **`crypto.subtle`（浏览器）/ `node:crypto`（测试）** | — | **【v1.2 变更】**只为派生调一次，不进逐帧路径，异步可接受；不为此引入第三方 hash 库（多一个依赖就多一条供应链与体积成本） |
| 参数/校验 | Zod | 3.x | 契约字段未冻结，运行时校验 + 类型推导一份定义两处用 |
| 状态 | Zustand（含 subscribeWithSelector） | 4.x/5.x | 需要"React 外读取 + 细粒度订阅"；Redux 的 action/reducer 样板对 5 个 store 分片是负收益 |
| 路由 | react-router-dom | 6.x/7.x | 页面数 < 8，数据路由能力用不上；深链 `/s/:serial` 与扫码落地 `/c/:cardId` 是主要需求 |
| 样式 | Tailwind + CSS 变量 token | — | token 固化艺术指导色（深黑/烟熏金属/乳白/荧光），避免散落硬编码 |
| 测试 | Vitest + Playwright | — | Golden Vectors 回归用 Vitest；iOS Safari / 微信内置浏览器只能靠 Playwright + 真机补测 |
| 埋点 | 自建事件 SDK（`umami` 或轻量 fetch） | — | G1 的判读口径（扫码率、听完率、退款率）要求事件字段与 `events.csv` 一致，不能依赖第三方黑盒归因 |

### 1.2 明确不选

| 不选 | 原因 |
| --- | --- |
| WebGPU 作为主路径 | 文档 5.3：可评估，但必须有降级，且不得成为硬件连接的阻塞条件 |
| Unity / WebGL 导出包 | 体积（≥5MB 起）与 G1 的单页预算冲突；且无 UI 复用价值 |
| SSR / 服务端渲染 | G1 无后端；且音频与 WebGL 都在客户端，SSR 只增加一套构建 |
| 云端账号体系 | 文档 7：G1 不做账号社交、交易市场或复杂后端 |
| **浏览器内生成 Gerber / .kicad_pcb（【v1.2 变更】）** | **前端无法做 DRC、无法算铜层间距与阻焊开窗、无法保证可制造性。浏览器出的任何"PCB 图"都只是外形示意，一旦被当作制造输入就是事故。权威几何只在 KiCad 工程内** |
| **AI 生成网格直接当 CAD / PCB（【v1.2 变更】）** | **产品册 §5.4 明令：Rodin 只辅助造型参考。前端若消费这种网格，必须带"概念"标记且不得进入面板/结构验收** |
| **位图当卡片母版（【v1.2 变更】）** | **卡面要 1:1 打样对照与后续工艺对齐，必须矢量（SVG）单一母版；位图无法核尺寸、无法给板厂** |

### 1.3 浏览器支持矩阵（必须写进落地页，不能只写在文档里）

| 能力 | Chrome/Edge 桌面 | Safari 桌面 | iOS Safari | Android Chrome | 微信内置 |
| --- | --- | --- | --- | --- | --- |
| G1 预览（WebAudio + Canvas） | ✅ | ✅ 16.4+ | ✅ 需用户手势解锁音频 | ✅ | ⚠️ 需实测（音频自动播放策略差异） |
| G2 Web Serial | ✅ 89+ | ❌ | ❌ | ❌ | ❌ |
| G2 局域网 WebSocket | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| G3 高级渲染（tier A） | ✅ | ⚠️ 需实测 | ⚠️ | ⚠️ | ❌ |
| **visual_manifest 渲染（Canvas 2D / SVG）（【v1.2 变更】）** | **✅** | **✅** | **✅** | **✅** | **✅**（纯矢量/2D，无 WebGL 依赖） |
| **PCB / 面板制造导出（【v1.2 变更】）** | **❌ 不提供** | **❌** | **❌** | **❌** | **❌** |

结论：**连接能力只承诺 Chromium 桌面 + 局域网 WebSocket 两条路径**，其余一律显示"仅预览"。iPhone 用户必须仍能完成 G1 的全部动作。

---

## 2. 页面与路由结构、核心交互流程

### 2.1 路由表

| 路径 | 页面 | 阶段 | 说明 |
| --- | --- | --- | --- |
| `/` | Explore 落地页 | G1 | Serial 输入框（16 hex）、阶段声明横幅、支持矩阵、开始按钮 |
| `/s/:serial` | Player（试听） | G1 | 深链入口，扫码与分享都落到这里；`serial` 非法时就地纠正 |
| `/c/:cardId` | Serial Card 落地 | G1 | 解析卡号 → 归因参数 → 重定向 `/s/:serial?src=card` |
| `/play` | Connect 工作台 | G2 | 设备握手、快照、transport 订阅、参数镜像 |
| `/stage` | 演出视觉 | G3 | 全屏、无 chrome、快捷键/OSD 可隐藏 |
| `/about` | 产品与阶段说明 | G1 | 明确"未完成样机 / 非上市商品"、概念资产标注 |
| `*` | 404 | G1 | 回 `/` |

路由守卫只有一条硬规则：**`/play` 与 `/stage` 在未连接时不得白屏**，降级为只读预览并显示连接状态徽标。

**【v1.2 变更】三条补充（不新增路由）：**

1. `/about` 增加一节"设计语言与制造边界"：说明 PCB Art 是横向设计语言、首批量产 PCB 使用统一电路与丝印、Web 与卡片图形按 Seed 派生而实体板不逐台定制。这句话必须写在用户可见处，不能只写进内部文档——它直接防"我的板子应该长得跟网页一样"的争议。
2. 卡面图形**不进路由**。G1 仍是固定简洁卡面；G2 起的 Seed 驱动卡面在 Archive 态生成，不占用独立页面。
3. Archive 态"导出卡面"标注为 **G2 能力**，且导出物是**评审稿**（§5.3），不是印刷/制板文件。

### 2.2 体验状态机（对齐文档 5.2 的 Locked → Generate → Perform → Crack / Archive）

```
Locked ──输入 Serial / 扫码──▶ Generate ──生成完成──▶ Perform
   ▲                              │                    │
   │                              │                    ├─按住 Crack ─▶ Cracked（松开回 Perform）
   └──────── 清空 / 非法输入 ──────┘                    └─分享/落卡 ─▶ Archive
```

状态机落在 `session` store，不散落在组件里。每个状态对应一组可用交互：

| 状态 | 可用 | 不可用 |
| --- | --- | --- |
| Locked | 输入、扫码、读支持矩阵 | 播放、参数 |
| Generate | 进度、取消 | 参数（避免生成中被写脏）。**【v1.2 变更】**此时并行派生 visual_manifest，失败不阻断 Generate |
| Perform | 播放/停止、参数、Crack、分享 | 改 Seed（改 Seed 即回 Generate） |
| Cracked | 全部 + 冻结视觉 | 改 Seed |
| Archive | 复制链接、导出卡面（G2，评审稿） | 演奏 |

> **【v1.2 变更】**Generate 的完成条件不变（Score 就绪即可播放）。visual_manifest 是**旁路产物**：派生失败 → 降级为 v0.1 的 hash 派生配色 + 无节点/线路层，埋点记 `visual_degraded`。理由：视觉不能成为"能不能听"的前置条件，这与"连接失败不影响演奏"是同一条原则。

### 2.3 核心交互流程（按阶段）

**A. 购买前｜Explore & Preview（G1，无硬件）**

1. 输入 16 位 hex 或扫码进入 `/s/:serial`。
2. 本地校验：长度 16、字符集 `[0-9A-Fa-f]`、校验字符（若 S1 校验位已冻结；未冻结则仅做长度/字符集校验并标注"草案版本"）。
3. 调 `s1-core`：`seed → PCG32 → 16-step events → structure_hash`。全程同步、无网络。
4. 首次点击"生成"时创建/恢复 `AudioContext`（iOS 要求用户手势）。
5. 播放 30 秒；`structure_hash` 驱动静态视觉（色块、几何、排布），**不加载 three**。
6. 结束态：显示"听完 / 再来一次 / 了解产品 / 付定金"。埋点在此收口。

> **【v1.2 变更】G1 流程一字未改。** 第 5 步的视觉仍只吃 `structure_hash`，**不调用 `visual-core`、不出现节点/线路层**。G1 的"PCB 风格视觉"最多做到"配色与网格布局"，且必须由既有 hash 视觉管线实现，不得引入派生包（理由见 §8.3）。

**B. 购买后｜Connect & Perform（G2）**

1. 进入 `/play`，选择连接方式：USB（Web Serial，仅 Chromium 桌面）或局域网（WebSocket）。
2. 握手：`hello` → 设备回 `identity`（`link_version`、`device_id`、`engine_version`、`capabilities`）。
3. 版本不匹配 → 全屏阻断式提示，**不暗自改写 Seed**（文档 6.2 明令）。
4. 收 `snapshot`（seed、structure_hash、pattern、params）→ 覆盖本地预览态。**【v1.2 变更】**同时以 snapshot 的 `(seed, engine_version)` 重新派生 visual_manifest——manifest 不从网络来，只从这两个字段本地算。
5. 订阅 `transport` 与 `control`；硬件旋钮转动 → 网页同步高亮/参数；网页侧参数仅"请求"，需 `edit_request` 被硬件 `ack` 后才更新"生效值"。
6. 断线：保留本地音频继续（降级为 Preview），状态徽标转黄；重连后重新全量 `snapshot`，**不靠增量补齐**。

**C. 舞台上｜Hardware-led A/V（G3）**

1. `/stage` 订阅同一 `Link`，只消费 `transport` + `audio_features`。
2. 音频时钟驱动视觉；视觉掉帧、降质、暂停都不影响音频。**【v1.2 变更】**Circuit Layer 的节点/光路同样只读 manifest + transport，不新增订阅。
3. 现场必须能"一键黑场"，且黑场不打断音频。**【v1.2 变更】**黑场时 Circuit Layer 全灭但保留 manifest，恢复不需重算。

---

## 3. 3D 内容在 Web 端的承载方式与接口契约

### 3.1 三层资产的工程化边界

**【v1.2 变更】**由 v0.1 的两层扩为三层。第三层不是新的资产管线，而是"无资产"的程序化层——这正是它便宜、且不能挤占 G1 的原因。

| 层 | 来源 | 格式 | 约束 |
| --- | --- | --- | --- |
| Physical Twin | 真实 CAD / Fusion 360 | GLB（Draco 或 meshopt 压缩）+ KTX2 纹理 | 比例、按钮位置、接口、装配关系必须与实物一致；Rodin 结果只能作为概念资产，UI 上必须带"概念"标记 |
| Generative World | 程序化生成 | 无外部模型：BufferGeometry + GLSL + 实例化 | 由 Seed/Events 派生；禁止用预制贴图假装"生成" |
| **Circuit Language Layer（新）** | **`visual-core` 输出 `visual_manifest`** | **无模型、无贴图：2D 折线 + 16 节点 + 实例化线段/点** | **只表达节点与线路拓扑；不映射真实铜层；不读音乐事件做派发，只用 step 索引做强调** |

**资产管线（G2 起）**：CAD 导出 → 减面（目标 ≤ 80k tris）→ UV/烘焙（AO + 曲率）→ KTX2 压缩 → GLB 打包 → 版本号写入 `manifest.json`（含 `asset_version` 与 `structure_hash` 无关的资产哈希）。资产版本与 `engine_version` 分离，避免"换模型"被误读为"换声音"。

> **【v1.2 变更】注意命名冲突**：这里的 `manifest.json`（资产清单）与 `visual_manifest`（视觉派生结果）是两回事，代码里禁止都叫 manifest。资产清单改名为 `asset-index.json`；`VisualManifest` 专指派生结果。

### 3.2 R3F 场景结构

```
<Canvas gl={{ antialias: tier !== 'C', powerPreference: 'high-performance' }}>
  <SceneRoot>            // 读 store，决定挂载哪一层
    <PhysicalTwin />     // G2，GLB
    <GenerativeWorld />  // G3，程序化
    <CircuitLayer />     // 【v1.2 变更】G2 起，visual_manifest 驱动
    <PostFX />           // G3，tier A only
  </SceneRoot>
</Canvas>
```

三条工程纪律：

1. **逐帧数据不进 React state。** `useFrame` 内 `useSyncExternalStore`/`getState()` 读，直接写 `uniform`、`instanceMatrix`、`object.position`。
2. **时钟只从音频侧取。** `musicalTime = tick + (audioCtx.currentTime - tickCtxTime) * bpm / 60 * ppq`，在 `useFrame` 里算，不 setState。
3. **降级是配置，不是散落的 if。** 画质档位由 `useQualityTier()` 统一给出，场景按档位选材质/后处理/粒子数，避免每个组件各自判断。

**【v1.2 变更】第四条纪律（针对 Circuit Layer）**：`<CircuitLayer />` 是 `visual_manifest` 在三维场景里的**唯一消费者**。`GenerativeWorld` 若要用节点/线路形态，必须经 `CircuitLayer` 暴露的 `useCircuitGeometry()` 拿只读几何，不得自行再算一遍 manifest——两份派生结果必然漂移，而"Web 3D 与 Serial Card 使用同一套节点/线路形态"是产品册 §5.4 的设计验收项。

### 3.3 传输层抽象（Link）

```ts
export type LinkKind = 'webserial' | 'ws' | 'mock';

export interface Link {
  readonly kind: LinkKind;
  open(): Promise<Identity>;
  close(): Promise<void>;
  send(msg: ClientMessage): void;
  onMessage(cb: (msg: ServerMessage) => void): () => void;
  onStatus(cb: (s: LinkStatus) => void): () => void; // idle|connecting|open|degraded|closed
}
```

- `WebSerialLink`：Chromium 桌面；`navigator.serial` 不存在时构造器直接抛 `UnsupportedLinkError`，路由层据此隐藏入口。
- `WebSocketLink`：局域网；内置心跳、指数退避重连、`last_seq` 断点提示（重连后仍要求全量 snapshot）。
- `MockLink`：回放录制帧，供 CI 与无硬件开发使用。**这是唯一能在 CI 里跑通 `/play` 的路径。**

**【v1.2 变更】**Link 层**不感知视觉**：`send` 里不存在"请求视觉参数"的消息，`onMessage` 的 switch 里不存在 `visual` 分支。视觉参数若将来需要由设备侧影响，只能走 `ControlEvent` 的命名空间前缀（如 `VIS#DENSITY`），并作为独立议题在 G2 冻结前讨论——不在本次扩范围。

### 3.4 消息契约（`SERIAL-LINK/0.1`，草案，字段以文档 6.2 为准）

文档已给出六类对象，本文只补"传输必需但文档未写"的三项（`seq` 单调、`ack`、`error`），并全部标注为**建议新增，G2 冻结前可变**。

```ts
import { z } from 'zod';

const Hex16 = z.string().regex(/^[0-9A-Fa-f]{16}$/);
const Hash64 = z.string().regex(/^[0-9a-f]{64}$/);

export const Identity = z.object({
  link_version: z.string(),            // "SERIAL-LINK/0.1"
  device_id: z.string(),
  engine_version: z.string(),          // "S1-POC1"
  capabilities: z.array(z.string()),   // 能力位串，内容待冻结
});

export const Snapshot = z.object({
  seed: Hex16,
  structure_hash: Hash64,
  pattern: z.number().int().nonnegative(),
  params: z.record(z.number()),
});

export const Transport = z.object({
  playing: z.boolean(),
  bpm: z.number().positive(),
  tick: z.number().int().nonnegative(), // ticks 或 sample position，二选一待冻结
  seq: z.number().int().nonnegative(),
});

export const ControlEvent = z.object({
  control_id: z.string(),              // "EC11#1" | "B10K#2" | "CRACK"
  action: z.enum(['press', 'release', 'rotate', 'absolute']),
  value: z.number(),
  seq: z.number().int().nonnegative(),
});

export const AudioFeatures = z.object({
  rms: z.number(),
  bands: z.array(z.number()).length(16).optional(), // FFT bands 数量待定
  peak: z.number(),
  t: z.number(),                        // 设备侧时间戳
});

export const EditRequest = z.object({
  param_id: z.string(),
  target: z.number(),
  request_id: z.string(),
});
```

信封（**建议新增**）：

```ts
type Envelope<T> = { kind: string; seq: number; at: number; payload: T };
type ClientMessage = Envelope<EditRequest> | { kind: 'hello'; payload: { link_version: string } };
type ServerMessage =
  | Envelope<typeof Identity._type>
  | Envelope<typeof Snapshot._type>
  | Envelope<typeof Transport._type>
  | Envelope<typeof ControlEvent._type>
  | Envelope<typeof AudioFeatures._type>
  | { kind: 'ack'; payload: { request_id: string; ok: boolean } }
  | { kind: 'error'; payload: { code: string; message: string } };
```

```ts
// 建议新增：信封的运行时校验（zod discriminatedUnion 需要字面量 kind）
export const ServerMessageSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('identity'),        seq: z.number(), at: z.number(), payload: Identity }),
  z.object({ kind: z.literal('snapshot'),        seq: z.number(), at: z.number(), payload: Snapshot }),
  z.object({ kind: z.literal('transport'),       seq: z.number(), at: z.number(), payload: Transport }),
  z.object({ kind: z.literal('control'),         seq: z.number(), at: z.number(), payload: ControlEvent }),
  z.object({ kind: z.literal('audio_features'),  seq: z.number(), at: z.number(), payload: AudioFeatures }),
  z.object({ kind: z.literal('ack'),             seq: z.number(), at: z.number(), payload: z.object({ request_id: z.string(), ok: z.boolean() }) }),
  z.object({ kind: z.literal('error'),           seq: z.number(), at: z.number(), payload: z.object({ code: z.string(), message: z.string() }) }),
]);
```

三条契约纪律：

1. **未识别的 `kind` 一律丢弃并计数，不崩溃。** 固件先升级是常态。
2. **校验失败即断链**，不做"尽力解析"——脏数据进了 store 比连不上更贵。
3. 端点：局域网 `ws://<device>.local:<port>/link/v0.1`。**端口与发现方式（mDNS / 二维码 / 固定 IP）未定，G2 验证后写死。**

> **【v1.2 变更】本节零改动，这是刻意的。** 视觉派生不需要过网：`Snapshot` 已经带了 `seed` 与 `identity` 带了 `engine_version`，两者足以在本地复算 manifest。多加一个 `visual_manifest` 字段的代价是——协议要升到 0.2、固件要跟着改、还要处理"设备端与网页端 manifest 不一致"的仲裁。全部收益为零。**这条要写进 code review checklist：任何人往 Snapshot 里加视觉字段，先回答"为什么本地派生不够"。**

### 3.5 时序（连接建立）

```
Web                         Bridge/Device
 │  hello(link_version)  ───────▶
 │  ◀─────── identity(engine_version, capabilities)
 │  [版本不匹配 → 阻断；匹配 → 继续]
 │  ◀─────── snapshot(seed, hash, pattern, params)
 │  ◀─────── transport(playing, bpm, tick, seq)   … 周期或变更触发
 │  ◀─────── control(…) / audio_features(…)
 │  edit_request(param, target, rid) ─────▶
 │  ◀─────── ack(rid, ok)  → 才更新 UI 的"生效值"
```

**【v1.2 变更】**第 4 行之后，前端本地执行 `deriveVisualManifest(seed, engine_version)`，不产生任何上行/下行消息。

---

## 4. 【v1.2 变更】visual_manifest 在前端的落位

> 产品册依据：§2 横向设计语言、§5.4 Physical–Digital Visual Identity。产品册明确：visual_seed / visual_manifest 是**协议草案、尚未冻结**，其派生"与音乐 PRNG 流隔离，绝不因为改变粒子数量、材质或 PCB 图案而改变 structure_hash"。本章只做工程落位，不发明 schema 标准。

### 4.0 一句话

`visual_manifest` 是**从 `(engineVersion, seed)` 单向派生的只读视觉 IR**，它进不了 `s1-core`，也进不了 `structure_hash`；所有渲染后端吃同一份 IR，因此网页、卡面、光路长得是同一套东西。

### 4.1 定位：是什么，不是什么

| 是 | 不是 |
| --- | --- |
| 一个纯函数输出：`(engineVersion, seed, motifVersion) → VisualManifest` | 不是新的音乐生成器，不产出、不修改、不消费 `StepEvent` |
| 节点/线路/配色/密度的**归一化几何 IR**（0..1 坐标） | 不是 PCB 的电气几何，不含铜层、间距、开窗、DRC 信息 |
| 可缓存、可序列化、可做参考向量回归的确定性数据 | 不是跨端强一致承诺的一部分（产品册 3 章已声明不承诺"所有视觉粒子逐帧相同"） |
| G2/G3 的视觉输入 | 不是 G1 的依赖项，G1 一律不吃 |

### 4.2 派生契约

```
engineVersion ─┐
seed ──────────┼─▶ SHA-256("SERIAL-VISUAL/0.1" ‖ 0x00 ‖ motifVersion ‖ 0x00 ‖ engineVersion ‖ 0x00 ‖ seed)
motifVersion ──┘        │
                        ├─ 取前 8 字节 → visual_seed (16 hex / 64-bit)
                        ▼
              PCG32 独立实例（own instance，own state）
                        │
                        ▼
              VisualManifest（16 nodes / N edges / palette / density）
```

四条派生纪律：

1. **域分离**：前缀字面量 `SERIAL-VISUAL/0.1` + `0x00` 分隔，保证同一 seed 在音乐域与视觉域得到互不相关的流。这不是"加个盐好看"，而是让两个 PRNG 流在统计上不可能撞到一起。
2. **输入最小化**：只吃 `(engineVersion, seed, motifVersion)`。**不读 `Score`、不读 `events`、不读 `structure_hash`**。理由：一旦读 Score，视觉就与音乐生成时序耦合，"换个视觉算法会不会影响 hash"这个问题会永久回到桌面上。
3. **单向**：`visual-core` 可以 import `s1-core` 的纯 PRNG 构造器（复用算法，不复制代码）；`s1-core` **禁止** import `visual-core`（CI 断言，§4.3）。
4. **不复用实例**：派生函数内部 `new` 自己的 PCG32，签名里不出现任何 RNG 句柄参数。传进来的东西能被别人消费，就是隔离的漏洞。

> **步进强调的边界**：节点强调（哪个节点亮、多大、位移多少）由渲染侧用 `transport` 的当前 step + `Score.events[step]` 的 gate/velocity **只读**叠加。这是"渲染读取"，不是"派生消费"。判据很硬：**删掉渲染层，manifest 一个字节都不变。**

### 4.3 隔离的四道闸（缺一道就等于没隔离）

| 闸 | 机制 | 拦什么 | 落地位置 |
| --- | --- | --- | --- |
| ① 包边界 | `packages/s1-core/package.json` 不含 `@serial/visual-core`；ESLint `no-restricted-imports` 禁止 `s1-core` 引 `visual-core`；dependency-cruiser 断言依赖方向单向 | 有人图省事在 `generate()` 末尾加两行视觉派生 | CI `pnpm depcruise` |
| ② 独立 PRNG 实例 | 派生函数自行 `createPcg32(visualSeedU64)`；接口不接收 RNG 参数 | 有人为了"省一次初始化"把音乐 RNG 传进去 | code review + 类型签名 |
| ③ 绘制账本测试 | 测试构建给 PCG32 注入 draw 记录器，对**整条返回值序列**做哈希（不只计数） | 改了 draw 顺序但次数不变——计数拦不住，账本拦得住 | Vitest，`s1-core` 的 isolation 用例 |
| ④ 构建期体积与图断言 | `/`、`/s/*` 的 chunk 里 grep 不到 `three` **也** grep 不到 `visual-core`；首屏体积阈值 | G1 被悄悄拖入派生包（连带 hash 库） | CI + `rollup-plugin-visualizer` |

**第三道闸的判据（最重要的一条）**：加载 `visual-core` 前后，`generate(seed, version)` 的 `structureHash` 与**draw 账本哈希**必须逐字节一致。这条测试跑不过，说明隔离已经破了，此时任何"我觉得没影响"的说法都不成立。

### 4.4 类型草案（schema 未冻结）

```ts
// packages/visual-core/src/types.ts —— 草案。字段可增，语义未冻结。
// 纪律：本文件不得 import 任何与音乐生成有关的类型（Score / StepEvent / structureHash）。

export const VISUAL_SCHEMA = 'SERIAL-VISUAL/0.1' as const;

export interface VisualManifest {
  schema: typeof VISUAL_SCHEMA;
  motifVersion: string;        // 纹样/算法版本，独立演进；改它必须能解释"为什么视觉变了而声音没变"
  engineVersion: string;       // 派生输入之一，写回以便追溯（不是校验依据）
  visualSeed: string;          // 16 hex / 64-bit，≠ 音乐 seed，不可反推
  palette: VisualPalette;
  nodes: VisualNode[];         // 固定 16 项，索引 = step 索引（仅对齐，不含音乐语义）
  edges: VisualEdge[];
  density: number;             // 0..1，图形密度；G3 可据此调粒子数而不重算 manifest
}

export interface VisualPalette {
  bg: string;                  // 深黑
  metal: string;               // 烟熏金属
  cream: string;               // 乳白聚合物
  accent: string;              // 局部荧光
  accentContrast: number;      // accent 对 bg 的对比度，构建期断言 ≥ 4.5
}

export interface VisualNode {
  id: number;                  // 0..15
  x: number; y: number;        // 归一化 0..1；渲染侧再映射到画布像素或 UV
  r: number;                   // 0..1，节点半径比例
  kind: 'pad' | 'via' | 'silk-mark'; // 视觉语汇（借 PCB 词汇），非电气语义
}

export interface VisualEdge {
  from: number; to: number;    // 引用 VisualNode.id
  path: [number, number][];    // 归一化折线，顶点数 ≤ 6（防过度密集，见 §5.4）
  weight: number;              // 0..1，视觉粗细
  layer: 'copper' | 'silk';    // **仅视觉语义**，绝不映射为真实铜层/丝印层
}
```

三条类型纪律：

1. `VisualEdge.layer` 用 `'copper' | 'silk'` 只是借词，注释里必须写死"不映射真实层"。**任何把这个字段接到 KiCad 层号的地方都是 bug。**
2. `nodes` 长度恒为 16。渲染侧按 `step` 索引取强调，不做 `find`、不做排序。
3. 所有坐标为归一化值；像素、mm、UV 的换算只在渲染器内部做，manifest 不带单位。

### 4.5 渲染入口

```ts
// apps/web/src/features/circuit/types.ts

/** 音频时钟外推出来的音乐时间，逐帧构造，零分配。 */
export interface MusicalTime { step: number; phase: number }

/** 当前 step 的强调量，来自 Score.events[step] 的只读投影。 */
export interface StepState { gate: boolean; velocity: number; accent: number }

export interface CircuitRenderer {
  readonly kind: 'canvas2d' | 'three';
  /** 仅在 manifest 变化时调用；允许分配、允许重建几何。 */
  applyManifest(m: VisualManifest): void;
  /** 逐帧调用；零分配、不 setState、不读 DOM 布局。 */
  frame(t: MusicalTime, s: StepState): void;
  /** 解绑监听、释放 GPU 资源。 */
  dispose(): void;
}
```

| 后端 | 实现 | 用在哪 | 阶段 |
| --- | --- | --- | --- |
| `Canvas2DCircuitRenderer` | 2D context，折线 + 圆点，`frame` 只改样式属性 | 卡面预览、`/about` 示意图、降级路径 | G2 |
| `SvgCircuitRenderer` | 输出**静态** SVG 字符串（非逐帧） | 评审稿导出（§5.3）、打印对照 | G2 |
| `ThreeCircuitRenderer` | `InstancedMesh` 线段批 + 点批，直写 `instanceMatrix` | `/play` 场景、`/stage` | G2（G3 加光路） |

三个入口共用同一份 `VisualManifest`，**不允许各自派生**。这就是产品册 §5.4 设计验收里"Web 3D 与 Serial Card 使用同一套节点/线路形态"的工程实现方式。

```ts
// apps/web/src/features/circuit/Canvas2D.ts（骨架）
export function createCanvas2DRenderer(canvas: HTMLCanvasElement): CircuitRenderer {
  const ctx = canvas.getContext('2d')!;
  let m: VisualManifest | null = null;

  return {
    kind: 'canvas2d',
    applyManifest(next) {
      m = next;
      canvas.style.setProperty('--bg', next.palette.bg);
      // 只在 manifest 变更时重算像素坐标与 Path2D
      rebuildPaths(ctx, next, canvas.width, canvas.height);
    },
    frame(t, s) {
      if (!m) return;
      // 逐帧只做 clear + 描边 + 高亮当前 step，不分配对象
      paintFrame(ctx, m, t, s);
    },
    dispose() { m = null; },
  };
}
```

### 4.6 与协议、状态、缓存的关系

| 议题 | 结论 | 理由 |
| --- | --- | --- |
| 是否进 `Snapshot` | **不进** | 本地可复算（§3.4 末注）；进了要升协议版本 |
| 是否进埋点 | 只记 `visual_schema` / `motifVersion` / `visual_degraded` 三个枚举值 | 用来判断"视觉是否影响了听完率"，不上传几何 |
| 是否进 localStorage | 缓存键 `v:{schema}:{motifVersion}:{engineVersion}:{seed}`，值 = manifest JSON | 复访免重算；键里带 schema，改算法自动失效 |
| 是否参与"同一首曲子"判定 | **绝不** | 唯一凭证是 `structure_hash`（v0.1 §4.4 已列为禁止事项，本条为其视觉侧补充） |
| 是否影响音频调度 | **绝不** | 派生在 Generate 期一次完成；渲染丢帧不回调音频 |

### 4.7 演进与失效策略

1. `motifVersion` 是视觉的版本闸门：改 PRNG 用法、改节点规则、改配色算法 → **必须** bump。bump 后旧卡片图案会变，这是已知代价，靠"参考向量"记录每个 motif 的输出指纹。
2. `schema` 是结构闸门：加字段 → bump `0.1 → 0.2`；渲染器对未知字段**丢弃不报错**（与协议纪律一致），因为网页可能比卡片图案新。
3. 参考向量：`tools/visual-ref/` 存 3 组 `(seed, engineVersion, motifVersion) → visual_seed + manifest 指纹`，与音乐 Golden Vectors 分开存放、分开跑。**绝不能混在一个测试文件里**——混了之后，视觉向量的失败会看起来像音乐回归。
4. 未冻结期间对外一律称"草案"，`/about` 与内部文档同口径。

---

## 5. 【v1.2 变更】PCB Art / Circuit Language 的前端边界

> 产品册依据：§2 横向设计语言、§5.4、§4 的 "PCB as Interface"（G2 新增工业设计要求）。产品册同时明确：实体 PCB 的量产图案**不**逐张按 Seed 定制；首批优先统一电路、统一丝印。

### 5.1 分层职责（谁产出什么，谁是权威）

| 层 | 工具 | 产物 | 权威 | 前端可否介入 |
| --- | --- | --- | --- | --- |
| 平面视觉语法 | 矢量工具（母版） | 母版 SVG（节点/线路语汇） | 设计 | 只读引用，不生成 |
| PCB 图形与工艺 | **KiCad** | `.kicad_pcb` + Gerber + DRC 报告 | **硬件/制造** | **❌ 不生成、不修改、不做 DRC** |
| 结构与尺寸 | **Fusion 360** | STEP / 装配 | 工业设计 | ❌ |
| 面板打样与手感 | 板厂 + 实物 | 1:1 面板、装配验证 | 工业设计 | ❌（可参与评审） |
| **Web 视觉 / 卡面图形** | **`visual-core` + `circuit` 渲染器** | **`visual_manifest`、评审稿 SVG、3D 光路** | **前端** | ✅ 唯一责任区 |

一句话边界：**前端产出"看起来像电路"的图形，不产出"能做成电路"的文件。**

### 5.2 前端可做 / 不可做（写进 PR 模板）

| ✅ 可做 | ❌ 不可做 |
| --- | --- |
| 从 manifest 渲染节点、折线、走线感纹理、光路 | 生成 Gerber、`.kicad_pcb`、钻孔表、叠层 |
| 导出**评审稿** SVG（带单位、1:1 可打印） | 声称导出物"可直接送厂" |
| 消费设计给的母版 SVG 作为布局参考 | 自动把网页图形回灌进 KiCad |
| 在 UI 上标注"概念/草案" | 把 AI 生成网格或位图当 CAD/PCB 素材 |
| 用同一套节点/线路语汇保证品牌一致 | 承诺"每台 PCB 按 Serial 变化" |

### 5.3 评审稿 SVG 纪律

```ts
// apps/web/src/features/circuit/exportPlate.ts
export interface PlateOptions {
  widthMm: number;         // 必须给物理尺寸，例如 85 × 54（卡片）或面板实际尺寸
  heightMm: number;
  bleedMm?: number;        // 出血，打印对照用
  includeGuides?: boolean; // 是否画工艺参考线（仅评审）
}

export function exportReviewPlate(m: VisualManifest, opt: PlateOptions): string {
  // 1. viewBox 用 mm 为单位，1 用户单位 = 1 mm
  // 2. 节点 id 写成 data-step="0..15"，便于设计侧核对
  // 3. 输出固定头部注释（见下），不允许调用方关闭
  return [
    '<!-- SERIAL-CARD-ART / REVIEW ONLY / NOT MANUFACTURING DATA',
    '     权威几何位于 KiCad 工程内；本文件仅供设计评审与 1:1 打样对照。',
    `     schema=${m.schema} motif=${m.motifVersion} engine=${m.engineVersion}`,
    '     禁止作为 Gerber / 制板 / 印刷的输入。 -->',
    svgBody(m, opt),
  ].join('\n');
}
```

四条纪律：

1. **文件名强制后缀**：`*-REVIEW-ONLY.svg`。后缀由导出函数返回建议名，调用方不得改写（UI 层只显示建议名）。
2. **头部注释不可关闭**：参数里没有 `disclaimer?: false` 这类开关。
3. **单位是 mm，不是 px**：只有这样 1:1 打印才可信；px 稿在打样时必然错。
4. **不嵌位图**：全部矢量路径。要纹理就用路径密度，不用 PNG 底图。

### 5.4 可读性与无障碍硬指标（前端能守、也必须守的部分）

| 指标 | 阈值 | 为什么 |
| --- | --- | --- |
| 节点最小间距 | ≥ 6% 归一化宽度（≈ 24 px @ 400 px 宽） | 产品册 §5.4 明令"避免过度密集、难以辨认的走线装饰"；挤在一起就不可读了 |
| 文字/刻度不被线路穿过 | 硬约束 | 旋钮刻度与 16-step 状态必须清晰（G2 设计验收项） |
| accent 对 bg 对比度 | ≥ 4.5:1 | 荧光色在深黑上极易掉到 2:1；WCAG 2.1 AA 正文要求 |
| 闪烁频率 | ≤ 3 Hz | 光敏性癫痫（WCAG 2.3.1）；Demoscene 风格最容易踩 |
| `prefers-reduced-motion: reduce` | 关闭光路流动/位移，保留静态拓扑 | 动效偏好是系统级设置，必须响应 |
| 色觉障碍 | 不只靠色相区分 step 状态 | 亮度/尺寸/位置至少二维冗余编码 |

### 5.5 验收（对齐产品册 §5.4 "设计验收（放在 G2）"）

| 验收项 | 前端交付证据 | 不属前端 |
| --- | --- | --- |
| 一张可制造的艺术面板/PCB 版稿 | — | 工业设计 + KiCad（前端只出评审对照稿） |
| 旋钮刻度与 16-step 状态清晰 | 评审稿 1:1 打印稿 + 节点间距/对比度检查脚本输出 | — |
| 至少一件实物打样 | — | 工业设计 |
| Web 3D 与 Serial Card 用同一套节点/线路形态 | 同一 `VisualManifest` 的两个后端渲染截图对照 + 单测断言（同一 manifest 输入，节点坐标逐点相等） | — |

---

## 6. 状态管理与数据流

### 6.1 Store 分片

| 分片 | 内容 | 权威 | 更新频率 |
| --- | --- | --- | --- |
| `session` | 模式（offline/preview/connected）、连接状态、能力位、error | 本端 | 低 |
| `score` | seed、engine_version、events[16]、structure_hash | 纯函数派生，不可变 | 仅 Generate 时 |
| `transport` | playing、bpm、tick、tickCtxTime、seq | 硬件或本地音频时钟 | 高（但不进 React） |
| `params` | UI 目标值 / 生效值（两套） | connected 时硬件 | 中 |
| `visual` | 场景档位、宏参数、Crack 状态；**【v1.2 变更】**`manifest: VisualManifest \| null`、`motifVersion`、`backend: 'canvas2d'\|'three'`、`degraded: boolean` | 本端派生（纯函数结果），不可变引用 | 中；manifest 仅在 Generate / snapshot adopt 时整体替换 |

`score` 的不可变是关键：`structure_hash` 是跨端一致性的唯一凭证，任何"编辑后原地改 events"都会让 hash 与声音脱钩。编辑一律走"生成新 score + 新 hash"。

**【v1.2 变更】`visual` 分片的三条纪律：**

1. **只存引用，不存派生中间态**。manifest 是整体替换，不做 `manifest.nodes[i].x = ...` 这种就地改。
2. **与 score 同批 adopt**。`useScore.getState().adopt(snapshot)` 与 `useVisual.getState().adoptVisual(manifest)` 在同一个 action 里完成，避免"hash 是新的、图形还是旧的"这一帧。
3. **`visual` 不是权威**。manifest 由 `(seed, engine_version, motifVersion)` 决定，任何人手改 store 都能被下一次重算打回原形——这是特性，不是缺陷。

### 6.2 单向数据流

```
用户输入 ──command──▶ 权威源（本地引擎 / 硬件）
                        │
                        ├─ snapshot / transport / control（订阅）
                        ▼
                     store（zustand）
                        │
          ┌─────────────┴─────────────┐
          ▼                           ▼
   React 组件（低频）          rAF 循环（逐帧，直读 getState）
```

**【v1.2 变更】**视觉侧加一条旁路，仍然单向：

```
(seed, engine_version, motifVersion) ──▶ deriveVisualManifest() ──▶ visual.manifest
                                                                        │
                                                          (只在 applyManifest 时读一次)
                                                                        ▼
                                                              CircuitRenderer.frame()
```

### 6.3 时钟实现（最容易写错的一处）

- AudioWorklet 每 ~50ms `postMessage({ tick, ctxTime })`，并携带 `playing`。
- 主线程用 `audioCtx.currentTime` 外推，**不依赖消息频率**：消息稀疏也只影响校正精度，不影响画面连续性。
- 页面后台/掉帧时，`ctxTime` 仍在走（AudioContext 被节流时会自动补偿），因此恢复后不会"补帧式跳变"。
- 硬件模式下 `tick` 来自 `transport` 消息，外推基准换成设备时间戳 + 本地到达时间差（`performance.now()` 对齐），偏差 > 阈值时软校正而非硬跳。

### 6.4 禁止事项（写进 code review checklist）

- ❌ 用 `requestAnimationFrame` 计数推导 BPM/step。
- ❌ 每帧 `setState` 驱动视觉。
- ❌ 在 `connected` 模式下把网页参数直接当生效值。
- ❌ 断线时停止本地音频（Preview 降级必须继续发声）。
- ❌ 用 `structure_hash` 之外的字段判断"同一首曲子"。
- **❌【v1.2 变更】在 `s1-core` 内调用任何 `visual-core` 的函数，或为视觉目的修改 `generate()` 的 draw 顺序。**
- **❌【v1.2 变更】把 `visual_manifest` 或其 hash 写进 `Snapshot`、写进本地判定"同一首曲子"、写进 `structure_hash` 的比较。**
- **❌【v1.2 变更】在浏览器里生成或修改 Gerber / `.kicad_pcb`，或把评审稿 SVG 说成可制造文件。**
- **❌【v1.2 变更】`GenerativeWorld` 自行派生 manifest（必须经 `useCircuitGeometry()`）。**

---

## 7. 性能与加载策略

### 7.1 预算

| 指标 | G1 | G2 | G3 |
| --- | --- | --- | --- |
| 首屏 JS（gzip） | ≤ 120 KB | ≤ 260 KB | ≤ 320 KB（three 懒加载） |
| LCP（4G，中端安卓） | < 2.5 s | < 3.0 s | < 3.5 s |
| CLS | < 0.05 | < 0.05 | < 0.05 |
| 初始 GLB | — | ≤ 1.5 MB（压缩后） | 同左 + 流式追加 |
| draw call | — | ≤ 120 | ≤ 200 |
| 目标帧率 | — | 60 fps @1080p（tier A/B） | 同左，tier C 30 fps |
| 音频 underrun | 0 | 0 | 0 |
| **`visual_manifest` JSON（gzip）（【v1.2 变更】）** | **—（G1 不产出）** | **≤ 8 KB** | **同左** |
| **评审稿 SVG（未压缩）（【v1.2 变更】）** | **—** | **≤ 120 KB** | **同左** |
| **Circuit Layer draw call（【v1.2 变更】）** | **—** | **≤ 24**（线段/节点各一批实例，非一节点一 mesh） | **≤ 40**（含光路） |
| **manifest 派生耗时（【v1.2 变更】）** | **—** | **≤ 8 ms（中端安卓单次，含 SHA-256）** | 同左 |

8 KB 的来历：16 节点 × ~60 B + 32～48 条边 × ~120 B + 调色板/元数据 ≈ 6～7 KB。超了就是边太密——那正好是 §5.4 可读性要拦的东西，两个约束同向。

### 7.2 加载策略

1. **路由级分包**：`/`、`/s/:serial` 一个 chunk；`/play`、`/stage` 独立 chunk 且 `three` 只出现在后两者。
2. **G1 绝不 import three**：用构建期断言（`rollup-plugin-visualizer` + CI 体积阈值）防止误引。**【v1.2 变更】同一条断言扩展到 `visual-core`**：G1 chunk 里出现 `visual-core` 即构建失败（它会连带 hash 相关代码与 manifest 类型）。
3. **模型三段式**：程序化占位（0 请求）→ 低模 GLB（首帧可交互）→ 高模/纹理按需替换。
4. **音频事件预生成**：30 秒事件在 Generate 时一次性算完，播放仅调度 `AudioBufferSourceNode`，播放中零分配。
5. **字体**：只切必要的 CJK 子集，`font-display: swap`；标题用系统栈兜底。
6. **【v1.2 变更】manifest 与几何都懒**：`deriveVisualManifest()` 在 `requestIdleCallback`（无则 `setTimeout(0)`）里跑，不阻塞首帧可听；`ThreeCircuitRenderer` 的几何在 `applyManifest` 时一次建好，`frame` 内零分配。

### 7.3 画质分级

| 档位 | 判定 | 内容 |
| --- | --- | --- |
| A | 独显/Apple Silicon，首 2 秒平均帧时间 < 12ms | 全材质 + 后处理 + 粒子 + 体积光 |
| B | 集显/中端移动 | 简化材质、关 DOF/Bloom，粒子降 50% |
| C | 弱 GPU 或首帧超时 | 仅结构可视化（线框/实例方块）、无后处理、30 fps |

判定在首帧后 2 秒内完成，允许**运行中降档**（连续 60 帧超阈值），不允许升档抖动（升档需连续 10 秒达标）。

**【v1.2 变更】Circuit Layer 在 C 档不退化为"无"**：它是结构可视化本身，C 档下仍保留节点 + 主线（`weight ≥ 0.6` 的边），只是关光路与位移。理由：档位降级不能让用户看不出"这是什么"，否则等于砍掉了产品语义。

### 7.4 监控

- `PerformanceObserver` 采 LCP / INP / CLS。
- 自定义：平均帧时间、掉帧率、`audioCtx.baseLatency`、underrun 计数、`Link` 重连次数、消息丢弃数。
- 上报只在 G1 的埋点通道内，不引入第三方 SDK。
- **【v1.2 变更】**新增三个只报枚举的计时/计数：`visual_derive_ms`、`visual_degraded`（bool）、`visual_backend`（canvas2d/three/svg）。不上报 manifest 内容。

---

## 8. 目录结构、里程碑与工作量

### 8.1 目录结构（pnpm workspace）

```
serial/
├─ apps/
│  └─ web/                     # 唯一前端应用
│     ├─ src/
│     │  ├─ app/               # 路由、Provider、全局错误边界
│     │  ├─ pages/             # explore / player / card / play / stage
│     │  ├─ features/
│     │  │  ├─ serial-input/   # 输入、校验、扫码
│     │  │  ├─ player/         # 三态机、30s 播放、结束态
│     │  │  ├─ visual2d/       # G1：hash → 静态视觉（Canvas/SVG）。不含 manifest
│     │  │  ├─ circuit/        # 【v1.2 变更】G2：VisualManifest → 节点/线路（3 后端）
│     │  │  ├─ twin/           # G2：Physical Twin（GLB）
│     │  │  ├─ world/          # G3：Generative World（程序化）
│     │  │  └─ link/           # Link 实现、重连、状态徽标
│     │  ├─ stores/            # session/score/transport/params/visual
│     │  ├─ audio/             # worklet、调度器、时钟外推
│     │  ├─ styles/            # tokens、tailwind 配置
│     │  └─ analytics/         # 事件定义与上报（字段对齐 events.csv）
│     └─ public/assets/        # 静态资源、asset-index.json
├─ packages/
│  ├─ s1-core/                 # 纯 TS：seed→PCG32→events→hash，双端共用
│  ├─ visual-core/             # 【v1.2 变更】纯 TS：seed+version→visual_seed→manifest
│  ├─ serial-link/             # 协议类型 + zod schema + 编解码
│  └─ golden-vectors/          # 3 组音乐测试向量（Python/JS 共用）
├─ tools/
│  ├─ asset-pipeline/          # CAD→GLB→KTX2（G2）
│  ├─ visual-ref/              # 【v1.2 变更】visual 参考向量与指纹（与音乐的物理隔离）
│  └─ bench/                   # 帧时间/体积基线
```

关键约束：`s1-core` **不得依赖 DOM 与 Web API**，否则无法与固件/Python 参考实现对拍；`serial-link` 同理，只允许纯数据与 schema。
**【v1.2 变更】`visual-core` 同样不得依赖 DOM 与 three**：它只允许 `crypto.subtle`（浏览器）/`node:crypto`（Node）这一层 WebCrypto 兼容接口与 `s1-core/prng` 的构造器。任何 `document`、`window`、`THREE` 出现即视为分层破坏——那样它就没法在 Node 里跑参考向量。

### 8.2 里程碑

| 阶段 | 目标 | 完成证据（可核验） |
| --- | --- | --- |
| M0 基建（G1 内） | 仓库、CI、体积阈值、埋点骨架 | CI 绿；首屏体积报告；空页面 LCP 基线 |
| M1 引擎接入（G1 内） | `s1-core` 接入 + 3 组 Golden Vectors 回归 | Vitest 全绿；同 Seed 双次生成 hash 一致 |
| M2 G1 Player（G1 内） | 三态机、30s 播放、hash 静态视觉、分享深链 | iOS Safari / Android Chrome / 微信内置浏览器真机各 1 次完整走通；30s 无 underrun |
| M3 卡与埋点（G1 内） | `/c/:cardId`、事件上报、漏斗字段 | `events.csv` 与上报字段逐字段对照表；扫码→听完→付费链路可回放 |
| G2-a Link（G2） | `Link` 三实现 + 重连 + 契约校验 | MockLink 回放测试；真机 USB 与局域网各 1 次握手成功 |
| G2-b 数字孪生（G2） | Physical Twin GLB + 参数映射 | 旋钮动作在网页 150ms 内可见；断网仍可演奏 |
| **G2-c Circuit Language（【v1.2 变更】，G2）** | **`visual-core` 派生 + `circuit` 三后端 + 卡面评审稿** | **隔离测试绿（draw 账本不变）；同 manifest 在 Canvas2D 与 three 下节点坐标逐点相等；评审稿 1:1 打印节点间距 ≥ 24 px 等价值、对比度 ≥ 4.5:1；manifest ≤ 8 KB** |
| G3 演出（G3） | Generative World + 分级 + 全屏舞台 | 现场彩排 30 分钟无 underrun；降档后仍保持结构可读 |
| **G3-b 光路（【v1.2 变更】，G3）** | **manifest 驱动的光路/粒子路径 + 舞台变体** | **`/stage` 黑场后恢复不需重算 manifest；`prefers-reduced-motion` 下静态拓扑完整可读** |

### 8.3 工作量拆分

**G1（冻结预算内，Web 4 人日 + 卡/埋点 2 人日）— 【v1.2 变更】零影响核验**

| 核验项 | v0.1 | v0.2 | 结论 |
| --- | --- | --- | --- |
| Web 人日 | 4.0 | 4.0 | 不变 |
| 卡/埋点人日 | 2.0 | 2.0 | 不变 |
| G1 总人日 | 12 | 12 | 不变 |
| 现金上限 | ≤ ¥5,500 | ≤ ¥5,500 | 不变 |
| 是否含 three | 否 | 否（断言扩展至 `visual-core`） | 更强 |
| 是否含 PCB Art 设计/制板 | 否 | 否 | 不变 |
| 是否含 visual_manifest | — | **否** | 新增的排除项 |
| 新增路由 | 0 | 0 | 不变 |
| 新增运行时依赖 | — | **0**（hash 用 WebCrypto） | 不变 |
| 卡面 | 固定简洁卡面 | 固定简洁卡面 | 不变 |
| 埋点字段 | 对齐 `events.csv` | 对齐 `events.csv`（不加视觉字段） | 不变 |
| G1 视觉来源 | `structure_hash` | `structure_hash` | 不变 |

| 事项 | 人日 | 冻结口径 |
| --- | --- | --- |
| 引擎接入 + Golden Vectors 回归 | 0.75 | Web 4 人日 |
| Player 三态界面 + 30s 播放 + 参数 | 1.25 | 同上 |
| hash 派生静态视觉（Canvas 2D，非 three） | 0.5 | 同上 |
| 分享深链 + 版本不匹配提示 + 支持矩阵 | 0.5 | 同上 |
| 兼容矩阵真机调试（iOS/Android/微信） | 0.75 | 同上 |
| 缺陷与缓冲 | 0.25 | 同上 |
| **小计** | **4.0** | |
| `/c/:cardId` 落地 + 归因参数 | 0.5 | 卡/埋点 2 人日 |
| 事件埋点（扫码/播放/听完/定金） | 1.0 | 同上 |
| 漏斗字段校验与导出 | 0.5 | 同上 |
| **小计** | **2.0** | |

**G2 / G3 估算（不计入 G1，仅供排期参考，非承诺）**

| 阶段 | 事项 | 人日 |
| --- | --- | --- |
| G2 | Link 三实现 + Web Serial/WS 适配 | 3.0 |
| G2 | 连接状态机、重连、降级、版本阻断 | 2.0 |
| G2 | 资产管线（CAD→GLB→KTX2→LOD） | 3.0 |
| G2 | R3F 场景 + 时钟驱动 + 控件映射 | 3.5 |
| G2 | 分级与监控 | 1.5 |
| **G2** | **【v1.2 变更】`visual-core` 派生 + schema 草案 + 参考向量** | **2.0** |
| **G2** | **【v1.2 变更】`circuit` 三后端（Canvas2D / SVG / three 共用 IR）** | **3.0** |
| **G2** | **【v1.2 变更】卡面评审稿导出 + 可读性检查脚本** | **1.5** |
| **G2** | **【v1.2 变更】PCB Art 视觉对齐与打样评审（前端配合，与工业设计共担）** | **1.0** |
| **G2 小计** | | **20.5**（v0.1 为 13.0） |
| G3 | Generative World 场景（16-step 几何、程序化雕塑） | 6.0 |
| G3 | 材质/后处理/粒子（tier A） | 4.0 |
| G3 | `/stage` 全屏、黑场、演出快捷键 | 2.5 |
| G3 | 现场彩排与稳定性 | 3.5 |
| G3（可选） | 录制/分享片段 | 2.0 |
| **G3** | **【v1.2 变更】光路/粒子路径/机械雕塑（manifest 驱动）** | **4.0** |
| **G3** | **【v1.2 变更】`/stage` manifest 变体 + 黑场保留 + 降级** | **1.5** |
| **G3 小计** | | **21.5**（v0.1 为 16.0，不含可选项） |

**新增量的估算假设（写明，才能被推翻）**

1. `visual_manifest` 的 schema 在 G2-a 结束前冻结到"字段可用"级别（不是量产冻结），否则 2.0 人日翻倍。
2. `circuit` 三后端共用一套归一化 IR，若三端各写一套布局算法，3.0 变 6.0。
3. 卡面母版由设计定稿，前端只做"manifest → SVG 映射"；若前端要从零设计视觉语汇，1.5 不成立，且这活本不该由前端承担。
4. PCB Art 面板打样、DRC、工艺核验的**成本与工时归硬件/工业设计**，上表 1.0 只算前端参与评审的时间。
5. 上述人日按"协议字段基本稳定、CAD 可导出"假设；任一前提不成立需重估。

---

## 9. 关键代码骨架（示意，非完整实现）

### 9.1 路由与懒加载边界

```tsx
// apps/web/src/app/routes.tsx
import { createBrowserRouter } from 'react-router-dom';
import { lazy, Suspense } from 'react';

const Explore = lazy(() => import('../pages/explore'));
const Player = lazy(() => import('../pages/player'));
const Play = lazy(() => import('../pages/play'));     // G2
const Stage = lazy(() => import('../pages/stage'));   // G3

export const router = createBrowserRouter([
  { path: '/', element: <Suspense fallback={<BootSkeleton />}><Explore /></Suspense> },
  { path: '/s/:serial', element: <Suspense fallback={<BootSkeleton />}><Player /></Suspense> },
  { path: '/c/:cardId', element: <CardResolver /> },
  { path: '/play', element: <Suspense fallback={<BootSkeleton />}><Play /></Suspense> },
  { path: '/stage', element: <Suspense fallback={<BootSkeleton />}><Stage /></Suspense> },
  { path: '/about', element: <About /> },
  { path: '*', element: <NotFound /> },
]);
```

`Play` / `Stage` 的 chunk 里才允许出现 `three`；在 CI 里对 `/`、`/s/*` 的 chunk 做 grep 断言。**【v1.2 变更】同一断言加上 `visual-core`。**

### 9.2 引擎边界（`s1-core`）

```ts
// packages/s1-core/src/index.ts
export interface Score {
  seed: string;                 // 16 hex
  engineVersion: string;        // "S1-POC1"
  events: StepEvent[];          // 长度 16
  structureHash: string;        // sha256 hex, 64 字符
}

export interface StepEvent {
  step: number;                 // 0..15
  gate: boolean;
  note: number;                 // 待冻结的量化口径
  velocity: number;
  length: number;
}

/** 纯函数：同一 seed + engineVersion 必然得到同一 Score。 */
export function generate(seed: string, engineVersion: string): Score {
  // 1. seed → u64 → PCG32 初始化（候选方案沿用 S1-POC1）
  // 2. 16 步有界采样 → StepEvent[]
  // 3. 规范化序列化（字段顺序固定）→ sha256 → structureHash
  throw new Error('not implemented in skeleton');
}
```

对齐要求：该函数的输出必须与 POC 的 3 组 Golden Vectors 逐字节一致；测试不允许"差不多相等"。
**【v1.2 变更】该文件的 diff 只允许两类：修 bug、扩 Golden Vectors。任何与视觉相关的改动一律打回——包括"顺手加个 visualSeed 字段"。**

### 9.3 音频时钟（Worklet → store，不进 React state）

```ts
// apps/web/src/audio/clock-worklet.ts（示意）
class ClockProcessor extends AudioWorkletProcessor {
  private acc = 0;
  process(_inputs: Float32Array[][], _outputs: Float32Array[][]): boolean {
    this.acc += 128;
    if (this.acc >= sampleRate / 20) {          // ~50ms
      this.port.postMessage({ tick: this.acc, ctxTime: currentTime, playing: true });
      this.acc = 0;
    }
    return true;
  }
}
registerProcessor('serial-clock', ClockProcessor);
```

```ts
// apps/web/src/audio/clock.ts
export function musicalTime(): number {
  const { tick, ctxTime, bpm, ppq } = useTransport.getState();
  const dt = audioCtx.currentTime - ctxTime;
  return tick + (dt * bpm * ppq) / 60;         // 逐帧调用，零分配
}
```

### 9.4 【v1.2 变更】visual-core 派生

```ts
// packages/visual-core/src/derive.ts
import { createPcg32 } from '@serial/s1-core/prng';   // 只复用算法构造器，不复用实例
import { VISUAL_SCHEMA, type VisualManifest } from './types';

const DOMAIN = 'SERIAL-VISUAL/0.1';
const enc = new TextEncoder();

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  // 浏览器走 WebCrypto；Node 走 node:crypto。两者输出一致，测试里对拍一次即可。
  if (globalThis.crypto?.subtle) {
    return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  }
  const { createHash } = await import('node:crypto');
  return new Uint8Array(createHash('sha256').update(bytes).digest());
}

/** 域分离：同一 seed 在视觉域得到与音乐域统计独立的 64-bit 值。 */
export async function deriveVisualSeed(
  seed: string,
  engineVersion: string,
  motifVersion: string,
): Promise<string> {
  const msg = enc.encode(
    [DOMAIN, motifVersion, engineVersion, seed.toLowerCase()].join('\u0000'),
  );
  const d = await sha256(msg);
  return [...d.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 纯函数。输入只有 (seed, engineVersion, motifVersion)。
 * 不读 Score、不读 events、不读 structureHash；不接收任何 RNG 句柄。
 */
export async function deriveVisualManifest(
  seed: string,
  engineVersion: string,
  motifVersion: string,
): Promise<VisualManifest> {
  const visualSeed = await deriveVisualSeed(seed, engineVersion, motifVersion);
  const rng = createPcg32(hexToU64(visualSeed));   // 独立实例，独立状态

  const nodes = placeNodes(rng);        // 16 个归一化节点，含最小间距约束
  const edges = routeEdges(rng, nodes); // 折线 ≤ 6 顶点，密度受 palette/density 控制
  const palette = pickPalette(rng);

  return {
    schema: VISUAL_SCHEMA,
    motifVersion,
    engineVersion,
    visualSeed,
    palette: ensureContrast(palette),   // 构建期断言 ≥ 4.5:1，不达标就换色阶
    nodes,
    edges,
    density: 0.35 + rng.nextF64() * 0.4,
  };
}
```

### 9.5 【v1.2 变更】渲染器与三个后端

```ts
// apps/web/src/features/circuit/types.ts —— 见 §4.5，接口不重复贴

// apps/web/src/features/circuit/useCircuitGeometry.ts
/** GenerativeWorld 等其它三维消费者只能从这里拿只读几何，不得自行派生。 */
export function useCircuitGeometry(): {
  positions: Float32Array;   // 节点世界坐标
  segments: Float32Array;    // 线段端点对
  palette: VisualPalette;
} {
  return useVisual((s) => s.geometry);   // 由 CircuitLayer 在 applyManifest 时写入
}
```

```tsx
// apps/web/src/features/circuit/CircuitLayer.tsx（骨架）
export function CircuitLayer() {
  const manifest = useVisual((s) => s.manifest);
  const renderer = useRef<CircuitRenderer | null>(null);

  useEffect(() => {
    const r = createThreeCircuitRenderer(gl, scene);
    renderer.current = r;
    return () => r.dispose();
  }, []);

  useEffect(() => {
    if (manifest) renderer.current?.applyManifest(manifest);  // 仅变更时
  }, [manifest]);

  useFrame(() => {
    const t = musicalTime();
    const step = Math.floor(t / useTransport.getState().ppq) % 16;
    const ev = useScore.getState().events[step];               // 只读
    renderer.current?.frame(
      { step, phase: (t / useTransport.getState().ppq) % 1 },
      { gate: ev?.gate ?? false, velocity: ev?.velocity ?? 0, accent: 1 },
    );
  });

  return null;
}
```

### 9.6 【v1.2 变更】隔离测试（四道闸的第三道）

```ts
// packages/s1-core/src/__tests__/isolation.test.ts
import { generate } from '../index';
import { beginDrawLedger } from '../prng.testing';   // 仅测试构建注入

const SEED = 'A7F209C13B8ED614';
const ENGINE = 'S1-POC1';

it('加载 visual-core 前后，音乐 PRNG 消耗序列与 hash 逐字节一致', async () => {
  const a = beginDrawLedger(() => generate(SEED, ENGINE));
  await import('@serial/visual-core');               // 动态加载，模拟同进程共存
  const b = beginDrawLedger(() => generate(SEED, ENGINE));

  expect(b.ledgerHash).toBe(a.ledgerHash);           // 顺序 + 取值，不只次数
  expect(b.hash).toBe(a.hash);
});

it('motifVersion 变更只改 manifest，不动 structure_hash', async () => {
  const { deriveVisualManifest } = await import('@serial/visual-core');
  const s1 = generate(SEED, ENGINE);
  const m0 = await deriveVisualManifest(SEED, ENGINE, 'motif/0');
  const m1 = await deriveVisualManifest(SEED, ENGINE, 'motif/1');

  expect(m0.visualSeed).not.toBe(m1.visualSeed);     // 视觉确实变了
  expect(generate(SEED, ENGINE).structureHash).toBe(s1.structureHash); // 音乐没变
});

it('同一 manifest 在 Canvas2D 与 three 后端下节点坐标逐点相等', () => {
  // 这是产品册 §5.4 "Web 3D 与 Serial Card 使用同一套节点/线路形态"的机器判据
});
```

### 9.7 【v1.2 变更】评审稿导出

```ts
// apps/web/src/features/circuit/exportPlate.ts —— 见 §5.3
// 输出物硬约束：文件名后缀 -REVIEW-ONLY.svg、mm 单位 viewBox、
// 头部注释不可关闭、全矢量、data-step 标注 0..15。
```

### 9.8 Link 与契约校验

```ts
// apps/web/src/features/link/useLink.ts
export function attachLink(link: Link) {
  const off = link.onMessage((msg) => {
    const parsed = ServerMessageSchema.safeParse(msg);
    if (!parsed.success) { link.close(); session.error('protocol'); return; }
    switch (parsed.data.kind) {
      case 'transport': useTransport.getState().apply(parsed.data.payload); break;
      case 'snapshot':  useScore.getState().adopt(parsed.data.payload); break;
      case 'control':   useParams.getState().mirror(parsed.data.payload); break;
      // identity / ack / audio_features 同理
    }
  });
  return off;
}
```

**【v1.2 变更】**`Adopt(snapshot)` 内部追加一步（不改 switch 结构）：

```ts
// apps/web/src/stores/score.ts
adopt(snapshot: Snapshot, engineVersion: string) {
  const score = buildScoreFromSnapshot(snapshot);
  const manifestP = deriveVisualManifest(snapshot.seed, engineVersion, MOTIF_VERSION)
    .catch(() => null);                    // 失败降级，不阻断
  set({ ...score });
  manifestP.then((m) => useVisual.getState().adoptVisual(m));  // 同批语义，不 await 阻塞
}
```

---

## 10. 风险与红线（Web 侧特有，叠加文档 10 章）

| 风险 | 具体表现 | 工程对策 |
| --- | --- | --- |
| 用 rAF 当音乐时钟 | 后台页签、掉帧导致掉拍 | AudioWorklet 时钟 + 外推；code review 硬拦 |
| 把 3D 塞进 G1 | 12 人日与现金上限失守 | 构建期断言：G1 chunk 不含 three |
| 连接能力过度承诺 | iPhone 用户点"连接"报错 | 支持矩阵前置展示；能力检测后隐藏入口 |
| 概念渲染被当现货 | 用户以为已可购买 | 概念资产带水印标记；销售图只用 CAD/实拍 |
| 协议"尽力解析" | 脏数据污染 store，状态错乱 | 校验失败即断链 |
| 双端分叉 | 同 Seed 声音不一致 | Golden Vectors 回归 + engine_version 强校验 |
| 断线即静音 | 现场事故 | 强制降级为本地 Preview，音频不停 |
| 视觉档位抖动 | 观感劣化 | 只降不升；升档需 10 秒达标 |
| **【v1.2 变更】视觉改动反噬 `structure_hash`** | **某次"只改配色"的提交让 hash 漂移，卡片与实机音乐对不上，且三组旧向量不报警** | **包边界 + 独立 PRNG 实例 + draw 账本测试 + CI 依赖图/体积断言（§4.3 四道闸）。四道缺一即视为未隔离** |
| **【v1.2 变更】浏览器 SVG 被当成制造数据** | **有人把 `*-REVIEW-ONLY.svg` 直接发给板厂，或前端同事按它改 KiCad 层号** | **文件名后缀 + 不可关闭的头部注释 + UI 水印 + PR 模板明令；`.layer` 字段注释写死"非电气层"** |
| **【v1.2 变更】manifest schema 未冻结导致返工** | **G2 中途改字段，卡片图形与网页同时崩** | **字段分"必需/可选"两级；渲染器未知字段丢弃；`schema` 进缓存键，改版自动失效；`motifVersion` 单独门控图案** |
| **【v1.2 变更】PCB 装饰过密不可辨认** | **面板上旋钮刻度读不清，16-step 状态看不出** | **节点最小间距 ≥ 6% 归一化宽度、边顶点 ≤ 6、评审稿 1:1 打印检查脚本（§5.4）** |
| **【v1.2 变更】频闪/运动敏感** | **Demoscene 风格光路高频闪烁引发不适或光敏风险** | **闪烁 ≤ 3 Hz；`prefers-reduced-motion` 下静态拓扑；舞台提供"低动效"预设** |
| **【v1.2 变更】卡片图案与 PCB 图案品牌割裂** | **卡面一套语汇、面板另一套，横向设计语言名存实亡** | **同一 `VisualManifest`、同一母版 SVG 语汇；G2 验收要求两处节点形态一致（有单测）** |
| **【v1.2 变更】派生漂移** | **PCG32 算法或采样细节一变，所有卡面图案悄悄变了** | **`tools/visual-ref` 存指纹；改 PRNG 必须 bump `motifVersion` 并更新参考向量** |
| **【v1.2 变更】视觉成为"能不能听"的前置** | **派生失败导致播放按钮灰色，G1 转化直接受损** | **派生旁路化：失败降级为 v0.1 hash 视觉，埋点 `visual_degraded`** |

---

## 11. 待确认清单（需要产品/硬件侧拍板，前端无法自决）

1. S1 校验字符是否已冻结；未冻结期间，Web 只做长度/字符集校验并显示"草案"。
2. `tick` 的单位是 ticks 还是 sample position（文档 6.2 明确未定）。
3. 局域网设备的发现方式（mDNS / 二维码 / 固定 IP）与端口。
4. `capabilities` 能力位的具体枚举。
5. `control_id` 命名表（是否就用 `EC11#1`…`CRACK` 这套字面量）。
6. Physical Twin 的 CAD 可用时间点——它决定 G2 资产管线能否按时启动。
7. **【v1.2 变更】`visual_manifest` 的 schema 由谁冻结、何时冻结**：前端只能提草案（§4.4），冻结权在产品/设计。未冻结期间前端只用"字段可用"级别，不写死语义。
8. **【v1.2 变更】`motifVersion` 的语义与递增规则**：是"算法版本"还是"图案族版本"？两者混用会让参考向量失去意义。
9. **【v1.2 变更】`visual_seed` 位宽**：64-bit 是否足够。若未来要做"同 Seed 的多个视觉变体"（parent/child serial），可能需 128-bit；现在定 64-bit 会在协议外多一层扩展成本，但改宽度的代价也很低（本地派生，不动协议）——建议先 64-bit 并在类型里保留 `visualSeedExt?: string`。
10. **【v1.2 变更】卡面图形归属**：由前端从 manifest 生成，还是由设计定稿母版 + 前端只做参数替换？这直接决定 §8.3 里那 1.5 人日是否成立。
11. **【v1.2 变更】板厂工艺口径**：最小线宽/间距/开窗/露铜的最小值。前端不做 DRC，但母版 SVG 的图形密度上限要与工艺能力对齐，否则设计稿天生不可制造。

---

## 附：v1.2 原文对照要点（供评审时逐条核对）

| 产品册 v1.2 位置 | 原文要点 | 本文对应 |
| --- | --- | --- |
| §2 横向设计语言 | PCB 图案在实体侧为可见面板/丝印；Web 3D 与 Card 上为由 Seed 派生的节点、线路、字符、光路；**实体 PCB 量产图案不自动逐张按 Seed 定制** | §3.1 第三层、§5.1、§5.2 |
| §5.4 统一生成原则 | 从版本与 Seed 派生 `visual_seed` → `visual_manifest`（节点位置、连线规则、密度、色系、纹样版本）；**与音乐 PRNG 流隔离，绝不改 `structure_hash`**；schema/散列/域分离/测试向量另行设计 | §4.2、§4.3、§4.4、§9.4 |
| §5.4 Three.js 媒介行 | 同一组节点与线路拓扑转为三维光路；**由视觉派生状态控制，不改变 S1 音乐事件或随机数消耗顺序** | §3.2 第四条纪律、§9.5 |
| §5.4 Serial Card 行 | **G1 不增加范围**；首轮固定简洁卡面，后续再启用 Seed 生成图案 | §2.3 A、§8.3 零影响表 |
| §5.4 制造与工艺纪律 | 先原理图/Layout/DRC 再叠丝印；SVG 导入 KiCad 逐层核对；装饰铜/开窗需确认电气与可制造性；装饰图不得被误当真实走线 | §1.2 不选、§5.1、§5.2 |
| §5.4 设计验收（G2） | 一张可制造艺术面板/PCB 版稿；旋钮刻度与 16-step 清晰；实物打样；**Web 3D 与 Card 用同一套节点/线路形态** | §5.5、§8.2 G2-c |
| §8 G1 | 仅一次性 WebAudio 页面；**不做 Three.js 复杂场景，也不增加 PCB Art 设计/制板**；12 人日 | §8.3 零影响表、§7.2 断言 |
| §9 风险表 | "PCB Art 破坏功能或抬高成本"、"G1 被 Three.js 范围吞噬" | §10 对应两行 |
| §12 版本说明 | 三项新增 + "明确不变：G1 仍 12 人日，不新增 PCB Art、复杂 Three.js 或量产任务" | 全文，尤其 §0 与 §8.3 |
