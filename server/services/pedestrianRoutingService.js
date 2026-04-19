import { haversineDistanceMeters } from './metroFallbackService.js';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const DEFAULT_TIMEOUT_MS = Number(process.env.PEDESTRIAN_ROUTE_TIMEOUT_MS || 25000);
const DEFAULT_BUFFER_METERS = Number(process.env.PEDESTRIAN_ROUTE_BUFFER_METERS || 450);
const DEFAULT_CONNECTOR_METERS = Number(process.env.PEDESTRIAN_ROUTE_CONNECTOR_METERS || 350);
const DEFAULT_CONNECTOR_COUNT = Number(process.env.PEDESTRIAN_ROUTE_CONNECTOR_COUNT || 6);

const BLOCKED_HIGHWAYS = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'construction',
  'proposed',
  'raceway',
  'bridleway',
  'bus_guideway',
  'escape',
]);

const BLOCKED_ACCESS_VALUES = new Set(['no', 'private']);

function isFiniteCoordinate(point) {
  return Number.isFinite(Number(point?.lat)) &&
    Number.isFinite(Number(point?.lon)) &&
    Number(point.lat) >= -90 &&
    Number(point.lat) <= 90 &&
    Number(point.lon) >= -180 &&
    Number(point.lon) <= 180;
}

function metersToLatitudeDegrees(meters) {
  return meters / 111320;
}

function metersToLongitudeDegrees(meters, latitude) {
  const denominator = 111320 * Math.cos((Number(latitude) * Math.PI) / 180);
  return meters / Math.max(denominator, 1);
}

function buildBounds(points = [], bufferMeters = DEFAULT_BUFFER_METERS) {
  const validPoints = points.filter(isFiniteCoordinate);
  if (!validPoints.length) {
    throw new Error('Нет координат для построения пешеходного маршрута');
  }

  const minLat = Math.min(...validPoints.map((point) => Number(point.lat)));
  const maxLat = Math.max(...validPoints.map((point) => Number(point.lat)));
  const minLon = Math.min(...validPoints.map((point) => Number(point.lon)));
  const maxLon = Math.max(...validPoints.map((point) => Number(point.lon)));
  const centerLat = (minLat + maxLat) / 2;
  const latBuffer = metersToLatitudeDegrees(bufferMeters);
  const lonBuffer = metersToLongitudeDegrees(bufferMeters, centerLat);

  return {
    south: minLat - latBuffer,
    west: minLon - lonBuffer,
    north: maxLat + latBuffer,
    east: maxLon + lonBuffer,
  };
}

function buildOverpassQuery(bounds) {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;

  return `
    [out:json][timeout:25];
    (
      way["highway"]["highway"!~"^(motorway|motorway_link|trunk|trunk_link|construction|proposed|raceway|bridleway|bus_guideway|escape)$"]["access"!~"^(no|private)$"]["foot"!~"^no$"](${bbox});
    );
    (._;>;);
    out body;
  `;
}

async function fetchOverpass(query) {
  const errors = [];

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'user-agent': 'ZemaApp/1.0 (pedestrian-routing)',
        },
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      errors.push(`${endpoint}: ${error.message}`);
    }
  }

  throw new Error(`Overpass недоступен: ${errors.join('; ')}`);
}

function isWalkableWay(way = {}) {
  const tags = way.tags || {};
  const highway = String(tags.highway || '').trim();

  if (!highway || BLOCKED_HIGHWAYS.has(highway)) {
    return false;
  }

  const access = String(tags.access || '').trim().toLowerCase();
  const foot = String(tags.foot || '').trim().toLowerCase();

  if (BLOCKED_ACCESS_VALUES.has(access) || foot === 'no') {
    return false;
  }

  return true;
}

function addEdge(adjacency, leftId, rightId, distance) {
  if (!Number.isFinite(distance) || distance <= 0) {
    return;
  }

  if (!adjacency.has(leftId)) adjacency.set(leftId, []);
  if (!adjacency.has(rightId)) adjacency.set(rightId, []);

  adjacency.get(leftId).push({ nodeId: rightId, distance });
  adjacency.get(rightId).push({ nodeId: leftId, distance });
}

function buildGraph(overpassPayload = {}) {
  const nodes = new Map();
  const ways = [];

  for (const element of overpassPayload.elements || []) {
    if (element.type === 'node') {
      nodes.set(String(element.id), {
        id: String(element.id),
        lat: Number(element.lat),
        lon: Number(element.lon),
      });
    } else if (element.type === 'way' && isWalkableWay(element)) {
      ways.push(element);
    }
  }

  const adjacency = new Map();

  for (const way of ways) {
    const wayNodes = Array.isArray(way.nodes) ? way.nodes.map(String) : [];

    for (let index = 1; index < wayNodes.length; index += 1) {
      const left = nodes.get(wayNodes[index - 1]);
      const right = nodes.get(wayNodes[index]);

      if (!isFiniteCoordinate(left) || !isFiniteCoordinate(right)) {
        continue;
      }

      addEdge(
        adjacency,
        left.id,
        right.id,
        haversineDistanceMeters(left, right)
      );
    }
  }

  return { nodes, adjacency };
}

