// NeuroDrive v2 — Melbourne CBD UI, HUD, Scenario Picker & Sparkline Controller (Antigravity)
// Consumes window.NeuroDrive per SPEC.md (v2) without importing engine files.
// Feature-detects window.NeuroDrive and falls back to a Melbourne CBD mock world if engine is absent.

const REDUCED_MOTION_QUERY = window.matchMedia('(prefers-reduced-motion: reduce)');

function prefersReducedMotion() {
  return REDUCED_MOTION_QUERY.matches;
}

const DEFAULT_SCENARIOS = [
  {
    id: 1,
    name: 'Swanston St Sprint',
    description: 'Straight 1-block run north along Swanston Street.',
    difficulty: 'Easy',
  },
  {
    id: 2,
    name: 'Collins Intersection Turn',
    description: 'Single Hoddle Grid turn from Swanston onto Collins St.',
    difficulty: 'Medium',
  },
  {
    id: 3,
    name: 'Flinders to Queen Vic Market',
    description: 'Multi-turn A* route from Flinders St Station to QVM.',
    difficulty: 'Hard',
  },
  {
    id: 4,
    name: 'Peak Hour & Signals',
    description: 'Flinders St to QVM with active traffic and signal cycles.',
    difficulty: 'Expert',
  },
  {
    id: 5,
    name: 'Grand Melbourne CBD Loop',
    description: 'Full Hoddle Grid circuit including one-way Little streets.',
    difficulty: 'Master',
  },
];

const MOCK_SCENARIO_ROUTES = {
  1: {
    destination: { name: 'Bourke St Mall', x: 0, y: -40 },
    route: [[0, 420], [0, 300], [0, 180], [0, 60], [0, -40]],
    street: 'Swanston Street',
    limitKmh: 40,
  },
  2: {
    destination: { name: 'Collins & Elizabeth', x: -220, y: 180 },
    route: [[0, 420], [0, 300], [0, 180], [-110, 180], [-220, 180]],
    street: 'Collins Street',
    limitKmh: 40,
  },
  3: {
    destination: { name: 'Queen Victoria Market', x: -340, y: -455 },
    route: [[0, 420], [0, 180], [0, -40], [0, -220], [-220, -220], [-220, -390], [-340, -455]],
    street: 'Elizabeth Street',
    limitKmh: 40,
  },
  4: {
    destination: { name: 'Queen Victoria Market', x: -340, y: -455 },
    route: [[0, 420], [0, 180], [-220, 180], [-220, -40], [-220, -220], [-220, -390], [-340, -455]],
    street: 'Swanston Street',
    limitKmh: 40,
  },
  5: {
    destination: { name: 'Flinders Street Station', x: 0, y: 420 },
    route: [[0, 420], [220, 420], [220, -220], [-220, -220], [-220, 420], [0, 420]],
    street: 'Russell Street',
    limitKmh: 40,
  },
};

/**
 * Fallback mock implementation of window.NeuroDrive (v2 Melbourne CBD contract)
 * Used only when js/main.js has not attached window.NeuroDrive.
 */
