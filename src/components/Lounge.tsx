import React, { Suspense, useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PointerLockControls, Environment, Grid, useTexture, Stars, Text, Box, Html } from '@react-three/drei';
import { Physics, RigidBody, interactionGroups, CuboidCollider } from '@react-three/rapier';
import { EffectComposer, Bloom, N8AO } from '@react-three/postprocessing';
import { XR, useXR } from '@react-three/xr';
import * as THREE from 'three';
import { Avatar } from './Avatar';
import { GemmaNPC } from './GemmaNPC';
import { GemmaGuideClone } from './GemmaGuideClone';
import { Crystals } from './Crystals';
import { useStore, DEFAULT_VRM_URL } from '../store/useStore';
import { getTranslation } from '../utils/translations';
import { useGameStore } from '../store';
import { syncService } from '../services/sync';
import { xrStore } from './VRInterface';
import { soundManager } from '../utils/soundManager';

import { Arena } from './Arena';
import { Player } from './Player';
import { Enemy } from './Enemy';
import { OtherPlayer } from './OtherPlayer';
import { Effects } from './Effects';
import { Sequencer3D } from './Sequencer3D';
import { useShallow } from 'zustand/react/shallow';
import { idleTaskQueue } from '../utils/idleTaskQueue';
import { SynthGarden } from './SynthGarden';
import { LoungeBalcony } from './LoungeBalcony';
import { createWebGPURenderer, isWebGPURendererActive } from '../utils/renderer';
import { WebGPUSceneSanitizer } from './WebGPUSceneSanitizer';

function GameLoop() {
  const updateTime = useGameStore(state => state.updateTime);
  const updateEnemies = useGameStore(state => state.updateEnemies);
  const cleanupEffects = useGameStore(state => state.cleanupEffects);

  useFrame((_, delta) => {
    const now = Date.now();
    updateTime(delta);
    updateEnemies(now);
    cleanupEffects(now);
  });
  return null;
}

const CustomSkybox = ({ url }: { url: string }) => {
  const texture = useTexture(url);
  return (
    <mesh>
      <sphereGeometry args={[50, 60, 40]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} />
    </mesh>
  );
};

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uEngagement;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv - vec2(0.5);
    float dist = length(uv);
    float angle = atan(uv.y, uv.x);
    
    if (dist > 0.49) {
      discard;
    }

    // Swirling multi-layered waves representing the Stargate event horizon
    float speedMultiplier = 4.5 + uEngagement * 4.0;
    float w1 = sin(dist * 28.0 - uTime * speedMultiplier + angle) * 0.5 + 0.5;
    float w2 = cos(dist * 15.0 - uTime * (2.5 + uEngagement * 3.0) - angle * 2.5) * 0.5 + 0.5;
    float w3 = sin(dist * 40.0 + uTime * 1.5 + angle * 3.0) * 0.5 + 0.5;
    
    // Wave combinatorics
    float rip = mix(w1, w2, 0.4) + w3 * 0.2;
    
    // Edge blend
    float alpha = smoothstep(0.49, 0.35, dist);
    
    // Glowing color highlights
    vec3 highlightColor = mix(uColor, vec3(1.0, 1.0, 1.0), 0.4 + 0.3 * uEngagement);
    vec3 deepColor = uColor * (0.2 + 0.1 * uEngagement);
    
    vec3 col = mix(deepColor, highlightColor, rip);
    
    // Pulse central core and overall brightness
    float center = smoothstep(0.25, 0.0, dist);
    col += vec3(1.0) * center * (0.4 + sin(uTime * 10.0) * 0.2) * (0.2 + uEngagement * 0.8);
    
    // Add energetic crackling spark flashes when highly engaged
    float spark = sin(angle * 16.0 + uTime * 20.0) * cos(dist * 25.0 - uTime * 14.0);
    col += vec3(1.0) * max(0.0, spark) * 0.5 * uEngagement;
    
    gl_FragColor = vec4(col, alpha * (0.85 + uEngagement * 0.15));
  }
`;

const vortexVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const vortexFragmentShader = `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uEngagement;
  varying vec2 vUv;

  void main() {
    // Coordinate along the length of the tunnel
    float depthCoord = vUv.y; // 0 (near) to 1 (far / apex)
    
    // Spiral angle coordinate (swirling band count)
    float angle = vUv.x * 6.28318 * 3.0;
    
    // Swirling spiral lines representing high-speed stargate wormhole interior
    float spiral = sin(vUv.y * 22.0 - uTime * 7.0 + angle) * 0.5 + 0.5;
    float microWaves = cos(vUv.y * 50.0 + uTime * 12.0 - angle * 2.0) * 0.5 + 0.5;
    
    // Dynamic combined noise pattern
    float pattern = mix(spiral, microWaves, 0.25);
    
    // Smooth transition from the entrance ring to deep inside black portal center
    float entryGlow = smoothstep(0.0, 0.3, depthCoord) * smoothstep(1.0, 0.6, depthCoord);
    
    // Pulse based on player engagement
    float pulse = 0.2 + 0.8 * uEngagement;
    
    vec3 tunnelBase = uColor * 0.3;
    vec3 energeticCyan = mix(uColor, vec3(1.0), 0.6) * pattern * 2.0;
    vec3 col = mix(tunnelBase, energeticCyan, pattern) * entryGlow * pulse;
    
    // Apex core glow inside the deep wormhole center
    float apexGlow = pow(depthCoord, 5.0) * (0.4 + sin(uTime * 15.0) * 0.2);
    col += vec3(1.0) * apexGlow * uEngagement;
    
    gl_FragColor = vec4(col, entryGlow * (0.6 + uEngagement * 0.4));
  }
