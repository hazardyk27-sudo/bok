import * as THREE from 'three';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const inputPath = resolve(
  ROOT,
  process.argv[2] ?? 'artifacts/roulette-physics-lab/public/rou-lp-test-04.glb',
);
const outputPath = resolve(ROOT, process.argv[3] ?? process.argv[2] ?? 'artifacts/roulette-physics-lab/public/rou-lp-test-04.glb');

const AUTHORITATIVE_SCALE = 7.147963;
const RAW_SOURCE_CENTER = new THREE.Vector3(0, 0.167928, 0);
const Y_ORIGIN = 0;
const INNER_ANCHOR = 2.47;
const SOURCE_OUTER = 2.56;
const TARGET_OUTER = 2.65;
const TARGET_Y_MIN = -0.35;
const TARGET_Y_MAX = 0.08;
const MAX_SOURCE_RADIUS = 2.60;

const bytes = Buffer.from(readFileSync(inputPath));
if (bytes.readUInt32LE(0) !== 0x46546c67) throw new Error('Invalid GLB magic');
if (bytes.readUInt32LE(4) !== 2) throw new Error('Only GLB v2 is supported');

let offset = 12;
let jsonChunkStart = -1;
let jsonChunkLength = 0;
let binChunkStart = -1;
let binChunkLength = 0;
let json = null;
while (offset < bytes.length) {
  const chunkLength = bytes.readUInt32LE(offset);
  const chunkType = bytes.readUInt32LE(offset + 4);
  const start = offset + 8;
  if (chunkType === 0x4e4f534a) {
    jsonChunkStart = start;
    jsonChunkLength = chunkLength;
    json = JSON.parse(
      bytes.subarray(start, start + chunkLength)
        .toString('utf8')
        .replace(/\u0000+$/g, '')
        .trim(),
    );
  } else if (chunkType === 0x004e4942) {
    binChunkStart = start;
    binChunkLength = chunkLength;
  }
  offset = start + chunkLength;
}
if (!json || binChunkStart < 0) throw new Error('GLB JSON/BIN chunk missing');
const bin = bytes.subarray(binChunkStart, binChunkStart + binChunkLength);
const dataView = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);

function matrixFromNode(node, replaceEmbeddedScale = false) {
  const m = new THREE.Matrix4();
  if (node.matrix) {
    m.fromArray(node.matrix.map(Number));
    if (replaceEmbeddedScale) {
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      m.decompose(position, quaternion, scale);
      scale.set(1, 1, 1);
      m.compose(position, quaternion, scale);
    }
    return m;
  }
  const position = new THREE.Vector3(...(node.translation ?? [0,0,0]).map(Number));
  const quaternion = new THREE.Quaternion(...(node.rotation ?? [0,0,0,1]).map(Number));
  const scale = replaceEmbeddedScale
    ? new THREE.Vector3(1,1,1)
    : new THREE.Vector3(...(node.scale ?? [1,1,1]).map(Number));
  return m.compose(position, quaternion, scale);
}

function isHundredthScale(node) {
  if (Array.isArray(node.scale) && node.scale.length === 3) {
    return node.scale.every((v) => Math.abs(Number(v) - 0.01) < 1e-6);
  }
  if (Array.isArray(node.matrix) && node.matrix.length === 16) {
    const m = new THREE.Matrix4().fromArray(node.matrix.map(Number));
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    m.decompose(p,q,s);
    return [s.x,s.y,s.z].every((v) => Math.abs(v - 0.01) < 1e-6);
  }
  return false;
}

const embedded = json.nodes
  .map((node, index) => isHundredthScale(node) ? index : -1)
  .filter((index) => index >= 0);
if (embedded.length !== 1) throw new Error('Expected exactly one embedded 0.01 scale node');
const embeddedIndex = embedded[0];

const scene = json.scenes?.[json.scene ?? 0];
if (!scene) throw new Error('Scene missing');
const world = new Array(json.nodes.length);
function visit(index, parent) {
  const local = matrixFromNode(json.nodes[index], index === embeddedIndex);
  world[index] = parent.clone().multiply(local);
  for (const child of json.nodes[index].children ?? []) visit(child, world[index]);
}
for (const root of scene.nodes ?? []) visit(root, new THREE.Matrix4());

