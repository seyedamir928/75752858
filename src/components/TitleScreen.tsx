import React from 'react';

interface TitleScreenProps {
  bestScore: number;
  touchEnabled: boolean;
  onStart: () => void;
  onToggleTouch: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  bestScore,
  touchEnabled,
  onStart,
  onToggleTouch,
}) => {
  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-6 sm:p-10">
      {/* Top AXON camera header */}
      <div className="flex items-start justify-between text-[11px] tracking-[0.2em] text-zinc-400 uppercase hud-text-shadow">
        <div className="flex items-center gap-2.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600" aria-hidden="true" />
          <span className="text-zinc-200 font-semibold">AXON BODY 4 // STANDBY</span>
        </div>
        {bestScore > 0 && (
          <div className="tabular-nums text-amber-400">
            BEST SCORE {bestScore}
          </div>
        )}
      </div>

      {/* Left-third negative-space title lockup & primary Deploy CTA */}
      <div className="max-w-md pointer-events-auto my-auto bg-zinc-950/80 border-l-2 border-amber-500 p-6 sm:p-8 shadow-2xl">
        <svg
          viewBox="0 0 360 88"
          className="w-full max-w-[320px] h-auto mb-4"
          role="img"
          aria-label="BODYCAM ZERO-HOUR"
        >
          {/* Tactical reticle corner brackets */}
          <path d="M2 16 V2 H16 M344 2 H358 V16 M2 72 V86 H16 M344 86 H358 V72" stroke="#f59e0b" strokeWidth="2.5" fill="none" />
          {/* Main stencil title */}
          <text
            x="16"
            y="46"
            fill="#f4f4f5"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontWeight="800"
            fontSize="36"
            letterSpacing="4"
          >
            BODYCAM
          </text>
          <text
            x="18"
            y="72"
            fill="#f59e0b"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontWeight="700"
            fontSize="15"
            letterSpacing="6"
          >
            OPERATION ZERO-HOUR
          </text>
        </svg>

        <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed mb-6">
          Tactical CQB breach inside an abandoned industrial compound. Acoustic occlusion &amp; proximity comms track every footstep and radio callout across concrete walls.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className="px-7 py-3 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 font-bold text-sm tracking-[0.18em] uppercase transition-colors cursor-pointer"
          >
            DEPLOY [ENTER]
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleTouch();
            }}
            className="px-4 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs tracking-[0.14em] uppercase transition-colors cursor-pointer"
          >
            TOUCH HUD: {touchEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Flat single-line bottom control hint */}
      <div className="text-[11px] sm:text-xs tracking-[0.14em] text-zinc-400 uppercase hud-text-shadow">
        WASD Move · Q/E Lean · C Crouch · LMB Fire · RMB Aim · R Reload · F Light · V Comms · Esc Pause
      </div>
    </div>
  );
};
