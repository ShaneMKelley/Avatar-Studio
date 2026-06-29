import * as THREE from 'three';

export interface NavObstacle {
  position: { x: number; z: number };
  radius: number;
  penalty: number;
}

// NavMesh Cost Map Config
const CELL_SIZE = 0.6; // precise pathing resolution (0.6 meters per grid cell)
const MIN_X = -25.0;
const MAX_X = 25.0;
const MIN_Z = -25.0;
const MAX_Z = 25.0;

const GRID_WIDTH = Math.round((MAX_X - MIN_X) / CELL_SIZE);
const GRID_HEIGHT = Math.round((MAX_Z - MIN_Z) / CELL_SIZE);

/**
 * Checks if a world position is inside the walkable zone of a specific room.
 * For the 'main' lounge, it models the circular lobby + the narrow balcony pathway.
 */
export function isWalkable(x: number, z: number, room: string): boolean {
  if (room === 'main') {
    // Balcony corridor: narrow strip extending towards positive Z
    const onBalcony = Math.abs(x) <= 2.6 && z >= 0.0 && z <= 13.5;
    if (onBalcony) return true;

    // Main circular lobby of radius 21m
    const distSq = x * x + z * z;
    if (distSq <= 21.0 * 21.0) {
      // Avoid center structural column if there is one (lounge center is open but let's keep a tiny buffer)
      if (distSq < 0.8 * 0.8) return false;
      return true;
    }
    return false;
  } else {
    // Other rooms (club, garden, arena) are generally open circular spaces of radius 24m
    const distSq = x * x + z * z;
    return distSq <= 24.0 * 24.0;
  }
}

// Convert world space coordinates to grid coordinates
function worldToGrid(x: number, z: number): { gx: number; gz: number } {
  const gx = Math.round((x - MIN_X) / CELL_SIZE);
  const gz = Math.round((z - MIN_Z) / CELL_SIZE);
  return {
    gx: Math.max(0, Math.min(GRID_WIDTH - 1, gx)),
    gz: Math.max(0, Math.min(GRID_HEIGHT - 1, gz)),
  };
}

// Convert grid coordinates back to world space coordinates
function gridToWorld(gx: number, gz: number): { x: number; z: number } {
  const x = MIN_X + gx * CELL_SIZE;
  const z = MIN_Z + gz * CELL_SIZE;
  return { x, z };
}

/**
 * Calculates the dynamic cost at a given world position, based on base terrain and dynamic obstacle cost penalties.
 */
export function getCostAt(x: number, z: number, room: string, obstacles: NavObstacle[]): number {
  if (!isWalkable(x, z, room)) {
    return Infinity;
  }

  let totalCost = 1.0; // Base terrain traversal cost

  // Add dynamic penalties for player-occupied spaces or active physics props
  for (const obs of obstacles) {
    const dx = x - obs.position.x;
    const dz = z - obs.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    
    if (dist < obs.radius) {
      // Exponential falloff so cost is highest near center of obstacle
      const ratio = 1.0 - dist / obs.radius;
      totalCost += obs.penalty * (ratio * ratio);
    }
  }

  return totalCost;
}

interface AStarNode {
  gx: number;
  gz: number;
  g: number; // Cost from start node
  h: number; // Heuristic estimate to target node
  f: number; // Total cost (g + h)
  parent: AStarNode | null;
}

/**
 * Project a point to the nearest walkable cell on the NavMesh.
 * This is crucial to ensure start/end nodes don't fall outside the map.
 */
export function projectToWalkable(x: number, z: number, room: string): { x: number; z: number } {
  if (isWalkable(x, z, room)) {
    return { x, z };
  }

  let bestX = x;
  let bestZ = z;
  let minDist = Infinity;

  // Search in expanding circles for the closest walkable grid point
  for (let r = 1; r <= 8; r++) {
    const steps = r * 8;
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const testX = x + Math.cos(angle) * r * CELL_SIZE;
      const testZ = z + Math.sin(angle) * r * CELL_SIZE;

      if (isWalkable(testX, testZ, room)) {
        const d = (testX - x) * (testX - x) + (testZ - z) * (testZ - z);
        if (d < minDist) {
          minDist = d;
          bestX = testX;
          bestZ = testZ;
        }
      }
    }
    if (minDist < Infinity) {
      break;
    }
  }

  return { x: bestX, z: bestZ };
}

/**
 * Finds the optimal path using the A* Algorithm on the dynamic cost-map NavMesh.
 */
