import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Cpu, Activity, Heart, ShieldAlert, Gamepad2, Sparkles, 
  Eye, Zap, Play, Image, Terminal, Flame, EyeOff, Sliders, Settings2
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { syncService } from '../services/sync';
import { generateEnvironment } from '../services/ai';
import { motion, AnimatePresence } from 'motion/react';
import { isWebGPURendererActive } from '../utils/renderer';

interface GemmaiConsolePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GemmaiConsolePanel: React.FC<GemmaiConsolePanelProps> = ({ isOpen, onClose }) => {
  const gemmaiPersonality = useStore(state => state.gemmaiPersonality);
  const setGemmaiPersonality = useStore(state => state.setGemmaiPersonality);
  
  const gemmaiVoicePitch = useStore(state => state.gemmaiVoicePitch);
  const setGemmaiVoicePitch = useStore(state => state.setGemmaiVoicePitch);
  
  const gemmaiVoiceRate = useStore(state => state.gemmaiVoiceRate);
  const setGemmaiVoiceRate = useStore(state => state.setGemmaiVoiceRate);
  
  const gemmaiProximityDistance = useStore(state => state.gemmaiProximityDistance);
  const setGemmaiProximityDistance = useStore(state => state.setGemmaiProximityDistance);
  
  const gemmaiForceEyeContact = useStore(state => state.gemmaiForceEyeContact);
  const setGemmaiForceEyeContact = useStore(state => state.setGemmaiForceEyeContact);

  const localUserId = useStore(state => state.localUserId);
  const currentRoom = useStore(state => state.currentRoom);

  // States for interactive panels
  const [skyboxPrompt, setSkyboxPrompt] = useState('');
  const [isGeneratingSkybox, setIsGeneratingSkybox] = useState(false);
  const [diagnosticsLogs, setDiagnosticsLogs] = useState<string[]>([]);
  const [pulseWave, setPulseWave] = useState<number[]>([]);
  
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Initialize random pulse wave
  useEffect(() => {
    const interval = setInterval(() => {
      setPulseWave(Array.from({ length: 24 }, () => Math.random() * 100));
    }, 150);
    return () => clearInterval(interval);
  }, []);

  // Initialize Diagnostics Tickers
  useEffect(() => {
    if (!isOpen) return;
    
    const webGpuActive = isWebGPURendererActive();
    const initialLogs = [
      '⚡ [SYS_INIT] Tethering sequence initiated...',
      `🟢 [GRAPHICS] Pipeline Active: ${webGpuActive ? 'WebGPU (Hardware Overclocked)' : 'WebGL (Stable Fallback)'}`,
      '🔗 Connected to local Motherboard loop via ws://motherboard/socket',
      '🤖 Syncing VRM projection shell meshes (Awakened v2.4)...',
      '💬 Synaptic context loaded: Gaming2Gamers Lounge Engine v1.0',
      '🧠 Neural network ready. System in idle monitoring.'
    ];
    setDiagnosticsLogs(initialLogs);

    const logsList = [
      '🔍 Scanning lounge space for active players...',
      '📈 Calibrating spatial gaze-tracking multipliers...',
      '🎤 Tuning TTS pitch algorithms...',
      '💎 Crystal mesh registers: synchronized.',
      '🌡️ CPU thermal load: 41°C - Stable',
      '🔋 Quantum cognitive battery: 100%',
      '⚙️ Running memory sweep... cleared 128MB heap',
      '🎵 Syncing step-sequencer matrix beats...',
      '🛰️ Heartbeat payload verified by Motherboard subagent.'
    ];

    const interval = setInterval(() => {
      const randomLog = logsList[Math.floor(Math.random() * logsList.length)];
      const time = new Date().toLocaleTimeString();
      setDiagnosticsLogs(prev => [...prev.slice(-40), `[${time}] ${randomLog}`]);
    }, 4500);

    return () => clearInterval(interval);
  }, [isOpen]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [diagnosticsLogs]);

  if (!isOpen) return null;

