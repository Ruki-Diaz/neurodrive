// NeuroDrive v2 — Whole-CBD Live Minimap Renderer (Antigravity)
// Renders #minimap from world data + NeuroDrive.state.{car, route, destination}.
// Strictly uses palette: #01010D, #6331FB, #88F9C0, #FFFFFF.

(function () {
  const PALETTE = {
    onyx: '#01010D',
    indigo: '#6331FB',
    mint: '#88F9C0',
    white: '#FFFFFF',
  };

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  let worldData = null;
  let bounds = { minX: -600, minY: -500, maxX: 600, maxY: 500 };
  let baseCacheCanvas = null;
  let baseCacheW = 0;
  let baseCacheH = 0;

  function computeWorldBounds(world) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const roads = (world && world.roads) || [];
    for (let i = 0; i < roads.length; i++) {
      const pts = roads[i].points;
      if (!pts) continue;
      for (let j = 0; j < pts.length; j++) {
        const x = pts[j][0];
        const y = pts[j][1];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (!Number.isFinite(minX)) {
      return { minX: -600, minY: -500, maxX: 600, maxY: 500 };
    }

    const padX = Math.max(40, (maxX - minX) * 0.06);
    const padY = Math.max(40, (maxY - minY) * 0.06);
    return {
      minX: minX - padX,
      minY: minY - padY,
      maxX: maxX + padX,
      maxY: maxY + padY,
    };
  }

  function getProjection(w, h) {
    const spanX = Math.max(100, bounds.maxX - bounds.minX);
    const spanY = Math.max(100, bounds.maxY - bounds.minY);
    const pad = 10;
    const availW = Math.max(20, w - pad * 2);
    const availH = Math.max(20, h - pad * 2);
    const scale = Math.min(availW / spanX, availH / spanY);
    const offsetX = (w - spanX * scale) * 0.5;
    const offsetY = (h - spanY * scale) * 0.5;

    return {
      scale,
      toX(wx) {
        return offsetX + (wx - bounds.minX) * scale;
      },
      toY(wy) {
        return offsetY + (wy - bounds.minY) * scale;
      },
    };
  }

  function rebuildStaticCache(w, h, dpr) {
    if (!worldData || w <= 0 || h <= 0) return;

    const off = document.createElement('canvas');
    off.width = Math.round(w * dpr);
    off.height = Math.round(h * dpr);
    const ctx = off.getContext('2d');
    ctx.scale(dpr, dpr);

    // Onyx base
    ctx.fillStyle = PALETTE.onyx;
    ctx.fillRect(0, 0, w, h);

    const proj = getProjection(w, h);

    // Subtle building blocks
    const buildings = worldData.buildings || [];
    if (buildings.length > 0) {
      ctx.fillStyle = 'rgba(99, 49, 251, 0.09)';
      ctx.beginPath();
      for (let i = 0; i < buildings.length; i++) {
        const poly = buildings[i];
        if (!poly || poly.length < 3) continue;
        ctx.moveTo(proj.toX(poly[0][0]), proj.toY(poly[0][1]));
        for (let j = 1; j < poly.length; j++) {
          ctx.lineTo(proj.toX(poly[j][0]), proj.toY(poly[j][1]));
        }
        ctx.closePath();
      }
      ctx.fill();
    }

    // Roads
    const roads = worldData.roads || [];
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Minor roads first
    ctx.strokeStyle = 'rgba(99, 49, 251, 0.34)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < roads.length; i++) {
      const r = roads[i];
      const cls = String(r.class || '').toLowerCase();
      const isMajor = cls === 'primary' || cls === 'secondary' || cls === 'trunk' || cls === 'motorway';
      if (isMajor) continue;
      const pts = r.points;
      if (!pts || pts.length < 2) continue;
      ctx.moveTo(proj.toX(pts[0][0]), proj.toY(pts[0][1]));
      for (let j = 1; j < pts.length; j++) {
        ctx.lineTo(proj.toX(pts[j][0]), proj.toY(pts[j][1]));
      }
    }
    ctx.stroke();

    // Major roads brighter
    ctx.strokeStyle = 'rgba(99, 49, 251, 0.72)';
    ctx.lineWidth = 1.65;
    ctx.beginPath();
    for (let i = 0; i < roads.length; i++) {
      const r = roads[i];
      const cls = String(r.class || '').toLowerCase();
      const isMajor = cls === 'primary' || cls === 'secondary' || cls === 'trunk' || cls === 'motorway';
      if (!isMajor) continue;
      const pts = r.points;
      if (!pts || pts.length < 2) continue;
      ctx.moveTo(proj.toX(pts[0][0]), proj.toY(pts[0][1]));
      for (let j = 1; j < pts.length; j++) {
        ctx.lineTo(proj.toX(pts[j][0]), proj.toY(pts[j][1]));
      }
    }
    ctx.stroke();

    baseCacheCanvas = off;
    baseCacheW = w;
    baseCacheH = h;
  }

  function drawMinimap(stateOverride) {
    const canvas = document.getElementById('minimap');
    if (!canvas) return;

    if (!worldData) {
      if (window.MapView && window.MapView.world) {
        Minimap.setWorld(window.MapView.world);
      } else if (window.MapView && typeof window.MapView.createMockMelbourneWorld === 'function') {
        Minimap.setWorld(window.MapView.createMockMelbourneWorld());
      } else {
        return;
      }
    }

    const rect = canvas.getBoundingClientRect();
    const w = Math.max(120, Math.floor(rect.width || canvas.width || 180));
    const h = Math.max(90, Math.floor(rect.height || canvas.height || 140));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      baseCacheCanvas = null;
    }

    if (!baseCacheCanvas || baseCacheW !== w || baseCacheH !== h) {
      rebuildStaticCache(w, h, dpr);
    }

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (baseCacheCanvas) {
      ctx.drawImage(baseCacheCanvas, 0, 0, w, h);
    } else {
      ctx.fillStyle = PALETTE.onyx;
      ctx.fillRect(0, 0, w, h);
    }

    const proj = getProjection(w, h);
    const st = stateOverride || (window.NeuroDrive && window.NeuroDrive.state) || {};
    const route = st.route || [];
    const dest = st.destination || (route.length ? { x: route[route.length - 1][0], y: route[route.length - 1][1] } : null);
    const car = st.car || (route.length ? { x: route[0][0], y: route[0][1], headingDeg: 0 } : { x: 0, y: 0, headingDeg: 0 });

    // Route polyline in glowing Mint
    if (route.length >= 2) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.strokeStyle = 'rgba(136, 249, 192, 0.28)';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(proj.toX(route[0][0]), proj.toY(route[0][1]));
      for (let i = 1; i < route.length; i++) {
        ctx.lineTo(proj.toX(route[i][0]), proj.toY(route[i][1]));
      }
      ctx.stroke();

      ctx.strokeStyle = PALETTE.mint;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();
    }

    // Destination target ring
    if (dest && Number.isFinite(dest.x) && Number.isFinite(dest.y)) {
      const dx = proj.toX(dest.x);
      const dy = proj.toY(dest.y);
      ctx.beginPath();
      ctx.arc(dx, dy, 4, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE.onyx;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = PALETTE.mint;
      ctx.stroke();
    }

    // Best Car Dot in Mint (pulsing)
    if (car && Number.isFinite(car.x) && Number.isFinite(car.y)) {
      const cx = proj.toX(car.x);
      const cy = proj.toY(car.y);
      const now = performance.now();
      const pulse = reducedMotionQuery.matches ? 0.4 : (now % 1400) / 1400;

      // Expanding pulse ring
      ctx.beginPath();
      ctx.arc(cx, cy, 4 + pulse * 9, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(136, 249, 192, ${(1 - pulse) * 0.8})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Core car beacon
      ctx.beginPath();
      ctx.arc(cx, cy, 3.8, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE.mint;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = PALETTE.onyx;
      ctx.stroke();
    }

    ctx.restore();
  }

  const Minimap = {
    setWorld(world) {
      if (!world) return;
      worldData = world;
      bounds = computeWorldBounds(world);
      baseCacheCanvas = null;
      drawMinimap();
    },

    render(state) {
      drawMinimap(state);
    },

    init() {
      if (window.MapView && window.MapView.world) {
        this.setWorld(window.MapView.world);
      } else {
        // Attempt to fetch real world JSON if present; fall back to mock world
        fetch('data/melbourne-cbd.json')
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not yet generated'))))
          .then((json) => {
            if (!worldData || worldData.__isMock) {
              this.setWorld(json);
            }
          })
          .catch(() => {
            if (!worldData && window.MapView && typeof window.MapView.createMockMelbourneWorld === 'function') {
              const mockW = window.MapView.createMockMelbourneWorld();
              mockW.__isMock = true;
              this.setWorld(mockW);
            }
          });
      }

      // Animation loop for smooth pulse on minimap
      function tick() {
        drawMinimap();
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    },
  };

  window.Minimap = Minimap;
})();