`;

const WebGPURing = ({ index, color, gateEngagementRef }: { index: number, color: string, gateEngagementRef: React.RefObject<number> }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const engagement = gateEngagementRef.current || 0;
    if (meshRef.current) {
      meshRef.current.rotation.z = (index % 2 === 0 ? 1 : -1) * t * (0.8 + index * 0.4 + engagement * 2.0);
      const pulse = 1.0 + Math.sin(t * 3.0 + index) * 0.03 * (1.0 + engagement * 2.0);
      meshRef.current.scale.set(pulse, pulse, 1);
    }
  });

  return (
    <mesh ref={meshRef}>
      <ringGeometry args={[0.1 + index * 0.4, 0.4 + index * 0.4, 32]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.15 + (gateEngagementRef.current || 0) * 0.3}
        wireframe={index % 2 === 1}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
};

const WebGPUVortexTunnel = ({ color, gateEngagementRef }: { color: string, gateEngagementRef: React.RefObject<number> }) => {
  const tunnelRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const engagement = gateEngagementRef.current || 0;
    if (tunnelRef.current) {
      tunnelRef.current.rotation.z = -t * (0.5 + engagement * 2.0);
    }
  });

  return (
    <group ref={tunnelRef} position={[0, 1.5, -0.6]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <cylinderGeometry args={[0.05, 1.45, 1.2, 16, 8, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.1 + (gateEngagementRef.current || 0) * 0.4}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh scale={0.98}>
        <cylinderGeometry args={[0.08, 1.42, 1.18, 16, 8, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.05 + (gateEngagementRef.current || 0) * 0.3}
          wireframe
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
};

const EventHorizon = ({ color, gateEngagementRef }: { color: string, gateEngagementRef: React.RefObject<number> }) => {
  const uniforms = useRef({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color() },
    uEngagement: { value: 0 }
  });

  React.useEffect(() => {
    uniforms.current.uColor.value.set(color);
  }, [color]);

  useFrame((state) => {
    uniforms.current.uTime.value = state.clock.getElapsedTime();
    uniforms.current.uEngagement.value = gateEngagementRef.current || 0;
  });

  if (isWebGPURendererActive()) {
    return (
      <group position={[0, 1.5, 0.03]}>
        <mesh>
          <circleGeometry args={[1.48, 64]} />
          <meshBasicMaterial
            color="#020617"
            depthWrite={false}
          />
        </mesh>
        <mesh scale={0.98}>
          <circleGeometry args={[1.48, 64]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.3 + (gateEngagementRef.current || 0) * 0.5}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <group>
          {Array.from({ length: 3 }).map((_, i) => (
            <WebGPURing key={i} index={i} color={color} gateEngagementRef={gateEngagementRef} />
          ))}
        </group>
      </group>
    );
  }

  return (
    <mesh position={[0, 1.5, 0.03]}>
      <circleGeometry args={[1.5, 64]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms.current}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
};

const VortexTunnel = ({ color, gateEngagementRef }: { color: string, gateEngagementRef: React.RefObject<number> }) => {
  const uniforms = useRef({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color() },
    uEngagement: { value: 0 }
  });

  React.useEffect(() => {
    uniforms.current.uColor.value.set(color);
  }, [color]);

  useFrame((state) => {
    uniforms.current.uTime.value = state.clock.getElapsedTime();
    uniforms.current.uEngagement.value = gateEngagementRef.current || 0;
  });

  if (isWebGPURendererActive()) {
    return (
      <WebGPUVortexTunnel color={color} gateEngagementRef={gateEngagementRef} />
    );
  }

  return (
    <mesh position={[0, 1.5, -0.6]} rotation={[-Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.05, 1.45, 1.2, 32, 16, true]} />
      <shaderMaterial
        vertexShader={vortexVertexShader}
        fragmentShader={vortexFragmentShader}
        uniforms={uniforms.current}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
};

const StargateParticles = ({ color, gateEngagementRef }: { color: string, gateEngagementRef: React.RefObject<number> }) => {
  const count = 15;
  const particlesRef = useRef<THREE.Group>(null);
  
  const particles = React.useMemo(() => {
    return Array.from({ length: count }).map(() => ({
      x: (Math.random() - 0.5) * 2.0,
      y: (Math.random() - 0.5) * 2.0 + 1.5,
      z: (Math.random() - 0.5) * 1.0,
      speed: 0.2 + Math.random() * 0.4,
      scale: 0.02 + Math.random() * 0.04,
      offset: Math.random() * 100
    }));
  }, []);

  useFrame((state, delta) => {
    if (!particlesRef.current) return;
    const t = state.clock.getElapsedTime();
    const engagement = gateEngagementRef.current || 0;
    particlesRef.current.children.forEach((child, i) => {
      const p = particles[i];
      // Float forward along local Z axis - speed increases with engagement
      const speed = p.speed * (1.0 + engagement * 2.5);
      let nextZ = child.position.z + delta * speed;
      if (nextZ > 2.0) {
        nextZ = -0.5; // Loop back
      }
      child.position.z = nextZ;
      
      // Wander slightly
      child.position.x = p.x + Math.sin(t * 1.5 + p.offset) * 0.15;
      child.position.y = p.y + Math.cos(t * 1.2 + p.offset) * 0.15;
      
      // Pulsing scale
      const pulse = 0.5 + Math.sin(t * 2.5 + p.offset) * 0.5;
      child.scale.setScalar(p.scale * pulse * (1.0 + engagement * 1.5));
    });
  });

  return (
    <group ref={particlesRef}>
      {particles.map((p, idx) => (
        <mesh key={idx} position={[p.x, p.y, p.z]}>
          <boxGeometry />
          <meshBasicMaterial color={color} transparent opacity={0.6} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
};

const Chevron = ({ angle, color, index, gateEngagementRef }: { angle: number, color: string, index: number, gateEngagementRef: React.RefObject<number> }) => {
  const x = Math.cos(angle) * 1.58;
  const y = Math.sin(angle) * 1.58 + 1.5; // aligned to center [0, 1.5, 0]
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state) => {
    if (!materialRef.current) return;
    const engagement = gateEngagementRef.current || 0;
    const t = state.clock.getElapsedTime();
    
    // Map index to fraction to sequence chevron lock order (total 9 chevrons)
    const threshold = index / 9.0;
    const isLocked = engagement > threshold;

    if (isLocked) {
      // Chevron locked & blazing
      const pulse = 6.0 + Math.sin(t * 15.0 + index * 2.0) * 3.5;
      materialRef.current.emissiveIntensity = pulse;
    } else {
      // Idle pulse state
      const pulse = 1.0 + Math.sin(t * 2.0 + index * 0.7) * 0.3;
      materialRef.current.emissiveIntensity = pulse;
    }
  });

  return (
    <group position={[x, y, 0]} rotation={[0, 0, angle]}>
      {/* Metallic bracket/mount */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.2, 0.25, 0.15]} />
        <meshStandardMaterial color="#334155" roughness={0.2} metalness={0.8} />
      </mesh>
      {/* Inner glowing core of the chevron */}
      <mesh position={[0, -0.06, 0.06]}>
        <boxGeometry args={[0.08, 0.12, 0.06]} />
        <meshStandardMaterial 
          ref={materialRef}
          color={color} 
          emissive={color} 
          emissiveIntensity={2.0} 
          toneMapped={false} 
        />
      </mesh>
      
      {/* Outer framing teeth pointing inward */}
      <mesh position={[-0.12, -0.05, 0]}>
        <boxGeometry args={[0.04, 0.18, 0.14]} />
        <meshStandardMaterial color="#1e293b" roughness={0.3} metalness={0.9} />
      </mesh>
      <mesh position={[0.12, -0.05, 0]}>
        <boxGeometry args={[0.04, 0.18, 0.14]} />
        <meshStandardMaterial color="#1e293b" roughness={0.3} metalness={0.9} />
      </mesh>
    </group>
  );
};

const Portal = ({ position, rotation, roomId, color, name }: { position: [number, number, number], rotation?: [number, number, number], roomId: string, color: string, name: string }) => {
  const glyphTrackRef = useRef<THREE.Group>(null);
  const gateEngagementRef = useRef<number>(0);
  const lightRef = useRef<THREE.PointLight>(null);
  
  useFrame((state, delta) => {
    // 1. Calculate proximity to camera to trigger active "docking" sequences
    const gatePos = new THREE.Vector3(position[0], position[1], position[2]);
    const cameraPos = state.camera.position;
    const distanceVal = cameraPos.distanceTo(gatePos);

    // Smoothly scale engagement index from 0.0 (farther than 10m) to 1.0 (approaching 2.5m)
    const engagement = Math.max(0, Math.min(1, (10.0 - distanceVal) / 7.5));
    gateEngagementRef.current = engagement;

    // 2. Drive the physical spin speed of the stargate dial ring matching proximity engagement
    if (glyphTrackRef.current) {
      const targetSpeed = 0.12 + engagement * 1.6;
      glyphTrackRef.current.rotation.z -= delta * targetSpeed;
    }

    // 3. Drive Portal Point Light intensity
    if (lightRef.current) {
      lightRef.current.intensity = 2.0 + engagement * 5.5;
    }
  });

  // Calculate chevron coordinates
  const chevronAngles = useMemo(() => {
    return Array.from({ length: 9 }).map((_, i) => (i * Math.PI * 2) / 9 + Math.PI / 2);
  }, []);

  // Calculate inner glyph angles for the spinning lock wheel
  const glyphsCount = 24;
  const glyphAngles = useMemo(() => {
    return Array.from({ length: glyphsCount }).map((_, i) => (i * Math.PI * 2) / glyphsCount);
  }, []);

  return (
    <group position={position} rotation={rotation || [0, 0, 0]}>
      <RigidBody
        type="fixed"
        colliders={false}
        onIntersectionEnter={(payload) => {
          if (payload.other.rigidBodyObject?.userData?.isLocal) {
            const now = Date.now();
            const lastTransition = (window as any).lastRoomTransitionTime || 0;
            if (now - lastTransition < 4000) {
              console.log("[Portal] Ignored triggering due to 4s safety threshold.");
              return;
            }
            (window as any).lastRoomTransitionTime = now;

            // Trigger warp audio sweep
            soundManager.playWarpEntering();

            // Set state to trigger full screen immersive stargate tunnel
            useStore.getState().setPortalWarping({ active: true, targetRoom: roomId, color: color });

            // Travel inside stargate tunnel for 1.2 seconds, then execute room reload
            setTimeout(() => {
              if (useStore.getState().currentRoom === 'arena') {
                useGameStore.getState().leaveGame();
              }
              syncService.changeRoom(roomId);

              // 300ms cushion as remote entities settle
              setTimeout(() => {
                soundManager.playWarpExiting();
                // Signal fading exit
                useStore.getState().setPortalWarping({ active: false, targetRoom: roomId, color: color });
                
                // Allow CSS transition to complete
                setTimeout(() => {
                  useStore.getState().setPortalWarping(null);
                }, 800);
              }, 300);
            }, 1200);
          }
        }}
      >
        <CuboidCollider args={[1.5, 2.0, 0.5]} sensor position={[0, 1.5, 0]} />
        {/* Outer Steel Ring */}
        <mesh position={[0, 1.5, 0]}>
          <torusGeometry args={[1.5, 0.08, 16, 100]} />
          <meshStandardMaterial color="#475569" roughness={0.3} metalness={0.8} />
        </mesh>

        {/* Concentric Dark Iron Ring */}
        <mesh position={[0, 1.5, -0.01]} scale={0.96}>
          <torusGeometry args={[1.5, 0.03, 16, 100]} />
          <meshStandardMaterial color="#1e293b" roughness={0.5} metalness={0.9} />
        </mesh>

        {/* Rotating Glyph Track Ring */}
        <group ref={glyphTrackRef} position={[0, 1.5, 0.02]}>
          <mesh>
            <torusGeometry args={[1.4, 0.02, 8, 80]} />
            <meshStandardMaterial color="#0f172a" roughness={0.6} metalness={0.9} />
          </mesh>
          {glyphAngles.map((angle, idx) => (
            <mesh 
              key={idx} 
              position={[Math.cos(angle) * 1.4, Math.sin(angle) * 1.4, 0.01]} 
              rotation={[0, 0, angle + Math.PI / 2]}
            >
              <boxGeometry args={[0.03, 0.08, 0.02]} />
              <meshStandardMaterial color="#64748b" roughness={0.4} metalness={0.7} />
            </mesh>
          ))}
        </group>

        {/* Deep 3D Wormhole Tunnel behind the gate */}
        <VortexTunnel color={color} gateEngagementRef={gateEngagementRef} />

        {/* Event Horizon */}
        <EventHorizon color={color} gateEngagementRef={gateEngagementRef} />

        {/* Chevrons around the Stargate */}
        {chevronAngles.map((angle, idx) => (
          <Chevron key={idx} angle={angle} color={color} index={idx} gateEngagementRef={gateEngagementRef} />
        ))}

        {/* Ambient Portal Particles */}
        <StargateParticles color={color} gateEngagementRef={gateEngagementRef} />

        {/* Stargate Text Plate */}
        <Html 
          position={[0, 3.4, 0]} 
          center 
          distanceFactor={15} 
          pointerEvents="none"
          zIndexRange={[100, 0]}
        >
          <div 
            style={{ 
              borderColor: color,
              textShadow: `0 0 8px ${color}, 0 0 15px ${color}80`,
              boxShadow: `0 0 10px ${color}40, inset 0 0 8px ${color}20`,
            }}
            className="px-4 py-1.5 border bg-slate-950/95 text-white font-sans text-[11px] font-bold tracking-widest uppercase whitespace-nowrap rounded-md flex items-center gap-2 border-opacity-80"
          >
            <span className="w-1.5 h-1.5 rounded-full animate-ping" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
            {name}
          </div>
        </Html>
        
        {/* Portal Light */}
        <pointLight ref={lightRef} position={[0, 1.5, 0.2]} color={color} intensity={2.5} distance={6} />
      </RigidBody>
    </group>
  );
};


const CameraController = () => {
  const localUserPosition = useStore(state => state.localUserPosition);
  const currentRoom = useStore(state => state.currentRoom);
  const isFirstPerson = useStore(state => state.isFirstPerson);
  const isSettingsOpen = useStore(state => state.isSettingsOpen);
  const isRadialMenuOpen = useStore(state => state.isRadialMenuOpen);
  const setIsSettingsOpen = useStore(state => state.setIsSettingsOpen);
  const controlsRef = useRef<any>(null);
  const isPresenting = useXR((state) => state.session !== undefined);
  const lastRoom = useRef(currentRoom);

  React.useEffect(() => {
    const handlePointerLockChange = () => {
      const state = useStore.getState();
      if (isFirstPerson && document.pointerLockElement === null && !state.isRadialMenuOpen && !state.isSettingsOpen) {
        setIsSettingsOpen(true);
      }
    };
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
    };
  }, [isFirstPerson, setIsSettingsOpen]);

  useFrame((state, delta) => {
    if (currentRoom === 'arena') return; // Arena uses Player's own camera logic

    if (isPresenting) return;

    if (isFirstPerson) {
      // In first-person mode, position camera at eye level (y + 1.55) of local player
      state.camera.position.set(localUserPosition[0], localUserPosition[1] + 1.55, localUserPosition[2]);
      
      // Let joystick look rotation also work in non-arena rooms when in first person
      const mobileInput = useGameStore.getState().mobileInput;
      if (mobileInput && (Math.abs(mobileInput.look.x) > 0.01 || Math.abs(mobileInput.look.y) > 0.01)) {
        const lookSpeed = 2.0 * delta;
        state.camera.rotation.y -= mobileInput.look.x * lookSpeed;
        state.camera.rotation.x -= mobileInput.look.y * lookSpeed;
        state.camera.rotation.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, state.camera.rotation.x));
      }
    } else {
      if (controlsRef.current) {
        const target = new THREE.Vector3(localUserPosition[0], localUserPosition[1] + 1.1, localUserPosition[2]);
        
        // Handle room change: quickly snap camera and target to the player's new position
        if (lastRoom.current !== currentRoom) {
          lastRoom.current = currentRoom;
          controlsRef.current.target.copy(target);
          state.camera.position.set(target.x, target.y + 3, target.z + 5);
          controlsRef.current.update();
          return;
        }

        // Calculate the delta between current target and new target
        const targetDelta = new THREE.Vector3().subVectors(target, controlsRef.current.target);
        
        // Move the camera by the same delta so it follows the user
        state.camera.position.add(targetDelta);
        
        // Update the target
        controlsRef.current.target.copy(target);
        controlsRef.current.update();
      }
    }
  });

  if (isPresenting || currentRoom === 'arena') return null;

  if (isFirstPerson && !isSettingsOpen && !isRadialMenuOpen) {
    return <PointerLockControls makeDefault pointerSpeed={useStore.getState().mouseSensitivity} />;
  }

  return <OrbitControls ref={controlsRef} makeDefault maxPolarAngle={Math.PI / 1.5} enablePan={false} />;
};

const sharedBoxGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
const sharedSphereGeometry = new THREE.SphereGeometry(0.5, 32, 32);
const sharedBoxMaterial = new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0.1 });

const PhysicsPropItem = React.memo(({ prop }: { prop: any }) => {
  const material = useMemo(() => {
    const mat = sharedBoxMaterial.clone();
    mat.color.set(prop.color);
    return mat;
  }, [prop.color]);

  useEffect(() => {
    return () => {
      idleTaskQueue.enqueue(() => {
        material.dispose();
      });
    };
  }, [material]);

  const isSphere = prop.type === 'sphere';

  return (
    <RigidBody position={prop.position} colliders={isSphere ? "ball" : "cuboid"} mass={1} collisionGroups={interactionGroups(0, [0, 1, 2])}>
      <mesh castShadow receiveShadow geometry={isSphere ? sharedSphereGeometry : sharedBoxGeometry} material={material} />
    </RigidBody>
  );
});

const PhysicsProps = React.memo(() => {
  const props = useStore(state => state.physicsProps);

  return (
    <>
      {props.map((prop) => (
        <PhysicsPropItem key={prop.id} prop={prop} />
      ))}
    </>
  );
});

const DynamicEnvironment = ({ currentRoom, lightingEffect }: { currentRoom: string, lightingEffect: string }) => {
  const dirLightRef = useRef<THREE.DirectionalLight>(null);
  const ambientLightRef = useRef<THREE.AmbientLight>(null);

  useFrame((state) => {
    if (lightingEffect === 'neon' || currentRoom === 'club') {
       if (dirLightRef.current) {
         dirLightRef.current.intensity = 0; // Pitch black except for spotlights
       }
       if (ambientLightRef.current) {
         ambientLightRef.current.intensity = 0.1;
       }
       return;
    }

    if (lightingEffect === 'studio' || currentRoom === 'arena') {
       if (dirLightRef.current) {
         dirLightRef.current.intensity = 2.5; 
         dirLightRef.current.position.set(0, 20, 0);
         dirLightRef.current.color = new THREE.Color("#ffffff");
       }
       if (ambientLightRef.current) {
         ambientLightRef.current.intensity = 1.0;
       }
       return;
    }

    if (lightingEffect === 'night') {
       if (dirLightRef.current) {
         dirLightRef.current.intensity = 0.2; 
         dirLightRef.current.position.set(2, 5, 2);
         dirLightRef.current.color = new THREE.Color("#a855f7");
       }
       if (ambientLightRef.current) {
         ambientLightRef.current.intensity = 0.2;
       }
       return;
    }

    if (lightingEffect === 'dusk') {
       if (dirLightRef.current) {
         dirLightRef.current.intensity = 1.0; 
         dirLightRef.current.position.set(5, 2, 5);
         dirLightRef.current.color = new THREE.Color("#fdba74");
       }
       if (ambientLightRef.current) {
         ambientLightRef.current.intensity = 0.5;
       }
       return;
    }

    // Default 'standard' environment logic (Day/Night cycle)
    const t = state.clock.elapsedTime;
    const dayCycle = (t * 0.05) % (Math.PI * 2); // Full cycle every ~125 seconds

    const sunY = Math.sin(dayCycle) * 10;
    const sunZ = Math.cos(dayCycle) * 10;

    if (dirLightRef.current) {
      dirLightRef.current.position.set(5, sunY, sunZ);
      
      // Intensity peaks at noon
      const intensity = Math.max(0.1, Math.sin(dayCycle)) * 2.5;
      dirLightRef.current.intensity = intensity;

      // Color shift
      const color = new THREE.Color();
      if (Math.sin(dayCycle) > 0) {
        // Day: Orange morning -> White noon -> Orange evening
        color.lerpColors(new THREE.Color("#fdba74"), new THREE.Color("#ffffff"), Math.sin(dayCycle));
      } else {
        // Night: Purple/Blue
        color.lerpColors(new THREE.Color("#a855f7"), new THREE.Color("#1e1b4b"), -Math.sin(dayCycle));
      }
      dirLightRef.current.color = color;
    }

    if (ambientLightRef.current) {
      ambientLightRef.current.intensity = Math.max(0.2, Math.sin(dayCycle) * 0.5 + 0.3);
    }
  });

  return (
    <>
      <ambientLight ref={ambientLightRef} intensity={0.5} />
      <directionalLight 
        ref={dirLightRef} 
        position={[2, 5, 2]} 
        intensity={1.5} 
        color="#a855f7" 
        castShadow 
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      {(lightingEffect === 'neon' || currentRoom === 'club') && (
        <>
          <spotLight position={[5, 10, 5]} intensity={50} distance={20} angle={0.4} penumbra={0.5} castShadow color="#ff00ff" />
          <spotLight position={[-5, 10, -5]} intensity={50} distance={20} angle={0.4} penumbra={0.5} castShadow color="#00ffff" />
          <spotLight position={[0, 15, 0]} intensity={100} distance={25} angle={0.8} penumbra={1} castShadow color="#a855f7" />
        </>
      )}
      {(lightingEffect !== 'neon' && currentRoom !== 'club') && (
        <spotLight position={[0, 8, 0]} intensity={2} angle={0.6} penumbra={1} castShadow shadow-mapSize={[1024, 1024]} color="#60a5fa" />
      )}
    </>
  );
};

const ArenaGroup = () => {
  const enemies = useGameStore(state => state.enemies);
  const otherPlayerIds = useGameStore(
    useShallow(state => Object.keys(state.otherPlayers))
  );

  return (
    <>
      <GameLoop />
      <Arena />
      <Player />
      {enemies.map(enemy => (
        <Enemy key={enemy.id} data={enemy} />
      ))}
      {otherPlayerIds.map(id => (
        <OtherPlayer key={id} id={id} />
      ))}
      <Effects />
    </>
  );
};

export const Lounge: React.FC = () => {
  const localUserId = useStore(state => state.localUserId);
  const localVrmUrl = useStore(state => state.vrmUrl);
  const localSkybox = useStore(state => state.localSkybox);
  const graphicsQuality = useStore(state => state.graphicsQuality);
  const currentRoom = useStore(state => state.currentRoom);
  const floorColorSetting = useStore(state => state.floorColor);
  const backgroundColorSetting = useStore(state => state.backgroundColor);
  const lightingEffect = useStore(state => state.lightingEffect);
  const gravity = useStore(state => state.gravity);
  
  // Fog state
  const fogDensity = (currentRoom === 'club' || lightingEffect === 'neon') ? 0.04 : (currentRoom === 'garden' ? 0.025 : 0.015);
  const fogColor = backgroundColorSetting || (
    currentRoom === 'club' ? '#3b0764' : 
    currentRoom === 'arena' ? '#78350f' : 
    currentRoom === 'garden' ? '#011c0f' : '#0f172a'
  );

  
  // Only re-render Lounge when users join/leave or change avatars
  const remoteUsersString = useStore(
    state => Object.values(state.users)
      .filter(u => u.id !== state.localUserId)
      .map(u => `${u.id}|${u.vrmUrl}`).join(',')
  );
  
  const remoteUsers = React.useMemo(() => {
    if (!remoteUsersString) return [];
    return remoteUsersString.split(',').map(data => {
      const [id, vrmUrl] = data.split('|');
      return { id, vrmUrl: vrmUrl === 'null' ? null : vrmUrl };
    });
  }, [remoteUsersString]);

  React.useEffect(() => {
    console.log("Remote users:", remoteUsers);
  }, [remoteUsers]);

  // Guide Clones Synchronization & Automation Hooks
  const addGuideClone = useStore(state => state.addGuideClone);
  const guideClones = useStore(state => state.guideClones);
  const removeGuideClone = useStore(state => state.removeGuideClone);
  const localUserName = useStore(state => state.localUserName);
  const usersDict = useStore(state => state.users);

  const prevUsersRef = React.useRef<string[]>([]);
  const hasLoadedInitialSelfGuide = React.useRef(false);
  const isFirstRun = React.useRef(true);

  React.useEffect(() => {
    const currentRemoteIds = remoteUsers.map(u => u.id);
    
    if (isFirstRun.current) {
      isFirstRun.current = false;
      prevUsersRef.current = currentRemoteIds;
      
      // Case 1: If we freshly connect and other players are already in the session
      if (currentRemoteIds.length > 0 && !hasLoadedInitialSelfGuide.current) {
        hasLoadedInitialSelfGuide.current = true;
        const targetUser = remoteUsers[0];
        const targetName = usersDict[targetUser.id]?.name || "Architect";
        addGuideClone({
          id: THREE.MathUtils.generateUUID(),
          newUserId: localUserId,
          newUserName: localUserName || "You",
          targetUserId: targetUser.id,
          targetUserName: targetName,
        });
      }
      return;
    }

    // Case 2: If a remote player joins our current session
    currentRemoteIds.forEach(id => {
      if (!prevUsersRef.current.includes(id)) {
        const joinedUser = usersDict[id];
        if (joinedUser) {
          addGuideClone({
            id: THREE.MathUtils.generateUUID(),
            newUserId: id,
            newUserName: joinedUser.name || "New Friend",
            targetUserId: localUserId,
            targetUserName: localUserName || "Architect",
          });
        }
      }
    });

    prevUsersRef.current = currentRemoteIds;
  }, [remoteUsers, localUserId, localUserName, usersDict, addGuideClone]);

  const PortalsDisplay = () => {
    const language = useStore(state => state.language);
    if (currentRoom === 'main') {
      return (
        <group>
          <Portal position={[20, 0, 0]} rotation={[0, -Math.PI / 2, 0]} roomId="club" color="#ff00ff" name={getTranslation(language, 'neonClub')} />
          <Portal position={[-20, 0, 0]} rotation={[0, Math.PI / 2, 0]} roomId="arena" color="#ff4400" name={getTranslation(language, 'battleArena')} />
          <Portal position={[0, 0, 20]} rotation={[0, Math.PI, 0]} roomId="lounge" color="#00ff88" name={getTranslation(language, 'chillLounge')} />
          <Portal position={[0, 0, -20]} rotation={[0, 0, 0]} roomId="garden" color="#10b981" name="SYNTH GARDEN" />
        </group>
      );
    }
    
    if (currentRoom === 'arena') {
      return (
        <group>
          {/* Holographic Landing Pad indicator around spawnpoint [0, -0.48, 0] */}
          <mesh position={[0, -0.48, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.2, 1.4, 32]} />
            <meshBasicMaterial color="#00ffff" toneMapped={false} transparent opacity={0.65} />
          </mesh>
          <mesh position={[0, -0.48, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0, 0.2, 32]} />
            <meshBasicMaterial color="#00ffff" toneMapped={false} transparent opacity={0.65} />
          </mesh>
          {/* Flush with the arena floor at y = -0.5 */}
          <Portal position={[0, -0.5, -5]} rotation={[0, 0, 0]} roomId="main" color="#ef4444" name={getTranslation(language, 'exitToLobby')} />
        </group>
      );
    }
    
    // If not in main, display portal back to main
    return (
      <Portal position={[0, 0, 20]} rotation={[0, Math.PI, 0]} roomId="main" color="#cbd5e1" name={getTranslation(language, 'returnToMain')} />
    );
  };

  const getFloorColor = () => {
    // If user has customized it, maybe use it unless in specific room, or prefer custom always
    // Let's use custom if the user changed it from default, or just always use custom if they are in 'main'
    // Actually, setting floor color applies primarily to main lounge or can override
    if (floorColorSetting !== '#303030' || currentRoom === 'main') {
      return floorColorSetting;
    }
    switch (currentRoom) {
       case 'club': return "#111111"; // dark floor
       case 'arena': return "#d97706"; // sand-like
       case 'lounge': return "#334155";
       case 'garden': return "#03150c"; // deep botanical mossy floor
       default: return floorColorSetting;
     }
  };

  const getDpr = (): [number, number] => {
    switch (graphicsQuality) {
      case 'low': return [0.5, 1];
      case 'medium': return [1, 1.5];
      case 'high': return [1, 2];
      default: return [1, 1.5];
    }
  };

  return (
    <div className="w-full h-full bg-zinc-950 relative" style={{ backgroundColor: backgroundColorSetting }}>

      <Canvas 
        camera={{ position: [0, 1.2, 2.0], fov: 45 }} 
        dpr={getDpr()} 
        shadows={graphicsQuality !== 'low'}
        gl={createWebGPURenderer}
      >
        <WebGPUSceneSanitizer />
        <color attach="background" args={[backgroundColorSetting]} />
        <fogExp2 attach="fog" args={[fogColor, fogDensity]} />
        <XR store={xrStore}>
          <DynamicEnvironment currentRoom={currentRoom} lightingEffect={lightingEffect} />
        
        <Suspense fallback={null}>
          <Physics gravity={gravity}>
            {/* 
              This is the magic sauce: @react-three/drei's Environment component.
              It uses Image-Based Lighting (IBL) to generate highly realistic 
              reflections and GI (Global Illumination) without expensive raytracing.
              "preset='night'" simulates a darker, more dramatic lighting setup. 
            */}
            {localSkybox ? (
              <CustomSkybox url={localSkybox} />
            ) : (
              <>
                <Environment 
                  preset={
                    currentRoom === 'garden' 
                      ? 'forest' 
                      : (currentRoom === 'club' || lightingEffect === 'neon' || lightingEffect === 'night') 
                        ? 'night' 
                        : 'city'
                  } 
                  blur={currentRoom === 'garden' ? 0.35 : 0.6} 
                  background={currentRoom === 'garden' || (currentRoom !== 'club' && lightingEffect !== 'neon')} 
                />
                {currentRoom !== 'club' && lightingEffect !== 'neon' && currentRoom !== 'garden' && (
                  <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
                )}
              </>
            )}

            {/* Props, grids and floors should not render in Arena to avoid collision with Arena objects. */}
            {currentRoom !== 'arena' && (
              <>
                <RigidBody type="fixed" position={[0, -0.01, 0]} friction={1} collisionGroups={interactionGroups(0, [0, 1, 2])}>
                  <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                    <planeGeometry args={[200, 200]} />
                    <meshStandardMaterial color={getFloorColor()} roughness={(currentRoom === 'club' || lightingEffect === 'neon') ? 0.05 : 0.4} metalness={(currentRoom === 'club' || lightingEffect === 'neon') ? 0.9 : 0.1} />
                  </mesh>
                </RigidBody>

                {isWebGPURendererActive() ? (
                  <>
                    {/* Primary Purple Section Grid */}
                    <gridHelper args={[300, 50, '#a855f7', '#a855f7']} position={[0, 0.015, 0]} />
                    {/* Subdivisions Indigo Grid */}
                    <gridHelper args={[300, 150, '#6366f1', '#6366f1']} position={[0, 0.01, 0]} />
                  </>
                ) : (
                  <Grid 
                    infiniteGrid 
                    fadeDistance={150} 
                    fadeStrength={1.5} 
                    cellColor="#6366f1" 
                    sectionColor="#a855f7" 
                    sectionThickness={1.5} 
                  />
                )}
                
                <PhysicsProps />
              </>
            )}
            
            {/* Portals */}
            <PortalsDisplay />

            {/* Raised Lounge Balcony */}
            {currentRoom === 'main' && <LoungeBalcony />}

            {/* Boss Preview in Main Room Removed */}

            {/* Local User */}
            {localVrmUrl && currentRoom !== 'arena' && (
              <Avatar url={localVrmUrl} isLocal={true} userId={localUserId} />
            )}

            {/* In Arena: First Person shooter */}
            {currentRoom === 'arena' && <ArenaGroup />}

            {/* Autonomous NPC (Available in all rooms if solo companion experience is active) */}
            {(currentRoom === 'main' || remoteUsers.length === 0) && <GemmaNPC />}

            {/* Sequencer (Neon Club) */}
            {currentRoom === 'club' && <Sequencer3D position={[0, 0, -5]} />}

            {/* Synth Garden */}
            {currentRoom === 'garden' && <SynthGarden />}

            {/* Remote Users (Social Lounge) */}
            {currentRoom !== 'arena' && remoteUsers.map(user => (
              <Avatar 
                key={user.id} 
                url={user.vrmUrl || DEFAULT_VRM_URL} 
                isLocal={false} 
                userId={user.id} 
              />
            ))}

            {/* Gemma Companion Assistant Guide Clones */}
            {currentRoom !== 'arena' && guideClones.map(clone => (
              <GemmaGuideClone
                key={clone.id}
                id={clone.id}
                newUserId={clone.newUserId}
                newUserName={clone.newUserName}
                targetUserId={clone.targetUserId}
                targetUserName={clone.targetUserName}
                onDestroy={() => removeGuideClone(clone.id)}
              />
            ))}

            {/* Crystals */}
            {currentRoom !== 'arena' && <Crystals />}
          </Physics>
          
          {/* Post Processing Temporarily Disabled */}
        </Suspense>

          <CameraController />
        </XR>
      </Canvas>
    </div>
  );
};
