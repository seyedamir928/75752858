import React from 'react';
import type { HudSnapshot } from '../game/types';

interface GameModalProps {
  hud: HudSnapshot;
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
}

export const GameModal: React.FC<GameModalProps> = ({
  hud,
  onResume,
  onRestart,
  onReturnTitle,
}) => {
  if (hud.phase !== 'paused' && hud.phase !== 'gameover') return null;

  const isVictory = hud.phase === 'gameover' && hud.outcome === 'victory';
  const isDefeat = hud.phase === 'gameover' && hud.outcome === 'defeat';
  const accuracy = hud.shotsFired > 0 ? Math.round((hud.shotsHit / hud.shotsFired) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-heading"
    >
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-700 border-t-2 border-t-amber-500 p-6 sm:p-7 shadow-2xl">
        <div className="text-[11px] tracking-[0.2em] text-zinc-400 uppercase mb-1">
          AXON BODY 4 // {hud.phase === 'paused' ? 'FEED PAUSED' : isVictory ? 'SECTOR CLEARED' : 'OPERATOR DOWN'}
        </div>

        <h2
          id="modal-heading"
          className={`text-2xl font-extrabold tracking-[0.14em] uppercase mb-5 ${
            isVictory ? 'text-amber-400' : isDefeat ? 'text-red-500' : 'text-zinc-100'
          }`}
        >
          {hud.phase === 'paused'
            ? 'TACTICAL PAUSE'
            : isVictory
            ? 'COMPOUND SECURED'
            : 'MISSION FAILED'}
        </h2>

        {/* 3 tabular-nums stat tiles */}
        <div className="grid grid-cols-3 gap-2.5 mb-6">
          <div className="bg-zinc-900 border border-zinc-800 p-3">
            <div className="text-[10px] tracking-[0.14em] text-zinc-400 uppercase">SCORE</div>
            <div className="text-xl font-bold text-zinc-100 tabular-nums mt-0.5">{hud.score}</div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-3">
            <div className="text-[10px] tracking-[0.14em] text-zinc-400 uppercase">
              {isDefeat ? 'SECTOR' : 'ELIMS'}
            </div>
            <div className="text-xl font-bold text-amber-400 tabular-nums mt-0.5">
              {isDefeat ? `${hud.sector}/${hud.totalSectors}` : `${hud.eliminations}/14`}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-3">
            <div className="text-[10px] tracking-[0.14em] text-zinc-400 uppercase">ACCURACY</div>
            <div className="text-xl font-bold text-sky-400 tabular-nums mt-0.5">{accuracy}%</div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          {hud.phase === 'paused' ? (
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onResume();
              }}
              className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs tracking-[0.18em] uppercase cursor-pointer"
            >
              RESUME
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={(e) => {
                e.currentTarget.blur();
                onRestart();
              }}
              className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs tracking-[0.18em] uppercase cursor-pointer"
            >
              {isVictory ? 'DEPLOY AGAIN' : 'RETRY BREACH'}
            </button>
          )}

          {hud.phase === 'paused' && (
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onRestart();
              }}
              className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold text-xs tracking-[0.16em] uppercase cursor-pointer"
            >
              RESTART
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onReturnTitle();
            }}
            className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 font-bold text-xs tracking-[0.16em] uppercase cursor-pointer"
          >
            TITLE
          </button>
        </div>
      </div>
    </div>
  );
};
