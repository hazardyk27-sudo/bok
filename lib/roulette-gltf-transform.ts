import * as THREE from "three";
import {
  ROULETTE_AUTHORITATIVE_SCALE,
  ROULETTE_RAW_SOURCE_CENTER,
  ROULETTE_Y_ORIGIN,
} from "./roulette-physics-config";
import {
  ROULETTE_GLB_VISIBLE_ZERO_ANGLE_RADIANS,
} from "./roulette-pocket-mapping";

const EMBEDDED_SCALE = 0.01;
const EMBEDDED_SCALE_EPSILON = 0.000001;

export type AuthoritativeRouletteGlbRuntime = {
  runtimeOffset: THREE.Group;
  embeddedScaleNode: THREE.Object3D;
  outside: THREE.Object3D;
  inside: THREE.Object3D;
  turret: THREE.Object3D;
  normalizedBounds: THREE.Box3;
  normalizedCenterWorld: THREE.Vector3;
  runtimeSceneWorldMatrix: THREE.Matrix4;
};

function isEmbeddedScaleNode(node: THREE.Object3D) {
  return (
    Math.abs(node.scale.x - EMBEDDED_SCALE) < EMBEDDED_SCALE_EPSILON &&
    Math.abs(node.scale.y - EMBEDDED_SCALE) < EMBEDDED_SCALE_EPSILON &&
    Math.abs(node.scale.z - EMBEDDED_SCALE) < EMBEDDED_SCALE_EPSILON
  );
}

/**
 * Single authoritative GLB -> roulette-world transform.
 *
 * Render geometry and every future mesh-derived collider must be extracted
 * only after this function has run. That keeps scale/recenter/world matrices
 * identical instead of maintaining a second approximate physics transform.
 */
export function prepareAuthoritativeRouletteGlb(
  runtimeScene: THREE.Object3D,
  wheelRoot: THREE.Group,
): AuthoritativeRouletteGlbRuntime {
  let embeddedScaleNode: THREE.Object3D | undefined;
  runtimeScene.traverse((child) => {
    if (!embeddedScaleNode && isEmbeddedScaleNode(child)) {
      embeddedScaleNode = child;
    }
  });
  if (!embeddedScaleNode) {
    throw new Error("ROULETTE_MODEL_SCALE_ROOT_MISSING");
  }

  embeddedScaleNode.scale.set(1, 1, 1);
  runtimeScene.updateMatrixWorld(true);

  const outside = runtimeScene.getObjectByName("geo1_outside_0");
  const inside = runtimeScene.getObjectByName("geo1_inside_0");
  const turret = runtimeScene.getObjectByName("geo1_turret_0");
  if (!outside || !inside || !turret) {
    throw new Error("ROULETTE_MODEL_REQUIRED_NODES_MISSING");
  }

  wheelRoot.position.set(0, ROULETTE_Y_ORIGIN, 0);

  const sourceCenter = new THREE.Vector3(
    ROULETTE_RAW_SOURCE_CENTER.x,
    ROULETTE_RAW_SOURCE_CENTER.y,
    ROULETTE_RAW_SOURCE_CENTER.z,
  );

  const runtimeOffset = new THREE.Group();
  runtimeOffset.name = "Roulette__AuthoritativeRuntimeOffset";
  runtimeOffset.position.set(-sourceCenter.x, -sourceCenter.y, -sourceCenter.z);
  runtimeOffset.scale.setScalar(ROULETTE_AUTHORITATIVE_SCALE);
  runtimeOffset.add(runtimeScene);
  wheelRoot.add(runtimeOffset);
  wheelRoot.updateMatrixWorld(true);

  const normalizedBounds = new THREE.Box3().setFromObject(runtimeScene);
  const normalizedCenterWorld = normalizedBounds.getCenter(new THREE.Vector3());
  runtimeOffset.position.sub(normalizedCenterWorld);
  wheelRoot.updateMatrixWorld(true);

  return {
    runtimeOffset,
    embeddedScaleNode,
    outside,
    inside,
    turret,
    normalizedBounds: new THREE.Box3().setFromObject(runtimeScene),
    normalizedCenterWorld,
    runtimeSceneWorldMatrix: runtimeScene.matrixWorld.clone(),
  };
}


/**
 * Converts the raw GLB rotor basis into the authoritative physics basis.
 *
 * Raw GLB sequence: theta = visibleZero - index * step
 * Physics sequence: theta = index * step
 *
 * Reflecting X maps theta -> -theta, then rotating by visibleZero maps
 * theta -> visibleZero - theta. The exact same group transform must be used
 * by render geometry and every mesh-derived rotor collider.
 */
export function applyAuthoritativeRouletteRotorBasis(
  rotorVisual: THREE.Group,
) {
  rotorVisual.scale.set(-1, 1, 1);
  rotorVisual.rotation.set(0, ROULETTE_GLB_VISIBLE_ZERO_ANGLE_RADIANS, 0);
  rotorVisual.updateMatrix();
  rotorVisual.updateMatrixWorld(true);
  rotorVisual.userData.rouletteRotorBasis = {
    reflectX: true,
    rotationYRadians: ROULETTE_GLB_VISIBLE_ZERO_ANGLE_RADIANS,
  };
}
