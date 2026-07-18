/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, Terminal, Box, Trash2, ArrowUpCircle, PlusCircle, 
  Github, MessageSquare, Flame, RotateCcw, FileCode, Play, CheckCircle2, AlertTriangle, RefreshCw
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { soundManager } from '../utils/soundManager';

interface SBoxSandboxPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Issue {
  id: number;
  title: string;
  author: string;
  votes: number;
  comments: number;
  tags: string[];
  status: 'open' | 'resolved';
}

const DEFAULT_ISSUES: Issue[] = [
  { id: 2811, title: 'C# Compiler: Improve hotloading compile times under heavy asset loads', author: 'garry', votes: 142, comments: 24, tags: ['Compiler', 'Performance'], status: 'open' },
  { id: 2795, title: 'Physics: RigidBody collisions passing through thin triangle meshes at high velocities', author: 'layla', votes: 89, comments: 12, tags: ['Physics', 'Rapier'], status: 'open' },
  { id: 2742, title: 'Graphics: WebGL to WebGPU fallback pipeline for customized high-rigged VRM meshes', author: 'sam_g', votes: 115, comments: 19, tags: ['Graphics', 'WebGPU'], status: 'open' },
  { id: 2704, title: 'Entity: Support custom sound triggers inside interactive sequence boundaries', author: 'hephaestus', votes: 54, comments: 7, tags: ['Entities', 'Audio'], status: 'resolved' },
  { id: 2688, title: 'Lobby: Sync player custom rotation vectors smoothly across socket sessions', author: 'windy_dev', votes: 76, comments: 14, tags: ['Networking', 'Sync'], status: 'open' }
];

const C_SHARP_TEMPLATES = [
  {
    name: 'LowGravityZone.cs',
    description: 'Adjusts world physics to low-gravity moon settings.',
    code: `using Sandbox;
using System;

public class LowGravityZone : Component
{
    [Property] public Vector3 MoonGravity { get; set; } = new Vector3(0, -1.5f, 0);

    protected override void OnStart()
    {
        Log.Info( "Initializing LowGravityZone component..." );
        Physics.Gravity = MoonGravity;
        Log.Info( $"Successfully hotloaded! Gravity set to {Physics.Gravity}" );
    }
}`
  },
  {
    name: 'RainbowDiscoLights.cs',
    description: 'Enables high-energy neon party lights and floor sync sequences.',
    code: `using Sandbox;
using System;

public class RainbowDiscoLights : Component
{
    [Property] public string LightTheme { get; set; } = "neon";
    [Property] public Color StartColor { get; set; } = Color.FromHex("#ff00ea");

    protected override void OnStart()
    {
        Log.Info( "Compiling light-show loop handlers..." );
        Scene.LightingEffect = LightTheme;
        Scene.FloorColor = "#1e0b36";
        Log.Info( "Party mode compiled and active! Enjoy the bass!" );
    }
}`
  },
  {
    name: 'WeatherControlSolar.cs',
    description: 'Sets atmospheric conditions to Solar Storm meteor rain.',
    code: `using Sandbox;

public class WeatherControlSolar : Component
{
    protected override void OnStart()
    {
        Log.Info( "Overriding skybox atmospheric pressure..." );
        Scene.Weather = "solar_storm";
        Log.Info( "Solar Storm initialized. Particles emitting!" );
    }
}`
  },
  {
    name: 'ResetWorldPhysics.cs',
    description: 'Restores default lobby gravity, clear skies, and default gray floors.',
    code: `using Sandbox;

public class ResetWorldPhysics : Component
{
    protected override void OnStart()
    {
        Log.Info( "Stabilizing system matrices..." );
        Physics.Gravity = new Vector3(0, -9.81f, 0);
        Scene.Weather = "clear";
        Scene.LightingEffect = "standard";
        Scene.FloorColor = "#303030";
        Log.Info( "World states fully synchronized and restored!" );
    }
}`
  }
];

