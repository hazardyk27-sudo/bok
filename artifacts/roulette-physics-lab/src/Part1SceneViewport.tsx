import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  ROULETTE_ASSET_PATH,
  ROULETTE_AUTHORITATIVE_SCALE,
  ROULETTE_NORMALIZED_DIAMETER,
  ROULETTE_RAW_SOURCE_CENTER,
  ROULETTE_ROTATION_AXIS,
  ROULETTE_Y_ORIGIN,
} from './roulette-scene-config';

const FIXED_TIMESTEP = 1 / 120;
const TEST_ANGULAR_SPEED = 0.35;
const TWO_PI = Math.PI * 2;

type InspectionView = 'top' | 'angled' | 'side';
type LoadState = 'loading' | 'loaded' | 'error';

type Part1AssetAudit = {
  sourceMeshCount: number;
  sourceTriangles: number;
  runtimeMeshCount: number;
  runtimeTriangles: number;
  normalizationScale: number;
  dimensions: { x: number; y: number; z: number };
  pivot: { x: number; y: number; z: number };
  sourcePivot: { x: number; y: number; z: number };
  sourceRoot: string;
  excludedGeometry: string[];
  attribution: { author: string; license: string; source: string };
  stationaryMeshCount: number;
  stationaryTriangles: number;
  rotorMeshCount: number;
  rotorTriangles: number;
};

type Part1SceneViewportProps = {
  loadKey: number;
  view: InspectionView;
  showGrid: boolean;
  showStationaryGroup: boolean;
  showRotorGroup: boolean;
  rotorAngle: number;
  onStateChange: (state: LoadState, detail?: string) => void;
  onAudit: (audit: Part1AssetAudit) => void;
  onRotorAngleChange: (angle: number) => void;
};

const VIEW_PRESETS: Record<InspectionView, { position: [number, number, number]; up: [number, number, number] }> = {
  top: { position: [0, 9.4, 0.001], up: [0, 0, -1] },
  angled: { position: [5.8, 4.9, 6.6], up: [0, 1, 0] },
  side: { position: [6.8, 1.2, 0.001], up: [0, 1, 0] },
};

function countMeshes(object: THREE.Object3D) {
  let count = 0;
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) count += 1;
  });
  return count;
}

function countTriangles(object: THREE.Object3D) {
  let triangles = 0;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const position = child.geometry.getAttribute('position');
    const index = child.geometry.getIndex();
    triangles += index ? index.count / 3 : (position?.count ?? 0) / 3;
  });
  return Math.round(triangles);
}

function roundedVector(vector: THREE.Vector3) {
  return {
    x: Number(vector.x.toFixed(3)),
    y: Number(vector.y.toFixed(3)),
    z: Number(vector.z.toFixed(3)),
  };
}

function normalizedAngle(angle: number) {
  return THREE.MathUtils.euclideanModulo(angle, TWO_PI);
}

