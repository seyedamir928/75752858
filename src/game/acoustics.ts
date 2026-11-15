import type { AcousticResult, WallBox } from './types';

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Ray/Segment vs 2D/3D AABB slab intersection test.
 * Checks segment from A -> B against wall box bounds (XZ footprint + vertical height).
 * Returns true if the acoustic ray passes through the solid obstacle.
 */
export function segmentIntersectsWall(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  wall: WallBox,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;

  let tMin = 0.001; // ignore self-origin jitter
  let tMax = 0.999;

  // X slab
  if (Math.abs(dx) < 1e-8) {
    if (ax < wall.minX || ax > wall.maxX) return false;
  } else {
    const invD = 1 / dx;
    let t1 = (wall.minX - ax) * invD;
    let t2 = (wall.maxX - ax) * invD;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  // Z slab
  if (Math.abs(dz) < 1e-8) {
    if (az < wall.minZ || az > wall.maxZ) return false;
  } else {
    const invD = 1 / dz;
    let t1 = (wall.minZ - az) * invD;
    let t2 = (wall.maxZ - az) * invD;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  // Y slab (0 to wall.height)
  if (Math.abs(dy) < 1e-8) {
    if (ay < 0 || ay > wall.height) return false;
  } else {
    const invD = 1 / dy;
    let t1 = (0 - ay) * invD;
    let t2 = (wall.height - ay) * invD;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  return tMin <= tMax;
}

/**
 * Counts how many solid walls intersect the acoustic ray between listener and source.
 */
export function countOccludingWalls(
  listener: Point3D,
  source: Point3D,
  walls: readonly WallBox[],
): { wallCount: number; totalDensity: number } {
  let wallCount = 0;
  let totalDensity = 0;

  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (segmentIntersectsWall(listener.x, listener.y, listener.z, source.x, source.y, source.z, w)) {
      wallCount++;
      totalDensity += w.acousticDensity;
    }
  }

  return { wallCount, totalDensity };
}

/**
 * Computes stereo azimuth pan (-1 left to +1 right) relative to listener yaw.
 * Listener forward vector in Three.js with yaw=0 faces -Z: (-sin(yaw), 0, -cos(yaw)).
 * Listener right vector: (cos(yaw), 0, -sin(yaw)).
 */
export function computeStereoPan(
  listenerX: number,
  listenerZ: number,
  listenerYaw: number,
  sourceX: number,
  sourceZ: number,
): number {
  const dx = sourceX - listenerX;
  const dz = sourceZ - listenerZ;
  const distSq = dx * dx + dz * dz;
  if (distSq < 1e-6) return 0;

  const invDist = 1 / Math.sqrt(distSq);
  const nx = dx * invDist;
  const nz = dz * invDist;

  // Right vector for Three.js camera rotated by Y = listenerYaw
  const rightX = Math.cos(listenerYaw);
  const rightZ = -Math.sin(listenerYaw);

  const dot = nx * rightX + nz * rightZ;
  return Math.max(-1, Math.min(1, dot));
}

/**
 * Computes full acoustic occlusion + proximity comms parameters for Web Audio DSP.
 * - Direct path (0 walls): crisp 18kHz+ cutoff, natural distance rolloff.
 * - Occluded path (1+ walls): steep low-pass attenuation (e.g., 1900Hz -> 620Hz)
 *   and dB gain reduction, plus smooth transition to tactical radio relay when far or heavily occluded.
 */
export function computeAcousticOcclusion(
  listener: Point3D,
  listenerYaw: number,
  source: Point3D,
  walls: readonly WallBox[],
  maxRange = 46,
): AcousticResult {
  const dx = source.x - listener.x;
  const dy = source.y - listener.y;
  const dz = source.z - listener.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  const { wallCount, totalDensity } = countOccludingWalls(listener, source, walls);

  // Distance falloff (inverse linear-quadratic hybrid clamped for playable readability)
  const clampedDist = Math.max(1.2, distance);
  const distFactor = Math.max(0, 1 - Math.pow(Math.min(clampedDist, maxRange) / maxRange, 1.35));

  // Wall acoustic transmission loss
  // Each full-density concrete wall drops ~9-12dB and crushes high frequencies
  const occlusionFactor = wallCount === 0 ? 1 : Math.pow(0.42, totalDensity);
  const gain = Math.max(0.02, Math.min(1, distFactor * occlusionFactor));

  // Low-pass cutoff frequency in Hz
  let cutoffHz = 19500;
  if (totalDensity > 0) {
    cutoffHz = Math.max(380, Math.round(3200 * Math.pow(0.42, totalDensity - 0.5)));
  }

  // dB loss relative to unobstructed close source
  const dbAttenuation = Math.round(20 * Math.log10(Math.max(0.01, occlusionFactor)));

  // Proximity-to-Radio mix:
  // Close & clear -> 0.08 (pure direct acoustic presence)
  // Occluded or >12m -> blends up to 0.85 encrypted tactical radio channel
  const distRadio = Math.min(1, Math.max(0, (distance - 6) / 18));
  const wallRadio = Math.min(1, totalDensity * 0.48);
  const radioMix = Math.min(0.9, 0.08 + Math.max(distRadio, wallRadio) * 0.82);

  const pan = computeStereoPan(listener.x, listener.z, listenerYaw, source.x, source.z);

  return {
    distance,
    wallCount,
    totalDensity,
    cutoffHz,
    gain,
    dbAttenuation,
    pan,
    radioMix,
    isOccluded: wallCount > 0,
  };
}
