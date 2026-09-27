export const ROULETTE_CANONICAL_TRIMESH_QUANTUM_WORLD = 1e-6;

export function canonicalizeRouletteTrimeshVertices(
  vertices: Float32Array,
  quantum = ROULETTE_CANONICAL_TRIMESH_QUANTUM_WORLD,
) {
  const canonical = new Float32Array(vertices.length);
  for (let index = 0; index < vertices.length; index += 1) {
    canonical[index] = Math.round(vertices[index] / quantum) * quantum;
  }
  return canonical;
}

export function rouletteTrimeshByteFingerprint(
  view: Float32Array | Uint32Array,
) {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let hash = 0x811c9dc5;
  for (let index = 0; index < bytes.length; index += 1) {
    hash = Math.imul(hash ^ bytes[index], 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