function createMockNeuroDrive() {
  const listeners = {
    stats: new Set(),
    generation: new Set(),
    brain: new Set(),
    scenario: new Set(),
  };

  const mockWorld =
    window.MapView && typeof window.MapView.createMockMelbourneWorld === 'function'
      ? window.MapView.createMockMelbourneWorld()
      : null;

  if (window.MapView && mockWorld && !window.MapView.world) {
    window.MapView.init(mockWorld);
  }

  let viewMode = 'follow';
  let cameraZoom = 1.65;

  const state = {
    generation: 1,
    alive: 100,
    population: 100,
    bestDistance: 0,
    history: [145, 290, 460, 620],
    paused: false,
    mutation: 0.1,
    traffic: 0.5,
    signalsOn: true,
    scenarioId: 1,
    success: 0.38,
    car: {
      x: 0,
      y: 420,
      headingDeg: -90,
      speedKmh: 36,
      street: 'Swanston Street',
      limitKmh: 40,
      routeProgress: 0,
    },
    route: MOCK_SCENARIO_ROUTES[1].route,
    destination: MOCK_SCENARIO_ROUTES[1].destination,
    scenarios: DEFAULT_SCENARIOS,
  };

  function emit(event, payload) {
    const set = listeners[event];
    if (!set) return;
    set.forEach((fn) => {
      try {
        fn(payload !== undefined ? payload : state);
      } catch (err) {
        console.error(`[NeuroDrive Mock] Listener error (${event}):`, err);
      }
    });
  }

  function applyScenario(id) {
    const numId = Number(id) || 1;
    const cfg = MOCK_SCENARIO_ROUTES[numId] || MOCK_SCENARIO_ROUTES[1];
    state.scenarioId = numId;
    state.route = cfg.route;
    state.destination = cfg.destination;
    state.car.x = cfg.route[0][0];
    state.car.y = cfg.route[0][1];
    state.car.street = cfg.street;
    state.car.limitKmh = cfg.limitKmh;
    state.car.routeProgress = 0;
    state.bestDistance = 0;
    emit('scenario', { id: numId });
    emit('stats', state);
  }

  // 10/s telemetry updater
  let progressT = 0;
  setInterval(() => {
    if (state.paused) return;
    progressT += 0.025;

    const pts = state.route;
    if (pts && pts.length >= 2) {
      const segCount = pts.length - 1;
      const scaled = Math.min(segCount - 0.001, (progressT % 1) * segCount);
      const idx = Math.floor(scaled);
      const frac = scaled - idx;
      const p0 = pts[idx];
      const p1 = pts[idx + 1];
      state.car.x = p0[0] + (p1[0] - p0[0]) * frac;
      state.car.y = p0[1] + (p1[1] - p0[1]) * frac;
      state.car.headingDeg = (Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180) / Math.PI;
      state.car.routeProgress = Math.min(1, progressT % 1);
      state.car.speedKmh = Math.round(31 + Math.sin(progressT * 6) * 7);
      state.bestDistance = Math.round(state.car.routeProgress * 680);
    }

    if (progressT >= 1) {
      progressT = 0;
      state.history.push(state.bestDistance);
      if (state.history.length > 40) state.history.shift();
      state.generation += 1;
      state.success = Math.min(0.95, +(0.25 + state.generation * 0.06).toFixed(2));
      state.alive = state.population;
      emit('generation', {
        generation: state.generation,
        best: state.bestDistance,
        success: state.success,
        history: state.history,
      });
    } else if (state.alive > 12) {
      state.alive = Math.max(12, state.alive - (Math.random() < 0.35 ? 1 : 0));
    }

    emit('stats', state);
  }, 100);

  // Mock 60 fps canvas loop on #road if engine is absent
  const roadCanvas = document.getElementById('road');
  if (roadCanvas && window.MapView) {
    const ctx = roadCanvas.getContext('2d');
    function renderMockFrame() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = roadCanvas.getBoundingClientRect();
      const w = Math.max(300, Math.floor(rect.width || roadCanvas.width || 760));
      const h = Math.max(300, Math.floor(rect.height || roadCanvas.height || 640));
      if (roadCanvas.width !== w * dpr || roadCanvas.height !== h * dpr) {
        roadCanvas.width = w * dpr;
        roadCanvas.height = h * dpr;
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cam = {
        x: viewMode === 'overview' ? 0 : state.car.x,
        y: viewMode === 'overview' ? 0 : state.car.y,
        zoom: viewMode === 'overview' ? 0.52 : cameraZoom,
        rotation: 0,
        w,
        h,
      };

      window.MapView.drawBase(ctx, cam);

      // Draw Best Car in Mint (no glow)
      ctx.save();
      ctx.translate(w * 0.5, h * 0.5);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);

      ctx.save();
      ctx.translate(state.car.x, state.car.y);
      ctx.rotate((state.car.headingDeg * Math.PI) / 180);
      ctx.fillStyle = '#88F9C0';
      ctx.beginPath();
      ctx.roundRect(-2.25, -0.95, 4.5, 1.9, 0.4);
      ctx.fill();
      ctx.restore();
      ctx.restore();

      const mockSignals = ((mockWorld && mockWorld.signals) || []).map((s, idx) => ({
        x: s.x,
        y: s.y,
        state: !state.signalsOn
          ? 'green'
          : idx % 3 === 0
            ? 'green'
            : idx % 3 === 1
              ? 'amber'
              : 'red',
      }));

      window.MapView.drawOverlay(ctx, cam, {
        route: state.route,
        destination: state.destination,
        signals: mockSignals,
      });

      ctx.restore();
      requestAnimationFrame(renderMockFrame);
    }
    requestAnimationFrame(renderMockFrame);
  }

  return {
    __isMock: true,
    state,
    on(event, fn) {
      if (!listeners[event]) listeners[event] = new Set();
      listeners[event].add(fn);
      return () => listeners[event].delete(fn);
    },
    actions: {
      start() {
        state.paused = false;
        emit('stats', state);
      },
      pause() {
        state.paused = true;
        emit('stats', state);
      },
      reset() {
        state.generation = 1;
        state.alive = state.population;
        state.bestDistance = 0;
        state.history = [];
        progressT = 0;
        emit('stats', state);
      },
      saveBrain() {
        try {
          localStorage.setItem(
            'neurodrive.brain.v2',
            JSON.stringify({ savedAt: Date.now(), generation: state.generation })
          );
        } catch (_) {
          // ignore storage quota errors
        }
        emit('brain', { action: 'saved', ok: true });
      },
      loadBrain() {
        emit('brain', { action: 'loaded', ok: true });
      },
      discardBrain() {
        try {
          localStorage.removeItem('neurodrive.brain.v2');
        } catch (_) {
          // ignore
        }
        emit('brain', { action: 'discarded', ok: true });
      },
      setMutation(val) {
        state.mutation = Math.max(0, Math.min(1, Number(val) || 0));
        emit('stats', state);
      },
      setPopulation(n) {
        state.population = Number(n) || 100;
        state.alive = Math.min(state.alive, state.population);
        emit('stats', state);
      },
      setTraffic(val) {
        state.traffic = Math.max(0, Math.min(1, Number(val) || 0));
        emit('stats', state);
      },
      setSignals(bool) {
        state.signalsOn = Boolean(bool);
        emit('stats', state);
      },
      setScenario(id) {
        applyScenario(id);
      },
      setView(mode) {
        viewMode = mode === 'overview' ? 'overview' : 'follow';
        emit('stats', state);
      },
      zoom(delta) {
        const d = Number(delta) || 0;
        const factor = d > 0 ? 1.22 : 0.82;
        cameraZoom = Math.max(0.35, Math.min(6, cameraZoom * factor));
      },
    },
  };
}

