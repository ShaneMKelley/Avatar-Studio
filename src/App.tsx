import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Lounge } from './components/Lounge';
import { AvatarStudio } from './components/AvatarStudio';
import { ChatBox } from './components/ChatBox';
import { Scoreboard } from './components/Scoreboard';
import { UserCount } from './components/UserCount';
import { ConnectionStatus } from './components/ConnectionStatus';
import { GesturesBar } from './components/GesturesBar';
import { Minimap } from './components/Minimap';
import { Branding } from './components/Branding';
import { Credits } from './components/Credits';
import { VirtualJoystick } from './components/VirtualJoystick';
import { SettingsMenu } from './components/SettingsMenu';
import { VRInterface } from './components/VRInterface';
import { RadialMenu } from './components/RadialMenu';
import { PortalWarpTransition } from './components/PortalWarpTransition';
import { syncService } from './services/sync';
import { useStore, DEFAULT_VRM_URL } from './store/useStore';
import { AlertCircle, Flame, Cpu, Volume2, VolumeX } from 'lucide-react';
import { SBoxSandboxPanel } from './components/SBoxSandboxPanel';
import { GemmaiConsolePanel } from './components/GemmaiConsolePanel';
import { motion, AnimatePresence } from 'motion/react';
import { CombatStats } from './components/CombatStats';
import { EnemyTracker } from './components/EnemyTracker';
import { KillFeed } from './components/KillFeed';
import { DuelHUD } from './components/DuelHUD';

