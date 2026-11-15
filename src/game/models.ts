import * as THREE from 'three';
import type { EnemyArchetype } from './types';
import type { LevelPropDef } from './levelData';
import type { ProceduralTextureSet } from './textures';

export interface WeaponRig {
  group: THREE.Group;
  muzzlePoint: THREE.Object3D;
  ejectionPoint: THREE.Object3D;
  reticleDot: THREE.Mesh;
}

/**
 * 10-part composite MK18 MOD 1 Tactical Carbine viewmodel.
 * Varied polymer/anodized aluminum/steel roughness (>= 0.25 spread).
 */
export function createCarbineModel(): WeaponRig {
  const group = new THREE.Group();

  const receiverMat = new THREE.MeshStandardMaterial({
    color: 0x202327,
    roughness: 0.42,
    metalness: 0.78,
  });
  const polymerMat = new THREE.MeshStandardMaterial({
    color: 0x16181a,
    roughness: 0.85,
    metalness: 0.08,
  });
  const barrelMat = new THREE.MeshStandardMaterial({
    color: 0x181a1d,
    roughness: 0.25,
    metalness: 0.92,
  });
  const fdeMat = new THREE.MeshStandardMaterial({
    color: 0x5c5040,
    roughness: 0.72,
    metalness: 0.15,
  });
  const opticGlassMat = new THREE.MeshStandardMaterial({
    color: 0x0a1c22,
    roughness: 0.08,
    metalness: 0.2,
    transparent: true,
    opacity: 0.45,
  });

  // 1. Upper + lower receiver
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.075, 0.24), receiverMat);
  receiver.position.set(0, 0, 0);
  group.add(receiver);

  // 2. Quad-rail handguard (FDE anodized) + top rail ribs
  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.056, 0.24), fdeMat);
  handguard.position.set(0, 0.008, -0.24);
  group.add(handguard);

  const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.012, 0.44), receiverMat);
  topRail.position.set(0, 0.042, -0.13);
  group.add(topRail);

  // Charging handle
  const chargingHandle = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.012, 0.025), receiverMat);
  chargingHandle.position.set(0, 0.036, 0.11);
  group.add(chargingHandle);

  // 3. Free-float barrel
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.22, 12), barrelMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.01, -0.44);
  group.add(barrel);

  // 4. Tactical Suppressor with fluted collar
  const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.16, 16), barrelMat);
  suppressor.rotation.x = Math.PI / 2;
  suppressor.position.set(0, 0.01, -0.58);
  group.add(suppressor);

  // 5. Open-Window Holographic Optic Housing (EXPS3 style)
  const opticBase = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.014, 0.082), receiverMat);
  opticBase.position.set(0, 0.052, -0.02);
  group.add(opticBase);

  const opticWallL = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.032, 0.062), barrelMat);
  opticWallL.position.set(-0.0185, 0.075, -0.02);
  group.add(opticWallL);

  const opticWallR = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.032, 0.062), barrelMat);
  opticWallR.position.set(0.0185, 0.075, -0.02);
  group.add(opticWallR);

  const opticRoof = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.006, 0.062), barrelMat);
  opticRoof.position.set(0, 0.092, -0.02);
  group.add(opticRoof);

  // Optic lens + glowing red reticle dot inside the open sight window
  const opticLens = new THREE.Mesh(new THREE.PlaneGeometry(0.032, 0.028), opticGlassMat);
  opticLens.position.set(0, 0.074, -0.022);
  group.add(opticLens);

  const reticleDot = new THREE.Mesh(
    new THREE.CircleGeometry(0.0018, 12),
    new THREE.MeshBasicMaterial({ color: 0xff2b2b }),
  );
  reticleDot.position.set(0, 0.074, -0.02);
  group.add(reticleDot);

  // 6. PEQ-15 Tactical Laser / Flashlight Module on side rail
  const peq = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.022, 0.072), fdeMat);
  peq.position.set(0.034, 0.014, -0.30);
  group.add(peq);

  // Flashlight bezel lens
  const tacLens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.011, 0.011, 0.01, 12),
    new THREE.MeshBasicMaterial({ color: 0xe6f4ff }),
  );
  tacLens.rotation.x = Math.PI / 2;
  tacLens.position.set(0.034, 0.014, -0.338);
  group.add(tacLens);

  // 7. Curved STANAG Magazine
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.145, 0.064), polymerMat);
  mag.position.set(0, -0.095, -0.055);
  mag.rotation.x = 0.18;
  group.add(mag);

  // 8. Pistol grip
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.105, 0.042), polymerMat);
  grip.position.set(0, -0.075, 0.07);
  grip.rotation.x = 0.34;
  group.add(grip);

  // 9. Angled foregrip
  const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.072, 0.036), polymerMat);
  foregrip.position.set(0, -0.052, -0.24);
  foregrip.rotation.x = -0.15;
  group.add(foregrip);

  // 10. Buffer tube & stock
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.095, 0.18), polymerMat);
  stock.position.set(0, -0.008, 0.19);
  group.add(stock);

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, 0.01, -0.67);
  group.add(muzzlePoint);

  const ejectionPoint = new THREE.Object3D();
  ejectionPoint.position.set(0.035, 0.02, -0.01);
  group.add(ejectionPoint);

  return { group, muzzlePoint, ejectionPoint, reticleDot };
}