function findNode(name) {
  const hits = json.nodes.map((n,i) => n?.name === name ? i : -1).filter((i) => i >= 0);
  if (hits.length !== 1) throw new Error('Expected one node named '+name);
  return hits[0];
}
function descendants(root) {
  const set = new Set();
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    set.add(n);
    for (const child of json.nodes[n].children ?? []) stack.push(child);
  }
  return set;
}
const outsideSet = descendants(findNode('geo1_outside_0'));

function accessorInfo(index) {
  const accessor = json.accessors[index];
  const view = json.bufferViews[accessor.bufferView];
  if (accessor.componentType !== 5126 || accessor.type !== 'VEC3') {
    throw new Error('POSITION accessor must be Float32 VEC3');
  }
  return {
    accessor,
    view,
    stride: view.byteStride ?? 12,
    base: (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0),
  };
}

function readLocal(info, i) {
  const o = info.base + i * info.stride;
  return new THREE.Vector3(
    dataView.getFloat32(o, true),
    dataView.getFloat32(o + 4, true),
    dataView.getFloat32(o + 8, true),
  );
}
function writeLocal(info, i, p) {
  const o = info.base + i * info.stride;
  dataView.setFloat32(o, p.x, true);
  dataView.setFloat32(o + 4, p.y, true);
  dataView.setFloat32(o + 8, p.z, true);
}

const primitivePositions = [];
for (let nodeIndex = 0; nodeIndex < json.nodes.length; nodeIndex += 1) {
  const node = json.nodes[nodeIndex];
  if (node?.mesh === undefined || !world[nodeIndex]) continue;
  for (const primitive of json.meshes[node.mesh]?.primitives ?? []) {
    const posIndex = primitive.attributes?.POSITION;
    if (posIndex === undefined) continue;
    primitivePositions.push({ nodeIndex, posIndex, info: accessorInfo(posIndex) });
  }
}

const bounds = new THREE.Box3();
for (const {nodeIndex, info} of primitivePositions) {
  for (let i=0;i<info.accessor.count;i++) {
    const p = readLocal(info,i).applyMatrix4(world[nodeIndex]);
    const a = new THREE.Vector3(
      -RAW_SOURCE_CENTER.x + AUTHORITATIVE_SCALE * p.x,
      Y_ORIGIN - RAW_SOURCE_CENTER.y + AUTHORITATIVE_SCALE * p.y,
      -RAW_SOURCE_CENTER.z + AUTHORITATIVE_SCALE * p.z,
    );
    bounds.expandByPoint(a);
  }
}
const normalizedCenterWorld = bounds.getCenter(new THREE.Vector3());

function toAuthoritative(raw) {
  return new THREE.Vector3(
    -RAW_SOURCE_CENTER.x - normalizedCenterWorld.x + AUTHORITATIVE_SCALE * raw.x,
    Y_ORIGIN - RAW_SOURCE_CENTER.y - normalizedCenterWorld.y + AUTHORITATIVE_SCALE * raw.y,
    -RAW_SOURCE_CENTER.z - normalizedCenterWorld.z + AUTHORITATIVE_SCALE * raw.z,
  );
}
function fromAuthoritative(p) {
  return new THREE.Vector3(
    (p.x + RAW_SOURCE_CENTER.x + normalizedCenterWorld.x) / AUTHORITATIVE_SCALE,
    (p.y - Y_ORIGIN + RAW_SOURCE_CENTER.y + normalizedCenterWorld.y) / AUTHORITATIVE_SCALE,
    (p.z + RAW_SOURCE_CENTER.z + normalizedCenterWorld.z) / AUTHORITATIVE_SCALE,
  );
}

function remapRadius(r) {
  if (r <= INNER_ANCHOR) return r;
  if (r <= SOURCE_OUTER) {
    const alpha = (r - INNER_ANCHOR) / (SOURCE_OUTER - INNER_ANCHOR);
    return INNER_ANCHOR + alpha * (TARGET_OUTER - INNER_ANCHOR);
  }
  return r + (TARGET_OUTER - SOURCE_OUTER);
}

