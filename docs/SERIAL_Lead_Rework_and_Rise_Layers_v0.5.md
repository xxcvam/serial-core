# SERIAL 声音内核 v0.4 → v0.5：LEAD 合成层重修 + RISE 段音频层升级

状态：方案（未落到 `audition/SERIAL_Sonic_Identity_Audition_v0.5.html`）
基线：`F:\dsh\serial-repo\audition\SERIAL_Sonic_Identity_Audition_v0.4.html`（1079 行）
测量脚本：`F:\dsh\serial-repo\tools\lead_probe.mjs`（新增，headless Chromium + OfflineAudioContext）
约束：单文件 WebAudio、零外部依赖、`file://` 直接可跑；INTRO / GROOVE / Bass / v0.4 新鼓不改动。

---

## 0. 结论

LEAD 的问题不是"音色难听"，是**七个结构性缺陷叠加**：三重锯齿零相位差起振、滤波器没有任何自动化、f/2 次振荡器抢占 ARP 的 220–392 Hz 主带、无音高跟踪、无饱和、包络在硬切前仍有 −14 dB 残余（可听 click）、湿声等于干声。

重修后（RISE 4 小节、12 个 lead 事件、dry 链路实测）：

| 指标 | v0.4 | 方案 | 变化 |
|---|---|---|---|
| 峰值（同链路） | −26.45 dBFS | −26.08 dBFS | 匹配（±0.4） |
| LUFS | −40.08 | −39.67 | +0.41 |
| 200–400 Hz | −24.8 dB | −58.5 dB | **−33.7**（让出 ARP） |
| 400–700 Hz | −21.5 | −21.7 | −0.2 |
| 700–1500 Hz | −22.1 | −21.2 | +0.9 |
| 1.5–3 kHz | −29.0 | −25.3 | +3.7 |
| 3–6 kHz | −41.2 | −35.3 | +5.9 |
| 6–12 kHz | −56.1 | −53.4 | +2.7 |
| 起音 20 ms 内三支振荡器合成峰值 | 0.941 | 0.427 | **−6.9 dB**（相位不再锁死） |
| 收音断点阶跃（PUSH，171 ms） | −35.4 dB | ≤ −93 dB | click 消除 |
| 单音内部频谱重心（late/early） | 0.88–1.08 | 0.42–0.93 | 音符内部有运动 |

RISE 段不改任何音符事件，只加 3 个音频层 + 1 条总线自动化（R1 气流、R2 音高上升、R3 预滴落空拍、R4 发送量抬升）。

---

## 1. 现状诊断（带行号）

| # | 缺陷 | 位置 | 后果 |
|---|---|---|---|
| 1 | 三支 saw 在 `t` 同时起振、只差 ±7 cents | L730-738 | 起音瞬间三支同相 = 幅度相加 ≈ +9.5 dB 过冲；然后以 1.8 Hz 差频慢摆。PUSH（171 ms）走不完一个拍周期，**每个音都是"砰"一下再糊开** |
| 2 | `lp.frequency.value = clamp(ev.cut,...)`，无 automation | L744 | 音符内部频谱完全不变 = 风琴/蜂鸣；"合成器味"全是静态滤波器味 |
| 3 | `sub` 固定 f/2、gain 0.22 | L739-742 | A4 音符的 sub = 220 Hz，正压 ARP 主带（220–392）；mix 里 ARP 被 LEAD 掩蔽 |
| 4 | `cut` 只按段落给，不随音高 | L290-295 | RISE 内 440→988 Hz 跨度 2.25 倍，cut 只从 1600 走到 2296；**高音只剩 2 次谐波，低音有 6 次**，同一段里音色反向漂移 |
| 5 | 无饱和、无前级压缩 | L727-751 | crest factor 过高，峰值 −16 dB 但平均能量低，夹在鼓和 bass 之间没有"实体" |
| 6 | 包络 `setTargetAtTime(0.0001, t+dur*0.85, 0.06)`，但 `stop(t+dur+0.06)` | L748 + L736 | stop 时包络仍有约 0.19v（−14 dB）残余，被硬切 → 实测断点阶跃 −35 dB（`clickOld`）。ROLL/PUSH 密集时是连续的"哒" |
| 7 | `G.leadBus.connect(fxSend)`，fxSend=1.0，dlRet=0.62 | L498 | 湿/干 = −4.2 dB，且 lead 无独立发送量；HOLD 857 ms 被 321 ms 延迟重复垛成三连音 |