export function findPath(
  startPos: { x: number; z: number },
  endPos: { x: number; z: number },
  room: string,
  obstacles: NavObstacle[]
): { x: number; z: number }[] {
  // 1. Ensure start and end positions are clamped inside walkable areas
  const startWalkable = projectToWalkable(startPos.x, startPos.z, room);
  const endWalkable = projectToWalkable(endPos.x, endPos.z, room);

  const startGrid = worldToGrid(startWalkable.x, startWalkable.z);
  const endGrid = worldToGrid(endWalkable.x, endWalkable.z);

  // If start and end are already in the same cell, return direct path
  if (startGrid.gx === endGrid.gx && startGrid.gz === endGrid.gz) {
    return [endWalkable];
  }

  // A* structures
  const openSet: AStarNode[] = [];
  const closedSet = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);

  const heuristic = (ax: number, az: number, bx: number, bz: number): number => {
    // Diagonal Octile distance heuristic for 8-way movement
    const dx = Math.abs(ax - bx);
    const dz = Math.abs(az - bz);
    return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
  };

  const getClosedIndex = (gx: number, gz: number): number => {
    return gz * GRID_WIDTH + gx;
  };

  const startNode: AStarNode = {
    gx: startGrid.gx,
    gz: startGrid.gz,
    g: 0,
    h: heuristic(startGrid.gx, startGrid.gz, endGrid.gx, endGrid.gz),
    f: 0,
    parent: null,
  };
  startNode.f = startNode.g + startNode.h;

  openSet.push(startNode);

  let limit = 1200; // Search limit to prevent freezing on extremely complex queries
  let bestFailureNode: AStarNode | null = null; // Fallback to closest node if path is fully blocked

  while (openSet.length > 0 && limit-- > 0) {
    // Sort to find lowest 'f' cost
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift()!;

    // Mark as closed
    closedSet[getClosedIndex(current.gx, current.gz)] = 1;

    // Track best backup node in case target is unreachable
    if (!bestFailureNode || current.h < bestFailureNode.h) {
      bestFailureNode = current;
    }

    // Target Reached!
    if (current.gx === endGrid.gx && current.gz === endGrid.gz) {
      return reconstructPath(current);
    }

    // Explore 8 neighbors
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue;

        const nx = current.gx + dx;
        const nz = current.gz + dz;

        // Boundary check
        if (nx < 0 || nx >= GRID_WIDTH || nz < 0 || nz >= GRID_HEIGHT) continue;

        // Closed check
        const idx = getClosedIndex(nx, nz);
        if (closedSet[idx] === 1) continue;

        // Calculate cost
        const worldPos = gridToWorld(nx, nz);
        const cellCost = getCostAt(worldPos.x, worldPos.z, room, obstacles);

        if (cellCost === Infinity) continue; // Impassable obstacle/wall

        const isDiagonal = dx !== 0 && dz !== 0;
        const stepCost = (isDiagonal ? Math.SQRT2 : 1.0) * cellCost;
        const tentativeG = current.g + stepCost;

        // Check if neighbor already in open set
        let existingNode = openSet.find(n => n.gx === nx && n.gz === nz);

        if (!existingNode) {
          const neighborNode: AStarNode = {
            gx: nx,
            gz: nz,
            g: tentativeG,
            h: heuristic(nx, nz, endGrid.gx, endGrid.gz),
            f: 0,
            parent: current,
          };
          neighborNode.f = neighborNode.g + neighborNode.h;
          openSet.push(neighborNode);
        } else if (tentativeG < existingNode.g) {
          existingNode.g = tentativeG;
          existingNode.f = tentativeG + existingNode.h;
          existingNode.parent = current;
        }
      }
    }
  }

  // If search limit exceeded or fully blocked, reconstruct path to closest possible point
  if (bestFailureNode) {
    return reconstructPath(bestFailureNode);
  }

  return [endWalkable];
}

function reconstructPath(node: AStarNode): { x: number; z: number }[] {
  const path: { x: number; z: number }[] = [];
  let curr: AStarNode | null = node;
  while (curr !== null) {
    path.push(gridToWorld(curr.gx, curr.gz));
    curr = curr.parent;
  }
  path.reverse();

  // Smooth the path points slightly to prevent sharp grid-like turning artifacts
  return smoothPath(path);
}

/**
 * Applies a simple string pulling or path smoothing pass to keep the walk lines looking continuous and organic.
 */
function smoothPath(path: { x: number; z: number }[]): { x: number; z: number }[] {
  if (path.length <= 2) return path;

  const smoothed: { x: number; z: number }[] = [];
  smoothed.push(path[0]);

  let i = 0;
  while (i < path.length - 1) {
    let nextVisibleIndex = i + 1;
    // Check ahead up to 4 nodes to see if we can skip intermediate nodes safely
    for (let j = i + 2; j < Math.min(path.length, i + 5); j++) {
      if (isLineWalkable(path[i], path[j])) {
        nextVisibleIndex = j;
      }
    }
    smoothed.push(path[nextVisibleIndex]);
    i = nextVisibleIndex;
  }

  return smoothed;
}

// Check if a direct line between two points is entirely walkable
function isLineWalkable(p1: { x: number; z: number }, p2: { x: number; z: number }): boolean {
  const steps = 6;
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const tx = p1.x + (p2.x - p1.x) * t;
    const tz = p1.z + (p2.z - p1.z) * t;
    // We only check basic walkability to avoid cutting corners through walls
    if (!isWalkable(tx, tz, 'main')) return false;
  }
  return true;
}
