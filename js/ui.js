// NeuroDrive UI Controller (Antigravity)
// Consumes window.NeuroDrive per SPEC.md without importing engine modules.

const REDUCED_MOTIONQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

function prefersReducedMotion() {
  return REDUCED_MOTIONQuery.matches;
}

/**
 * Fallback mock implementation of window.NeuroDrive (10 updates/sec)
 * Used only when the engine (js/main.js) has not attached window.NeuroDrive.
 */
function createMockNeuroDrive() {
  const listeners = {
    stats: new Set(),
    generation: new Set(),
    brain: new Set(),
  };

  const state = {
    generation: 1,
    alive: 100,
    population: 100,
    bestDistance: 0,
    history: [180, 340, 520, 790],
    paused: false,
    mutation: 0.1,
    lanes: 3,
    traffic: 0.6,
  };

  function emit(event, detail) {
    const group = listeners[event];
    if (!group) return;
    group.forEach((fn) => {
      try {
        fn(detail !== undefined ? detail : state);
      } catch (err) {
        console.error(`[NeuroDrive Mock] Error in ${event} listener:`, err);
      }
    });
  }

  let tickCount = 0;
  setInterval(() => {
    if (state.paused) return;
    tickCount += 1;

    const gain = Math.round(14 + Math.random() * 24 * (1 + state.generation * 0.08));
    state.bestDistance += gain;

    if (tickCount % 3 === 0 && state.alive > 1) {
      const drop = Math.max(1, Math.round(Math.random() * 4 * (0.4 + state.traffic)));
      state.alive = Math.max(0, state.alive - drop);
    }

    if (state.alive <= 0 || tickCount >= 90) {
      state.history.push(Math.round(state.bestDistance));
      if (state.history.length > 40) state.history.shift();
      state.generation += 1;
      state.alive = state.population;
      state.bestDistance = 0;
      tickCount = 0;
      emit('generation', state);
    }

    emit('stats', state);
  }, 100);

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
        tickCount = 0;
        emit('generation', state);
        emit('stats', state);
      },
      saveBrain() {
        try {
          localStorage.setItem(
            'neurodrive.brain',
            JSON.stringify({ savedAt: Date.now(), generation: state.generation })
          );
        } catch (_) {
          // ignore storage quota errors
        }
        emit('brain', { action: 'saved' });
      },
      loadBrain() {
        emit('brain', { action: 'loaded' });
      },
      discardBrain() {
        try {
          localStorage.removeItem('neurodrive.brain');
        } catch (_) {
          // ignore storage errors
        }
        emit('brain', { action: 'discarded' });
      },
      setMutation(val) {
        state.mutation = Math.max(0, Math.min(1, Number(val) || 0));
        emit('stats', state);
      },
      setPopulation(n) {
        const pop = Number(n) || 100;
        state.population = pop;
        state.alive = Math.min(state.alive, pop);
        emit('stats', state);
      },
      setLanes(lanes) {
        state.lanes = Math.max(2, Math.min(5, Number(lanes) || 3));
        emit('stats', state);
      },
      setTraffic(density) {
        state.traffic = Math.max(0, Math.min(1, Number(density) || 0));
        emit('stats', state);
      },
    },
  };
}

/**
 * Setup IntersectionObserver for .fade-up entrance animations
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
    { threshold: 0.12, rootMargin: '0px 0px -30px 0px' }
  );

  elements.forEach((el) => observer.observe(el));
}

/**
 * Draw the fitness history sparkline onto <canvas id="spark">
 */
