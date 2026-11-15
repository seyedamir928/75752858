import React, { useEffect, useRef, useState } from 'react';
import { WEAPON_SPECS } from '../game/combat';
import type { CrosshairFrame, HudSnapshot, TouchInputState, WeaponId } from '../game/types';

interface BodycamHUDProps {
  hud: HudSnapshot;
  registerCrosshairListener: (listener: ((frame: CrosshairFrame) => void) | null) => void;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
  onToggleTouch: () => void;
  onSwitchWeapon: (id: WeaponId) => void;
  onReload: () => void;
  onToggleFlashlight: () => void;
  onCommsPing: () => void;
  onTouchPatch: (patch: Partial<TouchInputState>) => void;
}

export const BodycamHUD: React.FC<BodycamHUDProps> = ({
  hud,
  registerCrosshairListener,
  onToggleMute,
  onPause,
  onRestart,
  onToggleTouch,
  onSwitchWeapon,
  onReload,
  onToggleFlashlight,
  onCommsPing,
  onTouchPatch,
}) => {
  const [clockIso, setClockIso] = useState(() => new Date().toISOString().slice(0, 19).replace('T', ' ') + 'Z');

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockIso(new Date().toISOString().slice(0, 19).replace('T', ' ') + 'Z');
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Direct DOM refs for 60fps dynamic crosshair updates without React setState
  const crosshairWrapRef = useRef<HTMLDivElement | null>(null);
  const tickTopRef = useRef<HTMLSpanElement | null>(null);
  const tickBottomRef = useRef<HTMLSpanElement | null>(null);
  const tickLeftRef = useRef<HTMLSpanElement | null>(null);
  const tickRightRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    registerCrosshairListener((frame) => {
      const wrap = crosshairWrapRef.current;
      if (!wrap) return;
      const gap = frame.gapPx;
      const tickLen = 7 * frame.scale;
      wrap.style.opacity = String(frame.opacity);
      wrap.dataset.gap = gap.toFixed(1);
      wrap.dataset.scale = frame.scale.toFixed(2);
      wrap.dataset.spread = frame.spreadRad.toFixed(4);

      const tint = frame.bloomRatio > 0.35 ? 'rgba(245, 158, 11, 0.95)' : 'rgba(244, 244, 245, 0.92)';

      if (tickTopRef.current) {
        tickTopRef.current.style.height = `${tickLen}px`;
        tickTopRef.current.style.transform = `translate3d(-50%, ${-(gap + tickLen)}px, 0)`;
        tickTopRef.current.style.backgroundColor = tint;
      }
      if (tickBottomRef.current) {
        tickBottomRef.current.style.height = `${tickLen}px`;
        tickBottomRef.current.style.transform = `translate3d(-50%, ${gap}px, 0)`;
        tickBottomRef.current.style.backgroundColor = tint;
      }
      if (tickLeftRef.current) {
        tickLeftRef.current.style.width = `${tickLen}px`;
        tickLeftRef.current.style.transform = `translate3d(${-(gap + tickLen)}px, -50%, 0)`;
        tickLeftRef.current.style.backgroundColor = tint;
      }
      if (tickRightRef.current) {
        tickRightRef.current.style.width = `${tickLen}px`;
        tickRightRef.current.style.transform = `translate3d(${gap}px, -50%, 0)`;
        tickRightRef.current.style.backgroundColor = tint;
      }
    });
    return () => registerCrosshairListener(null);
  }, [registerCrosshairListener]);

  // Virtual stick refs for mobile touch play
  const moveStickRef = useRef<{ id: number | null; ox: number; oy: number }>({ id: null, ox: 0, oy: 0 });
  const aimStickRef = useRef<{ id: number | null; lx: number; ly: number }>({ id: null, lx: 0, ly: 0 });
  const [moveKnob, setMoveKnob] = useState({ x: 0, y: 0 });

  const handleMoveTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (moveStickRef.current.id !== null) return;
    const t = e.changedTouches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    moveStickRef.current = {
      id: t.identifier,
      ox: rect.left + rect.width / 2,
      oy: rect.top + rect.height / 2,
    };
  };

  const handleMoveTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (moveStickRef.current.id === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === moveStickRef.current.id) {
        const maxR = 42;
        const dx = Math.max(-maxR, Math.min(maxR, t.clientX - moveStickRef.current.ox));
        const dy = Math.max(-maxR, Math.min(maxR, t.clientY - moveStickRef.current.oy));
        setMoveKnob({ x: dx, y: dy });
        onTouchPatch({ moveX: dx / maxR, moveY: -dy / maxR });
      }
    }
  };

  const handleMoveTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === moveStickRef.current.id) {
        moveStickRef.current.id = null;
        setMoveKnob({ x: 0, y: 0 });
        onTouchPatch({ moveX: 0, moveY: 0 });
      }
    }
  };

  const handleAimTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (aimStickRef.current.id !== null) return;
    const t = e.changedTouches[0];
    aimStickRef.current = { id: t.identifier, lx: t.clientX, ly: t.clientY };
  };

  const handleAimTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (aimStickRef.current.id === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === aimStickRef.current.id) {
        const dx = t.clientX - aimStickRef.current.lx;
        const dy = t.clientY - aimStickRef.current.ly;
        aimStickRef.current.lx = t.clientX;
        aimStickRef.current.ly = t.clientY;
        onTouchPatch({ lookDeltaX: dx * 1.4, lookDeltaY: dy * 1.4 });
      }
    }
  };

  const handleAimTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === aimStickRef.current.id) {
        aimStickRef.current.id = null;
      }
    }
  };

  const healthPips = 5;
  const filledPips = Math.ceil((hud.health / hud.maxHealth) * healthPips);
  const spec = WEAPON_SPECS[hud.weapon];

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-5">
      {/* Low-HP peripheral crimson vignette */}
      {hud.health <= 35 && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            boxShadow: 'inset 0 0 110px rgba(185, 28, 28, 0.55)',
          }}
          aria-hidden="true"
        />
      )}

      {/* TOP BAR: AXON Bodycam OSD (Top-Left) + Mission & Utility Icons (Top-Right) */}
      <div className="flex items-start justify-between gap-2 sm:gap-4">
        <div className="hud-text-shadow text-[10px] sm:text-xs leading-tight tracking-[0.1em] sm:tracking-[0.14em] uppercase min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 text-zinc-100 font-bold whitespace-nowrap">
            <span className="inline-block w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-red-600 shrink-0" aria-hidden="true" />
            <span>REC</span>
            <span className="text-zinc-400 font-normal tabular-nums">{clockIso}</span>
          </div>
          <div className="text-zinc-300 mt-1 tabular-nums truncate">
            AXON BODY 4 // UNIT K9-04 · {hud.batteryPct}%
          </div>
          {hud.activeComms && (
            <div className="mt-2 bg-zinc-950/85 border-l-2 border-sky-400 px-2.5 py-1.5 max-w-xs sm:max-w-sm">
              <div className="flex items-center justify-between gap-3 text-[10px] text-sky-400 font-bold">
                <span>PROX COMMS · {hud.activeComms.speaker}</span>
                <span className="tabular-nums">
                  {hud.activeComms.occluded
                    ? `OCCLUDED ${hud.activeComms.dbLoss}dB`
                    : `CLEAR LOS · ${hud.activeComms.distance}M`}
                </span>
              </div>
              <div className="text-[11px] text-zinc-200 mt-0.5 tracking-wider">
                {hud.activeComms.line}
              </div>
            </div>
          )}
        </div>

        {/* Top-right sector status & square utility buttons */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <div className="mr-2 text-right hud-text-shadow hidden sm:block">
              <div className="text-[10px] tracking-[0.16em] text-zinc-400 uppercase">
                SECTOR {hud.sector}/{hud.totalSectors}
              </div>
              <div className="text-xs font-bold tracking-[0.14em] text-amber-400 tabular-nums">
                {hud.enemiesRemaining} HOSTILES · {hud.score} PTS
              </div>
            </div>

            <button
              type="button"
              tabIndex={-1}
              aria-label={hud.muted ? 'Unmute audio [M]' : 'Mute audio [M]'}
              title="Mute [M]"
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              className="w-9 h-9 bg-zinc-950/85 hover:bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200 cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                {hud.muted ? (
                  <path d="M22 9l-6 6M16 9l6 6" stroke="#ef4444" />
                ) : (
                  <path d="M15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14" />
                )}
              </svg>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Toggle touch controls"
              title="Touch Controls"
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleTouch();
              }}
              className={`w-9 h-9 bg-zinc-950/85 hover:bg-zinc-800 border flex items-center justify-center cursor-pointer ${
                hud.touchEnabled ? 'border-amber-500 text-amber-400' : 'border-zinc-700 text-zinc-300'
              }`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="2" width="12" height="20" rx="2" />
                <circle cx="12" cy="18" r="1" fill="currentColor" />
              </svg>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Restart mission"
              title="Restart"
              onClick={(e) => {
                e.currentTarget.blur();
                onRestart();
              }}
              className="w-9 h-9 bg-zinc-950/85 hover:bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200 cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Pause game [P]"
              title="Pause [P / Esc]"
              onClick={(e) => {
                e.currentTarget.blur();
                onPause();
              }}
              className="w-9 h-9 bg-zinc-950/85 hover:bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200 cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            </button>
          </div>

          <div className="sm:hidden text-right hud-text-shadow text-[11px] font-bold text-amber-400 tabular-nums">
            SEC {hud.sector}/{hud.totalSectors} · {hud.enemiesRemaining} HOSTILES
          </div>
        </div>
      </div>

      {/* CENTER DYNAMIC RETICLE & HITMARKERS (strictly at 50%/50%, pointer-events-none) */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div
          ref={crosshairWrapRef}
          data-testid="dynamic-crosshair"
          data-gap={hud.crosshairGapPx}
          data-scale="1.00"
          data-spread="0.0140"
          className="relative w-0 h-0"
          style={{ opacity: hud.isAds ? 0 : 1 }}
        >
          {/* Center micro-dot */}
          <span
            className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 w-[3px] h-[3px] rounded-full bg-zinc-100/90 shadow-[0_0_2px_rgba(0,0,0,0.95)]"
            aria-hidden="true"
          />
          {/* Top, Bottom, Left, Right dynamic ticks */}
          <span
            ref={tickTopRef}
            className="absolute left-0 top-0 w-[2px] h-[7px] bg-zinc-100/90 shadow-[0_0_2px_rgba(0,0,0,0.95)]"
            style={{ transform: `translate3d(-50%, -${hud.crosshairGapPx + 7}px, 0)` }}
            aria-hidden="true"
          />
          <span
            ref={tickBottomRef}
            className="absolute left-0 top-0 w-[2px] h-[7px] bg-zinc-100/90 shadow-[0_0_2px_rgba(0,0,0,0.95)]"
            style={{ transform: `translate3d(-50%, ${hud.crosshairGapPx}px, 0)` }}
            aria-hidden="true"
          />
          <span
            ref={tickLeftRef}
            className="absolute left-0 top-0 h-[2px] w-[7px] bg-zinc-100/90 shadow-[0_0_2px_rgba(0,0,0,0.95)]"
            style={{ transform: `translate3d(-${hud.crosshairGapPx + 7}px, -50%, 0)` }}
            aria-hidden="true"
          />
          <span
            ref={tickRightRef}
            className="absolute left-0 top-0 h-[2px] w-[7px] bg-zinc-100/90 shadow-[0_0_2px_rgba(0,0,0,0.95)]"
            style={{ transform: `translate3d(${hud.crosshairGapPx}px, -50%, 0)` }}
            aria-hidden="true"
          />
        </div>
        {(hud.hitMarker || hud.killMarker) && (
          <svg
            viewBox="0 0 32 32"
            className="w-7 h-7 -mt-3.5 -ml-3.5 absolute left-1/2 top-1/2"
            aria-hidden="true"
          >
            <path
              d="M6 6L12 12M26 6L20 12M6 26L12 20M26 26L20 20"
              stroke={hud.killMarker ? '#ef4444' : '#fafafa'}
              strokeWidth="2.4"
              strokeLinecap="square"
            />
          </svg>
        )}
      </div>

      {/* MOBILE TOUCH CONTROLS (Only shown when touchEnabled is true) */}
      {hud.touchEnabled && (
        <div className="fixed inset-x-0 bottom-32 sm:bottom-28 flex items-end justify-between px-3 sm:px-5 pointer-events-none">
          {/* Left Virtual Move Stick */}
          <div
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-zinc-950/65 border border-zinc-600/80 relative flex items-center justify-center pointer-events-auto"
            onTouchStart={handleMoveTouchStart}
            onTouchMove={handleMoveTouchMove}
            onTouchEnd={handleMoveTouchEnd}
            onTouchCancel={handleMoveTouchEnd}
          >
            <div
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-zinc-200/85 border border-zinc-900"
              style={{ transform: `translate(${moveKnob.x}px, ${moveKnob.y}px)` }}
            />
          </div>

          {/* Right Virtual Aim Pad + Fire/ADS/Lean/Crouch */}
          <div className="flex items-end gap-2 sm:gap-3 pointer-events-auto">
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onTouchStart={(e) => { e.stopPropagation(); onTouchPatch({ lean: -1 }); }}
                onTouchEnd={(e) => { e.stopPropagation(); onTouchPatch({ lean: 0 }); }}
                className="w-10 h-9 bg-zinc-950/85 border border-zinc-700 text-[10px] font-bold text-zinc-200"
              >
                LN L
              </button>
              <button
                type="button"
                onTouchStart={(e) => { e.stopPropagation(); onTouchPatch({ lean: 1 }); }}
                onTouchEnd={(e) => { e.stopPropagation(); onTouchPatch({ lean: 0 }); }}
                className="w-10 h-9 bg-zinc-950/85 border border-zinc-700 text-[10px] font-bold text-zinc-200"
              >
                LN R
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onTouchPatch({ crouch: hud.stance !== 'CROUCH' }); }}
                className="w-10 h-9 bg-zinc-950/85 border border-zinc-700 text-[10px] font-bold text-zinc-200"
              >
                CRCH
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onReload(); }}
                className="w-10 h-9 bg-zinc-950/85 border border-zinc-700 text-[10px] font-bold text-zinc-200"
              >
                RLD
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleFlashlight(); }}
                className="w-10 h-9 bg-zinc-950/85 border border-zinc-700 text-[10px] font-bold text-zinc-200"
              >
                LGHT
              </button>
              <button
                type="button"
                onTouchStart={(e) => { e.stopPropagation(); onTouchPatch({ ads: !hud.isAds }); }}
                className={`w-10 h-9 border text-[10px] font-bold ${
                  hud.isAds ? 'bg-amber-500 text-zinc-950 border-amber-400' : 'bg-zinc-950/85 border-zinc-700 text-zinc-200'
                }`}
              >
                ADS
              </button>
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onTouchStart={(e) => { e.stopPropagation(); onTouchPatch({ firing: true }); }}
                onTouchEnd={(e) => { e.stopPropagation(); onTouchPatch({ firing: false }); }}
                onTouchCancel={(e) => { e.stopPropagation(); onTouchPatch({ firing: false }); }}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-red-600/90 active:bg-red-500 border-2 border-red-300 text-xs font-extrabold tracking-wider text-white"
              >
                FIRE
              </button>
              <div
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-zinc-950/65 border border-zinc-600/80 flex items-center justify-center text-[10px] text-zinc-400 uppercase"
                onTouchStart={handleAimTouchStart}
                onTouchMove={handleAimTouchMove}
                onTouchEnd={handleAimTouchEnd}
              >
                AIM
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM CORNERS: Vitality/Armor (Bottom-Left) + Weapon/Ammo/Comms (Bottom-Right) */}
      <div className="flex items-end justify-between gap-4">
        {/* Bottom-Left: Health & Vest Sockets */}
        <div className="bg-zinc-950/80 border-l-2 border-zinc-300 px-3 py-2">
          <div className="flex items-baseline gap-3">
            <span className="text-2xl sm:text-3xl font-extrabold text-zinc-100 tabular-nums osd-stroke">
              {hud.health}
            </span>
            <span className="text-[10px] tracking-[0.16em] text-zinc-400 uppercase">
              HP · ARMOR <span className="text-sky-400 font-bold tabular-nums">{hud.armor}</span>
            </span>
          </div>

          <div className="flex items-center gap-1 mt-1.5" aria-hidden="true">
            {Array.from({ length: healthPips }).map((_, idx) => (
              <span
                key={idx}
                className={`h-1.5 w-6 ${
                  idx < filledPips
                    ? hud.health <= 30
                      ? 'bg-red-500'
                      : 'bg-zinc-100'
                    : 'bg-zinc-800 border border-zinc-700'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2.5 mt-1.5 text-[10px] tracking-[0.14em] text-zinc-400 uppercase">
            <span>{hud.stance}</span>
            {hud.lean !== 0 && (
              <span className="text-amber-400 font-bold">LEAN {hud.lean < 0 ? 'L' : 'R'}</span>
            )}
            <span className={hud.flashlightOn ? 'text-sky-300' : 'text-zinc-600'}>
              LIGHT {hud.flashlightOn ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>

        {/* Bottom-Right: Weapon, Ammo & Comms Action */}
        <div className="bg-zinc-950/80 border-r-2 border-amber-500 px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-2 mb-1 pointer-events-auto">
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onCommsPing();
              }}
              className="px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-[10px] tracking-[0.12em] text-sky-400 uppercase cursor-pointer"
            >
              [V] COMMS
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onSwitchWeapon(hud.weapon === 'carbine' ? 'sidearm' : 'carbine');
              }}
              className="px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-[10px] tracking-[0.12em] text-zinc-300 uppercase cursor-pointer"
            >
              [{hud.weapon === 'carbine' ? '1' : '2'}] SWAP
            </button>
          </div>

          <div className="flex items-baseline justify-end gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-zinc-100 tabular-nums osd-stroke">
              {hud.isReloading ? 'RLD' : hud.magAmmo}
            </span>
            <span className="text-sm font-semibold text-zinc-400 tabular-nums">
              / {hud.reserveAmmo}
            </span>
          </div>

          <div className="text-[10px] tracking-[0.14em] text-amber-400 uppercase mt-0.5">
            {spec.name}
          </div>
        </div>
      </div>
    </div>
  );
};