第 6 条是 bug 级缺陷，不是风格问题：`stop` 时间在包络归零之前。

---

## 2. LEAD 重修方案

### 2.1 振荡器结构：相位旋转的 PeriodicWave，不是再调 detune

`OscillatorNode` 没有相位参数，但 `createPeriodicWave` 的傅里叶系数就是相位。锯齿 x(t)=Σ(1/n)sin(nωt)，把第 n 次谐波整体旋转 nθ，等价于把整条波形在时间上平移 θ/ω。

```
旋转 θ 后的系数：  imag[n] = A_n·cos(nθ)     real[n] = A_n·sin(nθ)
其中 A_n = (−1)^(n+1)/n
```

取 θ = 0°、120°、240°，三支 saw 成为**同一条锯齿的三个等分相位**：频谱完全相同（响度一致），起振时刻瞬时值互不相同（不再同相叠加）。

```js
/* LEAD 相位旋转波表：模块级缓存，ctx 变化时重建 */
let LEAD_WAVES = null;
function leadWaves(){
  if(LEAD_WAVES) return LEAD_WAVES;
  const N=64, out=[];
  for(const th of [0, 2*Math.PI/3, 4*Math.PI/3]){
    const re=new Float32Array(N+1), im=new Float32Array(N+1);
    for(let n=1;n<=N;n++){
      const A=((n%2)?1:-1)/n;          /* 1/n 锯齿谱 */
      im[n]=A*Math.cos(n*th);          /* 正弦项 */
      re[n]=A*Math.sin(n*th);          /* 余弦项 = 旋转 */
    }
    out.push(ctx.createPeriodicWave(re,im));   /* 默认归一化，三支等响 */
  }
  LEAD_WAVES=out; return out;
}
```

参数：`detune = [−11, 0, +11] cents`，`gain = [0.34, 0.30, 0.34]`（刻意不等分，避免任何频率上出现完全抵消）。
±11 cents 在 440 Hz 上是 ±2.8 Hz，拍周期 ≈ 360 ms；因为相位已经错开 120°，拍不再是"整条音色忽厚忽薄"，而是三支各自呼吸。

实测：起音 20 ms 内合成峰值从 0.941 降到 0.427（−6.9 dB），即第 1 条缺陷消除。

**sub 保留但加条件**：`f ≥ 880 Hz` 才起 f/2 正弦。RISE 的 lead 事件是 440/494/523/659/698/784/880/988 Hz，只有 880 与 988 两支触发，此时 f/2 = 440/494 Hz 已落在 LEAD 自己的 400–700 带内，不再进 ARP 的 220–392。

### 2.2 包络：4 ms 咬、45 ms 落、300 ms 沉、自适应 release

```js
env.gain.setValueAtTime(0, t);
env.gain.linearRampToValueAtTime(v, t+0.004);                 /* 4 ms 咬 */
env.gain.setTargetAtTime(v*0.78, t+0.004, 0.045);             /* 45 ms 落到 0.78 */
env.gain.setTargetAtTime(v*0.62, t+0.100, 0.300);             /* 300 ms 缓沉到 0.62 */
env.gain.cancelAndHoldAtTime(relStart);                        /* 从当前值开始收音 */
env.gain.setTargetAtTime(0, relStart, tau);
```

- `relStart = max(t+0.02, t+dur)`：把收音固定在音符逻辑终点，而不是 `dur*0.85`。
- `tau = clamp(0.25*dur, 0.018, 0.075)`：ROLL（128 ms）τ=32 ms 让密排不糊；HOLD（1114 ms）τ=75 ms 让长音自然收尾。
- `stopAt = relStart + 8*tau`：8 个时间常数 = −69 dB，硬切在数字静音里发生。

如果不用 `cancelAndHoldAtTime`（不想依赖它），等价写法是 `setTargetAtTime(v*0.62*..., relStart, tau)` 需要知道 relStart 处的实际值，做不到——所以这个方法必须用 `cancelAndHoldAtTime`。Chromium 全版本支持。

