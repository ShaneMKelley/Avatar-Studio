import React from 'react';
import { Gamepad2 } from 'lucide-react';
import { useStore } from '../store/useStore';

export const Branding = () => {
  const localUserId = useStore((state) => state.localUserId);
  const localUserName = useStore((state) => state.localUserName);
  const playerNumber = useStore((state) => {
    const allIds = [state.localUserId, ...Object.keys(state.users)].sort();
    return allIds.indexOf(state.localUserId) + 1;
  });

  return (
    <>
      <a 
        href="https://www.gaming2gamers.com" 
        target="_blank" 
        rel="noopener noreferrer"
        className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center group pointer-events-auto"
      >
        <span className="text-lg font-bold text-white tracking-tight leading-none group-hover:text-blue-400 transition-colors">
          Gaming<span className="text-blue-500">2</span>Gamers
        </span>
        <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-widest group-hover:text-zinc-300 transition-colors">
          Official Lounge
        </span>
      </a>

      {/* Local Player Identity Display */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center select-none pointer-events-none">
        <div className="bg-blue-500/10 backdrop-blur-md px-8 py-2 rounded-full border-2 border-blue-400/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
          <span className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 font-mono tracking-widest">
            PLAYER {playerNumber}
          </span>
        </div>
        <div className="text-white/80 text-sm mt-1.5 font-bold tracking-widest uppercase drop-shadow-lg">
          {localUserName}
        </div>
      </div>
    </>
  );
};