/**
 * IntersectionObserver fade-up entrance animations
 */
function initScrollReveal() {
  const elements = document.querySelectorAll('.fade-up');
  if (!elements.length) return;

  if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
    elements.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  document.documentElement.classList.add('js-motion');

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -24px 0px' }
  );

  elements.forEach((el) => observer.observe(el));
}

/**
 * Sparkline renderer on <canvas id="spark"> (distances in metres)
 */
function createSparklineRenderer(canvas) {
  if (!canvas) return () => {};
  const ctx = canvas.getContext('2d');

  function getPalette() {
    const styles = getComputedStyle(document.documentElement);
    return {
      indigo: styles.getPropertyValue('--indigo').trim() || '#6331FB',
      mint: styles.getPropertyValue('--mint').trim() || '#88F9C0',
    };
  }

  return function renderSparkline(history = [], currentDistance = 0) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(150, Math.floor(rect.width || canvas.width || 260));
    const height = Math.max(44, Math.floor(rect.height || canvas.height || 60));

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const { indigo, mint } = getPalette();
    const series = Array.isArray(history) ? history.filter((n) => Number.isFinite(n)) : [];
    const points =
      series.length >= 2
        ? [...series]
        : [0, ...(series.length === 1 ? series : []), Math.max(0, Number(currentDistance) || 0)];

    const padX = 7;
    const padY = 9;
    const plotW = width - padX * 2;
    const plotH = height - padY * 2;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, height - padY);
    ctx.lineTo(width - padX, height - padY);
    ctx.stroke();

    const minVal = Math.min(0, ...points);
    const maxVal = Math.max(50, ...points);
    const range = Math.max(1, maxVal - minVal);

    const coords = points.map((val, idx) => {
      const x = padX + (idx / Math.max(1, points.length - 1)) * plotW;
      const norm = (val - minVal) / range;
      const y = padY + plotH - norm * plotH;
      return { x, y };
    });

    // Restrained 1px white-grey line (no area fill, no glow)
    ctx.beginPath();
    coords.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.46)';
    ctx.lineWidth = 1;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.stroke();

    // Single mint end-point dot
    const last = coords[coords.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = mint;
    ctx.fill();

    ctx.restore();
  };
}

/**
 * Initialize NeuroDrive v2 UI
 */