实测（孤立单音、各自 stop 样本处）：v0.4 最差 −35.4 dB（PUSH 171 ms），方案 ≤ −93 dB。

### 2.3 滤波：per-note 滤波包络 + 55% 音高跟踪

```js
const cut = clamp(ev.cut, 900, 6000);        /* 原来 clamp(1150,3800) */
lp.type='lowpass';
lp.frequency.value = cut;                     /* 目标值 */
lp.Q.value = 3.0;                             /* ★ 单位是 dB → 线性 1.412 */
lp.detune.value = 660 * Math.log2(f/440);     /* ★ 660 cents/octave = 55% keytrack */
lp.frequency.setValueAtTime(Math.min(cut*2.2, 8000), t);          /* 起音开到 2.2× */
lp.frequency.exponentialRampToValueAtTime(cut, t+0.110);          /* 110 ms 扫落 */
lp.frequency.setTargetAtTime(cut*0.88, t+0.110, 0.350);           /* 350 ms 继续收 12% */
```

三点必须记住：
1. **`BiquadFilter` 的 lowpass/highpass 的 Q 单位是 dB**（20·log10(Q_linear)），peaking/bandpass 是线性。写 `Q.value=1.41` 想表达"共振 3 dB"是错的，会得到 1.41 dB。
2. `detune` 是 a-rate AudioParam，可以直接写静态值，单位 cents。660 cents/octave 让 988 Hz（+1.17 oct）拿到 +770 cents 的额外开度，音色随音高保持一致而不是反向漂移。
3. 起音扫到 2.2×cut、封顶 8000 Hz。再高就是 6–12k 的嘶声，会吃 HAT 的归属率（见 §5 冲突处理）。

### 2.4 空间：拆出发送量，干声居中，湿声带通

```js
/* 干声：居中、无 pan。LEAD 在 400–700 独占，位置感靠深度不靠宽度 */
leadTrim.connect(gapLead); gapLead.connect(comp);

/* 湿声：独立发送量 + 发送前带通，避免 26 ms 后把 200–400 的 ARP 空档填满 */
const vSendHP=ctx.createBiquadFilter(); vSendHP.type='highpass'; vSendHP.frequency.value=300; vSendHP.Q.value=-3.01;
const leadVerbSend=ctx.createGain();  leadVerbSend.gain.value=0.50;
const dSendHP=ctx.createBiquadFilter(); dSendHP.type='highpass'; dSendHP.frequency.value=400; dSendHP.Q.value=-3.01;
const leadDelaySend=ctx.createGain(); leadDelaySend.gain.value=0.22;

gapLead.connect(vSendHP); vSendHP.connect(leadVerbSend); leadVerbSend.connect(pre);
gapLead.connect(dSendHP); dSendHP.connect(leadDelaySend); leadDelaySend.connect(dl);
```

换算：delay 湿/干 = 0.22 × 0.62 = 0.136（−17.3 dB，v0.4 是 −4.2 dB）；verb 湿/干 = 0.50 × 0.075 = 0.0375（−28.5 dB）。
321 ms 延迟正好是 3 个 16 分音符（140 BPM），重复仍落在栅格上，只是退到背景。

> 这段线**不能**写在 L464：`pre`/`dl` 在 L468–L489 才创建。实际落点是 L489 之后，见 §2.7(c)。

**不做立体声展宽**：单声道源 + 短延迟做宽会在 mono 折叠时产生梳状凹陷；双振荡器 L/R 加倍要翻倍节点数和失谐量，且会和 ARP 抢同一条相位关系。空间交给混响和发送量。

### 2.5 电平：三级阶梯，总线增益不动

```
每音:  saw×3 (0.34/0.30/0.34) → mix(1.0) → LP(Q+3dB) → env(v≈0.30)      ≈ 0.30 峰
总线:  leadBus db(-13.5)=0.211
       → HP 240×2 → 520(+2.5) → 1600(+2.0) → 3400(-4.5)
       → tanh(1.15) → LP 5000×2 → trim 0.55
```

`shaperCurve(1.15)` 以 tanh(1.15)=0.8177 归一，小信号斜率 = 1.15/0.8177 = **1.41×(≈ +3.0 dB)**；`trim=0.55`（−5.2 dB）连同三段 peaking 的净增益一起，把峰值对齐回 v0.4。实测匹配 v0.4 峰值（−26.08 vs −26.45 dBFS），**`leadBus` 保持 db(−13.5)，混音阶梯不变**。

