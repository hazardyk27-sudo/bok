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
