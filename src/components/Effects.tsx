/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store';
import * as THREE from 'three';
import { useRef, useMemo, useEffect, useState } from 'react';
import { Html } from '@react-three/drei';

// Shared static geometries for maximum performance in the game loop
const sharedLaserGeometry = new THREE.BoxGeometry(1, 1, 1);
const sharedParticleGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.05);

export function Effects() {
  const lasers = useGameStore(state => state.lasers);
  const particles = useGameStore(state => state.particles);
  const damageTexts = useGameStore(state => state.damageTexts || []);

  return (
    <>
      {lasers.map(laser => (
        <Laser key={laser.id} start={laser.start} end={laser.end} color={laser.color} />
      ))}
      {particles.map(p => (
        <ParticleBurst key={p.id} position={p.position} color={p.color} />
      ))}
      {damageTexts.map(dt => (
        <DamageTextIndicator key={dt.id} text={dt.text} position={dt.position} color={dt.color} isCritical={dt.isCritical} />
      ))}
    </>
  );
}

function DamageTextIndicator({ text, position, color, isCritical }: { text: string; position: [number, number, number]; color: string; isCritical: boolean }) {
  const [offsetY, setOffsetY] = useState(0);
  const [opacity, setOpacity] = useState(1);

  useFrame((_, delta) => {
    setOffsetY(prev => prev + delta * 3.8);
    setOpacity(prev => Math.max(0, prev - delta * 1.5));
  });

  if (opacity <= 0) return null;

  return (
    <Html 
      position={[position[0], position[1] + 2.5 + offsetY, position[2]]}
      center
      distanceFactor={22}
    >
      <div 
        className={`font-mono font-black select-none pointer-events-none transition-all duration-75 whitespace-nowrap px-2.5 py-1 rounded shadow-2xl skew-x-[-12deg] flex items-center justify-center ${
          isCritical 
            ? 'text-lg md:text-xl tracking-wider uppercase border-2 scale-110 bg-zinc-950/90 text-yellow-300 animate-pulse font-extrabold' 
            : 'text-xs md:text-sm bg-black/90 text-cyan-400 border border-cyan-500/50'
        }`}
        style={{
          borderColor: color,
          textShadow: `0 0 8px ${color}`,
          boxShadow: `0 0 15px ${isCritical ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 211, 238, 0.2)'}`,
          opacity: opacity
        }}
      >
        <span>
          {isCritical ? `💀 CRIT -${text}` : `-${text}`}
        </span>
      </div>
    </Html>
  );
}

function Laser({ start, end, color }: { start: [number, number, number], end: [number, number, number], color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  
  const { position, rotation, length } = useMemo(() => {
    const s = new THREE.Vector3(...start);
    const e = new THREE.Vector3(...end);
    const length = s.distanceTo(e);
    const position = s.clone().lerp(e, 0.5);
    
    const direction = e.clone().sub(s).normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      direction
    );
    const rotation = new THREE.Euler().setFromQuaternion(quaternion);
    
    return { position, rotation, length };
  }, [start, end]);

  useFrame((_, delta) => {
    if (ref.current) {
      const mat = ref.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, mat.opacity - delta * 5);
    }
  });

  const isPlayerWeapon = color === '#00ffff';

  return (
    <group>
      <mesh 
        ref={ref} 
        position={position} 
        rotation={rotation} 
        scale={[0.18, 0.18, length]} 
        geometry={sharedLaserGeometry}
      >
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={1} />
      </mesh>
      
      {isPlayerWeapon && (
        <ThermalVaporTrail position={position.clone()} rotation={rotation} length={length} />
      )}
    </group>
  );
}

function ThermalVaporTrail({ position, rotation, length }: { position: THREE.Vector3, rotation: THREE.Euler, length: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const driftY = useRef(0);
  const currentScale = useRef([0.3, 0.3, length]);

  useFrame((_, delta) => {
    if (ref.current) {
      driftY.current += delta * 1.6;
      currentScale.current[0] += delta * 1.5;
      currentScale.current[1] += delta * 1.5;
      
      ref.current.position.y = position.y + driftY.current;
      ref.current.scale.set(currentScale.current[0], currentScale.current[1], length);
      
      const mat = ref.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, mat.opacity - delta * 2.5);
    }
  });

  return (
    <mesh
      ref={ref}
      position={[position.x, position.y, position.z]}
      rotation={rotation}
      scale={currentScale.current as [number, number, number]}
      geometry={sharedLaserGeometry}
    >
      <meshBasicMaterial color="#f97316" toneMapped={false} transparent opacity={0.65} />
    </mesh>
  );
}

function ParticleBurst({ position, color }: { position: [number, number, number], color: string }) {
  const group = useRef<THREE.Group>(null);
  
  const particles = useMemo(() => {
    return Array.from({ length: 15 }).map(() => ({
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8
      )
    }));
  }, []);

  useFrame((_, delta) => {
    if (group.current) {
      group.current.children.forEach((child, i) => {
        child.position.addScaledVector(particles[i].velocity, delta);
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, mat.opacity - delta * 3);
        child.scale.setScalar(Math.max(0.001, child.scale.x - delta * 2));
      });
    }
  });

  return (
    <group ref={group} position={position}>
      {particles.map((_, i) => (
        <mesh key={i} geometry={sharedParticleGeometry}>
          <meshBasicMaterial color={color} transparent opacity={1} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

