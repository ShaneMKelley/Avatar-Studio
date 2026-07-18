import React, { useMemo } from 'react';
import { useGameStore } from '../store';
import { motion } from 'motion/react';

export const EnemyTracker: React.FC = () => {
  const enemies = useGameStore(state => state.enemies || []);
  const playerPosition = useGameStore(state => state.playerPosition);
  const gameState = useGameStore(state => state.gameState);

  // Compute active enemies within 50m radius
  const trackedEnemies = useMemo(() => {
    if (!playerPosition) return [];

    const [px, py, pz] = playerPosition;

    return enemies
      .filter(enemy => enemy.state === 'active')
      .map(enemy => {
        const [ex, ey, ez] = enemy.position;
        const dx = ex - px;
        const dz = ez - pz;
        const distance = Math.sqrt(dx * dx + dz * dz);
        return {
          id: enemy.id,
          type: enemy.type || 'sentinel',
          dx,
          dz,
          distance,
          health: enemy.health || 100,
          maxHealth: enemy.maxHealth || 100
        };
      })
      .filter(item => item.distance <= 50);
  }, [enemies, playerPosition]);

  if (gameState !== 'playing') return null;

  return (
    <div 
      id="tactical-enemy-tracker"
      className="bg-slate-950/75 backdrop-blur-md border border-cyan-500/30 rounded-xl p-4 flex flex-col items-center gap-3 w-56 shadow-[0_0_25px_rgba(6,182,212,0.15)] text-white"
    >
      {/* Title */}
      <div className="w-full flex items-center justify-between border-b border-cyan-500/20 pb-1.5 text-xs font-mono">
        <span className="text-cyan-400 font-bold tracking-widest animate-pulse">🛰️ RADAR SYS</span>
        <span className="text-[10px] text-zinc-400 font-semibold uppercase">50M RANGE</span>
      </div>

      {/* Circular Radar Screen */}
      <div className="relative w-36 h-36 rounded-full border-2 border-cyan-500/20 bg-slate-950 overflow-hidden flex items-center justify-center shadow-[inset_0_0_15px_rgba(6,182,212,0.3)]">
        {/* Sweeping Scanner Line */}
        <div 
          className="absolute inset-0 origin-center bg-[conic-gradient(from_0deg,transparent_50%,rgba(34,211,238,0.15)_90%,rgba(34,211,238,0.45)_100%)] rounded-full animate-[spin_4s_linear_infinite] pointer-events-none"
          style={{ mixBlendMode: 'screen' }}
        />

        {/* Concentric Range Rings */}
        <div className="absolute w-[20%] h-[20%] rounded-full border border-cyan-500/10 pointer-events-none" />
        <div className="absolute w-[50%] h-[50%] rounded-full border border-cyan-500/15 pointer-events-none" />
        <div className="absolute w-[80%] h-[80%] rounded-full border border-cyan-500/10 pointer-events-none" />

        {/* Grid Axes */}
        <div className="absolute w-full h-[1px] bg-cyan-500/10 pointer-events-none" />
        <div className="absolute h-full w-[1px] bg-cyan-500/10 pointer-events-none" />

        {/* Compass Cardinal Points */}
        <span className="absolute top-1 text-[8px] font-bold text-cyan-400/60 font-mono">N</span>
        <span className="absolute right-1 text-[8px] font-bold text-cyan-400/60 font-mono">E</span>
        <span className="absolute bottom-1 text-[8px] font-bold text-cyan-400/60 font-mono">S</span>
        <span className="absolute left-1 text-[8px] font-bold text-cyan-400/60 font-mono">W</span>

        {/* Center Player Dot */}
        <div className="absolute w-2 h-2 bg-cyan-400 rounded-full z-10 shadow-[0_0_10px_#00f7ff] flex items-center justify-center">
          <div className="w-1 h-1 bg-white rounded-full" />
        </div>

        {/* Enemy Radar Pips */}
        {trackedEnemies.map(enemy => {
          // Project distance to radar circle coordinates
          // Radar circle radius is 72px (half of 144px width/height minus margin padding)
          // 50m maps to 60px distance from center
          const maxProjectionDist = 62;
          const pctX = enemy.dx / 50;
          const pctY = enemy.dz / 50;
          const x = 72 + pctX * maxProjectionDist;
          const y = 72 + pctY * maxProjectionDist; // Note: standard canvas y matches 3D z

          // Determine pip styling based on enemy type
          const isBombardier = enemy.type === 'bombardier';
          const isOverseer = enemy.type === 'overseer';
          const pipColor = isBombardier 
            ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]' 
            : isOverseer 
              ? 'bg-purple-500 shadow-[0_0_8px_#a855f7]' 
              : 'bg-amber-500 shadow-[0_0_8px_#f59e0b]';

          return (
            <motion.div
              key={enemy.id}
              className={`absolute w-2.5 h-2.5 rounded-full z-20 ${pipColor} flex items-center justify-center cursor-help`}
              style={{
                left: `${x - 5}px`,
                top: `${y - 5}px`,
              }}
              initial={{ scale: 0 }}
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
              title={`${enemy.type.toUpperCase()} - ${enemy.distance.toFixed(1)}m (${Math.round((enemy.health / enemy.maxHealth) * 100)}% HP)`}
            >
              <div className="w-1 h-1 bg-white rounded-full opacity-70" />
            </motion.div>
          );
        })}
      </div>

      {/* Bottom Summary Data */}
      <div className="w-full flex flex-col gap-1 font-mono text-[10px] text-zinc-400">
        <div className="flex justify-between items-center bg-slate-900/50 p-1.5 rounded-md border border-cyan-500/10">
          <span>HOSTILES IN 50M:</span>
          <span className={`font-bold ${trackedEnemies.length > 0 ? 'text-rose-400 animate-pulse' : 'text-emerald-400'}`}>
            {trackedEnemies.length}
          </span>
        </div>
        {trackedEnemies.length > 0 && (
          <div className="text-[9px] text-zinc-500 text-center truncate italic">
            NEAREST: {Math.min(...trackedEnemies.map(e => e.distance)).toFixed(1)}m
          </div>
        )}
      </div>
    </div>
  );
};
