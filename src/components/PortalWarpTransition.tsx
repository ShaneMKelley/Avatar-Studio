import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';

export const PortalWarpTransition: React.FC = () => {
  const portalWarping = useStore(state => state.portalWarping);
  const [renderState, setRenderState] = useState<'idle' | 'entering' | 'warping' | 'exiting'>('idle');

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

  if (!portalWarping && renderState === 'idle') return null;

  const color = portalWarping?.color || '#00ff88';

  return (
    <div 
      className={`fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center transition-all duration-1000 ease-out ${
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
        className={`absolute w-[360px] h-[360px] md:w-[600px] md:h-[600px] rounded-full border border-opacity-70 transition-all duration-1000 ease-in-out ${
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
            {/* Generate random high speed light-speed travel streaks rushing forward */}
            {Array.from({ length: 28 }).map((_, i) => {
              const startAngle = Math.random() * Math.PI * 2;
              const delay = Math.random() * 1.5;
              const duration = 0.5 + Math.random() * 0.8;
              const trailLength = 80 + Math.random() * 140;
              const size = 1.5 + Math.random() * 2.5;

              return (
                <div
                  key={i}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 origin-bottom pointer-events-none"
                  style={{
                    transform: `translate(-50%, -50%) rotate(${startAngle}rad)`,
                  }}
                >
                  <div
                    className="rounded-full animate-[hyperWarp_1s_linear_infinite]"
                    style={{
                      height: `${trailLength}px`,
                      width: `${size}px`,
                      background: `linear-gradient(to top, transparent, ${color} 70%, #ffffff 100%)`,
                      boxShadow: `0 0 10px ${color}`,
                      animationDelay: `${delay}s`,
                      animationDuration: `${duration}s`,
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. EVENT HORIZON ENERGY WAVE SWELLS */}
      <div 
        className={`absolute rounded-full transition-all duration-1000 ease-out flex items-center justify-center ${
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
        className={`absolute bottom-16 flex flex-col items-center gap-1.5 transition-all duration-700 font-mono ${
          renderState === 'warping' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        <div className="text-[10px] tracking-[0.25em] text-white opacity-40 uppercase">QUANTUM DISPERSION FIELD ACTIVE</div>
        <div 
          className="text-xs font-bold tracking-[0.15em] px-4 py-1.5 bg-black/60 border rounded-lg whitespace-nowrap flex items-center gap-3"
          style={{ borderColor: `${color}80`, color, boxShadow: `0 0 12px ${color}30` }}
        >
          <svg className="animate-spin h-3.5 w-3.5 text-current" style={{ color }} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          WARPING TO {portalWarping?.targetRoom.toUpperCase()} GATEWAY
        </div>
        <div className="text-[9px] text-zinc-500 tracking-[0.1em] mt-1 flex items-center gap-4">
          <span>COORDINATES RE-RIGGED: OK</span>
          <span>WORMHOLE MATRIX: 100%</span>
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
