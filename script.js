// ══════════════════════════════════════════════════
// SPOTLIGHT CONTROL — set to true to activate,
// false to return to ambient moonlight
// ══════════════════════════════════════════════════
let spotlightActive = true;
let spotlightBlend  = 1.0;  // 0 = moonlight, 1 = spotlight
// ── CONTROL TRANSITION SPEED HERE (seconds) ──
const SPOTLIGHT_TRANSITION = 2.5;
const CONTROLS_DAMPING = 0.0075; // lower = softer/slower, higher = snappier. Default Three.js is 0.05

// ─── ESM Imports (importmap in index.html maps 'three' and 'three/addons/') ──
import * as THREE        from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader }    from 'three/addons/loaders/GLTFLoader.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import * as CANNON       from 'cannon-es';

// ─── Cinematic Intro Zoom ──────────────────────────────────────────────────────
const INTRO_DURATION   = 15.0;
const INTRO_START_PCT  = 0.0;  // 0.0 = begin at full wide shot, 0.5 = start halfway in
const INTRO_END_PCT    = 0.3;  // 1.0 = end at full close-up, 0.7 = stop 70% of the way in
const INTRO_CAM_START  = new THREE.Vector3(0, 4, 14);
const INTRO_CAM_END    = new THREE.Vector3(0, 2, 1.8);
const INTRO_LOOK_START = new THREE.Vector3(0, 1, 0);
const INTRO_LOOK_END   = new THREE.Vector3(0, 0.8, 0);

// ── CONTROL DANCER TIMING HERE ──
const DANCER_SPIN_SPEED       = 1.2;  // radians per second
const DANCER_RISE_DURATION    = 2.0;  // seconds to fully emerge
const DANCER_DESCEND_DURATION = 1.5;  // seconds to descend back into box

// ── CONTROL ANIMATION SPEED HERE (1.0 = normal, 0.3 = slow, 2.0 = fast) ──
const LONG_CLIP_TARGET = 10.0;
const ANIM_SPEED = .3;

// ─── Charge / Wind Mechanic ───────────────────────────────────────────────────
const CHARGE_PER_CLICK       = 25;    // percent added per wind click
const CHARGE_DECAY_RATE      = 3.33;  // percent per second (100% over 30 s)
const CHARGE_FULL_THRESHOLD  = 100;   // percent at which music triggers
const CHARGE_EMPTY_THRESHOLD = 20;    // percent below which music/dancer stop
const MUSIC_SRC              = './assets/og_key.mp3';

let cinematicElapsed  = 0;
let cinematicComplete = false;
let musicMixer        = null;
let musicBoxLoaded    = false;
const musicBoxCenter  = new THREE.Vector3();
let musicBoxMinY      = 0;
let musicBoxTop       = 0;

// ── Trees and tombstones — populated by GLB loaders, sorted by dist from center ──
const trees      = [];   // { mesh, dist, _uprightQuat, _flatQuat, _flatQuatClose, _animStart, … }
const tombstones = [];   // { mesh, finalY, dist, _animStart, … }
let treesLoaded     = false;
let tombsLoaded     = false;
let introAnimStarted = false;

let dancer               = null;
let dancerLoaded         = false;
let dancerAdded          = false;
let dancerRiseDone       = false;
let dancerRiseElapsed    = 0;
let dancerFinalScale     = 1;
let dancerFigH           = 0;
let dancerStartY         = 0;
let dancerEndY           = 0;
let dancerDescending     = false;
let dancerDescendElapsed = 0;
let dancerRisingForOpen  = false;

let lidClosed    = false;
let lidBtnLocked = false;
const musicBoxActions = [];

// Charge state
let charge                = 0;
let prevCharge            = 0;
let depletionActive       = false;
let currentDancerSpinSpeed = 0;
let musicPlaying          = false;
let musicFading           = false;

// Audio (AudioContext — loaded after first user gesture)
let audioCtx    = null;
let audioGain   = null;
let audioSource = null;
let audioBuffer = null;

let chargePinnedUntil = 0;

// ── 3-D Trifold Widget ────────────────────────────────────────────────────
const WIDGET_W = 400, WIDGET_H = 300;
let   widgetOpacity = 0;

const widgetScene  = new THREE.Scene();
const widgetCamera = new THREE.OrthographicCamera(-2, 2, 1.5, -1.5, 0.1, 10);
widgetCamera.position.z = 5;

widgetScene.add(new THREE.AmbientLight(0x331100, 1.0));
const _wLight = new THREE.PointLight(0xffcc88, 1.5, 8);
_wLight.position.set(0.5, 1.2, 3);
widgetScene.add(_wLight);

function _makePrismMat(state) {
  const cfg = state === 'hover' ? { c: 0xC8960C, e: 0x8B6914, rough: 0.3, metal: 0.7 }
            : state === 'press' ? { c: 0xFFD700, e: 0xC8960C, rough: 0.3, metal: 0.7 }
            :                     { c: 0x8B6914, e: 0x3d2d08, rough: 0.3, metal: 0.7 };
  return new THREE.MeshStandardMaterial({
    color: cfg.c, emissive: cfg.e, emissiveIntensity: 1,
    roughness: cfg.rough, metalness: cfg.metal, transparent: true, opacity: 0,
  });
}

function _makeIconTex(type) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle   = '#FFD700';
  ctx.strokeStyle = '#FFD700';
  const cx = 64, cy = 64;
  if (type === 'key') {
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(cx, cy - 24, 18, 0, Math.PI * 2); ctx.stroke();
    ctx.fillRect(cx - 5, cy - 8, 10, 48);
    ctx.fillRect(cx + 4, cy + 24, 20, 7);
    ctx.fillRect(cx + 4, cy + 35, 13, 7);
  } else if (type === 'lid') {
    ctx.fillRect(cx - 24, cy + 6, 48, 24);
    ctx.beginPath(); ctx.arc(cx, cy + 6, 24, Math.PI, 0); ctx.fill();
    ctx.fillStyle = 'rgba(255,215,0,0.4)';
    ctx.fillRect(cx - 1, cy - 20, 2, 26);
  } else if (type === 'moon') {
    ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a0806';
    ctx.beginPath(); ctx.arc(cx + 11, cy - 7, 20, 0, Math.PI * 2); ctx.fill();
  }
  return new THREE.CanvasTexture(cv);
}

(function _buildWidget() {
  const triR = 0.32;
  const shape = new THREE.Shape();
  shape.moveTo(0, triR);
  shape.lineTo(-triR * Math.sin(Math.PI * 2 / 3), -triR * Math.cos(Math.PI * 2 / 3));
  shape.lineTo( triR * Math.sin(Math.PI * 2 / 3), -triR * Math.cos(Math.PI * 2 / 3));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.14, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 3,
  });

  const TREFOIL_R = 0.595;
  window._prismDefs = [
    { label: 'wind', angle: Math.PI / 2,      iconType: 'key'  },
    { label: 'lid',  angle: 7 * Math.PI / 6,  iconType: 'lid'  },
    { label: 'moon', angle: 11 * Math.PI / 6, iconType: 'moon' },
  ];
  window._prismMeshes     = [];
  window._prismIconSprites = [];
  window._prismBaseY      = [];

  window._prismDefs.forEach(({ label, angle, iconType }) => {
    const mesh = new THREE.Mesh(geo, _makePrismMat('idle'));
    mesh.position.set(TREFOIL_R * Math.cos(angle), TREFOIL_R * Math.sin(angle), 0);
    mesh.rotation.z = angle - Math.PI / 2;
    mesh.userData.label = label;
    widgetScene.add(mesh);
    window._prismMeshes.push(mesh);
    window._prismBaseY.push(TREFOIL_R * Math.sin(angle));

    const spr = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: _makeIconTex(iconType), transparent: true, opacity: 0 })
    );
    spr.scale.setScalar(0.36);
    spr.position.set(mesh.position.x, mesh.position.y, 0.18);
    widgetScene.add(spr);
    window._prismIconSprites.push(spr);
  });

  // Pip diamonds above top prism
  const pipShape = new THREE.Shape();
  pipShape.moveTo(0, 0.085); pipShape.lineTo(0.065, 0);
  pipShape.lineTo(0, -0.085); pipShape.lineTo(-0.065, 0); pipShape.closePath();
  const pipGeo = new THREE.ShapeGeometry(pipShape);
  const topX = TREFOIL_R * Math.cos(Math.PI / 2);
  const topY = TREFOIL_R * Math.sin(Math.PI / 2);
  window._pipMeshes = [];
  for (let i = 0; i < 4; i++) {
    const pip = new THREE.Mesh(
      pipGeo,
      new THREE.MeshStandardMaterial({ color: 0x3a1a08, emissive: 0x0a0502, emissiveIntensity: 0, transparent: true, opacity: 0 })
    );
    pip.position.set(topX - 0.24 + i * 0.16, topY + 0.55, 0.05);
    widgetScene.add(pip);
    window._pipMeshes.push(pip);
  }
})();

// Widget interaction state
let _hoveredPrism    = null;
let _pressedPrism    = null;
let _pressStartTime  = 0;
let _lastWindPulse   = 0;

function _getWidgetNDC(e) {
  const left = (window.innerWidth  - WIDGET_W) / 2;
  const top  =  window.innerHeight - WIDGET_H  - 80;
  const x =  ((e.clientX - left) / WIDGET_W) * 2 - 1;
  const y = -((e.clientY - top)  / WIDGET_H) * 2 + 1;
  return { x, y, inWidget: x > -1.05 && x < 1.05 && y > -1.05 && y < 1.05 };
}

const _wRaycaster = new THREE.Raycaster();
const _wMouse     = new THREE.Vector2();

window.addEventListener('mousemove', e => {
  const { x, y, inWidget } = _getWidgetNDC(e);
  if (!inWidget || widgetOpacity < 0.05) {
    if (_hoveredPrism && _hoveredPrism !== _pressedPrism) {
      _hoveredPrism.material = _makePrismMat('idle');
      _hoveredPrism.material.opacity = widgetOpacity;
    }
    _hoveredPrism = null;
    return;
  }
  _wMouse.set(x, y);
  _wRaycaster.setFromCamera(_wMouse, widgetCamera);
  const hits = _wRaycaster.intersectObjects(window._prismMeshes);
  const hit  = hits.length ? hits[0].object : null;
  if (hit !== _hoveredPrism) {
    if (_hoveredPrism && _hoveredPrism !== _pressedPrism) {
      _hoveredPrism.material = _makePrismMat('idle');
      _hoveredPrism.material.opacity = widgetOpacity;
    }
    _hoveredPrism = hit;
    if (_hoveredPrism && _hoveredPrism !== _pressedPrism) {
      _hoveredPrism.material = _makePrismMat('hover');
      _hoveredPrism.material.opacity = widgetOpacity;
    }
  }
});

window.addEventListener('mousedown', e => {
  const { x, y, inWidget } = _getWidgetNDC(e);
  if (!inWidget || widgetOpacity < 0.05) return;
  _wMouse.set(x, y);
  _wRaycaster.setFromCamera(_wMouse, widgetCamera);
  const hits = _wRaycaster.intersectObjects(window._prismMeshes);
  if (!hits.length) return;
  _pressedPrism   = hits[0].object;
  _pressStartTime = performance.now();
  _lastWindPulse  = _pressStartTime;
  _pressedPrism.material = _makePrismMat('press');
  _pressedPrism.material.opacity = widgetOpacity;
  if (_pressedPrism.userData.label === 'wind') _doWindPulse();
});

window.addEventListener('mouseup', () => {
  if (!_pressedPrism) return;
  const label = _pressedPrism.userData.label;
  const held  = performance.now() - _pressStartTime;
  _pressedPrism.material = _hoveredPrism === _pressedPrism
    ? _makePrismMat('hover') : _makePrismMat('idle');
  _pressedPrism.material.opacity = widgetOpacity;
  _pressedPrism = null;
  if (label === 'lid'  && held < 400) window.toggleLid();
  if (label === 'moon') _toggleSpotlight();
});
const _introLookTarget = new THREE.Vector3();

function easeInOutSine(x) {
  return -(Math.cos(Math.PI * x) - 1) / 2;
}

function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}

function easeInCubic(x) {
  return x * x * x;
}

function easeOutBack(x) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

// ── Tree / tombstone animation timing ──
// DOMINO_SPEED: increase to speed up all domino sequences, decrease to slow down
//   1.0 = default  |  2.0 = twice as fast  |  0.5 = twice as slow
const DOMINO_SPEED       = .3;
const TREE_FALL_DURATION = 1.0   / DOMINO_SPEED;  // seconds per tree to fall
const TREE_RISE_DURATION = 1.2   / DOMINO_SPEED;  // seconds per tree to rise
const TREE_STAGGER       = 0.18  / DOMINO_SPEED;  // seconds between each tree
const TOMB_SINK_DURATION = 0.8   / DOMINO_SPEED;  // seconds per tombstone to sink
const TOMB_RISE_DURATION = 1.0   / DOMINO_SPEED;  // seconds per tombstone to rise
const TOMB_STAGGER       = 0.15  / DOMINO_SPEED;  // seconds between each tombstone
// Start intro rise so last element finishes just as cinematic completes (~15s)
const INTRO_ANIM_START   = 10.5;  // cinematic seconds elapsed before triggering

// ─── Cursor ─────────────────────────────────────────────────────────────────
const cursor = document.getElementById('cursor');
document.addEventListener('mousemove', e => {
  cursor.style.left = e.clientX + 'px';
  cursor.style.top  = e.clientY + 'px';
});

