import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  AlertTriangle,
  Box,
  Check,
  ChevronRight,
  CircleDot,
  Crosshair,
  Download,
  Eye,
  Grid3X3,
  Layers3,
  Maximize2,
  MousePointer2,
  RotateCcw,
  Ruler,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-react';

const ASSET_PATH = '/physics-lab/roulette-visual-source.glb';
const TARGET_WHEEL_DIAMETER = 6;
const SOURCE_BALL_NODE = 'Sphere_16';

type LoadState = 'loading' | 'loaded' | 'error';
type InspectionView = 'top' | 'angled' | 'side';

type AssetAudit = {
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
  attribution: {
    author: string;
    license: string;
    source: string;
  };
};

const VIEW_LABELS: Record<InspectionView, string> = {
  top: 'TOP VIEW',
  angled: 'ANGLED VIEW',
  side: 'SIDE / LOW DEBUG',
};

const VIEW_PRESETS: Record<
  InspectionView,
  { position: [number, number, number]; up: [number, number, number] }
> = {
  top: { position: [0, 8.4, 0.001], up: [0, 0, -1] },
  angled: { position: [6.4, 4.6, 7.2], up: [0, 1, 0] },
  side: { position: [0.2, 1.35, 8.4], up: [0, 1, 0] },
};

const HIERARCHY_AUDIT = [
  {
    label: 'Outer body / bowl',
    nodes: 'ROULETTE MAIN_31 · MAIN.002_32 · MAIN.003_33',
    detail: 'High-poly shell, bowl, and main wheel surfaces',
  },
  {
    label: 'Rotor / number area',
    nodes: 'Text_29 · Plane.001–.015',
    detail: 'Number typography, pocket cards, and radial details',
  },
  {
    label: 'Center / spindle',
    nodes: 'ROULETTE MAIN* center surfaces',
    detail: 'Central spindle and decorative hub geometry',
  },
  {
    label: 'Deflector details',
    nodes: 'Cube_18 · Cube.001–.007',
    detail: 'Eight small perimeter deflector/marker pieces',
  },
  {
    label: 'Excluded source geometry',
    nodes: 'Sphere_16 → Object_36',
    detail: 'Pre-existing source ball; excluded from wheel pivot bounds',
  },
];

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

function normalizedSourceScene(scene: THREE.Group) {
  const runtimeScene = scene.clone(true);
  const sourceBall = runtimeScene.getObjectByName(SOURCE_BALL_NODE);
  const excludedGeometry: string[] = [];

  if (sourceBall) {
    sourceBall.parent?.remove(sourceBall);
    excludedGeometry.push(`${SOURCE_BALL_NODE} → Object_36 (source ball)`);
  }

  runtimeScene.updateMatrixWorld(true);
  const sourceBounds = new THREE.Box3().setFromObject(runtimeScene);
  const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const diameter = Math.max(sourceSize.x, sourceSize.z);
  const normalizationScale = diameter > 0 ? TARGET_WHEEL_DIAMETER / diameter : 1;

  return {
    runtimeScene,
    sourceCenter,
    normalizationScale,
    excludedGeometry,
  };
}

