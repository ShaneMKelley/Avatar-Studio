import React, { useState, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store/useStore';

export const PerformanceMonitor: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const performanceMode = useStore(state => state.performanceMode);
  const setPerformanceMode = useStore(state => state.setPerformanceMode);
  const users = useStore(state => state.users);

  const { gl, camera } = useThree();

  // Stats state
  const [stats, setStats] = useState({
    fps: 0,
    frameTime: 0,
    overhead: 0,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    particles: 0,
    skinnedAvatars: 0,
    instancedAvatars: 0,
  });

  const frameTimesRef = useRef<number[]>([]);
  const lastTimeRef = useRef(performance.now());
  const updateTimerRef = useRef(0);

  useEffect(() => {
    // Listen for Backtick key (`) or Ctrl+Alt+P to toggle hidden monitor
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '`' || e.key === '~' || (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'p')) {
        setIsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Listen for custom trigger from settings or external buttons
  useEffect(() => {
    const handleToggleMonitor = () => {
      setIsOpen(prev => !prev);
    };
    window.addEventListener('toggle-perf-monitor', handleToggleMonitor);
    return () => window.removeEventListener('toggle-perf-monitor', handleToggleMonitor);
  }, []);

  useFrame((state, delta) => {
    const now = performance.now();
    const frameTime = now - lastTimeRef.current;
    lastTimeRef.current = now;

    frameTimesRef.current.push(frameTime);
    if (frameTimesRef.current.length > 60) {
      frameTimesRef.current.shift();
    }

    updateTimerRef.current += delta;
    if (updateTimerRef.current > 0.3) {
      updateTimerRef.current = 0;

      const avgFrameTime = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
      const calculatedFps = Math.round(1000 / Math.max(1, avgFrameTime));
      const overhead = Math.max(0, avgFrameTime - 16.67); // Target 60 FPS is 16.67ms

      // Count skinned vs instanced avatars
      const threshold = performanceMode ? 6 : 14;
      let skinned = 0;
      let instanced = 0;
      
      const remoteUsers = Object.values(users).filter(u => u.id !== useStore.getState().localUserId);
      remoteUsers.forEach(u => {
        const dist = new THREE.Vector3(u.position[0], u.position[1], u.position[2]).distanceTo(camera.position);
        if (dist > threshold) {
          instanced++;
        } else {
          skinned++;
        }
      });

      // Query active weather particles count
      let activeParticles = 1200;
      if (performanceMode) {
        activeParticles = 200;
      } else if (avgFrameTime > 30) {
        activeParticles = 100;
      } else if (avgFrameTime > 20) {
        activeParticles = 300;
      } else if (avgFrameTime > 16.6) {
        activeParticles = 600;
      }

      setStats({
        fps: calculatedFps,
        frameTime: parseFloat(avgFrameTime.toFixed(2)),
        overhead: parseFloat(overhead.toFixed(2)),
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        particles: activeParticles,
        skinnedAvatars: skinned + 1, // +1 for local player
        instancedAvatars: instanced,
      });
    }
  });

  if (!isOpen) return null;

  return (
    <Html
      fullscreen
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 999999,
      }}
    >
      <div 
        style={{ pointerEvents: 'auto' }}
        className="fixed top-4 right-4 w-80 bg-zinc-950/95 border border-red-500/40 rounded-xl p-4 text-xs font-mono text-zinc-300 shadow-2xl select-none"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
          <div className="flex items-center gap-1.5 text-red-400 font-bold uppercase tracking-wider">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            Performance Engine Debug
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="text-zinc-500 hover:text-white font-bold px-1.5 py-0.5 rounded border border-zinc-800 hover:border-zinc-700 bg-zinc-900 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

        <div className="space-y-3">
          {/* Frametime & FPS */}
          <div className="bg-zinc-900/60 p-2.5 rounded border border-zinc-800/80">
            <div className="flex justify-between items-center mb-1">
              <span>FPS / Latency:</span>
              <span className={`font-bold ${stats.fps >= 55 ? 'text-green-400' : stats.fps >= 35 ? 'text-yellow-400' : 'text-red-400'}`}>
                {stats.fps} FPS ({stats.frameTime}ms)
              </span>
            </div>
            {/* Visual Overhead Meter */}
            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${stats.frameTime <= 16.67 ? 'bg-green-500' : stats.frameTime <= 33.33 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(100, (stats.frameTime / 50) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
              <span>0ms</span>
              <span>Target: 16.6ms</span>
              <span>50ms+</span>
            </div>
          </div>

          {/* Dynamic Overhead Estimate */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-zinc-900/40 p-2 rounded border border-zinc-900">
              <span className="text-[10px] text-zinc-500 block">Frame Overhead</span>
              <span className={`text-sm font-bold ${stats.overhead > 0 ? 'text-orange-400 animate-pulse' : 'text-zinc-400'}`}>
                +{stats.overhead}ms
              </span>
            </div>
            <div className="bg-zinc-900/40 p-2 rounded border border-zinc-900">
              <span className="text-[10px] text-zinc-500 block">VRAM Textures</span>
              <span className="text-sm font-bold text-cyan-400">{stats.textures} loaded</span>
            </div>
          </div>

          {/* Core Hardware & Draw Metrics */}
          <div className="space-y-1.5 text-zinc-400">
            <div className="flex justify-between">
              <span className="text-zinc-500">GPU Draw Calls:</span>
              <span className="font-bold text-zinc-200">{stats.drawCalls}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Rendered Triangles:</span>
              <span className="font-bold text-zinc-200">{stats.triangles.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">GPU Geometries:</span>
              <span className="font-bold text-zinc-200">{stats.geometries}</span>
            </div>
          </div>

          {/* Refactoring and Optimization metrics */}
          <div className="border-t border-zinc-800 pt-2.5 mt-2 space-y-1.5">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">
              Optimization States
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Active Weather Particles:</span>
              <span className="text-emerald-400 font-bold">{stats.particles} / 1200</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Skinned Mesh Avatars:</span>
              <span className="text-rose-400 font-bold">{stats.skinnedAvatars} (Heavy)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Instanced Fallback Avatars:</span>
              <span className="text-emerald-400 font-bold">{stats.instancedAvatars} (Instanced)</span>
            </div>
            <div className="flex justify-between items-center mt-2">
              <span className="text-zinc-400">Performance Mode:</span>
              <button
                onClick={() => setPerformanceMode(!performanceMode)}
                className={`px-2 py-0.5 rounded font-bold uppercase cursor-pointer text-[10px] ${performanceMode ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'}`}
              >
                {performanceMode ? 'Active' : 'Muted'}
              </button>
            </div>
          </div>
        </div>

        <div className="text-[10px] text-zinc-600 mt-3 border-t border-zinc-900 pt-2 text-center">
          Press <kbd className="bg-zinc-900 px-1 py-0.5 rounded border border-zinc-800 text-zinc-400">`</kbd> key to hide debug screen
        </div>
      </div>
    </Html>
  );
};
