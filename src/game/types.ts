export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export type WeaponId = 'carbine' | 'sidearm';

export type EnemyArchetype = 'rifleman' | 'breacher' | 'marksman';

export type Stance = 'STAND' | 'CROUCH' | 'SPRINT';

export interface WallBox {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  /** Acoustic absorption factor (1.0 = heavy concrete, 0.55 = thin sheet/wood) */
  acousticDensity: number;
  /** Whether bullets and sightlines are blocked */
  blocksSight: boolean;
}

export interface AcousticResult {
  distance: number;
  wallCount: number;
  totalDensity: number;
  cutoffHz: number;
  gain: number;
  dbAttenuation: number;
  pan: number;
  radioMix: number;
  isOccluded: boolean;
}

export interface CommsFeedItem {
  id: number;
  speaker: string;
  line: string;
  occluded: boolean;
  dbLoss: number;
  distance: number;
  timestamp: number;
}

export interface HudSnapshot {
  phase: GamePhase;
  outcome: 'victory' | 'defeat' | null;
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
  weapon: WeaponId;
  magAmmo: number;
  magSize: number;
  reserveAmmo: number;
  isReloading: boolean;
  isAds: boolean;
  flashlightOn: boolean;
  stance: Stance;
  lean: -1 | 0 | 1;
  sector: number;
  totalSectors: number;
  enemiesRemaining: number;
  eliminations: number;
  headshots: number;
  shotsFired: number;
  shotsHit: number;
  score: number;
  bestScore: number;
  elapsedSeconds: number;
  muted: boolean;
  pointerLocked: boolean;
  touchEnabled: boolean;
  activeComms: CommsFeedItem | null;
  damageFlash: number;
  hitMarker: boolean;
  killMarker: boolean;
  batteryPct: number;
  crosshairGapPx: number;
}

export interface CrosshairFrame {
  gapPx: number;
  scale: number;
  opacity: number;
  spreadRad: number;
  bloomRatio: number;
}

export interface TouchInputState {
  moveX: number; // -1..1
  moveY: number; // -1..1 (forward positive)
  lookDeltaX: number;
  lookDeltaY: number;
  firing: boolean;
  ads: boolean;
  crouch: boolean;
  lean: -1 | 0 | 1;
}