function SceneViewport({
  loadKey,
  view,
  showGrid,
  showPhysicsDebug,
  showBallPlaceholder,
  onStateChange,
  onAudit,
}: {
  loadKey: number;
  view: InspectionView;
  showGrid: boolean;
  showPhysicsDebug: boolean;
  showBallPlaceholder: boolean;
  onStateChange: (state: LoadState, detail?: string) => void;
  onAudit: (audit: AssetAudit) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const onStateChangeRef = useRef(onStateChange);
  const onAuditRef = useRef(onAudit);
  const resetRef = useRef<(() => void) | null>(null);
  const applyViewRef = useRef<((nextView: InspectionView) => void) | null>(null);
  const viewRef = useRef(view);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const physicsDebugRef = useRef<THREE.Group | null>(null);
  const ballRef = useRef<THREE.Mesh | null>(null);

  onStateChangeRef.current = onStateChange;
  onAuditRef.current = onAudit;
  viewRef.current = view;

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    let disposed = false;
    let frame = 0;
    let controls: OrbitControls | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let wheelRoot: THREE.Group | null = null;
    let grid: THREE.GridHelper | null = null;
    let floor: THREE.Mesh | null = null;

    onStateChangeRef.current('loading');

    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;

      scene = new THREE.Scene();
      scene.background = new THREE.Color('#17252b');
      scene.fog = new THREE.Fog('#17252b', 11, 21);

      camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
      camera.position.set(...VIEW_PRESETS.angled.position);

      const keyLight = new THREE.DirectionalLight('#fff8df', 4.1);
      keyLight.position.set(4, 8, 5);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight('#9fc7ca', 2.4);
      fillLight.position.set(-5, 3, -4);
      scene.add(fillLight);
      const rimLight = new THREE.PointLight('#cf8f62', 16, 13, 2);
      rimLight.position.set(2, 2, -5);
      scene.add(rimLight);
      scene.add(new THREE.HemisphereLight('#b3d4d2', '#0e171b', 1.4));

      grid = new THREE.GridHelper(16, 16, '#567277', '#2f474d');
      grid.material.transparent = true;
      grid.material.opacity = 0.5;
      grid.visible = showGrid;
      gridRef.current = grid;
      scene.add(grid);

      floor = new THREE.Mesh(
        new THREE.CircleGeometry(8, 64),
        new THREE.MeshStandardMaterial({
          color: '#1b2e33',
          roughness: 0.94,
          metalness: 0.05,
        }),
      );
      floor.rotation.x = -Math.PI / 2;
      scene.add(floor);

      controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.enablePan = false;
      controls.minDistance = 4.2;
      controls.maxDistance = 14;

      const applyView = (nextView: InspectionView) => {
        if (!camera || !controls) return;
        const preset = VIEW_PRESETS[nextView];
        camera.up.set(...preset.up);
        camera.position.set(...preset.position);
        controls.target.set(0, 0, 0);
        controls.update();
      };
      applyViewRef.current = applyView;
      applyView(viewRef.current);

      const loader = new GLTFLoader();
      loader.load(
        ASSET_PATH,
        (gltf) => {
          if (disposed || !scene || !grid || !floor) return;

          const sourceMeshCount = countMeshes(gltf.scene);
          const sourceTriangles = countTriangles(gltf.scene);
          const { runtimeScene, sourceCenter, normalizationScale, excludedGeometry } =
            normalizedSourceScene(gltf.scene);

          wheelRoot = new THREE.Group();
          wheelRoot.name = 'PhysicsLabWheel__normalizedRuntime';
          wheelRoot.userData = {
            sourceAsset: ASSET_PATH,
            sourceUntouched: true,
            rotationAxis: 'Y',
            physicsCollidersAttached: false,
          };
          const runtimeOffset = new THREE.Group();
          runtimeOffset.name = 'RouletteVisualRuntime__derived';
          runtimeOffset.add(runtimeScene);
          runtimeOffset.position.copy(sourceCenter).multiplyScalar(-1);
          runtimeOffset.scale.setScalar(normalizationScale);
          wheelRoot.add(runtimeOffset);
          wheelRoot.updateMatrixWorld(true);

          const runtimeWorldBounds = new THREE.Box3().setFromObject(runtimeScene);
          const runtimeWorldCenter = runtimeWorldBounds.getCenter(new THREE.Vector3());
          runtimeOffset.position.sub(runtimeWorldCenter);
          wheelRoot.updateMatrixWorld(true);

          const normalizedBounds = new THREE.Box3().setFromObject(runtimeScene);
          const normalizedSize = normalizedBounds.getSize(new THREE.Vector3());
          const normalizedCenter = normalizedBounds.getCenter(new THREE.Vector3());

          const baseY = -normalizedSize.y / 2 - 0.28;
          grid.position.y = baseY;
          floor.position.y = baseY - 0.02;

          const ballPlaceholder = new THREE.Mesh(
            new THREE.SphereGeometry(0.13, 24, 16),
            new THREE.MeshStandardMaterial({
              color: '#f5f1dc',
              roughness: 0.18,
              metalness: 0.12,
              emissive: '#6d776c',
              emissiveIntensity: 0.08,
            }),
          );
          ballPlaceholder.name = 'PhysicsLabBall__placeholder';
          ballPlaceholder.position.set(0, 0.72, 2.24);
          ballPlaceholder.castShadow = true;
          ballPlaceholder.userData = { dynamicBodyAttached: false };
          ballRef.current = ballPlaceholder;
          wheelRoot.add(ballPlaceholder);

          const physicsDebug = new THREE.Group();
          physicsDebug.name = 'PhysicsDebugScaffold__noColliders';
          physicsDebug.userData = { collidersReady: false };
          const axes = new THREE.AxesHelper(1.35);
          axes.name = 'WheelPivotAxes__YUp';
          physicsDebug.add(axes);
          const pivotMarker = new THREE.Mesh(
            new THREE.SphereGeometry(0.055, 16, 8),
            new THREE.MeshBasicMaterial({ color: '#d38b72' }),
          );
          pivotMarker.name = 'WheelPivotMarker__origin';
          physicsDebug.add(pivotMarker);
          const pivotRing = new THREE.Mesh(
            new THREE.RingGeometry(2.2, 2.215, 96),
            new THREE.MeshBasicMaterial({
              color: '#d38b72',
              transparent: true,
              opacity: 0.68,
              side: THREE.DoubleSide,
            }),
          );
          pivotRing.name = 'PhysicsDebugRing__futureColliderReference';
          pivotRing.rotation.x = -Math.PI / 2;
          pivotRing.position.y = 0.03;
          physicsDebug.add(pivotRing);
          physicsDebug.visible = showPhysicsDebug;
          physicsDebugRef.current = physicsDebug;
          wheelRoot.add(physicsDebug);

          scene.add(wheelRoot);
          wheelRoot.updateMatrixWorld(true);

          const json = gltf.parser.json as {
            asset?: { extras?: Record<string, string> };
          };
          const extras = json.asset?.extras ?? {};
          onAuditRef.current({
            sourceMeshCount,
            sourceTriangles,
            runtimeMeshCount: countMeshes(runtimeScene),
            runtimeTriangles: countTriangles(runtimeScene),
            normalizationScale,
            dimensions: roundedVector(normalizedSize),
            pivot: roundedVector(normalizedCenter),
            sourcePivot: roundedVector(sourceCenter),
            sourceRoot: gltf.scene.name || 'Sketchfab_model',
            excludedGeometry,
            attribution: {
              author: extras.author ?? 'Unknown author',
              license: extras.license ?? 'Unknown license',
              source: extras.source ?? 'Source URL not provided',
            },
          });

          onStateChangeRef.current('loaded');
        },
        undefined,
        (error) => {
          if (disposed) return;
          console.error('Roulette visual source failed to load', error);
          onStateChangeRef.current('error', 'The visual source could not be read.');
        },
      );

      resetRef.current = () => applyView(viewRef.current);

      const resize = () => {
        if (!camera || !renderer) return;
        const width = Math.max(stage.clientWidth, 1);
        const height = Math.max(stage.clientHeight, 1);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      };
      const observer = new ResizeObserver(resize);
      observer.observe(stage);
      resize();

      const render = () => {
        if (disposed || !renderer || !scene || !camera || !controls) return;
        controls.update();
        renderer.render(scene, camera);
        frame = requestAnimationFrame(render);
      };
      render();

      return () => {
        disposed = true;
        cancelAnimationFrame(frame);
        observer.disconnect();
        controls?.dispose();
        renderer?.dispose();
        scene?.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material.dispose());
          }
        });
        applyViewRef.current = null;
        resetRef.current = null;
        gridRef.current = null;
        physicsDebugRef.current = null;
        ballRef.current = null;
        wheelRoot = null;
      };
    } catch (error) {
      console.error('Roulette visual source scene failed to initialize', error);
      onStateChangeRef.current('error', 'WebGL could not initialize in this browser.');
      return undefined;
    }
  }, [loadKey]);

  useEffect(() => {
    applyViewRef.current?.(view);
  }, [view]);

  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = showGrid;
  }, [showGrid]);

  useEffect(() => {
    if (physicsDebugRef.current) physicsDebugRef.current.visible = showPhysicsDebug;
  }, [showPhysicsDebug]);

  useEffect(() => {
    if (ballRef.current) ballRef.current.visible = showBallPlaceholder;
  }, [showBallPlaceholder]);

  return (
    <div ref={stageRef} className="scene-stage" data-testid="canvas-viewport">
      <canvas ref={canvasRef} tabIndex={0} aria-label="Interactive 3D roulette physics lab preview" />
      <div className="scene-corner scene-corner-tl" aria-hidden="true" />
      <div className="scene-corner scene-corner-br" aria-hidden="true" />
      <div className="viewport-readout" aria-hidden="true">
        <span>{VIEW_LABELS[view]}</span>
        <span>Y+ AXIS · PIVOT / 0,0,0</span>
      </div>
      <div className={`grid-status ${showGrid ? 'is-visible' : ''}`} aria-hidden="true">
        <Grid3X3 size={13} />
        <span>REFERENCE GRID</span>
      </div>
      {showPhysicsDebug && (
        <div className="debug-status" aria-hidden="true">
          <Crosshair size={13} />
          <span>PHYSICS DEBUG SCAFFOLD · NO COLLIDERS</span>
        </div>
      )}
    </div>
  );
}

