import * as THREE from 'three';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const inputPath = resolve(ROOT, process.argv[2]);
const outputPath = resolve(ROOT, process.argv[3] ?? process.argv[2]);

const AUTHORITATIVE_SCALE = 7.147963;
const RAW_SOURCE_CENTER = new THREE.Vector3(0, 0.167928, 0);
const Y_ORIGIN = 0;
const RADIAL_ANCHOR = 2.18;
const SOURCE_OUTER = 2.56;
const TARGET_OUTER = 2.65;
const OUTER_SHIFT = TARGET_OUTER - SOURCE_OUTER;
const RADIAL_SCALE =
  (TARGET_OUTER - RADIAL_ANCHOR) / (SOURCE_OUTER - RADIAL_ANCHOR);

const bytes = Buffer.from(readFileSync(inputPath));
if (bytes.readUInt32LE(0) !== 0x46546c67) throw new Error('Invalid GLB');
let offset=12,json=null,binStart=-1,binLength=0;
while(offset<bytes.length){
  const len=bytes.readUInt32LE(offset);
  const type=bytes.readUInt32LE(offset+4);
  const start=offset+8;
  if(type===0x4e4f534a){
    json=JSON.parse(bytes.subarray(start,start+len).toString('utf8').replace(/\u0000+$/g,'').trim());
  } else if(type===0x004e4942){
    binStart=start; binLength=len;
  }
  offset=start+len;
}
if(!json||binStart<0) throw new Error('GLB chunks missing');
const bin=Buffer.from(bytes.subarray(binStart,binStart+binLength));
const dv=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);

function matrixFromNode(node, replaceScale=false){
  const m=new THREE.Matrix4();
  if(node.matrix){
    m.fromArray(node.matrix.map(Number));
    if(replaceScale){
      const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
      m.decompose(p,q,s); s.set(1,1,1); m.compose(p,q,s);
    }
    return m;
  }
  const p=new THREE.Vector3(...(node.translation??[0,0,0]).map(Number));
  const q=new THREE.Quaternion(...(node.rotation??[0,0,0,1]).map(Number));
  const s=replaceScale?new THREE.Vector3(1,1,1):new THREE.Vector3(...(node.scale??[1,1,1]).map(Number));
  return m.compose(p,q,s);
}
function isHundredth(node){
  if(Array.isArray(node.scale)&&node.scale.length===3){
    return node.scale.every(v=>Math.abs(Number(v)-0.01)<1e-6);
  }
  if(Array.isArray(node.matrix)&&node.matrix.length===16){
    const m=new THREE.Matrix4().fromArray(node.matrix.map(Number));
    const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
    m.decompose(p,q,s);
    return [s.x,s.y,s.z].every(v=>Math.abs(v-0.01)<1e-6);
  }
  return false;
}
const embedded=json.nodes.map((n,i)=>isHundredth(n)?i:-1).filter(i=>i>=0);
if(embedded.length!==1) throw new Error('embedded scale node mismatch');
const embeddedIndex=embedded[0];
const world=new Array(json.nodes.length);
const scene=json.scenes[json.scene??0];
function visit(i,parent){
  world[i]=parent.clone().multiply(matrixFromNode(json.nodes[i],i===embeddedIndex));
  for(const c of json.nodes[i].children??[]) visit(c,world[i]);
}
for(const root of scene.nodes??[]) visit(root,new THREE.Matrix4());

const outsideRoot=json.nodes.findIndex(n=>n?.name==='geo1_outside_0');
if(outsideRoot<0) throw new Error('outside node missing');
const outside=new Set(),stack=[outsideRoot];
while(stack.length){const i=stack.pop();outside.add(i);for(const c of json.nodes[i].children??[])stack.push(c);}

function info(ai){
  const a=json.accessors[ai],v=json.bufferViews[a.bufferView];
  if(a.componentType!==5126||a.type!=='VEC3') throw new Error('POSITION layout');
  return {a,v,stride:v.byteStride??12,base:(v.byteOffset??0)+(a.byteOffset??0)};
}
function read(inf,i){
  const o=inf.base+i*inf.stride;
  return new THREE.Vector3(dv.getFloat32(o,true),dv.getFloat32(o+4,true),dv.getFloat32(o+8,true));
}
function write(inf,i,p){
  const o=inf.base+i*inf.stride;
  dv.setFloat32(o,p.x,true);dv.setFloat32(o+4,p.y,true);dv.setFloat32(o+8,p.z,true);
}