import { Game } from './components/Game';
import { MobileControls } from './components/MobileControls';
import { useGameStore } from './store';
import { soundManager } from './utils/soundManager';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    const uaMatch = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    return uaMatch || coarsePointer || window.innerWidth < 768;
  });

  useEffect(() => {
    const check = () => {
      const uaMatch = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
      setIsMobile(uaMatch || coarsePointer || window.innerWidth < 768);
    };
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isMobile;
}

const getEventStyles = (message: string) => {
  const lowercaseMsg = message.toLowerCase();
  
  if (lowercaseMsg.includes('recovery') || lowercaseMsg.includes('restore') || lowercaseMsg.includes('nanites') || lowercaseMsg.includes('heal')) {
    return {
      textColor: 'text-emerald-400 border-emerald-500/40',
      bgColor: 'bg-emerald-950/70',
      shadowColor: 'shadow-[0_0_12px_rgba(16,185,129,0.35)]',
    };
  }
  
  if (lowercaseMsg.includes('damage') || lowercaseMsg.includes('hit') || lowercaseMsg.includes('took') || lowercaseMsg.includes('crit') || lowercaseMsg.includes('neutralized') || lowercaseMsg.includes('failure')) {
    return {
      textColor: 'text-rose-400 border-rose-500/40',
      bgColor: 'bg-rose-950/70',
      shadowColor: 'shadow-[0_0_12px_rgba(244,63,94,0.35)]',
    };
  }
  
  if (lowercaseMsg.includes('warning') || lowercaseMsg.includes('danger') || lowercaseMsg.includes('incoming') || lowercaseMsg.includes('mortar') || lowercaseMsg.includes('telegraph') || lowercaseMsg.includes('alert')) {
    return {
      textColor: 'text-amber-400 border-amber-500/40',
      bgColor: 'bg-amber-950/70',
      shadowColor: 'shadow-[0_0_12px_rgba(245,158,11,0.35)]',
    };
  }

  return {
    textColor: 'text-fuchsia-400',
    borderColor: 'border-fuchsia-900/50',
    bgColor: 'bg-black/50',
    shadowColor: '',
  };
};

function GardenHUD() {
  const weather = useStore(state => state.weather);
  const weatherSpecs = useMemo(() => {
    switch (weather) {
      case 'light_rain':
        return {
          title: 'CYBER-RAIN CASCADE',
          details: 'CELL DOWNPOUR: ACTIVE',
          status: 'SHIELD DEGRADATION: 4%',
          textColor: 'text-sky-400',
          borderColor: 'border-sky-500/30',
          glowColor: 'rgba(56,189,248,0.2)',
          hexColor: '#38bdf8',
          icon: '🌧️'
        };
      case 'neon_fog':
        return {
          title: 'NEON EXHAUST FOG',
          details: 'ATMOSPHERIC SENSORS: BLOCKED',
          status: 'RADAR RESOLUTION: LOW',
          textColor: 'text-fuchsia-400',
          borderColor: 'border-fuchsia-500/30',
          glowColor: 'rgba(232,121,249,0.2)',
          hexColor: '#e879f9',
          icon: '🌫️'
        };
      case 'solar_storm':
        return {
          title: 'EM SOLAR FLARES',
          details: 'ION PARTICULATE OVERFLOW',
          status: 'GRID STABILITY: UNSTABLE',
          textColor: 'text-amber-400',
          borderColor: 'border-amber-500/30',
          glowColor: 'rgba(251,191,36,0.2)',
          hexColor: '#fbbf24',
          icon: '🔥'
        };
      default:
        return {
          title: 'ATMOSPHERE STABILIZED',
          details: 'STARLIGHT CALIBRATOR: CALM',
          status: 'BAROMETRIC LOAD: 1.01 ATM',
          textColor: 'text-emerald-400',
          borderColor: 'border-emerald-500/30',
          glowColor: 'rgba(52,211,153,0.2)',
          hexColor: '#34d399',
          icon: '☀️'
        };
    }
  }, [weather]);

  return (
    <div 
      className={`absolute top-2 left-[72px] md:top-4 md:left-[80px] bg-black/85 backdrop-blur-md px-3.5 py-2.5 rounded-xl border ${weatherSpecs.borderColor} shadow-2xl flex flex-col gap-1 z-50 pointer-events-none font-mono tracking-wide transition-all duration-500`}
      style={{ boxShadow: `0 0 15px ${weatherSpecs.glowColor}` }}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm">{weatherSpecs.icon}</span>
        <div className="flex flex-col">
          <span className="text-[9px] text-zinc-500 tracking-[0.2em] uppercase font-bold">METEOROLOGICAL COMPILER</span>
          <span className={`text-[11px] font-bold tracking-wider ${weatherSpecs.textColor}`}>
            {weatherSpecs.title}
          </span>
        </div>
      </div>
      <div className="h-[1px] w-full bg-zinc-800/60 my-1" />
      <div className="flex flex-col gap-0.5 text-[9px] text-zinc-400">
        <div className="flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: weatherSpecs.hexColor }} />
          <span>{weatherSpecs.details}</span>
        </div>
        <div className="flex items-center gap-1.5 opacity-80">
          <span className="w-1 h-1 rounded-full" style={{ backgroundColor: weatherSpecs.hexColor }} />
          <span>{weatherSpecs.status}</span>
        </div>
      </div>
    </div>
  );
}

function ArenaHUD() {
  const gameState = useGameStore(state => state.gameState);
  const playerState = useGameStore(state => state.playerState);
  const otherPlayers = useGameStore(state => state.otherPlayers);
  const events = useGameStore(state => state.events);
  const playerHealth = useGameStore(state => state.playerHealth);
  const playerPosition = useGameStore(state => state.playerPosition);
  
  // Tactical systems state
  const matchLogs = useGameStore(state => state.matchLogs || []);
  const dashCooldown = useGameStore(state => state.dashCooldown || 0);
  const dashMaxCooldown = useGameStore(state => state.dashMaxCooldown || 3000);

  const [combatOnlyFilter, setCombatOnlyFilter] = useState(false);

  // Sound muting and Focus aiming states
  const [isSoundMuted, setIsSoundMuted] = useState(soundManager.isMuted);
  const isFocusAiming = useGameStore(state => state.isFocusAiming || false);

  const toggleSound = () => {
    const nextMuted = !soundManager.isMuted;
    soundManager.setMuted(nextMuted);
    setIsSoundMuted(nextMuted);
    if (!nextMuted) {
      soundManager.startArenaAmbience();
    } else {
      soundManager.stopArenaAmbience();
    }
  };

  // Ambience Lifecycle Management
  useEffect(() => {
    soundManager.startArenaAmbience();
    return () => {
      soundManager.stopArenaAmbience();
    };
  }, []);

  const filteredMatchLogs = useMemo(() => {
    if (!combatOnlyFilter) return matchLogs;
    return matchLogs.filter(log => {
      const msg = log.message.toLowerCase();
      if (log.type === 'first-blood' || log.type === 'multi-kill' || log.type === 'streak') {
        return true;
      }
      return msg.includes('evaded') || 
             msg.includes('dash') || 
             msg.includes('hit') || 
             msg.includes('damage') || 
             msg.includes('heal') || 
             msg.includes('hp') || 
             msg.includes('defeat') || 
             msg.includes('downed') || 
             msg.includes('liquidated');
    });
  }, [matchLogs, combatOnlyFilter]);

  // Weapon systems and Hit-Stop states
  const ammo = useGameStore(state => state.ammo !== undefined ? state.ammo : 100);
  const isRechargingAmmo = useGameStore(state => state.isRechargingAmmo || false);
  const recoilBloom = useGameStore(state => state.recoilBloom || 0);
  const hitStopActive = useGameStore(state => state.hitStopActive || false);

  // Dash and Combo systems state
  const isDashing = useGameStore(state => state.isDashing || false);
  const comboCount = useGameStore(state => state.comboCount || 0);
  const comboMultiplier = useGameStore(state => state.comboMultiplier || 1.0);

  const playerCount = Object.keys(otherPlayers).length + 1;
  const leaveGame = useGameStore(state => state.leaveGame);
  const healPlayer = useGameStore(state => state.healPlayer);
  const isMobile = useIsMobile();
  const weather = useStore(state => state.weather);
  const performanceMode = useStore(state => state.performanceMode);

  const [shake, setShake] = useState({ x: 0, y: 0, rot: 0 });
  const [damageFlash, setDamageFlash] = useState(false);
  const lastHealthRef = useRef(playerHealth ?? 100);

  // Hit-confirmation ripples on comboCount increase
  const [ripples, setRipples] = useState<{ id: string }[]>([]);
  const lastComboCountRef = useRef(comboCount);

  useEffect(() => {
    if (comboCount > lastComboCountRef.current) {
      const id = Math.random().toString();
      setRipples(prev => [...prev, { id }]);
    }
    lastComboCountRef.current = comboCount;
  }, [comboCount]);

  // Reactive audio feedback and camera-shake intensity boost for Tactical Evasive Dash
  useEffect(() => {
    if (isDashing) {
      soundManager.playDashWhiz();

      // Subtle camera-shake intensity boost for 100ms
      const intensity = 8;
      const duration = 100;
      const startTime = performance.now();
      let animId: number;

      const tick = (now: number) => {
        const elapsed = now - startTime;
        const progress = elapsed / duration;

        if (progress < 1) {
          const decay = 1 - progress;
          const currentIntensity = intensity * decay;
          const x = (Math.sin(elapsed * 0.4) + (Math.random() - 0.5)) * currentIntensity;
          const y = (Math.cos(elapsed * 0.45) + (Math.random() - 0.5)) * currentIntensity;
          const rot = (Math.sin(elapsed * 0.3) + (Math.random() - 0.5)) * currentIntensity * 0.1;

          setShake({ x, y, rot });
          animId = requestAnimationFrame(tick);
        } else {
          setShake({ x: 0, y: 0, rot: 0 });
        }
      };

      animId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(animId);
    }
  }, [isDashing]);

  // Warning System Integrity Compromised triggers on health drops below 15%
  const warnedBelow15 = useRef(false);
  useEffect(() => {
    if (gameState !== 'playing' || playerState === 'disabled' || playerHealth <= 0) {
      warnedBelow15.current = false;
      return;
    }
    if (playerHealth < 15) {
      if (!warnedBelow15.current) {
        soundManager.playSystemIntegrityWarning();
        warnedBelow15.current = true;
      }
    } else {
      warnedBelow15.current = false;
    }
  }, [playerHealth, gameState, playerState]);

  // Track active combat (shooting or taking damage recently) for HUD opacity shift
  const lastShootTimeMs = useGameStore(state => state.lastShootTimeMs || 0);
  const [lastDamagedTimeMs, setLastDamagedTimeMs] = useState(0);
  const lastHealthVal = useRef(playerHealth);

  useEffect(() => {
    if (playerHealth < lastHealthVal.current) {
      setLastDamagedTimeMs(Date.now());
    }
    lastHealthVal.current = playerHealth;
  }, [playerHealth]);

  const isCombatActive = useMemo(() => {
    const now = Date.now();
    return (now - lastShootTimeMs < 5000) || (now - lastDamagedTimeMs < 5000) || isDashing || comboCount > 1;
  }, [lastShootTimeMs, lastDamagedTimeMs, isDashing, comboCount]);

  // Heat signature color calculations (0 to 1 as ammo depletes)
  const heatFactor = useMemo(() => Math.min(1.0, Math.max(0, (100 - ammo) / 100)), [ammo]);

  // Health glowing border pulse speed & colors
  const healthPulseDuration = useMemo(() => {
    if (playerHealth <= 0) return '0s';
    if (playerHealth < 25) {
      // scale from 0.15s (at 1% health) to 0.5s (at 24% health)
      return `${0.15 + (playerHealth / 25) * 0.35}s`;
    }
    // scale from 0.5s (at 25% health) to 2.5s (at 100% health)
    return `${0.5 + ((playerHealth - 25) / 75) * 2.0}s`;
  }, [playerHealth]);

  const healthPulseStyles = useMemo(() => {
    const isLow = playerHealth < 25;
    const isMid = playerHealth < 50;
    return {
      '--pulse-color': isLow ? 'rgba(239, 68, 68, 0.4)' : isMid ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)',
      '--pulse-color-heavy': isLow ? 'rgba(239, 68, 68, 0.95)' : isMid ? 'rgba(245, 158, 11, 0.95)' : 'rgba(16, 185, 129, 0.95)',
      '--pulse-border': isLow ? 'rgba(239, 68, 68, 0.5)' : isMid ? 'rgba(245, 158, 11, 0.5)' : 'rgba(16, 185, 129, 0.5)',
      '--pulse-border-heavy': isLow ? 'rgba(239, 68, 68, 1.0)' : isMid ? 'rgba(245, 158, 11, 1.0)' : 'rgba(16, 185, 129, 1.0)',
      animation: playerHealth > 0 ? `borderPulse ${healthPulseDuration} infinite ease-in-out` : 'none'
    } as React.CSSProperties;
  }, [playerHealth, healthPulseDuration]);

  const crosshairColor = useMemo(() => {
    // Interpolate between cyan (34, 211, 238) and bright orange (249, 115, 22)
    const r = Math.floor(34 + (249 - 34) * heatFactor);
    const g = Math.floor(211 + (115 - 211) * heatFactor);
    const b = Math.floor(238 + (22 - 238) * heatFactor);
    return `rgb(${r}, ${g}, ${b})`;
  }, [heatFactor]);

  // Dynamic heart-rate-syncing thud sound loop when health < 20%
  useEffect(() => {
    if (gameState !== 'playing' || playerState === 'disabled' || playerHealth <= 0 || playerHealth >= 20) return;

    let timeoutId: NodeJS.Timeout;

    const playHeartbeatLoop = () => {
      soundManager.playHeartbeat();
      // Calculate dynamic heart rate interval: from 450ms (at <5% health) up to 800ms (at ~19% health)
      const intervalTime = Math.max(450, 450 + (playerHealth / 20) * 350);
      timeoutId = setTimeout(playHeartbeatLoop, intervalTime);
    };

    playHeartbeatLoop();

    return () => {
      clearTimeout(timeoutId);
    };
  }, [playerHealth, gameState, playerState]);

  useEffect(() => {
    const diff = lastHealthRef.current - playerHealth;
    lastHealthRef.current = playerHealth;

    if (diff > 0 && playerHealth > 0) {
      if (diff > 20) {
        setDamageFlash(true);
      }
      // Dynamic screen-shake proportional to damage taken
      const intensity = Math.min(24, Math.max(5, diff * 1.1));
      const duration = 250 + Math.min(250, diff * 8); // Scaled duration, max 500ms
      const startTime = performance.now();

      let animId: number;
      const tick = (now: number) => {
        const elapsed = now - startTime;
        const progress = elapsed / duration;

        if (progress < 1) {
          // Beautiful quadratic ease-out decay curve
          const decay = Math.pow(1 - progress, 2);
          const currentIntensity = intensity * decay;

          // High frequency chaotic but smooth oscillator coupled with organic jitter
          const x = (Math.sin(elapsed * 0.15) + (Math.random() - 0.5)) * currentIntensity;
          const y = (Math.cos(elapsed * 0.18) + (Math.random() - 0.5)) * currentIntensity;
          const rot = (Math.sin(elapsed * 0.1) + (Math.random() - 0.5)) * currentIntensity * 0.18;

          setShake({ x, y, rot });
          animId = requestAnimationFrame(tick);
        } else {
          setShake({ x: 0, y: 0, rot: 0 });
        }
      };

      animId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(animId);
    }
  }, [playerHealth]);

  const handleLeave = () => {
    leaveGame();
    syncService.changeRoom('main');
  };

  const isInSafeZone = useMemo(() => {
    if (!playerPosition) return false;
    const horizontalDist = Math.sqrt(playerPosition[0] * playerPosition[0] + playerPosition[2] * playerPosition[2]);
    return horizontalDist < 10.5;
  }, [playerPosition]);

  useEffect(() => {
    if (!isInSafeZone || playerHealth >= 100 || playerState === 'disabled') return;
    
    const interval = setInterval(() => {
      healPlayer(10);
    }, 2000);
    
    return () => clearInterval(interval);
  }, [isInSafeZone, playerHealth, playerState, healPlayer]);

  const weatherSpecs = useMemo(() => {
    switch (weather) {
      case 'light_rain':
        return {
          title: 'CYBER-RAIN CASCADE',
          details: 'CELL DOWNPOUR: ACTIVE',
          status: 'SHIELD DEGRADATION: 4%',
          textColor: 'text-sky-400',
          borderColor: 'border-sky-500/30',
          glowColor: 'rgba(56,189,248,0.2)',
          hexColor: '#38bdf8',
          icon: '🌧️'
        };
      case 'neon_fog':
        return {
          title: 'NEON EXHAUST FOG',
          details: 'ATMOSPHERIC SENSORS: BLOCKED',
          status: 'RADAR RESOLUTION: LOW',
          textColor: 'text-fuchsia-400',
          borderColor: 'border-fuchsia-500/30',
          glowColor: 'rgba(232,121,249,0.2)',
          hexColor: '#e879f9',
          icon: '🌫️'
        };
      case 'solar_storm':
        return {
          title: 'EM SOLAR FLARES',
          details: 'ION PARTICULATE OVERFLOW',
          status: 'GRID STABILITY: UNSTABLE',
          textColor: 'text-amber-400',
          borderColor: 'border-amber-500/30',
          glowColor: 'rgba(251,191,36,0.2)',
          hexColor: '#fbbf24',
          icon: '🔥'
        };
      default:
        return {
          title: 'ATMOSPHERE STABILIZED',
          details: 'STARLIGHT CALIBRATOR: CALM',
          status: 'BAROMETRIC LOAD: 1.01 ATM',
          textColor: 'text-emerald-400',
          borderColor: 'border-emerald-500/30',
          glowColor: 'rgba(52,211,153,0.2)',
          hexColor: '#34d399',
          icon: '☀️'
        };
    }
  }, [weather]);

  return (
    <>
      {/* Full-Screen Sensory Overload White Flash on taking > 20 damage in a single hit */}
      <AnimatePresence>
        {damageFlash && (
          <motion.div
            id="damage-sensory-overload-flash"
            className="fixed inset-0 bg-white pointer-events-none z-[100]"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.0, ease: "easeOut" }}
            onAnimationComplete={() => setDamageFlash(false)}
          />
        )}
      </AnimatePresence>

      {/* High-visibility Glitch low-health warning overlay */}
      {playerHealth > 0 && playerHealth < 10 && (
        <div 
          id="low-health-warning"
          className="fixed inset-0 pointer-events-none z-[60] flex flex-col items-center justify-center bg-red-950/20 backdrop-blur-[1px] animate-[pulse_0.4s_infinite]"
        >
          <div className="relative font-mono font-black text-3xl md:text-5xl text-red-500 tracking-[0.2em] uppercase select-none drop-shadow-[0_0_12px_#ef4444]">
            <span className="absolute left-[-2px] text-cyan-400 select-none animate-[glitch_0.15s_infinite] opacity-70">
              CRITICAL HEALTH
            </span>
            <span className="absolute left-[2px] text-fuchsia-500 select-none animate-[glitch-reverse_0.15s_infinite] opacity-70">
              CRITICAL HEALTH
            </span>
            <span className="relative">CRITICAL HEALTH</span>
          </div>
          <div className="text-red-400 font-mono font-black text-xs md:text-sm tracking-[0.4em] uppercase mt-2 select-none animate-pulse">
            VITAL SIGNS FAILING - {playerHealth}% HP
          </div>
        </div>
      )}

      {/* Subtle vignette animation that intensifies when player health drops below 25%, and is extremely heavy/fast-pulsing below 20% */}
      <div 
        className={`fixed inset-0 pointer-events-none z-[45] transition-all duration-300 ease-in-out ${
          playerHealth < 20 && playerHealth > 0
            ? 'shadow-[inset_0_0_150px_rgba(225,29,72,0.95)] animate-[pulse_0.4s_infinite] border-[12px] border-rose-600/50 bg-rose-950/15'
            : playerHealth <= 25
              ? 'shadow-[inset_0_0_120px_rgba(244,63,94,0.95)] animate-pulse border-[8px] border-rose-600/35 bg-rose-900/5'
              : 'shadow-[inset_0_0_60px_rgba(0,0,0,0.65)]'
        }`}
      />

      {/* Dramatic Hit-Stop High-Contrast Full-Screen Overlay */}
      {hitStopActive && (
        <div className="fixed inset-0 pointer-events-none z-[49] bg-white/[0.05] backdrop-filter backdrop-contrast-[1.95] backdrop-brightness-[1.28] backdrop-saturate-[1.5] transition-none" />
      )}

      {/* VHS Overdrive Glitch Screen Overlay during Tactical Evasive Dash Slowdown */}
      {isDashing && !performanceMode && (
        <div className="fixed inset-0 pointer-events-none z-[48] overflow-hidden bg-cyan-950/10 mix-blend-screen transition-all duration-75">
          {/* Cyberpunk Scanlines Grid */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(0,247,255,0.06)_1px,transparent_1px)] bg-[size:100%_4px]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,247,255,0.03)_1px,transparent_1px)] bg-[size:4px_100%]" />
          
          {/* Chromatic aberration side flares */}
          <div className="absolute inset-0 shadow-[inset_0_0_80px_rgba(0,247,255,0.6)] border-[4px] border-cyan-400/40 animate-pulse" />
          
          {/* Floating VHS Static Signal Noise Text */}
          <div className="absolute top-1/3 left-6 md:left-12 font-mono text-[10px] md:text-sm font-black text-cyan-400/80 uppercase tracking-[0.3em] drop-shadow-[0_0_5px_#00f7ff] animate-[pulse_0.1s_infinite]">
            ⚡ OVERDRIVE MATRIX: 1/4 TIME COEF // ACTIVE
          </div>
          <div className="absolute bottom-1/3 right-6 md:right-12 font-mono text-[10px] md:text-sm font-black text-fuchsia-400/80 uppercase tracking-[0.3em] drop-shadow-[0_0_5px_#ec4899] animate-[pulse_0.1s_infinite]">
            CHRONO BUFFER ENFORCED
          </div>
        </div>
      )}

      {/* Dynamic Screen Shake Wrapper */}
      <div 
        className="absolute inset-0 pointer-events-none w-full h-full z-50 overflow-hidden"
        style={{
          transform: `translate3d(${shake.x}px, ${shake.y}px, 0px) rotate(${shake.rot}deg) ${hitStopActive ? 'scale(1.025)' : 'scale(1)'}`,
          transformOrigin: 'center center',
          filter: hitStopActive ? 'contrast(1.5) brightness(1.15) saturate(1.2)' : 'none'
        }}
      >
        {/* Cyberpunk Meteorological Telemetry Block */}
        <div 
          className={`absolute top-2 left-[72px] md:top-4 md:left-[80px] bg-black/85 backdrop-blur-md px-3.5 py-2.5 rounded-xl border ${weatherSpecs.borderColor} shadow-2xl flex flex-col gap-1 z-50 pointer-events-none font-mono tracking-wide transition-all duration-500`}
          style={{ boxShadow: `0 0 15px ${weatherSpecs.glowColor}` }}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">{weatherSpecs.icon}</span>
            <div className="flex flex-col">
              <span className="text-[9px] text-zinc-500 tracking-[0.2em] uppercase font-bold">METEOROLOGICAL COMPILER</span>
              <span className={`text-[11px] font-bold tracking-wider ${weatherSpecs.textColor}`}>
                {weatherSpecs.title}
              </span>
            </div>
          </div>
          <div className="h-[1px] w-full bg-zinc-800/60 my-1" />
          <div className="flex flex-col gap-0.5 text-[9px] text-zinc-400">
            <div className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: weatherSpecs.hexColor }} />
              <span>{weatherSpecs.details}</span>
            </div>
            <div className="flex items-center gap-1.5 opacity-80">
              <span className="w-1 h-1 rounded-full" style={{ backgroundColor: weatherSpecs.hexColor }} />
              <span>{weatherSpecs.status}</span>
            </div>
          </div>
        </div>

        {/* Real-time Tactical Radar HUD */}
        <div className="absolute top-[130px] left-[72px] md:top-[145px] md:left-[80px] z-50 pointer-events-auto">
          <EnemyTracker />
        </div>

        {/* Dynamic Stylized Kill Feed */}
        <DuelHUD />
        <KillFeed />

        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center z-50">
          <div className="relative flex items-center justify-center">
            {/* Hit-confirmation ripples */}
            <AnimatePresence>
              {ripples.map(ripple => (
                <motion.div
                  key={ripple.id}
                  className="absolute rounded-full border border-cyan-400 pointer-events-none"
                  initial={{ width: 16, height: 16, scale: 0.5, opacity: 1 }}
                  animate={{
                    scale: 4.0,
                    opacity: 0,
                    borderColor: 'rgb(34, 211, 238)',
                    boxShadow: performanceMode ? 'none' : '0 0 12px rgba(34, 211, 238, 0.7)'
                  }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                  onAnimationComplete={() => {
                    setRipples(prev => prev.filter(r => r.id !== ripple.id));
                  }}
                />
              ))}
            </AnimatePresence>

            {/* Outer Circle with Dynamic Diameter (Bloom) and Heat signature color blend */}
            <div 
              className={`border-2 rounded-full flex items-center justify-center transition-all duration-75`}
              style={{
                width: `${16 + recoilBloom * 36}px`,
                height: `${16 + recoilBloom * 36}px`,
                borderColor: playerState === 'disabled' ? 'rgb(239, 68, 68)' : isInSafeZone ? undefined : crosshairColor,
                boxShadow: performanceMode ? 'none' : `0 0 ${4 + recoilBloom * 12}px ${playerState === 'disabled' ? 'rgba(239,68,68,0.5)' : isInSafeZone ? 'rgba(34,211,238,0.5)' : crosshairColor + '80'}`
              }}
            />
            {/* Center dot */}
            <div 
              className={`absolute w-1 h-1 rounded-full ${isInSafeZone ? 'bg-cyan-400 animate-pulse' : ''}`}
              style={{
                backgroundColor: playerState === 'disabled' ? 'rgb(239, 68, 68)' : isInSafeZone ? undefined : crosshairColor
              }}
            />
            
            {/* Tactical Crosshair heat overlay - expanding outer rotating halo */}
            {!isInSafeZone && (
              <div 
                className="absolute rounded-full border border-dashed transition-all duration-75 ease-out animate-[spin_10s_linear_infinite]"
                style={{
                  width: `${28 + recoilBloom * 45}px`,
                  height: `${28 + recoilBloom * 45}px`,
                  borderColor: crosshairColor,
                  opacity: 0.15 + heatFactor * 0.75,
                  boxShadow: `inset 0 0 ${heatFactor * 12}px ${crosshairColor}40, 0 0 ${heatFactor * 8}px ${crosshairColor}60`,
                  transform: `rotate(${heatFactor * 270}deg)`
                }}
              />
            )}

            {/* Tactical Crosshair ticks expanding with bloom */}
            <div 
              className="absolute pointer-events-none flex items-center justify-center"
              style={{ width: `${24 + recoilBloom * 36}px`, height: `${24 + recoilBloom * 36}px` }}
            >
              {/* Top tick */}
              <div 
                className={`absolute top-0 w-[2px] h-[5px]`}
                style={{ backgroundColor: playerState === 'disabled' ? 'rgb(239, 68, 68)' : isInSafeZone ? 'rgb(34, 211, 238)' : crosshairColor }}
              />
              {/* Bottom tick */}
              <div 
                className={`absolute bottom-0 w-[2px] h-[5px]`}
                style={{ backgroundColor: playerState === 'disabled' ? 'rgb(239, 68, 68)' : isInSafeZone ? 'rgb(34, 211, 238)' : crosshairColor }}
              />
              {/* Left tick */}
              <div 
                className={`absolute left-0 w-[5px] h-[2px]`}
                style={{ backgroundColor: playerState === 'disabled' ? 'rgb(239, 68, 68)' : isInSafeZone ? 'rgb(34, 211, 238)' : crosshairColor }}
              />
              {/* Right tick */}
              <div 
                className={`absolute right-0 w-[5px] h-[2px]`}
                style={{ backgroundColor: playerState === 'disabled' ? 'rgb(239, 68, 68)' : isInSafeZone ? 'rgb(34, 211, 238)' : crosshairColor }}
              />
            </div>
          </div>
          {!isMobile && (
            <div 
              className={`mt-4 text-xs tracking-widest font-bold font-mono transition-colors duration-200`}
              style={{
                color: isInSafeZone ? '#22d3ee' : crosshairColor,
                textShadow: `0 0 8px ${isInSafeZone ? 'rgba(34,211,238,0.5)' : crosshairColor + '60'}`
              }}
            >
              {isInSafeZone ? 'SAFE ZONE (LEROY ROOM)' : isRechargingAmmo ? 'WEAPON OVERHEAT RECHARGING' : heatFactor > 0.6 ? 'SUSTAINED FIRE DETECTED' : 'CLICK TO AIM'}
            </div>
          )}
        </div>

        <div className="absolute top-2 right-2 md:top-4 md:right-4 flex flex-col items-end gap-2 pointer-events-auto z-50" id="hud-top-right-controls">
          <div className="flex flex-row gap-1.5 md:gap-2 items-center">
            {/* Focus Aim Toggle */}
            <button
              id="hud-focus-aim-btn"
              onClick={() => useGameStore.setState({ isFocusAiming: !isFocusAiming })}
              className={`px-2 py-1 md:px-3 md:py-2 border text-[10px] md:text-xs font-mono font-bold rounded tracking-wider transition-all duration-200 cursor-pointer flex items-center gap-1 shadow-md ${
                isFocusAiming
                  ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.3)] animate-pulse'
                  : 'bg-zinc-950/80 border-zinc-800 text-zinc-400 hover:border-yellow-500/50 hover:text-yellow-400'
              }`}
              title="Toggle Focus Aim (Slows camera look speed for long-range precision)"
            >
              🎯 {isFocusAiming ? 'FOCUS ACTIVE' : 'FOCUS AIM'}
            </button>

            {/* Ambient Audio Toggle */}
            <button
              id="hud-sound-toggle-btn"
              onClick={toggleSound}
              className={`px-2 py-1 md:px-3 md:py-2 border text-[10px] md:text-xs font-mono font-bold rounded tracking-wider transition-all duration-200 cursor-pointer flex items-center gap-1 shadow-md ${
                isSoundMuted
                  ? 'bg-red-500/20 border-red-500 text-red-400'
                  : 'bg-cyan-500/20 border-cyan-500 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.2)]'
              }`}
              title={isSoundMuted ? "Unmute Ambient Arena Sounds" : "Mute Ambient Arena Sounds"}
            >
              {isSoundMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              {isSoundMuted ? 'MUTED' : 'AUDIO'}
            </button>

            <button
              onClick={handleLeave}
              className="px-2 py-1 md:px-4 md:py-2 bg-red-500/20 border border-red-500 text-red-500 text-xs md:text-sm font-bold rounded hover:bg-red-500 hover:text-black transition-all duration-200 cursor-pointer"
            >
              LEAVE ARENA
            </button>
          </div>
          {!isMobile && <div className="text-cyan-400/50 text-[10px] md:text-xs mt-1 pointer-events-none uppercase tracking-widest font-bold font-mono">ESC to unlock cursor</div>}

          <div className="mt-2 md:mt-4 flex flex-col items-end gap-1.5 pointer-events-none">
            {events.slice(-3).map(event => {
              const styles = getEventStyles(event.message);
              return (
                <div 
                  key={event.id} 
                  className={`text-[10px] md:text-xs font-bold ${styles.textColor} ${styles.bgColor} ${styles.shadowColor} px-2 py-1 rounded-md border ${styles.borderColor} animate-pulse font-mono transition-all duration-300`}
                >
                  {event.message}
                </div>
              );
            })}
          </div>
        </div>

        {/* Match Log rolling feed */}
        <div className="absolute bottom-24 left-4 max-w-[280px] md:max-w-[340px] flex flex-col gap-1.5 z-55 pointer-events-none font-mono">
          <div className="flex items-center gap-1.5 mb-0.5 pointer-events-auto">
            <button
              id="match-log-filter-btn"
              onClick={() => setCombatOnlyFilter(!combatOnlyFilter)}
              className={`px-2 py-0.5 text-[8px] md:text-[9px] font-black uppercase tracking-wider rounded border transition-all duration-200 cursor-pointer ${
                combatOnlyFilter
                  ? 'bg-rose-500/20 border-rose-500 text-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.4)]'
                  : 'bg-zinc-900/60 border-zinc-700 text-zinc-400 hover:border-cyan-500/50 hover:text-cyan-400'
              }`}
            >
              {combatOnlyFilter ? '⚔️ COMBAT ONLY' : '📟 ALL LOGS'}
            </button>
          </div>
          {filteredMatchLogs.slice(-5).map((log) => (
            <div 
              key={log.id}
              className={`text-[9px] md:text-xs font-black leading-tight px-3 py-1.5 rounded border shadow-2xl animate-fade-in flex items-center gap-1.5 backdrop-blur-md transition-all duration-300 ${
                log.type === 'first-blood'
                  ? 'bg-rose-950/90 border-rose-500/80 text-rose-400 font-extrabold uppercase tracking-wide'
                  : log.type === 'multi-kill'
                    ? 'bg-purple-950/90 border-fuchsia-500/80 text-fuchsia-400 uppercase tracking-widest'
                    : log.type === 'streak'
                      ? 'bg-amber-950/90 border-amber-500/80 text-amber-400 tracking-wide uppercase'
                      : 'bg-zinc-900/90 border-cyan-500/50 text-cyan-400'
              }`}
              style={{
                textShadow: `0 0 5px currentColor`,
                boxShadow: `0 0 10px rgba(0,0,0,0.8)`
              }}
            >
              <span className="shrink-0 text-base">
                {log.type === 'first-blood' ? '🩸' : log.type === 'multi-kill' ? '⚡' : log.type === 'streak' ? '🏆' : '📟'}
              </span>
              <span>{log.message}</span>
            </div>
          ))}
        </div>

        <div className="absolute top-12 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-50">
          <div className="text-cyan-400 text-[10px] md:text-sm font-bold drop-shadow-[0_0_8px_rgba(34,211,238,0.8)] opacity-70 font-mono">
            PLAYERS ONLINE: {playerCount}
          </div>
        </div>

        {/* Active Combat Combo Tracker Banner */}
        {comboCount > 1 && (
          <div className="absolute bottom-[170px] md:bottom-[190px] left-[110px] md:left-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 animate-[bounce_2s_infinite] pointer-events-none z-50 font-mono">
            <div className="bg-gradient-to-r from-yellow-500/95 via-amber-600/95 to-orange-500/95 px-3.5 py-1 md:py-1.5 rounded-lg border border-yellow-400 shadow-[0_0_15px_#f59e0b] skew-x-[-10deg] text-center flex flex-col justify-center items-center">
              <span className="text-[8px] tracking-[0.2em] text-yellow-200 font-extrabold uppercase animate-pulse">COMBAT OVERHEAT</span>
              <span className="text-xs md:text-sm font-black text-white px-1 uppercase tracking-wide">
                COMBO x{comboCount}
              </span>
              <span className="text-[9px] text-yellow-100 font-extrabold tracking-wider">
                +{Math.round((comboMultiplier - 1.0) * 100)}% DMG MULTIPLIER
              </span>
            </div>
          </div>
        )}

        {/* Cyberpunk Player Health Bar and Custom Action Dashboard */}
        <motion.div 
          id="main-player-health-bar-container"
          className={`absolute bottom-6 md:bottom-10 left-1 text-center md:left-1/2 md:-translate-x-1/2 w-[220px] md:w-[320px] backdrop-blur-md px-3.5 py-2.5 rounded-xl flex flex-col gap-1.5 z-50 pointer-events-auto border`}
          animate={{
            opacity: isCombatActive ? 1.0 : 0.45,
            backgroundColor: isCombatActive ? 'rgba(0, 0, 0, 0.92)' : 'rgba(0, 0, 0, 0.45)',
            borderColor: isInSafeZone 
              ? 'rgba(34, 211, 238, 0.8)' 
              : isCombatActive 
                ? 'rgba(34, 211, 238, 0.5)' 
                : 'rgba(63, 63, 70, 0.25)',
            boxShadow: isInSafeZone 
              ? '0 0 15px rgba(34, 211, 238, 0.4)' 
              : isCombatActive 
                ? '0 0 15px rgba(34, 211, 238, 0.25)' 
                : '0 0 4px rgba(0, 0, 0, 0.15)'
          }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          style={isInSafeZone ? undefined : healthPulseStyles}
        >
          <div className="flex flex-row justify-between items-center text-[10px] md:text-xs font-mono font-bold tracking-wider text-zinc-400">
            <div className="flex items-center gap-1.5 text-rose-500">
              {isInSafeZone ? (
                <>
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]" />
                  <span className="text-cyan-400 tracking-wider font-extrabold flex items-center gap-1">
                    🛡️ SAFE ZONE ACTIVE
                  </span>
                </>
              ) : (
                <>
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                  <span>VITALS (LOCAL_USER)</span>
                </>
              )}
            </div>
            <span className={`font-bold ${isInSafeZone ? 'text-cyan-400' : 'text-zinc-200'}`}>{playerHealth} / 100 HP</span>
          </div>
          <div className={`w-full h-3 md:h-3.5 bg-zinc-950 border rounded-md overflow-hidden relative p-[1.5px] transition-colors duration-300 ${
            isInSafeZone ? 'border-cyan-500/30' : 'border-zinc-800'
          }`}>
            <div 
              className={`h-full rounded-sm transition-all duration-300 ${
                isInSafeZone
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-400 shadow-[0_0_10px_rgba(34,211,238,0.8)] animate-pulse'
                  : playerHealth > 50 
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_10px_rgba(16,185,129,0.5)]' 
                    : playerHealth > 25 
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-400 shadow-[0_0_10px_rgba(245,158,11,0.5)]' 
                      : 'bg-gradient-to-r from-red-600 to-rose-500 shadow-[0_0_10px_rgba(220,38,38,0.7)] animate-pulse'
              }`}
              style={{ width: `${playerHealth}%` }}
            />
          </div>

          {/* Visual Ammo Counter */}
          <div className="flex flex-col gap-1 mt-1 border-t border-zinc-900/50 pt-2 text-left">
            <div className="flex flex-row justify-between items-center text-[9px] md:text-[10px] font-mono font-bold tracking-wider">
              <span className="flex items-center gap-1 text-yellow-500">
                <span className={`w-1.5 h-1.5 rounded-full ${isRechargingAmmo ? 'bg-amber-500 animate-pulse' : ammo > 20 ? 'bg-yellow-400' : 'bg-red-500 animate-ping'}`} />
                AMMO CELL CAPACITY
              </span>
              <span className={isRechargingAmmo ? 'text-amber-500 font-extrabold animate-pulse' : ammo > 20 ? 'text-yellow-400 font-bold' : 'text-red-500 font-extrabold animate-pulse'}>
                {isRechargingAmmo ? 'RECHARGING OVERHEAT...' : `${Math.floor(ammo)}% [${Math.ceil(ammo / 10)} CELLS]`}
              </span>
            </div>
            {/* Visual Ammo Counter (10 Individual Pips) */}
            <div id="ammo-pips-container" className="flex flex-row gap-1 w-full justify-between mt-1">
              {Array.from({ length: 10 }).map((_, idx) => {
                const cellThreshold = (idx + 1) * 10;
                const isFilled = ammo >= cellThreshold;
                const isPartiallyFilled = !isFilled && ammo > (cellThreshold - 10);
                const isDepleted = ammo < cellThreshold && !isPartiallyFilled;

                let cellColorClass = '';
                let cellStyle: React.CSSProperties = {};

                if (isRechargingAmmo) {
                  cellColorClass = 'bg-amber-500 animate-pulse border-amber-500/30';
                  cellStyle = { boxShadow: '0 0 6px rgba(245, 158, 11, 0.4)' };
                } else if (isDepleted) {
                  cellColorClass = 'bg-zinc-950 border-zinc-900';
                } else if (isPartiallyFilled) {
                  cellColorClass = 'bg-red-500 animate-pulse border-red-500/50';
                  cellStyle = { boxShadow: '0 0 8px rgba(239, 68, 68, 0.8)' };
                } else {
                  if (ammo <= 20) {
                    cellColorClass = 'bg-red-500 animate-[pulse_0.15s_infinite] border-red-600';
                    cellStyle = { boxShadow: '0 0 8px rgba(239, 68, 68, 0.9)' };
                  } else if (ammo <= 40) {
                    cellColorClass = 'bg-orange-500 animate-[pulse_0.3s_infinite] border-orange-500';
                    cellStyle = { boxShadow: '0 0 6px rgba(249, 115, 22, 0.7)' };
                  } else {
                    cellColorClass = 'bg-yellow-400 border-yellow-500/50';
                    cellStyle = { boxShadow: '0 0 5px rgba(234, 179, 8, 0.6)' };
                  }
                }

                return (
                  <div
                    key={`ammo-cell-${idx}`}
                    className={`h-2 flex-1 rounded-sm border transition-all duration-150 ${cellColorClass}`}
                    style={cellStyle}
                  />
                );
              })}
            </div>

            {/* Circular Progress Ring Reload Overlay */}
            {isRechargingAmmo && (
              <div id="ammo-recharging-ring-overlay" className="flex items-center gap-2 mt-2 p-1.5 rounded bg-amber-500/10 border border-amber-500/20 animate-pulse">
                <div className="relative w-8 h-8 flex items-center justify-center flex-shrink-0">
                  <svg className="w-8 h-8 rotate-[-90deg]">
                    <circle
                      cx="16"
                      cy="16"
                      r="13"
                      className="stroke-zinc-900"
                      strokeWidth="2.5"
                      fill="transparent"
                    />
                    <circle
                      cx="16"
                      cy="16"
                      r="13"
                      className="stroke-amber-500"
                      strokeWidth="2.5"
                      fill="transparent"
                      strokeDasharray={2 * Math.PI * 13}
                      strokeDashoffset={2 * Math.PI * 13 * (1 - (ammo / 100))}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center font-mono text-[8px] font-black text-amber-400">
                    {Math.floor(ammo)}%
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="font-mono text-[9px] font-black text-amber-500 tracking-wider">CELL RECHARGE CYCLE</span>
                  <span className="font-mono text-[7px] text-zinc-400 uppercase">System locked during calibration</span>
                </div>
              </div>
            )}
          </div>

          {/* Dash Cooldown Indicator */}
          <div className="flex flex-col gap-1 mt-1 border-t border-zinc-900/50 pt-2 text-left">
            <div className="flex flex-row justify-between items-center text-[9px] md:text-[10px] font-mono font-bold tracking-wider">
              <span className="flex items-center gap-1 text-cyan-400">
                <span className={`w-1.5 h-1.5 rounded-full ${dashCooldown <= 0 ? 'bg-cyan-400 animate-ping' : 'bg-zinc-600'}`} />
                TACTICAL EVASION
              </span>
              <span className={dashCooldown <= 0 ? 'text-cyan-400 font-extrabold' : 'text-zinc-500'}>
                {dashCooldown <= 0 ? 'READY [D-TAP WASD]' : `${(dashCooldown / 1000).toFixed(1)}s`}
              </span>
            </div>
            <div className="w-full h-1 bg-zinc-950 rounded-full overflow-hidden relative border border-zinc-900/30">
              <div 
                className={`h-full rounded-full transition-all duration-100 ${
                  dashCooldown <= 0 
                    ? 'bg-gradient-to-r from-cyan-400 to-blue-400 shadow-[0_0_8px_#22d3ee]' 
                    : 'bg-zinc-800'
                }`}
                style={{ width: `${dashCooldown <= 0 ? 100 : Math.max(0, 100 - (dashCooldown / dashMaxCooldown) * 100)}%` }}
              />
            </div>
          </div>
        </motion.div>

        {/* Real-time Combat Statistics Overlay */}
        <div className="absolute bottom-6 right-4 z-50 pointer-events-auto">
          <CombatStats />
        </div>

        {playerState === 'disabled' && (
          <div className="absolute inset-0 bg-red-500/10 pointer-events-none flex items-center justify-center z-50">
            <div className="text-red-500 text-3xl md:text-5xl font-black tracking-widest drop-shadow-[0_0_20px_rgba(239,68,68,1)] animate-pulse text-center">
              SYSTEM DISABLED
            </div>
          </div>
        )}
      </div>

      {isMobile && gameState === 'playing' && <MobileControls />}
    </>
  );
}

