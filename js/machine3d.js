/**
 * NeuroDrive — Interactive 3D Autonomous Pipeline Machine (js/machine3d.js)
 *
 * Adapted & ported to vanilla JS for NeuroDrive Melbourne CBD from:
 * Agentic Factory — Interactive 3D Machine
 * Built by OpenAI Codex (GPT-6 Astra) from a single prompt; ported to React by Claude.
 * Live demo: https://agentic-factory-3d.vercel.app · Next.js template: https://github.com/eugeneshilow/agentic-3d-templates
 * Made with AI agents · https://vibecoding.tech
 *
 * Rethemed to the 5-stage NeuroDrive pipeline:
 *   01 Map (OpenStreetMap streets) -> 02 Router (A* route, 15 m waypoints) ->
 *   03 Sensors (7 lidar rays) -> 04 Brain (12-14-2 neural network) -> 05 Evolution (fitness breeding)
 * Palette: Onyx #01010D, Electric Indigo #6331FB, Tropical Mint #88F9C0, White #FFFFFF.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

function buildMachineMarkup(embed) {
  return `
    <div
      id="scene"
      role="img"
      aria-label="Interactive 3D NeuroDrive machine with five stations: 01 Map, 02 Router, 03 Sensors, 04 Brain, and 05 Evolution. Drag to rotate, scroll or pinch to zoom. Click a station to inspect."
    ></div>
    <div class="vignette" aria-hidden="true"></div>
    <header class="topbar debug-ui">
      <div class="identity">
        <div class="mark" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
            <path
              d="M3 5l7 11 7-11M7 5l3 5 3-5"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <div>
          <strong>NeuroDrive Pipeline</strong>
          <small>Melbourne CBD · Hoddle Grid</small>
        </div>
      </div>
      <div class="status" id="status">
        <i></i>
        <span id="status-text">Pipeline running</span>
        <span>SERIES v2</span>
      </div>
    </header>
    <div class="scene-heading debug-ui">
      Autonomous driving architecture <span class="index">5 STATIONS / 1 LOOP</span>
    </div>
    <div class="coordinates debug-ui">MELBOURNE CBD — 37.814° S, 144.964° E</div>
    <div id="journey" class="debug-ui">
      <div class="journey-icon" aria-hidden="true">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M3 4h10v9H3zM6 4V2h4v2m-5 4h6" stroke="currentColor" stroke-linejoin="round" />
        </svg>
      </div>
      <div>
        <strong id="journey-title">01 · Map loaded</strong>
        <small id="journey-detail">Map · Real OpenStreetMap Melbourne CBD streets</small>
      </div>
      <div class="track">
        <i id="journey-progress"></i>
      </div>
    </div>
    <div id="labels"></div>
    <div id="tooltip" role="tooltip">
      <strong></strong>
      <p></p>
    </div>
    <div class="controls debug-ui">
      <nav class="mode-bar" aria-label="Machine mode">
        <button type="button" data-mode="assembled" aria-pressed="true">
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 1.5l6 3.3v6.4l-6 3.3-6-3.3V4.8L8 1.5zM2 4.8l6 3.4 6-3.4M8 8.2v6.3"
              stroke="currentColor"
              stroke-linejoin="round"
            />
          </svg>
          Assembled
        </button>
        <button type="button" data-mode="cutaway" aria-pressed="false">
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M3 2h10v12H3zM8 2v12M10.5 4l2.5 2.5m-2.5 0L13 9m-2.5 0 2.5 2.5"
              stroke="currentColor"
              stroke-linejoin="round"
            />
          </svg>
          Cutaway
        </button>
        <button type="button" data-mode="stations" aria-pressed="false">
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 1.5l6 3-6 3-6-3 6-3zM2 8l6 3 6-3M2 11.5l6 3 6-3"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          Stations
        </button>
        <button type="button" data-mode="order" aria-pressed="false">
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M5 2.5l8 5.5-8 5.5v-11z" stroke="currentColor" stroke-linejoin="round" />
          </svg>
          One drive
        </button>
      </nav>
      <nav class="camera-row" aria-label="Camera">
        <span class="caption">VIEW</span>
        <button type="button" data-camera="overview" aria-pressed="true">Overview</button>
        <button type="button" data-camera="side" aria-pressed="false">Side</button>
        <button type="button" data-camera="top" aria-pressed="false">Top</button>
        <button type="button" data-camera="station" aria-pressed="false">Station</button>
        <button type="button" data-camera="flight" aria-pressed="false">Flight</button>
        <span class="divider"></span>
        <button type="button" id="play" aria-label="Pause the animation" aria-pressed="false">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect x="2" y="1" width="2.5" height="10" rx=".5" />
            <rect x="7.5" y="1" width="2.5" height="10" rx=".5" />
          </svg>
        </button>
      </nav>
    </div>
    <footer class="footer">
      <span class="footer-center debug-ui">MAP · ROUTE · SENSORS · BRAIN · EVOLUTION</span>
      <span class="hint debug-ui">
        <svg width="13" height="16" viewBox="0 0 13 16" fill="none" aria-hidden="true">
          <rect x="2" y="1" width="9" height="14" rx="4.5" stroke="currentColor" />
          <path d="M6.5 4v3" stroke="currentColor" stroke-linecap="round" />
        </svg>
        ${embed ? 'Drag to spin' : 'Rotate. Zoom. Click a station.'}
      </span>
    </footer>
    <div id="loading">
      <i></i>
      <span>Assembling 3D pipeline</span>
    </div>
    <div id="error" role="alert">
      <strong>3D preview unavailable</strong>
      <p>WebGL is required for the interactive 3D machine.</p>
    </div>
  `;
}

/**
 * Mount the interactive 3D NeuroDrive machine into `el`.
 * @param {HTMLElement} el Container element
 * @param {{ embed?: boolean, onStation?: (id: string) => void, onReady?: () => void, onError?: (err: unknown) => void }} options
 * @returns {() => void} dispose() function
 */
export function mountMachine(el, { embed = false, onStation, onReady, onError } = {}) {
  if (!el) return () => {};

  el.classList.add('nd-machine');
  if (embed) el.classList.add('embed');
  else el.classList.remove('embed');

  el.innerHTML = buildMachineMarkup(embed);

  let disposed = false;
  let sceneDispose = null;

  const fontFamily =
    getComputedStyle(el).fontFamily || "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";

  const start = () => {
    if (disposed) return;
    sceneDispose = initMachineScene(el, fontFamily, {
      embedded: Boolean(embed),
      onStation,
      onReady,
      onError,
    });
  };

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(start).catch(start);
  } else {
    start();
  }

  return function dispose() {
    disposed = true;
    if (sceneDispose) {
      sceneDispose();
      sceneDispose = null;
    }
    el.innerHTML = '';
  };
}