const primitives=[];
for(let ni=0;ni<json.nodes.length;ni++){
  const n=json.nodes[ni];
  if(n?.mesh===undefined||!world[ni]) continue;
  for(const p of json.meshes[n.mesh]?.primitives??[]){
    const ai=p.attributes?.POSITION;
    if(ai!==undefined) primitives.push({ni,ai,inf:info(ai)});
  }
}

const bounds=new THREE.Box3();
for(const {ni,inf} of primitives){
  for(let i=0;i<inf.a.count;i++){
    const p=read(inf,i).applyMatrix4(world[ni]);
    bounds.expandByPoint(new THREE.Vector3(
      -RAW_SOURCE_CENTER.x+AUTHORITATIVE_SCALE*p.x,
      Y_ORIGIN-RAW_SOURCE_CENTER.y+AUTHORITATIVE_SCALE*p.y,
      -RAW_SOURCE_CENTER.z+AUTHORITATIVE_SCALE*p.z,
    ));
  }
}
const center=bounds.getCenter(new THREE.Vector3());
function toWorld(raw){
  return new THREE.Vector3(
    -RAW_SOURCE_CENTER.x-center.x+AUTHORITATIVE_SCALE*raw.x,
    Y_ORIGIN-RAW_SOURCE_CENTER.y-center.y+AUTHORITATIVE_SCALE*raw.y,
    -RAW_SOURCE_CENTER.z-center.z+AUTHORITATIVE_SCALE*raw.z,
  );
}
function fromWorld(p){
  return new THREE.Vector3(
    (p.x+RAW_SOURCE_CENTER.x+center.x)/AUTHORITATIVE_SCALE,
    (p.y-Y_ORIGIN+RAW_SOURCE_CENTER.y+center.y)/AUTHORITATIVE_SCALE,
    (p.z+RAW_SOURCE_CENTER.z+center.z)/AUTHORITATIVE_SCALE,
  );
}
function remap(r){
  if(r<=RADIAL_ANCHOR) return r;
  if(r<=SOURCE_OUTER) return RADIAL_ANCHOR+(r-RADIAL_ANCHOR)*RADIAL_SCALE;
  return r+OUTER_SHIFT;
}

const processedAccessors=new Set();
let changed=0,minBefore=Infinity,maxBefore=-Infinity,minAfter=Infinity,maxAfter=-Infinity;
for(const {ni,ai,inf} of primitives){
  if(!outside.has(ni)||processedAccessors.has(ai)) continue;
  processedAccessors.add(ai);
  const inv=world[ni].clone().invert();
  for(let i=0;i<inf.a.count;i++){
    const local=read(inf,i);
    const raw=local.clone().applyMatrix4(world[ni]);
    const p=toWorld(raw);
    const r=Math.hypot(p.x,p.z);
    const nr=remap(r);
    if(!(nr>r+1e-9)) continue;
    const k=nr/r;p.x*=k;p.z*=k;
    write(inf,i,fromWorld(p).applyMatrix4(inv));
    changed++;
    minBefore=Math.min(minBefore,r);maxBefore=Math.max(maxBefore,r);
    minAfter=Math.min(minAfter,nr);maxAfter=Math.max(maxAfter,nr);
  }
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<inf.a.count;i++){
    const p=read(inf,i);
    for(let a=0;a<3;a++){const v=[p.x,p.y,p.z][a];min[a]=Math.min(min[a],v);max[a]=Math.max(max[a],v);}
  }
  json.accessors[ai].min=min;json.accessors[ai].max=max;
}
if(!changed) throw new Error('no vertices changed');

let jb=Buffer.from(JSON.stringify(json),'utf8');
const pad=(4-jb.length%4)%4;if(pad)jb=Buffer.concat([jb,Buffer.alloc(pad,0x20)]);
const total=12+8+jb.length+8+bin.length;
const out=Buffer.alloc(total);
out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(total,8);
out.writeUInt32LE(jb.length,12);out.writeUInt32LE(0x4e4f534a,16);jb.copy(out,20);
const bh=20+jb.length;out.writeUInt32LE(bin.length,bh);out.writeUInt32LE(0x004e4942,bh+4);bin.copy(out,bh+8);
writeFileSync(outputPath,out);

console.log(JSON.stringify({
  changedVertices:changed,
  processedAccessors:[...processedAccessors],
  radialAnchor:RADIAL_ANCHOR,
  sourceOuter:SOURCE_OUTER,
  targetOuter:TARGET_OUTER,
  radialScale:RADIAL_SCALE,
  changedRadiusBefore:[minBefore,maxBefore],
  changedRadiusAfter:[minAfter,maxAfter],
  bytesBefore:bytes.length,
  bytesAfter:out.length
},null,2));