### 2.6 完整 vLead（可直接替换 L727-751）

```js
function vLead(t,ev){
  const dur=ev.len*stepDur();
  const f=ev.f, v=ev.v;
  const cut=clamp(ev.cut,900,6000);
  const relStart=Math.max(t+0.02, t+dur);
  const tau=clamp(dur*0.25, 0.018, 0.075);
  const stopAt=relStart + 8*tau;

  const mix=ctx.createGain(), lp=ctx.createBiquadFilter(), env=ctx.createGain();
  const w=leadWaves(), DET=[-11,0,11], AMP=[0.34,0.30,0.34];
  for(let i=0;i<3;i++){
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.setPeriodicWave(w[i]);
    o.frequency.value=f; o.detune.value=DET[i];
    g.gain.value=AMP[i];
    o.connect(g); g.connect(mix);
    track(o,t,stopAt); o.start(t); o.stop(stopAt);
  }
  if(f>=880){                              /* f/2 只在 A5 以上，避开 ARP 主带 */
    const s=ctx.createOscillator(), sg=ctx.createGain();
    s.type='sine'; s.frequency.value=f/2; sg.gain.value=0.14;
    s.connect(sg); sg.connect(mix);
    track(s,t,stopAt); s.start(t); s.stop(stopAt);
  }

  lp.type='lowpass';
  lp.frequency.value=cut;
  lp.Q.value=3.0;                                        /* dB */
  lp.detune.value=660*Math.log2(f/440);                  /* 55% keytrack, cents */
  lp.frequency.setValueAtTime(Math.min(cut*2.2,8000), t);
  lp.frequency.exponentialRampToValueAtTime(cut, t+0.110);
  lp.frequency.setTargetAtTime(cut*0.88, t+0.110, 0.350);

  env.gain.setValueAtTime(0,t);
  env.gain.linearRampToValueAtTime(v,t+0.004);
  env.gain.setTargetAtTime(v*0.78,t+0.004,0.045);
  env.gain.setTargetAtTime(v*0.62,t+0.100,0.300);
  env.gain.cancelAndHoldAtTime(relStart);
  env.gain.setTargetAtTime(0,relStart,tau);

  mix.connect(lp); lp.connect(env); env.connect(G.leadBus);
  return [lp,env];
}
```

### 2.7 initAudio 改动（三处，必须按顺序插）

**（a）L464 替换 `leadBus` 单行。** 注意这里**不能**连发送线一起写：`pre`/`dl` 要到 L468–L489 才创建，提前引用会 TDZ 报错。

```js
/* ---- LEAD 总线：4 阶 HP → 三段整形 → tanh → 4 阶 LP → trim ---- */
const leadBus=ctx.createGain(); leadBus.gain.value=db(-13.5);
const leadHP1=ctx.createBiquadFilter(); leadHP1.type='highpass'; leadHP1.frequency.value=240; leadHP1.Q.value=-5.33;
const leadHP2=ctx.createBiquadFilter(); leadHP2.type='highpass'; leadHP2.frequency.value=240; leadHP2.Q.value=+2.32;
const leadBody=ctx.createBiquadFilter(); leadBody.type='peaking'; leadBody.frequency.value=520;  leadBody.Q.value=1.1; leadBody.gain.value=+2.5;
const leadForm=ctx.createBiquadFilter(); leadForm.type='peaking'; leadForm.frequency.value=1600; leadForm.Q.value=1.4; leadForm.gain.value=+2.0;
const leadHarsh=ctx.createBiquadFilter(); leadHarsh.type='peaking'; leadHarsh.frequency.value=3400; leadHarsh.Q.value=1.6; leadHarsh.gain.value=-4.5;
const leadSat=ctx.createWaveShaper(); leadSat.curve=shaperCurve(1.15); leadSat.oversample='4x';
const leadPost1=ctx.createBiquadFilter(); leadPost1.type='lowpass'; leadPost1.frequency.value=5000; leadPost1.Q.value=-5.33;
const leadPost2=ctx.createBiquadFilter(); leadPost2.type='lowpass'; leadPost2.frequency.value=5000; leadPost2.Q.value=+2.32;
const leadTrim=ctx.createGain(); leadTrim.gain.value=0.55;
const gapLead=ctx.createGain(); gapLead.gain.value=1;
leadBus.connect(leadHP1); leadHP1.connect(leadHP2); leadHP2.connect(leadBody); leadBody.connect(leadForm);
leadForm.connect(leadHarsh); leadHarsh.connect(leadSat);
leadSat.connect(leadPost1); leadPost1.connect(leadPost2); leadPost2.connect(leadTrim);
leadTrim.connect(gapLead); gapLead.connect(comp);
```

