/* hat 合成离线数值探针：加法合成（含 <20k 全部奇次谐波）+ RBJ 双二阶 + 包络 + 可选压缩器 */
const SR=44100, DUR=0.6, N=Math.round(SR*DUR);
const db=x=>20*Math.log10(Math.max(x,1e-12));
function biquadHP(f,QdB){ const Q=Math.pow(10,QdB/20);
  const w=2*Math.PI*f/SR, a=Math.sin(w)/(2*Q), c=Math.cos(w);
  const b0=(1+c)/2,b1=-(1+c),b2=(1+c)/2, a0=1+a, a1=-2*c, a2=1-a;
  return {b0:b0/a0,b1:b1/a0,b2:b2/a0,a1:a1/a0,a2:a2/a0}; }
function biquadBP(f,Q){ const w=2*Math.PI*f/SR, a=Math.sin(w)/(2*Q), c=Math.cos(w);
  const b0=a,b1=0,b2=-a, a0=1+a, a1=-2*c, a2=1-a;
  return {b0:b0/a0,b1:b1/a0,b2:b2/a0,a1:a1/a0,a2:a2/a0}; }
function run(x,f){ let x1=0,x2=0,y1=0,y2=0; const y=new Float64Array(x.length);
  for(let i=0;i<x.length;i++){ const v=f.b0*x[i]+f.b1*x1+f.b2*x2-f.a1*y1-f.a2*y2;
    x2=x1;x1=x[i]; y2=y1;y1=v; y[i]=v; } return y; }
function squares(freqs,gainEach){ const y=new Float64Array(N);
  for(const f of freqs) for(let n=1;n*f<20000;n+=2){ const amp=gainEach*(4/(Math.PI*n));
    const w=2*Math.PI*n*f/SR; for(let i=0;i<N;i++) y[i]+=amp*Math.sin(w*i); }
  return y; }
function noise(seed){ const y=new Float64Array(N); let s=seed>>>0;
  for(let i=0;i<N;i++){ s=(Math.imul(s,1664525)+1013904223)>>>0; y[i]=(s/4294967296)*2-1; } return y; }
function envApply(y,peakT,dec,ramp){ for(let i=0;i<N;i++){
  const t=i/SR; let g;
  if(t<peakT) g=Math.max(1e-4,(t/peakT));
  else if(t<peakT+ramp) g=1;
  else { const k=(t-peakT-ramp)/(dec); g=Math.max(1e-4,Math.pow(1e-4,k/(1))); }
  y[i]*=g; } return y; }
/* 简化前馈压缩器（hard knee，指示性） */
function compress(y,thrDb,ratio,atk,rel){
  const thr=Math.pow(10,thrDb/20); let gr=0;
  const aAtk=1-Math.exp(-1/(SR*atk)), aRel=1-Math.exp(-1/(SR*rel));
  const o=new Float64Array(N);
  for(let i=0;i<N;i++){ const lvl=Math.abs(y[i]);
    const over=lvl>thr?(lvl/thr-1):0;
    const target=over>0?(Math.pow(lvl,1-1/ratio)*Math.pow(thr,1/ratio-1)):1;
    const a=target<gr?aAtk:aRel; gr+= (target-gr)*a;
    o[i]=y[i]*Math.min(1,gr); }
  return o; }
