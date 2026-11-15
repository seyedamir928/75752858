import type { EnemyArchetype, WallBox } from './types';

export interface LevelPropDef {
  id: string;
  kind: 'container' | 'crates' | 'barrels' | 'barrier' | 'pillar' | 'server_rack';
  x: number;
  z: number;
  rotY?: number;
  color?: number;
}

export interface EnemySpawnDef {
  id: string;
  sector: number;
  archetype: EnemyArchetype;
  x: number;
  z: number;
  yaw: number;
  patrolTarget?: { x: number; z: number };
}

export interface LightFixtureDef {
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  flicker?: boolean;
}

export const ARENA_BOUNDS = {
  minX: -22,
  maxX: 22,
  minZ: -26,
  maxZ: 22,
};

/**
 * Player spawns in the south entry corridor facing North (-Z) down a wide 4m clear lane
 * toward Sector 1's warehouse doorway and illuminated industrial pillars.
 */
export const PLAYER_SPAWN = {
  x: 0,
  y: 1.62,
  z: 18.5,
  yaw: 0,
};

export const ALLY_SPAWN = {
  x: -2.2,
  z: 17.2,
};

/**
 * All solid walls and cover AABBs.
 * Corridors and doorways are >= 3.2m wide so players & AI never jam.
 */
export const LEVEL_WALLS: WallBox[] = [
  // Outer compound perimeter concrete walls
  { id: 'perim-n', minX: -22.5, maxX: 22.5, minZ: -26.8, maxZ: -26.0, height: 5.5, acousticDensity: 1.2, blocksSight: true },
  { id: 'perim-s', minX: -22.5, maxX: 22.5, minZ: 22.0, maxZ: 22.8, height: 5.5, acousticDensity: 1.2, blocksSight: true },
  { id: 'perim-w', minX: -22.8, maxX: -22.0, minZ: -26.8, maxZ: 22.8, height: 5.5, acousticDensity: 1.2, blocksSight: true },
  { id: 'perim-e', minX: 22.0, maxX: 22.8, minZ: -26.8, maxZ: 22.8, height: 5.5, acousticDensity: 1.2, blocksSight: true },

  // Entry vestibule side partitions (leaves wide 6m center breach at X: -3..3, Z: 12)
  { id: 'vestibule-w', minX: -22.0, maxX: -3.2, minZ: 11.4, maxZ: 12.2, height: 4.5, acousticDensity: 1.0, blocksSight: true },
  { id: 'vestibule-e', minX: 3.2, maxX: 22.0, minZ: 11.4, maxZ: 12.2, height: 4.5, acousticDensity: 1.0, blocksSight: true },

  // Sector 1 -> Sector 2 dividing bulkhead (doors at X: -14..-10, X: -2..2, and X: 10..14)
  { id: 'mid-wall-w1', minX: -22.0, maxX: -14.2, minZ: -2.6, maxZ: -1.8, height: 4.8, acousticDensity: 1.0, blocksSight: true },
  { id: 'mid-wall-w2', minX: -9.8, maxX: -2.4, minZ: -2.6, maxZ: -1.8, height: 4.8, acousticDensity: 1.0, blocksSight: true },
  { id: 'mid-wall-e1', minX: 2.4, maxX: 9.8, minZ: -2.6, maxZ: -1.8, height: 4.8, acousticDensity: 1.0, blocksSight: true },
  { id: 'mid-wall-e2', minX: 14.2, maxX: 22.0, minZ: -2.6, maxZ: -1.8, height: 4.8, acousticDensity: 1.0, blocksSight: true },

  // Interior room dividers (Office / Server wing in Sector 2 West & East)
  { id: 'wing-w-div', minX: -9.5, maxX: -8.7, minZ: -16.5, maxZ: -6.5, height: 4.2, acousticDensity: 0.9, blocksSight: true },
  { id: 'wing-e-div', minX: 8.7, maxX: 9.5, minZ: -16.5, maxZ: -6.5, height: 4.2, acousticDensity: 0.9, blocksSight: true },

  // Sector 2 -> Sector 3 North Loading Bay bulkhead (wide doorways at X: -12..-7 and X: 7..12)
  { id: 'north-wall-w', minX: -22.0, maxX: -12.4, minZ: -16.8, maxZ: -16.0, height: 5.0, acousticDensity: 1.05, blocksSight: true },
  { id: 'north-wall-c', minX: -6.6, maxX: 6.6, minZ: -16.8, maxZ: -16.0, height: 5.0, acousticDensity: 1.05, blocksSight: true },
  { id: 'north-wall-e', minX: 12.4, maxX: 22.0, minZ: -16.8, maxZ: -16.0, height: 5.0, acousticDensity: 1.05, blocksSight: true },

  // Structural Concrete Pillars in Sector 1
  { id: 'pillar-s1-w', minX: -6.8, maxX: -5.4, minZ: 3.4, maxZ: 4.8, height: 5.5, acousticDensity: 1.1, blocksSight: true },
  { id: 'pillar-s1-e', minX: 5.4, maxX: 6.8, minZ: 3.4, maxZ: 4.8, height: 5.5, acousticDensity: 1.1, blocksSight: true },

  // Waist/Chest-high tactical cover barriers & shipping containers (blocks low rays & movement; containers block sight)
  { id: 'cont-s1-w', minX: -16.2, maxX: -13.6, minZ: 2.0, maxZ: 8.0, height: 2.7, acousticDensity: 0.85, blocksSight: true },
  { id: 'cont-s1-e', minX: 13.6, maxX: 16.2, minZ: 2.0, maxZ: 8.0, height: 2.7, acousticDensity: 0.85, blocksSight: true },
  { id: 'barrier-s1-c', minX: -1.8, maxX: 1.8, minZ: 5.8, maxZ: 6.6, height: 1.15, acousticDensity: 0.65, blocksSight: false },
  { id: 'crates-s1-nw', minX: -11.5, maxX: -9.5, minZ: 1.5, maxZ: 3.5, height: 1.65, acousticDensity: 0.55, blocksSight: true },
  { id: 'crates-s1-ne', minX: 9.5, maxX: 11.5, minZ: 1.5, maxZ: 3.5, height: 1.65, acousticDensity: 0.55, blocksSight: true },

  // Sector 2 Cover
  { id: 'server-s2-c1', minX: -4.8, maxX: -3.4, minZ: -10.8, maxZ: -7.8, height: 2.2, acousticDensity: 0.8, blocksSight: true },
  { id: 'server-s2-c2', minX: 3.4, maxX: 4.8, minZ: -10.8, maxZ: -7.8, height: 2.2, acousticDensity: 0.8, blocksSight: true },
  { id: 'barrier-s2-c', minX: -1.6, maxX: 1.6, minZ: -12.6, maxZ: -11.8, height: 1.15, acousticDensity: 0.65, blocksSight: false },
  { id: 'crates-s2-w', minX: -16.5, maxX: -14.5, minZ: -11.0, maxZ: -9.0, height: 1.7, acousticDensity: 0.55, blocksSight: true },
  { id: 'crates-s2-e', minX: 14.5, maxX: 16.5, minZ: -11.0, maxZ: -9.0, height: 1.7, acousticDensity: 0.55, blocksSight: true },

  // Sector 3 Loading Bay Containers
  { id: 'cont-s3-c', minX: -3.0, maxX: 3.0, minZ: -22.2, maxZ: -19.6, height: 2.7, acousticDensity: 0.85, blocksSight: true },
  { id: 'crates-s3-w', minX: -17.5, maxX: -15.5, minZ: -23.0, maxZ: -21.0, height: 1.65, acousticDensity: 0.55, blocksSight: true },
  { id: 'crates-s3-e', minX: 15.5, maxX: 17.5, minZ: -23.0, maxZ: -21.0, height: 1.65, acousticDensity: 0.55, blocksSight: true },
];

