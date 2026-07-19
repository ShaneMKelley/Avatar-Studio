import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGameStore } from '../store';
import { useStore } from '../store/useStore';
import { ShieldAlert, Swords, Timer, Trophy } from 'lucide-react';

export function DuelHUD() {
  const duelState = useGameStore(state => state.duelState);
  const localUserNemesis = useStore(state => state.localUserNemesis);
  const otherPlayers = useGameStore(state => state.otherPlayers);

  // Determine if Nemesis is in the current room/game
  const isNemesisPresent = React.useMemo(() => {
    if (!localUserNemesis) return false;
    return Object.values(otherPlayers).some(
      p => p.name.toLowerCase() === localUserNemesis.toLowerCase()
    );
  }, [localUserNemesis, otherPlayers]);

  const hasActiveDuel = duelState && duelState.active;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3 pointer-events-none max-w-lg w-full px-4" id="duel-hud-container">
      {/* NEMESIS ALERT BADGE */}
      <AnimatePresence>
        {isNemesisPresent && (
          <motion.div
            id="nemesis-alert-badge"
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="flex items-center gap-2 bg-rose-950/90 border border-rose-500/50 px-4 py-2 rounded-lg shadow-[0_0_15px_rgba(239,68,68,0.2)] text-rose-200 text-xs font-mono select-none"
          >
            <ShieldAlert className="w-4 h-4 text-rose-500 animate-pulse" />
            <span>
              ⚠️ <strong className="text-rose-400 font-bold">NEMESIS TARGET IN ARENA:</strong>{' '}
              <span className="underline font-bold text-white">{localUserNemesis}</span>. ELIMINATE THEM AT ALL COSTS!
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1v1 DUEL LIVE HEADS-UP DISPLAY */}
      <AnimatePresence>
        {hasActiveDuel && (
          <motion.div
            id="duel-live-hud"
            initial={{ opacity: 0, y: -40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -40, scale: 0.9 }}
            className="flex flex-col items-center bg-zinc-950/90 border border-cyan-500/40 rounded-xl px-5 py-3 shadow-[0_0_25px_rgba(6,182,212,0.15)] w-full font-mono text-sm select-none"
          >
            {/* Header Title */}
            <div className="flex items-center gap-1.5 text-cyan-400 text-xs font-bold tracking-wider uppercase mb-2">
              <Swords className="w-3.5 h-3.5 animate-bounce" />
              <span>G2G NEMESIS DUEL PROTOCOL</span>
            </div>

            {/* Scoreboard Grid */}
            <div className="flex items-center justify-between w-full gap-4">
              {/* Player 1 Details */}
              <div className="flex flex-col items-end flex-1">
                <span className={`font-semibold truncate max-w-[120px] ${duelState.p1Score > duelState.p2Score ? 'text-green-400' : 'text-zinc-400'}`}>
                  {duelState.p1Name}
                </span>
                <span className="text-2xl font-black text-white tracking-wider mt-0.5">
                  {duelState.p1Score}
                </span>
              </div>

              {/* Central Round Timer / Separator */}
              <div className="flex flex-col items-center px-4 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg min-w-[70px]">
                <Timer className="w-3.5 h-3.5 text-yellow-400 animate-spin-slow mb-0.5" />
                <span className={`text-base font-black ${duelState.timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}>
                  {duelState.timeLeft}s
                </span>
              </div>

              {/* Player 2 Details */}
              <div className="flex flex-col items-start flex-1">
                <span className={`font-semibold truncate max-w-[120px] ${duelState.p2Score > duelState.p1Score ? 'text-green-400' : 'text-zinc-400'}`}>
                  {duelState.p2Name}
                </span>
                <span className="text-2xl font-black text-white tracking-wider mt-0.5">
                  {duelState.p2Score}
                </span>
              </div>
            </div>

            {/* Match Status / Leader indicator */}
            <div className="flex items-center gap-1 mt-2 text-[10px] text-zinc-500 uppercase tracking-widest border-t border-zinc-900 pt-1.5 w-full justify-center">
              {duelState.p1Score === duelState.p2Score ? (
                <span>Scores are Even — Decisive blow required!</span>
              ) : (
                <span className="flex items-center gap-1 text-green-400 font-semibold">
                  <Trophy className="w-3 h-3 text-yellow-500" />
                  {duelState.p1Score > duelState.p2Score ? duelState.p1Name : duelState.p2Name} is dominating!
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
