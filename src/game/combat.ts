import { segmentIntersectsWall } from './acoustics';
import type { EnemyArchetype, WallBox, WeaponId } from './types';

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  magSize: number;
  fireRateMs: number;
  damage: number;
  headshotMultiplier: number;
  recoilPitch: number;
  recoilYaw: number;
  hipSpread: number;
  adsSpread: number;
  moveSpreadFactor: number;
  bloomPerShot: number;
  maxBloom: number;
  bloomRecoveryPerSec: number;
  reloadTimeMs: number;
  automatic: boolean;
}

export const WEAPON_SPECS: Record<WeaponId, WeaponSpec> = {
  carbine: {
    id: 'carbine',
    name: 'MK18 MOD 1 // 5.56',
    magSize: 30,
    fireRateMs: 92,
    damage: 34,
    headshotMultiplier: 2.35,
    recoilPitch: 0.022,
    recoilYaw: 0.011,
    hipSpread: 0.014,
    adsSpread: 0.0022,
    moveSpreadFactor: 0.026,
    bloomPerShot: 0.0065,
    maxBloom: 0.042,
    bloomRecoveryPerSec: 0.055,
    reloadTimeMs: 1450,
    automatic: true,
  },
  sidearm: {
    id: 'sidearm',
    name: 'G19 TACTICAL // 9MM',
    magSize: 15,
    fireRateMs: 165,
    damage: 28,
    headshotMultiplier: 2.1,
    recoilPitch: 0.028,
    recoilYaw: 0.009,
    hipSpread: 0.011,
    adsSpread: 0.0028,
    moveSpreadFactor: 0.018,
    bloomPerShot: 0.0085,
    maxBloom: 0.036,
    bloomRecoveryPerSec: 0.068,
    reloadTimeMs: 1050,
    automatic: false,
  },
};

export interface DynamicSpreadInput {
  weapon: WeaponId;
  /** Current horizontal movement speed in m/s (0 = stationary, ~4.25 = walk, ~6.2 = sprint) */
  moveSpeed: number;
  /** Accumulated firing bloom in radians (0..spec.maxBloom) */
  fireBloom: number;
  /** Smooth ADS interpolation 0..1 */
  adsBlend: number;
  crouching: boolean;
  isReloading: boolean;
}

export interface DynamicSpreadResult {
  effectiveSpreadRad: number;
  targetGapPx: number;
  targetScale: number;
  targetOpacity: number;
  bloomRatio: number;
}

/**
 * Advances weapon firing bloom recovery over dt seconds.
 */
export function stepFireBloom(currentBloom: number, weapon: WeaponId, dt: number): number {
  if (currentBloom <= 0) return 0;
  const spec = WEAPON_SPECS[weapon];
  return Math.max(0, currentBloom - spec.bloomRecoveryPerSec * dt);
}

/**
 * Computes live ballistic spread cone (radians) and matching dynamic crosshair geometry
 * from player movement speed, firing bloom, posture, and current weapon accuracy.
 */
export function computeDynamicSpread(input: DynamicSpreadInput): DynamicSpreadResult {
  const spec = WEAPON_SPECS[input.weapon];
  const speedNorm = Math.min(1.4, Math.max(0, input.moveSpeed / 4.5));
  const postureMult = input.crouching ? 0.72 : 1.0;

  const hipTotal =
    (spec.hipSpread + speedNorm * spec.moveSpreadFactor) * postureMult + input.fireBloom;
  const adsTotal = spec.adsSpread + input.fireBloom * 0.28;

  const adsClamped = Math.max(0, Math.min(1, input.adsBlend));
  const effectiveSpreadRad = hipTotal + (adsTotal - hipTotal) * adsClamped;

  // Map angular spread (typically 0.008..0.08 rad) into responsive HUD pixel gap & scale
  const spreadPx = effectiveSpreadRad * 540;
  const reloadExpand = input.isReloading ? 8 : 0;
  const targetGapPx = Math.max(4, Math.min(54, 4 + spreadPx + reloadExpand));

  const bloomRatio = spec.maxBloom > 0 ? Math.min(1, input.fireBloom / spec.maxBloom) : 0;
  const targetScale = 1 + Math.min(0.65, speedNorm * 0.18 + bloomRatio * 0.45);
  const targetOpacity = (1 - adsClamped) * (input.isReloading ? 0.45 : 1);

  return {
    effectiveSpreadRad,
    targetGapPx,
    targetScale,
    targetOpacity,
    bloomRatio,
  };
}

export interface PlayerVitality {
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
}

/**
 * Applies incoming tactical ballistic damage to armor vest first (65% absorption) then health.
 * Never clamps health to a fake 1 HP floor; zero HP triggers defeat cleanly.
 */
export function applyPlayerDamage(vitality: PlayerVitality, rawDamage: number): PlayerVitality {
  if (rawDamage <= 0 || vitality.health <= 0) return vitality;

  let armor = vitality.armor;
  let health = vitality.health;

  if (armor > 0) {
    const absorbed = Math.min(armor, rawDamage * 0.65);
    armor = Math.max(0, armor - absorbed);
    const bleed = rawDamage - absorbed;
    health = Math.max(0, health - bleed);
  } else {
    health = Math.max(0, health - rawDamage);
  }

  return {
    ...vitality,
    health: Math.round(health * 10) / 10,
    armor: Math.round(armor * 10) / 10,
  };
}

/**
 * Resolves a 2D circle (player/enemy radius) against static level AABBs with smooth wall sliding.
 */