export const LEVEL_PROPS: LevelPropDef[] = [
  { id: 'prop-cont-1', kind: 'container', x: -14.9, z: 5.0, rotY: 0, color: 0x3b4956 },
  { id: 'prop-cont-2', kind: 'container', x: 14.9, z: 5.0, rotY: 0, color: 0x5c372c },
  { id: 'prop-cont-3', kind: 'container', x: 0, z: -20.9, rotY: Math.PI / 2, color: 0x364d3e },
  { id: 'prop-bar-1', kind: 'barrier', x: 0, z: 6.2, rotY: 0 },
  { id: 'prop-bar-2', kind: 'barrier', x: 0, z: -12.2, rotY: 0 },
  { id: 'prop-crate-1', kind: 'crates', x: -10.5, z: 2.5 },
  { id: 'prop-crate-2', kind: 'crates', x: 10.5, z: 2.5 },
  { id: 'prop-crate-3', kind: 'crates', x: -15.5, z: -10.0 },
  { id: 'prop-crate-4', kind: 'crates', x: 15.5, z: -10.0 },
  { id: 'prop-crate-5', kind: 'crates', x: -16.5, z: -22.0 },
  { id: 'prop-crate-6', kind: 'crates', x: 16.5, z: -22.0 },
  { id: 'prop-srv-1', kind: 'server_rack', x: -4.1, z: -9.3 },
  { id: 'prop-srv-2', kind: 'server_rack', x: 4.1, z: -9.3 },
  { id: 'prop-brl-1', kind: 'barrels', x: -2.6, z: 10.2 },
  { id: 'prop-brl-2', kind: 'barrels', x: 11.8, z: 9.2 },
  { id: 'prop-brl-3', kind: 'barrels', x: -12.5, z: -4.5 },
  { id: 'prop-brl-4', kind: 'barrels', x: 12.2, z: -18.2 },
];