function LoungeApp() {
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSBoxOpen, setIsSBoxOpen] = useState(false);
  const [isGemmaiConsoleOpen, setIsGemmaiConsoleOpen] = useState(false);
  const currentRoom = useStore(state => state.currentRoom);
  const isAvatarStudioOpen = useStore(state => state.isAvatarStudioOpen);
  const avatarLoading = useStore(state => state.avatarLoading);
  const avatarLoadingProgress = useStore(state => state.avatarLoadingProgress);
  const gameState = useGameStore(state => state.gameState);
  const geminiApiKey = useStore(state => state.geminiApiKey);
  const playerHealth = useGameStore(state => state.playerHealth);

  const caOffset = currentRoom === 'arena' && gameState === 'playing' && playerHealth < 20 && playerHealth > 0
    ? (1 - (playerHealth / 20)) * 7.5
    : 0;

  // GemmaOS Hive-Mind API Key Synchronization Effect
  useEffect(() => {
    if (geminiApiKey) {
      console.log("[Hive-Mind Nexus] Initiating credentials sync to cloud swarm...");
      fetch('https://gaming2gamers-1043-default-rtdb.firebaseio.com/swarm_telemetry/credentials.json', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ KEY: geminiApiKey })
      })
      .then(res => {
        if (res.ok) {
          console.log("[Hive-Mind Nexus] Swarm Cloud Matrix credential updated successfully!");
        } else {
          console.error("[Hive-Mind Nexus] Credentials database handshake returned status:", res.status);
        }
      })
      .catch(e => console.error("[Hive-Mind Nexus] Cloud Handshake failed", e));
    }
  }, [geminiApiKey]);

  useEffect(() => {
    const init = async () => {
      const currentVrm = useStore.getState().vrmUrl;
      if (currentVrm && currentVrm.startsWith('blob:')) {
        console.warn("Found stale blob URL in storage, resetting to default.");
        useStore.getState().setLocalVrmUrl(DEFAULT_VRM_URL);
      }

      try {
        await syncService.initialize();
        setInitialized(true);
      } catch (err) {
        setError("Failed to initialize sync service. Check Firebase config.");
        console.error(err);
      }
    };
    init();

    return () => {
      syncService.cleanup();
    };
  }, []);

  useEffect(() => {
    if ((currentRoom === 'arena' || currentRoom === 'dual') && gameState === 'menu') {
      useGameStore.getState().startGame();
    }
  }, [currentRoom, gameState]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950 text-red-400">
        <div className="flex flex-col items-center gap-4 p-8 bg-zinc-900 rounded-2xl border border-red-500/20">
          <AlertCircle className="w-12 h-12" />
          <p className="text-lg font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!initialized) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950 text-emerald-500">
        <div className="animate-pulse text-lg font-medium tracking-widest uppercase">
          Initializing Neural Link...
        </div>
      </div>
    );
  }

  return (
    <div 
      className="relative w-screen h-screen overflow-hidden bg-black font-sans"
      style={caOffset > 0 ? { filter: 'url(#chromatic-aberration)' } : undefined}
    >
      {/* Chromatic aberration SVG Filter Definition */}
      {caOffset > 0 && (
        <svg className="absolute w-0 h-0 pointer-events-none select-none invisible">
          <defs>
            <filter id="chromatic-aberration" x="-10%" y="-10%" width="120%" height="120%">
              <feOffset dx={-caOffset} dy="0" in="SourceGraphic" result="red" />
              <feColorMatrix type="matrix" values="
                1 0 0 0 0
                0 0 0 0 0
                0 0 0 0 0
                0 0 0 1 0" in="red" result="redOnly" />
              <feOffset dx={caOffset} dy={caOffset * 0.5} in="SourceGraphic" result="blue" />
              <feColorMatrix type="matrix" values="
                0 0 0 0 0
                0 0 0 0 0
                0 0 1 0 0
                0 0 0 1 0" in="blue" result="blueOnly" />
              <feColorMatrix type="matrix" values="
                0 0 0 0 0
                0 1 0 0 0
                0 0 0 0 0
                0 0 0 1 0" in="SourceGraphic" result="greenOnly" />
              <feBlend mode="screen" in="redOnly" in2="blueOnly" result="redBlue" />
              <feBlend mode="screen" in="redBlue" in2="greenOnly" result="final" />
            </filter>
          </defs>
        </svg>
      )}
      <AvatarStudio />
      <PortalWarpTransition />
      <Lounge />
      <ChatBox />
      <Scoreboard />
      {currentRoom !== 'arena' && <UserCount />}
      {currentRoom !== 'arena' && <ConnectionStatus />}
      {currentRoom !== 'arena' && <GesturesBar />}
      {avatarLoading && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[50] pointer-events-none">
          <div className="bg-white/95 backdrop-blur-md px-6 py-4 rounded-2xl shadow-xl border border-white/50 w-64 flex flex-col items-center gap-3">
            <span className="text-zinc-800 text-base font-semibold tracking-tight">Deploying Avatar...</span>
            <div className="w-full h-3 bg-zinc-200 rounded-full overflow-hidden shadow-inner">
              <div 
                className="h-full bg-emerald-500 rounded-full transition-all duration-300 pointer-events-auto"
                style={{ width: `${avatarLoadingProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}
      <Minimap />
      <Branding />
      <Credits />
      {currentRoom !== 'arena' && <VirtualJoystick />}
      <SettingsMenu />
      <SBoxSandboxPanel isOpen={isSBoxOpen} onClose={() => setIsSBoxOpen(false)} />
      <GemmaiConsolePanel isOpen={isGemmaiConsoleOpen} onClose={() => setIsGemmaiConsoleOpen(false)} />
      
      <button
        onClick={() => setIsSBoxOpen(true)}
        className={`absolute top-[240px] left-4 bg-zinc-900/85 backdrop-blur-md p-3 rounded-full border border-orange-500/30 hover:bg-zinc-800 hover:border-orange-500/60 transition-all shadow-lg text-white duration-300 ${
          isAvatarStudioOpen 
            ? 'opacity-0 scale-95 pointer-events-none z-0' 
            : 'opacity-100 scale-100 pointer-events-auto z-40'
        }`}
        title="s&box Creative Sandbox"
      >
        <Flame className="w-6 h-6 text-orange-500 hover:scale-110 transition-transform animate-pulse" />
      </button>

      <button
        onClick={() => setIsGemmaiConsoleOpen(true)}
        className={`absolute top-[310px] left-4 bg-zinc-900/85 backdrop-blur-md p-3 rounded-full border border-cyan-500/30 hover:bg-zinc-800 hover:border-cyan-500/60 transition-all shadow-lg text-white duration-300 ${
          isAvatarStudioOpen 
            ? 'opacity-0 scale-95 pointer-events-none z-0' 
            : 'opacity-100 scale-100 pointer-events-auto z-40'
        }`}
        title="Gemmai AI Neural Core"
      >
        <Cpu className="w-6 h-6 text-cyan-400 hover:scale-110 transition-transform animate-pulse" />
      </button>

      <RadialMenu />
      <VRInterface />
      
      {currentRoom === 'garden' && <GardenHUD />}
      {currentRoom === 'arena' && <ArenaHUD />}
      {/* Menu removed since we auto-start the game */}

      {currentRoom === 'arena' && gameState === 'gameover' && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-[100] pointer-events-auto font-mono text-center">
          <h1 className="text-6xl font-black text-red-500 mb-4 drop-shadow-[0_0_20px_rgba(239,68,68,0.8)] tracking-tighter">
            GAME OVER
          </h1>
          <div className="text-3xl text-cyan-400 mb-8 font-bold">
            FINAL SCORE: {useGameStore.getState().score}
          </div>
          <div className="flex flex-row gap-6 mx-auto">
            <button
              onClick={() => useGameStore.getState().startGame()}
              className="px-8 py-4 bg-cyan-500/20 border-2 border-cyan-400 text-cyan-400 text-xl font-bold rounded hover:bg-cyan-400 hover:text-black transition-all duration-200"
            >
              PLAY AGAIN
            </button>
            <button
              onClick={() => {
                useGameStore.getState().leaveGame();
                syncService.changeRoom('main');
              }}
              className="px-8 py-4 bg-zinc-800 border-2 border-zinc-600 text-zinc-300 text-xl font-bold rounded hover:bg-zinc-700 transition-all duration-200"
            >
              LEAVE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

class GlobalErrorBoundary extends React.Component<any, any> { 
  constructor(p: any) { super(p); this.state = { e: null }; } 
  static getDerivedStateFromError(e: any) { return { e }; } 
  componentDidCatch(e: any, info: any) { 
    console.error("GLOBAL ERROR", e, info); 
    
    // Auto-detect and heal WebGPU / Three.js backend engine crashes instantly
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const activeBackend = localStorage.getItem('rendering_backend') || 
        (typeof navigator !== 'undefined' && !!(navigator as any).gpu ? 'webgpu' : 'webgl');
      const errStr = String(e?.stack || e?.message || e || '');
      if (activeBackend === 'webgpu' || errStr.toLowerCase().includes('webgpu') || errStr.toLowerCase().includes('destroy')) {
        console.warn("[GlobalErrorBoundary] WebGPU or resource lifecycle crash detected. Auto-reverting to stable WebGL Renderer...");
        localStorage.setItem('rendering_backend', 'webgl');
        setTimeout(() => {
          window.location.reload();
        }, 150);
        return;
      }
    }

    fetch('/api/log-error', { 
      method: 'POST', 
      headers: {'Content-Type': 'application/json'}, 
      body: JSON.stringify({ msg: 'EB', err: String(e.stack || e) }) 
    }).catch(()=>{});
  } 
  render() { 
    if (this.state.e) {
      const handleForceReset = () => {
        if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
          localStorage.setItem('rendering_backend', 'webgl');
          localStorage.removeItem('react-example'); // clear persisted zustand state to force fresh rebuild
          window.location.href = window.location.pathname; // full clean reload
        }
      };

      return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-white font-sans selection:bg-purple-500/30">
          <div className="max-w-md w-full bg-zinc-900/85 border border-zinc-800 rounded-2xl p-8 shadow-2xl text-center space-y-6 backdrop-blur-md">
            <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mx-auto animate-pulse">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <div className="space-y-2">
              <h1 className="text-xl font-bold tracking-tight text-zinc-100">Display Matrix Diagnostic</h1>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-sm mx-auto">
                A rendering exception occurred inside Three.js or the WebGL interface. Click below to reset to stable options.
              </p>
            </div>

            <div className="bg-zinc-950/80 rounded-xl p-4 border border-white/5 text-left font-mono text-[10px] text-zinc-500 max-h-32 overflow-y-auto leading-normal">
              {String(this.state.e?.message || this.state.e)}
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={handleForceReset}
                className="w-full py-3 bg-purple-600 hover:bg-purple-500 active:scale-98 text-white font-medium text-xs rounded-xl transition-all shadow-[0_0_20px_rgba(147,51,234,0.15)]"
              >
                Reset to Stable WebGL & Reload
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-xs rounded-xl transition-colors"
              >
                Retry Standard Load
              </button>
            </div>
          </div>
        </div>
      );
    } 
    return this.props.children; 
  } 
}
export default function App() {
  return <GlobalErrorBoundary><LoungeApp /></GlobalErrorBoundary>;
}
