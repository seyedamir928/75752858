import * as THREE from 'three';

export interface ProceduralTextureSet {
  concreteAlbedo: THREE.CanvasTexture;
  concreteBump: THREE.CanvasTexture;
  wallAlbedo: THREE.CanvasTexture;
  wallBump: THREE.CanvasTexture;
  steelAlbedo: THREE.CanvasTexture;
  steelBump: THREE.CanvasTexture;
  woodAlbedo: THREE.CanvasTexture;
  woodBump: THREE.CanvasTexture;
  hazardAlbedo: THREE.CanvasTexture;
  serverAlbedo: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function configureTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const rand = seededRand(1337);
  const aniso = Math.min(8, Math.max(1, maxAnisotropy));

  // 1. Poured concrete floor (albedo + bump)
  const concCanvas = document.createElement('canvas');
  concCanvas.width = 512;
  concCanvas.height = 512;
  const cCtx = concCanvas.getContext('2d')!;

  const concBumpCanvas = document.createElement('canvas');
  concBumpCanvas.width = 512;
  concBumpCanvas.height = 512;
  const cbCtx = concBumpCanvas.getContext('2d')!;

  cCtx.fillStyle = '#383b3e';
  cCtx.fillRect(0, 0, 512, 512);
  cbCtx.fillStyle = '#808080';
  cbCtx.fillRect(0, 0, 512, 512);

  // Subtle blotches and aggregate speckle
  for (let i = 0; i < 2400; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 1 + rand() * 6;
    const v = 42 + Math.floor(rand() * 28);
    cCtx.fillStyle = `rgba(${v}, ${v + 1}, ${v + 2}, 0.25)`;
    cCtx.fillRect(x, y, r, r);

    const bv = 100 + Math.floor(rand() * 60);
    cbCtx.fillStyle = `rgba(${bv}, ${bv}, ${bv}, 0.3)`;
    cbCtx.fillRect(x, y, r, r);
  }

  // Concrete slab expansion joints
  cCtx.strokeStyle = 'rgba(18, 20, 22, 0.75)';
  cCtx.lineWidth = 3;
  cbCtx.strokeStyle = 'rgba(30, 30, 30, 0.9)';
  cbCtx.lineWidth = 4;
  for (const pos of [0, 256]) {
    cCtx.beginPath();
    cCtx.moveTo(pos, 0);
    cCtx.lineTo(pos, 512);
    cCtx.moveTo(0, pos);
    cCtx.lineTo(512, pos);
    cCtx.stroke();

    cbCtx.beginPath();
    cbCtx.moveTo(pos, 0);
    cbCtx.lineTo(pos, 512);
    cbCtx.moveTo(0, pos);
    cbCtx.lineTo(512, pos);
    cbCtx.stroke();
  }

  // Hairline cracks
  cCtx.strokeStyle = 'rgba(22, 24, 26, 0.45)';
  cCtx.lineWidth = 1;
  cbCtx.strokeStyle = 'rgba(40, 40, 40, 0.6)';
  cbCtx.lineWidth = 1.5;
  for (let c = 0; c < 6; c++) {
    let cx = rand() * 512;
    let cy = rand() * 512;
    cCtx.beginPath();
    cbCtx.beginPath();
    cCtx.moveTo(cx, cy);
    cbCtx.moveTo(cx, cy);
    for (let s = 0; s < 8; s++) {
      cx += (rand() - 0.5) * 44;
      cy += (rand() - 0.5) * 44;
      cCtx.lineTo(cx, cy);
      cbCtx.lineTo(cx, cy);
    }
    cCtx.stroke();
    cbCtx.stroke();
  }

  const concreteAlbedo = configureTexture(concCanvas, true, aniso, 12, 12);
  const concreteBump = configureTexture(concBumpCanvas, false, aniso, 12, 12);