// ─── Scene Setup ────────────────────────────────────────────────────────────
const W = window.innerWidth, H = window.innerHeight;
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, W/H, 0.1, 100);
camera.position.set(0, 0.5, 2);   // overwritten once GLB loads
camera.lookAt(0, 1.2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(W, H);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.autoClear = false;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// ─── Orbit Controls ──────────────────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.2, 0);
controls.enabled        = false;   // re-enabled after cinematic completes
controls.enableDamping      = true;
controls.dampingFactor      = CONTROLS_DAMPING;
controls.rotateSpeed        = 0.35;
controls.panSpeed           = 0.4;
controls.zoomSpeed          = 0.6;
controls.minDistance    = 4;
controls.maxDistance    = 22;
controls.minPolarAngle  = Math.PI * 0.1;   // can't go above the scene
controls.maxPolarAngle  = Math.PI * 0.78;  // can't clip below the ground
  // ── CONTROL MAX CAMERA TILT HERE (prevents going below ground) ──
controls.autoRotate     = false;           // user controls rotation
controls.update();

// ─── Fadeable Meshes (tree trunks/branches fade when camera enters) ───────────
const fadeableMeshes = [];

// ─── Lights ─────────────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0x1a1008, 20.2);
scene.add(ambientLight);

// Eerie green-tinted rim light
const rimLight = new THREE.DirectionalLight(0x3a5c2a, 0.75);
rimLight.position.set(-4, 5, -4);
scene.add(rimLight);

// Warm inner glow at the heart of the music box — doubles as candle flicker source
const heartLight = new THREE.PointLight(0xffbb66, 12.0, 3.5);
heartLight.position.set(0, 1.35, 0);
heartLight.castShadow = true;
heartLight.shadow.mapSize.set(512, 512);
scene.add(heartLight);

// Subtle under-box fill light — always on
const underBoxLight = new THREE.PointLight(0x4a3820, 50.0, 4.0);
underBoxLight.position.set(0, -0.4, 0);
scene.add(underBoxLight);

// Subtle under-box fill light — always on
const behindBoxLight = new THREE.PointLight(0x4a3820, 50.0, 4.0);
behindBoxLight.position.set(0, 2.5, -2.0);
scene.add(behindBoxLight);


// Moonlight blue from above
const moonLight = new THREE.DirectionalLight(0x1a2a40, 10.0);
// ── CONTROL MOONLIGHT DIRECTION HERE ──
moonLight.position.set(0, 8, 0);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(1024, 1024);
scene.add(moonLight);

// ─── Particles / Spores ──────────────────────────────────────────────────────
const particleCount = 280;
const particleGeo = new THREE.BufferGeometry();
const positions = new Float32Array(particleCount * 3);
const particleSpeeds = new Float32Array(particleCount);
const particleOffsets = new Float32Array(particleCount);

for (let i = 0; i < particleCount; i++) {
  positions[i * 3]     = (Math.random() - 0.5) * 14;
  positions[i * 3 + 1] = Math.random() * 8 - 1;
  positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
  particleSpeeds[i]  = 0.003 + Math.random() * 0.008;
  particleOffsets[i] = Math.random() * Math.PI * 2;
}
particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

const particleMat = new THREE.PointsMaterial({
  color: 0x88aa44,
  size: 0.035,
  transparent: true,
  opacity: 0.55,
  sizeAttenuation: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const particles = new THREE.Points(particleGeo, particleMat);
scene.add(particles);

// ─── Ground / Root System ─────────────────────────────────────────────────────
const groundMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1, metalness: 0 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.12;
ground.receiveShadow = true;
scene.add(ground);

function addRoot(x, z, rot, len) {
  const rootMat = new THREE.MeshStandardMaterial({ color: 0x1a0e05, roughness: 1 });
  const root = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.01, len, 5), rootMat);
  root.position.set(x, -0.06, z);
  root.rotation.x = 1.3;
  root.rotation.z = rot;
  root.castShadow = true;
  scene.add(root);
}
for (let i = 0; i < 18; i++) {
  const angle = (i / 18) * Math.PI * 2;
  const d = 2.2 + Math.random() * 1.5;
  addRoot(Math.cos(angle) * d, Math.sin(angle) * d, angle, 0.6 + Math.random() * 0.8);
}

// ─── Background Trees (GLB instances) ────────────────────────────────────────
// 22 trees placed in a ring, radius 10–16, loaded from tree.glb
const treeLoader = new GLTFLoader();
treeLoader.load('./assets/tree.glb', (gltf) => {
  const treeTemplate = gltf.scene;

  // Pre-normalise the template: sit on ground, enable shadows
  const treeBox = new THREE.Box3().setFromObject(treeTemplate);
  const treeHeight = treeBox.max.y - treeBox.min.y;
  treeTemplate.traverse((child) => {
    if (child.isMesh) {
      child.castShadow    = true;
      child.receiveShadow = true;
    }
  });

  for (let i = 0; i < 22; i++) {
    const angle  = (i / 22) * Math.PI * 2;
    const dist   = 10 + Math.random() * 6;           // radius 10 – 16
    const scaleY = 0.8 + Math.random() * 0.8;        // height variation
    const scaleX = 0.7 + Math.random() * 0.6;        // width variation

    const instance = treeTemplate.clone();
    instance.position.set(
      Math.cos(angle) * dist,
      -treeBox.min.y * scaleY,                       // sit flush on ground
      Math.sin(angle) * dist
    );
    instance.rotation.y = Math.random() * Math.PI * 2;   // random facing
    instance.scale.set(scaleX, scaleY, scaleX);

    // ── ADD TO FADEABLE MESHES HERE ──
    instance.traverse((child) => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.material.transparent = true;
        child.material.opacity = 1.0;
        fadeableMeshes.push(child);
      }
    });

    scene.add(instance);

    // ── Fall axis: perpendicular to outward radial direction, in XZ plane ──
    // fallAxis = (sin(angle), 0, -cos(angle)) — rotating +π/2 around this tips
    // the tree top in the outward direction (verified via Rodrigues' formula)
    const fallAxis    = new THREE.Vector3(Math.sin(angle), 0, -Math.cos(angle));
    const fallRot     = new THREE.Quaternion().setFromAxisAngle(fallAxis, Math.PI / 2);
    const uprightQuat = instance.quaternion.clone();
    const flatQuat    = new THREE.Quaternion().multiplyQuaternions(fallRot, uprightQuat);

    // Close-specific flat: bakes ±5° random Y offset so fall looks non-uniform
    const yOffset      = (Math.random() - 0.5) * (10 * Math.PI / 180);
    const yTweak       = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yOffset);
    const flatQuatClose = new THREE.Quaternion().multiplyQuaternions(
      fallRot,
      new THREE.Quaternion().multiplyQuaternions(yTweak, uprightQuat)
    );

    instance._dist          = dist;
    instance._uprightQuat   = uprightQuat;
    instance._flatQuat      = flatQuat;
    instance._flatQuatClose = flatQuatClose;
    instance._animStart     = -1;
    instance._animDuration  = 0;
    instance._animFromQuat  = new THREE.Quaternion();
    instance._animToQuat    = new THREE.Quaternion();
    instance._animEase      = null;
    trees.push(instance);

    instance.quaternion.copy(flatQuat);   // start lying flat
  }

  trees.sort((a, b) => a._dist - b._dist);
  treesLoaded = true;
}, undefined, (err) => {
  console.error('tree.glb failed to load:', err);
});

// ─── Music Box GLB — animated model for intro sequence ───────────────────────
const musicBoxLoader = new GLTFLoader();
musicBoxLoader.load(
  './assets/music_box_anim.glb',
  (gltf) => {
    const model = gltf.scene;
    scene.add(model);
    model.rotation.y = Math.PI / 2;


    // Compute music box world-space bounds — drives all cinematic positions
    const bbox = new THREE.Box3().setFromObject(model);
    bbox.getCenter(musicBoxCenter);
    musicBoxMinY = bbox.min.y;
    musicBoxTop  = bbox.max.y;

    camera.position.copy(INTRO_CAM_START);
    camera.lookAt(INTRO_LOOK_START);

    // ── Load curtain image texture ────────────────────────────────────────────
    const curtainTex = new THREE.TextureLoader().load('./curtain.jpg');
    curtainTex.wrapS = THREE.RepeatWrapping;
    curtainTex.wrapT = THREE.RepeatWrapping;
    curtainTex.repeat.set(2, 1);

    const curtainMat = new THREE.MeshStandardMaterial({
      map:       curtainTex,
      color:     new THREE.Color('#ffffff'),
      roughness: 0.7,
      metalness: 0.1,
    });

    // ── Platform detection & material application ─────────────────────────────
    let platformMesh = null;

    model.traverse(child => {
      if (!child.isMesh) return;
      child.castShadow    = true;
      child.receiveShadow = true;

      // Log every mesh so we can confirm the right target
      const wb = new THREE.Box3().setFromObject(child);
      const sz = new THREE.Vector3();
      wb.getSize(sz);
      console.log(`mesh: "${child.name}"  y=${wb.min.y.toFixed(3)}–${wb.max.y.toFixed(3)}  size=${sz.x.toFixed(2)}×${sz.y.toFixed(2)}×${sz.z.toFixed(2)}`);

      // Identify the platform: lowest mesh whose footprint (X×Z) is large relative
      // to its height — typical of a flat stage/base block
      if (sz.x > 0.5 && sz.z > 0.5 && sz.x / sz.y > 1.5 && sz.z / sz.y > 1.5) {
        if (!platformMesh || wb.min.y < new THREE.Box3().setFromObject(platformMesh).min.y) {
          platformMesh = child;
        }
      }

      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(mat => {
        if (!mat) return;
        if (mat.color) {
          const c = mat.color;
          if (c.r * 0.299 + c.g * 0.587 + c.b * 0.114 < 0.03) {
            mat.color.setRGB(Math.max(c.r, 0.08), Math.max(c.g, 0.05), Math.max(c.b, 0.04));
          }
        }
        mat.needsUpdate = true;
      });
    });

    if (platformMesh) {
      console.log(`applying curtain material to platform: "${platformMesh.name}"`);
      platformMesh.material = curtainMat;
    } else {
      console.warn('platform mesh not auto-detected — check mesh logs above');
    }

    if (gltf.animations.length > 0) {
      musicMixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach(clip => {
        const action = musicMixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        const ts = (clip.duration > 20 ? clip.duration / LONG_CLIP_TARGET : 1.0) * ANIM_SPEED;
        action.timeScale = ts;
        action._originalTimeScale = ts;
        action.play();
        musicBoxActions.push(action);
      });
    }

    musicBoxLoaded = true;
    const loadingEl   = document.getElementById('loading');
    const loadingBar  = document.getElementById('loading-bar');
    const loadingText = document.getElementById('loading-text');
    const bgAudio     = document.getElementById('bg-audio');
    if (loadingBar) loadingBar.style.width = '100%';

    function startExperience() {
      bgAudio.play().catch(() => {});
      loadingEl.classList.add('fade-out');
      setTimeout(() => loadingEl.style.display = 'none', 1600);
      loadingEl.removeEventListener('click', startExperience);
    }

    setTimeout(() => {
      if (loadingText) loadingText.textContent = 'Click to begin';
      loadingEl.style.cursor = 'pointer';
      loadingEl.addEventListener('click', startExperience);
    }, 300);
  },
  (xhr) => {
    if (xhr.total) {
      const bar = document.getElementById('loading-bar');
      if (bar) bar.style.width = Math.round(xhr.loaded / xhr.total * 100) + '%';
    }
  },
  (err) => {
    console.error('music_box_anim.glb failed to load:', err);
    const loadingText = document.getElementById('loading-text');
    if (loadingText) loadingText.textContent = 'Load failed';
  }
);

// ─── Dancer GLB ──────────────────────────────────────────────────────────────
// Not added to scene until Phase 1 ends — see animate loop
const dancerLoader = new GLTFLoader();
dancerLoader.load(
  './assets/doll_draft.glb',
  (gltf) => {
    dancer = gltf.scene;
    dancer.traverse(child => {
      if (!child.isMesh) return;
      child.castShadow    = true;
      child.receiveShadow = true;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat, i) => {
        if (!mat) return;
        console.log(`dancer mesh: "${child.name}"  mat[${i}]: "${mat.name}"  type: ${mat.type}`);
        mat.color.set('#C68642');
        mat.roughness  = 0.8;
        mat.metalness  = 0.0;
        mat.needsUpdate = true;
      });
    });
    dancerLoaded = true;
  },
  undefined,
  (err) => console.warn('doll_draft.glb failed to load — dancer skipped:', err)
);

// ─── Tombs ───────────────────────────────────────────────────────────────────
const TOMB_COUNT   = 15;
const TOMB_SCALE   = 0.12;  // master scale — increase to make tombs larger
const MIST_OPACITY = 0.18;

// Soft radial canvas texture shared across all mist planes
const mistCanvas2 = document.createElement('canvas');
mistCanvas2.width = mistCanvas2.height = 128;
const mctx = mistCanvas2.getContext('2d');
const mGrad = mctx.createRadialGradient(64, 64, 0, 64, 64, 64);
mGrad.addColorStop(0,   'rgba(255,255,255,1)');
mGrad.addColorStop(0.5, 'rgba(255,255,255,0.4)');
mGrad.addColorStop(1,   'rgba(255,255,255,0)');
mctx.fillStyle = mGrad;
mctx.fillRect(0, 0, 128, 128);
const mistTex2 = new THREE.CanvasTexture(mistCanvas2);

const tombMistPlanes = []; // { mesh, baseX, baseZ, angle, speed, radius, maxRadius }
const tombPositions  = []; // [x, z] of placed tombs for spacing check

const tombLoader = new GLTFLoader();
tombLoader.load(
  './assets/tomb.glb',
  (gltf) => {
    const template = gltf.scene;

    // Pre-compute template bounding box to ground tombs at Y=0
    const tBox  = new THREE.Box3().setFromObject(template);
    const tMinY = tBox.min.y;

    // Stone material applied to every mesh on the template
    const stoneMat = new THREE.MeshStandardMaterial({
      color:     new THREE.Color('#4A4A4A'),
      roughness: 0.95,
      metalness: 0.0,
    });
    template.traverse(child => {
      if (child.isMesh) child.material = stoneMat;
    });

    let placed = 0;
    let attempts = 0;
    const maxAttempts = 200;

    while (placed < TOMB_COUNT && attempts < maxAttempts) {
      attempts++;
      const angle  = Math.random() * Math.PI * 2;
      const radius = 4 + Math.random() * 5;          // 4–9 units from center
      const x = musicBoxCenter.x + Math.cos(angle) * radius;
      const z = musicBoxCenter.z + Math.sin(angle) * radius;

      // Skip if too close to music box
      const distToBox = Math.sqrt((x - musicBoxCenter.x) ** 2 + (z - musicBoxCenter.z) ** 2);
      if (distToBox < 3.5) continue;

      // Skip if too close to another tomb
      const tooClose = tombPositions.some(([tx, tz]) =>
        Math.sqrt((x - tx) ** 2 + (z - tz) ** 2) < 2.5
      );
      if (tooClose) continue;

      tombPositions.push([x, z]);

      const tomb = template.clone();
      tomb.rotation.y = Math.random() * Math.PI * 2;
      const s = TOMB_SCALE * (0.6 + Math.random() * 0.6);  // vary ±30% around TOMB_SCALE
      tomb.scale.setScalar(s);
      // Ground: offset so bounding box min.y lands at 0
      const groundY = -tMinY * s;
      tomb.position.set(x, -2.0, z);   // start underground; intro anim raises to groundY
      scene.add(tomb);

      tombstones.push({
        mesh:          tomb,
        finalY:        groundY,
        dist:          Math.sqrt((x - musicBoxCenter.x) ** 2 + (z - musicBoxCenter.z) ** 2),
        _animStart:    -1,
        _animDuration: 0,
        _animFromY:    0,
        _animToY:      0,
        _animEase:     null,
      });

      // 3–4 mist planes per tomb
      const mistCount = 3 + Math.floor(Math.random() * 2);
      for (let m = 0; m < mistCount; m++) {
        const planeSize = 1.5 + Math.random() * 1.0;
        const mistMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(planeSize, planeSize),
          new THREE.MeshBasicMaterial({
            map:         mistTex2,
            transparent: true,
            opacity:     MIST_OPACITY * (0.6 + Math.random() * 0.4),
            depthWrite:  false,
          })
        );
        mistMesh.rotation.x = -Math.PI / 2;
        mistMesh.position.set(x, 0.02 + m * 0.01, z);

        const startAngle = Math.random() * Math.PI * 2;
        const speed      = 0.008 + Math.random() * 0.012;
        const maxR       = 0.6 + Math.random() * 0.8;
        tombMistPlanes.push({
          mesh:     mistMesh,
          baseX:    x,
          baseZ:    z,
          angle:    startAngle,
          speed,
          radius:   Math.random() * maxR,
          maxRadius: maxR,
          baseOpacity: mistMesh.material.opacity,
        });
        scene.add(mistMesh);
      }

      placed++;
    }

    if (placed < TOMB_COUNT) {
      console.warn(`tomb placement: only placed ${placed}/${TOMB_COUNT} tombs after ${attempts} attempts`);
    }
    tombstones.sort((a, b) => a.dist - b.dist);
    tombsLoaded = true;
  },
  undefined,
  (err) => console.warn('tomb.glb failed to load — skipping tombs:', err)
);