function findNearestGraphNodes(nodes, point, { limit = DEFAULT_CONNECTOR_COUNT, maxDistanceMeters = DEFAULT_CONNECTOR_METERS } = {}) {
  return [...nodes.values()]
    .map((node) => ({
      node,
      distance: haversineDistanceMeters(point, node),
    }))
    .filter((item) => Number.isFinite(item.distance) && item.distance <= maxDistanceMeters)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, Math.max(1, Number(limit) || 1));
}

function connectVirtualNode(graph, virtualId, point) {
  const nearest = findNearestGraphNodes(graph.nodes, point);

  if (!nearest.length) {
    throw new Error('Не удалось привязать точку к пешеходному графу');
  }

  graph.nodes.set(virtualId, {
    id: virtualId,
    lat: Number(point.lat),
    lon: Number(point.lon),
  });

  for (const item of nearest) {
    addEdge(graph.adjacency, virtualId, item.node.id, item.distance);
  }
}

class MinHeap {
  constructor() {
    this.items = [];
  }

  push(item) {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop() {
    if (!this.items.length) return null;
    const root = this.items[0];
    const tail = this.items.pop();

    if (this.items.length) {
      this.items[0] = tail;
      this.bubbleDown(0);
    }

    return root;
  }

  bubbleUp(index) {
    let current = index;

    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      if (this.items[parent].distance <= this.items[current].distance) break;

      [this.items[parent], this.items[current]] = [this.items[current], this.items[parent]];
      current = parent;
    }
  }

  bubbleDown(index) {
    let current = index;

    while (true) {
      const left = current * 2 + 1;
      const right = current * 2 + 2;
      let smallest = current;

      if (left < this.items.length && this.items[left].distance < this.items[smallest].distance) {
        smallest = left;
      }

      if (right < this.items.length && this.items[right].distance < this.items[smallest].distance) {
        smallest = right;
      }

      if (smallest === current) break;

      [this.items[current], this.items[smallest]] = [this.items[smallest], this.items[current]];
      current = smallest;
    }
  }
}

function shortestPathDistance(adjacency, startId, endId) {
  const distances = new Map([[startId, 0]]);
  const heap = new MinHeap();
  heap.push({ nodeId: startId, distance: 0 });

  while (heap.items.length) {
    const current = heap.pop();

    if (current.nodeId === endId) {
      return current.distance;
    }

    if (current.distance > (distances.get(current.nodeId) ?? Infinity)) {
      continue;
    }

    for (const edge of adjacency.get(current.nodeId) || []) {
      const nextDistance = current.distance + edge.distance;

      if (nextDistance < (distances.get(edge.nodeId) ?? Infinity)) {
        distances.set(edge.nodeId, nextDistance);
        heap.push({ nodeId: edge.nodeId, distance: nextDistance });
      }
    }
  }

  return null;
}

export async function calculateWalkingRoutesToPoints({
  origin,
  destinations = [],
  bufferMeters = DEFAULT_BUFFER_METERS,
} = {}) {
  const validDestinations = destinations.filter(isFiniteCoordinate);

  if (!isFiniteCoordinate(origin) || !validDestinations.length) {
    return [];
  }

  const bounds = buildBounds([origin, ...validDestinations], bufferMeters);
  const payload = await fetchOverpass(buildOverpassQuery(bounds));
  const graph = buildGraph(payload);

  if (!graph.nodes.size || !graph.adjacency.size) {
    throw new Error('В зоне маршрута не найден пешеходный граф OSM');
  }

  connectVirtualNode(graph, 'origin', origin);

  return validDestinations.map((destination, index) => {
    const destinationId = `destination:${index}`;

    try {
      connectVirtualNode(graph, destinationId, destination);
      const distance = shortestPathDistance(graph.adjacency, 'origin', destinationId);

      return {
        ...destination,
        walkingDistance: Number.isFinite(distance) ? Math.round(distance) : null,
      };
    } catch (error) {
      return {
        ...destination,
        walkingDistance: null,
        walkingError: error.message,
      };
    }
  });
}

export async function calculateWalkingRouteDistance({ origin, destination } = {}) {
  const [route] = await calculateWalkingRoutesToPoints({
    origin,
    destinations: [destination],
  });

  return route?.walkingDistance ?? null;
}
