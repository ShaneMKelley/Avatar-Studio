/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RigidBody, CapsuleCollider, CuboidCollider } from '@react-three/rapier';
import { Grid, Stars, useGLTF } from '@react-three/drei';
import { getProxyUrl } from '../utils/proxy';
import { SkeletonUtils } from 'three-stdlib';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { LeroyJenkinsRoom } from './LeroyJenkinsRoom';
import { ArenaWeather } from './ArenaWeather';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
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

// Seeded PRNG for consistent multiplayer obstacle generation
function mulberry32(a: number) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Quantum Obelisk Landmark - A major floating sci-fi structure at the center of the horizon
 */
function QuantumObelisk({ position }: { position: [number, number, number] }) {
  const groupRef = useRef<THREE.Group>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.position.y = position[1] + Math.sin(t * 1.5) * 0.4;
      groupRef.current.rotation.y = t * 0.4;
    }
    if (ring1Ref.current) {
      ring1Ref.current.rotation.x = t * 1.2;
      ring1Ref.current.rotation.y = t * 0.6;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.y = -t * 1.5;
      ring2Ref.current.rotation.z = t * 0.8;
    }
  });

  return (
    <group position={position}>
      {/* Hexagonal Base on the Floor */}
      <RigidBody type="fixed" colliders="hull">
        <mesh position={[0, 0.4, 0]}>
          <cylinderGeometry args={[4, 5, 0.8, 6]} />
          <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.8} />
        </mesh>
      </RigidBody>

      {/* Floating Obelisk Core */}
      <group ref={groupRef}>
        <mesh castShadow>
          <coneGeometry args={[1.5, 6, 4]} />
          <meshStandardMaterial color="#020617" roughness={0.1} metalness={0.9} emissive="#00f0ff" emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[0, -4, 0]} rotation={[Math.PI, 0, 0]} castShadow>
          <coneGeometry args={[1.5, 3, 4]} />
          <meshStandardMaterial color="#020617" roughness={0.1} metalness={0.9} emissive="#00f0ff" emissiveIntensity={0.5} />
        </mesh>
      </group>

      {/* Outer Rotating Cyber Halos */}
      <mesh ref={ring1Ref} position={[0, 0, 0]}>
        <torusGeometry args={[3.5, 0.05, 8, 32]} />
        <meshBasicMaterial color="#ff00ff" toneMapped={false} />
      </mesh>
      
      <mesh ref={ring2Ref} position={[0, 0, 0]}>
        <torusGeometry args={[4.2, 0.03, 8, 32]} />
        <meshBasicMaterial color="#00ffff" toneMapped={false} />
      </mesh>

      <pointLight position={[0, 0, 0]} color="#00ffff" intensity={8} distance={20} />
    </group>
  );
}

/**
 * Sector Reactors - Majestic glowing and rotating power generation hubs that light up the field
 */
function SectorReactor({ position, color }: { position: [number, number, number], color: string }) {
  const coreRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (coreRef.current) {
      coreRef.current.position.y = 1.3 + Math.sin(t * 2.0 + position[0]) * 0.25;
      coreRef.current.rotation.y = t * 1.5;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = -t * 0.8;
      ringRef.current.rotation.x = t * 0.4;
    }
  });

  return (
    <group position={position}>
      {/* Heavy Hexagonal Base */}
      <RigidBody type="fixed" colliders="hull">
        <mesh position={[0, 0.4, 0]}>
          <cylinderGeometry args={[2.5, 3.0, 0.8, 6]} />
          <meshStandardMaterial color="#0b0f19" roughness={0.4} metalness={0.8} />
        </mesh>
        
        {/* Secondary Upper Metal Tier */}
        <mesh position={[0, 1.0, 0]}>
          <cylinderGeometry args={[2.0, 2.2, 0.4, 6]} />
          <meshStandardMaterial color="#1a2035" roughness={0.3} metalness={0.7} />
        </mesh>
      </RigidBody>

      {/* Floating Hovering Core */}
      <mesh ref={coreRef} position={[0, 1.3, 0]} castShadow>
        <octahedronGeometry args={[1.0, 0]} />
        <meshStandardMaterial color="#020617" roughness={0.1} metalness={0.9} emissive={color} emissiveIntensity={1.8} toneMapped={false} />
      </mesh>

      {/* Orbital Shield Ring */}
      <group ref={ringRef} position={[0, 1.3, 0]}>
        <mesh>
          <torusGeometry args={[2.2, 0.08, 16, 48]} />
          <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.8} />
        </mesh>
      </group>

      {/* Point Light to cast colorful shadow/glow around core */}
      <pointLight position={[0, 1.3, 0]} color={color} intensity={5} distance={15} />
    </group>
  );
}