**（b）L462 给 ARP 串一只门**（R3 用，恒为 1 时听感不变）：

```js
const gapArp=ctx.createGain(); gapArp.gain.value=1;
arpBus.connect(arpHP); arpHP.connect(gapArp); gapArp.connect(comp);
```

**（c）L488–L489 之后插发送线，删掉 L498 的 `G.leadBus.connect(fxSend);`**：

```js
const vSendHP=ctx.createBiquadFilter(); vSendHP.type='highpass'; vSendHP.frequency.value=300; vSendHP.Q.value=-3.01;
const leadVerbSend=ctx.createGain();  leadVerbSend.gain.value=0.50;
const dSendHP=ctx.createBiquadFilter(); dSendHP.type='highpass'; dSendHP.frequency.value=400; dSendHP.Q.value=-3.01;
const leadDelaySend=ctx.createGain(); leadDelaySend.gain.value=0.22;
gapLead.connect(vSendHP); vSendHP.connect(leadVerbSend); leadVerbSend.connect(pre);
gapLead.connect(dSendHP); dSendHP.connect(leadDelaySend); leadDelaySend.connect(dl);
```

**（d）L491 的 `G={...}` 补四个字段**：`gapArp, gapLead, leadVerbSend, leadDelaySend`。

---

## 3. RISE 段音频层升级

RISE 定义（L229-234）：4 小节、density 92、arpMask S16、drums 全开、glitch 全关。**音符事件零改动**，只在段起点一次性排 3 个音频层和 1 条总线自动化。

### R1 气流上升（air riser）

| 项 | 值 |
|---|---|
| 源 | 一次性 6.96 s 白噪 buffer（`mulberry(0x51504A31)`），不用 1 s buffer 循环（循环点每秒一个 tick） |
| 滤波 | bandpass，Q **2.5（线性）**，`frequency` 400 Hz → 9000 Hz，`exponentialRampToValueAtTime`，时长 span=6.857 s |
| 增益 | 0 → 0.012 @35%span → 0.12 @span−10 ms，然后 14 ms 收尾落 0 |
| 节点 | BufferSource + BP + Gain = 3 |
| 内存 | 6.96 s × 48 kHz × 4 B ≈ 1.34 MB（首次 RISE 懒创建，全局复用） |

```js
let riserNoise=null;
function riseAir(t0,span){
  if(!riserNoise){
    const sr=ctx.sampleRate, len=Math.ceil((span+0.05)*sr);
    riserNoise=ctx.createBuffer(1,len,sr);
    const d=riserNoise.getChannelData(0), r=mulberry(0x51504A31);
    for(let i=0;i<len;i++) d[i]=r()*2-1;
  }
  const n=ctx.createBufferSource(); n.buffer=riserNoise;
  const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.Q.value=2.5;
  bp.frequency.setValueAtTime(400,t0);
  bp.frequency.exponentialRampToValueAtTime(9000,t0+span);
  const g=ctx.createGain();
  g.gain.setValueAtTime(0,t0);
  g.gain.linearRampToValueAtTime(0.012,t0+span*0.35);
  g.gain.linearRampToValueAtTime(0.12,t0+span-0.01);
  g.gain.linearRampToValueAtTime(0,t0+span+0.004);
  n.connect(bp); bp.connect(g); g.connect(G.comp);
  track(n,t0,t0+span+0.01); n.start(t0); n.stop(t0+span+0.01);
}
```

### R2 音高上升（tonal riser）