// ─── Doll Veil ────────────────────────────────────────────────────────────────
// Cloth drapes over the doll when it rises; blown away when the box closes.
const VEIL_NX           = 15;     // columns
const VEIL_NY           = 12;    // rows
const VEIL_DIST         = 0.065; // particle spacing
const VEIL_OPACITY      = 0.42;
const VEIL_BLOW_DURATION = 1.8;  // seconds to fade out after blow-away starts

let veilWorld       = null;
let veilParticles   = [];
let veilTopCenter   = null;
let veilGeo         = null;
let veilMesh        = null;
let veilActive      = false;
let veilCreated     = false;
let veilBlowingAway = false;
let veilBlowTimer   = 0;

function createVeil() {
  veilCreated = true;
  const cx = musicBoxCenter.x, cz = musicBoxCenter.z;

  // Cell wide enough that the cloth edge falls past the dancer's outstretched limbs
  const cell = Math.max(0.09, dancerFigH * 0.15);

  // Pin is ABOVE the head so the cloth falls over the entire figure, head included
  const pinY = musicBoxTop + dancerFigH * 1.08;

  veilWorld = new CANNON.World({ gravity: new CANNON.Vec3(0, -4.5, 0) });

  // Two proxy bodies:
  // 1. A large bounding sphere sized to the dancer's maximum limb reach — this
  //    catches the raised leg and extended arms at any rotation angle.
  // 2. A smaller head sphere that keeps the cloth from collapsing to the tip.
  const boundR = Math.max(0.10, dancerFigH * 0.46); // radius covering full limb sweep
  const headR  = Math.max(0.04, dancerFigH * 0.12);
  veilWorld.addBody(new CANNON.Body({
    mass: 0, shape: new CANNON.Sphere(boundR),
    position: new CANNON.Vec3(cx, musicBoxTop + dancerFigH * 0.52, cz),
  }));
  veilWorld.addBody(new CANNON.Body({
    mass: 0, shape: new CANNON.Sphere(headR),
    position: new CANNON.Vec3(cx, musicBoxTop + dancerFigH * 0.91, cz),
  }));

  const pinI   = Math.floor(VEIL_NX / 2);
  const pinJ   = Math.floor(VEIL_NY / 2);
  const startY = pinY + 0.4;

  veilParticles = [];
  for (let i = 0; i <= VEIL_NX; i++) {
    veilParticles.push([]);
    for (let j = 0; j <= VEIL_NY; j++) {
      const isPin = (i === pinI && j === pinJ);
      const body  = new CANNON.Body({
        mass:          isPin ? 0 : 1,
        shape:         new CANNON.Sphere(0.015),  // small radius enables collision with proxies
        linearDamping: 0.45,
        position:      new CANNON.Vec3(
          cx + (i - VEIL_NX * 0.5) * cell,
          startY,                                  // all particles start at same height
          cz + (j - VEIL_NY * 0.5) * cell
        ),
      });
      veilParticles[i].push(body);
      veilWorld.addBody(body);
    }
  }
  // Place pin immediately at head position (don't let it fall with the sheet)
  veilParticles[pinI][pinJ].position.set(cx, pinY, cz);
  veilTopCenter = veilParticles[pinI][pinJ];

  for (let i = 0; i <= VEIL_NX; i++) {
    for (let j = 0; j <= VEIL_NY; j++) {
      if (i < VEIL_NX) veilWorld.addConstraint(new CANNON.DistanceConstraint(veilParticles[i][j], veilParticles[i+1][j], cell));
      if (j < VEIL_NY) veilWorld.addConstraint(new CANNON.DistanceConstraint(veilParticles[i][j], veilParticles[i][j+1], cell));
    }
  }

  veilGeo  = new THREE.PlaneGeometry(1, 1, VEIL_NX, VEIL_NY);
  veilMesh = new THREE.Mesh(veilGeo, new THREE.MeshBasicMaterial({
    color:       0xf4f0ff,
    transparent: true,
    opacity:     VEIL_OPACITY,
    side:        THREE.DoubleSide,
    depthWrite:  false,
  }));
  scene.add(veilMesh);
  veilActive      = true;
  veilBlowingAway = false;
  veilBlowTimer   = 0;
  console.log('veil created — cell:', cell.toFixed(3), 'pinY:', pinY.toFixed(3), 'figH:', dancerFigH.toFixed(3));
}

// ─── Ghost Entities (ball of light + trailing cloth) ─────────────────────────
const GHOST_COUNT       = 5;
const GHOST_SPEED       = .6;   // units per second (lerp factor is this * delta)
const GHOST_DART_CHANCE = 0.006; // per-frame probability of sudden direction change
const GHOST_HEIGHT_MIN  = 3.0;   // minimum Y
const GHOST_HEIGHT_MAX  = 8.0;   // maximum Y
const GHOST_ROAM_RADIUS = 9.0;   // max wander radius from origin
const GHOST_NX          = 10;    // cloth columns
const GHOST_NY          = 15;    // cloth rows
const GHOST_CLOTH_DIST  = 0.10;  // particle spacing
const FLEE_RADIUS       = 3.0;   // mouse repulsion radius
const FLEE_FORCE        = 4.0;   // target-push distance on flee

function _randomGhostTarget() {
  const angle = Math.random() * Math.PI * 2;
  const r     = 1.0 + Math.random() * GHOST_ROAM_RADIUS;
  return new THREE.Vector3(
    Math.cos(angle) * r,
    GHOST_HEIGHT_MIN + Math.random() * (GHOST_HEIGHT_MAX - GHOST_HEIGHT_MIN),
    Math.sin(angle) * r
  );
}

// Mouse tracking — NDC updated on mousemove, world position computed each frame
const _ghostNDC        = new THREE.Vector2(9999, 9999);
const _ghostMouseWorld = new THREE.Vector3();
const _ghostRay        = new THREE.Raycaster();
const _ghostFloor      = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
renderer.domElement.addEventListener('mousemove', e => {
  const rect = renderer.domElement.getBoundingClientRect();
  _ghostNDC.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  _ghostNDC.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
});

const ghosts = [];

for (let gi = 0; gi < GHOST_COUNT; gi++) {
  // Random spawn position — spread around scene, Y between 1.5 and 3.0
  const spawnAngle = (gi / GHOST_COUNT) * Math.PI * 2 + Math.random() * 0.8;
  const spawnDist  = 4.0 + Math.random() * 5.0;
  const spawnX     = Math.cos(spawnAngle) * spawnDist;
  const spawnZ     = Math.sin(spawnAngle) * spawnDist;
  const spawnY     = 1.5 + Math.random() * 1.5;

  console.log(`ghost ${gi}: spawned at (${spawnX.toFixed(2)}, ${spawnY.toFixed(2)}, ${spawnZ.toFixed(2)})`);

  // Ball of light — small bright core sphere
  const ballGeo  = new THREE.SphereGeometry(0.08, 8, 8);
  const ballMat  = new THREE.MeshBasicMaterial({ color: 0xc8d8ff });
  const ball     = new THREE.Mesh(ballGeo, ballMat);
  ball.position.set(spawnX, spawnY, spawnZ);
  scene.add(ball);

  // Point light riding on the ball
  const ballLight = new THREE.PointLight(0x8899ff, 1.2, 2.5);
  ball.add(ballLight);

  // Independent cloth physics world
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -2.0, 0) });

  // Particle grid — top-center is pinned (mass 0), all others free
  const particles = [];
  for (let i = 0; i <= GHOST_NX; i++) {
    particles.push([]);
    for (let j = 0; j <= GHOST_NY; j++) {
      const pinned = (i === Math.floor(GHOST_NX / 2) && j === GHOST_NY);
      const body   = new CANNON.Body({
        mass:          pinned ? 0 : 1,
        shape:         new CANNON.Particle(),
        linearDamping: 0.4,
        position:      new CANNON.Vec3(
          spawnX + (i - GHOST_NX * 0.5) * GHOST_CLOTH_DIST,
          spawnY + j * GHOST_CLOTH_DIST,
          spawnZ
        ),
      });
      particles[i].push(body);
      world.addBody(body);
    }
  }

  // Distance constraints — horizontal and vertical
  for (let i = 0; i <= GHOST_NX; i++) {
    for (let j = 0; j <= GHOST_NY; j++) {
      if (i < GHOST_NX) world.addConstraint(new CANNON.DistanceConstraint(particles[i][j], particles[i+1][j], GHOST_CLOTH_DIST));
      if (j < GHOST_NY) world.addConstraint(new CANNON.DistanceConstraint(particles[i][j], particles[i][j+1], GHOST_CLOTH_DIST));
    }
  }

  const topCenter = particles[Math.floor(GHOST_NX / 2)][GHOST_NY];

  // Cloth mesh
  const geo = new THREE.PlaneGeometry(1, 1, GHOST_NX, GHOST_NY);
  const mat = new THREE.MeshBasicMaterial({
    color:       0xdde8ff,
    transparent: true,
    opacity:     0.28,
    side:        THREE.DoubleSide,
    depthWrite:  false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  ghosts.push({
    ball, world, particles, topCenter, geo, mesh,
    target: _randomGhostTarget(),
  });
}

// ─── Tombstone Spawn Balls ────────────────────────────────────────────────────
const TOMB_BALL_SPEED         = 0.7;
const TOMB_BALL_DART_CHANCE   = 0.005;
const TOMB_BALL_HEIGHT_MIN    = 0.8;
const TOMB_BALL_HEIGHT_MAX    = 3.5;
const TOMB_BALL_ROAM_RADIUS   = 4.0;
const TOMB_BALL_LIFETIME      = 20.0;
const TOMB_BALL_FADE_START    = 18.0;
const TOMB_BALL_RISE_DURATION = 0.8;
const TOMB_BALL_NX            = 8;
const TOMB_BALL_NY            = 10;
const TOMB_BALL_CLOTH_DIST    = 0.10;
const TOMB_BALL_MAX           = 8;

const tombBalls = [];

// Raycaster for tombstone click detection
const _tombRaycaster = new THREE.Raycaster();

function _tombBallTarget(originX, originZ) {
  const angle = Math.random() * Math.PI * 2;
  const r     = 0.5 + Math.random() * TOMB_BALL_ROAM_RADIUS;
  return new THREE.Vector3(
    originX + Math.cos(angle) * r,
    TOMB_BALL_HEIGHT_MIN + Math.random() * (TOMB_BALL_HEIGHT_MAX - TOMB_BALL_HEIGHT_MIN),
    originZ + Math.sin(angle) * r,
  );
}

function spawnTombBall(tombEntry) {
  if (tombBalls.length >= TOMB_BALL_MAX) return;

  const tombMesh = tombEntry.mesh;

  // Compute spawn Y from world bounding box
  const tbb = new THREE.Box3().setFromObject(tombMesh);
  const tombHeight = tbb.max.y - tbb.min.y;
  const spawnX = tombMesh.position.x;
  const spawnZ = tombMesh.position.z;
  const spawnY = tombMesh.position.y + tombHeight * 0.5 + 0.2;

  // Ball
  const ballGeo = new THREE.SphereGeometry(0.08, 8, 8);
  const ballMat = new THREE.MeshBasicMaterial({ color: 0xc8d8ff, transparent: true, opacity: 1.0 });
  const ball    = new THREE.Mesh(ballGeo, ballMat);
  ball.position.set(spawnX, spawnY, spawnZ);
  scene.add(ball);

  // Point light
  const ballLight = new THREE.PointLight(0x8899ff, 1.2, 2.5);
  ball.add(ballLight);

  // Independent cloth physics world
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -2.0, 0) });

  const particles = [];
  for (let i = 0; i <= TOMB_BALL_NX; i++) {
    particles.push([]);
    for (let j = 0; j <= TOMB_BALL_NY; j++) {
      const pinned = (i === Math.floor(TOMB_BALL_NX / 2) && j === TOMB_BALL_NY);
      const body   = new CANNON.Body({
        mass:          pinned ? 0 : 1,
        shape:         new CANNON.Particle(),
        linearDamping: 0.4,
        position:      new CANNON.Vec3(
          spawnX + (i - TOMB_BALL_NX * 0.5) * TOMB_BALL_CLOTH_DIST,
          spawnY + j * TOMB_BALL_CLOTH_DIST,
          spawnZ,
        ),
      });
      particles[i].push(body);
      world.addBody(body);
    }
  }

  for (let i = 0; i <= TOMB_BALL_NX; i++) {
    for (let j = 0; j <= TOMB_BALL_NY; j++) {
      if (i < TOMB_BALL_NX) world.addConstraint(new CANNON.DistanceConstraint(particles[i][j], particles[i+1][j], TOMB_BALL_CLOTH_DIST));
      if (j < TOMB_BALL_NY) world.addConstraint(new CANNON.DistanceConstraint(particles[i][j], particles[i][j+1], TOMB_BALL_CLOTH_DIST));
    }
  }

  const topCenter = particles[Math.floor(TOMB_BALL_NX / 2)][TOMB_BALL_NY];

  // Cloth mesh
  const clothGeo = new THREE.PlaneGeometry(1, 1, TOMB_BALL_NX, TOMB_BALL_NY);
  const clothMat = new THREE.MeshBasicMaterial({
    color:       0xdde8ff,
    transparent: true,
    opacity:     0.22,
    side:        THREE.DoubleSide,
    depthWrite:  false,
  });
  const clothMesh = new THREE.Mesh(clothGeo, clothMat);
  scene.add(clothMesh);

  tombBalls.push({
    ball, ballMat, ballLight,
    world, particles, topCenter,
    clothGeo, clothMesh, clothMat,
    originX: spawnX, originZ: spawnZ,
    target:  _tombBallTarget(spawnX, spawnZ),
    age:     0,
    rising:  true,
    dead:    false,
  });
}