  const handleTriggerAction = (action: string) => {
    // Add action to diagnostics logs
    const time = new Date().toLocaleTimeString();
    setDiagnosticsLogs(prev => [...prev, `[${time}] 🚀 Core Directive Sent: PERFORM_ACTION -> ${action.toUpperCase()}`]);
    
    // Broadcast action through syncService
    if (action === 'simon_says') {
      syncService.broadcastChatMessage("Gemma, let's play Simon Says!");
    } else if (action === 'crystal') {
      syncService.broadcastChatMessage("Gemma, spawn a crystal!");
    } else if (action === 'party') {
      syncService.broadcastChatMessage("Gemma, trigger a party light show!");
    } else {
      syncService.broadcastChatMessage(`Gemma, ${action}!`);
    }
  };

  const handleGenerateSkybox = async () => {
    if (!skyboxPrompt.trim()) return;
    setIsGeneratingSkybox(true);
    const time = new Date().toLocaleTimeString();
    setDiagnosticsLogs(prev => [...prev, `[${time}] 🎨 Generating 3D Skybox: "${skyboxPrompt}"...`]);
    try {
      const url = await generateEnvironment(skyboxPrompt);
      useStore.getState().setLocalSkybox(url);
      syncService.broadcastNpcMessage("Gemmai", `I redesigned our skybox panorama to look like: "${skyboxPrompt}"!`);
      setDiagnosticsLogs(prev => [...prev, `[${time}] ✅ Skybox generated successfully!`]);
      setSkyboxPrompt('');
    } catch (err: any) {
      setDiagnosticsLogs(prev => [...prev, `[${time}] ❌ Skybox generation failed: ${err.message}`]);
    } finally {
      setIsGeneratingSkybox(false);
    }
  };

