import { useEffect, useRef, useState } from 'react';
import { BodycamHUD } from './components/BodycamHUD';
import { GameModal } from './components/GameModal';
import { TitleScreen } from './components/TitleScreen';
import { GameEngine } from './game/GameEngine';
import type { HudSnapshot } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  phase: 'title',
  outcome: null,
  health: 100,
  maxHealth: 100,
  armor: 100,
  maxArmor: 100,
  weapon: 'carbine',
  magAmmo: 30,
  magSize: 30,
  reserveAmmo: 150,
  isReloading: false,
  isAds: false,
  flashlightOn: true,
  stance: 'STAND',
  lean: 0,
  sector: 1,
  totalSectors: 3,
  enemiesRemaining: 14,
  eliminations: 0,
  headshots: 0,
  shotsFired: 0,
  shotsHit: 0,
  score: 0,
  bestScore: 0,
  elapsedSeconds: 0,
  muted: false,
  pointerLocked: false,
  touchEnabled: false,
  activeComms: null,
  damageFlash: 0,
  hitMarker: false,
  killMarker: false,
  batteryPct: 94,
  crosshairGapPx: 12,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const engine = new GameEngine(mountEl, (snapshot) => {
      setHud(snapshot);
    });
    engineRef.current = engine;

    // Support ?autostart=1 for direct verification & quick deploy
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      engine.startGame();
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black">
      {/* Isolated WebGL canvas container (never re-rendered on HUD updates) */}
      <div
        ref={canvasMountRef}
        data-testid="webgl-viewport"
        className="absolute inset-0 w-full h-full"
      />

      {hud.phase === 'title' && (
        <TitleScreen
          bestScore={hud.bestScore}
          touchEnabled={hud.touchEnabled}
          onStart={() => engineRef.current?.startGame(true)}
          onToggleTouch={() => engineRef.current?.setTouchEnabled(!hud.touchEnabled)}
        />
      )}

      {(hud.phase === 'playing' || hud.phase === 'paused') && (
        <BodycamHUD
          hud={hud}
          registerCrosshairListener={(fn) => engineRef.current?.setCrosshairListener(fn)}
          onToggleMute={() => engineRef.current?.toggleMute()}
          onPause={() => engineRef.current?.pauseGame()}
          onRestart={() => engineRef.current?.restartGame()}
          onToggleTouch={() => engineRef.current?.setTouchEnabled(!hud.touchEnabled)}
          onSwitchWeapon={(id) => engineRef.current?.switchWeapon(id)}
          onReload={() => engineRef.current?.triggerReload()}
          onToggleFlashlight={() => engineRef.current?.toggleFlashlight()}
          onCommsPing={() => engineRef.current?.triggerManualCommsPing()}
          onTouchPatch={(patch) => engineRef.current?.updateTouchInput(patch)}
        />
      )}

      <GameModal
        hud={hud}
        onResume={() => engineRef.current?.resumeGame()}
        onRestart={() => engineRef.current?.restartGame()}
        onReturnTitle={() => engineRef.current?.returnToTitle()}
      />
    </main>
  );
}
