// SERIAL mix probe — renders the shipped v0.3 bus graph and the proposed v0.4
// bus graph offline in headless Chrome, then reports per-voice band energy,
// LUFS, peak, FX contribution and band-ownership margins over 8 bars of CLIMAX.
//
// Note on bus splitting: the page's voice functions all end with `.connect(drumBus)`,
// reading the global at call time. So the probe re-points `drumBus` per voice before
// scheduling that voice's events, which is exactly equivalent to three parallel
// per-voice trims on a single context.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PAGE = 'file:///F:/dsh/SERIAL_Sonic_Identity_Audition_v0.3.html';
const PORT = 9333;

const HARNESS = String.raw`
(async () => {
  const SR = 48000;
  const BARS = 8;
  const SEC = 3;              // CLIMAX: all seven voices armed
  const VOICES = ['kick','snare','hat','bass','arp','lead','glitch'];
  const PERC = ['kick','snare','hat'];
  const barDur = (60/BPM)*4;
  const total = BARS*barDur + 2.0;
  const BANDS = [[30,60],[60,120],[120,250],[250,500],[500,1000],[1000,2000],[2000,5000],[5000,10000],[10000,20000]];
  const BLABEL = BANDS.map(b=>b[0]+'-'+b[1]);
  // musical grid: split where the arrangement actually divides (arp tops out at 392 Hz,
  // the lead's lowest note is 440 Hz, so 500 Hz is a bad ownership boundary)
  const MBANDS = [[30,60],[60,120],[120,200],[200,400],[400,700],[700,1500],[1500,3000],[3000,6000],[6000,12000],[12000,20000]];
  const MLABEL = MBANDS.map(b=>b[0]+'-'+b[1]);

  function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  function mkNoise(oc, secs, rnd){
    const b = oc.createBuffer(1, Math.floor(oc.sampleRate*secs), oc.sampleRate);
    const d = b.getChannelData(0);
    for (let i=0;i<d.length;i++) d[i] = rnd()*2-1;
    return b;
  }
  function mkIR(oc, rnd, secs){
    const len = Math.floor(oc.sampleRate*secs);
    const ir = oc.createBuffer(2, len, oc.sampleRate);
    for (let ch=0; ch<2; ch++){
      const d = ir.getChannelData(ch);
      for (let i=0;i<len;i++) d[i] = (rnd()*2-1)*Math.pow(1-i/len, 3.1);
    }
    return ir;
  }
  const kickTimes = () => {
    const out = [];
    for (let bi=0; bi<BARS; bi++){
      const bar = bi % FORM[SEC].bars;
      for (let st=0; st<16; st++){
        const ev = PAT[SEC][bar][st];
        if (ev && ev.kick) out.push(0.1 + bi*barDur + st*stepDur());
      }
    }
    return out;
  };

  // ---------- v0.3: verbatim transcription of initAudio() ----------
  function graphV03(oc, withMasterComp, rnd, fxOff){
    ctx = oc;
    master = oc.createGain(); master.gain.value = MASTER_LEVEL;
    if (withMasterComp){
      comp = oc.createDynamicsCompressor();
      comp.threshold.value=-12; comp.knee.value=12; comp.ratio.value=3.2;
      comp.attack.value=0.004; comp.release.value=0.16;
      toneLP = oc.createBiquadFilter(); toneLP.type='lowpass';
      toneLP.frequency.value=20000; toneLP.Q.value=0.7;
      master.connect(comp).connect(toneLP).connect(oc.destination);
    } else master.connect(oc.destination);

    drumBus = oc.createGain(); drumBus.gain.value=0.9; drumBus.connect(master);
    bassBus = oc.createGain(); bassBus.gain.value=0.55; bassBus.connect(master);
    arpBus  = oc.createGain(); arpBus.gain.value=0.34;  arpBus.connect(master);
    leadBus = oc.createGain(); leadBus.gain.value=0.28; leadBus.connect(master);

    delay = oc.createDelay(1.0); delay.delayTime.value=(60/BPM)*(3/4);
    const fb = oc.createGain(); fb.gain.value=0.23;
    const dlp = oc.createBiquadFilter(); dlp.type='lowpass'; dlp.frequency.value=2600;
    delay.connect(dlp).connect(fb).connect(delay);
    delay.connect(master);

    verb = oc.createConvolver(); verb.buffer = mkIR(oc, rnd, 1.7);
    const vg = oc.createGain(); vg.gain.value=0.13;
    verb.connect(vg).connect(master);

    arpBus.connect(delay); leadBus.connect(delay);
    leadBus.connect(verb); arpBus.connect(verb);
    fxBus = oc.createGain(); fxBus.gain.value=0.5;
    fxBus.connect(master); fxBus.connect(delay);
    if (fxOff){
      arpBus.disconnect(delay); leadBus.disconnect(delay);
      leadBus.disconnect(verb); arpBus.disconnect(verb);
      fxBus.disconnect(delay);
      delay.disconnect(); verb.disconnect();
    }
    noiseBuf = mkNoise(oc, 2, rnd);
  }

  // ---------- v0.4: split drum trims, bass HPF + kick duck, FX with send/return ----------
  const V4 = {
    kick: 0.74, kickPeakF: 52, kickPeakQ: 0.9, kickPeakG: 3.0,
    snare: 1.14, hat: 0.80,
    bass: 0.45, bassHP: 45, bassLP: 240, duckGain: 0.667, duckAttack: 0.005, duckTau: 0.035,
    arp: 1.37, lead: 0.76, leadHP: 380, glitch: 1.42,
    delayTime: (60/BPM)*(3/4), fb: 0.20, fbLP: 2200, fbHP: 300, delayRet: 0.62,
    verbSecs: 1.0, predelay: 0.026, verbRet: 0.075,
    sendArpVerb: 0.50, sendLeadVerb: 0.60,
    sendArpDelay: 0.35, sendLeadDelay: 0.25, sendGlitchDelay: 0.40,
    master: 0.65
  };
  let kickNode, snareNode, hatNode;
  function graphV04(oc, withMasterComp, rnd, fxOff){
    ctx = oc;
    master = oc.createGain(); master.gain.value = V4.master;
    if (withMasterComp){
      comp = oc.createDynamicsCompressor();
      comp.threshold.value=-16; comp.knee.value=6; comp.ratio.value=2.0;
      comp.attack.value=0.020; comp.release.value=0.20;
      toneLP = oc.createBiquadFilter(); toneLP.type='lowpass';
      toneLP.frequency.value=20000; toneLP.Q.value=0.7;
      master.connect(comp).connect(toneLP).connect(oc.destination);
    } else master.connect(oc.destination);

    kickNode = oc.createGain(); kickNode.gain.value = V4.kick;
    const kEQ = oc.createBiquadFilter(); kEQ.type='peaking';
    kEQ.frequency.value = V4.kickPeakF; kEQ.Q.value = V4.kickPeakQ; kEQ.gain.value = V4.kickPeakG;
    kickNode.connect(kEQ).connect(master);
    snareNode = oc.createGain(); snareNode.gain.value = V4.snare; snareNode.connect(master);
    hatNode   = oc.createGain(); hatNode.gain.value   = V4.hat;   hatNode.connect(master);
    drumBus = kickNode;

    bassBus = oc.createGain(); bassBus.gain.value = V4.bass;
    const duck = oc.createGain(); duck.gain.value = 1;
    for (const t of kickTimes()){
      duck.gain.setValueAtTime(1, t);
      duck.gain.linearRampToValueAtTime(V4.duckGain, t + V4.duckAttack);
      duck.gain.setTargetAtTime(1, t + V4.duckAttack, V4.duckTau);
    }
    // Q on highpass/lowpass is read in dB by WebAudio: -3.01 dB == linear 0.707
    const bassHP = oc.createBiquadFilter(); bassHP.type='highpass';
    bassHP.frequency.value = V4.bassHP; bassHP.Q.value = -3.01;
    const bassLP = oc.createBiquadFilter(); bassLP.type='lowpass';
    bassLP.frequency.value = V4.bassLP; bassLP.Q.value = -3.01;
    bassBus.connect(duck).connect(bassHP).connect(bassLP).connect(master);

    arpBus  = oc.createGain(); arpBus.gain.value = V4.arp;   arpBus.connect(master);
    leadBus = oc.createGain(); leadBus.gain.value = V4.lead;
    // 4th-order Butterworth: the lead's f/2 sub sits on the arp's fundamental range
    const lh1 = oc.createBiquadFilter(); lh1.type='highpass'; lh1.frequency.value = V4.leadHP; lh1.Q.value = -5.33;
    const lh2 = oc.createBiquadFilter(); lh2.type='highpass'; lh2.frequency.value = V4.leadHP; lh2.Q.value = 2.32;
    leadBus.connect(lh1).connect(lh2).connect(master);

    const delayIn = oc.createGain();
    delay = oc.createDelay(1.0); delay.delayTime.value = V4.delayTime;
    const fb = oc.createGain(); fb.gain.value = V4.fb;
    const dlp = oc.createBiquadFilter(); dlp.type='lowpass'; dlp.frequency.value = V4.fbLP;
    const dhp = oc.createBiquadFilter(); dhp.type='highpass'; dhp.frequency.value = V4.fbHP;
    delayIn.connect(delay);
    delay.connect(dhp).connect(dlp).connect(fb).connect(delayIn);
    const delayRet = oc.createGain(); delayRet.gain.value = V4.delayRet;
    delay.connect(delayRet).connect(master);

    const verbIn = oc.createGain();
    const pre = oc.createDelay(0.2); pre.delayTime.value = V4.predelay;
    verb = oc.createConvolver(); verb.buffer = mkIR(oc, rnd, V4.verbSecs);
    const vg = oc.createGain(); vg.gain.value = V4.verbRet;
    verbIn.connect(pre).connect(verb).connect(vg).connect(master);

    const sv = (src, g, dst) => { const n = oc.createGain(); n.gain.value = fxOff ? 0 : g; src.connect(n).connect(dst); };
    sv(arpBus,  V4.sendArpVerb,  verbIn);
    sv(leadBus, V4.sendLeadVerb, verbIn);
    sv(arpBus,  V4.sendArpDelay, delayIn);
    sv(leadBus, V4.sendLeadDelay, delayIn);

    fxBus = oc.createGain(); fxBus.gain.value = V4.glitch;
    fxBus.connect(master);
    sv(fxBus, V4.sendGlitchDelay, delayIn);

    noiseBuf = mkNoise(oc, 2, rnd);
  }

  const VOICE_DEFAULT_GAIN = 0.9;   // v0.3 drumBus
  function fire(voice, t, ev){
    if ((voice==='kick'   || voice==='all') && ev.kick)   vKick(t, ev.kick);
    if ((voice==='snare'  || voice==='all') && ev.snare)  vSnare(t, ev.snare);
    if ((voice==='hat'    || voice==='all') && ev.hat)    vHat(t, ev.hat.v, ev.hat.open);
    if ((voice==='bass'   || voice==='all') && ev.bass)   vBass(t, ev.bass.f, ev.bass.v, ev.bass.len);
    if ((voice==='arp'    || voice==='all') && ev.arp)    vArp(t, ev.arp.f, ev.arp.v, ev.arp.cut);
    if ((voice==='lead'   || voice==='all') && ev.lead)   vLead(t, ev.lead.f, ev.lead.v, ev.lead.len, ev.lead.cut);
    if ((voice==='glitch' || voice==='all') && ev.glitch) vGlitch(t, ev.glitch.v, ev.glitch.rate);
  }
  // voice-major scheduling so each percussion voice can be pointed at its own trim
  function schedule(which, split){
    return () => {
      for (const v of which){
        if (PERC.includes(v)) drumBus = split ? (v==='kick'?kickNode:v==='snare'?snareNode:hatNode) : drumBus;
        for (let bi=0; bi<BARS; bi++){
          const bar = bi % FORM[SEC].bars;
          for (let st=0; st<16; st++){
            const ev = PAT[SEC][bar][st];
            if (!ev || !ev[v]) continue;
            fire(v, 0.1 + bi*barDur + st*stepDur(), ev);
          }
        }
      }
    };
  }
  async function render(graph, which, withComp, fxOff, split){
    const oc = new OfflineAudioContext(2, Math.ceil(total*SR), SR);
    const savedRandom = Math.random;
    Math.random = mulberry32(0xA7F209C1);
    graph(oc, withComp, Math.random, fxOff === true);
    schedule(which, split)();
    const buf = await oc.startRendering();
    Math.random = savedRandom;
    return buf;
  }

  // ---------- analysis ----------
  function fft(re, im){
    const n = re.length;
    for (let i=1,j=0;i<n;i++){
      let bit = n>>1;
      for (; j & bit; bit>>=1) j ^= bit;
      j ^= bit;
      if (i<j){ let t=re[i];re[i]=re[j];re[j]=t; t=im[i];im[i]=im[j];im[j]=t; }
    }
    for (let len=2; len<=n; len<<=1){
      const ang = -2*Math.PI/len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i=0;i<n;i+=len){
        let cr=1, ci=0;
        for (let k=0;k<len/2;k++){
          const ur=re[i+k], ui=im[i+k];
          const vr=re[i+k+len/2]*cr - im[i+k+len/2]*ci;
          const vi=re[i+k+len/2]*ci + im[i+k+len/2]*cr;
          re[i+k]=ur+vr; im[i+k]=ui+vi;
          re[i+k+len/2]=ur-vr; im[i+k+len/2]=ui-vi;
          const ncr=cr*wr - ci*wi; ci=cr*wi + ci*wr; cr=ncr;
        }
      }
    }
  }
  function biquad(x, b, a){
    const y = new Float64Array(x.length);
    let x1=0,x2=0,y1=0,y2=0;
    for (let i=0;i<x.length;i++){
      const v = b[0]*x[i] + b[1]*x1 + b[2]*x2 - a[1]*y1 - a[2]*y2;
      x2=x1; x1=x[i]; y2=y1; y1=v; y[i]=v;
    }
    return y;
  }
  function lufs(L, R){
    const s1b=[1.53512485958697,-2.69169618940638,1.19839281085285], s1a=[1,-1.69065929318241,0.73248077421585];
    const s2b=[1,-2,1], s2a=[1,-1.99004745483398,0.99007225036621];
    const kl = biquad(biquad(L,s1b,s1a),s2b,s2a);
    const kr = biquad(biquad(R,s1b,s1a),s2b,s2a);
    const block = Math.round(0.4*SR), hop = Math.round(0.1*SR);
    const blocks=[];
    for (let s=0; s+block<=kl.length; s+=hop){
      let e=0;
      for (let i=0;i<block;i++) e += kl[s+i]*kl[s+i] + kr[s+i]*kr[s+i];
      blocks.push(e/block);
    }
    const Lb = blocks.map(e => -0.691 + 10*Math.log10(Math.max(e,1e-20)));
    const abs = Lb.filter(v=>v>-70);
    if (!abs.length) return -99;
    const rel = 10*Math.log10(abs.reduce((s,v)=>s+Math.pow(10,v/10),0)/abs.length) - 10;
    const gated = Lb.filter(v=>v>-70 && v>rel);
    return -0.691 + 10*Math.log10(gated.reduce((s,v)=>s+Math.pow(10,v/10),0)/gated.length);
  }
  const HOP = 2048;
  function analyse(buf){
    const N = 8192, hop = HOP;
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    const w = new Float64Array(N); let wsum = 0;
    for (let i=0;i<N;i++){ w[i] = 0.5 - 0.5*Math.cos(2*Math.PI*i/N); wsum += w[i]*w[i]; }
    const bandE = new Float64Array(BANDS.length), frames = [];
    const bandM = new Float64Array(MBANDS.length), framesM = [];
    const re = new Float64Array(N), im = new Float64Array(N), binHz = SR/N;
    for (let start=0; start+N<=L.length; start+=hop){
      for (let i=0;i<N;i++){ re[i] = 0.5*(L[start+i]+R[start+i])*w[i]; im[i] = 0; }
      fft(re, im);
      const fb = new Float64Array(BANDS.length), fm = new Float64Array(MBANDS.length);
      for (let k=1;k<N/2;k++){
        const f = k*binHz;
        const p = 2*(re[k]*re[k]+im[k]*im[k])/(N*wsum);
        for (let b=0;b<BANDS.length;b++) if (f>=BANDS[b][0] && f<BANDS[b][1]){ bandE[b]+=p; fb[b]+=p; break; }
        for (let b=0;b<MBANDS.length;b++) if (f>=MBANDS[b][0] && f<MBANDS[b][1]){ bandM[b]+=p; fm[b]+=p; break; }
      }
      frames.push(fb); framesM.push(fm);
    }
    let peak=0, sum=0;
    for (let i=0;i<L.length;i++){ const a=Math.max(Math.abs(L[i]),Math.abs(R[i])); if(a>peak)peak=a; sum += L[i]*L[i]+R[i]*R[i]; }
    const db = e => 10*Math.log10(Math.max(e,1e-20)/0.5);
    return { bandDb:[...bandE].map(db), bandDbM:[...bandM].map(db), frames, framesM,
             peakDb: 20*Math.log10(Math.max(peak,1e-9)), lufs: lufs(L,R) };
  }
  const corr = (a,b,bi) => {
    const A=a.frames.map(f=>f[bi]), B=b.frames.map(f=>f[bi]);
    const n=Math.min(A.length,B.length), ma=A.slice(0,n).reduce((s,x)=>s+x,0)/n, mb=B.slice(0,n).reduce((s,x)=>s+x,0)/n;
    let num=0,da=0,db=0;
    for(let i=0;i<n;i++){ num+=(A[i]-ma)*(B[i]-mb); da+=(A[i]-ma)**2; db+=(B[i]-mb)**2; }
    return num/Math.sqrt(da*db||1);
  };

  async function measure(graph, split){
    const stems = {};
    for (const v of VOICES) stems[v] = analyse(await render(graph, [v], false, false, split));
    const arpDry  = analyse(await render(graph, ['arp'],  false, true, split));
    const leadDry = analyse(await render(graph, ['lead'], false, true, split));
    const mix = analyse(await render(graph, VOICES, true, false, split));
    const out = { stems:{}, mix:{ bandDb: mix.bandDb, bandDbM: mix.bandDbM, peakDb: mix.peakDb, lufs: mix.lufs } };
    for (const v of VOICES) out.stems[v] = { bandDb: stems[v].bandDb, bandDbM: stems[v].bandDbM, peakDb: stems[v].peakDb, lufs: stems[v].lufs };
    out.fxDelta = {
      arp_250_500:  arpDry.bandDb[3]  - stems.arp.bandDb[3],
      arp_500_1k:   arpDry.bandDb[4]  - stems.arp.bandDb[4],
      lead_250_500: leadDry.bandDb[3] - stems.lead.bandDb[3],
      lead_500_1k:  leadDry.bandDb[4] - stems.lead.bandDb[4]
    };
    out.corr = {
      arp_lead_250_500: corr(stems.arp, stems.lead, 3),
      bass_kick_60_120: corr(stems.bass, stems.kick, 1),
      snare_lead_2k_5k: corr(stems.snare, stems.lead, 6)
    };
    // frame-wise band ownership: which voice is loudest in this band, per 42.7 ms frame
    const shareOn = (st, bands, labels, key) => {
      const out2 = {};
      const nFrames = Math.min(...VOICES.map(v => st[v][key].length));
      for (let b=0;b<bands.length;b++){
        const counts = {}; VOICES.forEach(v=>counts[v]=0);
        for (let i=0;i<nFrames;i++){
          let win = VOICES[0], best = -Infinity;
          for (const v of VOICES){ const x = st[v][key][i][b]; if (x > best){ best = x; win = v; } }
          counts[win]++;
        }
        out2[labels[b]] = Object.fromEntries(
          Object.entries(counts).filter(([,c]) => c > 0).sort((a,b2) => b2[1]-a[1])
            .map(([k,c]) => [k, +(100*c/nFrames).toFixed(0)])
        );
      }
      return out2;
    };
    out.share = shareOn(stems, BANDS, BLABEL, 'frames');
    out.shareM = shareOn(stems, MBANDS, MLABEL, 'framesM');
    // kick authority: at each kick onset, is the kick the loudest in 30-60 / 60-120?
    {
      const t0 = kickTimes();
      let n = 0, w60 = 0, w120 = 0;
      for (const t of t0){
        const i = Math.floor(t*SR/HOP);
        if (i < 0 || i >= stems.kick.framesM.length) continue;
        n++;
        if (stems.kick.framesM[i][0] >= stems.bass.framesM[i][0]) w60++;
        if (stems.kick.framesM[i][1] >= stems.bass.framesM[i][1]) w120++;
      }
      out.kickOnset = { onsets: n, pct_30_60: +(100*w60/n).toFixed(0), pct_60_120: +(100*w120/n).toFixed(0) };
    }
    return out;
  }

  function margins(res, bands, labels, key){
    const m = {};
    for (let b=0;b<bands.length;b++){
      const arr = VOICES.map(v=>[v, res.stems[v][key][b]]).sort((x,y)=>y[1]-x[1]);
      m[labels[b]] = { owner: arr[0][0], margin: +(arr[0][1]-arr[1][1]).toFixed(1),
                       top: arr.slice(0,3).map(([v,d])=>v+':'+d.toFixed(1)).join(' ') };
    }
    return m;
  }

  const v03 = await measure(graphV03, false);
  const v04 = await measure(graphV04, true);
  return { bands: BLABEL, mlabels: MLABEL, v03, v04,
           margins: { v03: margins(v03, BANDS, BLABEL, 'bandDb'), v04: margins(v04, BANDS, BLABEL, 'bandDb') },
           marginsM: { v03: margins(v03, MBANDS, MLABEL, 'bandDbM'), v04: margins(v04, MBANDS, MLABEL, 'bandDbM') } };
})()
`;

