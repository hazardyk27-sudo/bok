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
type LoadState = 'loading' | 'loaded' | 'error';

function SceneViewport({
  loadKey,
  showGrid,
  onStateChange,
}: {
  loadKey: number;
  showGrid: boolean;
  onStateChange: (state: LoadState, detail?: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const resetRef = useRef<(() => void) | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    let disposed = false;
    let frame = 0;
    let loadedObject: THREE.Object3D | null = null;
    let grid: THREE.GridHelper | null = null;
    let camera: THREE.PerspectiveCamera;
    let controls: OrbitControls;
    let renderer: THREE.WebGLRenderer;

    onStateChangeRef.current('loading');

    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#17252b');
      scene.fog = new THREE.Fog('#17252b', 11, 21);

      camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
      camera.position.set(6.1, 5.1, 7.4);
      camera.lookAt(0, 0.55, 0);

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
      grid.position.y = -1.72;
      grid.material.transparent = true;
      grid.material.opacity = 0.5;
      grid.visible = showGrid;
      gridRef.current = grid;
      scene.add(grid);

      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(8, 64),
        new THREE.MeshStandardMaterial({ color: '#1b2e33', roughness: 0.94, metalness: 0.05 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -1.74;
      scene.add(floor);

      controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.enablePan = false;
      controls.minDistance = 4.2;
      controls.maxDistance = 14;
      controls.target.set(0, 0.2, 0);

      const loader = new GLTFLoader();
      loader.load(
        ASSET_PATH,
        (gltf) => {
          if (disposed) return;
          loadedObject = gltf.scene;
          const bounds = new THREE.Box3().setFromObject(loadedObject);
          const size = bounds.getSize(new THREE.Vector3());
          const center = bounds.getCenter(new THREE.Vector3());
          const maxSize = Math.max(size.x, size.y, size.z);
          if (maxSize > 0) loadedObject.scale.setScalar(4.9 / maxSize);
          loadedObject.position.sub(center.multiplyScalar(loadedObject.scale.x));
          loadedObject.position.y -= 0.15;
          loadedObject.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              if (Array.isArray(child.material)) {
                child.material.forEach((material) => {
                  material.needsUpdate = true;
                });
              } else {
                child.material.needsUpdate = true;
              }
            }
          });
          scene.add(loadedObject);
          onStateChangeRef.current('loaded');
        },
        undefined,
        (error) => {
          if (disposed) return;
          console.error('Roulette visual source failed to load', error);
          onStateChangeRef.current('error', 'The visual source could not be read.');
        },
      );

      resetRef.current = () => {
        camera.position.set(6.1, 5.1, 7.4);
        controls.target.set(0, 0.2, 0);
        controls.update();
      };
      const handleResetRequest = () => resetRef.current?.();
      window.addEventListener('roulette-reset-view', handleResetRequest);

      const resize = () => {
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
        if (disposed) return;
        controls.update();
        renderer.render(scene, camera);
        frame = requestAnimationFrame(render);
      };
      render();

      return () => {
        disposed = true;
        cancelAnimationFrame(frame);
        observer.disconnect();
        window.removeEventListener('roulette-reset-view', handleResetRequest);
        controls.dispose();
        renderer.dispose();
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material.dispose());
          }
        });
        gridRef.current = null;
        loadedObject = null;
      };
    } catch (error) {
      console.error('Roulette visual source scene failed to initialize', error);
      onStateChangeRef.current('error', 'WebGL could not initialize in this browser.');
      return undefined;
    }
  }, [loadKey]);

  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = showGrid;
  }, [showGrid]);

  useEffect(() => {
    if (resetRef.current) resetRef.current();
  }, [loadKey]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const gridCanvas = stage.querySelector('canvas');
    if (gridCanvas) gridCanvas.setAttribute('aria-label', 'Interactive 3D roulette visual source preview');
  }, []);

  return (
    <div ref={stageRef} className="scene-stage" data-testid="canvas-viewport">
      <canvas ref={canvasRef} tabIndex={0} />
      <div className="scene-corner scene-corner-tl" aria-hidden="true" />
      <div className="scene-corner scene-corner-br" aria-hidden="true" />
      <div className="viewport-readout" aria-hidden="true">
        <span>ORTHOGRAPHIC REFERENCE</span>
        <span>Y+ / Z−</span>
      </div>
      <div className={`grid-status ${showGrid ? 'is-visible' : ''}`} aria-hidden="true">
        <Grid3X3 size={13} />
        <span>REFERENCE GRID</span>
      </div>
    </div>
  );
}