function StatusChip({ state }: { state: LoadState }) {
  const content = {
    loading: {
      label: 'Reading source',
      icon: <CircleDot className="status-icon status-pulse" size={13} />,
    },
    loaded: { label: 'Source loaded', icon: <Check className="status-icon" size={13} /> },
    error: {
      label: 'Load blocked',
      icon: <AlertTriangle className="status-icon" size={13} />,
    },
  }[state];
  return (
    <div
      className={`status-chip status-${state}`}
      data-testid="status-asset-load"
      aria-live="polite"
      role="status"
    >
      {content.icon}
      <span>{content.label}</span>
    </div>
  );
}

function AuditMetric({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div className="audit-metric">
      <span>{label}</span>
      <strong data-testid={testId}>{value}</strong>
    </div>
  );
}

function App() {
  const [loadKey, setLoadKey] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorDetail, setErrorDetail] = useState('');
  const [view, setView] = useState<InspectionView>('angled');
  const [showGrid, setShowGrid] = useState(true);
  const [showPhysicsDebug, setShowPhysicsDebug] = useState(false);
  const [showBallPlaceholder, setShowBallPlaceholder] = useState(true);
  const [audit, setAudit] = useState<AssetAudit | null>(null);

  const handleStateChange = useCallback((state: LoadState, detail?: string) => {
    setLoadState(state);
    setErrorDetail(detail ?? '');
  }, []);

  const resetView = () => window.dispatchEvent(new Event('roulette-reset-view'));
  const retryLoad = () => {
    setAudit(null);
    setLoadKey((current) => current + 1);
  };

  return (
    <main className="lab-shell">
      <header className="lab-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <Layers3 size={18} strokeWidth={1.7} />
          </div>
          <div>
            <div className="eyebrow">ISOLATED PHYSICS LAB · PART 0</div>
            <h1>Roulette / asset intake</h1>
          </div>
        </div>
        <div className="header-meta">
          <span className="build-tag">LAB-01</span>
          <StatusChip state={loadState} />
        </div>
      </header>

      <div className="lab-layout">
        <aside className="inspector-rail">
          <div className="rail-intro">
            <div className="section-kicker">
              <Crosshair size={13} /> PART 0 · ASSET INTAKE
            </div>
            <p>Normalize and inspect the visual source before any rigid-body system is attached.</p>
          </div>

          <section className="inspector-section">
            <div className="section-label">SOURCE OBJECT</div>
            <div className="asset-name">
              <Box size={17} />
              <div>
                <strong>roulette-visual-source</strong>
                <span>GLB / untouched source reference</span>
              </div>
            </div>
            <div className="data-row">
              <span>File path</span>
              <code data-testid="text-asset-path">{ASSET_PATH}</code>
            </div>
            <div className="data-row">
              <span>Runtime object</span>
              <span className="value-muted">Derived normalized copy</span>
            </div>
          </section>

          <section className="inspector-section">
            <div className="section-label">INSPECTION VIEWS</div>
            <div className="view-switcher" role="group" aria-label="Inspection view">
              {(Object.keys(VIEW_LABELS) as InspectionView[]).map((viewKey) => (
                <button
                  type="button"
                  className={`view-button ${view === viewKey ? 'is-active' : ''}`}
                  onClick={() => setView(viewKey)}
                  aria-pressed={view === viewKey}
                  data-testid={`button-view-${viewKey}`}
                  key={viewKey}
                >
                  <span>{VIEW_LABELS[viewKey]}</span>
                  <ChevronRight size={13} />
                </button>
              ))}
            </div>
          </section>

          <section className="inspector-section">
            <div className="section-label">DEVELOPER CONTROLS</div>
            <div className="control-list">
              <button
                type="button"
                className="rail-control"
                onClick={() => setShowGrid((visible) => !visible)}
                aria-pressed={showGrid}
                data-testid="button-grid-toggle"
              >
                <span>
                  <Grid3X3 size={15} /> Reference grid
                </span>
                <span className={`toggle ${showGrid ? 'on' : ''}`} aria-hidden="true">
                  <span />
                </span>
              </button>
              <button
                type="button"
                className="rail-control"
                onClick={() => setShowBallPlaceholder((visible) => !visible)}
                aria-pressed={showBallPlaceholder}
                data-testid="button-ball-toggle"
              >
                <span>
                  <CircleDot size={15} /> Ball placeholder
                </span>
                <span className={`toggle ${showBallPlaceholder ? 'on' : ''}`} aria-hidden="true">
                  <span />
                </span>
              </button>
              <button
                type="button"
                className="rail-control"
                onClick={() => setShowPhysicsDebug((visible) => !visible)}
                aria-pressed={showPhysicsDebug}
                data-testid="button-physics-debug-toggle"
              >
                <span>
                  <Crosshair size={15} /> Physics debug scaffold
                </span>
                <span className={`toggle ${showPhysicsDebug ? 'on' : ''}`} aria-hidden="true">
                  <span />
                </span>
              </button>
              <button type="button" className="rail-control" onClick={resetView} data-testid="button-reset-view">
                <span>
                  <RotateCcw size={15} /> Reset framing
                </span>
                <ChevronRight size={14} />
              </button>
            </div>
          </section>

          <section className="physics-note" data-testid="status-physics">
            <div className="note-icon">
              <ShieldCheck size={17} />
            </div>
            <div>
              <strong>Part 1 not started</strong>
              <p>Visual scene only. No Rapier, colliders, rigid bodies, betting, or production round logic are connected.</p>
            </div>
          </section>

          <div className="rail-footer">
            <div className="rail-footer-line">
              <MousePointer2 size={13} /> Drag to orbit · scroll to zoom
            </div>
            <div className="rail-footer-line">
              <Ruler size={13} /> Normalized target diameter · {TARGET_WHEEL_DIAMETER.toFixed(1)} world units
            </div>
          </div>
        </aside>

        <section className="workbench">
          <div className="workbench-toolbar">
            <div className="toolbar-title">
              <span className="live-dot" aria-hidden="true" />
              <span>SCENE PREVIEW</span>
              <span className="toolbar-divider" />
              <span className="toolbar-muted">NO SIMULATION</span>
            </div>
            <div className="toolbar-actions">
              <span className="toolbar-metric">
                <Eye size={14} /> {VIEW_LABELS[view]}
              </span>
              <button
                type="button"
                className="icon-button"
                onClick={resetView}
                aria-label="Reset camera framing"
                data-testid="button-toolbar-reset"
              >
                <Maximize2 size={15} />
              </button>
            </div>
          </div>

          <div className="viewport-wrap">
            <SceneViewport
              loadKey={loadKey}
              view={view}
              showGrid={showGrid}
              showPhysicsDebug={showPhysicsDebug}
              showBallPlaceholder={showBallPlaceholder}
              onStateChange={handleStateChange}
              onAudit={setAudit}
            />
            {loadState === 'loading' && (
              <div className="viewport-overlay" data-testid="status-loading" role="status" aria-live="polite">
                <div className="loader-graphic">
                  <span />
                  <span />
                  <span />
                </div>
                <strong>Loading visual source</strong>
                <span>Auditing roulette-visual-source.glb</span>
              </div>
            )}
            {loadState === 'error' && (
              <div className="viewport-overlay error-overlay" data-testid="status-error" role="alert">
                <TriangleAlert size={21} />
                <strong>Source unavailable</strong>
                <span>{errorDetail || 'Check the asset path and try again.'}</span>
                <button type="button" onClick={retryLoad} data-testid="button-load-retry">
                  Retry load
                </button>
              </div>
            )}
            {loadState === 'loaded' && (
              <div className="loaded-stamp" data-testid="status-loaded">
                <Check size={13} /> SOURCE READY
              </div>
            )}
          </div>

          <div className="workbench-caption">
            <div className="caption-left">
              <SlidersHorizontal size={14} /> <span>Orbit controls enabled for inspection</span>
            </div>
            <div className="caption-right">
              <span>PIVOT / Y+</span>
              <span>LIGHTING / 04</span>
              <span>GRID / {showGrid ? 'ON' : 'OFF'}</span>
            </div>
          </div>

          <section className="audit-panel" aria-label="Asset audit">
            <div className="audit-heading">
              <div>
                <div className="section-label">FORMAL ASSET AUDIT</div>
                <strong>Source hierarchy → normalized runtime</strong>
              </div>
              <span className={`audit-state ${audit ? 'is-ready' : ''}`} data-testid="status-audit">
                {audit ? 'AUDIT READY' : 'WAITING FOR LOAD'}
              </span>
            </div>
            <div className="audit-metrics">
              <AuditMetric label="Source meshes" value={audit ? String(audit.sourceMeshCount) : '—'} testId="text-source-mesh-count" />
              <AuditMetric label="Source triangles" value={audit ? audit.sourceTriangles.toLocaleString() : '—'} testId="text-source-triangle-count" />
              <AuditMetric label="Runtime meshes" value={audit ? String(audit.runtimeMeshCount) : '—'} testId="text-runtime-mesh-count" />
              <AuditMetric label="World dimensions" value={audit ? `${audit.dimensions.x} × ${audit.dimensions.y} × ${audit.dimensions.z}` : '—'} testId="text-world-dimensions" />
              <AuditMetric label="Final pivot" value={audit ? `${audit.pivot.x}, ${audit.pivot.y}, ${audit.pivot.z}` : '—'} testId="text-final-pivot" />
            </div>
            <div className="audit-details">
              <div>
                <span className="section-label">CLASSIFICATION</span>
                <div className="hierarchy-list">
                  {HIERARCHY_AUDIT.map((item) => (
                    <div className="hierarchy-row" key={item.label}>
                      <strong>{item.label}</strong>
                      <span>{item.nodes}</span>
                      <small>{item.detail}</small>
                    </div>
                  ))}
                </div>
              </div>
              <div className="attribution-block">
                <span className="section-label">ATTRIBUTION / SOURCE METADATA</span>
                {audit ? (
                  <>
                    <a href={audit.attribution.source} target="_blank" rel="noreferrer" data-testid="link-source-attribution">
                      {audit.attribution.source}
                    </a>
                    <span data-testid="text-source-author">{audit.attribution.author}</span>
                    <span data-testid="text-source-license">{audit.attribution.license}</span>
                    <span className="source-pivot-readout" data-testid="text-source-pivot">
                      Raw wheel center: {audit.sourcePivot.x}, {audit.sourcePivot.y}, {audit.sourcePivot.z} · scale ×{audit.normalizationScale.toFixed(4)}
                    </span>
                  </>
                ) : (
                  <span>Metadata will appear after the source loads.</span>
                )}
              </div>
            </div>
          </section>
        </section>
      </div>

      <footer className="lab-footer">
        <span>ROULETTE PHYSICS LAB · PART 0</span>
        <span className="footer-rule" />
        <span>Asset intake only · Part 1 not started</span>
        <span className="footer-build">
          <Download size={12} /> SOURCE REFERENCE
        </span>
      </footer>
    </main>
  );
}

export default App;