/**
 * Decorative Runic Jump Pad Indicators
 */
function JumpPadGraphic({ position, color = "#ff00aa" }: { position: [number, number, number], color?: string }) {
  const lineRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (lineRef.current) {
      const scale = 1.0 + Math.sin(t * 5) * 0.1;
      lineRef.current.scale.set(scale, 1, scale);
    }
  });

  return (
    <group position={position}>
      {/* Floor ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[1.2, 1.4, 32]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.8} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[0, 0.8, 4]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.2} />
      </mesh>

      {/* Pulsing Core Beacon */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>

      {/* Volumetric vertical cylinder */}
      <mesh position={[0, 7.5, 0]} ref={lineRef}>
        <cylinderGeometry args={[0.9, 0.9, 15, 16, 1, true]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.06} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function Arena() {
  const isMobile = useIsMobile();
  
  const obstacles = useMemo(() => {
    const list: Array<{
      type: 'car' | 'barricade' | 'shield';
      position: [number, number, number];
      rotation: [number, number, number];
      color: string;
    }> = [];

    // Seed local mulberry generator
    const rngLocal = mulberry32(777);
    const count = isMobile ? 30 : 65; // Optimized count for smooth frame rates in arena
    
    // Generate tactical pillars/barriers on the field, keeping central spawn (radius 20m) completely clear
    for (let i = 0; i < count; i++) {
      const angle = rngLocal() * Math.PI * 2;
      const radius = 22 + rngLocal() * 65; // Spawn between 22m and 87m
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      const rotY = rngLocal() * Math.PI * 2;
      const color = rngLocal() > 0.5 ? "#00ffff" : "#ff00ff";

      // Select random model type
      const randTypeIdx = rngLocal();
      const type = randTypeIdx < 0.33 ? 'car' : (randTypeIdx < 0.66 ? 'shield' : 'barricade');

      list.push({
        type,
        position: [x, 0, z], // sitting directly on the ground plane (y=0)
        rotation: [0, rotY, 0],
        color,
      });
    }

    // Add structured tactical bunker cover zones around the spawn arena center [0,0,0]
    list.push({ type: 'shield', position: [14, 0, 14], rotation: [0, Math.PI / 4, 0], color: '#ff00ff' });
    list.push({ type: 'shield', position: [-14, 0, 14], rotation: [0, -Math.PI / 4, 0], color: '#00ffff' });
    list.push({ type: 'shield', position: [14, 0, -14], rotation: [0, -Math.PI / 4, 0], color: '#00ffff' });
    list.push({ type: 'shield', position: [-14, 0, -14], rotation: [0, Math.PI / 4, 0], color: '#ff00ff' });

    // Straight blocking walls close to center zones (dynamic cover types!)
    list.push({ type: 'car', position: [0, 0, 18], rotation: [0, 0, 0], color: '#ff00ff' });
    list.push({ type: 'barricade', position: [18, 0, 0], rotation: [0, Math.PI / 2, 0], color: '#00ffff' });
    list.push({ type: 'barricade', position: [-18, 0, 0], rotation: [0, Math.PI / 2, 0], color: '#ff00ff' });

    return list;
  }, [isMobile]);

  return (
    <group>
      {/* High-Performance Cybernetic Light Rig */}
      <ambientLight intensity={1.8} color="#1e223a" />
      <hemisphereLight color="#00f5ff" groundColor="#3a0c5c" intensity={2.5} />
      <directionalLight 
        position={[30, 45, 20]} 
        intensity={3.8} 
        color="#ffffff" 
        castShadow={!isMobile}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
        shadow-camera-near={0.5}
        shadow-camera-far={200}
      />
      <directionalLight position={[-30, 25, -20]} intensity={2.0} color="#ff00a0" />

      {/* Floor */}
      <RigidBody type="fixed" name="floor" friction={0}>
        <mesh receiveShadow={!isMobile} position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial color="#0c1224" roughness={0.35} metalness={0.7} />
        </mesh>
      </RigidBody>
      <Grid position={[0, -0.49, 0]} args={[200, 200]} cellColor="#ff00a0" sectionColor="#00f3ff" fadeDistance={120} cellThickness={0.5} sectionThickness={1.5} />

      {/* Ceiling */}
      <RigidBody type="fixed" name="ceiling">
        <mesh receiveShadow={!isMobile} position={[0, 25, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial color="#010103" roughness={1} />
        </mesh>
      </RigidBody>

      {/* Atmosphere */}
      <ArenaWeather />
      {!isMobile && (
        <>
          <Stars radius={120} depth={60} count={6000} factor={5} saturation={1} fade speed={1.2} />
          <AmbientParticles />
        </>
      )}

      {/* Custom Core landmarks */}
      <LeroyJenkinsRoom />
      <QuantumObelisk position={[0, 5, -50]} />

      <SectorReactor position={[45, 0, 45]} color="#00ffcc" />
      <SectorReactor position={[-45, 0, 45]} color="#ff00aa" />
      <SectorReactor position={[45, 0, -45]} color="#ffea00" />
      <SectorReactor position={[-45, 0, -45]} color="#9d00ff" />

      {/* Runically glowing Launchers/Jump-Pads */}
      <JumpPadGraphic position={[25, 0, 0]} color="#00ffff" />
      <JumpPadGraphic position={[-25, 0, 0]} color="#ff00ff" />
      <JumpPadGraphic position={[0, 0, 25]} color="#ff6600" />

      {/* Arena Perimeter Walls */}
      <Wall name="wall-n" position={[0, 7.5, -100]} rotation={[0, 0, 0]} isMobile={isMobile} />
      <Wall name="wall-s" position={[0, 7.5, 100]} rotation={[0, Math.PI, 0]} isMobile={isMobile} />
      <Wall name="wall-e" position={[100, 7.5, 0]} rotation={[0, -Math.PI / 2, 0]} isMobile={isMobile} />
      <Wall name="wall-w" position={[-100, 7.5, 0]} rotation={[0, Math.PI / 2, 0]} isMobile={isMobile} />

      {/* Custom Designed Barricades and obstacles */}
      {obstacles.map((obs, i) => {
        if (!obs) return null;
        return (
          <ArenaObstacle 
            key={i}
            index={i}
            type={obs.type}
            position={obs.position}
            rotation={obs.rotation}
            color={obs.color}
          />
        );
      })}
    </group>
  );
}

function Wall({ name, position, rotation, isMobile }: { name: string, position: [number, number, number], rotation: [number, number, number], isMobile: boolean }) {
  return (
    <RigidBody type="fixed" name={name} position={position} rotation={rotation}>
      {/* Solid Wall */}
      <mesh>
        <boxGeometry args={[200, 15, 1]} />
        <meshStandardMaterial color="#080812" roughness={0.6} metalness={0.8} />
      </mesh>
      {/* High impact glowing line accents */}
      <mesh position={[0, -6.5, 0.51]}>
        <planeGeometry args={[200, 0.8]} />
        <meshBasicMaterial color="#ff00c8" toneMapped={false} />
      </mesh>
      <mesh position={[0, 6.5, 0.51]}>
        <planeGeometry args={[200, 0.8]} />
        <meshBasicMaterial color="#00ffd0" toneMapped={false} />
      </mesh>
    </RigidBody>
  );
}

function AmbientParticles() {
  const count = 600;
  const pointsRef = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const list = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      list[i * 3] = (Math.random() - 0.5) * 200;
      list[i * 3 + 1] = Math.random() * 45;
      list[i * 3 + 2] = (Math.random() - 0.5) * 200;
    }
    return list;
  }, []);

  useFrame((state, delta) => {
    if (pointsRef.current) {
      pointsRef.current.position.y += delta * 0.5;
      if (pointsRef.current.position.y > 15) {
        pointsRef.current.position.y = -15;
      }
      pointsRef.current.rotation.y += delta * 0.03;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#00ffff"
        size={0.18}
        transparent
        opacity={0.6}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

interface ObstacleProps {
  type: 'car' | 'barricade' | 'shield';
  position: [number, number, number];
  rotation: [number, number, number];
  color: string;
  index: number;
}

function ArenaObstacle({ type, position, rotation, color, index }: ObstacleProps) {
  const carGltf = useGLTF(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/brokenhollowcar.glb'));
  const barricadeGltf = useGLTF(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/boxbaricade.glb'));
  const shieldGltf = useGLTF(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/sheildbarrier.glb'));

  // Select appropriate scene
  const scene = useMemo(() => {
    switch (type) {
      case 'car': return carGltf.scene;
      case 'barricade': return barricadeGltf.scene;
      case 'shield': return shieldGltf.scene;
      default: return barricadeGltf.scene;
    }
  }, [type, carGltf, barricadeGltf, shieldGltf]);

  // Clone scene for multiple, independent instancing with custom properties
  const clone = useMemo(() => {
    const cloned = SkeletonUtils.clone(scene);
    
    // Compute collective absolute bounding box of the cloned asset
    cloned.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(cloned);
    const minY = box.min.y;
    
    // Offset local position upwards so the absolute bottom rests flush on y = 0
    cloned.position.y = -minY;

    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((mat) => {
            if (mat instanceof THREE.MeshStandardMaterial) {
              const lowerName = mat.name ? mat.name.toLowerCase() : '';
              
              // Enable dynamic radiant neon emissives
              if (lowerName.includes('glow') || lowerName.includes('neon') || lowerName.includes('light') || lowerName.includes('emission') || type === 'shield') {
                const clonedMat = mat.clone();
                clonedMat.emissive = new THREE.Color(color);
                clonedMat.emissiveIntensity = 2.5;
                clonedMat.toneMapped = false;
                child.material = clonedMat;
              }
            }
          });
        }
      }
    });

    return cloned;
  }, [scene, color, type]);

  // Setup scale and collider dimensions matching visual scale perfectly
  const params = useMemo(() => {
    switch (type) {
      case 'car':
        return {
          scale: [1.75, 1.75, 1.75] as [number, number, number],
          colArgs: [3.4, 1.0, 1.5] as [number, number, number], // half-size bounds matching larger scale coverage
          colPos: [0, 1.0, 0] as [number, number, number],
        };
      case 'barricade':
        return {
          scale: [2.15, 2.15, 2.15] as [number, number, number],
          colArgs: [2.05, 1.7, 1.2] as [number, number, number], // half-size bounds matching larger scale coverage
          colPos: [0, 1.7, 0] as [number, number, number],
        };
      case 'shield':
        return {
          scale: [2.45, 2.45, 2.45] as [number, number, number],
          colArgs: [2.7, 1.85, 0.55] as [number, number, number], // half-size bounds matching larger scale coverage
          colPos: [0, 1.85, 0] as [number, number, number],
        };
    }
  }, [type]);

  return (
    <RigidBody 
      type="fixed" 
      name={`obstacle-${index}`}
      position={position}
      rotation={rotation}
    >
      <CuboidCollider args={params.colArgs} position={params.colPos} />
      <primitive object={clone} scale={params.scale} />
    </RigidBody>
  );
}

// Preload assets for ultra-smooth transition
useGLTF.preload(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/brokenhollowcar.glb'));
useGLTF.preload(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/boxbaricade.glb'));
useGLTF.preload(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/sheildbarrier.glb'));
