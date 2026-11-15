import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { computeAcousticOcclusion } from './acoustics';
import { TacticalAudioEngine } from './audioEngine';
import { BodycamLensShader } from './bodycamShader';
import {
  applyPlayerDamage,
  computeDynamicSpread,
  computeEnemyIntent,
  ENEMY_CONFIGS,
  hasLineOfSight,
  resolveCircleAgainstWalls,
  stepFireBloom,
  WEAPON_SPECS,
  type EnemyState,
} from './combat';
import {
  ALLY_SPAWN,
  ARENA_BOUNDS,
  ENEMY_SPAWNS,
  LEVEL_LIGHTS,
  LEVEL_PROPS,
  LEVEL_WALLS,
  PLAYER_SPAWN,
} from './levelData';
import {
  createCarbineModel,
  createOperatorMesh,
  createPropGroup,
  createSidearmModel,
  type OperatorRig,
  type WeaponRig,
} from './models';
import { createProceduralTextures, type ProceduralTextureSet } from './textures';
import type {
  CommsFeedItem,
  CrosshairFrame,
  EnemyArchetype,
  GamePhase,
  HudSnapshot,
  Stance,
  TouchInputState,
  WeaponId,
} from './types';

// Pre-allocated zero-GC scratch helpers
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

interface ParticleSlot {
  active: boolean;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  gravity: number;
  color: THREE.Color;
}

interface EnemyActor {
  id: string;
  sector: number;
  archetype: EnemyArchetype;
  rig: OperatorRig;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  state: EnemyState;
  stateTimer: number;
  burstRemaining: number;
  burstCooldown: number;
  hitFlashTimer: number;
  koProgress: number;
  patrolTarget: { x: number; z: number };
  strafeSign: number;
  commsCooldown: number;
}

const PARTICLE_POOL_SIZE = 120;
const DUST_COUNT = 90;
const BEST_SCORE_KEY = 'bodycam_zerohour_best_v1';

const ALLY_CALLOUTS = [
  'BRAVO-2: STACKED ON BREACH, WATCH CORNERS',
  'BRAVO-2: CONTACT FRONT — SUPPRESSING',
  'BRAVO-2: CHECK THOSE ANGLES, LOW VISIBILITY',
  'BRAVO-2: SECTOR CLEARANCE IN PROGRESS',
  'BRAVO-2: MOVING TO FLANK COVER',
];

const HOSTILE_CALLOUTS = [
  'HOSTILE: EYES ON INTRUDER!',
  'HOSTILE: FLANK LEFT, PIN HIM DOWN!',
  'HOSTILE: RELOADING, COVER ME!',
  'HOSTILE: MOVEMENT IN SECTOR!',
];

export class GameEngine {
  private mountEl: HTMLElement;
  private onHudUpdate: (snapshot: HudSnapshot) => void;
  private onCrosshairFrame: ((frame: CrosshairFrame) => void) | null = null;

  private isSoftwareGl = false;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bodycamPass: ShaderPass | null = null;
  private textures!: ProceduralTextureSet;

  private audio = new TacticalAudioEngine();
  private raycaster = new THREE.Raycaster();

  // Level meshes for raycasting bullets
  private levelCollisionMeshes: THREE.Object3D[] = [];
  private enemyHitMeshes: THREE.Object3D[] = [];

  // Lighting
  private flashlight!: THREE.SpotLight;
  private flashlightTarget!: THREE.Object3D;
  private muzzleLight!: THREE.PointLight;
  private muzzleFlashTimer = 0;
  private flickeringLights: { light: THREE.PointLight; baseIntensity: number; seed: number }[] = [];

  // Weapon Viewmodels
  private weaponMount!: THREE.Group;
  private carbineRig!: WeaponRig;
  private sidearmRig!: WeaponRig;
  private activeWeapon: WeaponId = 'carbine';
  private weaponState: Record<WeaponId, { mag: number; reserve: number }> = {
    carbine: { mag: 30, reserve: 150 },
    sidearm: { mag: 15, reserve: 60 },
  };
  private isReloading = false;
  private reloadTimer = 0;
  private fireCooldown = 0;
  private semiTriggerConsumed = false;

  // Player state
  private phase: GamePhase = 'title';
  private outcome: 'victory' | 'defeat' | null = null;
  private playerX = PLAYER_SPAWN.x;
  private playerY = PLAYER_SPAWN.y;
  private playerZ = PLAYER_SPAWN.z;
  private yaw = PLAYER_SPAWN.yaw;
  private pitch = 0;
  private leanCurrent = 0;
  private leanTarget: -1 | 0 | 1 = 0;
  private crouching = false;
  private flashlightOn = true;
  private isAds = false;
  private adsBlend = 0;
  private walkDist = 0;
  private lastStepDist = 0;
  private currentMoveSpeed = 0;
  private fireBloom = 0;
  private effectiveSpreadRad = 0.014;
  private crosshairGapPx = 11;
  private crosshairScale = 1;
  private crosshairOpacity = 1;
  private recoilPitch = 0;
  private recoilYaw = 0;
  private weaponSwayX = 0;
  private weaponSwayY = 0;
  private trauma = 0;
  private hitstopTimer = 0;
  private damageFlash = 0;
  private hitMarkerTimer = 0;
  private killMarkerTimer = 0;

  private health = 100;
  private maxHealth = 100;
  private armor = 100;
  private maxArmor = 100;

  private currentSector = 1;
  private totalSectors = 3;
  private eliminations = 0;
  private headshots = 0;
  private shotsFired = 0;
  private shotsHit = 0;
  private score = 0;
  private bestScore = 0;
  private elapsedSeconds = 0;

  // Ally & Enemies
  private enemies: EnemyActor[] = [];
  private allyRig!: OperatorRig;
  private allyX = ALLY_SPAWN.x;
  private allyZ = ALLY_SPAWN.z;
  private allyYaw = 0;
  private allyCommsTimer = 4.5;
  private activeComms: CommsFeedItem | null = null;
  private commsIdSeq = 1;

  // Pooled particles & ambient dust
  private particleMesh!: THREE.InstancedMesh;
  private particles: ParticleSlot[] = [];
  private particleCursor = 0;
  private dustPoints!: THREE.Points;

  // Input state
  private keys = new Set<string>();
  private mouseDown = false;
  private rightMouseDown = false;
  private pointerLocked = false;
  private touchEnabled = false;
  private touchInput: TouchInputState = {
    moveX: 0,
    moveY: 0,
    lookDeltaX: 0,
    lookDeltaY: 0,
    firing: false,
    ads: false,
    crouch: false,
    lean: 0,
  };

  // Loop & lifecycle
  private frameId = 0;
  private disposed = false;
  private contextLost = false;
  private lastTimeMs = 0;
  private hudSyncTimer = 0;
  private resizeObserver: ResizeObserver | null = null;
  private titleTourTime = 0;

  constructor(mountEl: HTMLElement, onHudUpdate: (snapshot: HudSnapshot) => void) {
    this.mountEl = mountEl;
    this.onHudUpdate = onHudUpdate;
    this.bestScore = this.loadBestScore();
    this.touchEnabled = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    this.initRendererAndScene();
    this.buildLevel();
    this.buildPlayerRig();
    this.buildParticles();
    this.spawnActors();
    this.bindEvents();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    document.body.dataset.state = 'title';
    this.pushHudSnapshot();
    this.lastTimeMs = performance.now();
    this.scheduleNextFrame();
  }

