import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPlayerDamage,
  computeDynamicSpread,
  computeEnemyIntent,
  hasLineOfSight,
  resolveCircleAgainstWalls,
  stepFireBloom,
  WEAPON_SPECS,
} from './combat';
import { ARENA_BOUNDS, LEVEL_WALLS, PLAYER_SPAWN } from './levelData';

test('applyPlayerDamage absorbs 65% with armor and allows lethal zero-HP defeat', () => {
  const start = { health: 100, maxHealth: 100, armor: 100, maxArmor: 100 };
  const afterHit = applyPlayerDamage(start, 40);
  assert.equal(afterHit.armor, 74); // 40 * 0.65 = 26 absorbed
  assert.equal(afterHit.health, 86); // 14 bleed

  // Lethal blow when armor depleted
  const low = { health: 20, maxHealth: 100, armor: 0, maxArmor: 100 };
  const defeated = applyPlayerDamage(low, 25);
  assert.equal(defeated.health, 0);
});

test('resolveCircleAgainstWalls pushes colliding circle outside concrete wall and keeps spawn clear', () => {
  const spawnResolved = resolveCircleAgainstWalls(
    PLAYER_SPAWN.x,
    PLAYER_SPAWN.z,
    0.42,
    LEVEL_WALLS,
    ARENA_BOUNDS,
  );
  assert.equal(spawnResolved.x, PLAYER_SPAWN.x);
  assert.equal(spawnResolved.z, PLAYER_SPAWN.z);

  // Try walking into vestibule-w wall (minZ: 11.4, maxZ: 12.2, minX: -22, maxX: -3.2)
  const collided = resolveCircleAgainstWalls(-6, 11.8, 0.45, LEVEL_WALLS, ARENA_BOUNDS);
  assert.ok(collided.z <= 11.4 - 0.44 || collided.z >= 12.2 + 0.44);
});

test('hasLineOfSight respects blocksSight flag on waist-high barriers vs full walls', () => {
  // Across waist-high barrier-s1-c (blocksSight: false)
  const overBarrier = hasLineOfSight(0, 1.5, 8, 0, 1.5, 4, LEVEL_WALLS);
  assert.equal(overBarrier, true);

  // Through vestibule-w full wall (blocksSight: true)
  const throughWall = hasLineOfSight(-8, 1.5, 15, -8, 1.5, 8, LEVEL_WALLS);
  assert.equal(throughWall, false);
});

test('computeEnemyIntent differentiates Rifleman, Breacher, and Marksman policies', () => {
  const breacherRush = computeEnemyIntent('breacher', 'alert', 14, true, false, 1);
  const marksmanRetreat = computeEnemyIntent('marksman', 'alert', 7, true, false, 1);
  const riflemanStrafe = computeEnemyIntent('rifleman', 'alert', 10, true, false, 1);
  const windupReady = computeEnemyIntent('rifleman', 'alert', 10, true, true, 0);

  assert.equal(breacherRush.moveForward, 1);
  assert.ok(marksmanRetreat.moveForward < 0, 'Marksman should backpedal when player is too close');
  assert.ok(Math.abs(riflemanStrafe.strafeDir) > 0.5, 'Rifleman should strafe laterally');
  assert.equal(windupReady.nextState, 'windup');
});

test('computeDynamicSpread scales crosshair gap and spread by movement, posture, and weapon accuracy', () => {
  const crouched = computeDynamicSpread({
    weapon: 'carbine',
    moveSpeed: 0,
    fireBloom: 0,
    adsBlend: 0,
    crouching: true,
    isReloading: false,
  });
  const standing = computeDynamicSpread({
    weapon: 'carbine',
    moveSpeed: 0,
    fireBloom: 0,
    adsBlend: 0,
    crouching: false,
    isReloading: false,
  });
  const walking = computeDynamicSpread({
    weapon: 'carbine',
    moveSpeed: 4.25,
    fireBloom: 0,
    adsBlend: 0,
    crouching: false,
    isReloading: false,
  });
  const sprinting = computeDynamicSpread({
    weapon: 'carbine',
    moveSpeed: 6.2,
    fireBloom: 0,
    adsBlend: 0,
    crouching: false,
    isReloading: false,
  });
  const sidearmMoving = computeDynamicSpread({
    weapon: 'sidearm',
    moveSpeed: 4.25,
    fireBloom: 0,
    adsBlend: 0,
    crouching: false,
    isReloading: false,
  });

  assert.ok(crouched.effectiveSpreadRad < standing.effectiveSpreadRad);
  assert.ok(standing.targetGapPx < walking.targetGapPx);
  assert.ok(walking.targetGapPx < sprinting.targetGapPx);
  assert.ok(walking.targetScale < sprinting.targetScale);
  assert.ok(sidearmMoving.effectiveSpreadRad < walking.effectiveSpreadRad);
});

test('computeDynamicSpread expands with firing bloom, tightens on ADS, and recovers via stepFireBloom', () => {
  const spec = WEAPON_SPECS.carbine;
  const burstBloom = Math.min(spec.maxBloom, spec.bloomPerShot * 4);

  const rapidFire = computeDynamicSpread({
    weapon: 'carbine',
    moveSpeed: 0,
    fireBloom: burstBloom,
    adsBlend: 0,
    crouching: false,
    isReloading: false,
  });
  const idle = computeDynamicSpread({
    weapon: 'carbine',
    moveSpeed: 0,
    fireBloom: 0,
    adsBlend: 0,
    crouching: false,
    isReloading: false,
  });
  const ads = computeDynamicSpread({
    weapon: 'carbine',
    moveSpeed: 0,
    fireBloom: 0,
    adsBlend: 1,
    crouching: false,
    isReloading: false,
  });

  assert.ok(rapidFire.targetGapPx > idle.targetGapPx);
  assert.ok(rapidFire.bloomRatio > 0.5);
  assert.ok(ads.effectiveSpreadRad < idle.effectiveSpreadRad);
  assert.equal(ads.targetOpacity, 0);

  const recovered = stepFireBloom(burstBloom, 'carbine', 0.35);
  assert.ok(recovered < burstBloom);
  assert.equal(stepFireBloom(0.005, 'carbine', 1.0), 0);
});
