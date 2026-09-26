import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const ROOT = process.cwd();
const GLB_PATH = resolve(ROOT, 'artifacts/roulette-physics-lab/public/rou-lp-test-04.glb');
const CONFIG_PATH = resolve(ROOT, 'lib/roulette-physics-config.ts');
const MAPPING_PATH = resolve(ROOT, 'lib/roulette-pocket-mapping.ts');
const OUTPUT_PATH = resolve(ROOT, 'artifacts/api-server/src/physics-lab/glbColliderData.ts');

const glbBytes = readFileSync(GLB_PATH);
const physicsSource = readFileSync(CONFIG_PATH, 'utf8');
const mappingSource = readFileSync(MAPPING_PATH, 'utf8');

function requiredNumber(source, pattern, label) {
  const match = source.match(pattern);
  if (!match) throw new Error('Missing ' + label);
  const value = Number(match[1]);
  if (!Number.isFinite(value)) throw new Error('Invalid ' + label);
  return value;
}

const AUTHORITATIVE_SCALE = requiredNumber(
  physicsSource,
  /ROULETTE_AUTHORITATIVE_SCALE\s*=\s*([-+0-9.eE]+)/,
  'ROULETTE_AUTHORITATIVE_SCALE',
);
const Y_ORIGIN = requiredNumber(
  physicsSource,
  /ROULETTE_Y_ORIGIN\s*=\s*([-+0-9.eE]+)/,
  'ROULETTE_Y_ORIGIN',
);
const rawCenterMatch = physicsSource.match(
  /ROULETTE_RAW_SOURCE_CENTER\s*=\s*\{\s*x:\s*([-+0-9.eE]+),\s*y:\s*([-+0-9.eE]+),\s*z:\s*([-+0-9.eE]+)\s*\}/,
);
if (!rawCenterMatch) throw new Error('Missing ROULETTE_RAW_SOURCE_CENTER');
const RAW_SOURCE_CENTER = rawCenterMatch.slice(1).map(Number);
const VISIBLE_ZERO_DEGREES = requiredNumber(
  mappingSource,
  /ROULETTE_GLB_VISIBLE_ZERO_ANGLE_DEGREES\s*=\s*([-+0-9.eE]+)/,
  'ROULETTE_GLB_VISIBLE_ZERO_ANGLE_DEGREES',
);
const VISIBLE_ZERO_RADIANS = VISIBLE_ZERO_DEGREES * Math.PI / 180;

function parseGlb(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67) throw new Error('Invalid GLB magic');
  if (bytes.readUInt32LE(4) !== 2) throw new Error('Only GLB v2 is supported');
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error('GLB length mismatch');
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < bytes.length) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + chunkLength;
    if (end > bytes.length) throw new Error('GLB chunk overflow');
    if (chunkType === 0x4e4f534a) {
      json = JSON.parse(bytes.subarray(start, end).toString('utf8').replace(/\u0000+$/g, '').trim());
    } else if (chunkType === 0x004e4942) {
      bin = bytes.subarray(start, end);
    }
    offset = end;
  }
  if (!json || !bin) throw new Error('GLB JSON/BIN chunk missing');
  if ((json.buffers?.length ?? 0) !== 1 || json.buffers[0]?.uri) {
    throw new Error('Exact collider generator requires one embedded GLB buffer');
  }
  return { json, bin };
}

const { json, bin } = parseGlb(glbBytes);

const COMPONENT_BYTES = new Map([
  [5120, 1], [5121, 1], [5122, 2], [5123, 2], [5125, 4], [5126, 4],
]);
const TYPE_COMPONENTS = new Map([
  ['SCALAR', 1], ['VEC2', 2], ['VEC3', 3], ['VEC4', 4],
  ['MAT2', 4], ['MAT3', 9], ['MAT4', 16],
]);

function readComponent(view, offset, componentType) {
  switch (componentType) {
    case 5120: return view.getInt8(offset);
    case 5121: return view.getUint8(offset);
    case 5122: return view.getInt16(offset, true);
    case 5123: return view.getUint16(offset, true);
    case 5125: return view.getUint32(offset, true);
    case 5126: return view.getFloat32(offset, true);
    default: throw new Error('Unsupported componentType ' + componentType);
  }
}

