// NeuroDrive v2 — Melbourne CBD Night-City Map Renderer (Antigravity)
// Implements window.MapView = { init(world), drawBase(ctx, cam), drawOverlay(ctx, cam, hud) }
// Strictly uses palette: Onyx #01010D, Electric Indigo #6331FB, Tropical Mint #88F9C0, White #FFFFFF.
// Designed for 60 fps: multi-tier offscreen canvas caching, viewport culling, zero per-frame heap churn.

(function () {
  const PALETTE = {
    onyx: '#01010D',
    indigo: '#6331FB',
    mint: '#88F9C0',
    white: '#FFFFFF',
  };

  // Preallocated buffer for label overlap culling (max 64 labels per frame, 4 floats each: x1,y1,x2,y2)
  const MAX_LABELS = 64;
  const labelBoxes = new Float32Array(MAX_LABELS * 4);
  let labelCount = 0;

  function resetLabelCuller() {
    labelCount = 0;
  }

  function tryPlaceLabelBox(cx, cy, halfW, halfH) {
    if (labelCount >= MAX_LABELS) return false;
    const x1 = cx - halfW;
    const y1 = cy - halfH;
    const x2 = cx + halfW;
    const y2 = cy + halfH;

    for (let i = 0; i < labelCount; i++) {
      const base = i * 4;
      if (
        x1 < labelBoxes[base + 2] &&
        x2 > labelBoxes[base] &&
        y1 < labelBoxes[base + 3] &&
        y2 > labelBoxes[base + 1]
      ) {
        return false;
      }
    }

    const idx = labelCount * 4;
    labelBoxes[idx] = x1;
    labelBoxes[idx + 1] = y1;
    labelBoxes[idx + 2] = x2;
    labelBoxes[idx + 3] = y2;
    labelCount += 1;
    return true;
  }

  /**
   * Built-in fallback Melbourne CBD Hoddle Grid world (in metres around origin)
   * Used until the engine loads data/melbourne-cbd.json.
   */
  function createMockMelbourneWorld() {
    const roads = [
      // SW-NE Arterials (Hoddle Grid alignment ~ -20 deg, plus simplified orthogonal/angled grid)
      {
        id: 1,
        name: 'Swanston Street',
        class: 'primary',
        oneway: false,
        lanes: 2,
        maxspeedKmh: 40,
        width: 11,
        points: [[0, -480], [0, -240], [0, 0], [0, 240], [0, 480]],
      },
      {
        id: 2,
        name: 'Elizabeth Street',
        class: 'primary',
        oneway: false,
        lanes: 2,
        maxspeedKmh: 40,
        width: 11,
        points: [[-220, -480], [-220, -240], [-220, 0], [-220, 240], [-220, 480]],
      },
      {
        id: 3,
        name: 'Russell Street',
        class: 'secondary',
        oneway: false,
        lanes: 2,
        maxspeedKmh: 40,
        width: 9,
        points: [[220, -480], [220, -240], [220, 0], [220, 240], [220, 480]],
      },
      {
        id: 4,
        name: 'Queen Street',
        class: 'secondary',
        oneway: false,
        lanes: 2,
        maxspeedKmh: 40,
        width: 9,
        points: [[-440, -480], [-440, -240], [-440, 0], [-440, 240], [-440, 480]],
      },
      {
        id: 5,
        name: 'Exhibition Street',
        class: 'primary',
        oneway: false,
        lanes: 3,
        maxspeedKmh: 40,
        width: 12,
        points: [[440, -480], [440, -240], [440, 0], [440, 240], [440, 480]],
      },
      // Cross Streets (East-West)
      {
        id: 6,
        name: 'Flinders Street',
        class: 'primary',
        oneway: false,
        lanes: 3,
        maxspeedKmh: 40,
        width: 13,
        points: [[-560, 420], [-440, 420], [-220, 420], [0, 420], [220, 420], [440, 420], [560, 420]],
      },
      {
        id: 7,
        name: 'Collins Street',
        class: 'primary',
        oneway: false,
        lanes: 2,
        maxspeedKmh: 40,
        width: 11,
        points: [[-560, 180], [-440, 180], [-220, 180], [0, 180], [220, 180], [440, 180], [560, 180]],
      },
      {
        id: 8,
        name: 'Bourke Street',
        class: 'secondary',
        oneway: false,
        lanes: 2,
        maxspeedKmh: 40,
        width: 10,
        points: [[-560, -40], [-440, -40], [-220, -40], [0, -40], [220, -40], [440, -40], [560, -40]],
      },
      {
        id: 9,
        name: 'Lonsdale Street',
        class: 'primary',
        oneway: false,
        lanes: 3,
        maxspeedKmh: 40,
        width: 11,
        points: [[-560, -220], [-440, -220], [-220, -220], [0, -220], [220, -220], [440, -220], [560, -220]],
      },
      {
        id: 10,
        name: 'La Trobe Street',
        class: 'primary',
        oneway: false,
        lanes: 2,
        maxspeedKmh: 40,
        width: 11,
        points: [[-560, -390], [-440, -390], [-220, -390], [0, -390], [220, -390], [440, -390], [560, -390]],
      },
      // Little Streets (One-Way Laneways)
      {
        id: 11,
        name: 'Little Collins Street',
        class: 'tertiary',
        oneway: true,
        lanes: 1,
        maxspeedKmh: 30,
        width: 6,
        points: [[540, 75], [220, 75], [0, 75], [-220, 75], [-540, 75]],
      },
      {
        id: 12,
        name: 'Little Bourke Street',
        class: 'tertiary',
        oneway: true,
        lanes: 1,
        maxspeedKmh: 30,
        width: 6,
        points: [[-540, -130], [-220, -130], [0, -130], [220, -130], [540, -130]],
      },
      {
        id: 13,
        name: 'Little Lonsdale Street',
        class: 'tertiary',
        oneway: true,
        lanes: 1,
        maxspeedKmh: 30,
        width: 6,
        points: [[540, -305], [220, -305], [0, -305], [-220, -305], [-540, -305]],
      },
    ];

    // Generate realistic city block footprints inside the Hoddle Grid cells
    const buildings = [];
    const xCols = [-420, -320, -200, -100, 20, 120, 240, 340];
    const yRows = [-370, -285, -200, -110, -20, 95, 200, 310];
    for (let xi = 0; xi < xCols.length; xi++) {
      for (let yi = 0; yi < yRows.length; yi++) {
        const bx = xCols[xi];
        const by = yRows[yi];
        const bw = 72 + ((xi * 17 + yi * 13) % 18);
        const bh = 62 + ((xi * 11 + yi * 19) % 16);
        buildings.push([
          [bx, by],
          [bx + bw, by],
          [bx + bw, by + bh],
          [bx, by + bh],
        ]);
      }
    }

    const tram = [
      [[0, -480], [0, 480]],
      [[-220, -480], [-220, 420]],
      [[-560, 420], [560, 420]],
      [[-560, 180], [560, 180]],
      [[-560, -40], [560, -40]],
      [[-560, -390], [560, -390]],
    ];

    const signals = [];
    const mainX = [-440, -220, 0, 220, 440];
    const mainY = [-390, -220, -40, 180, 420];
    for (let i = 0; i < mainX.length; i++) {
      for (let j = 0; j < mainY.length; j++) {
        signals.push({ x: mainX[i], y: mainY[j] });
      }
    }

    const landmarks = [
      { name: 'Flinders Street Station', x: -35, y: 448 },
      { name: 'Federation Square', x: 58, y: 452 },
      { name: 'Melbourne Central', x: -45, y: -355 },
      { name: 'State Library Victoria', x: 48, y: -360 },
      { name: 'Queen Victoria Market', x: -340, y: -455 },
      { name: 'Southern Cross Station', x: -535, y: 120 },
    ];

    return {
      bbox: { s: -37.823, w: 144.948, n: -37.806, e: 144.979 },
      origin: { lat: -37.814, lon: 144.9635 },
      roads,
      buildings,
      tram,
      signals,
      landmarks,
    };
  }

  // Internal state
  let currentWorld = null;
  let worldBounds = { minX: -700, minY: -600, maxX: 700, maxY: 600, width: 1400, height: 1200 };
  let roadMeta = [];
  let labelCandidates = [];
  let tiers = []; // [{ scale, canvas, width, height }]

  function computeBounds(world) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const roads = world.roads || [];
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
      minX = -700;
      minY = -600;
      maxX = 700;
      maxY = 600;
    } else {
      const pad = 120;
      minX -= pad;
      minY -= pad;
      maxX += pad;
      maxY += pad;
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(200, maxX - minX),
      height: Math.max(200, maxY - minY),
    };
  }

  function preprocessWorld(world) {
    roadMeta = [];
    labelCandidates = [];
    const seenStreetSegments = new Map();

    const roads = world.roads || [];
    for (let i = 0; i < roads.length; i++) {
      const r = roads[i];
      const pts = r.points;
      if (!pts || pts.length < 2) continue;

      let rMinX = Infinity;
      let rMinY = Infinity;
      let rMaxX = -Infinity;
      let rMaxY = -Infinity;
      let totalLen = 0;

      const chevrons = [];
      let longestSegLen = 0;
      let bestMidX = 0;
      let bestMidY = 0;
      let bestAngle = 0;

      for (let j = 0; j < pts.length; j++) {
        const px = pts[j][0];
        const py = pts[j][1];
        if (px < rMinX) rMinX = px;
        if (py < rMinY) rMinY = py;
        if (px > rMaxX) rMaxX = px;
        if (py > rMaxY) rMaxY = py;

        if (j > 0) {
          const x0 = pts[j - 1][0];
          const y0 = pts[j - 1][1];
          const dx = px - x0;
          const dy = py - y0;
          const segLen = Math.hypot(dx, dy);
          totalLen += segLen;

          if (segLen > longestSegLen) {
            longestSegLen = segLen;
            bestMidX = (x0 + px) * 0.5;
            bestMidY = (y0 + py) * 0.5;
            bestAngle = Math.atan2(dy, dx);
          }

          if (r.oneway && segLen >= 28) {
            const angle = Math.atan2(dy, dx);
            const steps = Math.max(1, Math.floor(segLen / 55));
            for (let s = 1; s <= steps; s++) {
              const t = s / (steps + 1);
              chevrons.push({
                x: x0 + dx * t,
                y: y0 + dy * t,
                angle,
              });
            }
          }
        }
      }

      const cls = String(r.class || '').toLowerCase();
      const isMajor =
        cls === 'motorway' ||
        cls === 'trunk' ||
        cls === 'primary' ||
        cls === 'secondary' ||
        (r.width && r.width >= 10);

      const width = Math.max(4, Number(r.width) || (isMajor ? 11 : 7));

      roadMeta.push({
        road: r,
        points: pts,
        width,
        isMajor,
        oneway: Boolean(r.oneway),
        chevrons,
        minX: rMinX - width,
        minY: rMinY - width,
        maxX: rMaxX + width,
        maxY: rMaxY + width,
      });

      if (r.name && longestSegLen >= 32 && totalLen >= 45) {
        const nameKey = r.name.toUpperCase();
        const prevList = seenStreetSegments.get(nameKey) || [];
        let tooClose = false;
        for (let k = 0; k < prevList.length; k++) {
          if (Math.hypot(bestMidX - prevList[k].x, bestMidY - prevList[k].y) < 190) {
            tooClose = true;
            break;
          }
        }
        if (!tooClose) {
          const item = {
            name: r.name,
            upper: nameKey,
            x: bestMidX,
            y: bestMidY,
            angle: bestAngle,
            isMajor,
            priority: isMajor ? 2 : 1,
          };
          prevList.push(item);
          seenStreetSegments.set(nameKey, prevList);
          labelCandidates.push(item);
        }
      }
    }

    // Sort labels so major streets place first
    labelCandidates.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Render static world layers onto an offscreen canvas at a given scale (px per metre)
   */
  function renderStaticTier(world, bounds, desiredScale) {
    const maxDim = 3600;
    const scale = Math.min(
      desiredScale,
      maxDim / bounds.width,
      maxDim / bounds.height
    );
    const w = Math.max(1, Math.ceil(bounds.width * scale));
    const h = Math.max(1, Math.ceil(bounds.height * scale));

    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext('2d');

    // 1. Onyx Ground
    ctx.fillStyle = PALETTE.onyx;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-bounds.minX, -bounds.minY);

    // Subtle metric coordinate grid (every 100m)
    ctx.strokeStyle = 'rgba(99, 49, 251, 0.05)';
    ctx.lineWidth = 1 / scale;
    ctx.beginPath();
    const startGridX = Math.floor(bounds.minX / 100) * 100;
    const startGridY = Math.floor(bounds.minY / 100) * 100;
    for (let gx = startGridX; gx <= bounds.maxX; gx += 100) {
      ctx.moveTo(gx, bounds.minY);
      ctx.lineTo(gx, bounds.maxY);
    }
    for (let gy = startGridY; gy <= bounds.maxY; gy += 100) {
      ctx.moveTo(bounds.minX, gy);
      ctx.lineTo(bounds.maxX, gy);
    }
    ctx.stroke();

    // 2. Building Footprints (faint indigo fill + 1px lighter indigo edge)
    const buildings = world.buildings || [];
    if (buildings.length > 0) {
      ctx.fillStyle = 'rgba(99, 49, 251, 0.085)';
      ctx.strokeStyle = 'rgba(99, 49, 251, 0.26)';
      ctx.lineWidth = Math.max(0.6, 1 / scale);

      ctx.beginPath();
      for (let i = 0; i < buildings.length; i++) {
        const poly = buildings[i];
        if (!poly || poly.length < 3) continue;
        ctx.moveTo(poly[0][0], poly[0][1]);
        for (let j = 1; j < poly.length; j++) {
          ctx.lineTo(poly[j][0], poly[j][1]);
        }
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
    }

    // 3. Roads (layered for clean intersections: glow -> casing -> surface -> centerlines -> chevrons)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 3a. Soft glow on major roads
    for (let i = 0; i < roadMeta.length; i++) {
      const rm = roadMeta[i];
      if (!rm.isMajor) continue;
      const pts = rm.points;
      ctx.strokeStyle = 'rgba(99, 49, 251, 0.14)';
      ctx.lineWidth = rm.width + 7;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let j = 1; j < pts.length; j++) {
        ctx.lineTo(pts[j][0], pts[j][1]);
      }
      ctx.stroke();
    }

    // 3b. Road outer casing (indigo edge)
    for (let i = 0; i < roadMeta.length; i++) {
      const rm = roadMeta[i];
      const pts = rm.points;
      ctx.strokeStyle = rm.isMajor
        ? 'rgba(99, 49, 251, 0.52)'
        : 'rgba(99, 49, 251, 0.28)';
      ctx.lineWidth = rm.width + 1.4;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let j = 1; j < pts.length; j++) {
        ctx.lineTo(pts[j][0], pts[j][1]);
      }
      ctx.stroke();
    }

    // 3c. Road surface ribbon (dark onyx base + indigo tint, major roads brighter)
    for (let i = 0; i < roadMeta.length; i++) {
      const rm = roadMeta[i];
      const pts = rm.points;
      ctx.strokeStyle = PALETTE.onyx;
      ctx.lineWidth = rm.width;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let j = 1; j < pts.length; j++) {
        ctx.lineTo(pts[j][0], pts[j][1]);
      }
      ctx.stroke();

      ctx.strokeStyle = rm.isMajor
        ? 'rgba(99, 49, 251, 0.24)'
        : 'rgba(99, 49, 251, 0.13)';
      ctx.lineWidth = rm.width;
      ctx.stroke();
    }

    // 3d. Subtle centre divider on major multi-lane roads
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.11)';
    ctx.lineWidth = Math.max(0.4, 0.8 / scale);
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    for (let i = 0; i < roadMeta.length; i++) {
      const rm = roadMeta[i];
      if (!rm.isMajor || rm.oneway) continue;
      const pts = rm.points;
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let j = 1; j < pts.length; j++) {
        ctx.lineTo(pts[j][0], pts[j][1]);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 3e. Subtle chevrons on one-way streets
    ctx.strokeStyle = 'rgba(136, 249, 192, 0.34)';
    ctx.lineWidth = Math.max(0.55, 1.1 / scale);
    ctx.beginPath();
    for (let i = 0; i < roadMeta.length; i++) {
      const chevrons = roadMeta[i].chevrons;
      for (let c = 0; c < chevrons.length; c++) {
        const ch = chevrons[c];
        const cos = Math.cos(ch.angle);
        const sin = Math.sin(ch.angle);
        const size = 2.1;
        const tipX = ch.x + cos * size;
        const tipY = ch.y + sin * size;
        const backX = ch.x - cos * size;
        const backY = ch.y - sin * size;
        const wingX = -sin * size * 0.85;
        const wingY = cos * size * 0.85;

        ctx.moveTo(backX + wingX, backY + wingY);
        ctx.lineTo(tipX, tipY);
        ctx.lineTo(backX - wingX, backY - wingY);
      }
    }
    ctx.stroke();

    // 4. Tram Lines (thin mint dotted lines)
    const trams = world.tram || [];
    if (trams.length > 0) {
      ctx.strokeStyle = 'rgba(136, 249, 192, 0.55)';
      ctx.lineWidth = Math.max(0.65, 1.25 / scale);
      ctx.setLineDash([2.2, 3.4]);
      ctx.beginPath();
      for (let i = 0; i < trams.length; i++) {
        const pts = trams[i];
        if (!pts || pts.length < 2) continue;
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let j = 1; j < pts.length; j++) {
          ctx.lineTo(pts[j][0], pts[j][1]);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();

    return {
      scale,
      canvas: offscreen,
      width: w,
      height: h,
    };
  }

  function pickTier(zoom) {
    if (!tiers.length) return null;
    for (let i = 0; i < tiers.length; i++) {
      if (zoom <= tiers[i].scale * 1.15) {
        return tiers[i];
      }
    }
    return tiers[tiers.length - 1];
  }

  /**
   * Normalize camera object with safe defaults
   */
  function normalizeCam(ctx, cam) {
    const dpr = window.devicePixelRatio || 1;
    const w = (cam && cam.w) || (ctx.canvas ? ctx.canvas.width / dpr : 800);
    const h = (cam && cam.h) || (ctx.canvas ? ctx.canvas.height / dpr : 600);
    const zoom = Math.max(0.15, Number(cam && cam.zoom) || 2.2);
    const x = Number(cam && cam.x) || 0;
    const y = Number(cam && cam.y) || 0;
    const rotation = Number(cam && cam.rotation) || 0;
    return { x, y, zoom, rotation, w, h };
  }

  /**
   * Check whether the caller already applied the world camera transform to ctx
   */
  function isAlreadyWorldTransformed(ctx, c) {
    if (typeof ctx.getTransform !== 'function') return false;
    const t = ctx.getTransform();
    const dpr = window.devicePixelRatio || 1;
    const scaleMag = Math.hypot(t.a, t.b);
    // If translation is near canvas center and scale matches zoom * dpr, caller transformed ctx
    const nearCenter =
      Math.abs(t.e - c.w * 0.5 * dpr) < c.w * 0.35 * dpr &&
      Math.abs(t.f - c.h * 0.5 * dpr) < c.h * 0.35 * dpr;
    const matchesZoom = Math.abs(scaleMag - c.zoom * dpr) < 0.25 * c.zoom * dpr && c.zoom !== 1;
    return nearCenter && matchesZoom;
  }

  /**
   * World-to-screen coordinate projection (returns screen CSS px)
   */
  function worldToScreen(wx, wy, c, cosR, sinR) {
    const dx = (wx - c.x) * c.zoom;
    const dy = (wy - c.y) * c.zoom;
    return {
      x: c.w * 0.5 + (dx * cosR - dy * sinR),
      y: c.h * 0.5 + (dx * sinR + dy * cosR),
    };
  }

  const MapView = {
    world: null,
    createMockMelbourneWorld,

    init(world) {
      currentWorld = world || createMockMelbourneWorld();
      this.world = currentWorld;
      worldBounds = computeBounds(currentWorld);
      preprocessWorld(currentWorld);

      // Pre-render 3 static zoom tiers (overview, city cruise, street close-up)
      tiers = [
        renderStaticTier(currentWorld, worldBounds, 0.85),
        renderStaticTier(currentWorld, worldBounds, 1.85),
        renderStaticTier(currentWorld, worldBounds, 3.4),
      ];

      // Notify Minimap if already loaded
      if (window.Minimap && typeof window.Minimap.setWorld === 'function') {
        window.Minimap.setWorld(currentWorld);
      }
    },

    drawBase(ctx, cam) {
      if (!ctx) return;
      if (!currentWorld) {
        this.init(createMockMelbourneWorld());
      }

      const c = normalizeCam(ctx, cam);
      const callerTransformed = isAlreadyWorldTransformed(ctx, c);
      const dpr = window.devicePixelRatio || 1;

      // Clear full canvas with Onyx background in screen space
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = PALETTE.onyx;
      ctx.fillRect(0, 0, c.w, c.h);
      ctx.restore();

      ctx.save();
      if (!callerTransformed) {
        ctx.translate(c.w * 0.5, c.h * 0.5);
        if (c.rotation) ctx.rotate(c.rotation);
        ctx.scale(c.zoom, c.zoom);
        ctx.translate(-c.x, -c.y);
      }

      // Draw cached offscreen static world tier
      const tier = pickTier(c.zoom);
      if (tier && tier.canvas) {
        ctx.drawImage(
          tier.canvas,
          worldBounds.minX,
          worldBounds.minY,
          worldBounds.width,
          worldBounds.height
        );
      }

      // At high zoom levels (> 3.2 px/m), overlay crisp vector road edges & chevrons for visible viewport
      if (c.zoom > 3.2) {
        const halfSpan = Math.hypot(c.w, c.h) / (2 * c.zoom) + 30;
        const vMinX = c.x - halfSpan;
        const vMaxX = c.x + halfSpan;
        const vMinY = c.y - halfSpan;
        const vMaxY = c.y + halfSpan;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (let i = 0; i < roadMeta.length; i++) {
          const rm = roadMeta[i];
          if (rm.maxX < vMinX || rm.minX > vMaxX || rm.maxY < vMinY || rm.minY > vMaxY) {
            continue;
          }
          const pts = rm.points;
          ctx.strokeStyle = rm.isMajor
            ? 'rgba(99, 49, 251, 0.48)'
            : 'rgba(99, 49, 251, 0.25)';
          ctx.lineWidth = 1.2 / c.zoom;
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let j = 1; j < pts.length; j++) {
            ctx.lineTo(pts[j][0], pts[j][1]);
          }
          ctx.stroke();
        }
      }

      ctx.restore();
    },

    drawOverlay(ctx, cam, hud = {}) {
      if (!ctx) return;
      if (!currentWorld) {
        this.init(createMockMelbourneWorld());
      }

      const c = normalizeCam(ctx, cam);
      const callerTransformed = isAlreadyWorldTransformed(ctx, c);
      const dpr = window.devicePixelRatio || 1;
      const now = performance.now();

      const ndState = window.NeuroDrive && window.NeuroDrive.state;
      const route = (hud && hud.route) || (ndState && ndState.route) || [];
      const signals = (hud && hud.signals) || (currentWorld && currentWorld.signals) || [];
      const destination =
        (hud && hud.destination) ||
        (ndState && ndState.destination) ||
        (route.length > 0
          ? { name: 'Destination', x: route[route.length - 1][0], y: route[route.length - 1][1] }
          : null);

      const halfSpan = Math.hypot(c.w, c.h) / (2 * c.zoom) + 60;
      const vMinX = c.x - halfSpan;
      const vMaxX = c.x + halfSpan;
      const vMinY = c.y - halfSpan;
      const vMaxY = c.y + halfSpan;

      // --- PART 1: World-Space Overlays (Route, Destination Beacon, Traffic Signals) ---
      ctx.save();
      if (!callerTransformed) {
        ctx.translate(c.w * 0.5, c.h * 0.5);
        if (c.rotation) ctx.rotate(c.rotation);
        ctx.scale(c.zoom, c.zoom);
        ctx.translate(-c.x, -c.y);
      }

      // 1A. Glowing Mint Dashed Route Line
      if (route && route.length >= 2) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Soft outer mint glow
        ctx.strokeStyle = 'rgba(136, 249, 192, 0.24)';
        ctx.lineWidth = Math.max(4.5, 10 / c.zoom);
        ctx.beginPath();
        ctx.moveTo(route[0][0], route[0][1]);
        for (let i = 1; i < route.length; i++) {
          ctx.lineTo(route[i][0], route[i][1]);
        }
        ctx.stroke();

        // Crisp dashed mint core
        const dashUnit = Math.max(3, 8 / c.zoom);
        ctx.strokeStyle = PALETTE.mint;
        ctx.lineWidth = Math.max(1.6, 3 / c.zoom);
        ctx.setLineDash([dashUnit * 1.4, dashUnit]);
        ctx.lineDashOffset = -((now * 0.015) % (dashUnit * 2.4));
        ctx.stroke();
        ctx.restore();
      }

      // 1B. Traffic Signals (dots coloured by hud.signals state within strict palette)
      if (signals && signals.length > 0) {
        const dotR = Math.max(1.6, 3.6 / c.zoom);
        for (let i = 0; i < signals.length; i++) {
          const sig = signals[i];
          if (sig.x < vMinX || sig.x > vMaxX || sig.y < vMinY || sig.y > vMaxY) continue;

          const st = sig.state || 'green';
          ctx.beginPath();
          ctx.arc(sig.x, sig.y, dotR * 1.75, 0, Math.PI * 2);
          if (st === 'green') {
            ctx.fillStyle = 'rgba(136, 249, 192, 0.28)';
          } else if (st === 'amber') {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
          } else {
            ctx.fillStyle = 'rgba(99, 49, 251, 0.42)';
          }
          ctx.fill();

          ctx.beginPath();
          ctx.arc(sig.x, sig.y, dotR, 0, Math.PI * 2);
          if (st === 'green') {
            ctx.fillStyle = PALETTE.mint;
          } else if (st === 'amber') {
            ctx.fillStyle = PALETTE.white;
          } else {
            ctx.fillStyle = PALETTE.indigo;
          }
          ctx.fill();

          // Crisp rim on red signals for instant contrast
          if (st === 'red') {
            ctx.strokeStyle = PALETTE.white;
            ctx.lineWidth = Math.max(0.4, 1 / c.zoom);
            ctx.stroke();
          }
        }
      }

      // 1C. Destination Marker with Expanding Pulse Ring
      if (destination && Number.isFinite(destination.x) && Number.isFinite(destination.y)) {
        const pulsePhase = (now % 1800) / 1800;
        const baseR = Math.max(4, 9 / c.zoom);
        const pulseR = baseR * (1 + pulsePhase * 2.4);

        ctx.beginPath();
        ctx.arc(destination.x, destination.y, pulseR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(136, 249, 192, ${(1 - pulsePhase) * 0.75})`;
        ctx.lineWidth = Math.max(0.8, 2 / c.zoom);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(destination.x, destination.y, baseR, 0, Math.PI * 2);
        ctx.fillStyle = PALETTE.onyx;
        ctx.fill();
        ctx.lineWidth = Math.max(1.2, 2.5 / c.zoom);
        ctx.strokeStyle = PALETTE.mint;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(destination.x, destination.y, baseR * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = PALETTE.mint;
        ctx.fill();
      }

      ctx.restore();

      // --- PART 2: Screen-Space Typography (Rotated Street Labels, Landmarks, Destination Tag) ---
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      resetLabelCuller();

      const cosR = Math.cos(c.rotation);
      const sinR = Math.sin(c.rotation);

      // 2A. Destination Floating Label
      if (destination && Number.isFinite(destination.x) && Number.isFinite(destination.y)) {
        const sp = worldToScreen(destination.x, destination.y, c, cosR, sinR);
        if (sp.x >= -80 && sp.x <= c.w + 80 && sp.y >= -40 && sp.y <= c.h + 40) {
          const text = (destination.name || 'DESTINATION').toUpperCase();
          ctx.font = '700 10px Inter, system-ui, sans-serif';
          const tw = ctx.measureText(text).width;
          const boxW = tw + 16;
          const boxH = 20;
          const bx = sp.x - boxW * 0.5;
          const by = sp.y - 28;

          tryPlaceLabelBox(sp.x, by + boxH * 0.5, boxW * 0.5 + 6, boxH * 0.5 + 6);

          ctx.fillStyle = 'rgba(1, 1, 13, 0.88)';
          ctx.strokeStyle = PALETTE.mint;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.roundRect(bx, by, boxW, boxH, 999);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = PALETTE.mint;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, sp.x, by + boxH * 0.5 + 0.5);
        }
      }

      // 2B. Landmark Pins with Names
      const landmarks = (currentWorld && currentWorld.landmarks) || [];
      ctx.font = '600 10.5px Inter, system-ui, sans-serif';
      for (let i = 0; i < landmarks.length; i++) {
        const lm = landmarks[i];
        if (lm.x < vMinX || lm.x > vMaxX || lm.y < vMinY || lm.y > vMaxY) continue;
        const sp = worldToScreen(lm.x, lm.y, c, cosR, sinR);
        if (sp.x < 20 || sp.x > c.w - 20 || sp.y < 20 || sp.y > c.h - 20) continue;

        const tw = ctx.measureText(lm.name).width;
        const halfW = tw * 0.5 + 14;
        const halfH = 12;
        if (!tryPlaceLabelBox(sp.x, sp.y - 12, halfW, halfH)) continue;

        // Diamond pin
        ctx.save();
        ctx.translate(sp.x, sp.y);
        ctx.rotate(Math.PI * 0.25);
        ctx.fillStyle = PALETTE.mint;
        ctx.strokeStyle = PALETTE.onyx;
        ctx.lineWidth = 1.5;
        ctx.fillRect(-3.5, -3.5, 7, 7);
        ctx.strokeRect(-3.5, -3.5, 7, 7);
        ctx.restore();

        // Pill backdrop
        const pillW = tw + 14;
        const pillH = 18;
        ctx.fillStyle = 'rgba(1, 1, 13, 0.82)';
        ctx.strokeStyle = 'rgba(99, 49, 251, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(sp.x - pillW * 0.5, sp.y - 24, pillW, pillH, 999);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = PALETTE.white;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(lm.name, sp.x, sp.y - 15);
      }

      // 2C. Rotated Street Name Labels along roads (Inter, small-caps style, collision culled)
      if (c.zoom >= 0.65) {
        ctx.font = '600 9.5px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < labelCandidates.length; i++) {
          const cand = labelCandidates[i];
          if (!cand.isMajor && c.zoom < 1.35) continue;
          if (cand.x < vMinX || cand.x > vMaxX || cand.y < vMinY || cand.y > vMaxY) continue;

          const sp = worldToScreen(cand.x, cand.y, c, cosR, sinR);
          if (sp.x < 40 || sp.x > c.w - 40 || sp.y < 24 || sp.y > c.h - 24) continue;

          const approxW = cand.upper.length * 6.2 + 12;
          if (!tryPlaceLabelBox(sp.x, sp.y, approxW * 0.5, 11)) continue;

          let screenAngle = cand.angle + c.rotation;
          // Keep text upright
          if (screenAngle > Math.PI * 0.5) screenAngle -= Math.PI;
          if (screenAngle < -Math.PI * 0.5) screenAngle += Math.PI;

          ctx.save();
          ctx.translate(sp.x, sp.y);
          ctx.rotate(screenAngle);

          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(1, 1, 13, 0.92)';
          ctx.strokeText(cand.upper, 0, 0);

          ctx.fillStyle = cand.isMajor
            ? 'rgba(255, 255, 255, 0.82)'
            : 'rgba(255, 255, 255, 0.56)';
          ctx.fillText(cand.upper, 0, 0);
          ctx.restore();
        }
      }

      ctx.restore();
    },
  };

  window.MapView = MapView;
})();
