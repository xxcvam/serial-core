const fs=require('fs'), vm=require('vm');
const P='F:/dsh/SERIAL_Sonic_Identity_Audition_v0.4.html';
const html=fs.readFileSync(P,'utf8');
const code=html.match(/<script>([\s\S]*?)<\/script>/)[1];

/* ---------- 最小 AudioContext 桩：只为验证代码路径不抛异常 ---------- */
let fakeNow=0, nodeCount=0, startCount=0;
function param(v){ return { value:v,
  setValueAtTime(){return this}, linearRampToValueAtTime(){return this},
  exponentialRampToValueAtTime(x){ return this }, setTargetAtTime(){return this},
  cancelScheduledValues(){return this} }; }
function node(extra){
  const n=Object.assign({ connect(){return this}, disconnect(){return this},
    start(){startCount++}, stop(){}, get gain(){return this._g||(this._g=param(1))},
    get frequency(){return this._f||(this._f=param(440))},
    get Q(){return this._q||(this._q=param(1))},
    get detune(){return this._d||(this._d=param(0))},
    get threshold(){return this._th||(this._th=param(-24))},
    get ratio(){return this._r||(this._r=param(2))},
    get attack(){return this._a||(this._a=param(0.01))},
    get knee(){return this._k||(this._k=param(30))},
    get release(){return this._re||(this._re=param(0.1))},
    get delayTime(){return this._dt||(this._dt=param(0.1))} }, extra||{});
  nodeCount++;
  return n;
}
class FakeCtx{
  constructor(){ this.sampleRate=44100; this.state='running'; this.destination=node(); }
  get currentTime(){ return fakeNow; }
  resume(){ this.state='running'; return Promise.resolve(); }
  createGain(){ return node(); }
  createBiquadFilter(){ return node({type:'lowpass'}); }
  createOscillator(){ return node({type:'sine'}); }
  createBufferSource(){ return node(); }
  createDelay(){ return node(); }
  createConvolver(){ return node(); }
  createDynamicsCompressor(){ return node(); }
  createWaveShaper(){ return node({curve:null,oversample:'none'}); }
  createBuffer(ch,len,sr){ const d=[]; for(let i=0;i<ch;i++) d.push(new Float32Array(len));
    return { length:len, sampleRate:sr, numberOfChannels:ch, getChannelData:i=>d[i] }; }
}

function el(){
  return { textContent:'',className:'',value:'A7F209C13B8ED614',dataset:{},style:{},children:[],innerHTML:'',
    classList:{_s:new Set(),add(c){this._s.add(c)},remove(c){this._s.delete(c)},toggle(c,v){if(v===undefined)v=!this._s.has(c);v?this._s.add(c):this._s.delete(c);return v},contains(c){return this._s.has(c)}},
    appendChild(c){this.children.push(c)},addEventListener(){},onclick:null,onpointerdown:null,onpointerup:null };
}
const ids={};
const doc={getElementById(id){if(!ids[id])ids[id]=el();return ids[id]},createElement(){return el()},querySelector(){return el()}};

const sandbox={ document:doc, console, Math, BigInt, DataView, Uint8Array, Uint32Array, Float32Array,
  TextEncoder, JSON, Number, Error, Object, String, Set, Array, Map, isFinite, parseInt, Promise,
  setTimeout(fn){ fn(); return 0; },
  clearInterval(){},
  setInterval(cb){ /* 驱动 30 秒虚拟时间 */ 
    for(let i=0;i<3000;i++){ fakeNow+=0.01; cb(); }
    return 1;
  } };
sandbox.window=sandbox;
sandbox.window.AudioContext=FakeCtx;
vm.createContext(sandbox);
vm.runInContext(code,sandbox);

const S=sandbox.window.SERIAL;
S.SEED=0xA7F209C13B8ED614n;

let err=null;
try{
  ids['play'].onclick();          /* start() → 建图 + 调度 30s */
}catch(e){ err=e; }

console.log('scheduling error: '+(err?err.stack:'none'));
console.log('nodes created: '+nodeCount+'  sources started: '+startCount+'  simTime: '+fakeNow.toFixed(2)+'s');

/* crack 按住/松开 + stop 各走一遍 */
try{ ids['crack'].onpointerdown(); ids['crack'].onpointerup(); }catch(e){ console.log('crack error: '+e.message); }
try{ ids['stop'].onclick(); }catch(e){ console.log('stop error: '+e.message); }
console.log('post crack/stop: ok');

const r=S.selftest();
console.log('\nselftest '+(r.pass?'PASS':'FAIL')+'  '+r.results.filter(x=>x.ok).length+'/'+r.results.length);