function initMachineScene(root, fontFamily, options) {
  const cleanups = [];
  const frameWidth = () => root.clientWidth || 640;
  const frameHeight = () => root.clientHeight || 420;

  const listen = (target, type, handler) => {
    target.addEventListener(type, handler);
    cleanups.push(() => target.removeEventListener(type, handler));
  };

  function $(id) {
    const el = root.querySelector(`#${id}`);
    if (!el) throw new Error(`Scene markup is missing #${id}`);
    return el;
  }

  function showError(message) {
    try {
      $('loading').classList.add('done');
      $('error').style.display = 'block';
      if (message) $('error').querySelector('p').textContent = message;
    } catch (_) {
      // ignore if container was already cleared
    }
  }

  const dispose = () => {
    for (const fn of cleanups.reverse()) {
      try {
        fn();
      } catch (_) {
        // ignore cleanup error
      }
    }
    cleanups.length = 0;
  };

  try {
    const TAU = Math.PI * 2;
    const embedded = options.embedded;
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Matte onyx / graphite metal palette with restrained Indigo accents & Mint indicator signal
    const palette = {
      indigo: 0x6331fb,
      mint: 0x88f9c0,
      white: 0xffffff,
      onyx: 0x01010d,
      darkMetal: 0x0a0a16,
      midMetal: 0x131324,
      edgeMetal: 0x26263d,
    };

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(33, frameWidth() / frameHeight(), 0.1, 150);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch (e) {
      showError('WebGL is not available in this browser.');
      options.onError?.(e);
      return dispose;
    }

    renderer.setClearColor(0x01010d, 0);
    // Cap pixel ratio at 1.5 for guaranteed 60 fps alongside the Melbourne simulation
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(frameWidth(), frameHeight());
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.localClippingEnabled = true;
    $('scene').appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.enablePan = false;
    controls.minDistance = 7;
    controls.maxDistance = 55;
    controls.minPolarAngle = 0.09;
    controls.maxPolarAngle = Math.PI * 0.475;
    controls.rotateSpeed = 0.48;
    controls.zoomSpeed = 0.7;

    if (embedded) {
      controls.enableZoom = false;
      if (matchMedia('(pointer:coarse)').matches || frameWidth() <= 900) {
        controls.enableRotate = false;
      }
    }

    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.58;
    room.dispose();
    pmrem.dispose();

    scene.add(new THREE.HemisphereLight(0xffffff, 0x01010d, 1.9));

    const key = new THREE.DirectionalLight(0xffffff, 3.8);
    key.position.set(-4, 12, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, {
      left: -10,
      right: 10,
      top: 9,
      bottom: -9,
      near: 0.5,
      far: 35,
    });
    key.shadow.normalBias = 0.035;
    key.shadow.bias = -0.0002;
    key.shadow.radius = 4;
    scene.add(key);

    const rim = new THREE.DirectionalLight(0xb8b8d8, 1.4);
    rim.position.set(3, 7, -8);
    scene.add(rim);

    const indigoGlow = new THREE.PointLight(0x6331fb, 6, 18, 2);
    indigoGlow.position.set(-4, 5, 3);
    scene.add(indigoGlow);

    const mat = (color, metalness = 0.1, roughness = 0.4, extra = {}) =>
      new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });

    const M = {
      body: mat(palette.midMetal, 0.45, 0.54),
      base: mat(palette.darkMetal, 0.52, 0.56),
      edge: mat(palette.edgeMetal, 0.58, 0.42),
      chrome: mat(0x9a9ab4, 0.72, 0.34),
      dark: mat(palette.onyx, 0.32, 0.60),
      rubber: mat(palette.onyx, 0.08, 0.78),
      amber: mat(palette.indigo, 0.45, 0.42), // Indigo accent trim only
      ivory: mat(0x18182c, 0.42, 0.55),       // Matte graphite housing
      copper: mat(0x3a3a58, 0.65, 0.38),      // Brushed graphite metal for pipes & gears
      black: mat(palette.onyx, 0, 0.7),
      light: mat(palette.indigo, 0.2, 0.4, {
        emissive: palette.indigo,
        emissiveIntensity: 0.45,
      }),
      mintLight: mat(palette.mint, 0.15, 0.35, {
        emissive: palette.mint,
        emissiveIntensity: 0.65,
      }),
      whiteLight: mat(palette.white, 0.1, 0.4, {
        emissive: palette.white,
        emissiveIntensity: 0.35,
      }),
      green: mat(palette.mint, 0.1, 0.4, {
        emissive: palette.mint,
        emissiveIntensity: 0.55,
      }),
      glass: mat(palette.edgeMetal, 0.35, 0.25, {
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      }),
      paper: mat(palette.white, 0, 0.85),
    };

    const geometries = new Map();
    function boxGeo(w, h, d, r = 0.04) {
      const k = `b${w},${h},${d},${r}`;
      if (!geometries.has(k)) {
        geometries.set(
          k,
          r
            ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 3, h / 3, d / 3))
            : new THREE.BoxGeometry(w, h, d)
        );
      }
      return geometries.get(k);
    }

    function box(parent, w, h, d, x, y, z, m = M.body, r = 0.04) {
      const o = new THREE.Mesh(boxGeo(w, h, d, r), m);
      o.position.set(x, y, z);
      o.castShadow = true;
      o.receiveShadow = true;
      parent.add(o);
      return o;
    }

    function cyl(parent, r, h, x, y, z, m = M.chrome, r2 = r, segments = 24) {
      const k = `c${r},${r2},${h},${segments}`;
      if (!geometries.has(k)) {
        geometries.set(k, new THREE.CylinderGeometry(r, r2, h, segments));
      }
      const o = new THREE.Mesh(geometries.get(k), m);
      o.position.set(x, y, z);
      o.castShadow = true;
      o.receiveShadow = true;
      parent.add(o);
      return o;
    }

    function ball(parent, r, x, y, z, m = M.chrome) {
      const k = `s${r}`;
      if (!geometries.has(k)) {
        geometries.set(k, new THREE.SphereGeometry(r, 12, 8));
      }
      const o = new THREE.Mesh(geometries.get(k), m);
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    }

    function tube(parent, pts, r, m = M.chrome) {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
      const o = new THREE.Mesh(
        new THREE.TubeGeometry(curve, Math.max(12, pts.length * 7), r, 8, false),
        m
      );
      o.castShadow = true;
      parent.add(o);
      return o;
    }

    function screw(parent, x, y, z) {
      cyl(parent, 0.055, 0.026, x, y, z, M.chrome, undefined, 12);
      box(parent, 0.068, 0.005, 0.009, x, y + 0.014, z, M.dark, 0);
    }

    function canvasTexture(w, h, draw) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      draw(ctx, w, h);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      return { texture: t, canvas: c, ctx };
    }

    function print(ctx, txt, x, y, size = 20, color = '#FFFFFF', weight = 600) {
      ctx.fillStyle = color;
      ctx.font = `${weight} ${size}px ${fontFamily}`;
      ctx.fillText(txt, x, y);
    }

    function screenMaterial(texture) {
      return new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    }

    function screen(parent, w, h, x, y, z, tex) {
      const map = 'texture' in tex ? tex.texture : tex;
      const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMaterial(map));
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    }

    const machine = new THREE.Group();
    scene.add(machine);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 70),
      new THREE.ShadowMaterial({ opacity: 0.28 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.43;
    floor.receiveShadow = true;
    scene.add(floor);

    const shadow = canvasTexture(128, 128, (c, w, h) => {
      const g = c.createRadialGradient(64, 64, 12, 64, 64, 64);
      g.addColorStop(0, 'rgba(1, 1, 13, 0.86)');
      g.addColorStop(0.55, 'rgba(1, 1, 13, 0.48)');
      g.addColorStop(1, 'rgba(1, 1, 13, 0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    });

    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 13),
      new THREE.MeshBasicMaterial({
        map: shadow.texture,
        transparent: true,
        depthWrite: false,
        opacity: 0.72,
      })
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = -0.415;
    scene.add(contact);

    // Base Platform (matte onyx/graphite with subtle indigo front edge)
    box(machine, 12.8, 0.38, 8.25, 0, -0.09, 0, M.base, 0.17);
    box(machine, 12.6, 0.055, 8.08, 0, 0.13, 0, M.edge, 0.11);
    box(machine, 12.49, 0.09, 7.96, 0, 0.19, 0, M.body, 0.1);
    box(machine, 12.55, 0.027, 8.02, 0, -0.19, 0, M.dark, 0.06);
    box(machine, 11.9, 0.02, 0.026, 0, -0.17, 4.115, M.light, 0.01);

    for (const x of [-5.6, 5.6]) {
      for (const z of [-3.35, 3.35]) {
        cyl(machine, 0.39, 0.25, x, -0.31, z, M.rubber);
        cyl(machine, 0.29, 0.09, x, -0.4, z, M.dark);
        screw(machine, x, 0.253, z);
      }
    }
    for (const x of [-6.02, 6.02]) {
      for (const z of [-3.73, 3.73]) {
        screw(machine, x, 0.255, z);
      }
    }

    // Engraved Plate: NEURODRIVE / map - route - sensors - brain - evolution / Melbourne CBD
    const engraving = canvasTexture(1536, 176, (c, w, h) => {
      c.fillStyle = '#07071A';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      c.lineWidth = 2;
      c.strokeRect(2, 2, w - 4, h - 4);
      print(c, 'NEURODRIVE', 42, 78, 38, 'rgba(255,255,255,0.92)', 700);
      print(c, '/  map  -  route  -  sensors  -  brain  -  evolution', 320, 78, 30, 'rgba(255,255,255,0.58)', 500);
      print(c, 'MELBOURNE CBD    /    HODDLE GRID AUTONOMOUS PIPELINE', 44, 134, 18, 'rgba(255,255,255,0.44)', 500);
      print(c, 'V2.0', 1390, 130, 21, '#6331FB', 700);
    });
    const plate = screen(machine, 7.35, 0.84, -0.4, 0.25, 3.51, engraving);
    plate.rotation.x = -Math.PI / 2;

    for (let i = 0; i < 16; i++) {
      box(machine, 0.015, 0.009, 0.11 + (i % 4) * 0.035, -5.6 + i * 0.09, 0.249, 3.5, M.edge, 0);
    }

    // Subtle Indigo drafting rings around the machine
    const drafting = new THREE.Group();
    scene.add(drafting);
    const lineMat = new THREE.LineBasicMaterial({
      color: palette.indigo,
      transparent: true,
      opacity: 0.22,
    });
    const draftingPoints = [];
    for (const r of [7.5, 8.1]) {
      for (let i = 0; i < 120; i++) {
        for (const j of [i, i + 1]) {
          const a = (j / 120) * TAU;
          draftingPoints.push(new THREE.Vector3(Math.cos(a) * r, -0.4, Math.sin(a) * r * 0.72));
        }
      }
    }
    for (let i = 0; i < 52; i++) {
      const a = (i / 52) * TAU;
      const r = 8.1;
      draftingPoints.push(
        new THREE.Vector3(Math.cos(a) * r, -0.395, Math.sin(a) * r * 0.72),
        new THREE.Vector3(
          Math.cos(a) * (r + (i % 4 === 0 ? 0.16 : 0.07)),
          -0.395,
          Math.sin(a) * (r + (i % 4 === 0 ? 0.16 : 0.07)) * 0.72
        )
      );
    }
    drafting.add(
      new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(draftingPoints), lineMat)
    );

    // 5 Stations in NeuroDrive pipeline order:
    // 01 Map, 02 Router, 03 Sensors, 04 Brain, 05 Evolution
    const definitions = [
      {
        id: 'map',
        legacyId: 'engine',
        name: 'Map',
        step: 1,
        output: 'OSM streets',
        pos: [-4.15, 0.29, -0.65],
        desc: 'Real OpenStreetMap streets, laneways, and tram tracks of the Melbourne CBD.',
      },
      {
        id: 'router',
        legacyId: 'admin',
        name: 'Router',
        step: 2,
        output: 'A* waypoints',
        pos: [-1.65, 0.29, -2.03],
        desc: 'Directed road graph & A* pathfinder placing waypoints every 15 metres.',
      },
      {
        id: 'sensors',
        legacyId: 'storefront',
        name: 'Sensors',
        step: 3,
        output: '7 lidar rays',
        pos: [1.5, 0.29, -2.08],
        desc: '7 forward ray sensors measuring proximity to road edges, traffic cars, and trams.',
      },
      {
        id: 'brain',
        legacyId: 'cabinet',
        name: 'Brain',
        step: 4,
        output: '12-14-2 net',
        pos: [4.03, 0.29, 0.12],
        desc: '12–14–2 tanh neural network converting sensor & signal state into steer and throttle.',
      },
      {
        id: 'evolution',
        legacyId: 'cashdesk',
        name: 'Evolution',
        step: 5,
        output: 'next gen',
        pos: [0.93, 0.29, 1.85],
        desc: 'Fittest drivers that progress furthest along the route breed the next generation.',
      },
    ];

    const stations = [];
    const cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 10);
    const shellMaterials = [];

    function shell(m) {
      const s = m.clone();
      s.clippingPlanes = [cutPlane];
      s.clipShadows = true;
      s.side = THREE.DoubleSide;
      shellMaterials.push(s);
      return s;
    }

    const S = {
      body: shell(M.body),
      ivory: shell(M.ivory),
      amber: shell(M.amber),
      edge: shell(M.edge),
    };

    const gears = [];
    function gear(parent, x, y, z, r = 0.3, vertical = false) {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      if (vertical) g.rotation.x = Math.PI / 2;
      parent.add(g);
      cyl(g, r, 0.09, 0, 0, 0, M.copper);
      cyl(g, r * 0.66, 0.105, 0, 0, 0, M.dark);
      cyl(g, r * 0.22, 0.14, 0, 0, 0, M.chrome);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        const b = box(
          g,
          r * 0.26,
          0.085,
          r * 0.2,
          Math.cos(a) * r,
          0,
          Math.sin(a) * r,
          M.copper,
          0.008
        );
        b.rotation.y = -a;
      }
      g.userData.moving = true;
      gears.push({ g, vertical });
      return g;
    }

    definitions.forEach((d, i) => {
      const group = new THREE.Group();
      group.position.fromArray(d.pos);
      machine.add(group);
      // Single restrained mint indicator LED per station
      const glowMat = M.mintLight.clone();
      glowMat.emissiveIntensity = 0.45;
      box(group, 2.05, 0.12, 1.78, 0, 0.03, 0, M.dark, 0.1);
      box(group, 1.97, 0.03, 1.7, 0, 0.12, 0, M.edge, 0.09);
      box(group, 2.03, 0.17, 1.75, 0, 0.215, 0, M.body, 0.1);
      ball(group, 0.048, 0.84, 0.32, 0.74, glowMat);
      for (const x of [-0.85, 0.85]) {
        for (const z of [-0.7, 0.7]) {
          screw(group, x, 0.311, z);
        }
      }
      gear(group, -0.35, 0.45, 0, 0.27);
      gear(group, 0.22, 0.45, 0.12, 0.21);
      box(group, 0.6, 0.15, 0.36, 0.52, 0.47, -0.33, M.dark);
      for (let j = 0; j < 6; j++) {
        box(group, 0.025, 0.16, 0.37, 0.3 + j * 0.08, 0.47, -0.33, M.edge, 0.004);
      }
      tube(
        group,
        [
          [-0.7, 0.4, -0.4],
          [-0.55, 0.48, 0.4],
          [0.35, 0.45, 0.6],
          [0.7, 0.58, 0.23],
        ],
        0.023,
        M.copper
      );

      const plaque = canvasTexture(512, 116, (c, w, h) => {
        c.fillStyle = '#07071A';
        c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(255, 255, 255, 0.10)';
        c.lineWidth = 2;
        c.strokeRect(2, 2, w - 4, h - 4);
        print(c, String(i + 1).padStart(2, '0'), 24, 74, 38, '#6331FB', 700);
        print(c, d.name.toUpperCase(), 108, 72, 32, 'rgba(255,255,255,0.90)', 600);
      });
      screen(group, 1.54, 0.345, 0, 0.27, 0.891, plaque);

      const label = document.createElement('div');
      label.className = 'station-label';
      label.innerHTML = `<div class="stem"></div><div class="label-card"><div class="label-title"><span>${String(i + 1).padStart(2, '0')}</span>${d.name}</div><div class="label-meta">Step ${d.step} · ${d.output}</div></div>`;
      $('labels').appendChild(label);
      cleanups.push(() => label.remove());

      stations.push({
        ...d,
        group,
        base: new THREE.Vector3(...d.pos),
        glowMat,
        label,
        index: i,
        anchor: new THREE.Vector3(0, 2.5, 0),
        pulseBoost: 0,
      });
    });

    // =========================================================================
    // STATION 01: MAP (Real OpenStreetMap Melbourne CBD Hoddle Grid)
    // =========================================================================
    const mapStation = stations[0].group;
    box(mapStation, 1.74, 0.62, 1.33, 0, 0.65, -0.05, S.ivory, 0.13);
    box(mapStation, 1.5, 0.1, 1.16, 0, 0.99, -0.04, S.body, 0.025);
    for (const x of [-0.68, 0.68]) {
      cyl(mapStation, 0.065, 1.73, x, 1.35, -0.18, M.chrome);
      box(mapStation, 0.22, 1.8, 0.22, x, 1.37, -0.44, S.ivory, 0.035);
    }
    box(mapStation, 1.82, 0.27, 0.4, 0, 2.28, -0.35, S.amber, 0.045);
    box(mapStation, 1.55, 0.06, 0.06, 0, 2.13, -0.115, M.chrome, 0.01);

    const printhead = new THREE.Group();
    mapStation.add(printhead);
    printhead.position.set(0, 1.9, -0.08);
    printhead.userData.moving = true;
    box(printhead, 0.45, 0.36, 0.44, 0, 0, 0, M.body, 0.05);
    cyl(printhead, 0.11, 0.13, 0, -0.24, 0.03, M.chrome, 0.04);
    box(printhead, 0.24, 0.045, 0.022, 0, 0.09, 0.23, M.mintLight, 0.01);
    tube(
      mapStation,
      [
        [-0.68, 2.1, -0.35],
        [-0.42, 2.52, -0.4],
        [0.25, 2.5, -0.4],
        [0.35, 2.01, -0.12],
      ],
      0.032,
      M.dark
    );

    const reels = [];
    for (const [x, y] of [
      [-1.03, 1.82],
      [-0.94, 2.78],
    ]) {
      const reel = new THREE.Group();
      reel.position.set(x, y, -0.48);
      mapStation.add(reel);
      reel.userData.moving = true;
      const core = cyl(reel, 0.4, 0.22, 0, 0, 0, M.dark);
      core.rotation.x = Math.PI / 2;
      for (const z of [-0.14, 0.14]) {
        const disc = cyl(reel, 0.46, 0.045, 0, 0, z, M.chrome);
        disc.rotation.x = Math.PI / 2;
        for (let j = 0; j < 6; j++) {
          const a = (j / 6) * TAU;
          const hole = cyl(
            reel,
            0.1,
            0.006,
            Math.cos(a) * 0.29,
            Math.sin(a) * 0.29,
            z + (z > 0 ? 0.026 : -0.026),
            M.dark,
            undefined,
            14
          );
          hole.rotation.x = Math.PI / 2;
        }
      }
      const axle = cyl(reel, 0.095, 0.37, 0, 0, 0, M.amber);
      axle.rotation.x = Math.PI / 2;
      reels.push(reel);
    }
    tube(
      mapStation,
      [
        [-1.36, 2.66, -0.48],
        [-1.5, 2.34, -0.48],
        [-1.34, 1.92, -0.48],
      ],
      0.045,
      M.dark
    );

    // Map thumbnail screen (Melbourne Hoddle Grid)
    const mapScreenTex = canvasTexture(384, 640, () => {});
    function drawMapScreen(t) {
      const c = mapScreenTex.ctx;
      const w = 384;
      const h = 640;
      c.fillStyle = '#01010D';
      c.fillRect(0, 0, w, h);

      // Rotated Melbourne Hoddle Grid streets
      c.save();
      c.translate(192, 265);
      c.rotate(-0.32);
      c.fillStyle = 'rgba(99, 49, 251, 0.16)';
      for (let gx = -120; gx <= 80; gx += 52) {
        for (let gy = -120; gy <= 80; gy += 44) {
          c.fillRect(gx, gy, 38, 30);
        }
      }
      c.strokeStyle = '#6331FB';
      c.lineWidth = 5;
      for (let gx = -130; gx <= 130; gx += 52) {
        c.beginPath();
        c.moveTo(gx, -150);
        c.lineTo(gx, 150);
        c.stroke();
      }
      for (let gy = -130; gy <= 130; gy += 44) {
        c.beginPath();
        c.moveTo(-150, gy);
        c.lineTo(150, gy);
        c.stroke();
      }
      // Glowing Mint route highlight
      c.strokeStyle = '#88F9C0';
      c.lineWidth = 6;
      c.setLineDash([10, 8]);
      c.lineDashOffset = -(t * 24) % 36;
      c.beginPath();
      c.moveTo(-26, 110);
      c.lineTo(-26, -22);
      c.lineTo(26, -22);
      c.lineTo(26, -110);
      c.stroke();
      c.setLineDash([]);
      c.restore();

      print(c, '01 · OSM MAP', 26, 52, 22, '#88F9C0', 700);
      print(c, 'MELBOURNE', 24, 94, 38, '#FFFFFF', 700);

      c.fillStyle = 'rgba(99, 49, 251, 0.2)';
      c.beginPath();
      c.roundRect(24, 462, 336, 126, 12);
      c.fill();
      c.strokeStyle = 'rgba(136, 249, 192, 0.45)';
      c.lineWidth = 2;
      c.stroke();

      print(c, 'Hoddle Grid CBD', 44, 504, 24, '#FFFFFF', 600);
      print(c, 'Streets · One-ways · Trams', 44, 544, 19, '#88F9C0', 500);

      c.fillStyle = '#88F9C0';
      c.fillRect(26, 612, Math.max(12, ((t * 0.15) % 1) * 332), 6);
      mapScreenTex.texture.needsUpdate = true;
    }
    drawMapScreen(0);

    const outputMapCard = new THREE.Group();
    outputMapCard.userData.moving = true;
    mapStation.add(outputMapCard);
    box(outputMapCard, 0.62, 1.08, 0.055, 0, 1.36, 0.61, M.dark, 0.035);
    screen(outputMapCard, 0.56, 0.98, 0, 1.36, 0.641, mapScreenTex);
    box(mapStation, 1.14, 0.12, 0.2, 0, 0.83, 0.66, M.dark, 0.025);
    for (const x of [-0.42, 0.42]) {
      const r = cyl(mapStation, 0.115, 0.18, x, 0.92, 0.6, M.chrome);
      r.rotation.z = Math.PI / 2;
    }
    for (let i = 0; i < 5; i++) {
      box(mapStation, 0.08, 0.03, 0.22, -0.38 + i * 0.19, 1.011, -0.02, M.edge, 0.005);
    }

    // =========================================================================
    // STATION 02: ROUTER (A* Route: Flinders St Station -> Queen Victoria Market)
    // =========================================================================
    const routerStation = stations[1].group;
    box(routerStation, 1.9, 0.66, 1.36, 0, 0.67, -0.04, S.body, 0.11);
    const consoleTop = new THREE.Group();
    consoleTop.position.set(0, 1.01, -0.08);
    consoleTop.rotation.x = -0.32;
    routerStation.add(consoleTop);
    box(consoleTop, 1.76, 0.12, 1.27, 0, 0, 0, S.ivory, 0.04);

    const routerTex = canvasTexture(640, 340, () => {});
    function drawRouterScreen(t) {
      const c = routerTex.ctx;
      c.fillStyle = '#01010D';
      c.fillRect(0, 0, 640, 340);
      print(c, '02 · A* GRAPH ROUTER', 24, 42, 20, '#88F9C0', 700);
      print(c, '15 m WAYPOINTS', 445, 42, 18, '#FFFFFF', 600);

      const legs = [
        ['Flinders St Station → Queen Victoria Market', 'PRIMARY A* ROUTE · 1.4 KM'],
        ['Swanston St → Collins St → Elizabeth St', 'ONE-WAY GRAPH VERIFIED'],
        ['Waypoint Spacing: 15.0 m intervals', 'BEARING SIN/COS ACTIVE'],
      ];
      for (let i = 0; i < 3; i++) {
        const y = 68 + i * 82;
        c.fillStyle = 'rgba(99, 49, 251, 0.16)';
        c.beginPath();
        c.roundRect(20, y, 600, 66, 8);
        c.fill();
        c.fillStyle = i === 0 ? '#88F9C0' : '#6331FB';
        c.fillRect(32, y + 12, 10, 42);
        print(c, legs[i][0], 56, y + 30, 18, '#FFFFFF', 600);
        print(c, legs[i][1], 56, y + 52, 12, '#88F9C0', 600);
        c.fillStyle = 'rgba(255, 255, 255, 0.12)';
        c.fillRect(435, y + 28, 165, 8);
        c.fillStyle = i === 0 ? '#88F9C0' : '#6331FB';
        c.fillRect(435, y + 28, i === 0 ? ((t * 0.18) % 1) * 165 : 110 + i * 22, 8);
      }
    }
    drawRouterScreen(0);
    const qs = screen(consoleTop, 1.53, 0.79, 0, 0.067, -0.17, routerTex);
    qs.rotation.x = -Math.PI / 2;

    const toggles = [];
    for (let i = 0; i < 4; i++) {
      const x = -0.57 + i * 0.38;
      cyl(consoleTop, 0.074, 0.035, x, 0.1, 0.45, M.dark);
      const t = cyl(consoleTop, 0.025, 0.15, x, 0.19, 0.45, M.chrome);
      t.rotation.x = -0.4;
      t.userData.moving = true;
      toggles.push(t);
      ball(consoleTop, 0.04, x, 0.275, 0.421, M.copper);
    }
    cyl(routerStation, 0.075, 0.06, 0.77, 1.05, -0.62, M.green);
    for (let i = 0; i < 7; i++) {
      box(routerStation, 0.55, 0.027, 0.02, 0, 0.46 + i * 0.05, 0.655, M.dark, 0.003);
    }

    // =========================================================================
    // STATION 03: SENSORS (7 Lidar Rays: Road Edges, Cars, Trams)
    // =========================================================================
    const sensorsStation = stations[2].group;
    box(sensorsStation, 1.35, 0.18, 0.88, 0, 0.44, 0, S.ivory, 0.045);
    cyl(sensorsStation, 0.095, 1.04, 0, 0.93, -0.31, M.chrome);
    box(sensorsStation, 0.56, 0.91, 0.14, 0, 0.99, -0.34, S.body, 0.04);
    box(sensorsStation, 2.42, 1.72, 0.2, 0, 1.94, -0.17, S.ivory, 0.08);
    box(sensorsStation, 2.28, 1.59, 0.1, 0, 1.94, -0.044, M.dark, 0.045);

    const sensorsScreenTex = canvasTexture(896, 592, (c, w, h) => {
      c.fillStyle = '#01010D';
      c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(99, 49, 251, 0.22)';
      c.fillRect(0, 0, w, 56);
      c.fillStyle = '#88F9C0';
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.arc(26 + i * 19, 28, 5, 0, TAU);
        c.fill();
      }
      print(c, '03 · 7-RAY LIDAR PERCEPTION', 95, 35, 20, '#FFFFFF', 700);
      print(c, 'Road Edges · Cars · Trams · Signals', 535, 35, 16, '#88F9C0', 600);

      // Left Card: 7-Ray Fan Diagram
      c.fillStyle = 'rgba(99, 49, 251, 0.14)';
      c.strokeStyle = '#6331FB';
      c.lineWidth = 2;
      c.beginPath();
      c.roundRect(32, 86, 360, 460, 12);
      c.fill();
      c.stroke();

      const cx = 212;
      const cy = 445;
      const angles = [-0.95, -0.62, -0.3, 0, 0.3, 0.62, 0.95];
      const lengths = [195, 240, 290, 315, 275, 230, 185];
      angles.forEach((ang, idx) => {
        const tx = cx + Math.sin(ang) * lengths[idx];
        const ty = cy - Math.cos(ang) * lengths[idx];
        c.strokeStyle = idx === 3 ? '#88F9C0' : 'rgba(136, 249, 192, 0.65)';
        c.lineWidth = idx === 3 ? 4 : 2.5;
        c.beginPath();
        c.moveTo(cx, cy);
        c.lineTo(tx, ty);
        c.stroke();

        c.fillStyle = '#88F9C0';
        c.beginPath();
        c.arc(tx, ty, 6, 0, TAU);
        c.fill();
      });

      // Car body at ray origin
      c.fillStyle = '#6331FB';
      c.strokeStyle = '#88F9C0';
      c.lineWidth = 3;
      c.beginPath();
      c.roundRect(cx - 22, cy - 36, 44, 76, 10);
      c.fill();
      c.stroke();

      // Right Telemetry Readout
      print(c, '7 Forward Rays', 430, 145, 38, '#FFFFFF', 700);
      print(c, 'Spatial-Hash Grid', 430, 195, 32, '#88F9C0', 600);
      print(c, 'Normalized distances (0..1) to curbs,', 430, 248, 19, 'rgba(255,255,255,0.78)', 500);
      print(c, 'CBD traffic, trams & signal stop lines.', 430, 276, 19, 'rgba(255,255,255,0.78)', 500);

      const channels = [
        ['RAY 1–7 PROXIMITY', '0.84 m'],
        ['SPEED / 40 KM/H', '38 km/h'],
        ['WAYPOINT BEARING', 'sin/cos'],
        ['NEXT SIGNAL', 'GREEN'],
      ];
      channels.forEach(([k, v], idx) => {
        const ry = 315 + idx * 46;
        c.fillStyle = 'rgba(255,255,255,0.06)';
        c.fillRect(430, ry, 420, 36);
        print(c, k, 444, ry + 24, 16, '#FFFFFF', 600);
        print(c, v, 735, ry + 24, 16, '#88F9C0', 700);
      });
    });

    screen(sensorsStation, 2.16, 1.43, 0, 1.95, 0.011, sensorsScreenTex);
    ball(sensorsStation, 0.024, 0, 2.747, -0.05, M.dark);
    box(sensorsStation, 0.21, 0.019, 0.008, 0, 1.149, 0.013, M.mintLight, 0.003);

    const flyPost = new THREE.Group();
    flyPost.userData.moving = true;
    sensorsStation.add(flyPost);
    box(flyPost, 0.59, 0.77, 0.045, 0.94, 0.81, 0.55, M.ivory, 0.025);
    const sensorCardTex = canvasTexture(220, 290, (c, w, h) => {
      c.fillStyle = '#01010D';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#6331FB';
      c.fillRect(15, 16, 190, 168);
      c.strokeStyle = '#88F9C0';
      c.lineWidth = 3;
      for (let i = -2; i <= 2; i++) {
        c.beginPath();
        c.moveTo(110, 160);
        c.lineTo(110 + i * 34, 36);
        c.stroke();
      }
      print(c, '7 RAYS', 20, 224, 24, '#88F9C0', 700);
      print(c, '40 km/h CBD', 20, 256, 17, '#FFFFFF', 500);
    });
    screen(flyPost, 0.55, 0.72, 0.94, 0.81, 0.575, sensorCardTex);

    // =========================================================================
    // STATION 04: BRAIN (12-14-2 Neural Network + Live Success Rate)
    // =========================================================================
    const brainStation = stations[3].group;
    box(brainStation, 1.75, 1.77, 1.02, 0, 1.24, -0.13, S.body, 0.12);
    box(brainStation, 1.58, 0.13, 1.09, 0, 2.16, -0.13, S.amber, 0.04);
    box(brainStation, 1.47, 1.38, 0.055, 0, 1.31, 0.405, M.dark, 0.025);

    let liveSuccessRate = 0.38;
    const brainScreenTex = canvasTexture(480, 460, () => {});
    function drawBrainScreen(successVal = liveSuccessRate) {
      const c = brainScreenTex.ctx;
      const w = 480;
      const h = 460;
      c.fillStyle = '#01010D';
      c.fillRect(0, 0, w, h);

      print(c, '04 · NEURAL BRAIN [12, 14, 2]', 26, 46, 22, '#88F9C0', 700);
      const pct = Math.round(Math.max(0, Math.min(1, Number(successVal) || 0)) * 100);
      print(c, `Arrival Success Rate: ${pct}%  (≥70% advances)`, 26, 76, 16, '#FFFFFF', 600);

      // Draw 3-layer network diagram (12 -> 14 -> 2)
      const layerX = [70, 235, 395];
      const counts = [8, 10, 2]; // visual nodes representing 12 -> 14 -> 2
      const nodeCoords = counts.map((cnt, lIdx) => {
        const arr = [];
        for (let i = 0; i < cnt; i++) {
          const y = 115 + (i / Math.max(1, cnt - 1)) * 245;
          arr.push([layerX[lIdx], y]);
        }
        return arr;
      });

      // Synapses (Mint = positive, Indigo = negative)
      for (let l = 0; l < 2; l++) {
        const src = nodeCoords[l];
        const dst = nodeCoords[l + 1];
        for (let i = 0; i < src.length; i++) {
          for (let j = 0; j < dst.length; j++) {
            if ((i + j) % 2 !== 0 && l === 0) continue;
            c.strokeStyle = (i * 3 + j) % 2 === 0 ? 'rgba(136,249,192,0.55)' : 'rgba(99,49,251,0.6)';
            c.lineWidth = 1.8;
            c.beginPath();
            c.moveTo(src[i][0], src[i][1]);
            c.lineTo(dst[j][0], dst[j][1]);
            c.stroke();
          }
        }
      }

      // Neurons
      nodeCoords.forEach((layer, lIdx) => {
        layer.forEach(([nx, ny]) => {
          c.fillStyle = lIdx === 2 ? '#88F9C0' : '#6331FB';
          c.beginPath();
          c.arc(nx, ny, lIdx === 2 ? 12 : 7, 0, TAU);
          c.fill();
          c.strokeStyle = '#FFFFFF';
          c.lineWidth = 1.5;
          c.stroke();
        });
      });

      print(c, 'STEER', 360, 165, 15, '#88F9C0', 700);
      print(c, 'ACCEL', 360, 330, 15, '#88F9C0', 700);

      // Success Rate Bar at bottom
      c.fillStyle = 'rgba(255, 255, 255, 0.12)';
      c.fillRect(26, 412, 428, 18);
      c.fillStyle = '#88F9C0';
      c.fillRect(26, 412, Math.max(12, (pct / 100) * 428), 18);
      brainScreenTex.texture.needsUpdate = true;
    }
    drawBrainScreen(liveSuccessRate);

    screen(brainStation, 1.31, 1.255, 0, 1.37, 0.44, brainScreenTex);
    box(brainStation, 1.27, 0.075, 0.29, 0, 0.57, 0.55, M.chrome, 0.02);
    for (let i = 0; i < 3; i++) {
      box(brainStation, 1.15, 0.021, 0.12, 0, 0.58 + i * 0.15, -0.35, M.copper, 0.006);
    }
    tube(
      brainStation,
      [
        [0.69, 0.43, -0.2],
        [0.89, 0.65, -0.2],
        [0.89, 1.8, -0.2],
        [0.65, 1.99, -0.2],
      ],
      0.033,
      M.chrome
    );

    const incoming = new THREE.Group();
    incoming.userData.moving = true;
    brainStation.add(incoming);
    box(incoming, 0.86, 0.42, 0.043, 0, 0, 0, M.light, 0.035);
    const brainBadgeTex = canvasTexture(432, 204, (c, w, h) => {
      c.fillStyle = '#6331FB';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#01010D';
      c.beginPath();
      c.arc(58, 98, 34, 0, TAU);
      c.fill();
      print(c, 'AI', 37, 110, 28, '#88F9C0', 700);
      print(c, '12 → 14 → 2', 108, 91, 34, '#FFFFFF', 700);
      print(c, 'tanh Brain Active', 108, 138, 22, '#88F9C0', 600);
    });
    screen(incoming, 0.82, 0.39, 0, 0, 0.026, brainBadgeTex);

    // =========================================================================
    // STATION 05: EVOLUTION (Generation & Best Distance in Metres)
    // =========================================================================
    const evolutionStation = stations[4].group;
    box(evolutionStation, 1.91, 0.63, 1.32, 0, 0.65, -0.06, S.ivory, 0.12);
    box(evolutionStation, 1.96, 0.19, 1.38, 0, 0.42, -0.04, S.body, 0.04);
    box(evolutionStation, 1.37, 0.09, 0.038, 0, 0.44, 0.66, M.dark, 0.01);
    box(evolutionStation, 0.37, 0.042, 0.03, 0, 0.45, 0.687, M.chrome, 0.009);
    box(evolutionStation, 1.02, 0.25, 0.91, -0.33, 1.04, -0.03, S.body, 0.045);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        box(
          evolutionStation,
          0.19,
          0.085,
          0.17,
          -0.62 + col * 0.27,
          1.21,
          0.27 - row * 0.24,
          col === 2 && row === 2 ? M.copper : M.ivory,
          0.022
        );
      }
    }
    box(evolutionStation, 0.64, 0.6, 0.52, 0.58, 1.04, -0.15, S.body, 0.045);
    box(evolutionStation, 0.48, 0.07, 0.09, 0.59, 1.37, -0.1, M.dark, 0.01);
    cyl(evolutionStation, 0.06, 0.65, -0.35, 1.6, -0.56, M.chrome);
    box(evolutionStation, 1.13, 0.46, 0.19, -0.35, 1.98, -0.56, S.body, 0.045);

    let liveGeneration = 1;
    let liveBestDistM = 620;
    const evoScreenTex = canvasTexture(512, 176, () => {});
    function drawEvolutionScreen(gen = liveGeneration, distM = liveBestDistM) {
      const c = evoScreenTex.ctx;
      c.fillStyle = '#07071A';
      c.fillRect(0, 0, 512, 176);
      c.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      c.lineWidth = 2;
      c.strokeRect(2, 2, 508, 172);
      print(c, `05 / EVOLUTION  ·  GEN ${gen}`, 22, 46, 20, 'rgba(255,255,255,0.64)', 600);
      print(c, `${Math.round(distM).toLocaleString()} m`, 24, 134, 58, '#88F9C0', 700);
      evoScreenTex.texture.needsUpdate = true;
    }
    drawEvolutionScreen(liveGeneration, liveBestDistM);
    screen(evolutionStation, 1.015, 0.349, -0.35, 1.98, -0.459, evoScreenTex);

    const receipt = new THREE.Group();
    receipt.position.set(0.59, 1.37, -0.1);
    receipt.userData.moving = true;
    evolutionStation.add(receipt);
    const receiptTex = canvasTexture(280, 540, (c, w, h) => {
      c.fillStyle = '#01010D';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#6331FB';
      c.lineWidth = 4;
      c.strokeRect(2, 2, w - 4, h - 4);
      print(c, 'NEURODRIVE', 24, 52, 24, '#88F9C0', 700);
      print(c, 'FITNESS REPORT', 24, 86, 18, '#FFFFFF', 600);
      c.strokeStyle = 'rgba(255,255,255,0.3)';
      c.setLineDash([5, 6]);
      c.beginPath();
      c.moveTo(22, 115);
      c.lineTo(258, 115);
      c.stroke();
      c.setLineDash([]);
      print(c, 'Route: CBD Grid', 24, 154, 20, '#FFFFFF', 500);
      print(c, '100 Cohort Cars', 24, 190, 20, '#88F9C0', 600);
      print(c, 'ELITE CLONED', 24, 263, 26, '#88F9C0', 700);
      print(c, 'Weights Mutated', 24, 312, 20, 'rgba(255,255,255,0.75)', 500);
      for (let i = 0; i < 44; i++) {
        c.fillStyle = i % 2 === 0 ? '#6331FB' : '#88F9C0';
        c.fillRect(25 + i * 5, 370, 1 + (i % 3), 83);
      }
      print(c, 'brain.v2 saved', 65, 496, 17, '#FFFFFF', 600);
    });
    const rp = screen(receipt, 0.41, 0.83, 0, 0.415, 0.01, receiptTex);
    rp.material.side = THREE.DoubleSide;
    receipt.rotation.x = -0.16;

    const coin = new THREE.Group();
    coin.userData.moving = true;
    evolutionStation.add(coin);
    const coinDisc = cyl(coin, 0.22, 0.065, 0, 0, 0, M.copper, undefined, 32);
    coinDisc.rotation.x = Math.PI / 2;
    const coinRing = new THREE.Mesh(new THREE.TorusGeometry(0.174, 0.014, 6, 32), M.mintLight);
    coinRing.position.z = 0.037;
    coin.add(coinRing);
    const tokenTex = canvasTexture(128, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.textAlign = 'center';
      print(c, '★', 64, 92, 82, '#01010D', 700);
    });
    const tokenFace = screen(coin, 0.28, 0.28, 0, 0, 0.04, tokenTex);
    tokenFace.material.transparent = true;
    cyl(evolutionStation, 0.33, 0.09, 1.04, 0.39, 0.55, M.dark);
    cyl(evolutionStation, 0.26, 0.025, 1.04, 0.445, 0.55, M.copper);

    // =========================================================================
    // Conveyor & Packet Cards across the 5 NeuroDrive Pipeline Stages
    // =========================================================================
    const path = new THREE.CatmullRomCurve3(
      [
        [-3.95, 0.84, 0.65],
        [-3.1, 0.84, -0.12],
        [-1.45, 0.84, -0.79],
        [1.32, 0.84, -0.8],
        [3.3, 0.84, 0.19],
        [3.43, 0.84, 1.21],
        [1.35, 0.84, 2.7],
        [-1.4, 0.84, 2.52],
        [-3.54, 0.84, 1.65],
      ].map((p) => new THREE.Vector3(...p)),
      true,
      'catmullrom',
      0.25
    );

    const belt = new THREE.Group();
    machine.add(belt);
    const frameMesh = new THREE.Mesh(new THREE.TubeGeometry(path, 150, 0.35, 8, true), M.dark);
    frameMesh.scale.y = 0.3;
    frameMesh.position.y = 0.51;
    belt.add(frameMesh);

    const beltCount = 148;
    const beltSlats = new THREE.InstancedMesh(
      boxGeo(0.135, 0.065, 0.63, 0.012),
      M.body,
      beltCount
    );
    beltSlats.receiveShadow = true;
    beltSlats.castShadow = false;
    belt.add(beltSlats);
    beltSlats.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const dummy = new THREE.Object3D();
    const pVec = new THREE.Vector3();
    const tVec = new THREE.Vector3();

    function updateBelt(t) {
      for (let i = 0; i < beltCount; i++) {
        const u = (i / beltCount + t * 0.012) % 1;
        path.getPointAt(u, pVec);
        path.getTangentAt(u, tVec);
        dummy.position.copy(pVec);
        dummy.rotation.set(0, -Math.atan2(tVec.z, tVec.x), 0);
        dummy.updateMatrix();
        beltSlats.setMatrixAt(i, dummy.matrix);
      }
      beltSlats.instanceMatrix.needsUpdate = true;
    }
    updateBelt(0);

    for (const side of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 160; i++) {
        path.getPointAt(i / 160, pVec);
        path.getTangentAt(i / 160, tVec);
        pts.push(
          pVec.clone().add(new THREE.Vector3(-tVec.z * 0.36 * side, 0.09, tVec.x * 0.36 * side))
        );
      }
      const railPath = new THREE.CatmullRomCurve3(pts);
      belt.add(new THREE.Mesh(new THREE.TubeGeometry(railPath, 160, 0.028, 6, false), M.chrome));
    }
    for (let i = 0; i < 16; i++) {
      const p = path.getPointAt(i / 16);
      cyl(belt, 0.045, 0.43, p.x, 0.53, p.z, M.chrome);
    }

    // Mint pneumatic data lines linking stations
    const pipes = new THREE.Group();
    machine.add(pipes);
    for (let i = 0; i < 4; i++) {
      const a = stations[i].base;
      const b = stations[i + 1].base;
      const points = [
        a.clone().add(new THREE.Vector3(0.4, 0.12, 0)),
        a.clone().lerp(b, 0.35).add(new THREE.Vector3(0, 0.1, -0.6)),
        a.clone().lerp(b, 0.65).add(new THREE.Vector3(0, 0.1, -0.6)),
        b.clone().add(new THREE.Vector3(-0.4, 0.12, 0)),
      ];
      const curve = new THREE.CatmullRomCurve3(points);
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.054, 8, false), M.copper);
      pipes.add(mesh);
    }

    // Travelling Packet Cards
    const routePacketTex = canvasTexture(256, 352, (c, w, h) => {
      c.fillStyle = '#01010D';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#88F9C0';
      c.lineWidth = 4;
      c.strokeRect(2, 2, w - 4, h - 4);
      print(c, 'A* ROUTE', 22, 48, 22, '#88F9C0', 700);
      print(c, '15 m Waypoints', 22, 82, 16, '#FFFFFF', 500);
      for (let i = 0; i < 8; i++) {
        c.fillStyle = i === 3 ? '#88F9C0' : '#6331FB';
        c.fillRect(24, 114 + i * 22, 190 - (i % 3) * 24, 7);
      }
      print(c, 'FLINDERS → QVM', 22, 324, 16, '#88F9C0', 700);
    });

    const mapPacketTex = canvasTexture(256, 352, (c, w, h) => {
      c.fillStyle = '#6331FB';
      c.fillRect(0, 0, w, h);
      print(c, 'OSM', 22, 48, 26, '#FFFFFF', 700);
      print(c, 'STREETS', 22, 80, 24, '#88F9C0', 700);
      c.strokeStyle = '#88F9C0';
      c.lineWidth = 3;
      c.strokeRect(22, 112, 210, 138);
      print(c, 'CBD Grid', 40, 190, 32, '#FFFFFF', 700);
      print(c, 'MELBOURNE / 01', 22, 320, 16, '#88F9C0', 600);
    });

    const packetTextures = [
      mapPacketTex,
      routePacketTex,
       mapScreenTex,
      sensorCardTex,
      receiptTex,
    ];

    const packets = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      g.userData.moving = true;
      machine.add(g);
      box(g, 0.47, 0.71, 0.04, 0, 0, 0, M.ivory, 0.022);
      const faces = packetTextures.map((tex) => {
        const s = screen(g, 0.43, 0.665, 0, 0, 0.024, tex);
        s.material.side = THREE.DoubleSide;
        s.visible = false;
        return s;
      });
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.4, 0.418, 40),
        new THREE.MeshBasicMaterial({
          color: palette.mint,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = -0.37;
      g.add(halo);
      halo.visible = false;
      packets.push({ group: g, faces, halo, stage: -1, phase: 0 });
    }

    function nearestPort(x, z) {
      let best = 0;
      let dist = Infinity;
      for (let i = 0; i < 300; i++) {
        const p = path.getPointAt(i / 300);
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < dist) {
          dist = d;
          best = i / 300;
        }
      }
      return best;
    }

    const adminU = nearestPort(-1.65, -0.7);
    const storeU = nearestPort(1.5, -0.7);
    const cashU = nearestPort(0.93, 2.65);

    function compact(group) {
      for (const child of [...group.children]) {
        if (child.isGroup) compact(child);
      }
      const buckets = new Map();
      for (const child of group.children) {
        if (
          !child.isMesh ||
          child.isInstancedMesh ||
          child.userData.moving ||
          Array.isArray(child.material)
        ) {
          continue;
        }
        const key = child.material.uuid;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(child);
      }
      for (const list of buckets.values()) {
        if (list.length < 2) continue;
        const geos = list.map((m) => {
          m.updateMatrix();
          const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
          return g.applyMatrix4(m.matrix);
        });
        const merged = mergeGeometries(geos, false);
        for (const geo of geos) geo.dispose();
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, list[0].material);
        mesh.castShadow = list.some((x) => x.castShadow);
        mesh.receiveShadow = list.some((x) => x.receiveShadow);
        for (const m of list) group.remove(m);
        group.add(mesh);
      }
    }

    [incoming, receipt, coin, outputMapCard, flyPost, printhead, ...reels].forEach((g) => {
      g.userData.moving = true;
    });
    compact(machine);

    stations.forEach((s) =>
      s.group.traverse((o) => {
        o.userData.station = s.id;
      })
    );
    const pickables = stations.map((s) => s.group);

    let mode = 'assembled';
    let cameraMode = 'overview';
    let playing = !reduceMotion;
    let simTime = 0;
    let spread = 0;
    let selected = 'map';
    let hovered = null;

    let width = frameWidth();
    let height = frameHeight();
    let mobile = width <= 900;
    let lastInteraction = performance.now() - (embedded ? 7000 : 0);
    let dragging = false;
    let wasDragged = false;
    let downX = 0;
    let downY = 0;
    let cameraAnimating = true;
    let flightTime = 0;
    let lastDraw = -1;
    let visible = true;
    let contextLost = false;

    const desiredPosition = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3(0, 1, 0);
    const viewDirection = new THREE.Vector3(10.5, 10.8, 17).normalize();
    let baseDistance = 25;
    let sized = false;
    let readySent = false;

    function layoutCamera() {
      if (!frameWidth() || !frameHeight()) return;
      const first = !sized;
      sized = true;
      width = frameWidth();
      height = frameHeight();
      mobile = width <= 900;
      renderer.setSize(width, height);
      camera.aspect = width / height;

      if (embedded) {
        controls.enableRotate = !mobile && !matchMedia('(pointer:coarse)').matches;
      }

      camera.setViewOffset(
        width,
        height,
        mobile || !embedded ? 0 : -width * 0.21,
        mobile || embedded ? 0 : height * 0.025,
        width,
        height
      );
      const aspect = width / height;
      const availableWidth = mobile ? 0.91 : Math.min(0.55, aspect > 2 ? 0.54 : 0.57);
      const horizontalFit =
        17.3 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect * availableWidth);
      const verticalFit =
        11.5 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (embedded ? 0.85 : 0.62));
      baseDistance =
        (Math.max(horizontalFit, verticalFit) * (mobile ? 0.97 : 1)) /
        (embedded ? (mobile ? 1.15 : 1.45) : 1);
      controls.maxDistance = Math.max(55, baseDistance * 1.6);
      camera.updateProjectionMatrix();
      setCameraGoal();
      cameraAnimating = true;
      if (first) {
        camera.position.copy(desiredPosition);
        controls.target.copy(desiredTarget);
        controls.update();
        cameraAnimating = false;
      }
    }

    function setCameraGoal() {
      const expand = mode === 'stations' ? 1.2 : 1;
      if (cameraMode === 'station') {
        const s = stations.find((st) => st.id === selected) || stations[0];
        desiredTarget.copy(s.group.position).add(new THREE.Vector3(0, 1.25, 0));
        desiredPosition.copy(desiredTarget).addScaledVector(viewDirection, mobile ? 9 : 12);
      } else {
        desiredTarget.set(0, 1, 0);
        const distance = baseDistance * expand;
        if (cameraMode === 'side') {
          desiredPosition.set(13, 5, 20).normalize().multiplyScalar(distance).add(desiredTarget);
        } else if (cameraMode === 'top') {
          desiredPosition.set(0.01, distance, 0.8).add(desiredTarget);
        } else {
          desiredPosition.copy(viewDirection).multiplyScalar(distance).add(desiredTarget);
        }
      }
    }

    function syncButtons() {
      root
        .querySelectorAll('[data-mode]')
        .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
      root
        .querySelectorAll('[data-camera]')
        .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.camera === cameraMode)));
      $('journey').classList.toggle('visible', mode === 'order');
    }

    const modeAliases = {
      Assembled: 'assembled',
      Cutaway: 'cutaway',
      Stations: 'stations',
      'One order': 'order',
      'One drive': 'order',
      assembled: 'assembled',
      cutaway: 'cutaway',
      stations: 'stations',
      order: 'order',
      drive: 'order',
    };

    const cameraAliases = {
      Overview: 'overview',
      Side: 'side',
      Top: 'top',
      Station: 'station',
      Flight: 'flight',
      overview: 'overview',
      side: 'side',
      top: 'top',
      station: 'station',
      flight: 'flight',
    };

    function setMode(name) {
      if (!Object.prototype.hasOwnProperty.call(modeAliases, name)) return false;
      const next = modeAliases[name];
      mode = next;
      lastInteraction = performance.now();
      if (mode === 'order') {
        simTime = 0;
        lastDraw = -1;
        play();
        cameraMode = 'overview';
      } else if (cameraMode === 'station') {
        cameraMode = 'overview';
      }
      setCameraGoal();
      cameraAnimating = true;
      syncButtons();
      return true;
    }

    function focusStation(id) {
      const targetId = String(id || '').toLowerCase();
      const s = stations.find((st) => st.id === targetId || st.legacyId === targetId);
      if (!s) return false;
      selected = s.id;
      if (mode === 'order') mode = 'assembled';
      cameraMode = 'station';
      lastInteraction = performance.now();
      setCameraGoal();
      cameraAnimating = true;
      syncButtons();
      return true;
    }

    function setCamera(name) {
      if (!Object.prototype.hasOwnProperty.call(cameraAliases, name)) return false;
      const next = cameraAliases[name];
      cameraMode = next;
      if (mode === 'order') mode = 'assembled';
      lastInteraction = performance.now();
      flightTime = 0;
      setCameraGoal();
      cameraAnimating = true;
      syncButtons();
      return true;
    }

    function syncPlayback() {
      const b = $('play');
      b.setAttribute('aria-label', playing ? 'Pause the animation' : 'Resume the animation');
      b.setAttribute('aria-pressed', String(!playing));
      b.innerHTML = playing
        ? '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="1" width="2.5" height="10" rx=".5"/><rect x="7.5" y="1" width="2.5" height="10" rx=".5"/></svg>'
        : '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 1l8 5-8 5z"/></svg>';
      $('status').classList.toggle('paused', !playing);
      $('status-text').textContent = playing ? 'Pipeline running' : 'Pipeline paused';
    }

    function play() {
      playing = true;
      syncPlayback();
      return true;
    }

    function pause() {
      playing = false;
      syncPlayback();
      return true;
    }

    // Live link with window.NeuroDrive
    function bindNeuroDriveLiveLink() {
      const nd = window.NeuroDrive;
      if (!nd) return;

      if (nd.state) {
        if (nd.state.generation) liveGeneration = nd.state.generation;
        if (nd.state.bestDistance) liveBestDistM = nd.state.bestDistance;
        if (nd.state.success !== undefined) liveSuccessRate = nd.state.success;
        drawEvolutionScreen(liveGeneration, liveBestDistM);
        drawBrainScreen(liveSuccessRate);
      }

      if (typeof nd.on === 'function') {
        const unsubGen = nd.on('generation', (info) => {
          const gen = (info && info.generation) || (nd.state && nd.state.generation) || liveGeneration + 1;
          const best =
            (info && info.best !== undefined ? info.best : nd.state && nd.state.bestDistance) || 0;
          const succ =
            info && info.success !== undefined
              ? info.success
              : nd.state && nd.state.success !== undefined
                ? nd.state.success
                : liveSuccessRate;

          liveGeneration = gen;
          liveBestDistM = best;
          liveSuccessRate = succ;

          // Pulse Evolution station (stations[4]) and repaint screens
          stations[4].pulseBoost = 4.2;
          drawEvolutionScreen(liveGeneration, liveBestDistM);
          drawBrainScreen(liveSuccessRate);
        });
        if (typeof unsubGen === 'function') cleanups.push(unsubGen);

        const unsubStats = nd.on('stats', (st) => {
          const s = st || nd.state;
          if (!s) return;
          if (s.success !== undefined && Math.abs(s.success - liveSuccessRate) > 0.01) {
            liveSuccessRate = s.success;
            drawBrainScreen(liveSuccessRate);
          }
        });
        if (typeof unsubStats === 'function') cleanups.push(unsubStats);
      }
    }
    bindNeuroDriveLiveLink();

    const api = { setMode, focusStation, setCamera, play, pause };
    window.__machine = api;
    cleanups.push(() => {
      if (window.__machine === api) delete window.__machine;
    });

    root
      .querySelectorAll('[data-mode]')
      .forEach((b) => listen(b, 'click', () => setMode(b.dataset.mode || '')));
    root
      .querySelectorAll('[data-camera]')
      .forEach((b) => listen(b, 'click', () => setCamera(b.dataset.camera || '')));
    listen($('play'), 'click', () => (playing ? pause() : play()));

    syncPlayback();
    layoutCamera();
    camera.position.copy(desiredPosition);
    controls.target.copy(desiredTarget);
    controls.update();
    cameraAnimating = false;

    listen(window, 'resize', layoutCamera);
    const resizeObserver = new ResizeObserver(() => layoutCamera());
    resizeObserver.observe(root);
    cleanups.push(() => resizeObserver.disconnect());

    controls.addEventListener('start', () => {
      dragging = true;
      cameraAnimating = false;
      lastInteraction = performance.now();
    });
    controls.addEventListener('end', () => {
      dragging = false;
      lastInteraction = performance.now();
    });
    controls.addEventListener('change', () => {
      if (dragging) lastInteraction = performance.now();
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const tooltip = $('tooltip');

    function hitStation(x, y) {
      pointer.set((x / width) * 2 - 1, (-y / height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickables, true);
      return hits.length ? stations.find((s) => s.id === hits[0].object.userData.station) : null;
    }

    listen(renderer.domElement, 'pointermove', (e) => {
      const rect = root.getBoundingClientRect();
      const lx = e.clientX - rect.left;
      const ly = e.clientY - rect.top;
      if (Math.hypot(lx - downX, ly - downY) > 5) wasDragged = true;
      if (dragging) return;
      const s = hitStation(lx, ly);
      hovered = s ? s.id : null;
      renderer.domElement.style.cursor = s ? 'pointer' : embedded && mobile ? 'default' : 'grab';
      tooltip.classList.toggle('visible', Boolean(s));
      if (s) {
        tooltip.querySelector('strong').innerHTML =
          `<span>${String(s.index + 1).padStart(2, '0')}</span>${s.name}`;
        tooltip.querySelector('p').textContent = s.desc;
        tooltip.style.left = Math.min(width - 255, Math.max(10, lx + 16)) + 'px';
        tooltip.style.top = Math.max(10, Math.min(height - 95, ly - 65)) + 'px';
      }
    });

    listen(renderer.domElement, 'pointerleave', () => {
      hovered = null;
      tooltip.classList.remove('visible');
    });

    listen(renderer.domElement, 'pointerdown', (e) => {
      const rect = root.getBoundingClientRect();
      downX = e.clientX - rect.left;
      downY = e.clientY - rect.top;
      wasDragged = false;
      tooltip.classList.remove('visible');
    });

    listen(renderer.domElement, 'pointerup', (e) => {
      if (wasDragged) return;
      const rect = root.getBoundingClientRect();
      const s = hitStation(e.clientX - rect.left, e.clientY - rect.top);
      if (!s) return;
      if (!embedded) {
        focusStation(s.id);
      }
      options.onStation?.(s.id);
    });

    let lastFrame = performance.now();
    listen(document, 'visibilitychange', () => {
      visible = !document.hidden;
      lastFrame = performance.now();
    });

    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting && !document.hidden;
        lastFrame = performance.now();
      },
      { threshold: 0.01 }
    );
    observer.observe(renderer.domElement);
    cleanups.push(() => observer.disconnect());

    listen(renderer.domElement, 'webglcontextlost', (e) => {
      e.preventDefault();
      contextLost = true;
    });
    listen(renderer.domElement, 'webglcontextrestored', () => {
      contextLost = false;
      $('error').style.display = 'none';
      lastFrame = performance.now();
    });

    const scratch = new THREE.Vector3();
    const anchor = new THREE.Vector3();
    const journeySteps = [
      ['01 · Map loaded', 'Map · Real OpenStreetMap Melbourne CBD streets'],
      ['02 · Computing A* route', 'Router · Flinders St Station → Queen Victoria Market (15 m)'],
      ['03 · Casting 7 lidar rays', 'Sensors · Road edges, traffic cars, trams & signals'],
      ['04 · Neural inference', 'Brain · 12–14–2 tanh network actuating steer & throttle'],
      ['05 · Breeding next generation', 'Evolution · Fittest driver cloned & mutated'],
    ];

    let prevJourney = -1;
    let rafId = 0;

    function animate(now) {
      rafId = requestAnimationFrame(animate);
      const dt = Math.max(0, Math.min((now - lastFrame) / 1000, 0.045));
      lastFrame = now;
      if (!visible || contextLost) return;

      if (playing) {
        simTime += dt;
        flightTime += dt;
      }
      const t = simTime;
      const beat = (t / 4) % 1;
      const tact = (t * TAU) / 4;
      const smooth = 1 - Math.exp(-dt * 5);

      spread = THREE.MathUtils.lerp(spread, mode === 'stations' ? 1 : 0, smooth);
      cutPlane.constant = THREE.MathUtils.lerp(
        cutPlane.constant,
        mode === 'cutaway' ? 0.99 : 10,
        smooth
      );

      stations.forEach((s, i) => {
        s.group.position.copy(s.base);
        s.group.position.x *= 1 + spread * 0.29;
        s.group.position.z *= 1 + spread * 0.37;
        s.group.position.y += spread * (i % 2 ? 0.32 : 0.55);

        if (s.pulseBoost > 0.01) {
          s.pulseBoost = Math.max(0, s.pulseBoost - dt * 2.2);
        }
        const pulse = Math.pow(Math.max(0, Math.sin(tact - i * 0.9)), 7);
        const targetGlow =
          hovered === s.id || (cameraMode === 'station' && selected === s.id)
            ? 1.15
            : 0.35 + pulse * 0.3 + Math.min(1.2, s.pulseBoost * 0.35);

        s.glowMat.emissiveIntensity = THREE.MathUtils.lerp(
          s.glowMat.emissiveIntensity,
          targetGlow,
          smooth
        );
      });

      belt.scale.set(1 + spread * 0.12, 1, 1 + spread * 0.15);
      pipes.scale.set(1 + spread * 0.25, 1, 1 + spread * 0.3);

      gears.forEach(({ g, vertical }, i) => {
        if (vertical) g.rotation.z = t * (i % 2 ? -1 : 1) * 1.1;
        else g.rotation.y = t * (i % 2 ? -1 : 1) * 1.1;
      });
      reels.forEach((r, i) => {
        r.rotation.z = -t * (i ? 0.65 : 0.85);
      });
      printhead.position.x = Math.sin(tact) * 0.42;
      printhead.position.y = 1.91 + Math.sin(tact * 2) * 0.055;
      outputMapCard.position.y = beat * 0.25;
      flyPost.position.y = Math.sin(tact) * 0.04;

      const orderPhase = (t / 24) % 1;
      const cashBeat =
        mode === 'order' ? THREE.MathUtils.clamp((orderPhase - 0.88) / 0.12, 0, 1) : beat;
      receipt.visible = coin.visible = mode !== 'order' || orderPhase > 0.88;
      receipt.scale.y = 0.2 + Math.min(1, cashBeat * 1.5) * 0.8;
      coin.position.set(1.04, 2.7 - Math.min(1, cashBeat * 1.7) ** 2 * 2.17, 0.55);
      coin.rotation.y = t * 3.5;
      coin.scale.setScalar(cashBeat > 0.9 ? 1 - (cashBeat - 0.9) * 8 : 1);

      const incomingBeat = mode === 'order' ? Math.min(1, orderPhase / 0.15) : beat;
      incoming.visible = mode !== 'order' || orderPhase < 0.15;
      incoming.position.set(
        Math.sin(incomingBeat * Math.PI) * 0.24,
        2.9 - incomingBeat * 1.9,
        1.1 - incomingBeat * 0.55
      );
      incoming.rotation.z = Math.sin(incomingBeat * Math.PI) * -0.14;
      incoming.scale.setScalar(
        Math.min(1, incomingBeat * 8 + 0.15, (1 - incomingBeat) * 7 + 0.1)
      );

      toggles.forEach((o, i) => {
        o.rotation.x = Math.sin(tact + i) > 0 ? -0.4 : 0.4;
      });

      if (t - lastDraw > 1 / 18 || lastDraw < 0) {
        drawMapScreen(t);
        drawRouterScreen(t);
        routerTex.texture.needsUpdate = true;
        updateBelt(t);
        lastDraw = t;
      }

      packets.forEach((packet, i) => {
        const phase = (t / 24 + i / 6) % 1;
        packet.phase = phase;
        let stage;
        if (phase < 0.15) {
          stage = 0;
          const f = phase / 0.15;
          packet.group.position.copy(stations[3].group.position).add(new THREE.Vector3(0, 1.6, 0.6));
          scratch.copy(stations[0].group.position).add(new THREE.Vector3(0, 1.3, 0.65));
          packet.group.position.lerp(scratch, f);
          packet.group.position.y += Math.sin(f * Math.PI) * 2;
          packet.group.rotation.set(0, Math.sin(f * Math.PI) * 0.28, Math.sin(f * Math.PI) * -0.1);
        } else {
          const u = ((phase - 0.15) / 0.85) * cashU;
          path.getPointAt(u, packet.group.position);
          packet.group.position.x *= 1 + spread * 0.12;
          packet.group.position.z *= 1 + spread * 0.15;
          packet.group.position.y += 0.43;
          packet.group.rotation.set(0, 0.18, 0);
          stage = u < adminU * 0.7 ? 1 : u < storeU * 0.96 ? 2 : u < cashU * 0.83 ? 3 : 4;
        }
        if (packet.stage !== stage) {
          packet.faces.forEach((f, j) => {
            f.visible = j === stage;
          });
          packet.stage = stage;
        }
        packet.group.visible = mode !== 'order' || i === 0;
        packet.halo.visible = mode === 'order' && i === 0;
        packet.group.scale.setScalar(mode === 'order' ? 1.35 : 1);
        if (phase > 0.94) packet.group.scale.multiplyScalar(Math.max(0.05, (1 - phase) / 0.06));
      });

      if (mode === 'order') {
        const packet = packets[0];
        const step = packet.stage;
        if (step !== prevJourney && journeySteps[step]) {
          $('journey-title').textContent = journeySteps[step][0];
          $('journey-detail').textContent = journeySteps[step][1];
          prevJourney = step;
        }
        $('journey-progress').style.width = packet.phase * 100 + '%';
        if (!dragging && playing) {
          desiredTarget.copy(packet.group.position);
          desiredPosition.copy(desiredTarget).addScaledVector(viewDirection, mobile ? 10 : 15);
          cameraAnimating = true;
        }
      } else if (cameraMode === 'flight' && playing && !dragging) {
        const a = flightTime * 0.12;
        const d = baseDistance * (mode === 'stations' ? 1.2 : 1);
        desiredTarget.set(0, 1, 0);
        desiredPosition
          .set(
            Math.sin(a + 0.55) * d * 0.83,
            d * (0.5 + Math.sin(a * 0.7) * 0.09),
            Math.cos(a + 0.55) * d * 0.83
          )
          .add(desiredTarget);
        cameraAnimating = true;
      } else if (cameraMode === 'station' && cameraAnimating) {
        setCameraGoal();
      }

      if (cameraAnimating && !dragging) {
        const speed = 1 - Math.exp(-dt * (mode === 'order' ? 2.2 : 3));
        camera.position.lerp(desiredPosition, speed);
        controls.target.lerp(desiredTarget, speed);
        if (
          cameraMode !== 'flight' &&
          mode !== 'order' &&
          camera.position.distanceTo(desiredPosition) < 0.015 &&
          controls.target.distanceTo(desiredTarget) < 0.015
        ) {
          cameraAnimating = false;
        }
      }

      controls.autoRotate =
        playing &&
        !reduceMotion &&
        !dragging &&
        !cameraAnimating &&
        mode !== 'order' &&
        cameraMode === 'overview' &&
        (!embedded || !mobile) &&
        now - lastInteraction > (embedded ? 500 : 6500);
      controls.autoRotateSpeed = 0.28;
      controls.update(dt);

      stations.forEach((s, i) => {
        const show = mode === 'stations';
        s.label.classList.toggle('visible', show);
        if (!show) return;
        anchor.copy(s.group.position).add(s.anchor).project(camera);
        const offsets = mobile
          ? [
              [-30, 25],
              [-27, -50],
              [15, -65],
              [16, -1],
              [-5, 52],
            ]
          : [
              [-48, -14],
              [-8, -64],
              [30, -12],
              [30, 20],
              [-12, 40],
            ];
        let x = (anchor.x * 0.5 + 0.5) * width - 40 + offsets[i][0];
        let y = (-anchor.y * 0.5 + 0.5) * height - 52 + offsets[i][1];
        x = THREE.MathUtils.clamp(
          x,
          mobile || !embedded ? 9 : width * 0.425,
          width - (mobile ? 123 : 165)
        );
        y = THREE.MathUtils.clamp(y, 130, height - 200);
        s.label.style.transform = `translate(${x}px,${y}px)`;
      });

      renderer.render(scene, camera);

      if (!readySent && sized) {
        readySent = true;
        options.onReady?.();
      }
    }

    rafId = requestAnimationFrame(animate);
    cleanups.push(() => {
      cancelAnimationFrame(rafId);
      controls.dispose();
      const textures = new Set();
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        const list = object.material
          ? Array.isArray(object.material)
            ? object.material
            : [object.material]
          : [];
        for (const material of list) {
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) textures.add(value);
          }
          material.dispose();
        }
      });
      geometries.forEach((g) => g.dispose());
      textures.forEach((t) => t.dispose());
      env.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    });

    renderer.compile(scene, camera);
    $('loading').classList.add('done');
    $('error').style.display = 'none';
  } catch (error) {
    console.error('NeuroDrive 3D Machine failed to start:', error);
    showError();
    options.onError?.(error);
  }

  return dispose;
}