export function Part1SceneViewport({
  loadKey,
  view,
  showGrid,
  showStationaryGroup,
  showRotorGroup,
  rotorAngle,
  onStateChange,
  onAudit,
  onRotorAngleChange,
}: Part1SceneViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const rotorPivotRef = useRef<THREE.Group | null>(null);
  const viewRef = useRef(view);
  const callbacksRef = useRef({ onStateChange, onAudit, onRotorAngleChange });
  const rotorAngleRef = useRef(normalizedAngle(rotorAngle));
  const rotorStateRef = useRef({ angle: normalizedAngle(rotorAngle), angularVelocity: TEST_ANGULAR_SPEED });
  const [angleReadout, setAngleReadout] = useState(normalizedAngle(rotorAngle));

  viewRef.current = view;
  callbacksRef.current = { onStateChange, onAudit, onRotorAngleChange };

  useEffect(() => {
    rotorAngleRef.current = normalizedAngle(rotorAngle);
    rotorStateRef.current.angle = rotorAngleRef.current;
    if (rotorPivotRef.current) {
      rotorPivotRef.current.rotation.set(0, rotorAngleRef.current, 0);
    }
  }, [rotorAngle]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return undefined;

    let disposed = false;
    let frame = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let wheelRoot: THREE.Group | null = null;
    let stationaryGroup: THREE.Group | null = null;
    let rotorPivot: THREE.Group | null = null;
    let accumulator = 0;
    let lastTime = performance.now();
    let fixedStepCount = 0;

    callbacksRef.current.onStateChange('loading');

    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#17252b');
      scene.fog = new THREE.Fog('#17252b', 11, 21);

      const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
      const applyView = (nextView: InspectionView) => {
        const preset = VIEW_PRESETS[nextView];
        camera.up.set(...preset.up);
        camera.position.set(...preset.position);
        controls?.target.set(0, 0, 0);
        controls?.update();
      };

      scene.add(new THREE.DirectionalLight('#fff8df', 3.4));
      const fillLight = new THREE.DirectionalLight('#9fc7ca', 1.8);
      fillLight.position.set(-5, 3, -4);
      scene.add(fillLight);
      scene.add(new THREE.HemisphereLight('#b3d4d2', '#0e171b', 1.2));

      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(8, 64),
        new THREE.MeshStandardMaterial({ color: '#1b2e33', roughness: 0.94, metalness: 0.05 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -1.48;
      scene.add(floor);

      const grid = new THREE.GridHelper(16, 16, '#567277', '#2f474d');
      grid.material.transparent = true;
      grid.material.opacity = 0.5;
      grid.visible = showGrid;
      scene.add(grid);

      controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.enablePan = false;
      controls.minDistance = 4.2;
      controls.maxDistance = 14;
      applyView(viewRef.current);

      const loader = new GLTFLoader();
      loader.load(
        ROULETTE_ASSET_PATH,
        (gltf) => {
          if (disposed) return;

          const runtimeScene = gltf.scene.clone(true);
          runtimeScene.updateMatrixWorld(true);

          const sourceMeshCount = countMeshes(runtimeScene);
          const sourceTriangles = countTriangles(runtimeScene);
          const sourceCenter = new THREE.Vector3(
            ROULETTE_RAW_SOURCE_CENTER.x,
            ROULETTE_RAW_SOURCE_CENTER.y,
            ROULETTE_RAW_SOURCE_CENTER.z,
          );

          wheelRoot = new THREE.Group();
          wheelRoot.name = 'Part1__AuthoritativeWheelRoot';
          wheelRoot.position.set(0, ROULETTE_Y_ORIGIN, 0);
          wheelRoot.rotation.set(0, 0, 0);
          wheelRoot.scale.set(1, 1, 1);
          wheelRoot.userData = {
            sourceAsset: ROULETTE_ASSET_PATH,
            authoritativeTransform: {
              sourceCenter: ROULETTE_RAW_SOURCE_CENTER,
              normalizedCenter: { x: 0, y: 0, z: 0 },
              diameter: ROULETTE_NORMALIZED_DIAMETER,
              scale: ROULETTE_AUTHORITATIVE_SCALE,
              yOrigin: ROULETTE_Y_ORIGIN,
              rotationAxis: ROULETTE_ROTATION_AXIS,
            },
            part1Only: true,
            physicsAttached: false,
          };

          const runtimeOffset = new THREE.Group();
          runtimeOffset.name = 'Part1__NormalizationOffset';
          runtimeOffset.position.set(-sourceCenter.x, -sourceCenter.y, -sourceCenter.z);
          runtimeOffset.scale.setScalar(ROULETTE_AUTHORITATIVE_SCALE);
          runtimeOffset.add(runtimeScene);
          wheelRoot.add(runtimeOffset);
          wheelRoot.updateMatrixWorld(true);

          const normalizedBounds = new THREE.Box3().setFromObject(runtimeScene);
          const normalizedCenter = normalizedBounds.getCenter(new THREE.Vector3());
          runtimeOffset.position.sub(normalizedCenter);
          wheelRoot.updateMatrixWorld(true);

          stationaryGroup = new THREE.Group();
          stationaryGroup.name = 'Part1__StationaryOutsideAndTurret';
          stationaryGroup.position.set(0, 0, 0);
          stationaryGroup.rotation.set(0, 0, 0);
          stationaryGroup.scale.set(1, 1, 1);

          rotorPivot = new THREE.Group();
          rotorPivot.name = 'Part1__RotorPivot__Y';
          rotorPivot.position.set(0, 0, 0);
          rotorPivot.rotation.set(0, rotorAngleRef.current, 0);
          rotorPivot.scale.set(1, 1, 1);
          rotorPivot.userData = {
            pivot: { x: 0, y: 0, z: 0 },
            rotationAxis: ROULETTE_ROTATION_AXIS,
            rotorState: rotorStateRef.current,
          };

          const rotorGroup = new THREE.Group();
          rotorGroup.name = 'Part1__InsideRotorVisual';
          rotorGroup.position.set(0, 0, 0);
          rotorGroup.rotation.set(0, 0, 0);
          rotorGroup.scale.set(1, 1, 1);
          rotorPivot.add(rotorGroup);
          wheelRoot.add(stationaryGroup, rotorPivot);

          const outside = runtimeScene.getObjectByName('geo1_outside_0');
          const inside = runtimeScene.getObjectByName('geo1_inside_0');
          const turret = runtimeScene.getObjectByName('geo1_turret_0');
          if (!outside || !inside || !turret) {
            throw new Error('PART 1 requires geo1_outside_0, geo1_inside_0, and geo1_turret_0');
          }

          stationaryGroup.attach(outside);
          rotorGroup.attach(inside);
          stationaryGroup.attach(turret);
          wheelRoot.remove(runtimeOffset);
          wheelRoot.updateMatrixWorld(true);
          scene.add(wheelRoot);

          rotorPivotRef.current = rotorPivot;
          rotorPivot.userData.rotorState = rotorStateRef.current;

          const runtimeBounds = new THREE.Box3().setFromObject(wheelRoot);
          const runtimeSize = runtimeBounds.getSize(new THREE.Vector3());
          const runtimePivot = runtimeBounds.getCenter(new THREE.Vector3());
          const json = gltf.parser.json as { asset?: { extras?: Record<string, string> } };
          const extras = json.asset?.extras ?? {};

          callbacksRef.current.onAudit({
            sourceMeshCount,
            sourceTriangles,
            runtimeMeshCount: countMeshes(stationaryGroup) + countMeshes(rotorGroup),
            runtimeTriangles: countTriangles(stationaryGroup) + countTriangles(rotorGroup),
            normalizationScale: ROULETTE_AUTHORITATIVE_SCALE,
            dimensions: {
              x: Number(runtimeSize.x.toFixed(3)),
              y: Number(runtimeSize.y.toFixed(3)),
              z: Number(runtimeSize.z.toFixed(3)),
            },
            pivot: roundedVector(runtimePivot),
            sourcePivot: ROULETTE_RAW_SOURCE_CENTER,
            sourceRoot: gltf.scene.name || 'Sketchfab_model',
            excludedGeometry: [],
            stationaryMeshCount: countMeshes(stationaryGroup),
            stationaryTriangles: countTriangles(stationaryGroup),
            rotorMeshCount: countMeshes(rotorGroup),
            rotorTriangles: countTriangles(rotorGroup),
            attribution: {
              author: extras.author ?? 'Unknown author',
              license: extras.license ?? 'Unknown license',
              source: extras.source ?? 'Source URL not provided',
            },
          });
          callbacksRef.current.onStateChange('loaded', 'PART 1 visual rotor ready · 120 Hz fixed timestep');
        },
        undefined,
        (error) => {
          if (disposed) return;
          console.error('PART 1 roulette visual source failed to load', error);
          callbacksRef.current.onStateChange('error', 'The rou_LP_Test_04 visual source could not be read.');
        },
      );

      const resize = () => {
        const width = Math.max(stage.clientWidth, 1);
        const height = Math.max(stage.clientHeight, 1);
        renderer?.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(stage);
      resize();

      const resetView = () => applyView(viewRef.current);
      window.addEventListener('roulette-reset-view', resetView);

      const render = () => {
        if (disposed) return;
        const now = performance.now();
        accumulator += Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        while (accumulator >= FIXED_TIMESTEP) {
          const nextAngle = normalizedAngle(rotorAngleRef.current + TEST_ANGULAR_SPEED * FIXED_TIMESTEP);
          rotorAngleRef.current = nextAngle;
          rotorStateRef.current.angle = nextAngle;
          rotorStateRef.current.angularVelocity = TEST_ANGULAR_SPEED;
          if (rotorPivot) {
            rotorPivot.rotation.set(0, nextAngle, 0);
            rotorPivot.userData.rotorState = rotorStateRef.current;
          }
          fixedStepCount += 1;
          if (fixedStepCount % 6 === 0) {
            setAngleReadout(nextAngle);
            callbacksRef.current.onRotorAngleChange(nextAngle);
          }
          accumulator -= FIXED_TIMESTEP;
        }

        controls?.update();
        renderer?.render(scene, camera);
        frame = requestAnimationFrame(render);
      };
      render();

      return () => {
        disposed = true;
        cancelAnimationFrame(frame);
        window.removeEventListener('roulette-reset-view', resetView);
        observer.disconnect();
        controls?.dispose();
        renderer?.dispose();
        scene.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        });
        rotorPivotRef.current = null;
      };
    } catch (error) {
      console.error('PART 1 roulette scene failed to initialize', error);
      callbacksRef.current.onStateChange('error', 'WebGL could not initialize in this browser.');
      return () => {
        renderer?.dispose();
      };
    }
  }, [loadKey]);

  useEffect(() => {
    if (rotorPivotRef.current) {
      rotorPivotRef.current.visible = showRotorGroup;
    }
  }, [showRotorGroup]);

  useEffect(() => {
    const root = rotorPivotRef.current?.parent;
    if (root?.getObjectByName('Part1__StationaryOutsideAndTurret')) {
      const stationary = root.getObjectByName('Part1__StationaryOutsideAndTurret');
      if (stationary) stationary.visible = showStationaryGroup;
    }
  }, [showStationaryGroup]);

  useEffect(() => {
    const grid = stageRef.current?.querySelector('.part1-grid');
    if (grid instanceof HTMLElement) grid.style.visibility = showGrid ? 'visible' : 'hidden';
  }, [showGrid]);

  return (
    <div ref={stageRef} className="scene-stage" data-testid="canvas-viewport">
      <canvas ref={canvasRef} tabIndex={0} aria-label="Part 1 roulette visual rotor preview" />
      <div className="scene-corner scene-corner-tl" aria-hidden="true" />
      <div className="scene-corner scene-corner-br" aria-hidden="true" />
      <div className="viewport-readout" aria-hidden="true">
        <span>PART 1 · VISUAL ROTOR TEST</span>
        <span>ANGLE {THREE.MathUtils.radToDeg(angleReadout).toFixed(2)}° · PIVOT [0, 0, 0] · Y+</span>
      </div>
      <div className="part1-grid" aria-hidden="true" />
    </div>
  );
}