  private createWebGLRenderer(): THREE.WebGLRenderer {
    const attempts: THREE.WebGLRendererParameters[] = [
      { antialias: true, powerPreference: 'high-performance' },
      { antialias: false, powerPreference: 'default' },
      { antialias: false, failIfMajorPerformanceCaveat: false },
    ];

    let lastError: unknown = null;
    for (const opts of attempts) {
      try {
        return new THREE.WebGLRenderer(opts);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('WebGL context could not be created.');
  }

  private detectSoftwareGlFromContext(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      return false;
    }
  }

  private loadBestScore(): number {
    try {
      const raw = localStorage.getItem(BEST_SCORE_KEY);
      return raw ? Math.max(0, parseInt(raw, 10) || 0) : 0;
    } catch {
      return 0;
    }
  }

  private saveBestScore(val: number): void {
    try {
      localStorage.setItem(BEST_SCORE_KEY, String(val));
    } catch {
      // ignore storage errors
    }
  }

  private initRendererAndScene(): void {
    const width = this.mountEl.clientWidth || window.innerWidth;
    const height = this.mountEl.clientHeight || window.innerHeight;

    this.renderer = this.createWebGLRenderer();
    this.isSoftwareGl = this.detectSoftwareGlFromContext(this.renderer.getContext());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost, false);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored, false);
    this.mountEl.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090b0e);
    this.scene.fog = new THREE.FogExp2(0x090b0e, 0.032);

    // Mandatory RoomEnvironment IBL for realistic PBR metallic reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(86, width / height, 0.06, 95);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // Warm/cool base lighting rig (never flat ambient alone)
    const hemi = new THREE.HemisphereLight(0x6b84a3, 0x26211c, 0.55);
    this.scene.add(hemi);

    const moonDir = new THREE.DirectionalLight(0x88aadd, 0.65);
    moonDir.position.set(12, 24, 14);
    if (!this.isSoftwareGl) {
      moonDir.castShadow = true;
      moonDir.shadow.mapSize.set(1024, 1024);
      moonDir.shadow.camera.near = 2;
      moonDir.shadow.camera.far = 65;
      moonDir.shadow.camera.left = -26;
      moonDir.shadow.camera.right = 26;
      moonDir.shadow.camera.top = 26;
      moonDir.shadow.camera.bottom = -26;
      moonDir.shadow.bias = -0.0005;
      moonDir.shadow.normalBias = 0.02;
    }
    this.scene.add(moonDir);

    this.textures = createProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());

    // Post-processing Bodycam lens shader on GPU
    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bodycamPass = new ShaderPass(BodycamLensShader);
      this.composer.addPass(this.bodycamPass);
    }
  }

  private buildLevel(): void {
    // Poured concrete floor
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.concreteAlbedo,
      bumpMap: this.textures.concreteBump,
      bumpScale: 0.035,
      roughness: 0.85,
      metalness: 0.08,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(54, 58), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -2);
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.levelCollisionMeshes.push(floor);

    // Industrial warehouse roof trusses & ceiling slab (y = 5.4)
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: 0x16191d,
      roughness: 0.9,
      metalness: 0.25,
    });
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(52, 56), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 5.4, -2);
    this.scene.add(ceiling);

    // Overhead steel roof beams + industrial cable conduits (InstancedMesh for low draw calls)
    const beamGeo = new THREE.BoxGeometry(45, 0.28, 0.35);
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x24282e, roughness: 0.5, metalness: 0.78 });
    const beams = new THREE.InstancedMesh(beamGeo, beamMat, 9);
    for (let i = 0; i < 9; i++) {
      _v1.set(0, 5.2, 20 - i * 5.5);
      _quat.identity();
      _scale.set(1, 1, 1);
      _mat4.compose(_v1, _quat, _scale);
      beams.setMatrixAt(i, _mat4);
    }
    beams.computeBoundingSphere();
    this.scene.add(beams);

    // Longitudinally running industrial ventilation/pipe runs along ceiling
    const pipeGeo = new THREE.CylinderGeometry(0.14, 0.14, 48, 10);
    pipeGeo.rotateX(Math.PI / 2);
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x2b3138, roughness: 0.42, metalness: 0.82 });
    for (const px of [-3.4, 3.4]) {
      const pipe = new THREE.Mesh(pipeGeo, pipeMat);
      pipe.position.set(px, 4.95, -2);
      this.scene.add(pipe);
    }

    // Concrete masonry walls & structural pillars
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.wallAlbedo,
      bumpMap: this.textures.wallBump,
      bumpScale: 0.045,
      roughness: 0.9,
      metalness: 0.06,
    });

    for (const w of LEVEL_WALLS) {
      // Skip low props that are built with multi-part prop groups
      if (
        w.id.startsWith('cont-') ||
        w.id.startsWith('crates-') ||
        w.id.startsWith('barrier-') ||
        w.id.startsWith('server-')
      ) {
        continue;
      }
      const sizeX = w.maxX - w.minX;
      const sizeZ = w.maxZ - w.minZ;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sizeX, w.height, sizeZ), wallMat);
      mesh.position.set((w.minX + w.maxX) * 0.5, w.height * 0.5, (w.minZ + w.maxZ) * 0.5);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.levelCollisionMeshes.push(mesh);
    }

    // Multi-part tactical props
    for (const propDef of LEVEL_PROPS) {
      const propGroup = createPropGroup(propDef, this.textures);
      this.scene.add(propGroup);
      propGroup.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          this.levelCollisionMeshes.push(child);
        }
      });
    }

    // Overhead industrial light fixtures + emissive housings (capped at 6 PointLights)
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x22262b,
      roughness: 0.45,
      metalness: 0.75,
    });
    for (let i = 0; i < LEVEL_LIGHTS.length; i++) {
      const def = LEVEL_LIGHTS[i];
      const fixture = new THREE.Group();
      fixture.position.set(def.x, def.y, def.z);

      const hood = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.32), housingMat);
      fixture.add(hood);

      const bulb = new THREE.Mesh(
        new THREE.BoxGeometry(1.25, 0.06, 0.22),
        new THREE.MeshBasicMaterial({ color: def.color }),
      );
      bulb.position.y = -0.06;
      fixture.add(bulb);
      this.scene.add(fixture);

      const pt = new THREE.PointLight(def.color, def.intensity * 3.2, 19, 1.6);
      pt.position.set(def.x, def.y - 0.25, def.z);
      this.scene.add(pt);

      if (def.flicker) {
        this.flickeringLights.push({
          light: pt,
          baseIntensity: def.intensity * 3.2,
          seed: i * 19.3 + 4.1,
        });
      }
    }
  }

  private buildPlayerRig(): void {
    // Tactical weapon-mounted flashlight
    this.flashlight = new THREE.SpotLight(0xedf6ff, 9.5, 34, Math.PI / 5.2, 0.55, 1.35);
    this.flashlight.position.set(0.14, -0.08, -0.15);
    if (!this.isSoftwareGl) {
      this.flashlight.castShadow = true;
      this.flashlight.shadow.mapSize.set(1024, 1024);
      this.flashlight.shadow.camera.near = 0.25;
      this.flashlight.shadow.camera.far = 32;
      this.flashlight.shadow.bias = -0.0005;
    }

    this.flashlightTarget = new THREE.Object3D();
    this.flashlightTarget.position.set(0, -0.02, -12);
    this.camera.add(this.flashlight);
    this.camera.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    // Muzzle flash point light
    this.muzzleLight = new THREE.PointLight(0xffaa44, 0, 8, 2);
    this.muzzleLight.position.set(0.12, -0.08, -0.75);
    this.camera.add(this.muzzleLight);

    // Weapon viewmodel mount attached to camera
    this.weaponMount = new THREE.Group();
    this.camera.add(this.weaponMount);

    this.carbineRig = createCarbineModel();
    this.sidearmRig = createSidearmModel();
    this.weaponMount.add(this.carbineRig.group);
    this.weaponMount.add(this.sidearmRig.group);
    this.sidearmRig.group.visible = false;
  }

  private buildParticles(): void {
    const geo = new THREE.BoxGeometry(0.055, 0.055, 0.055);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleMesh = new THREE.InstancedMesh(geo, mat, PARTICLE_POOL_SIZE);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;

    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      this.particles.push({
        active: false,
        life: 0,
        maxLife: 0.5,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        size: 1,
        gravity: 9.8,
        color: new THREE.Color(0xffaa44),
      });
      _v1.set(0, -50, 0);
      _quat.identity();
      _scale.set(0.001, 0.001, 0.001);
      _mat4.compose(_v1, _quat, _scale);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, this.particles[i].color);
    }
    this.scene.add(this.particleMesh);

    // Ambient floating dust motes in flashlight beams
    const dustPositions = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < DUST_COUNT; i++) {
      dustPositions[i * 3] = (Math.random() - 0.5) * 40;
      dustPositions[i * 3 + 1] = 0.4 + Math.random() * 4.2;
      dustPositions[i * 3 + 2] = -24 + Math.random() * 44;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xcbd5e1,
      size: 0.06,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    this.dustPoints = new THREE.Points(dustGeo, dustMat);
    this.scene.add(this.dustPoints);
  }

  private spawnParticleBurst(
    x: number,
    y: number,
    z: number,
    count: number,
    colorHex: number,
    speed = 4.5,
    gravity = 9.8,
    size = 0.8,
  ): void {
    for (let i = 0; i < count; i++) {
      const slot = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % PARTICLE_POOL_SIZE;
      slot.active = true;
      slot.life = 0;
      slot.maxLife = 0.22 + Math.random() * 0.35;
      slot.x = x;
      slot.y = y;
      slot.z = z;
      slot.vx = (Math.random() - 0.5) * speed * 2;
      slot.vy = Math.random() * speed * 1.1;
      slot.vz = (Math.random() - 0.5) * speed * 2;
      slot.size = size * (0.6 + Math.random() * 0.7);
      slot.gravity = gravity;
      slot.color.setHex(colorHex);
      this.particleMesh.setColorAt(this.particleCursor === 0 ? PARTICLE_POOL_SIZE - 1 : this.particleCursor - 1, slot.color);
    }
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  private spawnActors(): void {
    // Clear existing actors
    for (const e of this.enemies) {
      this.scene.remove(e.rig.root);
    }
    this.enemies = [];
    this.enemyHitMeshes = [];

    if (this.allyRig) {
      this.scene.remove(this.allyRig.root);
    }
    this.allyRig = createOperatorMesh('ally', this.textures.contactShadow);
    this.allyX = ALLY_SPAWN.x;
    this.allyZ = ALLY_SPAWN.z;
    this.allyYaw = 0;
    this.allyRig.root.position.set(this.allyX, 0, this.allyZ);
    this.scene.add(this.allyRig.root);

    for (const def of ENEMY_SPAWNS) {
      const cfg = ENEMY_CONFIGS[def.archetype];
      const rig = createOperatorMesh(def.archetype, this.textures.contactShadow);
      rig.root.position.set(def.x, 0, def.z);
      rig.root.rotation.y = def.yaw;
      this.scene.add(rig.root);

      const actor: EnemyActor = {
        id: def.id,
        sector: def.sector,
        archetype: def.archetype,
        rig,
        x: def.x,
        z: def.z,
        yaw: def.yaw,
        hp: cfg.maxHp,
        maxHp: cfg.maxHp,
        state: 'patrol',
        stateTimer: 0.5 + Math.random() * 0.8,
        burstRemaining: 0,
        burstCooldown: 0,
        hitFlashTimer: 0,
        koProgress: 0,
        patrolTarget: def.patrolTarget ?? { x: def.x, z: def.z },
        strafeSign: Math.random() > 0.5 ? 1 : -1,
        commsCooldown: 2 + Math.random() * 5,
      };

      // Tag hitboxes for fast raycasting
      rig.root.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.userData.enemyId = def.id;
          child.userData.isHead = child === rig.headMesh || child === rig.visorMesh;
          this.enemyHitMeshes.push(child);
        }
      });

      this.enemies.push(actor);
    }
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('contextmenu', this.handleContextMenu);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.mountEl);
  }

  private handleResize(): void {
    if (this.disposed) return;
    const width = this.mountEl.clientWidth || window.innerWidth;
    const height = this.mountEl.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    if (this.composer) {
      this.composer.setSize(width, height);
    }
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;
    if (this.phase === 'title') {
      if (code === 'Enter' || code === 'Space') {
        e.preventDefault();
        this.startGame(true);
      }
      return;
    }

    if (code === 'Escape' || code === 'KeyP') {
      if (this.phase === 'playing') {
        e.preventDefault();
        this.pauseGame();
      } else if (this.phase === 'paused') {
        e.preventDefault();
        this.resumeGame();
      }
      return;
    }

    if (code === 'KeyM') {
      this.toggleMute();
      return;
    }

    if (this.phase !== 'playing') return;

    if (!this.keys.has(code)) {
      // Edge-triggered actions
      if (code === 'KeyR') this.triggerReload();
      if (code === 'KeyF') this.toggleFlashlight();
      if (code === 'KeyC' || code === 'ControlLeft') this.crouching = !this.crouching;
      if (code === 'Digit1') this.switchWeapon('carbine');
      if (code === 'Digit2') this.switchWeapon('sidearm');
      if (code === 'KeyV') this.triggerManualCommsPing();
    }

    this.keys.add(code);

    // Lean target
    if (this.keys.has('KeyQ')) this.leanTarget = -1;
    else if (this.keys.has('KeyE')) this.leanTarget = 1;
    else this.leanTarget = 0;
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
    if (this.keys.has('KeyQ')) this.leanTarget = -1;
    else if (this.keys.has('KeyE')) this.leanTarget = 1;
    else this.leanTarget = 0;
  };

  private handleWindowBlur = (): void => {
    this.keys.clear();
    this.mouseDown = false;
    this.rightMouseDown = false;
    this.leanTarget = 0;
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.handleWindowBlur();
    }
  };

  private handlePointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    this.pushHudSnapshot();
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
  };

  private handleContextRestored = (): void => {
    if (this.disposed) return;
    this.contextLost = false;
    this.lastTimeMs = performance.now();
    this.scheduleNextFrame();
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (this.phase !== 'playing') return;
    if (!this.pointerLocked && !this.mouseDown) return;

    const sens = this.isAds ? 0.00145 : 0.0022;
    this.yaw -= e.movementX * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * sens, -1.35, 1.35);

    this.weaponSwayX = THREE.MathUtils.clamp(this.weaponSwayX - e.movementX * 0.00055, -0.04, 0.04);
    this.weaponSwayY = THREE.MathUtils.clamp(this.weaponSwayY + e.movementY * 0.00055, -0.03, 0.03);
  };

  private handleMouseDown = (e: MouseEvent): void => {
    if (this.phase !== 'playing') return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('button')) return;

    this.audio.unlock(true);
    if (!this.pointerLocked && !this.touchEnabled && target === this.renderer.domElement) {
      this.safeRequestPointerLock();
    }

    if (e.button === 0) {
      this.mouseDown = true;
      this.semiTriggerConsumed = false;
    } else if (e.button === 2) {
      this.rightMouseDown = true;
    }
  };

  private handleMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.mouseDown = false;
      this.semiTriggerConsumed = false;
    } else if (e.button === 2) {
      this.rightMouseDown = false;
    }
  };

  private handleContextMenu = (e: MouseEvent): void => {
    if (this.phase === 'playing') {
      e.preventDefault();
    }
  };

  // --- Public UI/Control API ---

  private safeRequestPointerLock(): void {
    const userActive = Boolean(
      (navigator as unknown as { userActivation?: { isActive?: boolean } }).userActivation?.isActive,
    );
    if (!userActive) return;
    try {
      const res = this.renderer.domElement.requestPointerLock?.() as unknown as Promise<void> | undefined;
      if (res && typeof res.catch === 'function') {
        res.catch(() => {});
      }
    } catch {
      // ignore pointer lock restrictions
    }
  }

  public startGame(fromUserGesture = false): void {
    this.audio.unlock(fromUserGesture);
    if (fromUserGesture) {
      this.audio.playClick(1040);
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    this.resetSimulationState();
    this.phase = 'playing';
    document.body.dataset.state = 'playing';

    if (!this.touchEnabled && fromUserGesture) {
      this.safeRequestPointerLock();
    }

    this.emitComms('BRAVO-2', 'BREACH CONFIRMED — CLEAR WAREHOUSE SECTOR 1', { x: this.allyX, y: 1.5, z: this.allyZ }, true);
    this.pushHudSnapshot();
  }

  public pauseGame(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    document.body.dataset.state = 'paused';
    this.keys.clear();
    this.mouseDown = false;
    this.rightMouseDown = false;
    document.exitPointerLock?.();
    this.pushHudSnapshot();
  }

  public resumeGame(): void {
    if (this.phase !== 'paused') return;
    this.audio.unlock(true);
    this.phase = 'playing';
    document.body.dataset.state = 'playing';
    if (!this.touchEnabled) {
      this.safeRequestPointerLock();
    }
    this.pushHudSnapshot();
  }

  public restartGame(): void {
    this.startGame(true);
  }

  public returnToTitle(): void {
    this.phase = 'title';
    this.outcome = null;
    document.body.dataset.state = 'title';
    this.keys.clear();
    this.mouseDown = false;
    this.rightMouseDown = false;
    document.exitPointerLock?.();
    this.resetSimulationState();
    this.pushHudSnapshot();
  }

  public toggleMute(): void {
    this.audio.unlock();
    this.audio.setMuted(!this.audio.isMuted());
    this.pushHudSnapshot();
  }

  public toggleFlashlight(): void {
    this.flashlightOn = !this.flashlightOn;
    this.flashlight.visible = this.flashlightOn;
    this.audio.playClick(this.flashlightOn ? 1150 : 720);
    this.pushHudSnapshot();
  }

  public switchWeapon(id: WeaponId): void {
    if (this.activeWeapon === id) return;
    this.activeWeapon = id;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.carbineRig.group.visible = id === 'carbine';
    this.sidearmRig.group.visible = id === 'sidearm';
    this.audio.playClick(820);
    this.pushHudSnapshot();
  }

  public triggerReload(): void {
    if (this.isReloading) return;
    const spec = WEAPON_SPECS[this.activeWeapon];
    const st = this.weaponState[this.activeWeapon];
    if (st.mag >= spec.magSize || st.reserve <= 0) return;

    this.isReloading = true;
    this.reloadTimer = spec.reloadTimeMs / 1000;
    this.audio.playReload();
    this.pushHudSnapshot();
  }

  public triggerManualCommsPing(): void {
    this.audio.unlock();
    const line = ALLY_CALLOUTS[Math.floor(Math.random() * ALLY_CALLOUTS.length)];
    this.emitComms('BRAVO-2', line.replace('BRAVO-2: ', ''), { x: this.allyX, y: 1.5, z: this.allyZ }, true);
    this.pushHudSnapshot();
  }

  public setTouchEnabled(enabled: boolean): void {
    this.touchEnabled = enabled;
    this.pushHudSnapshot();
  }

  public updateTouchInput(patch: Partial<TouchInputState>): void {
    Object.assign(this.touchInput, patch);
    if (patch.lean !== undefined) {
      this.leanTarget = patch.lean;
    }
    if (patch.crouch !== undefined) {
      this.crouching = patch.crouch;
    }
  }

  public setCrosshairListener(listener: ((frame: CrosshairFrame) => void) | null): void {
    this.onCrosshairFrame = listener;
    if (listener) {
      listener({
        gapPx: this.crosshairGapPx,
        scale: this.crosshairScale,
        opacity: this.crosshairOpacity,
        spreadRad: this.effectiveSpreadRad,
        bloomRatio: 0,
      });
    }
  }

  private resetSimulationState(): void {
    this.outcome = null;
    this.playerX = PLAYER_SPAWN.x;
    this.playerY = PLAYER_SPAWN.y;
    this.playerZ = PLAYER_SPAWN.z;
    this.yaw = PLAYER_SPAWN.yaw;
    this.pitch = 0;
    this.leanCurrent = 0;
    this.leanTarget = 0;
    this.crouching = false;
    this.flashlightOn = true;
    this.flashlight.visible = true;
    this.isAds = false;
    this.adsBlend = 0;
    this.currentMoveSpeed = 0;
    this.fireBloom = 0;
    this.effectiveSpreadRad = WEAPON_SPECS.carbine.hipSpread;
    this.crosshairGapPx = 11.5;
    this.crosshairScale = 1;
    this.crosshairOpacity = 1;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.trauma = 0;
    this.hitstopTimer = 0;
    this.damageFlash = 0;

    this.health = 100;
    this.armor = 100;
    this.activeWeapon = 'carbine';
    this.carbineRig.group.visible = true;
    this.sidearmRig.group.visible = false;
    this.weaponState = {
      carbine: { mag: 30, reserve: 150 },
      sidearm: { mag: 15, reserve: 60 },
    };
    this.isReloading = false;
    this.reloadTimer = 0;

    this.currentSector = 1;
    this.eliminations = 0;
    this.headshots = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.score = 0;
    this.elapsedSeconds = 0;
    this.activeComms = null;

    this.spawnActors();
  }

  private emitComms(speaker: string, line: string, sourcePos: { x: number; y: number; z: number }, isAlly: boolean): void {
    const acc = this.audio.playProximityComms(
      { x: this.playerX, y: this.playerY, z: this.playerZ },
      this.yaw,
      sourcePos,
      LEVEL_WALLS,
      isAlly,
    );

    this.activeComms = {
      id: this.commsIdSeq++,
      speaker,
      line,
      occluded: acc.isOccluded,
      dbLoss: acc.dbAttenuation,
      distance: Math.round(acc.distance),
      timestamp: performance.now(),
    };
  }

  // --- Main Loop & Pacing ---

  private scheduleNextFrame(): void {
    if (this.disposed || this.contextLost) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => {
        if (!this.disposed && !this.contextLost) this.tick();
      });
    } else {
      this.frameId = requestAnimationFrame(() => this.tick());
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed || this.contextLost) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private tick(): void {
    if (this.disposed || this.contextLost) return;

    const nowMs = performance.now();
    const rawDt = (nowMs - this.lastTimeMs) / 1000;
    this.lastTimeMs = nowMs;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    this.updateFlickerLights(nowMs * 0.001);
    this.updateDust(dt);
    this.updateParticles(dt);

    if (this.phase === 'title') {
      this.updateTitleTour(dt);
    } else if (this.phase === 'playing') {
      this.updateGameplay(dt);
    }

    if (this.bodycamPass) {
      this.bodycamPass.uniforms.uTime.value = nowMs * 0.001;
      this.bodycamPass.uniforms.uDamage.value = this.damageFlash;
    }

    if (this.composer && !this.isSoftwareGl) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    this.scheduleNextFrame();
  }

  private updateTitleTour(dt: number): void {
    this.titleTourTime += dt;
    this.weaponMount.visible = false;
    this.flashlight.visible = false;

    // Dramatic diagonal upper-catwalk bodycam sweep through Sector 1 & Sector 2
    // Keeps left third dark/clean for title lockup while framing containers, pillars, & silhouettes on the right.
    const t = this.titleTourTime * 0.14;
    const camX = -8.5 + Math.sin(t) * 2.4;
    const camZ = 9.5 - ((Math.sin(t * 0.65) + 1) * 0.5) * 6.5;
    const camY = 2.85 + Math.sin(this.titleTourTime * 0.55) * 0.08;

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(3.5 + Math.cos(t * 0.5) * 1.5, 1.45, camZ - 11.5);

    // Subtle idle head-scan on operators so the live scene feels alive
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      e.rig.root.rotation.y = e.yaw + Math.sin(this.titleTourTime * 0.9 + i * 1.7) * 0.28;
    }
  }

  private updateFlickerLights(timeSec: number): void {
    for (const fl of this.flickeringLights) {
      const wave = Math.sin(timeSec * 14 + fl.seed) * Math.sin(timeSec * 37 + fl.seed);
      const dim = wave > 0.72 ? 0.35 : 1.0;
      fl.light.intensity = fl.baseIntensity * dim;
    }
  }

  private updateDust(dt: number): void {
    const pos = this.dustPoints.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < DUST_COUNT; i++) {
      arr[i * 3 + 1] += Math.sin(this.lastTimeMs * 0.001 + i) * 0.08 * dt;
    }
    pos.needsUpdate = true;
  }

  private updateParticles(dt: number): void {
    let anyActive = false;
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyActive = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        _v1.set(0, -50, 0);
        _scale.set(0.001, 0.001, 0.001);
        _quat.identity();
        _mat4.compose(_v1, _quat, _scale);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }

      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.03) {
        p.y = 0.03;
        p.vy *= -0.35;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      const fade = 1 - p.life / p.maxLife;
      const s = p.size * fade;
      _v1.set(p.x, p.y, p.z);
      _scale.set(s, s, s);
      _quat.identity();
      _mat4.compose(_v1, _quat, _scale);
      this.particleMesh.setMatrixAt(i, _mat4);
    }
    if (anyActive) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private updateGameplay(dt: number): void {
    this.weaponMount.visible = true;
    this.flashlight.visible = this.flashlightOn;
    this.elapsedSeconds += dt;

    // Decaying visual timers (always run even during hitstop)
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.8);
    this.hitMarkerTimer = Math.max(0, this.hitMarkerTimer - dt);
    this.killMarkerTimer = Math.max(0, this.killMarkerTimer - dt);
    this.trauma = Math.max(0, this.trauma - dt * 2.4);

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      if (this.muzzleFlashTimer <= 0) this.muzzleLight.intensity = 0;
    }

    // Touch look deltas
    if (this.touchInput.lookDeltaX !== 0 || this.touchInput.lookDeltaY !== 0) {
      this.yaw -= this.touchInput.lookDeltaX * 0.0045;
      this.pitch = THREE.MathUtils.clamp(this.pitch - this.touchInput.lookDeltaY * 0.0045, -1.35, 1.35);
      this.touchInput.lookDeltaX = 0;
      this.touchInput.lookDeltaY = 0;
    }

    // Hitstop pauses simulation physics briefly on heavy kills/impacts
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.applyCameraTransform(dt, false);
      return;
    }

    // Player movement
    const sprinting = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && !this.crouching && !this.isAds;
    const speed = this.crouching ? 2.6 : sprinting ? 6.2 : 4.25;

    let fwdInput = 0;
    let strafeInput = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) fwdInput += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) fwdInput -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafeInput += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafeInput -= 1;

    fwdInput += this.touchInput.moveY;
    strafeInput += this.touchInput.moveX;

    const inputMag = Math.hypot(fwdInput, strafeInput);
    const moving = inputMag > 0.05;
    if (inputMag > 1) {
      fwdInput /= inputMag;
      strafeInput /= inputMag;
    }

    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const worldVx = (-sinY * fwdInput + cosY * strafeInput) * speed;
    const worldVz = (-cosY * fwdInput - sinY * strafeInput) * speed;

    if (moving) {
      const resolved = resolveCircleAgainstWalls(
        this.playerX + worldVx * dt,
        this.playerZ + worldVz * dt,
        0.42,
        LEVEL_WALLS,
        ARENA_BOUNDS,
      );
      const stepDelta = Math.hypot(resolved.x - this.playerX, resolved.z - this.playerZ);
      this.currentMoveSpeed = dt > 0 ? stepDelta / dt : 0;
      this.playerX = resolved.x;
      this.playerZ = resolved.z;
      this.walkDist += stepDelta;
      if (this.walkDist - this.lastStepDist >= (sprinting ? 1.55 : 1.75)) {
        this.lastStepDist = this.walkDist;
        this.audio.playFootstep(sprinting);
      }
    } else {
      this.currentMoveSpeed = THREE.MathUtils.damp(this.currentMoveSpeed, 0, 18, dt);
    }

    // Update current sector based on player Z progression
    if (this.playerZ < -16.2) this.currentSector = 3;
    else if (this.playerZ < -2.2) this.currentSector = 2;
    else this.currentSector = 1;

    // ADS & Reload & Firing
    this.isAds = (this.rightMouseDown || this.touchInput.ads) && !this.isReloading;
    this.adsBlend = THREE.MathUtils.damp(this.adsBlend, this.isAds ? 1 : 0, 14, dt);

    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.completeReload();
      }
    }

    if (this.fireCooldown > 0) this.fireCooldown -= dt;

    const firingHeld = this.mouseDown || this.touchInput.firing;
    const spec = WEAPON_SPECS[this.activeWeapon];
    if (firingHeld && !this.isReloading && this.fireCooldown <= 0) {
      if (spec.automatic || !this.semiTriggerConsumed) {
        this.firePlayerWeapon();
        if (!spec.automatic) this.semiTriggerConsumed = true;
      }
    } else {
      this.fireBloom = stepFireBloom(this.fireBloom, this.activeWeapon, dt);
    }

    // Dynamic crosshair spread & recoil bloom damping
    const spreadState = computeDynamicSpread({
      weapon: this.activeWeapon,
      moveSpeed: this.currentMoveSpeed,
      fireBloom: this.fireBloom,
      adsBlend: this.adsBlend,
      crouching: this.crouching,
      isReloading: this.isReloading,
    });
    this.effectiveSpreadRad = spreadState.effectiveSpreadRad;
    this.crosshairGapPx = THREE.MathUtils.damp(this.crosshairGapPx, spreadState.targetGapPx, 18, dt);
    this.crosshairScale = THREE.MathUtils.damp(this.crosshairScale, spreadState.targetScale, 18, dt);
    this.crosshairOpacity = THREE.MathUtils.damp(this.crosshairOpacity, spreadState.targetOpacity, 20, dt);

    this.onCrosshairFrame?.({
      gapPx: this.crosshairGapPx,
      scale: this.crosshairScale,
      opacity: this.crosshairOpacity,
      spreadRad: this.effectiveSpreadRad,
      bloomRatio: spreadState.bloomRatio,
    });

    // Recoil & weapon sway recovery
    this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, 14, dt);
    this.recoilYaw = THREE.MathUtils.damp(this.recoilYaw, 0, 14, dt);
    this.weaponSwayX = THREE.MathUtils.damp(this.weaponSwayX, 0, 10, dt);
    this.weaponSwayY = THREE.MathUtils.damp(this.weaponSwayY, 0, 10, dt);

    // Friendly BRAVO-2 ally tactical follow + periodic proximity comms
    this.updateAlly(dt);

    // Hostile tactical AI + attack token pool (max 3 concurrent attackers)
    this.updateEnemies(dt);

    // Camera & viewmodel transform
    this.applyCameraTransform(dt, moving);

    // Throttled HUD update (<= 10Hz)
    this.hudSyncTimer += dt;
    if (this.hudSyncTimer >= 0.1) {
      this.hudSyncTimer = 0;
      this.pushHudSnapshot();
    }
  }

  private applyCameraTransform(dt: number, moving: boolean): void {
    const targetHeight = this.crouching ? 1.05 : 1.62;
    this.playerY = THREE.MathUtils.damp(this.playerY, targetHeight, 12, dt);
    this.leanCurrent = THREE.MathUtils.damp(this.leanCurrent, this.leanTarget, 12, dt);

    // Gait-synced bodycam bob
    const bobAmp = moving ? (this.isAds ? 0.014 : 0.032) : 0.004;
    const bobFreq = moving ? 4.4 : 1.5;
    const phase = moving ? this.walkDist * bobFreq : this.elapsedSeconds * 1.8;
    const bobY = Math.sin(phase) * bobAmp;
    const bobX = Math.cos(phase * 0.5) * bobAmp * 0.6;

    // Lateral lean shift around corners
    const leanOffset = this.leanCurrent * 0.36;
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    // Camera shake from trauma^2
    const shakeAmt = this.trauma * this.trauma * 0.035;
    const shakePitch = (Math.random() - 0.5) * shakeAmt;
    const shakeYaw = (Math.random() - 0.5) * shakeAmt;

    this.camera.position.set(
      this.playerX + rightX * (leanOffset + bobX),
      this.playerY + bobY,
      this.playerZ + rightZ * (leanOffset + bobX),
    );

    _euler.set(
      THREE.MathUtils.clamp(this.pitch + this.recoilPitch + shakePitch, -1.4, 1.4),
      this.yaw + this.recoilYaw + shakeYaw,
      -this.leanCurrent * 0.19,
      'YXZ',
    );
    this.camera.quaternion.setFromEuler(_euler);

    // Dynamic Bodycam FOV (wide 86° hip -> crisp 64° ADS)
    const targetFov = THREE.MathUtils.lerp(86, 64, this.adsBlend);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }

    // Position weapon viewmodel (hip right-shoulder vs centered holographic ADS)
    const isCarbine = this.activeWeapon === 'carbine';
    const hipX = isCarbine ? 0.16 : 0.14;
    const hipY = isCarbine ? -0.17 : -0.15;
    const hipZ = isCarbine ? -0.30 : -0.34;
    const adsX = 0;
    const adsY = isCarbine ? -0.074 : -0.045;
    const adsZ = isCarbine ? -0.22 : -0.26;

    const reloadDrop = this.isReloading ? Math.sin((this.reloadTimer / 1.4) * Math.PI) * -0.14 : 0;

    this.weaponMount.position.set(
      THREE.MathUtils.lerp(hipX, adsX, this.adsBlend) + this.weaponSwayX * (1 - this.adsBlend * 0.7),
      THREE.MathUtils.lerp(hipY, adsY, this.adsBlend) + this.weaponSwayY * (1 - this.adsBlend * 0.7) + reloadDrop,
      THREE.MathUtils.lerp(hipZ, adsZ, this.adsBlend) + Math.min(0.05, this.recoilPitch * 0.7),
    );
    this.weaponMount.rotation.set(
      this.recoilPitch * 0.9 + (this.isReloading ? -0.35 : 0),
      this.weaponSwayX * 0.8,
      this.leanCurrent * 0.08,
    );
  }

  private completeReload(): void {
    const spec = WEAPON_SPECS[this.activeWeapon];
    const st = this.weaponState[this.activeWeapon];
    const needed = spec.magSize - st.mag;
    const loaded = Math.min(needed, st.reserve);
    st.mag += loaded;
    st.reserve -= loaded;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.pushHudSnapshot();
  }

  private firePlayerWeapon(): void {
    const spec = WEAPON_SPECS[this.activeWeapon];
    const st = this.weaponState[this.activeWeapon];
    if (st.mag <= 0) {
      this.audio.playClick(380);
      this.fireCooldown = 0.25;
      if (st.reserve > 0) this.triggerReload();
      return;
    }

    st.mag -= 1;
    this.shotsFired += 1;
    this.fireCooldown = spec.fireRateMs / 1000;

    this.audio.playPlayerShot(this.activeWeapon);

    // Muzzle flash + brass casing particle + firing bloom
    this.muzzleLight.intensity = 4.5;
    this.muzzleFlashTimer = 0.045;
    this.trauma = Math.min(1, this.trauma + 0.16);
    this.recoilPitch += spec.recoilPitch * (this.isAds ? 0.65 : 1.0);
    this.recoilYaw += (Math.random() - 0.5) * spec.recoilYaw * 2;
    this.fireBloom = Math.min(spec.maxBloom, this.fireBloom + spec.bloomPerShot);

    const rig = this.activeWeapon === 'carbine' ? this.carbineRig : this.sidearmRig;
    rig.ejectionPoint.getWorldPosition(_v1);
    this.spawnParticleBurst(_v1.x, _v1.y, _v1.z, 2, 0xd4a448, 2.2, 9.8, 0.45);

    // Raycast ballistic shot from camera center + live dynamic spread
    const liveSpread = computeDynamicSpread({
      weapon: this.activeWeapon,
      moveSpeed: this.currentMoveSpeed,
      fireBloom: this.fireBloom,
      adsBlend: this.adsBlend,
      crouching: this.crouching,
      isReloading: this.isReloading,
    });
    const spread = liveSpread.effectiveSpreadRad;
    _rayDir.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    _rayDir.x += (Math.random() - 0.5) * spread * 2;
    _rayDir.y += (Math.random() - 0.5) * spread * 2;
    _rayDir.z += (Math.random() - 0.5) * spread * 2;
    _rayDir.normalize();

    this.raycaster.set(this.camera.position, _rayDir);
    this.raycaster.far = 70;

    const levelHits = this.raycaster.intersectObjects(this.levelCollisionMeshes, false);
    const levelDist = levelHits.length > 0 ? levelHits[0].distance : 70;

    const enemyHits = this.raycaster.intersectObjects(this.enemyHitMeshes, false);
    if (enemyHits.length > 0 && enemyHits[0].distance < levelDist) {
      const hit = enemyHits[0];
      const enemyId = hit.object.userData.enemyId as string;
      const isHead = Boolean(hit.object.userData.isHead);
      const actor = this.enemies.find((e) => e.id === enemyId);
      if (actor && actor.state !== 'ko') {
        this.shotsHit += 1;
        const dmg = spec.damage * (isHead ? spec.headshotMultiplier : 1);
        actor.hp -= dmg;
        actor.hitFlashTimer = 0.055;
        actor.state = actor.state === 'patrol' ? 'alert' : actor.state;

        this.spawnParticleBurst(hit.point.x, hit.point.y, hit.point.z, isHead ? 14 : 7, 0xd93829, 3.8, 8.5, 0.7);
        this.hitMarkerTimer = 0.14;

        if (actor.hp <= 0) {
          this.handleEnemyNeutralized(actor, isHead);
        } else {
          this.audio.playHitConfirm(isHead, false);
        }
      }
    } else if (levelHits.length > 0) {
      const p = levelHits[0].point;
      this.spawnParticleBurst(p.x, p.y, p.z, 5, 0xffd28a, 3.2, 9.8, 0.55);
    }

    this.pushHudSnapshot();
  }

  private handleEnemyNeutralized(actor: EnemyActor, headshot: boolean): void {
    actor.state = 'ko';
    actor.koProgress = 0;
    if (actor.rig.laserLine) actor.rig.laserLine.visible = false;

    this.eliminations += 1;
    if (headshot) this.headshots += 1;

    const cfg = ENEMY_CONFIGS[actor.archetype];
    this.score += cfg.scoreValue + (headshot ? 75 : 0);
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      this.saveBestScore(this.bestScore);
    }

    this.killMarkerTimer = 0.25;
    this.hitstopTimer = 0.045;
    this.trauma = Math.min(1, this.trauma + 0.35);
    this.audio.playHitConfirm(headshot, true);

    const alive = this.enemies.filter((e) => e.state !== 'ko').length;
    if (alive === 0) {
      this.triggerOutcome('victory');
    } else if (alive === 9 || alive === 5) {
      this.emitComms(
        'BRAVO-2',
        `SECTOR ADVANCING — ${alive} HOSTILES REMAINING`,
        { x: this.allyX, y: 1.5, z: this.allyZ },
        true,
      );
    }
  }

  private updateAlly(dt: number): void {
    // Follow ~2.8m behind/left of player with wall collision
    const targetX = this.playerX - Math.cos(this.yaw) * 2.1 + Math.sin(this.yaw) * 2.4;
    const targetZ = this.playerZ + Math.sin(this.yaw) * 2.1 + Math.cos(this.yaw) * 2.4;

    const dx = targetX - this.allyX;
    const dz = targetZ - this.allyZ;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.45) {
      const move = Math.min(dist, 3.8 * dt);
      const next = resolveCircleAgainstWalls(
        this.allyX + (dx / dist) * move,
        this.allyZ + (dz / dist) * move,
        0.4,
        LEVEL_WALLS,
        ARENA_BOUNDS,
      );
      this.allyX = next.x;
      this.allyZ = next.z;
      this.allyYaw = Math.atan2(-dx, -dz);
    } else {
      this.allyYaw = this.yaw;
    }

    this.allyRig.root.position.set(this.allyX, 0, this.allyZ);
    this.allyRig.root.rotation.y = this.allyYaw;

    // Periodic live proximity comms callout from BRAVO-2
    this.allyCommsTimer -= dt;
    if (this.allyCommsTimer <= 0) {
      this.allyCommsTimer = 8.5 + Math.random() * 4;
      const line = ALLY_CALLOUTS[Math.floor(Math.random() * ALLY_CALLOUTS.length)].replace('BRAVO-2: ', '');
      this.emitComms('BRAVO-2', line, { x: this.allyX, y: 1.5, z: this.allyZ }, true);
    }
  }

  private updateEnemies(dt: number): void {
    // Crowd attack token pool: max 3 simultaneous attackers
    let activeTokens = 0;
    for (const e of this.enemies) {
      if (e.state === 'windup' || e.state === 'firing') activeTokens++;
    }

    for (const actor of this.enemies) {
      // Handle KO topple animation
      if (actor.state === 'ko') {
        if (actor.koProgress < 1) {
          actor.koProgress = Math.min(1, actor.koProgress + dt * 3.2);
          actor.rig.bodyGroup.rotation.x = -actor.koProgress * (Math.PI * 0.48);
          actor.rig.bodyGroup.position.y = -actor.koProgress * 0.14;
        }
        continue;
      }

      // Hit flash recovery
      if (actor.hitFlashTimer > 0) {
        actor.hitFlashTimer -= dt;
        for (const m of actor.rig.hitMaterials) {
          m.emissive.setHex(actor.hitFlashTimer > 0 ? 0xffffff : 0x000000);
          m.emissiveIntensity = actor.hitFlashTimer > 0 ? 0.85 : 0;
        }
      }

      const dx = this.playerX - actor.x;
      const dz = this.playerZ - actor.z;
      const dist = Math.hypot(dx, dz);

      const canSee =
        dist < 28 &&
        hasLineOfSight(actor.x, 1.45, actor.z, this.playerX, this.playerY - 0.1, this.playerZ, LEVEL_WALLS);

      actor.stateTimer = Math.max(0, actor.stateTimer - dt);
      const cfg = ENEMY_CONFIGS[actor.archetype];

      // Proximity hostile chatter when close or behind a wall
      actor.commsCooldown -= dt;
      if (actor.commsCooldown <= 0 && dist < 16) {
        actor.commsCooldown = 7 + Math.random() * 6;
        if (canSee || dist < 11) {
          const line = HOSTILE_CALLOUTS[Math.floor(Math.random() * HOSTILE_CALLOUTS.length)].replace('HOSTILE: ', '');
          this.emitComms(`${actor.archetype.toUpperCase()}`, line, { x: actor.x, y: 1.5, z: actor.z }, false);
        }
      }

      if (actor.state === 'windup') {
        // Face player and shine telegraph laser
        actor.yaw = Math.atan2(-dx, -dz);
        actor.rig.root.rotation.y = actor.yaw;
        if (actor.rig.laserLine) actor.rig.laserLine.visible = true;

        if (actor.stateTimer <= 0) {
          actor.state = 'firing';
          actor.burstRemaining = cfg.burstCount;
          actor.burstCooldown = 0;
        }
        continue;
      }

      if (actor.state === 'firing') {
        actor.yaw = Math.atan2(-dx, -dz);
        actor.rig.root.rotation.y = actor.yaw;
        if (actor.rig.laserLine) actor.rig.laserLine.visible = true;

        actor.burstCooldown -= dt;
        if (actor.burstCooldown <= 0 && actor.burstRemaining > 0) {
          actor.burstRemaining -= 1;
          actor.burstCooldown = cfg.burstInterval;
          this.fireEnemyShot(actor, dist, canSee);
        }

        if (actor.burstRemaining <= 0) {
          actor.state = 'reposition';
          actor.stateTimer = 1.1 + Math.random() * 0.9;
          if (actor.rig.laserLine) actor.rig.laserLine.visible = false;
        }
        continue;
      }

      if (actor.rig.laserLine) actor.rig.laserLine.visible = false;

      // Only wake patrol hostiles in current or adjacent sector, or within 15m
      const sectorAwake = actor.sector <= this.currentSector || canSee || dist < 15;
      if (!sectorAwake) continue;

      const grantToken = canSee && activeTokens < 3 && actor.stateTimer <= 0;
      const intent = computeEnemyIntent(
        actor.archetype,
        actor.state,
        dist,
        canSee,
        grantToken,
        actor.stateTimer,
      );

      if (intent.nextState === 'windup') {
        actor.state = 'windup';
        actor.stateTimer = cfg.windupDuration;
        activeTokens++;
        continue;
      }

      actor.state = intent.nextState;

      // Move toward/around player or patrol target
      if (canSee || actor.state === 'alert') {
        const invDist = dist > 0.01 ? 1 / dist : 1;
        const fx = dx * invDist;
        const fz = dz * invDist;
        const rx = -fz * actor.strafeSign;
        const rz = fx * actor.strafeSign;

        const vx = (fx * intent.moveForward + rx * intent.strafeDir) * cfg.speed;
        const vz = (fz * intent.moveForward + rz * intent.strafeDir) * cfg.speed;

        const next = resolveCircleAgainstWalls(
          actor.x + vx * dt,
          actor.z + vz * dt,
          0.42,
          LEVEL_WALLS,
          ARENA_BOUNDS,
        );
        actor.x = next.x;
        actor.z = next.z;
        actor.yaw = Math.atan2(-dx, -dz);
      } else {
        // Gentle patrol movement
        const pdx = actor.patrolTarget.x - actor.x;
        const pdz = actor.patrolTarget.z - actor.z;
        const pdist = Math.hypot(pdx, pdz);
        if (pdist > 0.3) {
          const mv = Math.min(pdist, cfg.speed * 0.45 * dt);
          actor.x += (pdx / pdist) * mv;
          actor.z += (pdz / pdist) * mv;
          actor.yaw = Math.atan2(-pdx, -pdz);
        }
      }

      actor.rig.root.position.set(actor.x, 0, actor.z);
      actor.rig.root.rotation.y = actor.yaw;
    }
  }

  private fireEnemyShot(actor: EnemyActor, dist: number, canSee: boolean): void {
    const cfg = ENEMY_CONFIGS[actor.archetype];
    actor.rig.muzzleObj.getWorldPosition(_v1);
    this.spawnParticleBurst(_v1.x, _v1.y, _v1.z, 3, 0xffaa33, 2.5, 4, 0.5);

    this.audio.playSpatialGunshot(
      { x: this.playerX, y: this.playerY, z: this.playerZ },
      this.yaw,
      { x: actor.x, y: 1.4, z: actor.z },
      LEVEL_WALLS,
    );

    if (!canSee) return;

    // Accuracy scales fairly by distance and crouch/lean posture
    const postureDodge = (this.crouching ? 0.14 : 0) + (this.leanCurrent !== 0 ? 0.12 : 0);
    const hitChance = Math.max(0.18, Math.min(0.75, 0.68 - dist * 0.018 - postureDodge));
    if (Math.random() < hitChance) {
      const nextVit = applyPlayerDamage(
        {
          health: this.health,
          maxHealth: this.maxHealth,
          armor: this.armor,
          maxArmor: this.maxArmor,
        },
        cfg.damage,
      );
      this.health = nextVit.health;
      this.armor = nextVit.armor;
      this.damageFlash = 0.85;
      this.trauma = Math.min(1, this.trauma + 0.48);
      this.audio.playPlayerHit();

      if (this.health <= 0) {
        this.triggerOutcome('defeat');
      }
      this.pushHudSnapshot();
    }
  }

  private triggerOutcome(outcome: 'victory' | 'defeat'): void {
    this.outcome = outcome;
    this.phase = 'gameover';
    document.body.dataset.state = 'gameover';
    this.keys.clear();
    this.mouseDown = false;
    this.rightMouseDown = false;
    document.exitPointerLock?.();
    this.pushHudSnapshot();
  }

  private pushHudSnapshot(): void {
    const st = this.weaponState[this.activeWeapon];
    const spec = WEAPON_SPECS[this.activeWeapon];
    const alive = this.enemies.filter((e) => e.state !== 'ko').length;
    const sprinting = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && !this.crouching && !this.isAds;
    const stance: Stance = this.crouching ? 'CROUCH' : sprinting ? 'SPRINT' : 'STAND';

    // Expire comms banner after 4.5 seconds
    if (this.activeComms && performance.now() - this.activeComms.timestamp > 4500) {
      this.activeComms = null;
    }

    // Also compute live acoustic distance/occlusion readout to nearest active sound/ally if comms null
    const snapshot: HudSnapshot = {
      phase: this.phase,
      outcome: this.outcome,
      health: Math.round(this.health),
      maxHealth: this.maxHealth,
      armor: Math.round(this.armor),
      maxArmor: this.maxArmor,
      weapon: this.activeWeapon,
      magAmmo: st.mag,
      magSize: spec.magSize,
      reserveAmmo: st.reserve,
      isReloading: this.isReloading,
      isAds: this.isAds,
      flashlightOn: this.flashlightOn,
      stance,
      lean: this.leanTarget,
      sector: this.currentSector,
      totalSectors: this.totalSectors,
      enemiesRemaining: alive,
      eliminations: this.eliminations,
      headshots: this.headshots,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      score: this.score,
      bestScore: this.bestScore,
      elapsedSeconds: Math.round(this.elapsedSeconds),
      muted: this.audio.isMuted(),
      pointerLocked: this.pointerLocked,
      touchEnabled: this.touchEnabled,
      activeComms: this.activeComms,
      damageFlash: this.damageFlash,
      hitMarker: this.hitMarkerTimer > 0,
      killMarker: this.killMarkerTimer > 0,
      batteryPct: Math.max(12, Math.round(94 - this.elapsedSeconds * 0.08)),
      crosshairGapPx: Math.round(this.crosshairGapPx),
    };
    this.onHudUpdate(snapshot);
  }

  /**
   * Exposes live acoustic occlusion test reading between player and BRAVO-2 or nearest enemy
   * for telemetry display and verification.
   */
  public getLiveAcousticDebug(): { wallCount: number; cutoffHz: number; dbAttenuation: number } {
    return computeAcousticOcclusion(
      { x: this.playerX, y: this.playerY, z: this.playerZ },
      this.yaw,
      { x: this.allyX, y: 1.5, z: this.allyZ },
      LEVEL_WALLS,
    );
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    document.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('contextmenu', this.handleContextMenu);
    this.resizeObserver?.disconnect();

    this.textures.dispose();
    this.audio.dispose();
    this.composer?.dispose();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost, false);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored, false);
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.mountEl) {
      this.mountEl.removeChild(this.renderer.domElement);
    }
  }
}