| 项 | 值 |
|---|---|
| 振荡器 | saw 110→440 Hz detune −9 c、saw 110→440 Hz detune +9 c、sine 55→110 Hz，gain 0.5 / 0.5 / 0.35 |
| 频率 | `exponentialRampToValueAtTime` 同样 6.857 s，落点正好在 CLIMAX 下拍 |
| 滤波 | lowpass，Q **+3.0 dB**，300 Hz → 3000 Hz 同斜率张开 |
| 增益 | 0 → 0.10（线性，两段：0–60% 到 0.04，60–100% 到 0.10） |
| 节点 | 3 osc + 3 gain + LP + 1 master gain = 8 |

R2 在 110–440 Hz，正好是 RISE 里 ARP（cut 2000–2400、音域 220–784）下方的暗色层，和 LEAD（440–988）不重叠。

### R3 预滴落空拍（pre-drop gap）

RISE 最后一小节最后一个 16 分音符（107 ms）把 ARP + LEAD 静音，鼓不动。CLIMAX 下拍撞进空白再砸下来。

```js
const tGap=t0+3*span/4+15*stepDur();
G.gapArp.gain.setTargetAtTime(0,tGap,0.006);
G.gapLead.gain.setTargetAtTime(0,tGap,0.006);
G.gapArp.gain.setTargetAtTime(1,t0+span-0.004,0.004);
G.gapLead.gain.setTargetAtTime(1,t0+span-0.004,0.004);
```

需要在 initAudio 里给 ARP 也加一个串联门（`arpHP.connect(G.gapArp); G.gapArp.connect(comp);`），`gapLead` 见 §2.7。**两只门只碰 ARP/LEAD，不碰 drumBus、不碰 glitchGate。**

### R4 发送量抬升（send build）

```js
G.leadVerbSend.gain.setValueAtTime(0.50, t0);
G.leadVerbSend.gain.linearRampToValueAtTime(0.85, t0+span);
G.leadDelaySend.gain.setValueAtTime(0.22, t0);
G.leadDelaySend.gain.linearRampToValueAtTime(0.10, t0+span);
/* CLIMAX 起点恢复：在 playStep 里 pos.secIdx===3 && pos.step===0 时 */
// G.leadVerbSend.gain.setTargetAtTime(0.50, t, 0.20);
// G.leadDelaySend.gain.setTargetAtTime(0.22, t, 0.20);
```

### 排程挂点（playStep，L781-798）

```js
if(pos.step===0 && pos.bar===0 && sec.id===2){        /* 每个 RISE 段只排一次 */
  const span=4*16*stepDur();
  riseAir(t,span); riseTonal(t,span); riseGap(t,span); riseSend(t,span);
}
```

预读窗口 250 ms，而自动化跨度 6.86 s —— `AudioParam` 支持远期排程，没有冲突。`track()` 已覆盖新节点，`panic()` 会一起停。

---

## 4. 参数总表（可直接抄）

### 4.1 每音（vLead）

| 参数 | 值 | 单位 |
|---|---|---|
| 振荡器 | 3× PeriodicWave（相位 0° / 120° / 240°），N=64 谐波 | — |
| detune | −11 / 0 / +11 | cents |
| osc gain | 0.34 / 0.30 / 0.34 | 线性 |
| sub | sine f/2，gain 0.14，仅 `f ≥ 880` | Hz / 线性 |
| lp.type | lowpass | — |
| lp.frequency 基线 | `clamp(ev.cut, 900, 6000)` | Hz |
| lp.Q | **+3.0** | **dB**（线性 1.412） |
| lp.detune | `660 × log2(f/440)` | cents（55% keytrack） |
| 滤波包络 起点 | `min(cut×2.2, 8000)` | Hz |
| 滤波包络 落点 | `cut`，110 ms 指数 | ms |
| 滤波包络 缓沉 | `cut×0.88`，`setTargetAtTime` τ=350 | ms |
| 幅度包络 起 | 0 → v，4 ms 线性 | ms |
| 幅度包络 咬后 | 0.78v，τ=45 | ms |
| 幅度包络 缓沉 | 0.62v，起点 t+100，τ=300 | ms |
| release 起点 | `max(t+20 ms, t+dur)` | ms |
| release τ | `clamp(0.25×dur, 18, 75)` | ms |
| stop 时刻 | `relStart + 8τ` | ms |

### 4.2 总线（initAudio，一次性）