export function resolveCircleAgainstWalls(
  x: number,
  z: number,
  radius: number,
  walls: readonly WallBox[],
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
): { x: number; z: number } {
  let rx = Math.max(bounds.minX + radius, Math.min(bounds.maxX - radius, x));
  let rz = Math.max(bounds.minZ + radius, Math.min(bounds.maxZ - radius, z));

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (w.height < 0.4) continue;
      const closestX = Math.max(w.minX, Math.min(rx, w.maxX));
      const closestZ = Math.max(w.minZ, Math.min(rz, w.maxZ));

      const dx = rx - closestX;
      const dz = rz - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const overlap = radius - dist;
          rx += (dx / dist) * overlap;
          rz += (dz / dist) * overlap;
        } else {
          // Center inside box: push out along shallowest axis
          const left = Math.abs(rx - w.minX);
          const right = Math.abs(w.maxX - rx);
          const top = Math.abs(rz - w.minZ);
          const bottom = Math.abs(w.maxZ - rz);
          const m = Math.min(left, right, top, bottom);
          if (m === left) rx = w.minX - radius;
          else if (m === right) rx = w.maxX + radius;
          else if (m === top) rz = w.minZ - radius;
          else rz = w.maxZ + radius;
        }
      }
    }
  }

  return { x: rx, z: rz };
}

/**
 * Checks whether an unobstructed line of sight exists between two 3D points.
 */
export function hasLineOfSight(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  walls: readonly WallBox[],
): boolean {
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (!w.blocksSight) continue;
    if (segmentIntersectsWall(ax, ay, az, bx, by, bz, w)) {
      return false;
    }
  }
  return true;
}

export type EnemyState = 'patrol' | 'alert' | 'windup' | 'firing' | 'reposition' | 'ko';

export interface EnemyBehaviorConfig {
  archetype: EnemyArchetype;
  maxHp: number;
  speed: number;
  preferredRange: number;
  windupDuration: number;
  burstCount: number;
  burstInterval: number;
  damage: number;
  scoreValue: number;
}

export const ENEMY_CONFIGS: Record<EnemyArchetype, EnemyBehaviorConfig> = {
  rifleman: {
    archetype: 'rifleman',
    maxHp: 90,
    speed: 3.1,
    preferredRange: 10.5,
    windupDuration: 0.45,
    burstCount: 3,
    burstInterval: 0.14,
    damage: 13,
    scoreValue: 150,
  },
  breacher: {
    archetype: 'breacher',
    maxHp: 115,
    speed: 4.35,
    preferredRange: 4.2,
    windupDuration: 0.38,
    burstCount: 2,
    burstInterval: 0.28,
    damage: 18,
    scoreValue: 220,
  },
  marksman: {
    archetype: 'marksman',
    maxHp: 75,
    speed: 2.3,
    preferredRange: 18.0,
    windupDuration: 0.72,
    burstCount: 1,
    burstInterval: 0.5,
    damage: 26,
    scoreValue: 280,
  },
};

/**
 * Computes desired movement direction & next state for each distinct enemy policy.
 * - Rifleman: holds medium range, strafes laterally while suppressing.
 * - Breacher: aggressively closes distance to flank within 4.2m.
 * - Marksman: maintains long sightlines (18m+), backs away if player rushes inside 11m.
 */
export function computeEnemyIntent(
  archetype: EnemyArchetype,
  state: EnemyState,
  distToPlayer: number,
  canSeePlayer: boolean,
  hasAttackToken: boolean,
  stateTimer: number,
): {
  nextState: EnemyState;
  moveForward: number; // -1 backpedal, 0 hold, +1 advance
  strafeDir: number; // -1..1
} {
  if (state === 'ko') {
    return { nextState: 'ko', moveForward: 0, strafeDir: 0 };
  }

  const cfg = ENEMY_CONFIGS[archetype];

  if (!canSeePlayer) {
    if (state === 'windup' || state === 'firing') {
      return { nextState: 'alert', moveForward: 1, strafeDir: 0 };
    }
    if (state === 'alert') {
      return {
        nextState: 'alert',
        moveForward: archetype === 'breacher' ? 1 : 0.65,
        strafeDir: archetype === 'rifleman' ? 0.4 : 0,
      };
    }
    return { nextState: 'patrol', moveForward: 0.45, strafeDir: 0 };
  }

  // Player is visible
  if (state === 'patrol' || state === 'alert' || state === 'reposition') {
    if (hasAttackToken && stateTimer <= 0) {
      return { nextState: 'windup', moveForward: 0, strafeDir: 0 };
    }

    if (archetype === 'breacher') {
      return {
        nextState: 'alert',
        moveForward: distToPlayer > cfg.preferredRange ? 1 : 0.2,
        strafeDir: 0.55,
      };
    }

    if (archetype === 'marksman') {
      const tooClose = distToPlayer < 11;
      const tooFar = distToPlayer > 22;
      return {
        nextState: 'alert',
        moveForward: tooClose ? -0.9 : tooFar ? 0.6 : 0,
        strafeDir: 0.2,
      };
    }

    // Rifleman: maintain tactical mid-range and strafe
    const tooClose = distToPlayer < 6;
    const tooFar = distToPlayer > 14;
    return {
      nextState: 'alert',
      moveForward: tooClose ? -0.6 : tooFar ? 0.75 : 0,
      strafeDir: 0.8,
    };
  }

  if (state === 'windup') {
    return { nextState: 'windup', moveForward: 0, strafeDir: 0 };
  }

  // firing
  return {
    nextState: 'firing',
    moveForward: archetype === 'breacher' && distToPlayer > 5 ? 0.5 : 0,
    strafeDir: archetype === 'rifleman' ? 0.45 : 0,
  };
}
