import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { Hand, PartyPopper, Music, Heart } from 'lucide-react';
import { triggerLocalGesture } from '../utils/gestures';
import { motion, AnimatePresence } from 'motion/react';

interface RadialItem {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  color: string;
  textColor: string;
  borderColor: string;
  angle: number; // in degrees, 0 = top, 90 = right
}

const ITEMS: RadialItem[] = [
  { 
    id: 'wave', 
    label: 'Wave', 
    icon: Hand, 
    color: 'bg-emerald-500/10 hover:bg-emerald-500/20', 
    textColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/30 hover:border-emerald-500/60',
    angle: 0 
  },
  { 
    id: 'cheer', 
    label: 'Cheer', 
    icon: PartyPopper, 
    color: 'bg-purple-500/10 hover:bg-purple-500/20', 
    textColor: 'text-purple-400',
    borderColor: 'border-purple-500/30 hover:border-purple-500/60',
    angle: 90 
  },
  { 
    id: 'dance', 
    label: 'Dance', 
    icon: Music, 
    color: 'bg-pink-500/10 hover:bg-pink-500/20', 
    textColor: 'text-pink-400',
    borderColor: 'border-pink-500/30 hover:border-pink-500/60',
    angle: 180 
  },
  { 
    id: 'hug', 
    label: 'Blow Kiss', 
    icon: Heart, 
    color: 'bg-rose-500/10 hover:bg-rose-500/20', 
    textColor: 'text-rose-400',
    borderColor: 'border-rose-500/30 hover:border-rose-500/60',
    angle: 270 
  },
];

export const RadialMenu: React.FC = () => {
  const isFirstPerson = useStore(state => state.isFirstPerson);
  const isSettingsOpen = useStore(state => state.isSettingsOpen);
  const isRadialMenuOpen = useStore(state => state.isRadialMenuOpen);
  const setIsRadialMenuOpen = useStore(state => state.setIsRadialMenuOpen);
  
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    // Listen for middle mouse button down (scroll wheel down)
    const handleMouseDown = (e: MouseEvent) => {
      // button 1 is middle mouse click
      if (e.button === 1) {
        const state = useStore.getState();
        if (state.isFirstPerson && !state.isSettingsOpen) {
          e.preventDefault();
          // Release pointer lock to allow mouse cursor to select option
          try {
            if (document.pointerLockElement) {
              document.exitPointerLock();
            }
          } catch (err) {
            console.warn('Could not exit pointer lock:', err);
          }
          setIsRadialMenuOpen(true);
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 1) {
        // If they released the scroll wheel over a selection, execute it and close
        // We handle this via normal click or scroll release
      }
    };

    // Listen globally for preventing browser middle click scrolling
    const preventDefaultScroll = (e: MouseEvent) => {
      if (e.button === 1) {
        const state = useStore.getState();
        if (state.isFirstPerson && !state.isSettingsOpen) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('auxclick', preventDefaultScroll, { capture: true });
    
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('auxclick', preventDefaultScroll, { capture: true });
    };
  }, [setIsRadialMenuOpen]);

  const selectGesture = (gestureId: string) => {
    triggerLocalGesture(gestureId);
    closeMenu();
  };

  const closeMenu = () => {
    setIsRadialMenuOpen(false);
    setHoveredId(null);
    
    // Auto-request pointer lock back so they are seamlessly locked back in first person mode
    setTimeout(() => {
      const canvas = document.querySelector('canvas');
      if (canvas) {
        try {
          canvas.requestPointerLock();
        } catch (err) {
          console.warn('Failed to re-engage pointer lock:', err);
        }
      }
    }, 50);
  };

  return (
    <AnimatePresence>
      {isRadialMenuOpen && (
        <div 
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/75 backdrop-blur-sm select-none"
          onClick={closeMenu}
        >
          {/* Central Radial Ring */}
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
            className="relative w-80 h-80 flex items-center justify-center"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking background of the menu ring
          >
            {/* Center Decorative Core */}
            <div className="absolute w-24 h-24 rounded-full bg-zinc-950/80 border border-white/15 shadow-2xl flex flex-col items-center justify-center backdrop-blur-md z-10 select-none">
              <span className="text-[10px] tracking-wider text-zinc-500 uppercase font-medium">Emotes</span>
              <span className="text-xs text-white/80 font-bold mt-0.5">
                {hoveredId ? ITEMS.find(item => item.id === hoveredId)?.label : 'Select'}
              </span>
            </div>

            {/* Pulsing Outer Boundary Accent Ring */}
            <div className="absolute w-[260px] h-[260px] rounded-full border border-white/5 pointer-events-none" />

            {/* Render Circular Nodes */}
            {ITEMS.map((item) => {
              const Icon = item.icon;
              // Translate degrees into distance coordinates around a circle (radius = 98px)
              const radianAngle = (item.angle - 90) * (Math.PI / 180);
              const r = 100; // Radius
              const xChange = Math.cos(radianAngle) * r;
              const yChange = Math.sin(radianAngle) * r;

              const isHovered = hoveredId === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => selectGesture(item.id)}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    transform: `translate(${xChange}px, ${yChange}px)`,
                  }}
                  className={`absolute w-16 h-16 rounded-full border flex flex-col items-center justify-center transition-all ${item.color} ${item.textColor} ${item.borderColor} shadow-lg backdrop-blur-sm focus:outline-none`}
                >
                  <motion.div
                    animate={{ scale: isHovered ? 1.15 : 1 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 15 }}
                  >
                    <Icon className="w-6 h-6" />
                  </motion.div>
                  <span className="text-[9px] font-semibold mt-0.5 pointer-events-none">{item.label}</span>
                </button>
              );
            })}
          </motion.div>
          
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 text-center pointer-events-none select-none">
            <p className="text-xs text-zinc-400">Click an emote to use it and re-lock camera</p>
            <p className="text-[10px] text-zinc-600 mt-1">Press ESC or click anywhere else to cancel</p>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
