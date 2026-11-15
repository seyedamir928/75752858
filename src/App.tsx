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
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    let engine: GameEngine | null = null;
    try {
      engine = new GameEngine(mountEl, (snapshot) => {
        setHud(snapshot);
      });
      engineRef.current = engine;
      setWebglError(null);

      // Support ?autostart=1 for direct verification & quick deploy
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        engine.startGame();
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to initialize 3D WebGL context.';
      setWebglError(message);
    }

    return () => {
      engine?.dispose();
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

      {webglError && (
        <div
          role="alert"
          className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-950/95 p-6 font-mono text-zinc-100"
        >
          <div className="max-w-md border border-zinc-800 bg-zinc-900/90 p-6 shadow-2xl">
            <div className="text-xs tracking-[0.2em] text-amber-400">
              OPTICAL FEED INTERRUPTED
            </div>
            <h1 className="mt-2 text-lg font-bold tracking-wider text-white">
              WEBGL CONTEXT UNAVAILABLE
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              {webglError}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 w-full cursor-pointer border border-amber-500/60 bg-amber-500/15 px-4 py-2 text-xs font-semibold tracking-[0.18em] text-amber-300 transition hover:bg-amber-500/25"
            >
              REINITIALIZE FEED
            </button>
          </div>
        </div>
      )}

      {!webglError && hud.phase === 'title' && (
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