// Click detection — raycast against tombstone meshes
renderer.domElement.addEventListener('mousedown', e => {
  if (!tombsLoaded || tombBalls.length >= TOMB_BALL_MAX) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc  = new THREE.Vector2(
     ((e.clientX - rect.left) / rect.width)  * 2 - 1,
    -((e.clientY - rect.top)  / rect.height) * 2 + 1,
  );
  _tombRaycaster.setFromCamera(ndc, camera);

  // Collect all descendant meshes from each tombstone entry
  const targets = [];
  for (const entry of tombstones) {
    entry.mesh.traverse(child => { if (child.isMesh) targets.push(child); });
  }
  const hits = _tombRaycaster.intersectObjects(targets, false);
  if (hits.length === 0) return;

  // Find which tombstone entry owns the hit mesh
  const hitObj = hits[0].object;
  for (const entry of tombstones) {
    let found = false;
    entry.mesh.traverse(child => { if (child === hitObj) found = true; });
    if (found) { spawnTombBall(entry); break; }
  }
});

// ─── Will-o-wisp Lights ──────────────────────────────────────────────────────
const wisps = [];
const wispColors = [0x2a5c1a, 0x1a3a2a, 0x4a3a10, 0x1a2a10];
for (let i = 0; i < 5; i++) {
  const wisp = new THREE.PointLight(wispColors[i % wispColors.length], 0.8, 5);
  const angle = (i / 5) * Math.PI * 2;
  wisp.position.set(Math.cos(angle) * 5, 1.5, Math.sin(angle) * 5);
  wisp._angle = angle;
  wisp._radius = 4 + Math.random() * 3;
  wisp._speed = 0.0015 + Math.random() * 0.001;
  wisp._heightOffset = Math.random() * Math.PI * 2;
  scene.add(wisp);
  wisps.push(wisp);
}

// ─── Ground Mist (sprite-based) ───────────────────────────────────────────────
// Soft circular texture generated entirely via Canvas API — no external files
const mistCanvas = document.createElement('canvas');
mistCanvas.width = 128; mistCanvas.height = 128;
const mistCtx = mistCanvas.getContext('2d');
const mistGrad = mistCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
mistGrad.addColorStop(0,   'rgba(180, 190, 180, 0.18)');
mistGrad.addColorStop(0.4, 'rgba(160, 170, 160, 0.09)');
mistGrad.addColorStop(1,   'rgba(140, 150, 140, 0)');
mistCtx.fillStyle = mistGrad;
mistCtx.fillRect(0, 0, 128, 128);
const mistTexture = new THREE.CanvasTexture(mistCanvas);

const mistMat = new THREE.SpriteMaterial({
  map:         mistTexture,
  color:       0x9aada0,      // cool grey-green tint to match scene palette
  transparent: true,
  depthWrite:  false,
  blending:    THREE.NormalBlending,  // NormalBlending — real fog, not glow
});

const mistSprites = [];
for (let i = 0; i < 55; i++) {
  const sprite      = new THREE.Sprite(mistMat.clone()); // clone so opacity is independent
  const baseOpacity = 0.3 + Math.random() * 0.7;        // 0.3 – 0.7
  const offset      = Math.random() * Math.PI * 2;      // unique phase per sprite
  const scale       = 2.5 + Math.random() * 3.0;        // 2.5 – 5.5

  sprite.position.set(
    (Math.random() - 0.5) * 18,          // x: -9 to 9
    -0.12 + Math.random() * 0.52,        // y: -0.12 to 0.4
    (Math.random() - 0.5) * 18           // z: -9 to 9
  );
  sprite.scale.setScalar(scale);
  sprite.material.opacity = baseOpacity;

  scene.add(sprite);
  mistSprites.push({ sprite, baseOpacity, offset });
}

// ─── Tornado Particles ────────────────────────────────────────────────────────
const TORNADO_COUNT   = 400;
const tornadoGeo      = new THREE.BufferGeometry();
const tornadoPos      = new Float32Array(TORNADO_COUNT * 3);

// Per-particle state arrays
const tornadoAngles   = new Float32Array(TORNADO_COUNT);  // current angle around axis
const tornadoRadii    = new Float32Array(TORNADO_COUNT);  // distance from centre
const tornadoHeights  = new Float32Array(TORNADO_COUNT);  // current y
const tornadoSpeeds   = new Float32Array(TORNADO_COUNT);  // base drift speed
const tornadoOffsets  = new Float32Array(TORNADO_COUNT);  // phase for idle drift
const tornadoTargetR  = new Float32Array(TORNADO_COUNT);  // target radius in tornado
const tornadoTargetY  = new Float32Array(TORNADO_COUNT);  // target height in tornado

for (let i = 0; i < TORNADO_COUNT; i++) {
  tornadoPos[i * 3]     = (Math.random() - 0.5) * 10;    // x: -5 to 5
  tornadoPos[i * 3 + 1] = -0.1 + Math.random() * 0.6;    // y: -0.1 to 0.5
  tornadoPos[i * 3 + 2] = (Math.random() - 0.5) * 10;    // z: -5 to 5
  tornadoAngles[i]   = Math.random() * Math.PI * 2;
  // ── CONTROL IDLE SPREAD RADIUS HERE ──
  tornadoRadii[i]    = 4.0 + Math.random() * 8.0;         // 4.0 – 12.0
  tornadoHeights[i]  = -0.1 + Math.random() * 0.6;
  tornadoSpeeds[i]   = 0.003 + Math.random() * 0.006;     // 0.003 – 0.009
  tornadoOffsets[i]  = Math.random() * Math.PI * 2;
  // ── CONTROL ACTIVE TORNADO RADIUS HERE ──
  tornadoTargetR[i]  = 0.8 + Math.random() * 2.0;         // 0.8 – 2.8
  tornadoTargetY[i]  = 1.2 + Math.random() * 1.0;         // 1.2 – 2.2
}
tornadoGeo.setAttribute('position', new THREE.BufferAttribute(tornadoPos, 3));

const tornadoMat = new THREE.PointsMaterial({
  color:           0x0a0a3a,        // very dark navy — barely visible at rest
  size:            0.045,
  sizeAttenuation: true,
  transparent:     true,
  opacity:         0.7,
  depthWrite:      false,
  blending:        THREE.AdditiveBlending,
});
const tornadoPoints = new THREE.Points(tornadoGeo, tornadoMat);
scene.add(tornadoPoints);

// ── Hover detection: invisible plane at y=0 for raycaster intersection ────────
const tornadoHitPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
);
tornadoHitPlane.rotation.x = -Math.PI / 2;
scene.add(tornadoHitPlane);

const tornadoRaycaster  = new THREE.Raycaster();
const tornadoMouse      = new THREE.Vector2();
const tornadoCenter     = new THREE.Vector3();   // world-space cursor position (x, z)
let   tornadoBlend      = 0;                     // 0 = ambient, 1 = active (mouse moving)

const tornadoIdleColor   = new THREE.Color(0x0a0a3a);
const tornadoActiveColor = new THREE.Color(0x00e5ff);

let lastMouseMove = 0;
// ── CONTROL MOUSE IDLE THRESHOLD HERE (ms) ──
const MOUSE_IDLE_MS = 1000;

document.addEventListener('mousemove', (e) => {
  lastMouseMove = performance.now();

  tornadoMouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  tornadoMouse.y = -(e.clientY / window.innerHeight)  * 2 + 1;

  tornadoRaycaster.setFromCamera(tornadoMouse, camera);
  const hits = tornadoRaycaster.intersectObject(tornadoHitPlane);
  if (hits.length > 0) {
    tornadoCenter.set(hits[0].point.x, 0, hits[0].point.z);
  }
});

// ─── Volumetric Ray-Marched Clouds ───────────────────────────────────────────

// Vertex shader — transforms box corners into ray origin + direction
const cloudVertexShader = /* glsl */`
  in vec3 position;
  uniform mat4 modelMatrix;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform vec3 cameraPos;

  out vec3 vOrigin;
  out vec3 vDirection;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    vOrigin    = vec3( inverse( modelMatrix ) * vec4( cameraPos, 1.0 ) ).xyz;
    vDirection = position - vOrigin;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Fragment shader — ray-marched volume with jitter, shading & sRGB conversion
const cloudFragmentShader = /* glsl */`
  precision highp float;
  precision highp sampler3D;

  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;

  in vec3 vOrigin;
  in vec3 vDirection;

  out vec4 color;

  uniform vec3      base;
  uniform sampler3D map;
  uniform float     threshold;
  uniform float     range;
  uniform float     opacity;
  uniform float     steps;
  uniform float     frame;

  uint wang_hash( uint seed ) {
    seed = ( seed ^ 61u ) ^ ( seed >> 16u );
    seed *= 9u;
    seed = seed ^ ( seed >> 4u );
    seed *= 0x27d4eb2du;
    seed = seed ^ ( seed >> 15u );
    return seed;
  }

  float randomFloat( inout uint seed ) {
    return float( wang_hash( seed ) ) / 4294967296.;
  }

  vec2 hitBox( vec3 orig, vec3 dir ) {
    const vec3 box_min = vec3( -0.5 );
    const vec3 box_max = vec3(  0.5 );
    vec3 inv_dir  = 1.0 / dir;
    vec3 tmin_tmp = ( box_min - orig ) * inv_dir;
    vec3 tmax_tmp = ( box_max - orig ) * inv_dir;
    vec3 tmin = min( tmin_tmp, tmax_tmp );
    vec3 tmax = max( tmin_tmp, tmax_tmp );
    float t0 = max( tmin.x, max( tmin.y, tmin.z ) );
    float t1 = min( tmax.x, min( tmax.y, tmax.z ) );
    return vec2( t0, t1 );
  }

  float sample1( vec3 p ) {
    return texture( map, p ).r;
  }

  float shading( vec3 p ) {
    float step = 0.01;
    return sample1( p + vec3( -step ) ) - sample1( p + vec3( step ) );
  }

  vec4 linearToSRGB( in vec4 value ) {
    return vec4(
      mix(
        pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ),
        value.rgb * 12.92,
        vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) )
      ),
      value.a
    );
  }

  void main() {
    vec3 rayDir = normalize( vDirection );
    vec2 bounds = hitBox( vOrigin, rayDir );

    if ( bounds.x > bounds.y ) discard;
    bounds.x = max( bounds.x, 0.0 );

    vec3  p     = vOrigin + bounds.x * rayDir;
    vec3  inc   = 1.0 / abs( rayDir );
    float delta = min( inc.x, min( inc.y, inc.z ) );
    delta /= steps;

    // Jitter — breaks up banding artefacts
    uint seed    = uint( gl_FragCoord.x ) * uint( 1973 )
                 + uint( gl_FragCoord.y ) * uint( 9277 )
                 + uint( frame )          * uint( 26699 );
    vec3  sz     = vec3( textureSize( map, 0 ) );
    float randN  = randomFloat( seed ) * 2.0 - 1.0;
    p += rayDir * randN * ( 1.0 / sz );

    vec4 ac = vec4( base, 0.0 );

    for ( float t = bounds.x; t < bounds.y; t += delta ) {
      float d   = sample1( p + 0.5 );
      d = smoothstep( threshold - range, threshold + range, d );
      float col = shading( p + 0.5 ) * 3.0 + ( ( p.x + p.y ) * 0.25 ) + 0.2;
      ac.rgb += ( 1.0 - ac.a ) * d * col * base;
      ac.a   += ( 1.0 - ac.a ) * d * opacity;
      if ( ac.a >= 0.95 ) break;
      p += rayDir * delta;
    }

    color = linearToSRGB( ac );
    if ( color.a == 0.0 ) discard;
  }
