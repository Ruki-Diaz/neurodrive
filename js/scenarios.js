// Curriculum. Anchors are resolved against the real street graph at runtime (intersection of two
// named streets, or the nearest street node to a landmark), so they survive data refreshes.
// Note: much of Swanston St is trams-only in OSM, so scenarios 1-2 use the blocks cars may drive.

import { planRoute } from './router.js';

export const SCENARIOS = [
  {
    id: 1,
    name: 'Swanston St straight',
    description: 'One straight block of Swanston Street, from Little Collins St to Collins St.',
    difficulty: 1,
    anchors: [{ cross: ['Swanston Street', 'Little Collins Street'] }, { cross: ['Swanston Street', 'Collins Street'] }],
    destination: 'Swanston St & Collins St',
    traffic: 0,
    signals: false,
  },
  {
    id: 2,
    name: 'First turn',
    description: 'Down Swanston Street, then a left turn into Collins Street as far as Russell St.',
    difficulty: 2,
    anchors: [
      { cross: ['Swanston Street', 'Little Collins Street'] },
      { cross: ['Swanston Street', 'Collins Street'] },
      { cross: ['Collins Street', 'Russell Street'] },
    ],
    destination: 'Collins St & Russell St',
    traffic: 0,
    signals: false,
  },
  {
    id: 3,
    name: 'Station to Market',
    description: 'Flinders Street Station to Queen Victoria Market through the Hoddle Grid.',
    difficulty: 3,
    anchors: [{ landmark: 'Flinders Street Station' }, { landmark: 'Queen Victoria Market' }],
    destination: 'Queen Victoria Market',
    traffic: 0,
    signals: false,
  },
  {
    id: 4,
    name: 'Rush hour',
    description: 'Station to Market again, now with traffic and live signals.',
    difficulty: 4,
    anchors: [{ landmark: 'Flinders Street Station' }, { landmark: 'Queen Victoria Market' }],
    destination: 'Queen Victoria Market',
    traffic: 0.5,
    signals: true,
  },
  {
    id: 5,
    name: 'CBD loop',
    description: 'Flinders Street Station, Southern Cross, Melbourne Central and back, in traffic.',
    difficulty: 5,
    anchors: [
      { landmark: 'Flinders Street Station' },
      { landmark: 'Southern Cross Station' },
      { landmark: 'Melbourne Central' },
      { landmark: 'Flinders Street Station' },
    ],
    destination: 'Flinders Street Station',
    traffic: 0.5,
    signals: true,
  },
];

export const scenarioList = () =>
  SCENARIOS.map(({ id, name, description, difficulty }) => ({ id, name, description, difficulty }));

function resolveAnchor(a, world, graph) {
  if (a.cross) {
    const nodes = graph.intersection(a.cross[0], a.cross[1]);
    if (!nodes.length) throw new Error(`No junction ${a.cross.join(' / ')}`);
    return nodes;
  }
  const lm = world.landmarks.find((l) => l.name === a.landmark);
  if (!lm) throw new Error(`Landmark missing: ${a.landmark}`);
  return graph.nodesNear(lm.x, lm.y);
}

// -> { def, route, start: {x, y, heading}, destination: {name, x, y}, timeLimit }
export function buildScenario(def, world, graph) {
  const anchors = def.anchors.map((a) => resolveAnchor(a, world, graph));
  const route = planRoute(graph, anchors);
  if (!route) throw new Error(`No route for scenario ${def.id}`);
  const [x, y] = route.points[0];
  const [ax, ay] = route.pointAt(4);
  const heading = Math.atan2(ax - x, -(ay - y));
  const [dx, dy] = route.points.at(-1);
  // Generous: average ~5 m/s (18 km/h), plus slack for lights.
  const timeLimit = 15 + route.length / 5 + (def.signals ? route.length / 25 : 0);
  return { def, route, start: { x, y, heading }, destination: { name: def.destination, x: dx, y: dy }, timeLimit };
}