function readAccessor(accessorIndex) {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) throw new Error('Missing accessor ' + accessorIndex);
  if (accessor.sparse) throw new Error('Sparse accessors are not supported');
  const bufferView = json.bufferViews?.[accessor.bufferView];
  if (!bufferView) throw new Error('Missing bufferView for accessor ' + accessorIndex);
  if ((bufferView.buffer ?? 0) !== 0) throw new Error('Unexpected GLB buffer index');
  const componentBytes = COMPONENT_BYTES.get(accessor.componentType);
  const components = TYPE_COMPONENTS.get(accessor.type);
  if (!componentBytes || !components) throw new Error('Unsupported accessor layout');
  const stride = bufferView.byteStride ?? componentBytes * components;
  const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const values = new Array(accessor.count * components);
  for (let i = 0; i < accessor.count; i += 1) {
    const row = base + i * stride;
    for (let component = 0; component < components; component += 1) {
      values[i * components + component] = readComponent(
        view,
        row + component * componentBytes,
        accessor.componentType,
      );
    }
  }
  return {
    values,
    count: accessor.count,
    components,
    componentType: accessor.componentType,
    type: accessor.type,
  };
}

function identity() {
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
}

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

function trsMatrix(translation, rotation, scale) {
  const [x, y, z, w] = rotation;
  const [sx, sy, sz] = scale;
  const xx=x*x, yy=y*y, zz=z*z, xy=x*y, xz=x*z, yz=y*z, wx=w*x, wy=w*y, wz=w*z;
  return [
    (1-2*(yy+zz))*sx, (2*(xy+wz))*sx, (2*(xz-wy))*sx, 0,
    (2*(xy-wz))*sy, (1-2*(xx+zz))*sy, (2*(yz+wx))*sy, 0,
    (2*(xz+wy))*sz, (2*(yz-wx))*sz, (1-2*(xx+yy))*sz, 0,
    translation[0], translation[1], translation[2], 1,
  ];
}

function transformPoint(m, x, y, z) {
  return [
    m[0]*x + m[4]*y + m[8]*z + m[12],
    m[1]*x + m[5]*y + m[9]*z + m[13],
    m[2]*x + m[6]*y + m[10]*z + m[14],
  ];
}

const embeddedScaleNodes = [];
for (let i = 0; i < (json.nodes?.length ?? 0); i += 1) {
  const scale = json.nodes[i]?.scale;
  if (
    Array.isArray(scale) &&
    scale.length === 3 &&
    scale.every((value) => Math.abs(Number(value) - 0.01) < 1e-6)
  ) {
    embeddedScaleNodes.push(i);
  }
}
if (embeddedScaleNodes.length !== 1) {
  throw new Error('Expected exactly one embedded 0.01 scale node, got ' + embeddedScaleNodes.length);
}
const embeddedScaleNode = embeddedScaleNodes[0];

function nodeLocalMatrix(index) {
  const node = json.nodes[index];
  if (node.matrix) {
    if (index === embeddedScaleNode) {
      throw new Error('Embedded scale node unexpectedly uses matrix transform');
    }
    return node.matrix.map(Number);
  }
  const translation = (node.translation ?? [0,0,0]).map(Number);
  const rotation = (node.rotation ?? [0,0,0,1]).map(Number);
  const scale = index === embeddedScaleNode
    ? [1,1,1]
    : (node.scale ?? [1,1,1]).map(Number);
  return trsMatrix(translation, rotation, scale);
}

const scene = json.scenes?.[json.scene ?? 0];
if (!scene) throw new Error('GLB scene missing');
const worldMatrices = new Array(json.nodes.length);
const parentIndex = new Array(json.nodes.length).fill(-1);

function visitNode(index, parentWorld, parent) {
  if (worldMatrices[index]) throw new Error('Node reached more than once: ' + index);
  parentIndex[index] = parent;
  const world = multiply(parentWorld, nodeLocalMatrix(index));
  worldMatrices[index] = world;
  for (const child of json.nodes[index].children ?? []) {
    visitNode(child, world, index);
  }
}
for (const rootNode of scene.nodes ?? []) visitNode(rootNode, identity(), -1);

function findNodeByName(name) {
  const hits = [];
  for (let i = 0; i < json.nodes.length; i += 1) {
    if (json.nodes[i]?.name === name) hits.push(i);
  }
  if (hits.length !== 1) throw new Error('Expected one node named ' + name + ', got ' + hits.length);
  return hits[0];
}

const outsideNode = findNodeByName('geo1_outside_0');
const insideNode = findNodeByName('geo1_inside_0');
const turretNode = findNodeByName('geo1_turret_0');

function collectDescendants(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    out.push(current);
    for (const child of json.nodes[current].children ?? []) stack.push(child);
  }
  return new Set(out);
}
const outsideSet = collectDescendants(outsideNode);
const insideSet = collectDescendants(insideNode);
const turretSet = collectDescendants(turretNode);

