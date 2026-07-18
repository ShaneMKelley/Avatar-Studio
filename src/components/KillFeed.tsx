import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGameStore } from '../store';
import { Zap, Flame, ShieldAlert, Sword, Skull } from 'lucide-react';

export function KillFeed() {
  const killFeed = useGameStore(state => state.killFeed || []);
  const [activeKills, setActiveKills] = useState<any[]>([]);

  useEffect(() => {
    // Keep active list synchronized but expire items after 5 seconds
    const now = Date.now();
    const current = killFeed.filter(item => now - item.timestamp < 5000);
    setActiveKills(current);

    const interval = setInterval(() => {
      const time = Date.now();
      setActiveKills(prev => prev.filter(item => time - item.timestamp < 5000));
    }, 500);

    return () => clearInterval(interval);
  }, [killFeed]);

  const getWeaponIcon = (type: string) => {
    switch (type) {
      case 'laser':
        return <Zap className="w-3.5 h-3.5 text-cyan-400" id="killfeed-icon-laser" />;
      case 'rocket':
        return <Flame className="w-3.5 h-3.5 text-rose-500 animate-pulse" id="killfeed-icon-rocket" />;
      case 'slash':
        return <Sword className="w-3.5 h-3.5 text-amber-500" id="killfeed-icon-slash" />;
      case 'malfunction':
        return <ShieldAlert className="w-3.5 h-3.5 text-yellow-400" id="killfeed-icon-malfunction" />;
      default:
        return <Skull className="w-3.5 h-3.5 text-zinc-400" id="killfeed-icon-default" />;
    }
  };

  return (
    <div className="absolute top-4 right-4 z-50 flex flex-col gap-1.5 max-w-sm pointer-events-none items-end" id="arena-killfeed-container">
      <AnimatePresence>
        {activeKills.map((kill) => (
          <motion.div
            key={kill.id}
            id={`killfeed-item-${kill.id}`}
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.9, transition: { duration: 0.2 } }}
            className="flex items-center gap-2 bg-zinc-950/85 border border-zinc-800 px-3 py-1.5 rounded-md shadow-[0_0_15px_rgba(0,0,0,0.5)] font-mono text-xs text-zinc-300"
          >
            <span className="text-cyan-400 font-semibold">{kill.killerName}</span>
            <span className="p-1 bg-zinc-900 border border-zinc-700/50 rounded flex items-center justify-center">
              {getWeaponIcon(kill.weaponType)}
            </span>
            <span className="text-zinc-400">{kill.victimName}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