let changed = 0;
let minBefore = Infinity, maxBefore = -Infinity, minAfter = Infinity, maxAfter = -Infinity;
const touchedAccessors = new Map();

for (const {nodeIndex, posIndex, info} of primitivePositions) {
  if (!outsideSet.has(nodeIndex)) continue;
  const inverse = world[nodeIndex].clone().invert();
  let localChanged = false;
  for (let i=0;i<info.accessor.count;i++) {
    const local = readLocal(info,i);
    const raw = local.clone().applyMatrix4(world[nodeIndex]);
    const p = toAuthoritative(raw);
    const r = Math.hypot(p.x,p.z);
    if (
      p.y < TARGET_Y_MIN ||
      p.y > TARGET_Y_MAX ||
      r < INNER_ANCHOR ||
      r > MAX_SOURCE_RADIUS
    ) continue;
    const nextR = remapRadius(r);
    if (!(nextR > r + 1e-9)) continue;
    const scale = nextR / r;
    p.x *= scale;
    p.z *= scale;
    const nextRaw = fromAuthoritative(p);
    const nextLocal = nextRaw.applyMatrix4(inverse);
    writeLocal(info,i,nextLocal);
    changed += 1;
    localChanged = true;
    minBefore = Math.min(minBefore,r);
    maxBefore = Math.max(maxBefore,r);
    minAfter = Math.min(minAfter,nextR);
    maxAfter = Math.max(maxAfter,nextR);
  }
  if (localChanged) touchedAccessors.set(posIndex, info);
}

for (const [posIndex, info] of touchedAccessors) {
  const min = [Infinity,Infinity,Infinity];
  const max = [-Infinity,-Infinity,-Infinity];
  for (let i=0;i<info.accessor.count;i++) {
    const p=readLocal(info,i);
    min[0]=Math.min(min[0],p.x); min[1]=Math.min(min[1],p.y); min[2]=Math.min(min[2],p.z);
    max[0]=Math.max(max[0],p.x); max[1]=Math.max(max[1],p.y); max[2]=Math.max(max[2],p.z);
  }
  json.accessors[posIndex].min=min;
  json.accessors[posIndex].max=max;
}

if (changed === 0) throw new Error('No vertices matched outer-race widening band');

let jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
const jsonPad = (4 - (jsonBuffer.length % 4)) % 4;
if (jsonPad) jsonBuffer = Buffer.concat([jsonBuffer, Buffer.alloc(jsonPad, 0x20)]);
const binBuffer = Buffer.from(bin);
const totalLength = 12 + 8 + jsonBuffer.length + 8 + binBuffer.length;
const out = Buffer.alloc(totalLength);
out.writeUInt32LE(0x46546c67,0);
out.writeUInt32LE(2,4);
out.writeUInt32LE(totalLength,8);
out.writeUInt32LE(jsonBuffer.length,12);
out.writeUInt32LE(0x4e4f534a,16);
jsonBuffer.copy(out,20);
const binHeader = 20 + jsonBuffer.length;
out.writeUInt32LE(binBuffer.length,binHeader);
out.writeUInt32LE(0x004e4942,binHeader+4);
binBuffer.copy(out,binHeader+8);
writeFileSync(outputPath,out);

console.log(JSON.stringify({
  inputPath,
  outputPath,
  changedVertices: changed,
  touchedAccessors: [...touchedAccessors.keys()],
  authoritativeBand: {
    y:[TARGET_Y_MIN,TARGET_Y_MAX],
    sourceRadius:[INNER_ANCHOR,MAX_SOURCE_RADIUS],
    sourceOuter:SOURCE_OUTER,
    targetOuter:TARGET_OUTER,
  },
  changedRadiusBefore:[minBefore,maxBefore],
  changedRadiusAfter:[minAfter,maxAfter],
  bytesBefore:bytes.length,
  bytesAfter:out.length,
},null,2));