function initNeuroDriveUI() {
  initScrollReveal();

  if (window.Minimap && typeof window.Minimap.init === 'function') {
    window.Minimap.init();
  }

  const api = window.NeuroDrive || (window.NeuroDrive = createMockNeuroDrive());

  // Stat Card Elements
  const elGen = document.getElementById('stat-generation');
  const elAlive = document.getElementById('stat-alive');
  const elPop = document.getElementById('stat-population');
  const elAlivePct = document.getElementById('stat-alive-pct');
  const elAliveBar = document.getElementById('alive-progress-bar');
  const elDist = document.getElementById('stat-distance');
  const elPeakNote = document.getElementById('stat-peak-note');
  const elSuccess = document.getElementById('stat-success');
  const elSuccessRing = document.getElementById('success-ring-circle');
  const elSparkSummary = document.getElementById('spark-Summary');
  const elEngineLabel = document.getElementById('engine-status-label');
  const elSimIndicator = document.getElementById('sim-indicator');
  const elToast = document.getElementById('toast-feedback');

  // HUD Overlay Elements
  const elHudSpeed = document.getElementById('hud-speed');
  const elHudLimit = document.getElementById('hud-limit');
  const elHudStreet = document.getElementById('hud-street');
  const elHudSignalDot = document.getElementById('hud-signal-dot');
  const elHudSignalText = document.getElementById('hud-signal-text');
  const elHudDest = document.getElementById('hud-destination');
  const elHudRoutePct = document.getElementById('hud-route-pct');
  const elHudRouteBar = document.getElementById('hud-route-fill') || document.getElementById('hud-route-bar');

  // Minimap Collapse Toggle (responsive 375px support)
  const elMinimapContainer = document.getElementById('minimap-container');
  const btnMinimapToggle = document.getElementById('btn-minimap-toggle');

  // Scenario Grid
  const elScenarioGrid = document.getElementById('scenario-grid');

  // Control Panel Elements
  const btnStartPause = document.getElementById('btn-start-pause');
  const btnStartPauseText = document.getElementById('btn-start-pause-text');
  const btnReset = document.getElementById('btn-reset');
  const btnSave = document.getElementById('btn-save');
  const btnLoad = document.getElementById('btn-load');
  const btnDiscard = document.getElementById('btn-discard');
  const heroCta = document.getElementById('hero-cta');

  const btnToggleTraffic = document.getElementById('toggle-traffic');
  const btnToggleSignals = document.getElementById('toggle-signals');
  const btnToggleView = document.getElementById('toggle-view');
  const elToggleViewLabel = document.getElementById('toggle-view-label');

  const sliderMutation = document.getElementById('slider-mutation');
  const valMutation = document.getElementById('val-mutation');
  const sliderTraffic = document.getElementById('slider-traffic');
  const valTraffic = document.getElementById('val-traffic');

  const popButtons = document.querySelectorAll('[data-population]');
  const viewButtons = document.querySelectorAll('[data-view]');
  const btnZoomInHud = document.getElementById('btn-zoom-in');
  const btnZoomOutHud = document.getElementById('btn-zoom-out');
  const btnZoomInPanel = document.getElementById('panel-zoom-in');
  const btnZoomOutPanel = document.getElementById('panel-zoom-out');

  const sparkCanvas = document.getElementById('spark');
  const renderSparkline = createSparklineRenderer(sparkCanvas);

  if (elEngineLabel) {
    elEngineLabel.textContent = api.__isMock ? 'Mock Melbourne Grid' : 'Live CBD Grid';
  }

  // Collapse minimap by default on compact mobile screens (<= 540px)
  if (elMinimapContainer && btnMinimapToggle) {
    if (window.innerWidth <= 540) {
      elMinimapContainer.classList.add('is-collapsed');
      btnMinimapToggle.setAttribute('aria-expanded', 'false');
      btnMinimapToggle.textContent = 'Map';
    }
    btnMinimapToggle.addEventListener('click', () => {
      const collapsed = elMinimapContainer.classList.toggle('is-collapsed');
      btnMinimapToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      btnMinimapToggle.textContent = collapsed ? 'Map' : 'Hide';
      if (!collapsed && window.Minimap) {
        window.Minimap.render(api.state);
      }
    });
  }

  // Toast feedback helper
  let toastTimer = null;
  function showToast(msg) {
    if (!elToast) return;
    elToast.textContent = msg;
    elToast.classList.add('is-highlight');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      elToast.classList.remove('is-highlight');
    }, 1800);
  }

  // Animated Counters
  const counterTarget = { generation: 1, alive: 100, bestDistance: 0 };
  const counterDisplay = { generation: 1, alive: 100, bestDistance: 0 };
  let counterRaf = null;
  let allTimePeakM = 0;
  let activeViewMode = 'follow';
  let lastSavedTraffic = 0.5;
  let renderedScenarioCount = 0;

  function flushCounterDOM() {
    if (elGen) elGen.textContent = Math.round(counterDisplay.generation).toLocaleString();
    if (elAlive) elAlive.textContent = Math.round(counterDisplay.alive).toLocaleString();
    if (elDist) elDist.textContent = Math.round(counterDisplay.bestDistance).toLocaleString();
  }

  function stepCounters() {
    if (prefersReducedMotion()) {
      counterDisplay.generation = counterTarget.generation;
      counterDisplay.alive = counterTarget.alive;
      counterDisplay.bestDistance = counterTarget.bestDistance;
      flushCounterDOM();
      counterRaf = null;
      return;
    }

    let more = false;
    ['generation', 'alive', 'bestDistance'].forEach((k) => {
      const diff = counterTarget[k] - counterDisplay[k];
      if (Math.abs(diff) > 0.4) {
        counterDisplay[k] += diff * 0.28;
        more = true;
      } else {
        counterDisplay[k] = counterTarget[k];
      }
    });

    flushCounterDOM();
    counterRaf = more ? requestAnimationFrame(stepCounters) : null;
  }

  function scheduleCounters() {
    if (prefersReducedMotion()) {
      stepCounters();
      return;
    }
    if (!counterRaf) {
      counterRaf = requestAnimationFrame(stepCounters);
    }
  }

  function difficultyLevel(diffStr, idx) {
    const s = String(diffStr || '').toLowerCase();
    if (s.includes('easy') || s === '1') return 1;
    if (s.includes('med') || s === '2') return 2;
    if (s.includes('hard') || s.includes('expert') || s.includes('master') || s === '3') return 3;
    return Math.min(3, Math.max(1, Math.ceil((idx + 1) / 2)));
  }

  // Render Compact Scenario Curriculum Table with 3-Bar Difficulty Indicator
  function renderScenarioPicker(scenarios, activeId) {
    if (!elScenarioGrid) return;
    const list = Array.isArray(scenarios) && scenarios.length ? scenarios : DEFAULT_SCENARIOS;

    if (renderedScenarioCount !== list.length) {
      elScenarioGrid.innerHTML = '';
      list.forEach((sc, idx) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'scenario-row';
        row.setAttribute('role', 'radio');
        row.dataset.scenarioId = String(sc.id);

        const num = document.createElement('span');
        num.className = 'sc-index';
        num.textContent = `0${idx + 1}`;

        const name = document.createElement('span');
        name.className = 'sc-name';
        name.textContent = sc.name || `Scenario ${sc.id}`;

        const desc = document.createElement('span');
        desc.className = 'sc-desc';
        desc.textContent = sc.description || '';

        const level = difficultyLevel(sc.difficulty, idx);
        const bars = document.createElement('span');
        bars.className = 'diff-bars';
        bars.title = sc.difficulty ? `Difficulty: ${sc.difficulty}` : `Level ${level}`;
        bars.setAttribute('aria-label', bars.title);
        for (let b = 1; b <= 3; b++) {
          const bar = document.createElement('span');
          bar.className = b <= level ? 'diff-bar is-filled' : 'diff-bar';
          bars.appendChild(bar);
        }

        row.appendChild(num);
        row.appendChild(name);
        row.appendChild(desc);
        row.appendChild(bars);

        row.addEventListener('click', () => {
          api.actions?.setScenario?.(sc.id);
          showToast(`SCENARIO 0${idx + 1} · ${sc.name.toUpperCase()}`);
          syncFromState(api.state);
        });

        elScenarioGrid.appendChild(row);
      });
      renderedScenarioCount = list.length;
    }

    const rows = elScenarioGrid.querySelectorAll('.scenario-row');
    rows.forEach((row) => {
      const match = String(row.dataset.scenarioId) === String(activeId);
      row.classList.toggle('is-active', match);
      row.setAttribute('aria-checked', match ? 'true' : 'false');
    });
  }

  // Sync UI with NeuroDrive.state
  function syncFromState(rawState) {
    const s =
      rawState && typeof rawState === 'object' && 'generation' in rawState
        ? rawState
        : api.state || {};

    const generation = Number(s.generation) || 1;
    const population = Number(s.population) || 100;
    const alive = s.alive !== undefined ? Number(s.alive) : population;
    const bestDistance = Math.max(0, Math.round(Number(s.bestDistance) || 0));
    const history = Array.isArray(s.history) ? s.history : [];
    const paused = Boolean(s.paused);
    const mutation = s.mutation !== undefined ? Number(s.mutation) : 0.1;
    const traffic = s.traffic !== undefined ? Number(s.traffic) : 0.5;
    const signalsOn = s.signalsOn !== undefined ? Boolean(s.signalsOn) : true;
    const scenarioId = s.scenarioId !== undefined ? s.scenarioId : 1;
    const success = Math.max(0, Math.min(1, Number(s.success) || 0));
    const car = s.car || {};
    const destination = s.destination || { name: 'Melbourne CBD' };
    const scenarios = s.scenarios || DEFAULT_SCENARIOS;

    // 1. Stat Counters
    counterTarget.generation = generation;
    counterTarget.alive = alive;
    counterTarget.bestDistance = bestDistance;
    scheduleCounters();

    if (elPop) elPop.textContent = String(population);
    const alivePct = population > 0 ? Math.max(0, Math.min(100, Math.round((alive / population) * 100))) : 0;
    if (elAlivePct) elAlivePct.textContent = `${alivePct}%`;
    if (elAliveBar) elAliveBar.style.width = `${alivePct}%`;

    const histMax = history.length ? Math.max(...history) : 0;
    allTimePeakM = Math.max(allTimePeakM, histMax, bestDistance);
    if (elPeakNote) {
      elPeakNote.textContent = `Peak: ${Math.round(allTimePeakM).toLocaleString()} m`;
    }

    // 2. Success Rate Thin 2px Arc (circumference = 2 * pi * 17 ≈ 106.81)
    const successPct = Math.round(success * 100);
    if (elSuccess) elSuccess.textContent = `${successPct}%`;
    if (elSuccessRing) {
      const circum = 106.81;
      const offset = circum - (successPct / 100) * circum;
      elSuccessRing.style.strokeDashoffset = String(offset);
    }

    // 3. Sparkline
    if (elSparkSummary) {
      elSparkSummary.textContent = history.length
        ? `${history.length} GEN${history.length === 1 ? '' : 'S'}`
        : 'LIVE';
    }
    renderSparkline(history, bestDistance);

    // 4. Live HUD over #road
    const speedKmh = Math.max(0, Math.round(Number(car.speedKmh) || 0));
    const limitKmh = Math.max(10, Math.round(Number(car.limitKmh) || 40));
    const streetName = car.street || 'Melbourne CBD Grid';
    const routeProgressPct = Math.max(
      0,
      Math.min(100, Math.round((Number(car.routeProgress) || 0) * 100))
    );

    if (elHudSpeed) elHudSpeed.textContent = String(speedKmh);
    if (elHudLimit) elHudLimit.textContent = String(limitKmh);
    if (elHudStreet) elHudStreet.textContent = streetName;
    if (elHudDest) elHudDest.textContent = destination.name || 'Destination';
    if (elHudRoutePct) elHudRoutePct.textContent = `${routeProgressPct}%`;
    if (elHudRouteBar) elHudRouteBar.style.width = `${routeProgressPct}%`;

    if (elHudSignalDot && elHudSignalText) {
      elHudSignalDot.className = 'signal-lamp';
      if (!signalsOn) {
        elHudSignalDot.classList.add('signal-amber');
        elHudSignalText.textContent = 'Signals Off';
      } else {
        const nextState = car.nextSignalState || 'green';
        elHudSignalDot.classList.add(`signal-${nextState}`);
        elHudSignalText.textContent =
          nextState === 'red'
            ? 'Red Signal Ahead'
            : nextState === 'amber'
              ? 'Amber Signal'
              : 'Signals Active';
      }
    }

    // 5. Scenarios
    renderScenarioPicker(scenarios, scenarioId);

    // 6. Controls & Sliders
    if (btnStartPause && btnStartPauseText) {
      btnStartPause.setAttribute('aria-pressed', paused ? 'true' : 'false');
      btnStartPauseText.textContent = paused ? 'Start' : 'Pause';
    }
    if (elSimIndicator) {
      elSimIndicator.classList.toggle('is-paused', paused);
    }

    if (sliderMutation && document.activeElement !== sliderMutation) {
      sliderMutation.value = String(mutation);
    }
    if (valMutation) valMutation.textContent = `${Math.round(mutation * 100)}%`;

    if (sliderTraffic && document.activeElement !== sliderTraffic) {
      sliderTraffic.value = String(traffic);
    }
    if (valTraffic) valTraffic.textContent = `${Math.round(traffic * 100)}%`;

    const trafficActive = traffic > 0.01;
    if (btnToggleTraffic) {
      btnToggleTraffic.classList.toggle('is-on', trafficActive);
      btnToggleTraffic.setAttribute('aria-pressed', trafficActive ? 'true' : 'false');
    }

    if (btnToggleSignals) {
      btnToggleSignals.classList.toggle('is-on', signalsOn);
      btnToggleSignals.setAttribute('aria-pressed', signalsOn ? 'true' : 'false');
    }

    popButtons.forEach((btn) => {
      const match = Number(btn.dataset.population) === population;
      btn.classList.toggle('is-active', match);
      btn.setAttribute('aria-checked', match ? 'true' : 'false');
    });
  }

  // Subscribe to NeuroDrive events
  if (typeof api.on === 'function') {
    api.on('stats', (payload) => syncFromState(payload));
    api.on('generation', (info) => {
      syncFromState(api.state);
      const gen = (info && info.generation) || (api.state && api.state.generation) || 1;
      showToast(`Generation ${gen} · Best ${Math.round((info && info.best) || 0)} m`);
    });
    api.on('brain', (info) => {
      const act =
        typeof info === 'string'
          ? info
          : (info && (info.action || info.type)) || 'updated';
      showToast(`Brain ${act}`);
      syncFromState(api.state);
    });
    api.on('scenario', (info) => {
      syncFromState(api.state);
      const id = (info && info.id) || (api.state && api.state.scenarioId) || 1;
      showToast(`Scenario ${id} active`);
    });
  }

  // Camera View Mode Helper
  function setCameraView(mode) {
    activeViewMode = mode === 'overview' ? 'overview' : 'follow';
    api.actions?.setView?.(activeViewMode);

    viewButtons.forEach((btn) => {
      const match = btn.dataset.view === activeViewMode;
      btn.classList.toggle('is-active', match);
      if (btn.getAttribute('role') === 'radio') {
        btn.setAttribute('aria-checked', match ? 'true' : 'false');
      }
    });

    if (btnToggleView && elToggleViewLabel) {
      const isOverview = activeViewMode === 'overview';
      btnToggleView.classList.toggle('is-on', isOverview);
      btnToggleView.setAttribute('aria-pressed', isOverview ? 'true' : 'false');
      elToggleViewLabel.textContent = isOverview ? 'All' : 'Follow';
    }

    showToast(`Camera: ${activeViewMode === 'overview' ? 'CBD Overview' : 'Follow Leader'}`);
  }

  // Toggle Pause / Start
  function togglePause() {
    const isPaused = Boolean(api.state && api.state.paused);
    if (isPaused) {
      api.actions?.start?.();
      showToast('Training resumed');
    } else {
      api.actions?.pause?.();
      showToast('Simulation paused');
    }
    syncFromState(api.state);
  }

  // Wire Buttons
  btnStartPause?.addEventListener('click', togglePause);

  btnReset?.addEventListener('click', () => {
    allTimePeakM = 0;
    api.actions?.reset?.();
    showToast('Simulation reset');
    syncFromState(api.state);
  });

  btnSave?.addEventListener('click', () => {
    api.actions?.saveBrain?.();
    showToast('Brain saved to storage');
  });

  btnLoad?.addEventListener('click', () => {
    api.actions?.loadBrain?.();
    showToast('Saved brain loaded');
    syncFromState(api.state);
  });

  btnDiscard?.addEventListener('click', () => {
    api.actions?.discardBrain?.();
    showToast('Saved brain discarded');
  });

  heroCta?.addEventListener('click', () => {
    if (api.state && api.state.paused) {
      api.actions?.start?.();
      syncFromState(api.state);
    }
  });

  // Wire Toggles: Traffic, Signals, View
  btnToggleTraffic?.addEventListener('click', () => {
    const current = Number(api.state && api.state.traffic) || 0;
    if (current > 0.01) {
      lastSavedTraffic = current;
      api.actions?.setTraffic?.(0);
      showToast('Traffic disabled');
    } else {
      const restore = lastSavedTraffic > 0.05 ? lastSavedTraffic : 0.5;
      api.actions?.setTraffic?.(restore);
      showToast(`Traffic ${Math.round(restore * 100)}%`);
    }
    syncFromState(api.state);
  });

  btnToggleSignals?.addEventListener('click', () => {
    const next = !(api.state && api.state.signalsOn);
    api.actions?.setSignals?.(next);
    showToast(next ? 'Traffic signals enabled' : 'Traffic signals paused');
    syncFromState(api.state);
  });

  btnToggleView?.addEventListener('click', () => {
    setCameraView(activeViewMode === 'follow' ? 'overview' : 'follow');
  });

  viewButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.view) {
        setCameraView(btn.dataset.view);
      }
    });
  });

  // Wire Zoom +/-
  function handleZoom(delta) {
    api.actions?.zoom?.(delta);
  }
  btnZoomInHud?.addEventListener('click', () => handleZoom(1));
  btnZoomOutHud?.addEventListener('click', () => handleZoom(-1));
  btnZoomInPanel?.addEventListener('click', () => handleZoom(1));
  btnZoomOutPanel?.addEventListener('click', () => handleZoom(-1));

  // Wire Sliders
  sliderMutation?.addEventListener('input', (e) => {
    const val = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
    if (valMutation) valMutation.textContent = `${Math.round(val * 100)}%`;
    api.actions?.setMutation?.(val);
  });

  sliderTraffic?.addEventListener('input', (e) => {
    const val = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
    if (val > 0.01) lastSavedTraffic = val;
    if (valTraffic) valTraffic.textContent = `${Math.round(val * 100)}%`;
    api.actions?.setTraffic?.(val);
    syncFromState(api.state);
  });

  // Wire Population Segmented Control
  popButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const pop = Number(btn.dataset.population);
      if (!Number.isFinite(pop)) return;
      api.actions?.setPopulation?.(pop);
      showToast(`Population: ${pop} cars`);
      syncFromState(api.state);
    });
  });

  // Keyboard Shortcuts: Space (pause), R (reset), S (save brain), +/- (zoom)
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) {
      return;
    }

    if (e.code === 'Space') {
      if (tag === 'button') return;
      e.preventDefault();
      togglePause();
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      allTimePeakM = 0;
      api.actions?.reset?.();
      showToast('Reset (R)');
      syncFromState(api.state);
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      api.actions?.saveBrain?.();
      showToast('Brain saved (S)');
    } else if (e.key === '+' || e.key === '=') {
      handleZoom(1);
    } else if (e.key === '-' || e.key === '_') {
      handleZoom(-1);
    }
  });

  window.addEventListener('resize', () => {
    const s = api.state || {};
    renderSparkline(s.history || [], s.bestDistance || 0);
  });

  // Initial sync
  syncFromState(api.state);

  // Lazy-mount 3D machines in Hero (embed: true) and How It Works (embed: false)
  initLazy3DMachines();
}