`;

// ── CONTROL TEXTURE RESOLUTION HERE (lower = faster) ──
const cloudSize = 96;
const cloudData = new Uint8Array( cloudSize * cloudSize * cloudSize );
const perlin    = new ImprovedNoise();
const cloudVec  = new THREE.Vector3();
let   cn        = 0;

for ( let z = 0; z < cloudSize; z++ ) {
  for ( let y = 0; y < cloudSize; y++ ) {
    for ( let x = 0; x < cloudSize; x++ ) {
      cloudVec.set( x, y, z ).subScalar( cloudSize / 2 ).divideScalar( cloudSize );
      const d = 1.0 - cloudVec.length();
      cloudData[ cn++ ] = ( 128 + 128 * perlin.noise( x * 0.05, y * 0.05, z * 0.05 ) ) * d * d;
    }
  }
}

const cloudTexture          = new THREE.Data3DTexture( cloudData, cloudSize, cloudSize, cloudSize );
cloudTexture.format         = THREE.RedFormat;
cloudTexture.minFilter      = THREE.LinearFilter;
cloudTexture.magFilter      = THREE.LinearFilter;
cloudTexture.unpackAlignment = 1;
cloudTexture.needsUpdate    = true;

const cloudMaterial = new THREE.RawShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms: {
    base:      { value: new THREE.Color( 0x4a5a6a ) }, // ── CONTROL CLOUD COLOR HERE
    map:       { value: cloudTexture },
    cameraPos: { value: new THREE.Vector3() },
    threshold: { value: 0.28 },  // ── CONTROL DENSITY CUTOFF HERE
    opacity:   { value: 0.06 },  // ── CONTROL CLOUD OPACITY HERE
    range:     { value: 0.10 },  // ── CONTROL SOFTNESS HERE
    steps:     { value: 80 },    // ── CONTROL QUALITY HERE (lower = faster)
    frame:     { value: 0 }
  },
  vertexShader:   cloudVertexShader,
  fragmentShader: cloudFragmentShader,
  side:        THREE.BackSide,
  transparent: true,
  depthWrite:  false
});

// Four concentric rings — alternating rotation direction, increasing radius
// ── CONTROL RING LAYOUT HERE ──────────────────────────────────────────────────
const ringConfigs = [
  { radius: 2.2, cloudsN: 4, dir:  1, speed: 0.00120 }, // innermost  → clockwise
  { radius: 3.8, cloudsN: 5, dir: -1, speed: 0.00090 }, // 2nd ring   ← counter
  { radius: 5.4, cloudsN: 6, dir:  1, speed: 0.00065 }, // 3rd ring   → clockwise
  { radius: 7.0, cloudsN: 7, dir: -1, speed: 0.00045 }, // outermost  ← counter
  { radius: 8.4, cloudsN: 8, dir: 1, speed: 0.00030 }, // outermost  ← counter
  { radius: 10.0, cloudsN: 9, dir: -1, speed: 0.00020 }, // outermost  ← counter
  { radius: 11.4, cloudsN: 10, dir: 1, speed: 0.00005 }, // outermost  ← counter
  { radius: 13.0, cloudsN: 11, dir: -1, speed: 0.00001 }, // outermost  ← counter




];
// ─────────────────────────────────────────────────────────────────────────────

const clouds     = [];   // flat list — still needed for uniform updates
const cloudRings = [];   // one Group per ring

ringConfigs.forEach( ( cfg ) => {
  const ring = new THREE.Group();
  ring._orbitDir   = cfg.dir;    // +1 or -1
  ring._orbitSpeed = cfg.speed;

  for ( let i = 0; i < cfg.cloudsN; i++ ) {
    const angle = ( i / cfg.cloudsN ) * Math.PI * 2;
    const cloud = new THREE.Mesh( new THREE.BoxGeometry( 1, 1, 1 ), cloudMaterial );

    cloud.position.set(
      Math.cos( angle ) * cfg.radius,
      0.5,                                       // ── CONTROL CLOUD HEIGHT HERE
      Math.sin( angle ) * cfg.radius
    );

    const scaleX = 2.0 + Math.random() * 1.0;   // ── CONTROL CLOUD WIDTH HERE
    const scaleY = 0.45 + Math.random() * 0.25; // ── CONTROL CLOUD THICKNESS HERE
    const scaleZ = 2.0 + Math.random() * 1.0;
    cloud.scale.set( scaleX, scaleY, scaleZ );
    cloud.rotation.y  = Math.random() * Math.PI * 2;
    cloud._rotSpeed   = 0.00006 + Math.random() * 0.00004; // self-spin

    clouds.push( cloud );
    ring.add( cloud );
  }

  cloudRings.push( ring );
  scene.add( ring );
} );

// ─── Will-o'-Wisp Light Orbs ──────────────────────────────────────────────────
// Glowing balls of light that scatter from the mouse and leave luminous trails

// Glow sprite texture — soft radial bloom
const wispGlowCanvas = document.createElement( 'canvas' );
wispGlowCanvas.width = wispGlowCanvas.height = 64;
const wispGlowCtx  = wispGlowCanvas.getContext( '2d' );
const wispGlowGrad = wispGlowCtx.createRadialGradient( 32, 32, 0, 32, 32, 32 );
wispGlowGrad.addColorStop( 0,    'rgba(255, 248, 210, 1.0)' );
wispGlowGrad.addColorStop( 0.18, 'rgba(230, 210, 150, 0.9)' );
wispGlowGrad.addColorStop( 0.55, 'rgba(180, 140,  80, 0.35)' );
wispGlowGrad.addColorStop( 1,    'rgba(  0,   0,   0, 0)'   );
wispGlowCtx.fillStyle = wispGlowGrad;
wispGlowCtx.fillRect( 0, 0, 64, 64 );
const wispGlowTex = new THREE.CanvasTexture( wispGlowCanvas );

// ── CONTROL WISP COUNT HERE ──
const shadowCount  = 10;
const shadowClouds = [];

for ( let i = 0; i < shadowCount; i++ ) {
  // Tiny bright core sphere
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry( 0.065, 8, 8 ),
    new THREE.MeshBasicMaterial( { color: 0xfffef0 } )
  );

  // Soft additive glow halo as a child sprite
  const glow = new THREE.Sprite( new THREE.SpriteMaterial( {
    map:        wispGlowTex,
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
    opacity:     0.85,
  } ) );
  // ── CONTROL GLOW HALO SIZE HERE ──
  glow.scale.setScalar( 0.75 );
  orb.add( glow );

  // Random starting position — float above the ground
  const angle = Math.random() * Math.PI * 2;
  const dist  = 2.5 + Math.random() * 5.5; // ── CONTROL SPAWN RADIUS HERE
  const baseY = 0.22 + Math.random() * 0.28; // ── CONTROL HOVER HEIGHT HERE
  orb.position.set( Math.cos( angle ) * dist, baseY, Math.sin( angle ) * dist );

  // Per-wisp movement state (identical logic to former shadow clouds)
  orb._vel        = new THREE.Vector2( 0, 0 );
  orb._idleAngle  = Math.random() * Math.PI * 2;
  orb._idleSpeed  = 0.0003 + Math.random() * 0.0004; // ── CONTROL IDLE DRIFT SPEED HERE
  orb._idleRadius = 2.5 + Math.random() * 3.5;
  orb._baseY      = baseY;
  orb._bobPhase   = Math.random() * Math.PI * 2;      // for gentle vertical bob

  shadowClouds.push( orb );
  scene.add( orb );
}

// ─── Wisp Light Trails ────────────────────────────────────────────────────────
// Bright additive sprites — look like streaks of light left behind the orbs
const trailCanvas    = document.createElement( 'canvas' );
trailCanvas.width    = trailCanvas.height = 64;
const trailCtx       = trailCanvas.getContext( '2d' );
const trailGrad      = trailCtx.createRadialGradient( 32, 32, 0, 32, 32, 32 );
trailGrad.addColorStop( 0,   'rgba(255, 242, 185, 0.9)' );
trailGrad.addColorStop( 0.4, 'rgba(210, 170,  95, 0.45)' );
trailGrad.addColorStop( 1,   'rgba(  0,   0,   0, 0)'   );
trailCtx.fillStyle = trailGrad;
trailCtx.fillRect( 0, 0, 64, 64 );
const trailTex = new THREE.CanvasTexture( trailCanvas );

// Pre-allocate a fixed pool of sprites
// ── CONTROL MAX ACTIVE TRAIL PUFFS HERE ──
const TRAIL_POOL_SIZE = 200;
const trailPool  = [];
const trailPuffs = [];

for ( let i = 0; i < TRAIL_POOL_SIZE; i++ ) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial( {
      map:         trailTex,
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
      color:       0xffe8a0, // ── CONTROL TRAIL TINT HERE
    } )
  );
  sprite.visible = false;
  scene.add( sprite );
  trailPool.push( sprite );
}

// Attach per-wisp trail timer
shadowClouds.forEach( cloud => { cloud._trailTimer = 0; } );

// ─── Moon ─────────────────────────────────────────────────────────────────────

// Soft glow halo behind the moon — canvas radial gradient sprite
const moonHaloCanvas = document.createElement( 'canvas' );
moonHaloCanvas.width = moonHaloCanvas.height = 128;
const mhCtx = moonHaloCanvas.getContext( '2d' );
const mhGrad = mhCtx.createRadialGradient( 64, 64, 0, 64, 64, 64 );
mhGrad.addColorStop( 0,    'rgba(255, 240, 190, 0.45)' );
mhGrad.addColorStop( 0.35, 'rgba(220, 205, 160, 0.18)' );
mhGrad.addColorStop( 1,    'rgba(0,   0,   0,   0)'    );
mhCtx.fillStyle = mhGrad;
mhCtx.fillRect( 0, 0, 128, 128 );

const moonHaloSprite = new THREE.Sprite( new THREE.SpriteMaterial( {
  map:         new THREE.CanvasTexture( moonHaloCanvas ),
  transparent: true,
  depthWrite:  false,
  blending:    THREE.AdditiveBlending,
  opacity:     0.85,
  fog:         false,   // halo always visible, unaffected by scene fog
} ) );
// ── CONTROL MOON HALO SIZE HERE ──
moonHaloSprite.scale.setScalar( 10 );

// Moon sphere — procedural canvas texture
const moonSurfaceCanvas = document.createElement('canvas');
moonSurfaceCanvas.width = moonSurfaceCanvas.height = 1024;
const msc = moonSurfaceCanvas.getContext('2d');

// Base fill
msc.fillStyle = '#E8E0C8';
msc.fillRect(0, 0, 1024, 1024);

// Craters
const craters = [
  [210, 180, 72], [620, 300, 55], [780, 680, 88], [140, 600, 42],
  [500, 800, 60], [860, 200, 35], [350, 450, 48], [700, 500, 30],
  [90,  380, 25], [920, 750, 50], [450, 150, 38], [650, 900, 28],
  [280, 800, 65], [800, 420, 22], [550, 580, 44], [170, 900, 32],
  [760, 130, 40], [400, 650, 20],
];
for (const [cx, cy, r] of craters) {
  // dark fill
  msc.beginPath();
  msc.arc(cx, cy, r, 0, Math.PI * 2);
  msc.fillStyle = '#B8A898';
  msc.fill();
  // lighter rim ring
  msc.beginPath();
  msc.arc(cx, cy, r, 0, Math.PI * 2);
  msc.strokeStyle = '#F0E8D0';
  msc.lineWidth = Math.max(2, r * 0.18);
  msc.stroke();
  // subtle inner shadow
  const innerGrad = msc.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 0.85);
  innerGrad.addColorStop(0, 'rgba(100,85,70,0.18)');
  innerGrad.addColorStop(1, 'rgba(100,85,70,0)');
  msc.beginPath();
  msc.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
  msc.fillStyle = innerGrad;
  msc.fill();
}

// Surface grain — randomly placed semi-transparent dark dots
const rng = (() => { let s = 42; return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; }; })();
for (let i = 0; i < 6000; i++) {
  const gx = rng() * 1024;
  const gy = rng() * 1024;
  const gr = rng() * 1.6 + 0.4;
  const ga = rng() * 0.13 + 0.03;
  msc.beginPath();
  msc.arc(gx, gy, gr, 0, Math.PI * 2);
  msc.fillStyle = `rgba(80,65,50,${ga.toFixed(3)})`;
  msc.fill();
}

const moonSurfaceTex = new THREE.CanvasTexture(moonSurfaceCanvas);

const moonMesh = new THREE.Mesh(
  new THREE.SphereGeometry( 1.1, 32, 32 ),
  new THREE.MeshStandardMaterial( {
    map:               moonSurfaceTex,
    emissive:          0xc8a860,
    emissiveIntensity: 0.55,       // ── CONTROL MOON GLOW INTENSITY HERE
    roughness:         1.0,
    metalness:         0.0,
    fog:               false,
  } )
);
// ── CONTROL MOON POSITION HERE (x, y, z) ──
// ── CONTROL MOON POSITION HERE ──
moonMesh.position.set( 0, 5.5, 0 );
moonHaloSprite.position.copy( moonMesh.position );

// ── CONTROL MOON FINAL HEIGHT HERE ──
const MOON_FINAL_Y = 5.5;
// ── CONTROL MOON START HEIGHT HERE (how high above it enters from) ──
const MOON_START_Y = MOON_FINAL_Y + 28;

// Set moon to start position immediately on load, before first render
moonMesh.position.y = MOON_START_Y;
moonHaloSprite.position.y = MOON_START_Y;

scene.add( moonHaloSprite );
scene.add( moonMesh );

// ─── Moon Spotlight ───────────────────────────────────────────────────────────
const moonSpot = new THREE.SpotLight(0xfff5e0, 0);
// ── CONTROL SPOTLIGHT COLOR HERE (warm white like a stage lantern) ──

moonSpot.position.copy(moonMesh.position);
moonSpot.target.position.set(0, 0.5, 0); // ── CONTROL AIM TARGET HERE ──
scene.add(moonSpot);
scene.add(moonSpot.target);

// ── CONTROL SPOTLIGHT CONE WIDTH HERE (radians, smaller = tighter beam) ──
moonSpot.angle = Math.PI / 9;

// ── CONTROL SPOTLIGHT EDGE SOFTNESS HERE (0 = hard edge, 1 = very soft) ──
moonSpot.penumbra = 0.4;

moonSpot.castShadow = true;
moonSpot.shadow.mapSize.set(1024, 1024);

// ── CONTROL HOW FAR SPOTLIGHT REACHES ──
moonSpot.distance = 60;
moonSpot.decay = 1.2;

// ── CONTROL AMBIENT MOONLIGHT INTENSITY HERE ──
const MOON_AMBIENT_INTENSITY = 20.0;
const MOON_AMBIENT_COLOR     = new THREE.Color(0x1a2a40);

// ── CONTROL SPOTLIGHT PEAK INTENSITY HERE ──
const MOON_SPOT_INTENSITY = 40.0;

// ─── Stars ────────────────────────────────────────────────────────────────────
// ── CONTROL STAR COUNT HERE ──
const STAR_COUNT   = 380;
const starPositions = new Float32Array( STAR_COUNT * 3 );
const starColors    = new Float32Array( STAR_COUNT * 3 );  // r g b per star
const starPhases    = new Float32Array( STAR_COUNT );       // glimmer phase offset
const starSpeeds    = new Float32Array( STAR_COUNT );       // glimmer frequency

for ( let i = 0; i < STAR_COUNT; i++ ) {
  // Scatter across upper hemisphere at a large radius so they read as sky
  const theta  = Math.random() * Math.PI * 2;
  // phi: 0 = zenith, PI/2 = horizon — keep mostly overhead
  const phi    = Math.pow( Math.random(), 0.6 ) * Math.PI * 0.48;
  // ── CONTROL STAR SPHERE RADIUS HERE ──
  const radius = 48 + Math.random() * 8;

  starPositions[ i * 3     ] = radius * Math.sin( phi ) * Math.cos( theta );
  starPositions[ i * 3 + 1 ] = radius * Math.cos( phi ) + 1.5; // lift above horizon
  starPositions[ i * 3 + 2 ] = radius * Math.sin( phi ) * Math.sin( theta );

  // Base brightness — a few bright stars, many faint ones
  const b = 0.4 + Math.pow( Math.random(), 2 ) * 0.6;
  starColors[ i * 3     ] = b;
  starColors[ i * 3 + 1 ] = b * ( 0.90 + Math.random() * 0.10 ); // slight warm/cool variation
  starColors[ i * 3 + 2 ] = b * ( 0.88 + Math.random() * 0.12 );

  starPhases[ i ] = Math.random() * Math.PI * 2;
  // ── CONTROL STAR GLIMMER SPEED HERE (higher = faster twinkle) ──
  starSpeeds[ i ] = 0.4 + Math.random() * 1.8;
}

const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute( 'position', new THREE.BufferAttribute( starPositions, 3 ) );
starGeo.setAttribute( 'color',    new THREE.BufferAttribute( starColors,    3 ) );

const starMat = new THREE.PointsMaterial( {
  // ── CONTROL STAR SIZE HERE ──
  size:            0.18,
  sizeAttenuation: true,
  vertexColors:    true,
  transparent:     true,
  opacity:         0.92,
  depthWrite:      false,
  blending:        THREE.AdditiveBlending,
  fog:             false,  // stars ignore scene fog — always crisp
} );

const starPoints = new THREE.Points( starGeo, starMat );
scene.add( starPoints );

// ─── Animation Loop ───────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let t = 0;

// ── MOON SPRING PHYSICS STATE ──
let moonLanded = false;
let moonVel = 0.0;
let moonPos = MOON_START_Y;
// ── CONTROL SPRING FEEL ──
const MOON_STIFFNESS = 0.008;  // lower = slower drop, more gradual
const MOON_DAMPING   = 0.5;   // lower = more wiggles, higher = settles faster
const MOON_THRESHOLD = 0.002;  // snap to final when movement is this small

// ── ROPE — thick textured tube from top anchor to moon ──

// ── CONTROL ROPE SAG HERE (middle point drops below straight line) ──
const SAG = 1.8;

function buildRopeCurve(topY, bottomY, x, z) {
  const midY = (topY + bottomY) / 2 - SAG;
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(x, topY,  z),
    new THREE.Vector3(x + 0.08, midY + SAG * 0.3, z), // slight lateral drift
    new THREE.Vector3(x, midY,  z),
    new THREE.Vector3(x, bottomY, z)
  ]);
}

// ── CONTROL ROPE TOP ANCHOR HEIGHT HERE ──
const ROPE_TOP_Y = MOON_START_Y + 30;

let ropeCurve = buildRopeCurve(ROPE_TOP_Y, moonMesh.position.y,
                                moonMesh.position.x, moonMesh.position.z);

const ropeGeo = new THREE.TubeGeometry(
  ropeCurve,
  30,    // ── CONTROL ROPE SMOOTHNESS HERE (segments along length) ──
  0.045, // ── CONTROL ROPE THICKNESS HERE (radius) ──
  8,     // ── CONTROL ROPE ROUNDNESS HERE (radial segments) ──
  false
);

// ── ROPE TEXTURE — procedural canvas simulating twisted fiber ──
const ropeCanvas = document.createElement('canvas');
ropeCanvas.width  = 64;
ropeCanvas.height = 256;
const rc = ropeCanvas.getContext('2d');

// Dark base
rc.fillStyle = '#3d2e1a';
rc.fillRect(0, 0, 64, 256);

// Twisted fiber strands — diagonal lines at alternating angles
const strandColors = ['#6b4f2a', '#8a6a3a', '#4a3518', '#7a5a2e'];
for (let s = 0; s < 12; s++) {
  rc.strokeStyle = strandColors[s % strandColors.length];
  rc.lineWidth = 2.5;
  rc.globalAlpha = 0.7 + Math.random() * 0.3;
  rc.beginPath();
  const startX = (s / 12) * 64;
  // Diagonal twist — each strand crosses at a different angle
  // ── CONTROL STRAND TWIST AMOUNT HERE (the +/- 18 values) ──
  rc.moveTo(startX, 0);
  rc.bezierCurveTo(
    startX + 18, 64,
    startX - 18, 128,
    startX + 18, 192
  );
  rc.lineTo(startX, 256);
  rc.stroke();
}

// Highlight on one side to suggest cylindrical form
const ropeHighlight = rc.createLinearGradient(0, 0, 64, 0);
ropeHighlight.addColorStop(0,   'rgba(180,140,80,0.0)');
ropeHighlight.addColorStop(0.3, 'rgba(180,140,80,0.18)');
ropeHighlight.addColorStop(1,   'rgba(0,0,0,0.3)');
rc.fillStyle = ropeHighlight;
rc.fillRect(0, 0, 64, 256);

const ropeTexture = new THREE.CanvasTexture(ropeCanvas);
ropeTexture.wrapS = THREE.RepeatWrapping;
ropeTexture.wrapT = THREE.RepeatWrapping;
// ── CONTROL TEXTURE REPEAT HERE (more repeats = tighter fiber pattern) ──
ropeTexture.repeat.set(2, 6);

const ropeMat = new THREE.MeshStandardMaterial({
  map:       ropeTexture,
  color:     0x7a5a2e, // ── CONTROL BASE ROPE COLOR HERE ──
  roughness: 0.95,     // ── CONTROL ROPE ROUGHNESS HERE ──
  metalness: 0.0,
  normalScale: new THREE.Vector2(1, 1),
});

const rope = new THREE.Mesh(ropeGeo, ropeMat);
scene.add(rope);

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  t += delta;
  renderer.clear();

  // ── MUSIC BOX ANIMATIONS ──
  if (musicMixer) musicMixer.update(delta);

  // ── CINEMATIC INTRO ZOOM ──
  if (!cinematicComplete && musicBoxLoaded) {
    cinematicElapsed += delta;
    const progress = Math.min(cinematicElapsed / INTRO_DURATION, 1);
    const e = easeInOutSine(progress);
    const t = THREE.MathUtils.lerp(INTRO_START_PCT, INTRO_END_PCT, e);
    camera.position.lerpVectors(INTRO_CAM_START, INTRO_CAM_END, t);
    camera.position.y = Math.max(musicBoxMinY, camera.position.y);
    _introLookTarget.lerpVectors(INTRO_LOOK_START, INTRO_LOOK_END, t);
    camera.lookAt(_introLookTarget);
    heartLight.intensity = THREE.MathUtils.lerp(12.0, 4.0, t);
    if (t >= INTRO_END_PCT) {
      console.log('cinematic complete');
      cinematicComplete = true;
      controls.target.copy(INTRO_LOOK_END);
      controls.update();
      controls.enabled = true;
      const hint = document.getElementById('explore-hint');
      hint.style.opacity = '1';
      setTimeout(() => { hint.style.opacity = '0'; }, 300000);
      depletionActive = true;
      initAudio();
    }
  }

  // ── CANDLE FLICKER ──
  heartLight.intensity *= 1 + Math.sin(t * 9.1) * 0.045 + Math.sin(t * 19.7) * 0.02;

  // ── WIDGET FADE-IN & IDLE OSCILLATION ──
  if (cinematicComplete && widgetOpacity < 1) {
    widgetOpacity = Math.min(1, widgetOpacity + delta / 1.5);
  }
  if (widgetOpacity > 0) {
    window._prismMeshes.forEach((mesh, i) => {
      const baseY = window._prismBaseY[i];
      const newY  = baseY + Math.sin(t * 0.8 + i * Math.PI * 2 / 3) * 0.04;
      mesh.position.y = newY;
      window._prismIconSprites[i].position.y = newY;
      mesh.material.opacity = widgetOpacity;
    });
    window._prismIconSprites.forEach(s => { s.material.opacity = 0.85 * widgetOpacity; });
    window._pipMeshes.forEach(p => { p.material.opacity = widgetOpacity; });

    // Wind-key hold: pulse charge every 250 ms
    if (_pressedPrism && _pressedPrism.userData.label === 'wind') {
      const now = performance.now();
      if (now - _lastWindPulse >= 250) { _doWindPulse(); _lastWindPulse = now; }
    }
  }

  // ── CHARGE DEPLETION ──
  if (depletionActive && charge > 0 && performance.now() > chargePinnedUntil) {
    prevCharge = charge;
    charge = Math.max(0, charge - CHARGE_DECAY_RATE * delta);
    if (prevCharge >= CHARGE_EMPTY_THRESHOLD && charge < CHARGE_EMPTY_THRESHOLD) {
      fadeOutMusic();
    }
    updateWidgetPips();
  }

  // ── DANCER — add to scene once Phase 1 ends ──
  if (musicBoxLoaded && dancerLoaded && !dancerAdded && !lidClosed &&
      cinematicComplete) {
    const db   = new THREE.Box3().setFromObject(dancer);
    const rawH = db.max.y - db.min.y;
    dancerFinalScale = (0.8 * (musicBoxTop - musicBoxMinY)) / rawH;
    const figH   = rawH * dancerFinalScale;
    const botOff = db.min.y * dancerFinalScale;
    dancerEndY   = musicBoxTop - botOff;
    dancerStartY = dancerEndY - figH;
    dancerFigH   = figH;
    dancer.scale.setScalar(dancerFinalScale * 0.8);
    dancer.position.set(musicBoxCenter.x, dancerStartY, musicBoxCenter.z);
    console.log('dancer rise triggered');
    scene.add(dancer);
    dancerAdded = true;
  }

  // ── DANCER RISE & SPIN ──
  if (dancerAdded) {
    if (!dancerRiseDone) {
      dancerRiseElapsed += delta;
      const rt = Math.min(dancerRiseElapsed / DANCER_RISE_DURATION, 1);
      const et = easeOutCubic(rt);
      dancer.position.y = THREE.MathUtils.lerp(dancerStartY, dancerEndY, et);
      dancer.scale.setScalar(THREE.MathUtils.lerp(dancerFinalScale * 0.8, dancerFinalScale, et));
      if (rt >= 1) {
        dancerRiseDone = true;
        if (!veilCreated) createVeil();
        if (dancerRisingForOpen) {
          dancerRisingForOpen = false;
          lidBtnLocked = false;
        }
      }
    } else if (!dancerDescending) {
      if (depletionActive) {
        const targetSpeed = charge >= CHARGE_EMPTY_THRESHOLD ? DANCER_SPIN_SPEED : 0;
        currentDancerSpinSpeed = THREE.MathUtils.lerp(
          currentDancerSpinSpeed, targetSpeed, Math.min(delta / 3.0, 1)
        );
      } else {
        currentDancerSpinSpeed = DANCER_SPIN_SPEED;
      }
      dancer.rotation.y += currentDancerSpinSpeed * delta;
    }
  }

  // ── DANCER DESCENT ──
  if (dancerDescending) {
    dancerDescendElapsed += delta;
    const rt = Math.min(dancerDescendElapsed / DANCER_DESCEND_DURATION, 1);
    const et = easeInCubic(rt);
    dancer.position.y = THREE.MathUtils.lerp(dancerEndY, dancerStartY, et);
    if (rt >= 1) {
      dancerDescending = false;
      scene.remove(dancer);
      startLidClose();
    }
  }

  // ── VEIL SIMULATION ──
  if (veilActive) {
    // Trigger blow-away the moment dancer starts descending
    if (dancerDescending && !veilBlowingAway) {
      veilBlowingAway = true;
      veilBlowTimer   = 0;
      // Free the pinned top-center so the whole cloth can fly
      veilTopCenter.mass = 1;
      veilTopCenter.updateMassProperties();
    }

    if (veilBlowingAway) {
      veilBlowTimer += delta;
      // Apply upward gust + random lateral forces to every particle
      for (let i = 0; i <= VEIL_NX; i++) {
        for (let j = 0; j <= VEIL_NY; j++) {
          const p = veilParticles[i][j];
          p.applyForce(new CANNON.Vec3(
            (Math.random() - 0.5) * 10,
            6 + Math.random() * 5,
            (Math.random() - 0.5) * 10
          ));
        }
      }
      const fadeT = Math.min(veilBlowTimer / VEIL_BLOW_DURATION, 1);
      veilMesh.material.opacity = VEIL_OPACITY * (1 - fadeT);
      if (fadeT >= 1) {
        scene.remove(veilMesh);
        veilGeo.dispose();
        veilMesh.material.dispose();
        veilWorld  = null;
        veilActive = false;
      }
    } else {
      // Keep center pin locked above the head (consistent with createVeil pinY)
      veilTopCenter.position.set(
        musicBoxCenter.x,
        musicBoxTop + dancerFigH * 1.08,
        musicBoxCenter.z
      );
      veilTopCenter.velocity.set(0, 0, 0);
      // Co-rotate cloth with dancer + gentle shimmer
      const omega = currentDancerSpinSpeed; // rad/s, same value driving dancer.rotation.y
      for (let i = 0; i <= VEIL_NX; i++) {
        for (let j = 0; j < VEIL_NY; j++) {
          const p  = veilParticles[i][j];
          const dx = p.position.x - musicBoxCenter.x;
          const dz = p.position.z - musicBoxCenter.z;
          // Tangential velocity a co-rotating point at this radius should have
          const tvx = -dz * omega;
          const tvz =  dx * omega;
          // Strong force steering toward that velocity — cloth tracks the spin
          p.applyForce(new CANNON.Vec3(
            (tvx - p.velocity.x) * 9 + 0.12 * Math.sin(t * 2.1 + i),
            0,
            (tvz - p.velocity.z) * 9 + 0.06 * Math.cos(t * 1.7 + j)
          ));
        }
      }
    }

    if (veilActive) {
      veilWorld.step(1 / 60);
      const posAttr = veilGeo.attributes.position;
      for (let i = 0; i <= VEIL_NX; i++) {
        for (let j = 0; j <= VEIL_NY; j++) {
          const idx = j * (VEIL_NX + 1) + i;
          const pos = veilParticles[i][j].position;   // direct mapping — cloth is horizontal
          posAttr.setXYZ(idx, pos.x, pos.y, pos.z);
        }
      }
      posAttr.needsUpdate = true;
      veilGeo.computeVertexNormals();
    }
  }

  // ── MOON SPRING DESCENT ──
  if (!moonLanded) {
    const springForce = (MOON_FINAL_Y - moonPos) * MOON_STIFFNESS;
    moonVel = (moonVel + springForce) * MOON_DAMPING;
    moonPos += moonVel;
    moonMesh.position.y       = moonPos;
    moonHaloSprite.position.y = moonPos;

    // Sync moonlight position with moon
    moonLight.position.y = moonPos * 0.6;
    // ── CONTROL LIGHT SYNC RATIO HERE ──

    // Settle check
    if (Math.abs(MOON_FINAL_Y - moonPos) < MOON_THRESHOLD &&
        Math.abs(moonVel) < MOON_THRESHOLD) {
      moonMesh.position.y       = MOON_FINAL_Y;
      moonHaloSprite.position.y = MOON_FINAL_Y;
      moonLight.position.y      = 8;
      moonLanded = true;
    }
  }

  // ── ROPE UPDATE — rebuilds tube while moon descends, static once landed ──
  if (!moonLanded) {
    const newCurve = buildRopeCurve(
      ROPE_TOP_Y,
      moonMesh.position.y,
      moonMesh.position.x,
      moonMesh.position.z
    );
    rope.geometry.dispose();
    rope.geometry = new THREE.TubeGeometry(newCurve, 30, 0.045, 8, false);
  }

  // ── MOON SPOTLIGHT BLEND ──
  if (spotlightActive) {
    spotlightBlend = Math.min(1, spotlightBlend + delta / SPOTLIGHT_TRANSITION);
  } else {
    spotlightBlend = Math.max(0, spotlightBlend - delta / SPOTLIGHT_TRANSITION);
  }

  // Keep spotlight position locked to moon even after landing
  moonSpot.position.copy(moonMesh.position);

  // Crossfade ambient moonlight down as spotlight fades in
  moonLight.intensity = THREE.MathUtils.lerp(
    MOON_AMBIENT_INTENSITY, 0.15, spotlightBlend
  );

  // Fade spotlight intensity up
  moonSpot.intensity = THREE.MathUtils.lerp(0, MOON_SPOT_INTENSITY, spotlightBlend);

  // Tighten cone as it activates — starts wide, narrows to focused beam
  moonSpot.angle = THREE.MathUtils.lerp(
    Math.PI / 4,   // ── CONTROL STARTING CONE WIDTH HERE (wide, ambient)
    Math.PI / 9,   // ── CONTROL FINAL CONE WIDTH HERE (tight, theatrical)
    spotlightBlend
  );

  // Will-o-wisps drift
  wisps.forEach((wisp, i) => {
    wisp._angle += wisp._speed;
    wisp.position.x = Math.cos(wisp._angle) * wisp._radius;
    wisp.position.z = Math.sin(wisp._angle) * wisp._radius;
    wisp.position.y = 1.2 + Math.sin(t * 0.7 + wisp._heightOffset) * 0.8;
    wisp.intensity = 0.5 + Math.sin(t * 2.1 + i) * 0.4;
  });

  // Tomb mist drift
  tombMistPlanes.forEach(mp => {
    mp.angle  += mp.speed;
    mp.radius += mp.speed * 0.4;
    mp.mesh.position.x = mp.baseX + Math.cos(mp.angle) * mp.radius;
    mp.mesh.position.z = mp.baseZ + Math.sin(mp.angle) * mp.radius;
    const fade = 1 - mp.radius / mp.maxRadius;
    mp.mesh.material.opacity = mp.baseOpacity * Math.max(fade, 0);
    if (mp.radius >= mp.maxRadius) {
      mp.radius = 0;
      mp.angle  = Math.random() * Math.PI * 2;
      mp.mesh.position.x = mp.baseX;
      mp.mesh.position.z = mp.baseZ;
      mp.mesh.material.opacity = mp.baseOpacity;
    }
  });

  // Particles drift upward
  const pos = particleGeo.attributes.position;
  for (let i = 0; i < particleCount; i++) {
    pos.array[i * 3 + 1] += particleSpeeds[i];
    pos.array[i * 3]     += Math.sin(t * 0.3 + particleOffsets[i]) * 0.003;
    if (pos.array[i * 3 + 1] > 7) {
      pos.array[i * 3 + 1] = -1;
      pos.array[i * 3]     = (Math.random() - 0.5) * 14;
      pos.array[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
  }
  pos.needsUpdate = true;

  // Ground mist — slow drift, gentle opacity pulse, wrap at ±10 units
  mistSprites.forEach(({ sprite, baseOpacity, offset }) => {
    sprite.position.x += Math.sin(t * 0.08 + offset) * 0.0015;
    sprite.position.z += Math.cos(t * 0.06 + offset) * 0.0012;

    // Pulse opacity gently around its base value
    sprite.material.opacity = baseOpacity + Math.sin(t * 0.3 + offset) * 0.15;

    // Wrap: if a sprite drifts beyond 10 units, flip it to the other side
    if (Math.abs(sprite.position.x) > 10) sprite.position.x *= -0.9;
    if (Math.abs(sprite.position.z) > 10) sprite.position.z *= -0.9;
  });

  // ── TORNADO PARTICLES ─────────────────────────────────────────────────────
  // Blend: 0 = ambient (slow, centred on box), 1 = active (fast, follows mouse)
  const mouseMoving = (performance.now() - lastMouseMove) < MOUSE_IDLE_MS;
  if (mouseMoving) {
    // ── CONTROL ACTIVATION SPEED HERE ──
    tornadoBlend = Math.min(1, tornadoBlend + delta / 3.0);
  } else {
    // ── CONTROL DEACTIVATION SPEED HERE ──
    tornadoBlend = Math.max(0, tornadoBlend - delta / 3.5);
  }

  // ── CONTROL MAX HEIGHT HERE ──
  const maxRise = 2.2;

  const tPos = tornadoGeo.attributes.position;
  for (let i = 0; i < TORNADO_COUNT; i++) {

    // ── AMBIENT STATE — always-on slow whirlpool centred on box (0,0,0) ──
    // ── CONTROL AMBIENT ORBIT SPEED HERE ──
    const ambientSpeed = 0.002;
    // Differential rotation — inner particles slightly faster even in ambient
    const ambientAngularSpeed = ambientSpeed + (1.0 / (tornadoRadii[i] + 1.0)) * 0.003;
    tornadoAngles[i] += ambientAngularSpeed;

    // ── CONTROL AMBIENT RADIUS HERE ──
    // Particles orbit at their full idle radius, slow and wide
    const ambientX = Math.cos(tornadoAngles[i]) * tornadoRadii[i];
    const ambientZ = Math.sin(tornadoAngles[i]) * tornadoRadii[i];
    const ambientY = 0.1 + Math.sin(t * 0.2 + tornadoOffsets[i]) * 0.15;

    // ── ACTIVE STATE — faster spin, tighter radius, follows mouse ──
    // ── CONTROL ACTIVE ORBIT SPEED HERE ──
    const activeAngularSpeed = 0.010 + (1.0 / (tornadoRadii[i] + 0.5)) * 0.015;
    // Pull radius inward toward mouse-center target when active
    const activeRadius  = tornadoTargetR[i];
    const blendedRadius = THREE.MathUtils.lerp(tornadoRadii[i], activeRadius, 0.012 * tornadoBlend);

    const activeX = tornadoCenter.x + Math.cos(tornadoAngles[i]) * blendedRadius;
    const activeZ = tornadoCenter.z + Math.sin(tornadoAngles[i]) * blendedRadius;

    // ── CONTROL ACTIVE HEIGHT HERE ──
    // Inner particles rise more; outer barely lift off the ground
    const riseAmount = (1.0 / (blendedRadius + 0.3)) * 0.25 * tornadoBlend;
    const activeY    = Math.min(riseAmount, maxRise);

    // Extra spin applied when active (on top of ambient rotation already added)
    tornadoAngles[i] += activeAngularSpeed * tornadoBlend;

    // ── FINAL POSITION — lerp between ambient and active each frame ──
    tPos.array[i * 3]     = THREE.MathUtils.lerp(ambientX, activeX, tornadoBlend);
    tPos.array[i * 3 + 1] = THREE.MathUtils.lerp(ambientY, activeY, tornadoBlend);
    tPos.array[i * 3 + 2] = THREE.MathUtils.lerp(ambientZ, activeZ, tornadoBlend);
  }
  tPos.needsUpdate = true;

  // Color lerp: dark navy → icy cyan as blend rises
  tornadoMat.color.copy(tornadoIdleColor).lerp(tornadoActiveColor, tornadoBlend);
  // Opacity lerp: 0.5 at ambient, up to 0.9 at full active
  tornadoMat.opacity = 0.5 + tornadoBlend * 0.4;
  // Size pulse once blend crosses 0.5
  tornadoMat.size = tornadoBlend > 0.5
    ? 0.045 + Math.sin(t * 4) * 0.01 * tornadoBlend
    : 0.045;

  // ── VOLUMETRIC CLOUDS ──
  // Rotate each ring by its own speed and direction (alternates CW / CCW)
  cloudRings.forEach( ring => {
    ring.rotation.y += ring._orbitSpeed * ring._orbitDir;
  } );
  // Update shader uniforms on every cloud volume
  clouds.forEach( cloud => {
    cloud.material.uniforms.cameraPos.value.copy( camera.position );
    cloud.material.uniforms.frame.value++;
    cloud.rotation.y += cloud._rotSpeed; // each volume also self-spins
  } );

  // ── WILL-O'-WISP LIGHT ORBS ──
  shadowClouds.forEach( ( cloud ) => {
    const dx   = cloud.position.x - tornadoCenter.x;
    const dz   = cloud.position.z - tornadoCenter.z;
    const dist = Math.sqrt( dx * dx + dz * dz );

    // ── CONTROL SCATTER RADIUS HERE (how close mouse must be to spook them) ──
    const scatterRadius = 3.5;

    if ( dist < scatterRadius && dist > 0.001 ) {
      // Flee — push velocity away from mouse, stronger when closer
      // ── CONTROL SCATTER FORCE HERE ──
      const force = ( 1.0 - dist / scatterRadius ) * 0.018;
      cloud._vel.x += ( dx / dist ) * force;
      cloud._vel.y += ( dz / dist ) * force;
    } else {
      // Idle drift — gentle curved wandering when not spooked
      cloud._idleAngle += cloud._idleSpeed;
      const idleX = Math.cos( cloud._idleAngle ) * cloud._idleRadius;
      const idleZ = Math.sin( cloud._idleAngle ) * cloud._idleRadius;

      // ── CONTROL IDLE RETURN STRENGTH HERE ──
      cloud._vel.x += ( idleX - cloud.position.x ) * 0.0008;
      cloud._vel.y += ( idleZ - cloud.position.z ) * 0.0008;
    }

    // ── CONTROL DRAG HERE (higher = stops faster) ──
    cloud._vel.x *= 0.92;
    cloud._vel.y *= 0.92;

    cloud.position.x += cloud._vel.x;
    cloud.position.z += cloud._vel.y;

    // Gentle vertical bob
    // ── CONTROL BOB AMPLITUDE HERE ──
    cloud.position.y = cloud._baseY + Math.sin( t * 1.6 + cloud._bobPhase ) * 0.06;

    // Clamp to scene bounds
    cloud.position.x = THREE.MathUtils.clamp( cloud.position.x, -11, 11 );
    cloud.position.z = THREE.MathUtils.clamp( cloud.position.z, -11, 11 );
  } );

  // ── SHADOW CLOUD SMOKE TRAILS ──

  // Spawn a light dot when a wisp is moving fast enough
  shadowClouds.forEach( cloud => {
    const speed = cloud._vel.length();
    cloud._trailTimer++;

    // ── CONTROL MIN SPEED TO TRAIL HERE (faster = only trails when fleeing) ──
    const minSpeed = 0.003;
    // ── CONTROL SPAWN INTERVAL HERE (frames between dots, lower = denser trail) ──
    const spawnEvery = 3;

    if ( speed > minSpeed && cloud._trailTimer >= spawnEvery ) {
      cloud._trailTimer = 0;

      const free = trailPool.find( s => !s.visible );
      if ( free ) {
        // ── CONTROL TRAIL DOT SIZE HERE ──
        const dotSize = 0.12 + Math.random() * 0.14;
        free.position.copy( cloud.position );
        free.scale.setScalar( dotSize );
        // ── CONTROL INITIAL TRAIL OPACITY HERE ──
        free.material.opacity = Math.min( 0.75, 0.35 + speed * 18 );
        free.visible = true;

        trailPuffs.push( {
          sprite:      free,
          life:        1.0,
          // ── CONTROL FADE DURATION HERE (seconds) ──
          maxLife:     1.0,
          baseOpacity: free.material.opacity,
          // Light dots barely drift — trails look sharp and directional
          driftX: ( Math.random() - 0.5 ) * 0.001,
          driftZ: ( Math.random() - 0.5 ) * 0.001,
        } );
      }
    }
  } );

  // Update + retire active puffs
  for ( let i = trailPuffs.length - 1; i >= 0; i-- ) {
    const p = trailPuffs[ i ];
    p.life -= delta / p.maxLife;             // normalise by duration
    const t = Math.max( 0, p.life );
    p.sprite.material.opacity = p.baseOpacity * t * t; // quadratic ease-out fade
    p.sprite.position.x += p.driftX;
    p.sprite.position.z += p.driftZ;

    if ( p.life <= 0 ) {
      p.sprite.visible = false;              // return to pool
      trailPuffs.splice( i, 1 );
    }
  }

  // ── STARS GLIMMER ──
  // Update per-star brightness each frame via vertex color buffer
  const sc = starGeo.attributes.color;
  for ( let i = 0; i < STAR_COUNT; i++ ) {
    // Soft sine shimmer — each star has its own phase and speed
    const g = 0.5 + 0.5 * Math.sin( t * starSpeeds[ i ] + starPhases[ i ] );
    // ── CONTROL GLIMMER DEPTH HERE (higher = more dramatic pulse) ──
    const brightness = 0.35 + g * 0.65;
    const warmth     = 0.90 + 0.10 * Math.sin( t * starSpeeds[ i ] * 0.5 + starPhases[ i ] );
    sc.array[ i * 3     ] = brightness;
    sc.array[ i * 3 + 1 ] = brightness * warmth;
    sc.array[ i * 3 + 2 ] = brightness * ( 1.0 - warmth * 0.08 );
  }
  sc.needsUpdate = true;

  // ── CONTROL CAMERA INSIDE GEOMETRY FADE ──
  const camPos = camera.position;
  fadeableMeshes.forEach(mesh => {
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    const worldCenter = mesh.localToWorld(
      mesh.geometry.boundingSphere.center.clone()
    );
    const dist = camPos.distanceTo(worldCenter);

    // ── CONTROL FADE RADIUS MULTIPLIER HERE (higher = fades sooner) ──
    const fadeRadius = mesh.geometry.boundingSphere.radius * 2.2;

    if (dist < fadeRadius) {
      // ── CONTROL MINIMUM OPACITY HERE (0 = fully invisible inside) ──
      const minOpacity = 0.08;
      const t = dist / fadeRadius;
      mesh.material.opacity = THREE.MathUtils.lerp(minOpacity, 1.0, t);
    } else {
      mesh.material.opacity = 1.0;
    }
  });

  // ── GHOST SIMULATION ──
  // Resolve mouse world position on Y=0 plane each frame
  _ghostRay.setFromCamera(_ghostNDC, camera);
  _ghostRay.ray.intersectPlane(_ghostFloor, _ghostMouseWorld);

  const ghostStep = 1 / 60;
  ghosts.forEach((ghost, gi) => {
    const { ball, world, particles, topCenter, geo } = ghost;

    // ── Ball locomotion: lerp toward target ──
    ball.position.lerp(ghost.target, GHOST_SPEED * delta);
    ball.position.y = Math.max(GHOST_HEIGHT_MIN, ball.position.y);

    // Pick new target when close enough
    if (ball.position.distanceTo(ghost.target) < 0.4) {
      ghost.target = _randomGhostTarget();
    }

    // Random dart — sudden direction change
    if (Math.random() < GHOST_DART_CHANCE) ghost.target = _randomGhostTarget();

    // Mouse flee — push target away from mouse
    const fmdx = ball.position.x - _ghostMouseWorld.x;
    const fmdz = ball.position.z - _ghostMouseWorld.z;
    const fmd  = Math.sqrt(fmdx * fmdx + fmdz * fmdz) + 0.001;
    if (fmd < FLEE_RADIUS) {
      ghost.target.x += (fmdx / fmd) * FLEE_FORCE;
      ghost.target.z += (fmdz / fmd) * FLEE_FORCE;
      ghost.target.y  = GHOST_HEIGHT_MIN + Math.random() * (GHOST_HEIGHT_MAX - GHOST_HEIGHT_MIN);
    }

    // Pin top-center particle to ball position every frame
    topCenter.position.set(ball.position.x, ball.position.y, ball.position.z);
    topCenter.velocity.set(0, 0, 0);

    // Per-particle: wind billow + wispy shimmer (skip pinned top-center)
    for (let i = 0; i <= GHOST_NX; i++) {
      for (let j = 0; j < GHOST_NY; j++) {
        const p = particles[i][j];
        p.applyForce(new CANNON.Vec3(0.3 * Math.sin(t + gi), 0, 0.15));
        p.velocity.x += Math.random() * 0.02 - 0.01;
        p.velocity.z += Math.random() * 0.02 - 0.01;
      }
    }

    world.step(ghostStep);

    // Sync THREE geometry — particle world positions → mesh vertices
    const posAttr = geo.attributes.position;
    for (let i = 0; i <= GHOST_NX; i++) {
      for (let j = 0; j <= GHOST_NY; j++) {
        const idx = j * (GHOST_NX + 1) + i;
        const pos = particles[i][GHOST_NY - j].position;
        posAttr.setXYZ(idx, pos.x, pos.y, pos.z);
      }
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();
  });

  // ── TOMB BALL SIMULATION ──────────────────────────────────────────────────────
  const ghostStep2 = 1 / 60;
  for (let tbi = tombBalls.length - 1; tbi >= 0; tbi--) {
    const tb = tombBalls[tbi];
    tb.age += delta;

    // ── Rise phase ──
    if (tb.rising) {
      tb.ball.position.y += 1.5 * delta;
      if (tb.age >= TOMB_BALL_RISE_DURATION) {
        tb.rising = false;
        tb.target = _tombBallTarget(tb.originX, tb.originZ);
      }
    } else {
      // ── Free drift ──
      tb.ball.position.lerp(tb.target, TOMB_BALL_SPEED * delta);
      tb.ball.position.y = Math.max(TOMB_BALL_HEIGHT_MIN, tb.ball.position.y);

      if (tb.ball.position.distanceTo(tb.target) < 0.3 || Math.random() < TOMB_BALL_DART_CHANCE) {
        tb.target = _tombBallTarget(tb.originX, tb.originZ);
      }

      // Mouse flee — same logic as ghosts
      const tbfx = tb.ball.position.x - _ghostMouseWorld.x;
      const tbfz = tb.ball.position.z - _ghostMouseWorld.z;
      const tbfd = Math.sqrt(tbfx * tbfx + tbfz * tbfz) + 0.001;
      if (tbfd < FLEE_RADIUS) {
        tb.target.x += (tbfx / tbfd) * FLEE_FORCE;
        tb.target.z += (tbfz / tbfd) * FLEE_FORCE;
        tb.target.y  = TOMB_BALL_HEIGHT_MIN + Math.random() * (TOMB_BALL_HEIGHT_MAX - TOMB_BALL_HEIGHT_MIN);
      }
    }

    // ── Fade out ──
    if (tb.age >= TOMB_BALL_FADE_START) {
      const fadeT = Math.min((tb.age - TOMB_BALL_FADE_START) / (TOMB_BALL_LIFETIME - TOMB_BALL_FADE_START), 1.0);
      const alpha = 1.0 - fadeT;
      tb.ballMat.opacity      = alpha;
      tb.ballLight.intensity  = 1.2 * alpha;
      tb.clothMat.opacity     = 0.22 * alpha;
    }

    // ── Cleanup at lifetime ──
    if (tb.age >= TOMB_BALL_LIFETIME) {
      scene.remove(tb.ball);
      scene.remove(tb.clothMesh);
      tb.ballMat.dispose();
      tb.clothMat.dispose();
      tb.clothGeo.dispose();
      // Remove all CANNON bodies and constraints
      while (tb.world.constraints.length) tb.world.removeConstraint(tb.world.constraints[0]);
      while (tb.world.bodies.length)      tb.world.removeBody(tb.world.bodies[0]);
      tombBalls.splice(tbi, 1);
      continue;
    }

    // ── Pin top-center to ball position ──
    tb.topCenter.position.set(tb.ball.position.x, tb.ball.position.y, tb.ball.position.z);
    tb.topCenter.velocity.set(0, 0, 0);

    // ── Wind billow on cloth particles ──
    for (let i = 0; i <= TOMB_BALL_NX; i++) {
      for (let j = 0; j < TOMB_BALL_NY; j++) {
        const p = tb.particles[i][j];
        p.applyForce(new CANNON.Vec3(0.3 * Math.sin(t + tbi), 0, 0.15));
        p.velocity.x += Math.random() * 0.02 - 0.01;
        p.velocity.z += Math.random() * 0.02 - 0.01;
      }
    }
    tb.world.step(ghostStep2);

    // ── Sync cloth geometry ──
    const posAttr2 = tb.clothGeo.attributes.position;
    for (let i = 0; i <= TOMB_BALL_NX; i++) {
      for (let j = 0; j <= TOMB_BALL_NY; j++) {
        const idx = j * (TOMB_BALL_NX + 1) + i;
        const pos = tb.particles[i][TOMB_BALL_NY - j].position;
        posAttr2.setXYZ(idx, pos.x, pos.y, pos.z);
      }
    }
    posAttr2.needsUpdate = true;
    tb.clothGeo.computeVertexNormals();
  }

  // ── INTRO TREE / TOMBSTONE ANIMATION TRIGGER ─────────────────────────────────
  if (musicBoxLoaded && !introAnimStarted && treesLoaded && tombsLoaded &&
      cinematicElapsed >= INTRO_ANIM_START) {
    introAnimStarted = true;
    startIntroAnimation();
  }

  // ── TREE ANIMATIONS ───────────────────────────────────────────────────────────
  for (const tree of trees) {
    if (tree._animStart < 0) continue;
    const elapsed  = t - tree._animStart;
    const progress = Math.min(elapsed / tree._animDuration, 1);
    const eased    = tree._animEase(progress);
    tree.quaternion.slerpQuaternions(tree._animFromQuat, tree._animToQuat, eased);
    if (progress >= 1) tree._animStart = -1;
  }

  // ── TOMBSTONE ANIMATIONS ──────────────────────────────────────────────────────
  for (const tomb of tombstones) {
    if (tomb._animStart < 0) continue;
    const elapsed  = t - tomb._animStart;
    const progress = Math.min(elapsed / tomb._animDuration, 1);
    const eased    = tomb._animEase(progress);
    tomb.mesh.position.y = THREE.MathUtils.lerp(tomb._animFromY, tomb._animToY, eased);
    if (progress >= 1) tomb._animStart = -1;
  }

  // OrbitControls — only active after cinematic completes
  if (cinematicComplete) controls.update();

  renderer.render(scene, camera);

  // ── WIDGET RENDER PASS ──
  if (widgetOpacity > 0) {
    const wW   = Math.min(WIDGET_W, window.innerWidth);
    const wH   = Math.min(WIDGET_H, window.innerHeight);
    const wX   = Math.floor((window.innerWidth  - wW) / 2);
    const wY   = 80;
    const asp  = wW / wH;
    widgetCamera.left   = -asp * 1.5;
    widgetCamera.right  =  asp * 1.5;
    widgetCamera.top    =  1.5;
    widgetCamera.bottom = -1.5;
    widgetCamera.updateProjectionMatrix();
    renderer.setViewport(wX, wY, wW, wH);
    renderer.setScissor(wX, wY, wW, wH);
    renderer.setScissorTest(true);
    renderer.clearDepth();
    renderer.render(widgetScene, widgetCamera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  }
}

animate();

// ─── Tree / Tombstone Animation Sequences ────────────────────────────────────

function startIntroAnimation() {
  // Trees: closest→farthest, stagger, snap upright with easeOutBack
  trees.forEach((tree, i) => {
    setTimeout(() => {
      tree._animStart    = t;
      tree._animDuration = TREE_RISE_DURATION;
      tree._animFromQuat = tree._flatQuat.clone();
      tree._animToQuat   = tree._uprightQuat.clone();
      tree._animEase     = easeOutBack;
    }, i * TREE_STAGGER * 1000);
  });

  // Tombstones: 0.3 s delay then nearest→farthest, stagger, easeOutCubic
  tombstones.forEach((tomb, i) => {
    setTimeout(() => {
      tomb._animStart    = t;
      tomb._animDuration = TOMB_RISE_DURATION;
      tomb._animFromY    = -2.0;
      tomb._animToY      = tomb.finalY;
      tomb._animEase     = easeOutCubic;
    }, (300 / DOMINO_SPEED) + i * TOMB_STAGGER * 1000);
  });
}

function startDominoClose() {
  // Trees: innermost→outermost domino fall, easeInCubic (gravity feel)
  trees.forEach((tree, i) => {
    setTimeout(() => {
      tree._animStart    = t;
      tree._animDuration = TREE_FALL_DURATION;
      tree._animFromQuat = tree._uprightQuat.clone();
      tree._animToQuat   = tree._flatQuatClose.clone();
      tree._animEase     = easeInCubic;
    }, i * TREE_STAGGER * 1000);
  });

  // Tombstones: 0.3 s after first tree, nearest→farthest, easeInCubic
  tombstones.forEach((tomb, i) => {
    setTimeout(() => {
      tomb._animStart    = t;
      tomb._animDuration = TOMB_SINK_DURATION;
      tomb._animFromY    = tomb.mesh.position.y;
      tomb._animToY      = -2.0;
      tomb._animEase     = easeInCubic;
    }, (300 / DOMINO_SPEED) + i * TOMB_STAGGER * 1000);
  });
}

function startDominoOpen() {
  // Tombstones: immediate, nearest→farthest, 0.15 s stagger, easeOutCubic
  tombstones.forEach((tomb, i) => {
    setTimeout(() => {
      tomb._animStart    = t;
      tomb._animDuration = TOMB_RISE_DURATION;
      tomb._animFromY    = tomb.mesh.position.y;
      tomb._animToY      = tomb.finalY;
      tomb._animEase     = easeOutCubic;
    }, i * TOMB_STAGGER * 1000);
  });

  // Trees: 0.3 s delay, outermost→innermost (bow inward), easeOutBack
  const reversedTrees = [...trees].reverse();
  reversedTrees.forEach((tree, i) => {
    setTimeout(() => {
      tree._animStart    = t;
      tree._animDuration = TREE_RISE_DURATION;
      tree._animFromQuat = tree._flatQuatClose.clone();
      tree._animToQuat   = tree._uprightQuat.clone();
      tree._animEase     = easeOutBack;
    }, (300 / DOMINO_SPEED) + i * TREE_STAGGER * 1000);
  });
}

// ─── Lid Toggle ───────────────────────────────────────────────────────────────
function startLidClose() {
  musicBoxActions.forEach(action => {
    action.time = action.getClip().duration;
    action.timeScale = -Math.abs(action._originalTimeScale);
    action.paused = false;
    action.play();
  });
  if (musicMixer) musicMixer.addEventListener('finished', onLidCloseDone);
}

function onLidCloseDone() {
  if (musicMixer) musicMixer.removeEventListener('finished', onLidCloseDone);
  lidBtnLocked = false;
}

function startLidOpen() {
  musicBoxActions.forEach(action => {
    action.time = 0;
    action.timeScale = Math.abs(action._originalTimeScale);
    action.paused = false;
    action.play();
  });
  if (musicMixer) musicMixer.addEventListener('finished', onLidOpenDone);
}

function onLidOpenDone() {
  if (musicMixer) musicMixer.removeEventListener('finished', onLidOpenDone);
  dancer.position.set(musicBoxCenter.x, dancerStartY, musicBoxCenter.z);
  dancer.scale.setScalar(dancerFinalScale * 0.8);
  scene.add(dancer);
  dancerRiseDone      = false;
  dancerRiseElapsed   = 0;
  dancerRisingForOpen = true;
  veilCreated         = false; // allow veil to regenerate when dancer rises again
}

window.toggleLid = function () {
  if (lidBtnLocked) return;
  if (!lidClosed) {
    lidClosed    = true;
    lidBtnLocked = true;
    if (dancerAdded && dancerRiseDone) {
      dancerDescending     = true;
      dancerDescendElapsed = 0;
    } else {
      startLidClose();
    }
    startDominoClose();
  } else {
    lidClosed    = false;
    lidBtnLocked = true;
    startLidOpen();
    startDominoOpen();
  }
};

// ─── Audio ────────────────────────────────────────────────────────────────────
async function initAudio() {
  try {
    audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
    audioGain = audioCtx.createGain();
    audioGain.gain.setValueAtTime(0.8, audioCtx.currentTime);
    audioGain.connect(audioCtx.destination);
    const res = await fetch(MUSIC_SRC);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    audioBuffer = await audioCtx.decodeAudioData(buf);
  } catch (err) {
    console.warn('Wind music could not be loaded — charge mechanic continues without audio:', err);
  }
}

function playMusic() {
  if (!audioCtx || !audioBuffer || musicPlaying) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  audioSource = audioCtx.createBufferSource();
  audioSource.buffer = audioBuffer;
  audioSource.loop = true;
  audioSource.connect(audioGain);
  audioGain.gain.cancelScheduledValues(audioCtx.currentTime);
  audioGain.gain.setValueAtTime(0.8, audioCtx.currentTime);
  audioSource.start();
  musicPlaying = true;
  musicFading  = false;
}

function fadeOutMusic() {
  if (!audioCtx || !musicPlaying || musicFading) return;
  musicFading = true;
  audioGain.gain.cancelScheduledValues(audioCtx.currentTime);
  audioGain.gain.setValueAtTime(audioGain.gain.value, audioCtx.currentTime);
  audioGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 2);
  setTimeout(() => {
    if (audioSource) { try { audioSource.stop(); } catch(_) {} audioSource = null; }
    musicPlaying = false;
    musicFading  = false;
  }, 2100);
}

// ─── Widget helpers ───────────────────────────────────────────────────────────
function updateWidgetPips() {
  const thresholds = [25, 50, 75, 100];
  const atFull = charge >= CHARGE_FULL_THRESHOLD;
  window._pipMeshes.forEach((pip, i) => {
    const filled = charge >= thresholds[i];
    if (filled && atFull) {
      pip.material.color.setHex(0xFFD060); pip.material.emissive.setHex(0xFFAA00); pip.material.emissiveIntensity = 1.2;
    } else if (filled) {
      pip.material.color.setHex(0xFFB800); pip.material.emissive.setHex(0xcc7700); pip.material.emissiveIntensity = 0.8;
    } else {
      pip.material.color.setHex(0x3a1a08); pip.material.emissive.setHex(0x0a0502); pip.material.emissiveIntensity = 0;
    }
  });
}

function _doWindPulse() {
  if (!depletionActive) return;
  const prev = charge;
  charge = Math.min(100, charge + CHARGE_PER_CLICK);
  if (prev < CHARGE_FULL_THRESHOLD && charge >= CHARGE_FULL_THRESHOLD) {
    chargePinnedUntil = performance.now() + 1000;
    playMusic();
  }
  updateWidgetPips();
}

function _toggleSpotlight() {
  spotlightActive = !spotlightActive;
}
window.toggleSpotlight = _toggleSpotlight;

// ─── Resize ───────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  const W = window.innerWidth, H = window.innerHeight;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  renderer.setSize(W, H);
});

