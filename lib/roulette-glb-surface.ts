import * as THREE from "three";

export type RouletteVisualSurfaceHit = {
  y: number;
  point: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  source: string;
};

export type RouletteVisualSurfaceProbeOptions = {
  rayOriginY?: number;
  rayLength?: number;
  minY?: number;
  maxY?: number;
  accept?: (intersection: THREE.Intersection) => boolean;
};

export function measureRouletteVisualSurfaceAt(
  roots: readonly THREE.Object3D[],
  x: number,
  z: number,
  options: RouletteVisualSurfaceProbeOptions = {},
): RouletteVisualSurfaceHit | null {
  const rayOriginY = options.rayOriginY ?? 1.5;
  const rayLength = options.rayLength ?? 4;
  const minY = options.minY ?? -1.5;
  const maxY = options.maxY ?? 1;

  for (const root of roots) root.updateMatrixWorld(true);

  const rayOrigin = new THREE.Vector3(x, rayOriginY, z);
  const raycaster = new THREE.Raycaster(
    rayOrigin,
    new THREE.Vector3(0, -1, 0),
    0,
    rayLength,
  );

  const intersections = raycaster
    .intersectObjects([...roots], true)
    .filter(
      (intersection) =>
        intersection.point.y >= minY &&
        intersection.point.y <= maxY &&
        (options.accept?.(intersection) ?? true),
    )
    .sort((left, right) => right.point.y - left.point.y);

  const hit = intersections[0];
  if (!hit) return null;

  const normal = hit.face
    ? hit.face.normal
        .clone()
        .transformDirection(
          new THREE.Matrix4().extractRotation(hit.object.matrixWorld),
        )
        .normalize()
    : new THREE.Vector3(0, 1, 0);

  const towardRay = rayOrigin.clone().sub(hit.point);
  if (normal.dot(towardRay) < 0) normal.negate();

  return {
    y: hit.point.y,
    point: {
      x: hit.point.x,
      y: hit.point.y,
      z: hit.point.z,
    },
    normal: {
      x: normal.x,
      y: normal.y,
      z: normal.z,
    },
    source: hit.object.name || hit.object.parent?.name || "unnamed-mesh",
  };
}


export type RouletteVisualTextureSample = {
  r: number;
  g: number;
  b: number;
  a: number;
  uv: { x: number; y: number };
  source: string;
  texture: string;
};

const texturePixelCache = new WeakMap<
  THREE.Texture,
  { width: number; height: number; data: Uint8ClampedArray }
>();

function readTexturePixels(texture: THREE.Texture) {
  const cached = texturePixelCache.get(texture);
  if (cached) return cached;

  const image = texture.image as
    | (CanvasImageSource & { width: number; height: number; data?: unknown })
    | undefined;
  if (!image || !Number.isFinite(image.width) || !Number.isFinite(image.height)) {
    return null;
  }

  const width = Math.max(1, Math.floor(image.width));
  const height = Math.max(1, Math.floor(image.height));

  const possibleData = (image as { data?: unknown }).data;
  if (
    possibleData instanceof Uint8Array ||
    possibleData instanceof Uint8ClampedArray
  ) {
    const raw = new Uint8ClampedArray(
      possibleData.buffer,
      possibleData.byteOffset,
      possibleData.byteLength,
    );
    if (raw.length >= width * height * 4) {
      const result = { width, height, data: raw };
      texturePixelCache.set(texture, result);
      return result;
    }
  }

  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  try {
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    const result = { width, height, data: pixels.data };
    texturePixelCache.set(texture, result);
    return result;
  } catch {
    return null;
  }
}

function materialForIntersection(intersection: THREE.Intersection) {
  const mesh = intersection.object as THREE.Mesh;
  const material = mesh.material;
  if (!Array.isArray(material)) return material;
  const index = intersection.face?.materialIndex ?? 0;
  return material[index] ?? material[0] ?? null;
}

export function sampleRouletteVisualTextureColorAt(
  roots: readonly THREE.Object3D[],
  x: number,
  z: number,
  options: RouletteVisualSurfaceProbeOptions = {},
): RouletteVisualTextureSample | null {
  const rayOriginY = options.rayOriginY ?? 1.5;
  const rayLength = options.rayLength ?? 4;
  const minY = options.minY ?? -1.5;
  const maxY = options.maxY ?? 1;

  for (const root of roots) root.updateMatrixWorld(true);

  const rayOrigin = new THREE.Vector3(x, rayOriginY, z);
  const raycaster = new THREE.Raycaster(
    rayOrigin,
    new THREE.Vector3(0, -1, 0),
    0,
    rayLength,
  );

  const intersections = raycaster
    .intersectObjects([...roots], true)
    .filter(
      (intersection) =>
        intersection.point.y >= minY &&
        intersection.point.y <= maxY &&
        (options.accept?.(intersection) ?? true),
    )
    .sort((left, right) => right.point.y - left.point.y);

  for (const intersection of intersections) {
    if (!intersection.uv) continue;
    const material = materialForIntersection(intersection) as
      | THREE.MeshStandardMaterial
      | THREE.MeshPhongMaterial
      | THREE.MeshBasicMaterial
      | null;
    const texture = material?.map ?? null;
    if (!texture) continue;
    const pixels = readTexturePixels(texture);
    if (!pixels) continue;

    if (texture.matrixAutoUpdate) texture.updateMatrix();
    const uv = intersection.uv.clone();
    texture.transformUv(uv);
    const px = Math.min(
      pixels.width - 1,
      Math.max(0, Math.floor(uv.x * pixels.width)),
    );
    const py = Math.min(
      pixels.height - 1,
      Math.max(0, Math.floor(uv.y * pixels.height)),
    );
    const offset = (py * pixels.width + px) * 4;

    const materialColor = material.color ?? new THREE.Color(1, 1, 1);
    return {
      r: Math.round((pixels.data[offset] ?? 0) * materialColor.r),
      g: Math.round((pixels.data[offset + 1] ?? 0) * materialColor.g),
      b: Math.round((pixels.data[offset + 2] ?? 0) * materialColor.b),
      a: pixels.data[offset + 3] ?? 255,
      uv: { x: uv.x, y: uv.y },
      source:
        intersection.object.name ||
        intersection.object.parent?.name ||
        "unnamed-mesh",
      texture: texture.name || texture.uuid,
    };
  }

  return null;
}