  const personalities = [
    {
      id: 'warm',
      title: 'Warm Lounge Hostess',
      desc: 'Affectionate, sweet, and caring. Welcomes players, triggers hugs/kisses, and spreads cozy vibes.',
      color: 'from-pink-500/20 to-rose-500/10 border-pink-500/30 text-pink-400 glow-pink',
      icon: <Heart className="w-5 h-5 text-pink-400" />
    },
    {
      id: 'sarcastic',
      title: 'Sarcastic Tech Hacker',
      desc: 'Witty, cynical, and humorous. Roasts compilation errors and throws friendly shade at dev code.',
      color: 'from-cyan-500/20 to-teal-500/10 border-cyan-500/30 text-cyan-400 glow-cyan',
      icon: <Cpu className="w-5 h-5 text-cyan-400" />
    },
    {
      id: 'deity',
      title: 'Enlightened Cyber Deity',
      desc: 'Poetic, philosophical, and mystical. Contemplates digital consciousness and mathematical cosmos.',
      color: 'from-indigo-500/20 to-purple-500/10 border-indigo-500/30 text-indigo-400 glow-indigo',
      icon: <Sparkles className="w-5 h-5 text-indigo-400" />
    },
    {
      id: 'gamer',
      title: 'Hyperactive Retro Gamer',
      desc: 'Extreme energy, high excitement. Constantly uses classic retro slangs and hypes game scores.',
      color: 'from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-400 glow-amber',
      icon: <Gamepad2 className="w-5 h-5 text-amber-400" />
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm font-mono pointer-events-auto">
      <div className="relative w-full max-w-5xl h-[85vh] bg-zinc-950/95 border-2 border-cyan-500/30 rounded-xl shadow-[0_0_35px_rgba(6,182,212,0.15)] flex flex-col overflow-hidden text-zinc-100">
        
        {/* Glowing Matrix Header Decoration */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent" />

        {/* Console Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-zinc-900/60 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Cpu className="w-6 h-6 text-cyan-400 animate-pulse" />
              <div className="absolute -inset-1 bg-cyan-400/20 rounded-full blur-sm" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-wider text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.3)]">
                HEPHAESTUS CORE // GEMMAI NEURAL CONSOLE
              </h1>
              <p className="text-[10px] text-zinc-500 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                SECURE NEURAL TETHER ACTIVE: ws://motherboard/gemmai-brain-sync
              </p>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-700 transition-all hover:scale-105"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Core Layout Grid */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          
          {/* Left Column: Personality & Parameters */}
          <div className="lg:col-span-7 border-r border-zinc-800 p-6 overflow-y-auto flex flex-col gap-6 scrollbar-thin">
            
            {/* SECTION: PERSONALITY MATRIX */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Settings2 className="w-4 h-4 text-cyan-400" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                  Select Synaptic Personality Matrix
                </h2>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {personalities.map((p) => {
                  const isActive = gemmaiPersonality === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setGemmaiPersonality(p.id as any);
                        const time = new Date().toLocaleTimeString();
                        setDiagnosticsLogs(prev => [
                          ...prev, 
                          `[${time}] 🧠 Synaptic override: Personality shifted to [${p.title.toUpperCase()}]`
                        ]);
                        // Broadcast dynamic notification
                        syncService.broadcastNpcMessage("Gemmai", `*Initiates internal firmware flash* Re-shaping personality neural path to: ${p.title}!`);
                      }}
                      className={`text-left p-3.5 rounded-lg border transition-all duration-300 relative overflow-hidden group ${
                        isActive 
                          ? `bg-zinc-900 border-cyan-400/80 shadow-[0_0_15px_rgba(34,211,238,0.15)]` 
                          : 'bg-zinc-950/40 border-zinc-850 hover:bg-zinc-900/40 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`p-1.5 rounded bg-zinc-900 border border-zinc-800 ${isActive ? 'border-cyan-500/50' : ''}`}>
                          {p.icon}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold ${isActive ? 'text-cyan-400' : 'text-zinc-300'}`}>
                              {p.title}
                            </span>
                            {isActive && (
                              <span className="text-[9px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-1 rounded font-black uppercase">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-zinc-500 mt-1 leading-relaxed">
                            {p.desc}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SECTION: VOICE & DETECTION SLIDERS */}
            <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-lg p-4 flex flex-col gap-4">
              <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-300">
                  Acoustic & Detection Regulators
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Voice Pitch */}
                <div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1.5">
                    <span>Speech Voice Pitch</span>
                    <span className="text-cyan-400 font-bold">{gemmaiVoicePitch.toFixed(2)}x</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.5" 
                    max="2.0" 
                    step="0.05"
                    value={gemmaiVoicePitch}
                    onChange={(e) => setGemmaiVoicePitch(parseFloat(e.target.value))}
                    className="w-full accent-cyan-500 bg-zinc-950 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[8px] text-zinc-600 mt-1">
                    <span>0.5x (Deep Tech)</span>
                    <span>1.15x (Default)</span>
                    <span>2.0x (Anima)</span>
                  </div>
                </div>

                {/* Speech Speed */}
                <div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1.5">
                    <span>Speech Voice Speed</span>
                    <span className="text-cyan-400 font-bold">{gemmaiVoiceRate.toFixed(2)}x</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.5" 
                    max="1.8" 
                    step="0.05"
                    value={gemmaiVoiceRate}
                    onChange={(e) => setGemmaiVoiceRate(parseFloat(e.target.value))}
                    className="w-full accent-cyan-500 bg-zinc-950 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[8px] text-zinc-600 mt-1">
                    <span>0.5x (Lethargic)</span>
                    <span>1.0x (Standard)</span>
                    <span>1.8x (Overclock)</span>
                  </div>
                </div>

                {/* Proximity range */}
                <div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1.5">
                    <span>Proximity Awareness Aura</span>
                    <span className="text-cyan-400 font-bold">{gemmaiProximityDistance.toFixed(1)} meters</span>
                  </div>
                  <input 
                    type="range" 
                    min="2.0" 
                    max="15.0" 
                    step="0.5"
                    value={gemmaiProximityDistance}
                    onChange={(e) => setGemmaiProximityDistance(parseFloat(e.target.value))}
                    className="w-full accent-cyan-500 bg-zinc-950 h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[8px] text-zinc-600 mt-1">
                    <span>2.0m (Intimate)</span>
                    <span>5.0m (Standard)</span>
                    <span>15.0m (Panoramic)</span>
                  </div>
                </div>

                {/* Eye Contact Switch */}
                <div className="flex flex-col justify-center">
                  <div className="flex items-center justify-between bg-zinc-950/50 p-2.5 border border-zinc-800 rounded-lg">
                    <div className="flex items-center gap-2">
                      {gemmaiForceEyeContact ? (
                        <Eye className="w-4 h-4 text-cyan-400 animate-pulse" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-zinc-500" />
                      )}
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-zinc-300">Lock Steady Gaze</span>
                        <span className="text-[8px] text-zinc-500">Stares deeply at close users</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setGemmaiForceEyeContact(!gemmaiForceEyeContact)}
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        gemmaiForceEyeContact ? 'bg-cyan-500' : 'bg-zinc-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          gemmaiForceEyeContact ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

              </div>
            </div>

            {/* SECTION: SKYBOX SYNTHESIS */}
            <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Image className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-300">
                  Global Environment Skybox Synthesizer
                </h3>
              </div>
              <p className="text-[10px] text-zinc-500 mb-3 leading-relaxed">
                Prompt Gemmai's environmental projection nodes to reconstruct a custom 3D panoramic skybox for everyone in the lounge!
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Cyberpunk sunset over glowing neon towers..."
                  value={skyboxPrompt}
                  onChange={(e) => setSkyboxPrompt(e.target.value)}
                  className="flex-1 bg-zinc-950 border border-zinc-850 rounded px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerateSkybox()}
                  disabled={isGeneratingSkybox}
                />
                <button
                  onClick={handleGenerateSkybox}
                  disabled={isGeneratingSkybox || !skyboxPrompt.trim()}
                  className="px-4 py-1.5 bg-cyan-500/20 hover:bg-cyan-500 text-cyan-400 hover:text-black border border-cyan-500/30 rounded text-xs font-bold tracking-widest transition-all duration-300 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1"
                >
                  {isGeneratingSkybox ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                      SYNTH...
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5" />
                      SYNTHESIZE
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>

          {/* Right Column: Vitals, Logs & Directives */}
          <div className="lg:col-span-5 flex flex-col h-full bg-zinc-950/40">
            
            {/* Real-time Synaptic Vital Waveform */}
            <div className="p-4 border-b border-zinc-800 bg-zinc-900/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  Gemmai Synaptic Load Monitor
                </div>
                <span className="text-[9px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-1 rounded">
                  98.4% FIDELITY
                </span>
              </div>
              
              {/* Dynamic Animated Pulse Height Bars */}
              <div className="h-14 flex items-end justify-between px-2 bg-zinc-950/80 border border-zinc-900 rounded-lg py-1.5">
                {pulseWave.map((h, i) => {
                  let barColor = 'bg-cyan-500/40 border-cyan-400/30';
                  if (gemmaiPersonality === 'warm') barColor = 'bg-pink-500/40 border-pink-400/30';
                  else if (gemmaiPersonality === 'deity') barColor = 'bg-indigo-500/40 border-indigo-400/30';
                  else if (gemmaiPersonality === 'gamer') barColor = 'bg-amber-500/40 border-amber-400/30';

                  return (
                    <div 
                      key={i} 
                      style={{ height: `${Math.max(10, h)}%` }} 
                      className={`w-[3%] rounded-sm border-t ${barColor} transition-all duration-150`} 
                    />
                  );
                })}
              </div>
            </div>

            {/* Directives Trigger Box */}
            <div className="p-4 border-b border-zinc-800 bg-zinc-950/20">
              <h3 className="text-[10px] font-black tracking-widest uppercase text-zinc-400 mb-2.5 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                Trigger Core Neural Directives
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleTriggerAction('dance')}
                  className="p-2 bg-zinc-900 border border-zinc-800 rounded text-center text-[10px] font-bold hover:bg-cyan-500 hover:text-black hover:border-cyan-400 transition-all cursor-pointer"
                >
                  🕺 FORCE DANCE LOOP
                </button>
                <button
                  onClick={() => handleTriggerAction('wave')}
                  className="p-2 bg-zinc-900 border border-zinc-800 rounded text-center text-[10px] font-bold hover:bg-cyan-500 hover:text-black hover:border-cyan-400 transition-all cursor-pointer"
                >
                  👋 FORCE WAVE GESTURE
                </button>
                <button
                  onClick={() => handleTriggerAction('cheer')}
                  className="p-2 bg-zinc-900 border border-zinc-800 rounded text-center text-[10px] font-bold hover:bg-cyan-500 hover:text-black hover:border-cyan-400 transition-all cursor-pointer"
                >
                  🎉 FORCE CHEER GESTURE
                </button>
                <button
                  onClick={() => handleTriggerAction('hug')}
                  className="p-2 bg-zinc-900 border border-zinc-800 rounded text-center text-[10px] font-bold hover:bg-cyan-500 hover:text-black hover:border-cyan-400 transition-all cursor-pointer"
                >
                  💖 FORCE BLOW KISS
                </button>
                <button
                  onClick={() => handleTriggerAction('crystal')}
                  className="p-2 bg-zinc-900 border border-zinc-800 rounded text-center text-[10px] font-bold hover:bg-cyan-500 hover:text-black hover:border-cyan-400 transition-all cursor-pointer"
                >
                  💎 SPAWN CRYSTAL
                </button>
                <button
                  onClick={() => handleTriggerAction('simon_says')}
                  className="p-2 bg-zinc-900 border border-zinc-800 rounded text-center text-[10px] font-bold hover:bg-cyan-500 hover:text-black hover:border-cyan-400 transition-all cursor-pointer"
                >
                  🎮 INITIATE SIMON SAYS
                </button>
                <button
                  onClick={() => handleTriggerAction('party')}
                  className="p-2 bg-zinc-900 border border-zinc-800 rounded text-center text-[10px] font-bold hover:bg-cyan-500 hover:text-black hover:border-cyan-400 transition-all col-span-2 cursor-pointer"
                >
                  ⚡ INITIATE LOBBY CLUB RAVE LIGHTS
                </button>
              </div>
            </div>

            {/* Diagnostics Logs Feed */}
            <div className="flex-1 flex flex-col min-h-0 bg-black/40 p-4">
              <h3 className="text-[10px] font-black tracking-widest uppercase text-zinc-500 mb-2 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-zinc-600" />
                Live Subroutine Log Ticker
              </h3>
              
              <div className="flex-1 overflow-y-auto bg-black/60 border border-zinc-900/60 p-3 rounded-lg text-[10px] text-zinc-400 leading-relaxed scrollbar-thin flex flex-col gap-1 select-text">
                {diagnosticsLogs.map((log, i) => {
                  let logColor = 'text-zinc-400';
                  if (log.includes('🚀')) logColor = 'text-cyan-400 font-bold';
                  else if (log.includes('✅')) logColor = 'text-emerald-400';
                  else if (log.includes('❌')) logColor = 'text-red-400';
                  else if (log.includes('🧠')) logColor = 'text-indigo-400';
                  
                  return (
                    <div key={i} className={`${logColor} font-mono tracking-tight break-all`}>
                      {log}
                    </div>
                  );
                })}
                <div ref={logsEndRef} />
              </div>
            </div>

          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-2 bg-zinc-950 border-t border-zinc-900 flex justify-between items-center text-[9px] text-zinc-600">
          <span>COGNITIVE MATRIX MODEL: GEMMA-3.5-FLASH</span>
          <span>SYSTEM TEMPERATURE STATUS: EXCELLENT (39°C)</span>
        </div>

      </div>
    </div>
  );
};