function createSparklineRenderer(canvas) {
  if (!canvas) return () => {};
  const ctx = canvas.getContext('2d');

  function getPalette() {
    const styles = getComputedStyle(document.documentElement);
    return {
      onyx: styles.getPropertyValue('--onyx').trim() || '#01010D',
      indigo: styles.getPropertyValue('--indigo').trim() || '#6331FB',
      mint: styles.getPropertyValue('--mint').trim() || '#88F9C0',
    };
  }

  return function renderSparkline(history = [], currentDistance = 0) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(160, Math.floor(rect.width || canvas.width || 280));
    const height = Math.max(44, Math.floor(rect.height || canvas.height || 64));

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const { indigo, mint } = getPalette();

    // Build series from history + live bestDistance
    const series = Array.isArray(history) ? history.filter((n) => Number.isFinite(n)) : [];
    const points = series.length >= 2
      ? [...series]
      : [0, ...(series.length === 1 ? series : []), Math.max(0, Number(currentDistance) || 0)];

    const padX = 8;
    const padY = 10;
    const plotW = width - padX * 2;
    const plotH = height - padY * 2;

    // Subtle baseline grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, height - padY);
    ctx.lineTo(width - padX, height - padY);
    ctx.stroke();

    const minVal = Math.min(0, ...points);
    const maxVal = Math.max(100, ...points);
    const range = Math.max(1, maxVal - minVal);

    const coords = points.map((val, idx) => {
      const x = padX + (idx / Math.max(1, points.length - 1)) * plotW;
      const norm = (val - minVal) / range;
      const y = padY + plotH - norm * plotH;
      return { x, y };
    });

    // Area gradient fill under sparkline
    const grad = ctx.createLinearGradient(0, padY, 0, height - padY);
    grad.addColorStop(0, 'rgba(136, 249, 192, 0.36)');
    grad.addColorStop(0.65, 'rgba(99, 49, 251, 0.16)');
    grad.addColorStop(1, 'rgba(1, 1, 13, 0)');

    ctx.beginPath();
    ctx.moveTo(coords[0].x, height - padY);
    coords.forEach((pt) => ctx.lineTo(pt.x, pt.y));
    ctx.lineTo(coords[coords.length - 1].x, height - padY);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Smooth stroke
    const strokeGrad = ctx.createLinearGradient(padX, 0, width - padX, 0);
    strokeGrad.addColorStop(0, indigo);
    strokeGrad.addColorStop(1, mint);

    ctx.beginPath();
    coords.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.strokeStyle = strokeGrad;
    ctx.lineWidth = 2.25;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Glowing terminal dot on latest point
    const last = coords[coords.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = mint;
    ctx.shadowColor = mint;
    ctx.shadowBlur = 10;
    ctx.fill();

    ctx.restore();
  };
}

/**
 * Wire UI controls, animated counters, sparkline, and keyboard shortcuts
 */