export const SBoxSandboxPanel: React.FC<SBoxSandboxPanelProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'entities' | 'scripting' | 'issues'>('entities');
  
  // Entity State
  const physicsProps = useStore(state => state.physicsProps);
  const setPhysicsProps = useStore(state => state.setPhysicsProps);

  // Scripting State
  const [selectedTemplateIdx, setSelectedTemplateIdx] = useState(0);
  const [customCode, setCustomCode] = useState(C_SHARP_TEMPLATES[0].code);
  const [compilerLogs, setCompilerLogs] = useState<string[]>([]);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileProgress, setCompileProgress] = useState(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Issues Tracker State
  const [issues, setIssues] = useState<Issue[]>(DEFAULT_ISSUES);
  const [newIssueTitle, setNewIssueTitle] = useState('');
  const [newIssueAuthor, setNewIssueAuthor] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  useEffect(() => {
    // Sync code editor text when template index changes
    setCustomCode(C_SHARP_TEMPLATES[selectedTemplateIdx].code);
  }, [selectedTemplateIdx]);

  // Auto scroll compiler logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [compilerLogs]);

  if (!isOpen) return null;

  // SPAWNING ACTIONS
  const spawnProp = (type: 'box' | 'sphere', specialColor?: string) => {
    soundManager.playCamoDash();
    const id = `sbox-prop-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const color = specialColor || `hsl(${Math.random() * 360}, 90%, 60%)`;
    
    // Position directly above the player's head area with some random offset
    const userPos = useStore.getState().localUserPosition;
    const spawnX = userPos[0] + (Math.random() - 0.5) * 4;
    const spawnZ = userPos[2] + (Math.random() - 0.5) * 4;
    
    const newProp = {
      id,
      position: [spawnX, 10, spawnZ] as [number, number, number],
      color,
      type
    };

    setPhysicsProps([...physicsProps, newProp]);
  };

  const clearAllProps = () => {
    soundManager.playImpact();
    // Keep a maximum of 3 starting standard objects to keep it from feeling too empty, or clear completely
    setPhysicsProps([]);
  };

  // C# HOTRELOAD SCRIPT RUNNER
  const triggerHotreload = () => {
    if (isCompiling) return;
    setIsCompiling(true);
    setCompileProgress(0);
    setCompilerLogs([]);
    soundManager.playLaserCharge();

    const currentTemplate = C_SHARP_TEMPLATES[selectedTemplateIdx];
    
    const logs = [
      `[s&box Compiler 0.14.2] Initializing code assembly parse...`,
      `[s&box Compiler] Discovered component class: ${currentTemplate.name.replace('.cs', '')}`,
      `[s&box Compiler] Validating references: Sandbox.Engine, System.Numerics`,
      `[s&box Compiler] Analyzing syntax tree... 0 errors, 0 warnings.`,
    ];

    let logIdx = 0;
    const interval = setInterval(() => {
      if (logIdx < logs.length) {
        setCompilerLogs(prev => [...prev, logs[logIdx]]);
        setCompileProgress(Math.floor(((logIdx + 1) / (logs.length + 3)) * 100));
        logIdx++;
      } else {
        clearInterval(interval);
        
        // Final hotload completion
        setTimeout(() => {
          setCompileProgress(85);
          setCompilerLogs(prev => [...prev, `[s&box Compiler] Hotloading compiled binary assembly into main Scene Graph...`]);
          
          setTimeout(() => {
            setCompileProgress(100);
            setCompilerLogs(prev => [
              ...prev, 
              `[s&box Scene] SUCCESSFULLY MOUNTED ${currentTemplate.name.toUpperCase()} COMPONENT IN LIVE SPACE!`,
              `[s&box Scene] Log.Info callback fired successfully.`
            ]);
            setIsCompiling(false);
            soundManager.playWarpExiting();

            // Execute the actual React-state equivalent of the hotloaded script!
            executeScriptEffect(currentTemplate.name);
          }, 800);
        }, 600);
      }
    }, 400);
  };

  const executeScriptEffect = (filename: string) => {
    const store = useStore.getState();
    switch (filename) {
      case 'LowGravityZone.cs':
        // Change gravity to low moon gravity
        store.setGravity([0, -1.5, 0]);
        break;
      case 'RainbowDiscoLights.cs':
        // Enable neon light mode and deep purple floor color
        store.setLightingEffect('neon');
        store.setFloorColor('#1e0b36');
        break;
      case 'WeatherControlSolar.cs':
        // Solar Storm particles
        store.setWeather('solar_storm');
        break;
      case 'ResetWorldPhysics.cs':
        // Reset gravity, weather, and floor colors
        store.setGravity([0, -9.81, 0]);
        store.setWeather('clear');
        store.setLightingEffect('standard');
        store.setFloorColor('#303030');
        break;
    }
  };

  // ISSUES TRACKER ACTIONS
  const handleUpvote = (id: number) => {
    soundManager.playScoreBig();
    setIssues(prev => prev.map(issue => {
      if (issue.id === id) {
        return { ...issue, votes: issue.votes + 1 };
      }
      return issue;
    }));
  };

  const handleSubmitIssue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIssueTitle.trim()) return;

    soundManager.playCamoDash();
    const newId = 2000 + Math.floor(Math.random() * 900);
    const author = newIssueAuthor.trim() || 'anonymous_coder';
    const newIssue: Issue = {
      id: newId,
      title: newIssueTitle,
      author,
      votes: 1,
      comments: 0,
      tags: ['Community', 'Idea'],
      status: 'open'
    };

    setIssues([newIssue, ...issues]);
    setNewIssueTitle('');
    setNewIssueAuthor('');
    setFeedbackSuccess(true);
    setTimeout(() => setFeedbackSuccess(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm pointer-events-auto p-4">
      <div className="relative w-full max-w-4xl h-[85vh] bg-zinc-950 border border-orange-500/30 rounded-2xl shadow-[0_0_30px_rgba(249,115,22,0.15)] overflow-hidden flex flex-col text-white font-sans">
        
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4 bg-zinc-900 border-b border-orange-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-600/20 rounded-lg border border-orange-500/40">
              <Flame className="w-5 h-5 text-orange-500 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-orange-500 tracking-[0.2em] uppercase">FACEPUNCH s&box</span>
                <span className="bg-orange-500/20 text-orange-400 text-[10px] px-2 py-0.5 rounded font-mono font-bold">PORTAL DEV</span>
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Creative Sandbox & Developer Console
              </h1>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white transition-colors border border-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TABS SELECTOR */}
        <div className="flex bg-zinc-900/60 border-b border-white/5 px-4 gap-2">
          <button
            onClick={() => setActiveTab('entities')}
            className={`px-4 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'entities' 
                ? 'border-orange-500 text-orange-400 bg-orange-500/[0.03]' 
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Box className="w-4 h-4" />
            Entity Spawner
          </button>
          <button
            onClick={() => setActiveTab('scripting')}
            className={`px-4 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'scripting' 
                ? 'border-orange-500 text-orange-400 bg-orange-500/[0.03]' 
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Terminal className="w-4 h-4" />
            C# Hotloader Scripting
          </button>
          <button
            onClick={() => setActiveTab('issues')}
            className={`px-4 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'issues' 
                ? 'border-orange-500 text-orange-400 bg-orange-500/[0.03]' 
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Github className="w-4 h-4" />
            sbox-public Issues Feedback
          </button>
        </div>

        {/* MAIN BODY AREA */}
        <div className="flex-1 overflow-y-auto p-6 bg-zinc-950/90 text-zinc-300">
          
          {/* TAB 1: ENTITIES SPAWNER */}
          {activeTab === 'entities' && (
            <div className="space-y-6">
              <div className="bg-zinc-900/60 border border-white/5 rounded-xl p-5">
                <h3 className="text-white text-base font-bold mb-1.5 flex items-center gap-2">
                  <Box className="w-4 h-4 text-orange-500" />
                  Physics Prop Workshop
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                  Spawn physically interactive objects directly into the Lounge environment! Items drop dynamically and react instantly with standard Rapier rigid-body gravity, friction, and collision meshes. Point with joystick/mouse to shove or pile them!
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Option 1: Basic Wooden Box */}
                  <div className="bg-zinc-950 border border-white/5 hover:border-orange-500/40 rounded-xl p-4 flex flex-col items-center text-center transition-all group">
                    <div className="w-12 h-12 bg-amber-900/30 rounded-lg flex items-center justify-center border border-amber-500/20 mb-3 group-hover:scale-110 transition-transform">
                      <Box className="w-6 h-6 text-amber-500" />
                    </div>
                    <span className="text-sm font-bold text-white mb-1">Wooden Crate</span>
                    <span className="text-[10px] text-zinc-500 mb-4 font-mono">weight: 1.0kg • box</span>
                    <button
                      onClick={() => spawnProp('box', '#d97706')}
                      className="w-full py-1.5 bg-zinc-900 hover:bg-orange-600 rounded-lg text-xs font-bold text-white transition-colors border border-white/10 group-hover:border-orange-500/20"
                    >
                      Spawn Crate
                    </button>
                  </div>

                  {/* Option 2: Heavy Metal Ball */}
                  <div className="bg-zinc-950 border border-white/5 hover:border-orange-500/40 rounded-xl p-4 flex flex-col items-center text-center transition-all group">
                    <div className="w-12 h-12 bg-sky-900/30 rounded-lg flex items-center justify-center border border-sky-500/20 mb-3 group-hover:scale-110 transition-transform">
                      <div className="w-5 h-5 rounded-full bg-sky-500" />
                    </div>
                    <span className="text-sm font-bold text-white mb-1">Heavy Sphere</span>
                    <span className="text-[10px] text-zinc-500 mb-4 font-mono">weight: 2.5kg • ball</span>
                    <button
                      onClick={() => spawnProp('sphere', '#0284c7')}
                      className="w-full py-1.5 bg-zinc-900 hover:bg-orange-600 rounded-lg text-xs font-bold text-white transition-colors border border-white/10 group-hover:border-orange-500/20"
                    >
                      Spawn Sphere
                    </button>
                  </div>

                  {/* Option 3: Neon Red Explosive Block */}
                  <div className="bg-zinc-950 border border-white/5 hover:border-orange-500/40 rounded-xl p-4 flex flex-col items-center text-center transition-all group">
                    <div className="w-12 h-12 bg-red-950/40 rounded-lg flex items-center justify-center border border-red-500/30 mb-3 group-hover:scale-110 transition-transform">
                      <Flame className="w-5 h-5 text-red-500" />
                    </div>
                    <span className="text-sm font-bold text-white mb-1">Explosive Drum</span>
                    <span className="text-[10px] text-zinc-500 mb-4 font-mono">weight: 1.2kg • bright glow</span>
                    <button
                      onClick={() => spawnProp('box', '#ef4444')}
                      className="w-full py-1.5 bg-zinc-900 hover:bg-orange-600 rounded-lg text-xs font-bold text-white transition-colors border border-white/10 group-hover:border-orange-500/20"
                    >
                      Spawn Drum
                    </button>
                  </div>

                  {/* Option 4: Surprise Cosmic Balloon */}
                  <div className="bg-zinc-950 border border-white/5 hover:border-orange-500/40 rounded-xl p-4 flex flex-col items-center text-center transition-all group">
                    <div className="w-12 h-12 bg-purple-900/30 rounded-lg flex items-center justify-center border border-purple-500/20 mb-3 group-hover:scale-110 transition-transform">
                      <div className="w-5 h-5 rounded-full bg-purple-500 animate-bounce" />
                    </div>
                    <span className="text-sm font-bold text-white mb-1">Bouncy Balloon</span>
                    <span className="text-[10px] text-zinc-500 mb-4 font-mono">weight: 0.2kg • bouncy</span>
                    <button
                      onClick={() => spawnProp('sphere')}
                      className="w-full py-1.5 bg-zinc-900 hover:bg-orange-600 rounded-lg text-xs font-bold text-white transition-colors border border-white/10 group-hover:border-orange-500/20"
                    >
                      Spawn Random
                    </button>
                  </div>
                </div>
              </div>

              {/* STATS & UTILITY BAR */}
              <div className="bg-zinc-900/30 border border-white/5 rounded-xl p-5 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="text-zinc-400 text-sm">
                    Active Custom Spawns: <span className="font-mono text-white font-bold bg-zinc-800 px-2 py-0.5 rounded border border-white/5">{physicsProps.filter(p => p.id.startsWith('sbox-prop')).length}</span> / 50
                  </div>
                </div>
                <div className="flex gap-2.5 w-full md:w-auto">
                  <button
                    onClick={() => {
                      for (let i = 0; i < 10; i++) {
                        setTimeout(() => {
                          spawnProp(Math.random() > 0.5 ? 'box' : 'sphere');
                        }, i * 70);
                      }
                    }}
                    className="flex-1 md:flex-none px-4 py-2 bg-orange-600/20 border border-orange-500/40 hover:bg-orange-600 text-orange-300 hover:text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Spawn Barrage (10x)
                  </button>
                  <button
                    onClick={clearAllProps}
                    disabled={physicsProps.length === 0}
                    className="flex-1 md:flex-none px-4 py-2 bg-zinc-900 border border-white/5 hover:bg-red-950 hover:text-red-400 hover:border-red-500/30 disabled:opacity-30 disabled:hover:bg-zinc-900 disabled:hover:text-zinc-500 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    Vacuum Clean (Clear)
                  </button>
                </div>
              </div>

              {/* TRIVIA EXPLAINER */}
              <div className="bg-orange-950/20 border border-orange-500/10 rounded-xl p-4 text-xs text-orange-400/80 leading-relaxed flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                <div>
                  <strong>What makes this work?</strong> In s&box (the successor to Garry&apos;s Mod), players dynamically spawn, weld, and script physical props using Source 2&apos;s Rubikon physics engine. In our Web Lounge, we mirror this design style using <strong>React Three Fiber + Rapier physics engine</strong> running at a solid 60fps! Enjoy stacking them high.
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: C# HOTLOADER SCRIPTING */}
          {activeTab === 'scripting' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 h-full">
              
              {/* Left Column: Template Selector */}
              <div className="md:col-span-4 flex flex-col gap-2.5">
                <span className="text-xs text-zinc-500 font-bold tracking-[0.1em] uppercase">Script Templates</span>
                {C_SHARP_TEMPLATES.map((tpl, idx) => (
                  <button
                    key={tpl.name}
                    onClick={() => {
                      if (!isCompiling) setSelectedTemplateIdx(idx);
                    }}
                    disabled={isCompiling}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                      selectedTemplateIdx === idx 
                        ? 'bg-orange-600/15 border-orange-500/55 text-white shadow-[0_4px_12px_rgba(249,115,22,0.1)]' 
                        : 'bg-zinc-900/40 border-white/5 text-zinc-400 hover:bg-zinc-900/70 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <FileCode className={`w-4 h-4 ${selectedTemplateIdx === idx ? 'text-orange-400' : 'text-zinc-500'}`} />
                      <span className="font-mono text-xs font-bold">{tpl.name}</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-normal">{tpl.description}</p>
                  </button>
                ))}
              </div>

              {/* Right Column: Code Editor & Compiler Output */}
              <div className="md:col-span-8 flex flex-col gap-4">
                {/* Code Window */}
                <div className="bg-zinc-900/90 rounded-xl border border-white/5 overflow-hidden flex flex-col font-mono text-[11px] h-64 shadow-inner">
                  <div className="bg-zinc-900 px-4 py-2 border-b border-white/5 flex items-center justify-between">
                    <span className="text-zinc-500 text-[10px] font-bold">C# S&BOX COMPONENT ENVIRONMENT</span>
                    <span className="text-emerald-400 text-[10px] flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      Syntax Checker: PASS
                    </span>
                  </div>
                  <textarea
                    value={customCode}
                    onChange={(e) => {
                      if (!isCompiling) setCustomCode(e.target.value);
                    }}
                    disabled={isCompiling}
                    className="flex-1 w-full p-4 bg-zinc-950 text-orange-200/95 outline-none resize-none overflow-y-auto leading-relaxed font-mono"
                    spellCheck="false"
                  />
                </div>

                {/* Hotreload Bar */}
                <div className="flex items-center gap-4">
                  <button
                    onClick={triggerHotreload}
                    disabled={isCompiling}
                    className="flex-1 py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white rounded-xl font-bold tracking-wide transition-all shadow-[0_4px_15px_rgba(249,115,22,0.25)] flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isCompiling ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Compiling s&box Assembly ({compileProgress}%)...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        HOT-RELOAD COMPONENT SCRIPT
                      </>
                    )}
                  </button>
                  {isCompiling && (
                    <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden shrink-0 border border-white/5">
                      <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${compileProgress}%` }} />
                    </div>
                  )}
                </div>

                {/* Live Logs console */}
                <div className="bg-black/95 rounded-xl border border-zinc-800 p-4 font-mono text-[10px] h-32 flex flex-col">
                  <span className="text-zinc-600 font-bold mb-2 border-b border-zinc-900 pb-1 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-orange-500" />
                    LIVE COMPILER STACK OUTPUT LOGS
                  </span>
                  <div ref={logContainerRef} className="flex-1 overflow-y-auto space-y-1 text-zinc-400">
                    {compilerLogs.length === 0 ? (
                      <span className="text-zinc-700 italic">No compile tasks triggered yet. Select a C# script template above and trigger "Hot-Reload Component" to execute real side-effects inside the 3D room!</span>
                    ) : (
                      compilerLogs.map((log, i) => {
                        let color = 'text-zinc-400';
                        if (log.includes('SUCCESSFULLY') || log.includes('Success')) color = 'text-emerald-400 font-bold';
                        else if (log.includes('Discovered') || log.includes('Validating')) color = 'text-sky-400';
                        else if (log.includes('class') || log.includes('component')) color = 'text-orange-400';
                        
                        return <div key={i} className={`break-all leading-normal ${color}`}>{log}</div>;
                      })
                    )}
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: ISSUES TRACKER FEED */}
          {activeTab === 'issues' && (
            <div className="space-y-6">
              
              {/* Submit Feedback Form */}
              <form onSubmit={handleSubmitIssue} className="bg-zinc-900/60 border border-white/5 rounded-xl p-5">
                <h3 className="text-white text-base font-bold mb-2 flex items-center gap-2">
                  <PlusCircle className="w-4.5 h-4.5 text-orange-500" />
                  Request C# API Additions / Issue Report
                </h3>
                <p className="text-xs text-zinc-400 leading-normal mb-4">
                  Add custom suggestions directly to our virtual <strong>facepunch/sbox-public</strong> active list! Upvote community recommendations to draw developer focus and unlock simulated core components.
                </p>

                <div className="flex flex-col md:flex-row gap-3">
                  <input
                    type="text"
                    required
                    value={newIssueTitle}
                    onChange={(e) => setNewIssueTitle(e.target.value)}
                    placeholder="e.g. Add custom collision triggers for sequencers or adjust camera spring arm height..."
                    className="flex-1 px-4 py-2 bg-zinc-950 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                  <input
                    type="text"
                    value={newIssueAuthor}
                    onChange={(e) => setNewIssueAuthor(e.target.value)}
                    placeholder="Username (default: anonymous)"
                    className="md:w-48 px-4 py-2 bg-zinc-950 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                  <button
                    type="submit"
                    className="px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-bold transition-all shrink-0"
                  >
                    Submit Idea
                  </button>
                </div>
                {feedbackSuccess && (
                  <div className="mt-3 text-emerald-400 text-xs font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Suggestion added successfully! Check it out in the community feed below.
                  </div>
                )}
              </form>

              {/* Issues Feed list */}
              <div className="space-y-3">
                <span className="text-xs text-zinc-500 font-bold tracking-[0.1em] uppercase block">ACTIVE sbox-public FEEDBACKS ({issues.length})</span>
                
                {issues.map(issue => (
                  <div key={issue.id} className="bg-zinc-950 border border-white/5 hover:border-orange-500/20 rounded-xl p-4 flex items-center justify-between gap-4 transition-all group">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-zinc-900 border border-white/5 rounded-lg text-orange-500 shrink-0 mt-0.5">
                        <MessageSquare className="w-4.5 h-4.5 text-orange-500" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-zinc-500 text-xs font-mono font-bold">#{issue.id}</span>
                          <span className="text-white text-sm font-bold tracking-tight">{issue.title}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-zinc-500 font-mono">
                          <span>Reported by: <strong className="text-zinc-400">{issue.author}</strong></span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3 text-zinc-600" />
                            {issue.comments} comments
                          </span>
                          <span>•</span>
                          <div className="flex gap-1.5">
                            {issue.tags.map(tag => (
                              <span key={tag} className="bg-zinc-900 text-[9px] px-1.5 py-0.2 rounded border border-white/5 text-zinc-400 font-sans font-medium">{tag}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleUpvote(issue.id)}
                      className="px-3 py-1.5 bg-zinc-900 group-hover:bg-orange-600/10 border border-white/10 group-hover:border-orange-500/30 rounded-lg flex flex-col items-center justify-center shrink-0 w-14 transition-all"
                    >
                      <ArrowUpCircle className="w-4.5 h-4.5 text-zinc-400 group-hover:text-orange-400" />
                      <span className="text-xs font-mono font-bold text-zinc-300 group-hover:text-white mt-1">{issue.votes}</span>
                    </button>
                  </div>
                ))}
              </div>

            </div>
          )}

        </div>

        {/* FOOTER */}
        <div className="bg-zinc-900 px-6 py-4 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500/80" />
            <span>Interactive sandbox compiler simulation. Spawning physical elements does not affect persistent cloud data.</span>
          </div>
          <div className="flex items-center gap-2">
            <span>Powering local client compilation.</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-zinc-400 font-bold font-mono">PORT 3000 ENGINE</span>
          </div>
        </div>

      </div>
    </div>
  );
};