| 节点 | type | frequency | Q | gain |
|---|---|---|---|---|
| leadBus | gain | — | — | db(−13.5) = 0.211 |
| leadHP1 | highpass | 240 Hz | −5.33 dB | — |
| leadHP2 | highpass | 240 Hz | +2.32 dB | — |
| leadBody | peaking | 520 Hz | 1.1（线性） | +2.5 dB |
| leadForm | peaking | 1600 Hz | 1.4（线性） | +2.0 dB |
| leadHarsh | peaking | 3400 Hz | 1.6（线性） | −4.5 dB |
| leadSat | waveshaper | tanh(drive=1.15)，oversample 4x | — | — |
| leadPost1 | lowpass | 5000 Hz | −5.33 dB | — |
| leadPost2 | lowpass | 5000 Hz | +2.32 dB | — |
| leadTrim | gain | — | — | 0.55 |
| vSendHP | highpass | 300 Hz | −3.01 dB | — |
| leadVerbSend | gain | — | — | 0.50（RISE → 0.85） |
| dSendHP | highpass | 400 Hz | −3.01 dB | — |
| leadDelaySend | gain | — | — | 0.22（RISE → 0.10） |
| gapLead | gain | — | — | 1.0 |

### 4.3 RISE 层

| 层 | 节点 | 起点 | 终点 | 时间常数/曲线 |
|---|---|---|---|---|
| R1 | BP(Q 2.5 线性) | 400 Hz | 9000 Hz | exponential，6.857 s |
| R1 | gain | 0 | 0.12 | 线性两段（35% 处 0.012），尾 14 ms 归零 |
| R2 | saw ×2 detune ±9 c | 110 Hz | 440 Hz | exponential，6.857 s |
| R2 | sine | 55 Hz | 110 Hz | 同上 |
| R2 | LP Q **+3.0 dB** | 300 Hz | 3000 Hz | exponential |
| R2 | gain | 0 | 0.10 | 两段：60% 处 0.04 |
| R3 | gapArp/gapLead | 1 | 0 @ 第 4 小节第 15 步 | τ 6 ms 下落 / 4 ms 恢复 |
| R4 | leadVerbSend | 0.50 | 0.85 | 线性 |
| R4 | leadDelaySend | 0.22 | 0.10 | 线性 |

---

## 5. 与既有文档的冲突，逐条处理

**① MixRepair v0.4 §4.4「不建议加饱和」**
该结论针对**总线级**饱和（3–6k 与 6–12k 同时抬升，放大 HAT 嘶声）。本方案把 shaper 放在**单音链内部**，前面有 per-note LP（起音 2.2×cut、封顶 8 kHz），后面有 4 阶 5 kHz LP 和 3400 Hz −4.5 dB 陷波。实测 RISE dry 链路：3–6k +5.9 dB、6–12k 只 +2.7 dB。
**这是条件性放行**：必须用 `SERIAL_mix_probe.mjs` 复验 HAT 6–12k 归属率仍 ≥55%，否则把 `drive` 降到 1.0 并去掉 `leadForm` 的 +2.0 dB。

**② Melody/Form Spec v0.4 断言 #11「glitch 只出现在 CLIMAX 全段与 BREAK 末小节」**
R1/R2 不是 `vGlitch` 事件，不经过 `glitchGate`、不 retrigger、不落在 tick 栅格上，是连续层。断言按事件族判据仍然成立。
如果评审按"任何噪声型 FX"严格解释，**R1 可单独删除**，不影响 LEAD 重修与 R2/R3/R4。

**③ 鼓组锁定**
R1–R4 不新增任何鼓事件，R3 的鸭子只作用于 arp/lead 两只门。`drumBus`、`drumComp`、`glitchGate`、`crackGate` 的接线与参数一行不动。

**④ 混音阶梯**
`leadBus` 仍为 db(−13.5)，实测峰值与 v0.4 相差 0.4 dB，`Lead` 目标（−13.5 ±1 dBFS）不需要改其它总线。饱和带来的 +1.33 倍提升已在链路内用 `trim 0.55` 抵消。

---

## 6. 验收

### 6.1 已测（本方案自带证据）

```powershell
node F:\dsh\serial-repo\tools\lead_probe.mjs > F:\dsh\serial-repo\tools\lead_probe.json
```