function cdp(ws, id, method, params) { ws.send(JSON.stringify({ id, method, params })); }
async function waitFor(fn, ms = 30000, step = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const r = await fn(); if (r) return r; await new Promise(r => setTimeout(r, step)); }
  throw new Error('timeout');
}

const userDir = mkdtempSync(join(tmpdir(), 'serial-probe-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`, PAGE,
], { stdio: 'ignore' });

let exitCode = 0;
try {
  const target = await waitFor(async () => {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      return list.find(t => t.type === 'page' && t.url.includes('SERIAL'));
    } catch { return null; }
  });
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  cdp(ws, 1, 'Runtime.enable', {});
  await new Promise(r => setTimeout(r, 600));
  await waitFor(async () => {
    const p = new Promise(res => { ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id === 2) res(m); }; });
    cdp(ws, 2, 'Runtime.evaluate', { expression: "document.readyState==='complete' && typeof PAT!=='undefined' && PAT.length===6", returnByValue: true });
    const m = await p;
    return m.result?.result?.value === true;
  });
  const p = new Promise(res => { ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id === 3) res(m); }; });
  cdp(ws, 3, 'Runtime.evaluate', { expression: HARNESS, awaitPromise: true, returnByValue: true, timeout: 240000 });
  const m = await p;
  if (m.result?.exceptionDetails) {
    console.error('PAGE ERROR:', JSON.stringify(m.result.exceptionDetails).slice(0, 3000));
    exitCode = 1;
  } else console.log(JSON.stringify(m.result.result.value, null, 1));
  ws.close();
} catch (e) {
  console.error('PROBE FAILED:', e.message);
  exitCode = 1;
} finally { chrome.kill(); }
process.exit(exitCode);
