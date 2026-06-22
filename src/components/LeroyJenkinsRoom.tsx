/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody } from '@react-three/rapier';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../store';

export function LeroyJenkinsRoom() {
  const terminalOrbRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ringRef2 = useRef<THREE.Mesh>(null);

  const gameState = useGameStore(state => state.gameState);
  const playerState = useGameStore(state => state.playerState);
  const leroyChargeActiveUntil = useGameStore(state => state.leroyChargeActiveUntil);
  const activateLeroyCharge = useGameStore(state => state.activateLeroyCharge);

  const isBuffActive = leroyChargeActiveUntil > Date.now();
  const secondsLeft = Math.max(0, ((leroyChargeActiveUntil - Date.now()) / 1000)).toFixed(1);

  // Proximity trigger cooldown to prevent double activations too quickly
  const lastTriggerTime = useRef(0);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    // Rotate core visual elements
    if (terminalOrbRef.current) {
      terminalOrbRef.current.position.y = 1.35 + Math.sin(t * 3.5) * 0.08;
      terminalOrbRef.current.rotation.y = t * 2.0;
      terminalOrbRef.current.rotation.x = t * 0.8;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.5;
    }
    if (ringRef2.current) {
      ringRef2.current.rotation.z = -t * 0.8;
    }

    // Proximity auto-charge detector (Step into center terminal to scream charge!)
    if (gameState === 'playing' && playerState === 'active') {
      const pPos = state.camera.position;
      const horizontalDist = Math.sqrt(pPos.x * pPos.x + pPos.z * pPos.z);
      
      // If player walks directly to the center pylon (within 2.2 meters)
      if (horizontalDist < 2.2) {
        const now = Date.now();
        if (now - lastTriggerTime.current > 12000 && now > leroyChargeActiveUntil) {
          lastTriggerTime.current = now;
          activateLeroyCharge();
        }
      }
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* 1. SOLID PLATFORM FLOOR FOR PRE-STAGING */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <ringGeometry args={[0, 10.5, 8]} />
        <meshStandardMaterial 
          color={isBuffActive ? "#241005" : "#0d1326"} 
          roughness={0.4} 
          metalness={0.8}
        />
      </mesh>

      {/* Cybernetic floor layout ring accents */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[10.3, 10.5, 8]} />
        <meshBasicMaterial color={isBuffActive ? "#ff5d00" : "#00ffff"} toneMapped={false} />
      </mesh>
      
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[3.2, 3.4, 8]} />
        <meshBasicMaterial color={isBuffActive ? "#ff0000" : "#ff00f0"} toneMapped={false} />
      </mesh>

      {/* Radiant grid pattern for group aggregation */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((idx) => {
        const angle = (idx * Math.PI) / 4;
        return (
          <mesh 
            key={idx} 
            rotation={[-Math.PI / 2, 0, angle]} 
            position={[Math.cos(angle) * 6.5, 0.025, Math.sin(angle) * 6.5]}
          >
            <planeGeometry args={[6.0, 0.05]} />
            <meshBasicMaterial color={isBuffActive ? "#ff5100" : "#1e40af"} transparent opacity={0.6} />
          </mesh>
        );
      })}

      {/* 2. PROTECTIVE ANGLE BULKHEADS (Corner Shields leaving N, S, E, W open!) */}
      {/* Northeast Wall */}
      <RigidBody type="fixed" colliders="cuboid" position={[7.0, 2.5, -7.0]} rotation={[0, Math.PI / 4, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[5.5, 5.0, 0.6]} />
          <meshStandardMaterial color="#0f1424" roughness={0.2} metalness={0.8} />
        </mesh>
        {/* Glow Trim */}
        <mesh position={[0, 0, 0.31]}>
          <planeGeometry args={[5.5, 0.1]} />
          <meshBasicMaterial color={isBuffActive ? "#ff4000" : "#ff00ea"} toneMapped={false} />
        </mesh>
      </RigidBody>

      {/* Northwest Wall */}
      <RigidBody type="fixed" colliders="cuboid" position={[-7.0, 2.5, -7.0]} rotation={[0, -Math.PI / 4, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[5.5, 5.0, 0.6]} />
          <meshStandardMaterial color="#0f1424" roughness={0.2} metalness={0.8} />
        </mesh>
        {/* Glow Trim */}
        <mesh position={[0, 0, 0.31]}>
          <planeGeometry args={[5.5, 0.1]} />
          <meshBasicMaterial color={isBuffActive ? "#ff4000" : "#ff00ea"} toneMapped={false} />
        </mesh>
      </RigidBody>

      {/* Southeast Wall */}
      <RigidBody type="fixed" colliders="cuboid" position={[7.0, 2.5, 7.0]} rotation={[0, -Math.PI / 4, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[5.5, 5.0, 0.6]} />
          <meshStandardMaterial color="#0f1424" roughness={0.2} metalness={0.8} />
        </mesh>
        {/* Glow Trim */}
        <mesh position={[0, 0, 0.31]}>
          <planeGeometry args={[5.5, 0.1]} />
          <meshBasicMaterial color={isBuffActive ? "#ff4000" : "#ff00ea"} toneMapped={false} />
        </mesh>
      </RigidBody>

      {/* Southwest Wall */}
      <RigidBody type="fixed" colliders="cuboid" position={[-7.0, 2.5, 7.0]} rotation={[0, Math.PI / 4, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[5.5, 5.0, 0.6]} />
          <meshStandardMaterial color="#0f1424" roughness={0.2} metalness={0.8} />
        </mesh>
        {/* Glow Trim */}
        <mesh position={[0, 0, 0.31]}>
          <planeGeometry args={[5.5, 0.1]} />
          <meshBasicMaterial color={isBuffActive ? "#ff4000" : "#ff00ea"} toneMapped={false} />
        </mesh>
      </RigidBody>


      {/* 3. COHESIVE OVERHEAD HALOS (Staging hub visuals) */}
      <mesh ref={ringRef} position={[0, 5.0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[9.5, 0.15, 8, 48]} />
        <meshBasicMaterial color={isBuffActive ? "#ff3c00" : "#00f0ff"} toneMapped={false} />
      </mesh>
      
      <mesh ref={ringRef2} position={[0, 5.25, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[10.0, 0.05, 8, 36]} />
        <meshBasicMaterial color={isBuffActive ? "#ffa000" : "#ff00aa"} toneMapped={false} />
      </mesh>

      {/* Downward projector light beam beams */}
      {[0, 120, 240].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <mesh key={deg} position={[Math.cos(rad) * 9.5, 2.5, Math.sin(rad) * 9.5]}>
            <cylinderGeometry args={[0.07, 0.07, 5.0, 6]} />
            <meshBasicMaterial color={isBuffActive ? "#ff4c00" : "#00ffff"} transparent opacity={0.2} />
          </mesh>
        );
      })}


      {/* 4. CENTRAL ACTIVATION TERM BEACON */}
      <RigidBody type="fixed" colliders="hull" position={[0, 0, 0]}>
        {/* Sleek heavy pedestal base */}
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[1.5, 1.8, 0.6, 8]} />
          <meshStandardMaterial color="#090d1a" roughness={0.3} metalness={0.8} />
        </mesh>
        {/* Secondary riser bevel */}
        <mesh position={[0, 0.7, 0]}>
          <cylinderGeometry args={[1.0, 1.3, 0.3, 8]} />
          <meshStandardMaterial color="#1a2238" roughness={0.1} metalness={0.7} />
        </mesh>
      </RigidBody>

      {/* Floating active kinetic core */}
      <mesh ref={terminalOrbRef} position={[0, 1.35, 0]} castShadow>
        <dodecahedronGeometry args={[0.42, 0]} />
        <meshStandardMaterial 
          color="#02040d" 
          roughness={0.1} 
          metalness={0.9} 
          emissive={isBuffActive ? "#ff3c00" : "#ffa31a"} 
          emissiveIntensity={isBuffActive ? 3.5 : 1.8} 
          toneMapped={false}
        />
      </mesh>

      {/* Sub-pedestal vertical light ray inside terminal */}
      <mesh position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.7, 0.7, 0.15, 8]} />
        <meshBasicMaterial color={isBuffActive ? "#ff4d00" : "#ffae00"} toneMapped={false} />
      </mesh>

      {/* Pointlight inside beacon to illuminate staging area */}
      <pointLight 
        position={[0, 1.6, 0]} 
        color={isBuffActive ? "#ff3c00" : "#f59e0b"} 
        intensity={isBuffActive ? 12 : 5} 
        distance={22} 
      />


      {/* 5. TACTICAL BLUEPRINT MEME PANELS & WARP INTERACTIVATION */}
      
      {/* Floating Whiteboard Strategic Plan (Hologram in Northeast corner) */}
      <Html 
        position={[5.5, 2.7, -5.5]} 
        rotation={[0, -Math.PI / 4, 0]} 
        transform 
        distanceFactor={6}
      >
        <div className="flex flex-col gap-1 w-64 select-none font-mono text-[9px] leading-relaxed p-4 border border-cyan-500/50 bg-slate-950/95 text-cyan-400 rounded-lg shadow-[0_0_12px_rgba(6,182,212,0.5)]">
          <div className="border-b border-cyan-500/30 pb-1.5 font-bold tracking-wider text-center text-xs text-white">
            📋 LEROY TACTICAL COMMAND
          </div>
          <div className="mt-1 text-[8px] text-cyan-300 uppercase tracking-widest font-semibold">
            Current Calculations:
          </div>
          <div className="flex justify-between pl-1 border-l border-cyan-500/20 italic">
            <span>Survival Probability:</span>
            <span className="text-red-400 font-bold">32.33%</span>
          </div>
          <div className="flex justify-between pl-1 border-l border-cyan-500/20 italic">
            <span>Aggro Scream Potential:</span>
            <span className="text-emerald-400 font-bold">100.0%</span>
          </div>

          <div className="mt-2 text-[8px] text-cyan-200 font-bold uppercase">
            Battle Protocol:
          </div>
          <ul className="list-decimal pl-4 text-slate-300 text-[8px] flex flex-col gap-0.5">
            <li>Gather entire squad in Spawn Pad</li>
            <li>Stand close to Charger Beacon terminal</li>
            <li>Trigger siren & <span className="text-orange-400 font-bold">CHARGE SCREAMING</span></li>
          </ul>

          <div className="mt-2 border-t border-cyan-500/20 pt-1 text-center text-[7px] text-slate-400 animate-pulse uppercase">
            Staging Area Safe Zone active
          </div>
        </div>
      </Html>

      {/* Floating Whiteboard Meme calculation (Hologram in Northwest corner) */}
      <Html 
        position={[-5.5, 2.7, -5.5]} 
        rotation={[0, Math.PI / 4, 0]} 
        transform 
        distanceFactor={6}
      >
        <div className="flex flex-col gap-1.5 w-64 select-none font-mono text-[9.5px] p-4 border border-amber-500/50 bg-slate-950/95 text-amber-400 rounded-lg shadow-[0_0_12px_rgba(245,158,11,0.5)]">
          <div className="border-b border-amber-500/30 pb-1 font-bold text-center text-[10px] text-white">
            ⚖️ COMBAT INGREDIENTS
          </div>
          <div className="flex flex-col gap-1 mt-1 text-[8.5px]">
            <div className="flex justify-between">
              <span>🐔 CHICKEN SUPPLY:</span>
              <span className="text-emerald-400 font-bold">SECURED [100%]</span>
            </div>
            <div className="flex justify-between">
              <span>🎯 ALIVE SENTINELS:</span>
              <span className="text-red-400 font-bold">DANGEROUS [MANY]</span>
            </div>
            <div className="flex justify-between">
              <span>⚡ JUGGERNAUT BOOST:</span>
              <span className="font-bold text-orange-400">READY</span>
            </div>
          </div>
          <div className="mt-2 border-t border-amber-500/20 pt-2 text-center text-[8px] text-slate-300 bg-amber-950/40 p-1.5 rounded italic">
            "At least I have chicken." <br/>— L. Jenkins
          </div>
        </div>
      </Html>


      {/* 6. CENTRAL FLOATING TACTICAL INTERACTIVE BILLBOARD */}
      <Html
        position={[0, 2.45, 0]}
        center
        distanceFactor={10}
        style={{ pointerEvents: 'auto' }}
        zIndexRange={[100, 0]}
      >
        <div className="flex flex-col items-center gap-2 select-none font-mono">
          
          <div className={`text-center px-4 py-1.5 rounded-md border tracking-[0.15em] font-extrabold uppercase transition-all duration-300 ${
            isBuffActive 
              ? 'bg-red-950/95 text-red-400 border-red-500 shadow-[0_0_20px_#ef4444] animate-pulse scale-105' 
              : 'bg-orange-950/90 text-orange-400 border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.4)]'
          }`}>
            ⚔️ LEROY JENKINS ROOM ⚔️
          </div>

          <div className="flex flex-col items-center p-3 rounded bg-slate-950/95 border border-slate-800 text-slate-300 text-[10px] w-64 shadow-2xl">
            {isBuffActive ? (
              <div className="flex flex-col items-center gap-1">
                <span className="text-red-500 font-black animate-bounce text-xs">🚀 ENERGIZED CHARGE PROTOCOL ACTIVE!</span>
                <span className="text-[14px] text-white font-bold bg-red-600/20 px-2 py-0.5 rounded border border-red-500">
                  ⚡ SPEED: +55% | {secondsLeft}s
                </span>
                <span className="text-[8px] mt-1 text-slate-400 uppercase text-center font-semibold">Charging out screaming...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 w-full text-center">
                <span className="text-[9px] text-amber-400 font-bold uppercase tracking-wider">
                  ⚠️ PROTOCOL DISCHARGED / STANDBY
                </span>
                
                {/* Interactive button that clicks standard function */}
                <button
                  id="btn-leroy-charge"
                  onClick={(e) => {
                    e.stopPropagation();
                    activateLeroyCharge();
                  }}
                  className="w-full bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 active:scale-95 border border-amber-400/80 hover:border-white font-bold font-mono py-1 rounded text-[10px] text-white select-none transition-all cursor-pointer shadow-[0_0_8px_rgba(245,158,11,0.5)] uppercase tracking-widest"
                >
                  📣 ENGAGE LEROYYYY!!!
                </button>
                
                <span className="text-[7.5px] text-slate-400">
                  (Or walk directly into the center Terminal to auto-trigger!)
                </span>
              </div>
            )}
          </div>
        </div>
      </Html>
    </group>
  );
}