/**
 * 6-part composite G19 Tactical Sidearm viewmodel.
 */
export function createSidearmModel(): WeaponRig {
  const group = new THREE.Group();

  const slideMat = new THREE.MeshStandardMaterial({
    color: 0x22252a,
    roughness: 0.32,
    metalness: 0.88,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x161719,
    roughness: 0.82,
    metalness: 0.08,
  });

  // 1. Slide
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.032, 0.19), slideMat);
  slide.position.set(0, 0.02, -0.06);
  group.add(slide);

  // 2. Polymer lower frame
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.022, 0.17), frameMat);
  frame.position.set(0, -0.006, -0.055);
  group.add(frame);

  // 3. Grip
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.105, 0.044), frameMat);
  grip.position.set(0, -0.058, 0.01);
  grip.rotation.x = 0.28;
  group.add(grip);

  // 4. Tactical Suppressor
  const supp = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.13, 14), slideMat);
  supp.rotation.x = Math.PI / 2;
  supp.position.set(0, 0.015, -0.22);
  group.add(supp);

  // 5. Underbarrel weapon light
  const tacLight = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.024, 0.06), slideMat);
  tacLight.position.set(0, -0.024, -0.105);
  group.add(tacLight);

  // 6. Micro red-dot sight
  const rds = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.018, 0.038), slideMat);
  rds.position.set(0, 0.044, -0.01);
  group.add(rds);

  const reticleDot = new THREE.Mesh(
    new THREE.CircleGeometry(0.002, 10),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
  );
  reticleDot.position.set(0, 0.045, -0.005);
  group.add(reticleDot);

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, 0.015, -0.29);
  group.add(muzzlePoint);

  const ejectionPoint = new THREE.Object3D();
  ejectionPoint.position.set(0.02, 0.03, -0.04);
  group.add(ejectionPoint);

  return { group, muzzlePoint, ejectionPoint, reticleDot };
}

export interface OperatorRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  headMesh: THREE.Mesh;
  visorMesh: THREE.Mesh;
  muzzleObj: THREE.Object3D;
  laserLine?: THREE.Line;
  hitMaterials: THREE.MeshStandardMaterial[];
}

/**
 * 9-part tactical hostile/friendly operator model pivoted at bottom-center (y=0).
 */