export const LEVEL_LIGHTS: LightFixtureDef[] = [
  // Vestibule cool cyan emergency light
  { x: 0, y: 4.6, z: 16.0, color: 0x6ba6c9, intensity: 1.6, flicker: false },
  // Sector 1 sodium-amber warehouse overheads
  { x: -6.5, y: 4.9, z: 5.5, color: 0xffb36b, intensity: 2.8, flicker: true },
  { x: 6.5, y: 4.9, z: 5.5, color: 0xc2d8ee, intensity: 2.4, flicker: false },
  // Sector 2 server bay industrial lights
  { x: 0, y: 4.9, z: -8.5, color: 0x9fc2db, intensity: 2.5, flicker: false },
  { x: -14.5, y: 4.9, z: -10.0, color: 0xff8d4f, intensity: 2.2, flicker: true },
  // Sector 3 loading bay sodium lamp
  { x: 0, y: 4.9, z: -22.0, color: 0xffb870, intensity: 3.0, flicker: false },
];

export const ENEMY_SPAWNS: EnemySpawnDef[] = [
  // Sector 1 (Warehouse Floor) - 4 hostiles
  { id: 'e-s1-1', sector: 1, archetype: 'rifleman', x: -4.0, z: 4.5, yaw: 0.2, patrolTarget: { x: -2.0, z: 6.5 } },
  { id: 'e-s1-2', sector: 1, archetype: 'rifleman', x: 5.0, z: 1.5, yaw: -0.3, patrolTarget: { x: 2.5, z: 4.0 } },
  { id: 'e-s1-3', sector: 1, archetype: 'breacher', x: -11.5, z: 6.0, yaw: 0.8, patrolTarget: { x: -4.0, z: 8.0 } },
  { id: 'e-s1-4', sector: 1, archetype: 'marksman', x: 0.2, z: -0.8, yaw: 0, patrolTarget: { x: 2.0, z: -0.5 } },

  // Sector 2 (Server & Office Wing) - 5 hostiles
  { id: 'e-s2-1', sector: 2, archetype: 'rifleman', x: -6.0, z: -7.5, yaw: 0.2, patrolTarget: { x: -2.5, z: -6.0 } },
  { id: 'e-s2-2', sector: 2, archetype: 'breacher', x: 6.2, z: -6.8, yaw: -0.4, patrolTarget: { x: 1.5, z: -4.5 } },
  { id: 'e-s2-3', sector: 2, archetype: 'rifleman', x: -14.0, z: -13.0, yaw: 0.5, patrolTarget: { x: -11.5, z: -8.0 } },
  { id: 'e-s2-4', sector: 2, archetype: 'breacher', x: 14.0, z: -13.0, yaw: -0.5, patrolTarget: { x: 11.5, z: -8.0 } },
  { id: 'e-s2-5', sector: 2, archetype: 'marksman', x: 0.0, z: -14.8, yaw: 0, patrolTarget: { x: 2.5, z: -14.2 } },

  // Sector 3 (North Loading Bay) - 5 hostiles
  { id: 'e-s3-1', sector: 3, archetype: 'rifleman', x: -8.5, z: -20.5, yaw: 0.3, patrolTarget: { x: -5.5, z: -18.5 } },
  { id: 'e-s3-2', sector: 3, archetype: 'rifleman', x: 8.5, z: -20.5, yaw: -0.3, patrolTarget: { x: 5.5, z: -18.5 } },
  { id: 'e-s3-3', sector: 3, archetype: 'breacher', x: -11.0, z: -23.5, yaw: 0.2, patrolTarget: { x: -8.5, z: -18.0 } },
  { id: 'e-s3-4', sector: 3, archetype: 'breacher', x: 11.0, z: -23.5, yaw: -0.2, patrolTarget: { x: 8.5, z: -18.0 } },
  { id: 'e-s3-5', sector: 3, archetype: 'marksman', x: 0.0, z: -24.5, yaw: 0, patrolTarget: { x: -4.5, z: -24.0 } },
];