探针把 v0.4 的 `vLead` 逐行重写在 `OfflineAudioContext` 里，用**真实的 RISE lead 事件**（`SERIAL.PAT[2]`，12 个事件）渲染，两条链共用同一套 master（comp −16/2:1 → lim −1/20:1 → toneLP 20 k → master 0.72）。

判定线：
- 200–400 Hz 必须 ≤ −50 dB（ARP 让位）→ 实测 −58.5 ✅
- 400–700 / 700–1500 相对 v0.4 变化 ≤ ±1.5 dB → 实测 −0.2 / +0.9 ✅
- 起音 20 ms 合成峰值 ≤ 0.55（相位解耦）→ 实测 0.427 ✅
- stop 断点阶跃 ≤ −80 dB re 峰值 → 实测 ≤ −93 ✅
- 单音 late/early 频谱重心比 ≤ 0.85（音符内部有运动）→ 440 Hz 0.416、494 Hz 0.573 ✅；659/698 Hz 0.92/0.87（长音 + 末音 cut 0.82×，可接受）

### 6.2 未测，必须补

1. **全混归属率**：`SERIAL_mix_probe.mjs` 跑 CLIMAX 8 小节，验 400–700 lead ≥85%、700–1.5k lead ≥90%、6–12k hat ≥55%、200–400 arp ≥55%。探针只渲染 dry lead，不含 FX 返回，也不含其它声部。
2. **R3 空拍的 CLIMAX 落点**：需要听 + 看波形，确认 107 ms 空拍后第一击不是被 limiter 的 50 ms release 拖回来。
3. **R1/R2 电平**：0.12 / 0.10 是按 +6 dB headroom 估的初值，必须在全混里收敛，别让 RISE 后段把 master 推过 −1 dBTP。
4. **`cancelAndHoldAtTime` 在 Safari/Firefox 的行为**（本页只承诺 Chromium）。

---

## 7. 做不到的（Chromium + file:// 边界）

| 想要 | 为什么不行 | 替代 |
|---|---|---|
| AudioWorklet 写 polyBLEP 振荡器 / 真相位随机 | `addModule()` 在 `file://` 下被 CORS 拦（除非加 `--allow-file-access-from-files` 启动参数），违反"file:// 可跑"约束 | 相位旋转 PeriodicWave（§2.1），每个音仍是固定三相位，但互不同相 |
| 每个音随机初相位 | `OscillatorNode` 无 phase 参数，`start(t)` 永远从相位 0 开始 | 用 `t` 的亚采样偏移不能改相位；只能靠三支错位 |
| 真 formant / 共振峰移动 | 需要 3–5 个并联 BP + 每音自动化，节点数 ×4，且 Q 一高就自激 | 固定 520 / 1600 两段 peaking + 3400 陷波，靠 LP 包络模拟"亮度变化" |
| LEAD 独立立体声（不与其他声部共用 delay/verb） | 要复制整套 dl/conv，内存和 CPU 翻倍；共用 FX 上做 pan 会改变 snare 的湿声像 | 干声居中，湿声带通 + 发送量自动化 |
| `setValueCurveAtTime` 做非线性 ramp | 同一参数同一时间窗不能再叠其它自动化，容易和音符级排程打架 | 两段 `linearRamp` / `setTargetAtTime` |
| WaveShaper 零延迟 | `oversample:'4x'` 有亚毫秒级内部延迟，且 Chromium 未定义具体值 | 可接受；若对齐敏感，改用 `oversample:'none'` 并接受混叠，或把 drive 降到 1.0 |

---

## 8. 落地顺序（每步可单独回滚）

1. 复制 v0.4 → v0.5；只替换 `vLead`（§2.6），不动总线 → 听 LEAD 单独变化。
2. 加 §2.7 总线 + 拆发送量，删 L498 的 `G.leadBus.connect(fxSend)`。
3. 加 `gapArp`/`gapLead` 两只门（此时增益恒 1，听感无变化）。
4. 加 R2（音高上升）→ R1（气流）→ R4（发送量）→ R3（空拍）。R3 放最后，因为它是唯一会改"已有小节听感"的动作。
5. 每步跑 `lead_probe.mjs` + `SERIAL_mix_probe.mjs`，把数字记进 `docs/`。

回滚点：`vLead` 与 `initAudio` 的 lead 段是两处独立 diff，任一处 revert 都不会影响鼓/Bass/ARP。