function analyse(name,y,busDb){
  const g=Math.pow(10,busDb/20); let peak=0,s=0;
  for(let i=0;i<N;i++){ const v=y[i]*g; const a=Math.abs(v); if(a>peak)peak=a; s+=v*v; }
  return {name,peak:db(peak).toFixed(1),rms:db(Math.sqrt(s/N)).toFixed(1)};
}
function band(y,busDb){ /* 6–14k 与 14–20k 能量用 FFT-less 直算：Goertzel 太慢，用 512 点 DFT 抽点 */
  const g=Math.pow(10,busDb/20), M=8192, re=new Float64Array(M), im=new Float64Array(M);
  for(let i=0;i<M;i++){ const w=0.5-0.5*Math.cos(2*Math.PI*i/(M-1)); re[i]=(y[i+64]||0)*g*w; }
  for(let i=1,j=0;i<M;i++){ let bit=M>>1; for(;j&bit;bit>>=1) j^=bit; j^=bit;
    if(i<j){ const t=re[i];re[i]=re[j];re[j]=t; } }
  for(let len=2;len<=M;len<<=1){ const ang=-2*Math.PI/len;
    for(let i=0;i<M;i+=len) for(let k=0;k<len/2;k++){
      const wr=Math.cos(ang*k),wi=Math.sin(ang*k);
      const ur=re[i+k],ui=im[i+k];
      const vr=re[i+k+len/2]*wr-im[i+k+len/2]*wi, vi=re[i+k+len/2]*wi+im[i+k+len/2]*wr;
      re[i+k]=ur+vr; im[i+k]=ui+vi; re[i+k+len/2]=ur-vr; im[i+k+len/2]=ui-vi; } }
  const binHz=SR/M; let e6=0,e14=0,eAll=0;
  for(let k=1;k<M/2;k++){ const p=re[k]*re[k]+im[k]*im[k]; eAll+=p;
    const f=k*binHz; if(f>=6000&&f<14000) e6+=p; if(f>=14000&&f<20000) e14+=p; }
  return {b6:(10*Math.log10(e6)).toFixed(1),b14:(10*Math.log10(e14)).toFixed(1),
    share:((e6/eAll)*100).toFixed(1)};
}

/* --- BEFORE：v0.4 上一版 --- */
{
  const sq=squares([205.3,304.4,369.6,522.7,540,800],1/6);
  const hp=run(sq,biquadHP(6000,0)); const bp=run(hp,biquadBP(9500,1.0));
  const nz=run(noise(0x9E3779B9).map(x=>x*0.30),biquadHP(7200,0));
  const mix=bp.map((v,i)=>v+nz[i]);
  const y=envApply(mix,0.05,0.045,0.045);
  const a=analyse('BEFORE',y,-16.5), b=band(y,-16.5);
  console.log(a.name.padEnd(8)+' peak '+a.peak+'  rms '+a.rms+'  6–14k '+b.b6+'  14–20k '+b.b14+'  6–14k 占比 '+b.share+'%');
}
/* --- CURRENT：v0.4 当前（含压缩器） --- */
{
  const sq=squares([205.3,304.4,369.6,522.7,540,800],1/6);
  const hp=run(sq,biquadHP(6000,0)); const bp=run(hp,biquadBP(9500,1.0));
  const nz=run(noise(0x9E3779B9).map(x=>x*0.30),biquadHP(7200,0));
  const ck=run(noise(0x51ED270B).map(x=>x*1.4),biquadHP(3200,0));
  const dec=0.028;
  const mix=bp.map((v,i)=>v+nz[i]+(i/SR<0.0035?ck[i]*Math.pow(1e-4,(i/SR)/0.0035):0));
  let y=envApply(mix,0.0005,dec,dec);
  y=compress(y,-26,4.5,0.0003,0.030);
  const a=analyse('CURRENT',y,-13), b=band(y,-13);
  console.log(a.name.padEnd(8)+' peak '+a.peak+'  rms '+a.rms+'  6–14k '+b.b6+'  14–20k '+b.b14+'  6–14k 占比 '+b.share+'%');
}
/* --- NEW909 --- */
{
  const sq=squares([213.5,313.9,383.1,553.3,565.1,827.5],0.5);
  const hp=run(sq,biquadHP(5500,0.7)); const bp=run(hp,biquadBP(9000,0.7));
  const nz=run(noise(0x9E3779B9).map(x=>x*0.45),biquadHP(7000,0));
  const mix=bp.map((v,i)=>v+nz[i]);
  const y=envApply(mix,0.0008,0.050,0.050);
  const a=analyse('NEW909',y,-11), b=band(y,-11);
  console.log(a.name.padEnd(8)+' peak '+a.peak+'  rms '+a.rms+'  6–14k '+b.b6+'  14–20k '+b.b14+'  6–14k 占比 '+b.share+'%');
}