function initNeuroDriveUI() {
  initScrollReveal();

  const api = window.NeuroDrive || (window.NeuroDrive = createMockNeuroDrive());

  // DOM References
  const elGen = document.getElementById('stat-generation');
  const elAlive = document.getElementById('stat-alive');
  const elPop = document.getElementById('stat-population');
  const elAlivePct = document.getElementById('stat-alive-pct');
  const elAliveBar = document.getElementById('alive-progress-bar');
  const elDist = document.getElementById('stat-distance');
  const elPeakNote = document.getElementById('stat-peak-note');
  const elSparkSummary = document.getElementById('spark-Summary');
  const elEngineLabel = document.getElementById('engine-status-label');
  const elSimIndicator = document.getElementById('sim-indicator');
  const elBadgeLanes = document.getElementById('badge-lanes');
  const elToast = document.getElementById('toast-feedback');

  const btnStartPause = document.getElementById('btn-start-pause');
  const btnStartPauseIcon = document.getElementById('btn-start-pause-icon');
  const btnStartPauseText = document.getElementById('btn-start-pause-text');
  const btnReset = document.getElementById('btn-reset');
  const btnSave = document.getElementById('btn-save');
  const btnLoad = document.getElementById('btn-load');
  const btnDiscard = document.getElementById('btn-discard');
  const heroCta = document.getElementById('hero-cta');

  const sliderMutation = document.getElementById('slider-mutation');
  const valMutation = document.getElementById('val-mutation');
  const sliderTraffic = document.getElementById('slider-traffic');
  const valTraffic = document.getElementById('val-traffic');

  const popButtons = document.querySelectorAll('[data-population]');
  const laneButtons = document.querySelectorAll('[data-lanes]');

  const sparkCanvas = document.getElementById('spark');
  const renderSparkline = createSparklineRenderer(sparkCanvas);

  if (elEngineLabel) {
    elEngineLabel.textContent = api.__isMock ? 'Mock Telemetry (10/s)' : 'Live Engine';
  }

  // Toast status helper
  let toastTimer = null;
  function showToast(message) {
    if (!elToast) return;
    elToast.textContent = message;
    elToast.classList.add('is-highlight');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      elToast.classList.remove('is-highlight');
    }, 1800);
  }

  // Animated Counter State
  const counterTarget = {
    generation: 1,
    alive: 100,
    bestDistance: 0,
  };
  const counterDisplay = {
    generation: 1,
    alive: 100,
    bestDistance: 0,
  };
  let counterRaf = null;
  let allTimePeak = 0;

  function stepCounters() {
    if (prefersReducedMotion()) {
      counterDisplay.generation = counterTarget.generation;
      counterDisplay.alive = counterTarget.alive;
      counterDisplay.bestDistance = counterTarget.bestDistance;
      flushCounterDOM();
      counterRaf = null;
      return;
    }

    let needsMore = false;
    ['generation', 'alive', 'bestDistance'].forEach((key) => {
      const diff = counterTarget[key] - counterDisplay[key];
      if (Math.abs(diff) > 0.45) {
        counterDisplay[key] += diff * 0.28;
        needsMore = true;
      } else {
        counterDisplay[key] = counterTarget[key];
      }
    });

    flushCounterDOM();

    if (needsMore) {
      counterRaf = requestAnimationFrame(stepCounters);
    } else {
      counterRaf = null;
    }
  }

  function flushCounterDOM() {
    if (elGen) elGen.textContent = Math.round(counterDisplay.generation).toLocaleString();
    if (elAlive) elAlive.textContent = Math.round(counterDisplay.alive).toLocaleString();
    if (elDist) elDist.textContent = Math.round(counterDisplay.bestDistance).toLocaleString();
  }

  function scheduleCounterAnimation() {
    if (prefersReducedMotion()) {
      stepCounters();
      return;
    }
    if (!counterRaf) {
      counterRaf = requestAnimationFrame(stepCounters);
    }
  }

  // Sync UI state from NeuroDrive.state
  function syncFromState(rawState) {
    const s = rawState && typeof rawState === 'object' && 'generation' in rawState
      ? rawState
      : api.state || {};

    const generation = Number(s.generation) || 1;
    const population = Number(s.population) || 100;
    const alive = s.alive !== undefined ? Number(s.alive) : population;
    const bestDistance = Math.max(0, Math.round(Number(s.bestDistance) || 0));
    const history = Array.isArray(s.history) ? s.history : [];
    const paused = Boolean(s.paused);
    const mutation = s.mutation !== undefined ? Number(s.mutation) : 0.1;
    const lanes = Number(s.lanes) || 3;
    const traffic = s.traffic !== undefined ? Number(s.traffic) : 0.6;

    counterTarget.generation = generation;
    counterTarget.alive = alive;
    counterTarget.bestDistance = bestDistance;
    scheduleCounterAnimation();

    if (elPop) elPop.textContent = population.toString();

    const pct = population > 0 ? Math.max(0, Math.min(100, Math.round((alive / population) * 100))) : 0;
    if (elAlivePct) elAlivePct.textContent = `${pct}%`;
    if (elAliveBar) elAliveBar.style.width = `${pct}%`;

    const histMax = history.length ? Math.max(...history) : 0;
    allTimePeak = Math.max(allTimePeak, histMax, bestDistance);
    if (elPeakNote) {
      elPeakNote.textContent = `All-time peak: ${Math.round(allTimePeak).toLocaleString()} px`;
    }

    if (elSparkSummary) {
      elSparkSummary.textContent = history.length
        ? `${history.length} GEN${history.length === 1 ? '' : 'S'}`
        : 'LIVE';
    }

    renderSparkline(history, bestDistance);

    // Pause / Start Button & Status Dot
    if (btnStartPause && btnStartPauseText && btnStartPauseIcon) {
      btnStartPause.setAttribute('aria-pressed', paused ? 'true' : 'false');
      btnStartPauseText.textContent = paused ? 'Start' : 'Pause';
      btnStartPauseIcon.textContent = paused ? '▶' : '❚❚';
    }
    if (elSimIndicator) {
      elSimIndicator.classList.toggle('is-paused', paused);
    }

    // Sliders (only update if user isn't actively dragging them)
    if (sliderMutation && document.activeElement !== sliderMutation) {
      sliderMutation.value = String(mutation);
    }
    if (valMutation) {
      valMutation.textContent = `${Math.round(mutation * 100)}%`;
    }

    if (sliderTraffic && document.activeElement !== sliderTraffic) {
      sliderTraffic.value = String(traffic);
    }
    if (valTraffic) {
      valTraffic.textContent = `${Math.round(traffic * 100)}%`;
    }

    // Segmented controls
    popButtons.forEach((btn) => {
      const isMatch = Number(btn.dataset.population) === population;
      btn.classList.toggle('is-active', isMatch);
      btn.setAttribute('aria-checked', isMatch ? 'true' : 'false');
    });

    laneButtons.forEach((btn) => {
      const isMatch = Number(btn.dataset.lanes) === lanes;
      btn.classList.toggle('is-active', isMatch);
      btn.setAttribute('aria-checked', isMatch ? 'true' : 'false');
    });

    if (elBadgeLanes) {
      elBadgeLanes.textContent = String(lanes);
    }
  }

  // Subscribe to NeuroDrive events
  if (typeof api.on === 'function') {
    api.on('stats', (payload) => syncFromState(payload));
    api.on('generation', (payload) => {
      syncFromState(payload);
      const gen = (payload && payload.generation) || (api.state && api.state.generation) || 1;
      showToast(`Generation ${gen} spawned`);
    });
    api.on('brain', (info) => {
      const label = typeof info === 'string'
        ? info
        : (info && (info.action || info.type || info.status)) || 'updated';
      showToast(`Brain ${label}`);
      syncFromState(api.state);
    });
  }

  // Toggle Start / Pause helper
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

  // Button Listeners
  btnStartPause?.addEventListener('click', togglePause);

  btnReset?.addEventListener('click', () => {
    allTimePeak = 0;
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

  // Sliders
  sliderMutation?.addEventListener('input', (e) => {
    const val = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
    if (valMutation) valMutation.textContent = `${Math.round(val * 100)}%`;
    api.actions?.setMutation?.(val);
  });

  sliderTraffic?.addEventListener('input', (e) => {
    const val = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
    if (valTraffic) valTraffic.textContent = `${Math.round(val * 100)}%`;
    api.actions?.setTraffic?.(val);
  });

  // Segmented Controls: Population (50 / 100 / 200)
  popButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const pop = Number(btn.dataset.population);
      if (!Number.isFinite(pop)) return;
      api.actions?.setPopulation?.(pop);
      showToast(`Population set to ${pop}`);
      syncFromState(api.state);
    });
  });

  // Segmented Controls: Lanes (2..5)
  laneButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const lanes = Number(btn.dataset.lanes);
      if (!Number.isFinite(lanes)) return;
      api.actions?.setLanes?.(lanes);
      showToast(`${lanes} lanes active`);
      syncFromState(api.state);
    });
  });

  // Keyboard Shortcuts: Space (pause/start), R (reset), S (save brain)
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) {
      return;
    }

    if (e.code === 'Space') {
      // Avoid double-triggering if focused on a button
      if (tag === 'button') return;
      e.preventDefault();
      togglePause();
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      allTimePeak = 0;
      api.actions?.reset?.();
      showToast('Reset (R)');
      syncFromState(api.state);
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      api.actions?.saveBrain?.();
      showToast('Brain saved (S)');
    }
  });

  // Keep sparkline crisp on viewport resize
  window.addEventListener('resize', () => {
    const s = api.state || {};
    renderSparkline(s.history || [], s.bestDistance || 0);
  });

  // Initial render
  syncFromState(api.state);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNeuroDriveUI);
} else {
  initNeuroDriveUI();
}