export function createOperatorMesh(
  role: EnemyArchetype | 'ally',
  contactShadowTex: THREE.Texture,
): OperatorRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const palette =
    role === 'ally'
      ? { gear: 0x2c3e35, uniform: 0x38433b, visor: 0x38bdf8 }
      : role === 'breacher'
      ? { gear: 0x3d2424, uniform: 0x242222, visor: 0xff5a36 }
      : role === 'marksman'
      ? { gear: 0x25282c, uniform: 0x1a1c1e, visor: 0xff2222 }
      : { gear: 0x2f312c, uniform: 0x232421, visor: 0xff9f43 };

  const uniformMat = new THREE.MeshStandardMaterial({
    color: palette.uniform,
    roughness: 0.88,
    metalness: 0.04,
  });
  const armorMat = new THREE.MeshStandardMaterial({
    color: palette.gear,
    roughness: 0.65,
    metalness: 0.18,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x181a1d,
    roughness: 0.3,
    metalness: 0.85,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: palette.visor,
    emissive: palette.visor,
    emissiveIntensity: 0.9,
    roughness: 0.15,
    metalness: 0.5,
  });

  // Contact shadow disc
  const shadowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 20),
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.015;
  root.add(shadowDisc);

  // 1-2. Combat boots & legs
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.82, 0.18), uniformMat);
  legL.position.set(-0.12, 0.41, 0);
  legL.castShadow = true;
  bodyGroup.add(legL);

  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.82, 0.18), uniformMat);
  legR.position.set(0.12, 0.41, 0);
  legR.castShadow = true;
  bodyGroup.add(legR);

  // 3. Armored Plate Carrier Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.56, 0.28), armorMat);
  torso.position.set(0, 1.1, 0);
  torso.castShadow = true;
  torso.receiveShadow = true;
  bodyGroup.add(torso);

  // 4. Chest mag pouches
  const pouches = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.08), uniformMat);
  pouches.position.set(0, 1.02, -0.16);
  bodyGroup.add(pouches);

  // 5-6. Arms holding weapon
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.44, 0.13), uniformMat);
  armL.position.set(-0.26, 1.14, -0.14);
  armL.rotation.x = 0.85;
  armL.rotation.z = -0.25;
  bodyGroup.add(armL);

  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.44, 0.13), uniformMat);
  armR.position.set(0.24, 1.12, -0.12);
  armR.rotation.x = 0.95;
  bodyGroup.add(armR);

  // 7. Tactical Rifle Prop (facing -Z)
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.65), metalMat);
  gun.position.set(0.08, 1.18, -0.35);
  bodyGroup.add(gun);

  const muzzleObj = new THREE.Object3D();
  muzzleObj.position.set(0.08, 1.19, -0.68);
  bodyGroup.add(muzzleObj);

  // 8. Ballistic Helmet / Head
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 12), armorMat);
  headMesh.position.set(0, 1.54, 0);
  headMesh.castShadow = true;
  bodyGroup.add(headMesh);

  // 9. NVG / Tactical Visor Goggles (faces -Z)
  const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.055, 0.08), visorMat);
  visorMesh.position.set(0, 1.54, -0.12);
  bodyGroup.add(visorMesh);

  let laserLine: THREE.Line | undefined;
  if (role !== 'ally') {
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -18),
    ]);
    const lineMat = new THREE.LineBasicMaterial({
      color: role === 'marksman' ? 0xff1e1e : 0xff7b33,
      transparent: true,
      opacity: 0.75,
    });
    laserLine = new THREE.Line(lineGeo, lineMat);
    laserLine.visible = false;
    muzzleObj.add(laserLine);
  }

  return {
    root,
    bodyGroup,
    headMesh,
    visorMesh,
    muzzleObj,
    laserLine,
    hitMaterials: [uniformMat, armorMat],
  };
}

/**
 * Builds composite 3–6 part tactical cover props grounded cleanly at y = 0.
 */