function isWebGLSupported() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch (_) {
    return false;
  }
}

function initLazy3DMachines() {
  const heroSection = document.getElementById('hero-section');
  const heroContainer = document.getElementById('hero-machine');
  const howContainer = document.getElementById('how-machine');
  const stepCards = document.querySelectorAll('[data-station-step]');

  function hideHeroMachine() {
    if (heroSection) heroSection.classList.add('machine-hidden');
    if (heroContainer) heroContainer.innerHTML = '';
  }

  function highlightPipelineStep(stationId, scrollCardIntoView = false) {
    if (!stationId) return;
    const norm = String(stationId).toLowerCase();
    stepCards.forEach((card) => {
      const match = card.dataset.stationStep === norm;
      card.classList.toggle('is-active', match);
      if (match && scrollCardIntoView) {
        const rect = card.getBoundingClientRect();
        if (rect.top < 80 || rect.bottom > window.innerHeight - 40) {
          card.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
        }
      }
    });
  }

  stepCards.forEach((card) => {
    const activate = () => {
      const id = card.dataset.stationStep;
      if (!id) return;
      highlightPipelineStep(id, false);
      if (window.__machine && typeof window.__machine.focusStation === 'function') {
        window.__machine.focusStation(id);
      }
    };
    card.addEventListener('click', activate);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
  });

  if (!isWebGLSupported()) {
    hideHeroMachine();
    return;
  }

  let machineModulePromise = null;
  function loadMachineModule() {
    if (!machineModulePromise) {
      machineModulePromise = import('./machine3d.js').catch((err) => {
        machineModulePromise = null;
        throw err;
      });
    }
    return machineModulePromise;
  }

  // 1. Hero Machine (embed: true) — mount when hero in view, dispose when far off-screen
  if (heroContainer && heroSection && 'IntersectionObserver' in window) {
    let disposeHero = null;
    let mountingHero = false;

    const heroObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          if (!disposeHero && !mountingHero) {
            mountingHero = true;
            loadMachineModule()
              .then(({ mountMachine }) => {
                if (!entry.target.isConnected) return;
                disposeHero = mountMachine(heroContainer, {
                  embed: true,
                  onError: hideHeroMachine,
                });
              })
              .catch(() => {
                hideHeroMachine();
              })
              .finally(() => {
                mountingHero = false;
              });
          }
        } else if (disposeHero) {
          disposeHero();
          disposeHero = null;
        }
      },
      { rootMargin: '300px 0px' }
    );
    heroObserver.observe(heroSection);
  }

  // 2. "How It Works" Full Machine (embed: false) — lazy-mounted when scrolled near, disposed when far off-screen
  if (howContainer && 'IntersectionObserver' in window) {
    let disposeHow = null;
    let mountingHow = false;

    const howObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          if (!disposeHow && !mountingHow) {
            mountingHow = true;
            loadMachineModule()
              .then(({ mountMachine }) => {
                if (!entry.target.isConnected) return;
                disposeHow = mountMachine(howContainer, {
                  embed: false,
                  onStation: (stationId) => highlightPipelineStep(stationId, true),
                });
              })
              .catch(() => {
                // degrade silently
              })
              .finally(() => {
                mountingHow = false;
              });
          }
        } else if (disposeHow) {
          disposeHow();
          disposeHow = null;
        }
      },
      { rootMargin: '400px 0px' }
    );
    howObserver.observe(howContainer);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNeuroDriveUI);
} else {
  initNeuroDriveUI();
}
