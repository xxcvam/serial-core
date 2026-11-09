// SERIAL lead probe — renders the shipped v0.4 vLead() and the proposed
// rebuild against the *real* RISE lead events (SERIAL.PAT[2]) in headless
// Chrome, then reports peak / LUFS / per-band energy / per-note centroid
// movement / release discontinuity.
//
// Usage: node lead_probe.mjs > lead_probe.json
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PAGE = 'file:///F:/dsh/serial-repo/audition/SERIAL_Sonic_Identity_Audition_v0.4.html';
const PORT = Number(process.env.PORT || 9334);

const HARNESS = String.raw`
(async () => {
  const SR = 48000;
  const sec = FORM04[2];                    // RISE
  const barDur = stepDur() * 16;
  const leadEv = [];
  for (let bar = 0; bar < sec.bars; bar++){
    const bp = SERIAL.PAT[2][bar];
    for (let st = 0; st < 16; st++){
      const e = bp[st] && bp[st].lead;
      if (e) leadEv.push({ t: 0.1 + bar*barDur + st*stepDur(), f:e.f, v:e.v, len:e.len, cut:e.cut, bar, st });
    }
  }
  const total = sec.bars*barDur + 1.6;

  function masterChain(oc){
    const master = oc.createGain(); master.gain.value = 0.72;
    const lim = oc.createDynamicsCompressor();
    lim.threshold.value=-1; lim.ratio.value=20; lim.attack.value=0.001; lim.release.value=0.05;
    const comp = oc.createDynamicsCompressor();
    comp.threshold.value=-16; comp.ratio.value=2; comp.attack.value=0.02; comp.release.value=0.2;
    const toneLP = oc.createBiquadFilter(); toneLP.type='lowpass'; toneLP.frequency.value=20000; toneLP.Q.value=0;
    comp.connect(lim); lim.connect(toneLP); toneLP.connect(master); master.connect(oc.destination);
    return { master, comp, lim, toneLP };
  }

  // ---- shipped vLead, transcribed from L727-751 ----
  function vLeadOLD(oc, t, ev, G){
    const mix=oc.createGain(), lp=oc.createBiquadFilter(), env=oc.createGain();
    const dur=ev.len*stepDur();
    for(const c of [-7,0,7]){
      const o=oc.createOscillator(), g=oc.createGain();
      o.type='sawtooth'; o.frequency.value=ev.f; o.detune.value=c;
      g.gain.value=1/3;
      o.connect(g); g.connect(mix); o.start(t); o.stop(t+dur+0.06);
    }
    const sub=oc.createOscillator(), sg=oc.createGain();
    sub.type='sine'; sub.frequency.value=ev.f/2; sg.gain.value=0.22;
    sub.connect(sg); sg.connect(mix); sub.start(t); sub.stop(t+dur+0.06);
    lp.type='lowpass'; lp.frequency.value=clamp(ev.cut,1150,3800); lp.Q.value=-3;
    env.gain.setValueAtTime(0.0001,t);
    env.gain.linearRampToValueAtTime(ev.v,t+0.008);
    env.gain.setTargetAtTime(ev.v*0.66,t+0.012,0.09);
    env.gain.setTargetAtTime(0.0001,t+Math.max(0.05,dur*0.85),0.06);
    mix.connect(lp); lp.connect(env); env.connect(G.leadBus);
  }

  // ---- proposed rebuild ----
  const PW = { det:[-11,0,11], amp:[0.34,0.30,0.34],
               q:3.0, kt:0.55, rel:0.25, relMin:0.018, relMax:0.075,
               fAtk:0.004, fDecay:[0.045,0.78], fSag:[0.10,0.30,0.62],
               fEnv:2.2, fEnvT:0.11, fEnvSag:[0.35,0.88], subMin:880, subG:0.14 };
  const TUNE = { drive:1.15, postLP:5000, postQ:-5.33, postQ2:2.32,
                 p3g:-4.5, p3f:3400, p3q:1.6, hp:240, trim:0.55 };

  function leadWaves(oc){
    if (leadWaves.cache) return leadWaves.cache;
    const N=64, out=[];
    for (const th of [0, 2*Math.PI/3, 4*Math.PI/3]){
      const re=new Float32Array(N+1), im=new Float32Array(N+1);
      for (let n=1;n<=N;n++){
        const A=((n%2)?1:-1)/n;
        im[n]=A*Math.cos(n*th); re[n]=A*Math.sin(n*th);
      }
      out.push(oc.createPeriodicWave(re,im));
    }
    leadWaves.cache=out; return out;
  }

  function vLeadNEW(oc, t, ev, G){
    const dur=ev.len*stepDur();
    const f=ev.f, v=ev.v, cut=clamp(ev.cut,900,6000);
    const relStart=Math.max(t+0.02, t+dur);
    const tau=clamp(dur*PW.rel, PW.relMin, PW.relMax);
    const stopAt=relStart + 8*tau;
    const mix=oc.createGain();
    const w=leadWaves(oc);
    for(let i=0;i<3;i++){
      const o=oc.createOscillator(), g=oc.createGain();
      o.setPeriodicWave(w[i]); o.frequency.value=f; o.detune.value=PW.det[i];
      g.gain.value=PW.amp[i];
      o.connect(g); g.connect(mix); o.start(t); o.stop(stopAt);
    }
    if (f>=PW.subMin){
      const s=oc.createOscillator(), sg=oc.createGain();
      s.type='sine'; s.frequency.value=f/2; sg.gain.value=PW.subG;
      s.connect(sg); sg.connect(mix); s.start(t); s.stop(stopAt);
    }
    const lp=oc.createBiquadFilter(); lp.type='lowpass';
    lp.frequency.value=cut; lp.Q.value=PW.q;
    lp.detune.value=12*Math.log2(f/440)*100*PW.kt;
    lp.frequency.setValueAtTime(Math.min(cut*PW.fEnv,8000), t);
    lp.frequency.exponentialRampToValueAtTime(cut, t+PW.fEnvT);
    lp.frequency.setTargetAtTime(cut*PW.fEnvSag[1], t+PW.fEnvT, PW.fEnvSag[0]);
    const env=oc.createGain();
    env.gain.setValueAtTime(0,t);
    env.gain.linearRampToValueAtTime(v,t+PW.fAtk);
    env.gain.setTargetAtTime(v*PW.fDecay[1], t+PW.fAtk, PW.fDecay[0]);
    env.gain.setTargetAtTime(v*PW.fSag[2], t+PW.fSag[0], PW.fSag[1]);
    env.gain.cancelAndHoldAtTime(relStart);
    env.gain.setTargetAtTime(0, relStart, tau);
    mix.connect(lp); lp.connect(env); env.connect(G.leadBus);
  }

  function busOLD(oc, master){
    const g=oc.createGain(); g.gain.value=db(-13.5); g.connect(master);
    return g;
  }
  function busNEW(oc, master, busGain){
    const bus=oc.createGain(); bus.gain.value=busGain;
    const hp1=oc.createBiquadFilter(); hp1.type='highpass'; hp1.frequency.value=TUNE.hp; hp1.Q.value=-5.33;
    const hp2=oc.createBiquadFilter(); hp2.type='highpass'; hp2.frequency.value=TUNE.hp; hp2.Q.value=2.32;
    const pk=(f,q,g)=>{ const n=oc.createBiquadFilter(); n.type='peaking'; n.frequency.value=f; n.Q.value=q; n.gain.value=g; return n; };
    const p1=pk(520,1.1,2.5), p2=pk(1600,1.4,2.0), p3=pk(TUNE.p3f,TUNE.p3q,TUNE.p3g);
    const ws=oc.createWaveShaper();
    const n=1024, c=new Float32Array(n);
    for(let i=0;i<n;i++){ const x=i/(n-1)*2-1; c[i]=Math.tanh(x*TUNE.drive)/Math.tanh(TUNE.drive); }
    ws.curve=c; ws.oversample='4x';
    const lp1=oc.createBiquadFilter(); lp1.type='lowpass'; lp1.frequency.value=TUNE.postLP; lp1.Q.value=TUNE.postQ;
    const lp2=oc.createBiquadFilter(); lp2.type='lowpass'; lp2.frequency.value=TUNE.postLP; lp2.Q.value=TUNE.postQ2;
    const trim=oc.createGain(); trim.gain.value=TUNE.trim;
    bus.connect(hp1); hp1.connect(hp2); hp2.connect(p1); p1.connect(p2); p2.connect(p3);
    p3.connect(ws); ws.connect(lp1); lp1.connect(lp2); lp2.connect(trim); trim.connect(master);
    return bus;
  }

  async function render(kind, busGain){
    const oc=new OfflineAudioContext(2, Math.ceil(total*SR), SR);
    const M=masterChain(oc);
    const leadBus = kind==='old' ? busOLD(oc, M.comp) : busNEW(oc, M.comp, busGain);
    const G={leadBus};
    for(const e of leadEv){
      if(kind==='old') vLeadOLD(oc, e.t, e, G); else vLeadNEW(oc, e.t, e, G);
    }
    return await oc.startRendering();
  }

  function fft(re,im){ const n=re.length;
    for(let i=1,j=0;i<n;i++){ let bit=n>>1; for(; j&bit; bit>>=1) j^=bit; j^=bit;
      if(i<j){ let t=re[i];re[i]=re[j];re[j]=t; t=im[i];im[i]=im[j];im[j]=t; } }
    for(let len=2;len<=n;len<<=1){ const ang=-2*Math.PI/len, wr=Math.cos(ang), wi=Math.sin(ang);
      for(let i=0;i<n;i+=len){ let cr=1,ci=0;
        for(let k=0;k<len/2;k++){ const ur=re[i+k],ui=im[i+k];
          const vr=re[i+k+len/2]*cr-im[i+k+len/2]*ci, vi=re[i+k+len/2]*ci+im[i+k+len/2]*cr;
          re[i+k]=ur+vr; im[i+k]=ui+vi; re[i+k+len/2]=ur-vr; im[i+k+len/2]=ui-vi;
          const ncr=cr*wr-ci*wi; ci=cr*wi+ci*wr; cr=ncr; } } } }
  function bq(x,b,a){ const y=new Float64Array(x.length); let x1=0,x2=0,y1=0,y2=0;
    for(let i=0;i<x.length;i++){ const v=b[0]*x[i]+b[1]*x1+b[2]*x2-a[1]*y1-a[2]*y2; x2=x1;x1=x[i];y2=y1;y1=v;y[i]=v; } return y; }
  function lufs(L,R){
    const s1b=[1.53512485958697,-2.69169618940638,1.19839281085285], s1a=[1,-1.69065929318241,0.73248077421585];
    const s2b=[1,-2,1], s2a=[1,-1.99004745483398,0.99007225036621];
    const kl=bq(bq(L,s1b,s1a),s2b,s2a), kr=bq(bq(R,s1b,s1a),s2b,s2a);
    const block=Math.round(0.4*SR), hop=Math.round(0.1*SR), blocks=[];
    for(let s=0;s+block<=kl.length;s+=hop){ let e=0;
      for(let i=0;i<block;i++) e+=kl[s+i]*kl[s+i]+kr[s+i]*kr[s+i];
      blocks.push(e/block); }
    const Lb=blocks.map(e=>-0.691+10*Math.log10(Math.max(e,1e-20)));
    const abs=Lb.filter(v=>v>-70); if(!abs.length) return -99;
    const rel=10*Math.log10(abs.reduce((s,v)=>s+Math.pow(10,v/10),0)/abs.length)-10;
    const g=Lb.filter(v=>v>-70&&v>rel);
    return -0.691+10*Math.log10(g.reduce((s,v)=>s+Math.pow(10,v/10),0)/g.length);
  }

  const BANDS=[[200,400],[400,700],[700,1500],[1500,3000],[3000,6000],[6000,12000]];
  const N=4096, CN=1024;
  function centroidAt(L,R,tc,win){
    const s0=Math.max(0,Math.floor((tc-win/2)*SR));
    if(s0+CN>L.length) return null;
    const re=new Float64Array(CN), im=new Float64Array(CN);
    for(let i=0;i<CN;i++){ const w=0.5-0.5*Math.cos(2*Math.PI*i/CN); re[i]=0.5*(L[s0+i]+R[s0+i])*w; im[i]=0; }
    fft(re,im);
    let num=0,den=0;
    for(let k=1;k<CN/2;k++){ const f=k*SR/CN; const p=re[k]*re[k]+im[k]*im[k]; num+=f*p; den+=p; }
    return den>0 ? num/den : 0;
  }
  function analyse(buf, kind){
    const L=buf.getChannelData(0), R=buf.getChannelData(1);
    let peak=0,sum=0;
    for(let i=0;i<L.length;i++){ const a=Math.max(Math.abs(L[i]),Math.abs(R[i])); if(a>peak) peak=a; sum+=L[i]*L[i]+R[i]*R[i]; }
    const hop=2048, bandE=new Float64Array(BANDS.length);
    const re=new Float64Array(N), im=new Float64Array(N), binHz=SR/N;
    for(let start=0;start+N<=L.length;start+=hop){
      let ws=0; for(let i=0;i<N;i++){ const w=0.5-0.5*Math.cos(2*Math.PI*i/N); ws+=w*w; }
      for(let i=0;i<N;i++){ re[i]=0.5*(L[start+i]+R[start+i])*(0.5-0.5*Math.cos(2*Math.PI*i/N)); im[i]=0; }
      fft(re,im);
      for(let k=1;k<N/2;k++){ const f=k*binHz, p=2*(re[k]*re[k]+im[k]*im[k])/(N*ws);
        for(let b=0;b<BANDS.length;b++) if(f>=BANDS[b][0]&&f<BANDS[b][1]){ bandE[b]+=p; break; } }
    }
    const dbE=e=>10*Math.log10(Math.max(e,1e-20)/0.5);
    const cents=[];
    for(const e of leadEv){
      const dur=e.len*stepDur();
      if(dur<0.30) continue;
      const c1=centroidAt(L,R,e.t+0.040,0.030);
      const c2=centroidAt(L,R,e.t+dur*0.72,0.030);
      if(c1&&c2) cents.push({t:+e.t.toFixed(2), f:Math.round(e.f), dur:+(dur*1000).toFixed(0),
                              cenEarly:Math.round(c1), cenLate:Math.round(c2), ratio:+(c2/c1).toFixed(3)});
    }
    let clickDb=-999, clickAt=0;
    for(const e of leadEv){
      const dur=e.len*stepDur();
      const st = kind==='old' ? e.t+dur+0.06
               : Math.max(e.t+0.02,e.t+dur) + 8*clamp(dur*PW.rel,PW.relMin,PW.relMax);
      const i0=Math.floor(st*SR);
      if(i0<400||i0>=L.length-4) continue;
      // local slope reference: mean |dx| over the 5 ms before the boundary
      let loc=0, nloc=0;
      for(let k=i0-240;k<i0-48;k++){ loc+=Math.abs(L[k]-L[k-1])+Math.abs(R[k]-R[k-1]); nloc++; }
      loc/=nloc;
      // boundary spike: max |dx| across the stop sample
      let step=0;
      for(let k=i0-2;k<=i0+3;k++) step=Math.max(step,Math.abs(L[k]-L[k-1]),Math.abs(R[k]-R[k-1]));
      const d=20*Math.log10(Math.max(step,1e-12)/Math.max(loc,1e-12));
      if(d>clickDb){ clickDb=+d.toFixed(1); clickAt=+st.toFixed(3); }
    }
    return { peakDb:+(20*Math.log10(peak)).toFixed(2), rmsDb:+(10*Math.log10(sum/(2*L.length))).toFixed(2),
             lufs:+lufs(L,R).toFixed(2), bandDb:[...bandE].map(x=>+dbE(x).toFixed(1)),
             centroidNotes:cents, clickDb, clickAt };
  }

  const startPeak = async (kind) => {
    const oc=new OfflineAudioContext(2, SR*0.2, SR);
    const m1=oc.createGain(); m1.connect(oc.destination);
    if (kind==='old'){
      for(const c of [-7,0,7]){ const o=oc.createOscillator(),g2=oc.createGain();
        o.type='sawtooth'; o.frequency.value=440; o.detune.value=c; g2.gain.value=1/3;
        o.connect(g2); g2.connect(m1); o.start(0); }
    } else {
      const w=leadWaves(oc);
      for(let i=0;i<3;i++){ const o=oc.createOscillator(),g2=oc.createGain();
        o.setPeriodicWave(w[i]); o.frequency.value=440; o.detune.value=PW.det[i]; g2.gain.value=PW.amp[i];
        o.connect(g2); g2.connect(m1); o.start(0); }
    }
    const b=await oc.startRendering(); const d=b.getChannelData(0);
    let mx=0; for(let i=0;i<960;i++) mx=Math.max(mx,Math.abs(d[i]));
    return +mx.toFixed(3);
  };

  // isolate one note per render: measure the amplitude step at its own stop sample
  async function clickTest(kind){
    const res=[];
    for(const e of leadEv){
      const dur=e.len*stepDur();
      const st = kind==='old' ? e.t+dur+0.06
               : Math.max(e.t+0.02,e.t+dur) + 8*clamp(dur*PW.rel,PW.relMin,PW.relMax);
      const oc=new OfflineAudioContext(1, Math.ceil((st+0.25)*SR), SR);
      const bus=oc.createGain(); bus.gain.value=1; bus.connect(oc.destination);
      const G={leadBus:bus};
      if(kind==='old') vLeadOLD(oc,e.t,e,G); else vLeadNEW(oc,e.t,e,G);
      const b=await oc.startRendering(); const d=b.getChannelData(0);
      let peak=0; for(let i=0;i<d.length;i++) peak=Math.max(peak,Math.abs(d[i]));
      const i0=Math.floor(st*SR);
      let rms=0; for(let i=i0-960;i<i0;i++) rms+=d[i]*d[i]; rms=Math.sqrt(rms/960);
      const step=Math.max(Math.abs(d[i0]-d[i0-1]),Math.abs(d[i0+1]-d[i0]),Math.abs(d[i0+2]-d[i0+1]));
      res.push({ f:Math.round(e.f), durMs:+(dur*1000).toFixed(0),
                 stepDb:+(20*Math.log10(Math.max(step,1e-12)/peak)).toFixed(1),
                 stepVsRms:+(20*Math.log10(Math.max(step,1e-12)/Math.max(rms,1e-12))).toFixed(1) });
    }
    return res;
  }

  const out = { leadEvents:leadEv.length, bands:BANDS.map(b=>b[0]+'-'+b[1]),
                tune:TUNE, pw:{q:PW.q, kt:PW.kt, fEnv:PW.fEnv, det:PW.det} };
  out.old = analyse(await render('old', 0), 'old');
  let best=null;
  for (const cand of [0.34,0.30,0.26,0.22,0.19,0.16]){
    const r = analyse(await render('new', cand), 'new');
    if (!best || Math.abs(r.peakDb-out.old.peakDb) < Math.abs(best.r.peakDb-out.old.peakDb)) best={g:cand, r};
  }
  out.new = best.r; out.newBusGain = best.g; out.newBusDb = +(20*Math.log10(best.g)).toFixed(1);
  out.startPeakOld = await startPeak('old');
  out.startPeakNew = await startPeak('new');
  out.clickOld = await clickTest('old');
  out.clickNew = await clickTest('new');
  return out;
})()
`;

