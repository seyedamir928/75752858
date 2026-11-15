import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAcousticOcclusion,
  computeStereoPan,
  countOccludingWalls,
  segmentIntersectsWall,
} from './acoustics';
import { LEVEL_WALLS } from './levelData';
import type { WallBox } from './types';

const TEST_WALLS: WallBox[] = [
  {
    id: 'concrete-1',
    minX: -5,
    maxX: 5,
    minZ: -1,
    maxZ: 1,
    height: 4,
    acousticDensity: 1.0,
    blocksSight: true,
  },
  {
    id: 'concrete-2',
    minX: -5,
    maxX: 5,
    minZ: 5,
    maxZ: 7,
    height: 4,
    acousticDensity: 1.0,
    blocksSight: true,
  },
];

test('segmentIntersectsWall detects blocked and clear acoustic rays', () => {
  assert.equal(segmentIntersectsWall(0, 1.5, -4, 0, 1.5, 4, TEST_WALLS[0]), true);
  assert.equal(segmentIntersectsWall(8, 1.5, -4, 8, 1.5, 4, TEST_WALLS[0]), false);
  // Ray passing above wall height (y=6 > height=4) should not be occluded
  assert.equal(segmentIntersectsWall(0, 6, -4, 0, 6, 4, TEST_WALLS[0]), false);
});

test('countOccludingWalls counts multiple concrete walls accurately', () => {
  const clear = countOccludingWalls({ x: 8, y: 1.5, z: -4 }, { x: 8, y: 1.5, z: 9 }, TEST_WALLS);
  assert.equal(clear.wallCount, 0);

  const oneWall = countOccludingWalls({ x: 0, y: 1.5, z: -4 }, { x: 0, y: 1.5, z: 3 }, TEST_WALLS);
  assert.equal(oneWall.wallCount, 1);

  const twoWalls = countOccludingWalls({ x: 0, y: 1.5, z: -4 }, { x: 0, y: 1.5, z: 10 }, TEST_WALLS);
  assert.equal(twoWalls.wallCount, 2);
});

test('computeAcousticOcclusion attenuates cutoff frequency and dB gain across walls', () => {
  const clear = computeAcousticOcclusion(
    { x: 8, y: 1.5, z: 0 },
    0,
    { x: 8, y: 1.5, z: -8 },
    TEST_WALLS,
  );
  const occluded = computeAcousticOcclusion(
    { x: 0, y: 1.5, z: 3 },
    0,
    { x: 0, y: 1.5, z: -5 },
    TEST_WALLS,
  );

  assert.equal(clear.isOccluded, false);
  assert.ok(clear.cutoffHz > 15000);
  assert.equal(clear.dbAttenuation, 0);

  assert.equal(occluded.isOccluded, true);
  assert.equal(occluded.wallCount, 1);
  assert.ok(occluded.cutoffHz < 3000, `Expected low-pass cutoff < 3000Hz, got ${occluded.cutoffHz}`);
  assert.ok(occluded.dbAttenuation < -5);
  assert.ok(occluded.gain < clear.gain);
  assert.ok(occluded.radioMix > clear.radioMix);
});

test('computeStereoPan maps right/left sources accurately at yaw=0', () => {
  const rightPan = computeStereoPan(0, 0, 0, 10, 0);
  const leftPan = computeStereoPan(0, 0, 0, -10, 0);
  const frontPan = computeStereoPan(0, 0, 0, 0, -10);

  assert.ok(rightPan > 0.9);
  assert.ok(leftPan < -0.9);
  assert.ok(Math.abs(frontPan) < 0.05);
});

test('LEVEL_WALLS doorways are open for clear acoustic/sightlines through main breach', () => {
  const res = computeAcousticOcclusion(
    { x: 0, y: 1.6, z: 18 },
    0,
    { x: 0, y: 1.6, z: 9 },
    LEVEL_WALLS,
  );
  assert.equal(res.wallCount, 0);
});
