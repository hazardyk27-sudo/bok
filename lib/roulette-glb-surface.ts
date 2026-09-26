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