function cdp(ws, id, method, params) { ws.send(JSON.stringify({ id, method, params })); }
async function waitFor(fn, ms = 30000, step = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const r = await fn(); if (r) return r; await new Promise(r => setTimeout(r, step)); }
  throw new Error('timeout');
}

const userDir = mkdtempSync(join(tmpdir(), 'serial-lead-'));
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
    cdp(ws, 2, 'Runtime.evaluate', { expression: "!!(window.SERIAL && window.SERIAL.PAT && window.SERIAL.PAT.length===6)", returnByValue: true });
    const m = await p;
    return m.result?.result?.value === true;
  });
  const p = new Promise(res => { ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id === 3) res(m); }; });
  cdp(ws, 3, 'Runtime.evaluate', { expression: HARNESS, awaitPromise: true, returnByValue: true, timeout: 300000 });
  const m = await p;
  if (m.result?.exceptionDetails) {
    console.error('PAGE ERROR:', JSON.stringify(m.result.exceptionDetails).slice(0, 4000));
    exitCode = 1;
  } else console.log(JSON.stringify(m.result.result.value, null, 1));
  ws.close();
} catch (e) {
  console.error('PROBE FAILED:', e.message);
  exitCode = 1;
} finally { chrome.kill(); }
process.exit(exitCode);