function primitiveTrianglesForNode(nodeIndex) {
  const node = json.nodes[nodeIndex];
  if (node.mesh === undefined) return [];
  const mesh = json.meshes?.[node.mesh];
  if (!mesh) throw new Error('Missing mesh ' + node.mesh);
  const result = [];
  for (let primitiveIndex = 0; primitiveIndex < mesh.primitives.length; primitiveIndex += 1) {
    const primitive = mesh.primitives[primitiveIndex];
    const mode = primitive.mode ?? 4;
    if (mode !== 4) continue;
    const positionAccessorIndex = primitive.attributes?.POSITION;
    if (positionAccessorIndex === undefined) continue;
    const positions = readAccessor(positionAccessorIndex);
    if (positions.type !== 'VEC3' || positions.componentType !== 5126) {
      throw new Error('POSITION must be Float32 VEC3');
    }
    let indices;
    if (primitive.indices === undefined) {
      indices = Array.from({ length: positions.count }, (_, i) => i);
    } else {
      const read = readAccessor(primitive.indices);
      if (read.type !== 'SCALAR') throw new Error('Index accessor must be SCALAR');
      indices = read.values.map(Number);
    }
    if (indices.length % 3 !== 0) throw new Error('Triangle index count not divisible by 3');
    result.push({
      positions: positions.values,
      indices,
      nodeIndex,
      primitiveIndex,
      material: primitive.material ?? null,
    });
  }
  return result;
}

const allPrimitives = [];
for (let nodeIndex = 0; nodeIndex < json.nodes.length; nodeIndex += 1) {
  if (!worldMatrices[nodeIndex]) continue;
  for (const primitive of primitiveTrianglesForNode(nodeIndex)) allPrimitives.push(primitive);
}

let min = [Infinity, Infinity, Infinity];
let max = [-Infinity, -Infinity, -Infinity];
function updateBounds(point) {
  for (let axis = 0; axis < 3; axis += 1) {
    if (point[axis] < min[axis]) min[axis] = point[axis];
    if (point[axis] > max[axis]) max[axis] = point[axis];
  }
}

for (const primitive of allPrimitives) {
  const matrix = worldMatrices[primitive.nodeIndex];
  for (let i = 0; i < primitive.positions.length; i += 3) {
    const raw = transformPoint(
      matrix,
      primitive.positions[i],
      primitive.positions[i+1],
      primitive.positions[i+2],
    );
    const stageOne = [
      Y_ORIGIN * 0 + (-RAW_SOURCE_CENTER[0] + AUTHORITATIVE_SCALE * raw[0]),
      Y_ORIGIN - RAW_SOURCE_CENTER[1] + AUTHORITATIVE_SCALE * raw[1],
      Y_ORIGIN * 0 + (-RAW_SOURCE_CENTER[2] + AUTHORITATIVE_SCALE * raw[2]),
    ];
    updateBounds(stageOne);
  }
}
if (!min.every(Number.isFinite) || !max.every(Number.isFinite)) throw new Error('GLB bounds failed');
const normalizedCenterWorld = [
  (min[0]+max[0])/2,
  (min[1]+max[1])/2,
  (min[2]+max[2])/2,
];

function authoritativePoint(rawPoint) {
  return [
    -RAW_SOURCE_CENTER[0] - normalizedCenterWorld[0] + AUTHORITATIVE_SCALE * rawPoint[0],
    Y_ORIGIN - RAW_SOURCE_CENTER[1] - normalizedCenterWorld[1] + AUTHORITATIVE_SCALE * rawPoint[1],
    -RAW_SOURCE_CENTER[2] - normalizedCenterWorld[2] + AUTHORITATIVE_SCALE * rawPoint[2],
  ];
}

function rotorBasis(point) {
  const reflectedX = -point[0];
  const c = Math.cos(VISIBLE_ZERO_RADIANS);
  const s = Math.sin(VISIBLE_ZERO_RADIANS);
  return [
    c * reflectedX + s * point[2],
    point[1],
    -s * reflectedX + c * point[2],
  ];
}

function buildMesh(nodeSet, applyRotorBasis) {
  const vertices = [];
  const indices = [];
  let triangleCount = 0;
  for (const primitive of allPrimitives) {
    if (!nodeSet.has(primitive.nodeIndex)) continue;
    const matrix = worldMatrices[primitive.nodeIndex];
    const base = vertices.length / 3;
    for (let i = 0; i < primitive.positions.length; i += 3) {
      const raw = transformPoint(
        matrix,
        primitive.positions[i],
        primitive.positions[i+1],
        primitive.positions[i+2],
      );
      const p = authoritativePoint(raw);
      const finalPoint = applyRotorBasis ? rotorBasis(p) : p;
      vertices.push(finalPoint[0], finalPoint[1], finalPoint[2]);
    }
    for (const index of primitive.indices) indices.push(base + index);
    triangleCount += primitive.indices.length / 3;
  }
  if (vertices.length === 0 || indices.length === 0) throw new Error('Generated empty collider mesh');
  if (Math.max(...indices.slice(0, Math.min(indices.length, 10000))) >= vertices.length/3) {
    throw new Error('Generated collider index out of range');
  }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
    triangleCount,
  };
}