  // 2. Weathered cinderblock / industrial wall
  const wallCanvas = document.createElement('canvas');
  wallCanvas.width = 512;
  wallCanvas.height = 512;
  const wCtx = wallCanvas.getContext('2d')!;
  const wallBumpCanvas = document.createElement('canvas');
  wallBumpCanvas.width = 512;
  wallBumpCanvas.height = 512;
  const wbCtx = wallBumpCanvas.getContext('2d')!;

  wCtx.fillStyle = '#474a4d';
  wCtx.fillRect(0, 0, 512, 512);
  wbCtx.fillStyle = '#929292';
  wbCtx.fillRect(0, 0, 512, 512);

  const rows = 8;
  const cols = 4;
  const bw = 512 / cols;
  const bh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (bw * 0.5);
    for (let c = -1; c <= cols; c++) {
      const bx = c * bw + offset;
      const by = r * bh;
      const shade = 62 + Math.floor(rand() * 18);
      wCtx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 3})`;
      wCtx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
      wbCtx.fillStyle = '#b4b4b4';
      wbCtx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
    }
  }
  // Vertical moisture grime streaks from ceiling
  for (let i = 0; i < 45; i++) {
    const gx = rand() * 512;
    const gh = 60 + rand() * 240;
    const grad = wCtx.createLinearGradient(0, 0, 0, gh);
    grad.addColorStop(0, 'rgba(18, 20, 18, 0.52)');
    grad.addColorStop(1, 'rgba(18, 20, 18, 0)');
    wCtx.fillStyle = grad;
    wCtx.fillRect(gx, 0, 4 + rand() * 14, gh);
  }

  const wallAlbedo = configureTexture(wallCanvas, true, aniso, 2, 1);
  const wallBump = configureTexture(wallBumpCanvas, false, aniso, 2, 1);

  // 3. Corrugated rusted steel for shipping containers
  const steelCanvas = document.createElement('canvas');
  steelCanvas.width = 256;
  steelCanvas.height = 256;
  const sCtx = steelCanvas.getContext('2d')!;
  const steelBumpCanvas = document.createElement('canvas');
  steelBumpCanvas.width = 256;
  steelBumpCanvas.height = 256;
  const sbCtx = steelBumpCanvas.getContext('2d')!;

  sCtx.fillStyle = '#9aa0a6';
  sCtx.fillRect(0, 0, 256, 256);
  sbCtx.fillStyle = '#808080';
  sbCtx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    sCtx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    sCtx.fillRect(x, 0, 6, 256);
    sCtx.fillStyle = 'rgba(255, 255, 255, 0.09)';
    sCtx.fillRect(x + 7, 0, 4, 256);

    sbCtx.fillStyle = '#404040';
    sbCtx.fillRect(x, 0, 7, 256);
    sbCtx.fillStyle = '#d4d4d4';
    sbCtx.fillRect(x + 7, 0, 7, 256);
  }
  // Rust flecks
  for (let i = 0; i < 160; i++) {
    sCtx.fillStyle = `rgba(98, 52, 28, ${0.15 + rand() * 0.28})`;
    sCtx.fillRect(rand() * 256, rand() * 256, 3 + rand() * 10, 4 + rand() * 14);
  }
  const steelAlbedo = configureTexture(steelCanvas, true, aniso, 2, 1);
  const steelBump = configureTexture(steelBumpCanvas, false, aniso, 2, 1);

  // 4. Wooden crate planks
  const woodCanvas = document.createElement('canvas');
  woodCanvas.width = 256;
  woodCanvas.height = 256;
  const wdCtx = woodCanvas.getContext('2d')!;
  const woodBumpCanvas = document.createElement('canvas');
  woodBumpCanvas.width = 256;
  woodBumpCanvas.height = 256;
  const wdbCtx = woodBumpCanvas.getContext('2d')!;

  wdCtx.fillStyle = '#73583c';
  wdCtx.fillRect(0, 0, 256, 256);
  wdbCtx.fillStyle = '#909090';
  wdbCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    const tone = 95 + Math.floor(rand() * 25);
    wdCtx.fillStyle = `rgb(${tone}, ${Math.floor(tone * 0.76)}, ${Math.floor(tone * 0.52)})`;
    wdCtx.fillRect(0, y + 2, 256, 28);
    wdbCtx.fillStyle = '#303030';
    wdbCtx.fillRect(0, y, 256, 2);
  }
  // Crate border frame
  wdCtx.strokeStyle = '#4e3b28';
  wdCtx.lineWidth = 18;
  wdCtx.strokeRect(9, 9, 238, 238);
  const woodAlbedo = configureTexture(woodCanvas, true, aniso, 1, 1);
  const woodBump = configureTexture(woodBumpCanvas, false, aniso, 1, 1);

  // 5. Hazard stripe concrete barrier accent
  const hazCanvas = document.createElement('canvas');
  hazCanvas.width = 256;
  hazCanvas.height = 64;
  const hCtx = hazCanvas.getContext('2d')!;
  hCtx.fillStyle = '#c4911d';
  hCtx.fillRect(0, 0, 256, 64);
  hCtx.fillStyle = '#1b1d1f';
  for (let x = -64; x < 320; x += 32) {
    hCtx.beginPath();
    hCtx.moveTo(x, 64);
    hCtx.lineTo(x + 16, 64);
    hCtx.lineTo(x + 48, 0);
    hCtx.lineTo(x + 32, 0);
    hCtx.closePath();
    hCtx.fill();
  }
  const hazardAlbedo = configureTexture(hazCanvas, true, aniso, 2, 1);

  // 6. Server rack front panel
  const srvCanvas = document.createElement('canvas');
  srvCanvas.width = 256;
  srvCanvas.height = 512;
  const svCtx = srvCanvas.getContext('2d')!;
  svCtx.fillStyle = '#191c20';
  svCtx.fillRect(0, 0, 256, 512);
  for (let y = 16; y < 496; y += 28) {
    svCtx.fillStyle = '#24292f';
    svCtx.fillRect(14, y, 228, 20);
    // vent slits
    svCtx.fillStyle = '#0d0f12';
    for (let vx = 24; vx < 170; vx += 10) {
      svCtx.fillRect(vx, y + 5, 6, 10);
    }
    // tiny status LEDs
    svCtx.fillStyle = rand() > 0.25 ? '#22c55e' : '#f59e0b';
    svCtx.fillRect(212, y + 7, 5, 5);
    svCtx.fillStyle = rand() > 0.5 ? '#38bdf8' : '#334155';
    svCtx.fillRect(224, y + 7, 5, 5);
  }
  const serverAlbedo = configureTexture(srvCanvas, true, aniso, 1, 1);

  // 7. Radial contact shadow disc
  const shCanvas = document.createElement('canvas');
  shCanvas.width = 128;
  shCanvas.height = 128;
  const shCtx = shCanvas.getContext('2d')!;
  const grad = shCtx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.34)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shCtx.fillStyle = grad;
  shCtx.fillRect(0, 0, 128, 128);
  const contactShadow = new THREE.CanvasTexture(shCanvas);
  contactShadow.colorSpace = THREE.SRGBColorSpace;
  contactShadow.needsUpdate = true;

  return {
    concreteAlbedo,
    concreteBump,
    wallAlbedo,
    wallBump,
    steelAlbedo,
    steelBump,
    woodAlbedo,
    woodBump,
    hazardAlbedo,
    serverAlbedo,
    contactShadow,
    dispose: () => {
      concreteAlbedo.dispose();
      concreteBump.dispose();
      wallAlbedo.dispose();
      wallBump.dispose();
      steelAlbedo.dispose();
      steelBump.dispose();
      woodAlbedo.dispose();
      woodBump.dispose();
      hazardAlbedo.dispose();
      serverAlbedo.dispose();
      contactShadow.dispose();
    },
  };
}