function StatusChip({ state }: { state: LoadState }) {
  const content = {
    loading: { label: 'Reading source', icon: <CircleDot className="status-icon status-pulse" size={13} /> },
    loaded: { label: 'Source loaded', icon: <Check className="status-icon" size={13} /> },
    error: { label: 'Load blocked', icon: <AlertTriangle className="status-icon" size={13} /> },
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

function App() {
  const [loadKey, setLoadKey] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorDetail, setErrorDetail] = useState('');
  const [showGrid, setShowGrid] = useState(true);

  const handleStateChange = useCallback((state: LoadState, detail?: string) => {
    setLoadState(state);
    setErrorDetail(detail ?? '');
  }, []);

  const resetView = () => window.dispatchEvent(new Event('roulette-reset-view'));
  const retryLoad = () => setLoadKey((current) => current + 1);

  return (
    <main className="lab-shell">
      <header className="lab-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><Layers3 size={18} strokeWidth={1.7} /></div>
          <div>
            <div className="eyebrow">VISUAL INSPECTION LAB</div>
            <h1>Roulette / source bench</h1>
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
            <div className="section-kicker"><Crosshair size={13} /> INSPECTION CONTEXT</div>
            <p>Review the supplied visual asset before simulation systems are attached.</p>
          </div>

          <section className="inspector-section">
            <div className="section-label">SOURCE OBJECT</div>
            <div className="asset-name">
              <Box size={17} />
              <div>
                <strong>roulette-visual-source</strong>
                <span>GLB / static reference</span>
              </div>
            </div>
            <div className="data-row">
              <span>File path</span>
              <code data-testid="text-asset-path">{ASSET_PATH}</code>
            </div>
            <div className="data-row">
              <span>Representation</span>
              <span className="value-muted">Scene graph</span>
            </div>
          </section>

          <section className="inspector-section">
            <div className="section-label">VIEWPORT</div>
            <div className="control-list">
              <button
                type="button"
                className="rail-control"
                onClick={() => setShowGrid((visible) => !visible)}
                aria-pressed={showGrid}
                data-testid="button-grid-toggle"
              >
                <span><Grid3X3 size={15} /> Reference grid</span>
                <span className={`toggle ${showGrid ? 'on' : ''}`} aria-hidden="true"><span /></span>
              </button>
              <button type="button" className="rail-control" onClick={resetView} data-testid="button-reset-view">
                <span><RotateCcw size={15} /> Reset framing</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </section>

          <section className="physics-note" data-testid="status-physics">
            <div className="note-icon"><ShieldCheck size={17} /></div>
            <div>
              <strong>Physics not connected</strong>
              <p>This bench is visual-only. No rigid bodies, collisions, or scripted motion are active.</p>
            </div>
          </section>

          <div className="rail-footer">
            <div className="rail-footer-line"><MousePointer2 size={13} /> Drag to orbit · scroll to zoom</div>
            <div className="rail-footer-line"><Ruler size={13} /> Geometry is shown at source scale</div>
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
              <span className="toolbar-metric"><Eye size={14} /> visual source</span>
              <button type="button" className="icon-button" onClick={resetView} aria-label="Reset camera framing" data-testid="button-toolbar-reset">
                <Maximize2 size={15} />
              </button>
            </div>
          </div>

          <div className="viewport-wrap">
            <SceneViewport loadKey={loadKey} showGrid={showGrid} onStateChange={handleStateChange} />
            {loadState === 'loading' && (
              <div className="viewport-overlay" data-testid="status-loading" role="status" aria-live="polite">
                <div className="loader-graphic"><span /><span /><span /></div>
                <strong>Loading visual source</strong>
                <span>Parsing roulette-visual-source.glb</span>
              </div>
            )}
            {loadState === 'error' && (
              <div className="viewport-overlay error-overlay" data-testid="status-error" role="alert">
                <TriangleAlert size={21} />
                <strong>Source unavailable</strong>
                <span>{errorDetail || 'Check the asset path and try again.'}</span>
                <button type="button" onClick={retryLoad} data-testid="button-load-retry">Retry load</button>
              </div>
            )}
            {loadState === 'loaded' && (
              <div className="loaded-stamp" data-testid="status-loaded">
                <Check size={13} /> SOURCE READY
              </div>
            )}
          </div>

          <div className="workbench-caption">
            <div className="caption-left"><SlidersHorizontal size={14} /><span>Orbit controls enabled for visual review</span></div>
            <div className="caption-right"><span>CAM 35°</span><span>LIGHTING / 04</span><span>GRID / {showGrid ? 'ON' : 'OFF'}</span></div>
          </div>
        </section>
      </div>

      <footer className="lab-footer">
        <span>ROULETTE PHYSICS LAB</span>
        <span className="footer-rule" />
        <span>Asset inspection only · physics integration pending</span>
        <span className="footer-build"><Download size={12} /> SOURCE REFERENCE</span>
      </footer>
    </main>
  );
}

export default App;