function mergeMeshes(meshes) {
  let vertexCount = 0;
  let indexCount = 0;
  for (const mesh of meshes) {
    vertexCount += mesh.vertices.length / 3;
    indexCount += mesh.indices.length;
  }
  const vertices = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(indexCount);
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const mesh of meshes) {
    vertices.set(mesh.vertices, vertexOffset * 3);
    for (let i = 0; i < mesh.indices.length; i += 1) {
      indices[indexOffset + i] = mesh.indices[i] + vertexOffset;
    }
    vertexOffset += mesh.vertices.length / 3;
    indexOffset += mesh.indices.length;
  }
  return { vertices, indices, triangleCount: indexCount / 3 };
}

const stationary = mergeMeshes([
  buildMesh(outsideSet, false),
  buildMesh(turretSet, false),
]);
const rotor = buildMesh(insideSet, true);

function base64TypedArray(typed) {
  return Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString('base64');
}

const sourceSha256 = createHash('sha256').update(glbBytes).digest('hex');
const geometryHash = createHash('sha256')
  .update(Buffer.from(stationary.vertices.buffer))
  .update(Buffer.from(stationary.indices.buffer))
  .update(Buffer.from(rotor.vertices.buffer))
  .update(Buffer.from(rotor.indices.buffer))
  .digest('hex');

function escapedString(value) {
  return JSON.stringify(value);
}

const output = `// AUTO-GENERATED by artifacts/roulette-physics-lab/scripts/generate-exact-collider-data.mjs
// Do not hand-edit. This file is the server-side collision copy of the rendered GLB geometry.

export const ROULETTE_EXACT_GLB_COLLIDER_METADATA = ${JSON.stringify({
  schemaVersion: 'roulette-exact-glb-collider-v1',
  sourcePath: 'artifacts/roulette-physics-lab/public/rou-lp-test-04.glb',
  sourceSha256,
  geometrySha256: geometryHash,
  authoritativeScale: AUTHORITATIVE_SCALE,
  rawSourceCenter: RAW_SOURCE_CENTER,
  yOrigin: Y_ORIGIN,
  visibleZeroDegrees: VISIBLE_ZERO_DEGREES,
  stationaryVertices: stationary.vertices.length / 3,
  stationaryTriangles: stationary.indices.length / 3,
  rotorVertices: rotor.vertices.length / 3,
  rotorTriangles: rotor.indices.length / 3,
}, null, 2)} as const;

const STATIONARY_VERTICES_BASE64 = ${escapedString(base64TypedArray(stationary.vertices))};
const STATIONARY_INDICES_BASE64 = ${escapedString(base64TypedArray(stationary.indices))};
const ROTOR_VERTICES_BASE64 = ${escapedString(base64TypedArray(rotor.vertices))};
const ROTOR_INDICES_BASE64 = ${escapedString(base64TypedArray(rotor.indices))};

function decodeFloat32Base64(encoded: string) {
  const bytes = Uint8Array.from(Buffer.from(encoded, 'base64'));
  if (bytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error('Invalid generated Float32 collider payload');
  }
  return new Float32Array(bytes.buffer);
}

function decodeUint32Base64(encoded: string) {
  const bytes = Uint8Array.from(Buffer.from(encoded, 'base64'));
  if (bytes.byteLength % Uint32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error('Invalid generated Uint32 collider payload');
  }
  return new Uint32Array(bytes.buffer);
}

let decoded:
  | {
      stationary: { vertices: Float32Array; indices: Uint32Array };
      rotor: { vertices: Float32Array; indices: Uint32Array };
    }
  | null = null;

export function getRouletteExactGlbColliderGeometry() {
  decoded ??= {
    stationary: {
      vertices: decodeFloat32Base64(STATIONARY_VERTICES_BASE64),
      indices: decodeUint32Base64(STATIONARY_INDICES_BASE64),
    },
    rotor: {
      vertices: decodeFloat32Base64(ROTOR_VERTICES_BASE64),
      indices: decodeUint32Base64(ROTOR_INDICES_BASE64),
    },
  };
  return decoded;
}
`;

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, output);
console.log(JSON.stringify({
  sourceSha256,
  geometryHash,
  stationaryVertices: stationary.vertices.length / 3,
  stationaryTriangles: stationary.indices.length / 3,
  rotorVertices: rotor.vertices.length / 3,
  rotorTriangles: rotor.indices.length / 3,
  output: OUTPUT_PATH,
}, null, 2));
