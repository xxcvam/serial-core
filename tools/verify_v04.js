const fs=require('fs'), vm=require('vm');
const P='F:/dsh/SERIAL_Sonic_Identity_Audition_v0.4.html';
const html=fs.readFileSync(P,'utf8');
const code=html.match(/<script>([\s\S]*?)<\/script>/)[1];

function el(){
  return {
    textContent:'',className:'',value:'A7F209C13B8ED614',dataset:{},style:{},children:[],innerHTML:'',
    classList:{_s:new Set(),add(c){this._s.add(c)},remove(c){this._s.delete(c)},toggle(c,v){if(v===undefined)v=!this._s.has(c);v?this._s.add(c):this._s.delete(c);return v},contains(c){return this._s.has(c)}},
    appendChild(c){this.children.push(c)},addEventListener(){},onclick:null,onpointerdown:null,onpointerup:null
  };
}
const ids={};
const doc={getElementById(id){if(!ids[id])ids[id]=el();return ids[id]},createElement(){return el()},querySelector(){return el()}};
const ctx={document:doc,console,setInterval(){return 0},clearInterval(){},setTimeout(){},Math,BigInt,DataView,Uint8Array,Uint32Array,Float32Array,TextEncoder,JSON,Number,Error,Object,String,Set,Array,Map,isFinite,parseInt};
ctx.window=ctx; ctx.window.AudioContext=undefined;
vm.createContext(ctx);
vm.runInContext(code,ctx);

const S=ctx.window.SERIAL;
const r=S.selftest();
console.log(r.results.map(x=>(x.ok?'PASS ':'FAIL ')+x.n+(x.x?'  ['+x.x+']':'')).join('\n'));
console.log('\n'+(r.pass?'ALL PASS':'ALL FAIL'));

const PAT=S.build('B');
let n=0,per={};
for(const sec of S.FORM04){
  per[sec.name]={};
  for(const bar of PAT[sec.id]) for(const e of bar){
    for(const k of Object.keys(e)){ n++; per[sec.name][k]=(per[sec.name][k]||0)+1; }
  }
}
console.log('\nevents total '+n);
for(const sec of S.FORM04){
  const line=Object.entries(per[sec.name]).map(([k,v])=>k+':'+v).join(' ');
  console.log(sec.name.padEnd(8)+' bars='+sec.bars+'  '+line);
}