export function createPropGroup(def: LevelPropDef, textures: ProceduralTextureSet): THREE.Group {
  const g = new THREE.Group();
  g.position.set(def.x, 0, def.z);
  if (def.rotY) g.rotation.y = def.rotY;

  if (def.kind === 'container') {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: def.color ?? 0x3b4956,
      map: textures.steelAlbedo,
      bumpMap: textures.steelBump,
      bumpScale: 0.04,
      roughness: 0.68,
      metalness: 0.45,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x1e2226,
      roughness: 0.4,
      metalness: 0.85,
    });

    // Main shipping container hull (2.6m wide x 2.7m tall x 6.0m long)
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.7, 6.0), bodyMat);
    hull.position.y = 1.35;
    hull.castShadow = true;
    hull.receiveShadow = true;
    g.add(hull);

    // Top/bottom ISO steel rails
    const roofRail = new THREE.Mesh(new THREE.BoxGeometry(2.68, 0.14, 6.06), trimMat);
    roofRail.position.y = 2.66;
    g.add(roofRail);

    const baseRail = new THREE.Mesh(new THREE.BoxGeometry(2.68, 0.16, 6.06), trimMat);
    baseRail.position.y = 0.08;
    g.add(baseRail);

    // Front locking bars
    for (const lx of [-0.55, 0.55]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.5, 8), trimMat);
      bar.position.set(lx, 1.35, 3.03);
      g.add(bar);
    }
  } else if (def.kind === 'crates') {
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.woodAlbedo,
      bumpMap: textures.woodBump,
      bumpScale: 0.03,
      roughness: 0.88,
      metalness: 0.02,
    });
    const strapMat = new THREE.MeshStandardMaterial({
      color: 0x222528,
      roughness: 0.45,
      metalness: 0.75,
    });
    const pallet = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.16, 2.0), woodMat);
    pallet.position.y = 0.08;
    pallet.castShadow = true;
    pallet.receiveShadow = true;
    g.add(pallet);

    const c1 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 1.1), woodMat);
    c1.position.set(-0.32, 0.66, -0.2);
    c1.castShadow = true;
    c1.receiveShadow = true;
    g.add(c1);

    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.85), woodMat);
    c2.position.set(0.45, 0.585, 0.35);
    c2.castShadow = true;
    c2.receiveShadow = true;
    g.add(c2);

    const c3 = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.7, 0.75), woodMat);
    c3.position.set(-0.22, 1.51, -0.15);
    c3.rotation.y = 0.18;
    c3.castShadow = true;
    g.add(c3);

    const strap = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.04, 1.14), strapMat);
    strap.position.set(-0.32, 0.66, -0.2);
    g.add(strap);
  } else if (def.kind === 'barrier') {
    const concMat = new THREE.MeshStandardMaterial({
      color: 0x8e9296,
      map: textures.concreteAlbedo,
      bumpMap: textures.concreteBump,
      bumpScale: 0.03,
      roughness: 0.92,
      metalness: 0.05,
    });
    const hazMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.hazardAlbedo,
      roughness: 0.6,
      metalness: 0.1,
    });
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.32, 0.76), concMat);
    base.position.y = 0.16;
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);

    const stem = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.82, 0.44), concMat);
    stem.position.y = 0.73;
    stem.castShadow = true;
    stem.receiveShadow = true;
    g.add(stem);

    const strip = new THREE.Mesh(new THREE.BoxGeometry(3.42, 0.18, 0.46), hazMat);
    strip.position.y = 0.92;
    g.add(strip);
  } else if (def.kind === 'server_rack') {
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x1a1e23,
      roughness: 0.45,
      metalness: 0.78,
    });
    const faceMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.serverAlbedo,
      emissive: 0x11221a,
      emissiveMap: textures.serverAlbedo,
      emissiveIntensity: 0.65,
      roughness: 0.55,
      metalness: 0.4,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 2.8), chassisMat);
    body.position.y = 1.1;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    const face1 = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.05), faceMat);
    face1.position.set(0.655, 1.1, 0);
    face1.rotation.y = Math.PI / 2;
    g.add(face1);

    const face2 = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.05), faceMat);
    face2.position.set(-0.655, 1.1, 0);
    face2.rotation.y = -Math.PI / 2;
    g.add(face2);
  } else if (def.kind === 'barrels') {
    const drumBlue = new THREE.MeshStandardMaterial({ color: 0x264b6e, roughness: 0.45, metalness: 0.55 });
    const drumRust = new THREE.MeshStandardMaterial({ color: 0x693824, roughness: 0.68, metalness: 0.4 });
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x16181a, roughness: 0.35, metalness: 0.85 });

    const offsets = [
      { x: -0.35, z: 0, mat: drumBlue },
      { x: 0.38, z: 0.15, mat: drumRust },
      { x: 0.0, z: -0.52, mat: drumBlue },
    ];
    for (const o of offsets) {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.94, 14), o.mat);
      drum.position.set(o.x, 0.47, o.z);
      drum.castShadow = true;
      drum.receiveShadow = true;
      g.add(drum);

      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.315, 0.02, 6, 14), ringMat);
      rib.rotation.x = Math.PI / 2;
      rib.position.set(o.x, 0.52, o.z);
      g.add(rib);
    }
  }

  return g;
}
