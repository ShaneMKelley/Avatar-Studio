import React, { useEffect, useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import * as THREE from 'three';

export const PortalWarpTransition: React.FC = () => {
  const portalWarping = useStore(state => state.portalWarping);
  const avatarLoading = useStore(state => state.avatarLoading);
  const avatarLoadingProgress = useStore(state => state.avatarLoadingProgress);
  const threeLoading = useStore(state => state.threeLoading);
  const setThreeLoading = useStore(state => state.setThreeLoading);

  const [renderState, setRenderState] = useState<'idle' | 'entering' | 'warping' | 'exiting'>('idle');
  const [progress, setProgress] = useState(0);
  const [threeItemsLoaded, setThreeItemsLoaded] = useState(0);
  const [threeItemsTotal, setThreeItemsTotal] = useState(0);

  // Hook into Three.js DefaultLoadingManager to monitor GLB / asset loads
  useEffect(() => {
    const manager = THREE.DefaultLoadingManager;
    
    const originalOnStart = manager.onStart;
    const originalOnProgress = manager.onProgress;
    const originalOnLoad = manager.onLoad;
    const originalOnError = manager.onError;

    manager.onStart = (url, itemsLoaded, itemsTotal) => {
      setThreeLoading(true);
      setThreeItemsLoaded(itemsLoaded);
      setThreeItemsTotal(itemsTotal);
      if (originalOnStart) originalOnStart(url, itemsLoaded, itemsTotal);
    };

    manager.onProgress = (url, itemsLoaded, itemsTotal) => {
      setThreeLoading(true);
      setThreeItemsLoaded(itemsLoaded);
      setThreeItemsTotal(itemsTotal);
      if (originalOnProgress) originalOnProgress(url, itemsLoaded, itemsTotal);
    };

    manager.onLoad = () => {
      setThreeLoading(false);
      if (originalOnLoad) originalOnLoad();
    };

    manager.onError = (url) => {
      // Allow progress even if one asset fails
      if (originalOnError) originalOnError(url);
    };

    return () => {
      manager.onStart = originalOnStart;
      manager.onProgress = originalOnProgress;
      manager.onLoad = originalOnLoad;
      manager.onError = originalOnError;
    };
  }, [setThreeLoading]);

  const displayProgress = useMemo(() => {
    if (!portalWarping?.active) return progress;

    if (progress < 90) {
      return progress;
    }

    // We reached 90. Now we calculate further progress based on actual loading status.
    let threePct = 100;
    if (threeLoading && threeItemsTotal > 0) {
      threePct = (threeItemsLoaded / threeItemsTotal) * 100;
    }

    let avatarPct = 100;
    if (avatarLoading) {
      avatarPct = avatarLoadingProgress;
    }

    // Blend:
    // - 90% to 96% is ThreeJS assets loading (Synth Garden foliage GLBs, etc)
    // - 96% to 99% is VRM avatar loading
    let currentPct = 90;
    if (threeLoading) {
      currentPct = 90 + Math.round(threePct * 0.06); // 90 to 96
    } else {
      currentPct = 96;
      if (avatarLoading) {
        currentPct = 96 + Math.round(avatarPct * 0.03); // 96 to 99
      } else {
        currentPct = 99;
      }
    }

    return Math.min(99, currentPct);
  }, [progress, portalWarping?.active, threeLoading, threeItemsLoaded, threeItemsTotal, avatarLoading, avatarLoadingProgress]);

  // Pre-generate stable light streaks to prevent layout thrashing and Math.random recalculations on every render frame
  const streaks = React.useMemo(() => {
    return Array.from({ length: 28 }).map((_, i) => ({
      id: i,
      startAngle: Math.random() * Math.PI * 2,
      delay: Math.random() * 1.5,
      duration: 0.5 + Math.random() * 0.8,
      trailLength: 80 + Math.random() * 140,
      size: 1.5 + Math.random() * 2.5,
    }));
  }, [portalWarping?.targetRoom]);

  useEffect(() => {
    if (portalWarping) {
      if (portalWarping.active) {
        setRenderState('entering');
        // Transition to full warp stream after entrance whoosh
        const t = setTimeout(() => {
          setRenderState('warping');
        }, 300);
        return () => clearTimeout(t);
      } else {
        setRenderState('exiting');
      }
    } else {
      setRenderState('idle');
    }
  }, [portalWarping]);

  useEffect(() => {
    let animationFrameId: number;
    let startTime: number | null = null;
    const duration = 1500; // Match Lounge.tsx warp travel duration

    if (portalWarping?.active) {
      setProgress(0);
      const updateProgress = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const ratio = Math.min(elapsed / duration, 1.0);
        
        // Quad ease-out curve makes it feel reactive: starts fast and eases down near 90%
        const easeOutQuad = 1 - (1 - ratio) * (1 - ratio);
        const targetProgress = Math.round(easeOutQuad * 90);
        
        setProgress(targetProgress);

        if (ratio < 1.0) {
          animationFrameId = requestAnimationFrame(updateProgress);
        }
      };
      animationFrameId = requestAnimationFrame(updateProgress);
    } else if (portalWarping && !portalWarping.active) {
      // Exiting phase - ramp up fast to 100%
      let current = progress;
      const finishProgress = () => {
        if (current < 100) {
          current = Math.min(100, current + 15);
          setProgress(current);
          animationFrameId = requestAnimationFrame(finishProgress);
        }
      };
      animationFrameId = requestAnimationFrame(finishProgress);
    } else {
      // Idle state
      setProgress(0);
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [portalWarping?.active]);

  if (!portalWarping && renderState === 'idle') return null;

  const color = portalWarping?.color || '#00ff88';

  return (
    <div 
      className={`fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center transition-all duration-500 ease-out ${
        renderState === 'idle' ? 'opacity-0 scale-105' : 'opacity-100 scale-100'
      }`}
      style={{
        background: renderState === 'entering' 
          ? `radial-gradient(circle, ${color}30 0%, #030712 100%)`
          : renderState === 'warping'
          ? `radial-gradient(circle, ${color}25 0%, #020617 80%, #000000 100%)`
          : 'rgba(0, 0, 0, 0.95)'
      }}
    >
      {/* 1. STARGATE RUNNING RING OF GLYPHS & CHEVRONS */}
      <div 
        className={`absolute w-[360px] h-[360px] md:w-[600px] md:h-[600px] rounded-full border border-opacity-70 transition-all duration-500 ease-in-out ${
          renderState === 'entering' 
            ? 'scale-50 opacity-0 rotate-180' 
            : renderState === 'warping' 
            ? 'scale-110 opacity-100 rotate-[-360deg] animate-[spin_10s_linear_infinite]' 
            : 'scale-150 opacity-0'
        }`}
        style={{ 
          borderColor: color, 
          boxShadow: `0 0 40px ${color}50, inset 0 0 40px ${color}30` 
        }}
      >
        {/* Decorative inner portal geometry with spinning loading indicators */}
        <div className="absolute inset-4 rounded-full border border-dashed border-opacity-20 flex items-center justify-center" style={{ borderColor: color }}>
          <div className="absolute w-2/3 h-2/3 rounded-full border border-opacity-10 flex items-center justify-center" style={{ borderColor: color }}>
            
            {/* High-speed warp charging spinner wheel */}
            <div 
              className="absolute w-16 h-16 md:w-24 md:h-24 rounded-full border-2 border-t-transparent animate-spin" 
              style={{
                borderLeftColor: `${color}cc`,
                borderRightColor: `${color}cc`,
                borderBottomColor: `${color}cc`,
                borderTopColor: 'transparent',
                filter: `drop-shadow(0 0 10px ${color})`
              }} 
            />
            
            <div className="w-12 h-12 rounded-full border border-double border-opacity-40 animate-pulse flex items-center justify-center" style={{ borderColor: color, backgroundColor: `${color}10` }} />
          </div>
        </div>

        {/* 9 Stargate Chevrons locks */}
        {Array.from({ length: 9 }).map((_, i) => {
          const angle = (i * Math.PI * 2) / 9;
          const x = Math.cos(angle) * 50;
          const y = Math.sin(angle) * 50;
          return (
            <div
              key={i}
              className="absolute w-4 h-4 md:w-5 md:h-5 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
              style={{
                left: `${50 + x}%`,
                top: `${50 + y}%`,
                transform: `translate(-50%, -50%) rotate(${angle * (180 / Math.PI) + 90}deg)`
              }}
            >
              <div 
                className={`w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[12px] md:border-b-[16px] transition-all duration-500 ${
                  renderState === 'warping' ? 'animate-pulse scale-110' : 'scale-90'
                }`}
                style={{ borderBottomColor: color, filter: `drop-shadow(0 0 6px ${color})` }}
              />
            </div>
          );
        })}
      </div>

      {/* 2. HYPER-DRIVE INTERSTELLAR WORMHOLE STREAKS */}
      <div className="absolute inset-0 overflow-hidden">
        {renderState === 'warping' && (
          <div className="w-full h-full relative opacity-80 mix-blend-screen">
            {/* Map over stable pre-calculated high-speed light travel streaks to prevent stutter */}
            {streaks.map((streak) => (
              <div
                key={streak.id}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 origin-bottom pointer-events-none"
                style={{
                  transform: `translate(-50%, -50%) rotate(${streak.startAngle}rad)`,
                }}
              >
                <div
                  className="rounded-full animate-[hyperWarp_1s_linear_infinite]"
                  style={{
                    height: `${streak.trailLength}px`,
                    width: `${streak.size}px`,
                    background: `linear-gradient(to top, transparent, ${color} 70%, #ffffff 100%)`,
                    boxShadow: `0 0 10px ${color}`,
                    animationDelay: `${streak.delay}s`,
                    animationDuration: `${streak.duration}s`,
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. EVENT HORIZON ENERGY WAVE SWELLS */}
      <div 
        className={`absolute rounded-full transition-all duration-500 ease-out flex items-center justify-center ${
          renderState === 'entering' 
            ? 'w-10 h-10 opacity-0' 
            : renderState === 'warping'
            ? 'w-[400px] h-[400px] md:w-[650px] md:h-[650px] scale-100 opacity-90' 
            : 'w-[900px] h-[900px] opacity-0 scale-150'
        }`}
        style={{
          background: `radial-gradient(circle, ${color}bb 0%, ${color}40 60%, transparent 100%)`,
          filter: 'blur(8px)',
          mixBlendMode: 'screen',
        }}
      >
        <div className="w-4/5 h-4/5 rounded-full border-2 border-dashed opacity-40 animate-[spin_24s_linear_infinite]" style={{ borderColor: color }} />
      </div>

      {/* 4. QUANTUM STARGATE TRAVEL TELEMETRY */}
      <div 
        className={`absolute bottom-16 w-80 md:w-96 flex flex-col items-center gap-2.5 transition-all duration-500 font-mono ${
          renderState === 'idle' ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
        }`}
      >
        <div className="text-[10px] tracking-[0.25em] text-white opacity-40 uppercase">QUANTUM DISPERSION FIELD ACTIVE</div>
        
        {/* Main Status Badge */}
        <div 
          className="w-full text-xs font-bold tracking-[0.15em] px-4 py-2.5 bg-black/80 border rounded-lg flex items-center justify-between gap-3"
          style={{ borderColor: `${color}60`, color, boxShadow: `0 0 15px ${color}20` }}
        >
          <div className="flex items-center gap-2.5 overflow-hidden">
            <svg className="animate-spin h-3.5 w-3.5 text-current shrink-0" style={{ color }} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="truncate uppercase font-extrabold">
              {displayProgress === 100 ? 'LINK DEPLOYED' : `WARPING TO ${portalWarping?.targetRoom.toUpperCase()}`}
            </span>
          </div>
          <span className="text-right text-white font-mono font-bold shrink-0">{displayProgress}%</span>
        </div>

        {/* Loading Progress Bar Container */}
        <div className="w-full h-2.5 bg-zinc-950/90 rounded-full border border-zinc-800/80 p-[1px] relative overflow-hidden" style={{ boxShadow: `inset 0 0 4px rgba(0,0,0,0.8)` }}>
          <div 
            className="h-full rounded-full transition-all duration-100 ease-out relative"
            style={{ 
              width: `${displayProgress}%`,
              background: `linear-gradient(90deg, ${color}cc 0%, ${color} 100%)`,
              boxShadow: `0 0 8px ${color}`
            }}
          >
            {/* Pulsing light overlay on the progress bar */}
            <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.4)_50%,transparent_100%)] animate-[pulse_1s_infinite]" />
          </div>
        </div>

        {/* Dynamic Telemetry Subtext status message */}
        <div className="w-full text-center h-4 overflow-hidden">
          <div className="text-[9px] tracking-[0.12em] font-semibold transition-all duration-300 uppercase" style={{ color: displayProgress === 100 ? color : '#a1a1aa' }}>
            {displayProgress < 20 && "INITIATING QUANTUM DISPERSION FIELD..."}
            {displayProgress >= 20 && displayProgress < 45 && "COLLAPSING SPACE-TIME METRIC CURVATURE..."}
            {displayProgress >= 45 && displayProgress < 70 && "ROUTING NEON STREAM PACKETS THROUGH WORMHOLE..."}
            {displayProgress >= 70 && displayProgress < 90 && "SYNCHRONIZING GRAVITY VECTORS WITH DESTINATION..."}
            {displayProgress >= 90 && displayProgress < 100 && (
              threeLoading 
                ? `SYNCHRONIZING ENVIRONMENT ASSETS (${threeItemsLoaded}/${threeItemsTotal})...`
                : (avatarLoading 
                  ? `TRANSMITTING QUANTUM SIGNATURE DATA (${avatarLoadingProgress}%)...` 
                  : "READY TO DEMATERIALIZE...")
            )}
            {displayProgress === 100 && "PORTAL LINK ESTABLISHED! WELCOME TO THE NEW SECTOR."}
          </div>
        </div>
      </div>

      {/* Inject custom visual warp keyframes once on component load */}
      <style>{`
        @keyframes hyperWarp {
          0% {
            transform: translateY(0vh) scaleY(0.1);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translateY(-200vh) scaleY(2.2);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};
