import React from 'react';
import { Hand, PartyPopper, Music, Heart, Sparkles } from 'lucide-react';
import { useStore } from '../store/useStore';
import { triggerLocalGesture } from '../utils/gestures';

export const GesturesBar = () => {
  const localUserGesture = useStore(state => state.localUserGesture);

  const handleGesture = (gesture: string) => {
    triggerLocalGesture(gesture);
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-zinc-900/40 backdrop-blur-sm border border-white/10 rounded-2xl p-1.5 md:p-2 flex gap-1 md:gap-2 shadow-xl max-w-[calc(100vw-2rem)] overflow-x-auto hide-scrollbar">
      <button
        onClick={() => handleGesture('wave')}
        className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 rounded-xl font-medium text-xs md:text-sm transition-colors whitespace-nowrap ${
          localUserGesture === 'wave' 
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' 
            : 'bg-zinc-800/50 text-white hover:bg-zinc-700/50 border border-transparent'
        }`}
      >
        <Hand className="w-3.5 h-3.5 md:w-4 md:h-4" />
        Wave
      </button>
      <button
        onClick={() => handleGesture('cheer')}
        className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 rounded-xl font-medium text-xs md:text-sm transition-colors whitespace-nowrap ${
          localUserGesture === 'cheer' 
            ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50' 
            : 'bg-zinc-800/50 text-white hover:bg-zinc-700/50 border border-transparent'
        }`}
      >
        <PartyPopper className="w-3.5 h-3.5 md:w-4 md:h-4" />
        Cheer
      </button>
      <button
        onClick={() => handleGesture('dance')}
        className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 rounded-xl font-medium text-xs md:text-sm transition-colors whitespace-nowrap ${
          localUserGesture === 'dance' 
            ? 'bg-pink-500/20 text-pink-400 border border-pink-500/50' 
            : 'bg-zinc-800/50 text-white hover:bg-zinc-700/50 border border-transparent'
        }`}
      >
        <Music className="w-3.5 h-3.5 md:w-4 md:h-4" />
        Dance
      </button>
      <button
        onClick={() => handleGesture('hug')}
        className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 rounded-xl font-medium text-xs md:text-sm transition-colors whitespace-nowrap ${
          localUserGesture === 'hug' 
            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/50' 
            : 'bg-zinc-800/50 text-white hover:bg-zinc-700/50 border border-transparent'
        }`}
      >
        <Heart className="w-3.5 h-3.5 md:w-4 md:h-4" />
        Blow Kiss
      </button>
      <button
        onClick={() => handleGesture('strut')}
        className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 rounded-xl font-medium text-xs md:text-sm transition-colors whitespace-nowrap ${
          localUserGesture === 'strut' 
            ? 'bg-amber-500/25 text-amber-400 border border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]' 
            : 'bg-zinc-800/50 text-white hover:bg-zinc-700/50 border border-transparent'
        }`}
      >
        <Sparkles className="w-3.5 h-3.5 md:w-4 md:h-4 animate-pulse text-amber-400" />
        Strut 💅
      </button>
    </div>
  );
};
