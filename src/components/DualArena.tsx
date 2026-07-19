import React, { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useStore } from '../store/useStore';
import { useGameStore } from '../store';
import { RigidBody, CylinderCollider, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { soundManager } from '../utils/soundManager';
import { Text } from '@react-three/drei';

interface Particle {
  id: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  color: string;
  size: number;
  life: number;
}

export const DualArena: React.FC = () => {
  const currentRoom = useStore(state => state.currentRoom);
  const duelState = useGameStore(state => state.duelState);
  
  const prevDuelActive = useRef(false);

  // Monitor duel initiation to teleport players to opposing sides immediately
  useEffect(() => {
    if (!duelState || !duelState.active) {
      prevDuelActive.current = false;
      return;
    }

    if (duelState.active && !prevDuelActive.current) {
      prevDuelActive.current = true;
      
      const socketId = useGameStore.getState().socket?.id;
      const isPlayer1 = socketId === duelState.player1Id;
      const isPlayer2 = socketId === duelState.player2Id;

      if (isPlayer1) {
        window.dispatchEvent(new CustomEvent('teleport-local-player', { detail: { x: -8, y: 0.5, z: 0 } }));
      } else if (isPlayer2) {
        window.dispatchEvent(new CustomEvent('teleport-local-player', { detail: { x: 8, y: 0.5, z: 0 } }));
      }
    }
  }, [duelState]);

  // Update loop
  useFrame((state, delta) => {
    // Keep local player within the arena, reset if they fall off
    const localPos = useStore.getState().localUserPosition || [0, 0, 0];
    if (localPos[1] < -6) {
      // Teleport back to safe starting position depending on team / role or safe center
      const socketId = useGameStore.getState().socket?.id;
      const isPlayer1 = socketId === duelState?.player1Id;
      const isPlayer2 = socketId === duelState?.player2Id;
      const destX = isPlayer1 ? -8 : (isPlayer2 ? 8 : 0);
      
      window.dispatchEvent(new CustomEvent('teleport-local-player', { detail: { x: destX, y: 0.5, z: 0 } }));
      soundManager.playWarpExiting();
    }
  });

  if (currentRoom !== 'dual') return null;

  const showShields = duelState && duelState.active && duelState.shieldCountdown !== undefined && duelState.shieldCountdown > 0;
  const shieldTime = duelState?.shieldCountdown || 0;

  return (
    <group>
      {/* 3D Holographic Countdown Text inside Arena */}
      {showShields && (
        <group position={[0, 4.5, 0]}>
          <Text
            fontSize={2.5}
            color={shieldTime === 1 ? '#f43f5e' : shieldTime === 2 ? '#f97316' : '#22d3ee'}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.08}
            outlineColor="#090d16"
          >
            {shieldTime}
          </Text>
          <Text
            position={[0, -1.8, 0]}
            fontSize={0.8}
            color="#94a3b8"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.03}
            outlineColor="#090d16"
          >
            SHIELDS RELEASING...
          </Text>
        </group>
      )}

      {/* Forcefield Bubbles over the starting spawning pads */}
      {showShields && (
        <>
          {/* Cyan Energy Shield around Player 1 Spawn */}
          <group position={[-8, 0.8, 0]}>
            <mesh>
              <sphereGeometry args={[2.2, 32, 32]} />
              <meshBasicMaterial color="#22d3ee" transparent opacity={0.25} depthWrite={false} />
            </mesh>
            <mesh>
              <sphereGeometry args={[2.22, 16, 16]} />
              <meshBasicMaterial color="#22d3ee" transparent opacity={0.1} wireframe={true} depthWrite={false} />
            </mesh>
          </group>

          {/* Physical Forcefield Cage for Player 1 (prevents leaving spawn until shield drops) */}
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider args={[1.5, 1.5, 0.1]} position={[-8, 1.5, 2.2]} />
            <CuboidCollider args={[1.5, 1.5, 0.1]} position={[-8, 1.5, -2.2]} />
            <CuboidCollider args={[0.1, 1.5, 1.5]} position={[-5.8, 1.5, 0]} />
            <CuboidCollider args={[0.1, 1.5, 1.5]} position={[-10.2, 1.5, 0]} />
          </RigidBody>

          {/* Pink/Magenta Energy Shield around Player 2 Spawn */}
          <group position={[8, 0.8, 0]}>
            <mesh>
              <sphereGeometry args={[2.2, 32, 32]} />
              <meshBasicMaterial color="#ec4899" transparent opacity={0.25} depthWrite={false} />
            </mesh>
            <mesh>
              <sphereGeometry args={[2.22, 16, 16]} />
              <meshBasicMaterial color="#ec4899" transparent opacity={0.1} wireframe={true} depthWrite={false} />
            </mesh>
          </group>

          {/* Physical Forcefield Cage for Player 2 (prevents leaving spawn until shield drops) */}
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider args={[1.5, 1.5, 0.1]} position={[8, 1.5, 2.2]} />
            <CuboidCollider args={[1.5, 1.5, 0.1]} position={[8, 1.5, -2.2]} />
            <CuboidCollider args={[0.1, 1.5, 1.5]} position={[10.2, 1.5, 0]} />
            <CuboidCollider args={[0.1, 1.5, 1.5]} position={[5.8, 1.5, 0]} />
          </RigidBody>
        </>
      )}

      {/* 1. Main Lightweight Floating Platform */}
      <RigidBody type="fixed" position={[0, -0.5, 0]} colliders={false}>
        {/* Visual Platform Cylindrical Base */}
        <mesh receiveShadow castShadow>
          <cylinderGeometry args={[14, 14, 0.4, 48]} />
          <meshStandardMaterial 
            color="#090d16" 
            roughness={0.12} 
            metalness={0.9} 
          />
        </mesh>
        
        {/* Physical Collider for feet support */}
        <CylinderCollider args={[0.2, 14]} position={[0, 0, 0]} />

        {/* Emissive Outer Boundary Rings */}
        <mesh position={[0, 0.21, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[13.8, 14, 48]} />
          <meshBasicMaterial color="#38bdf8" toneMapped={false} />
        </mesh>

        <mesh position={[0, 0.21, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[13.4, 13.6, 48]} />
          <meshBasicMaterial color="#ec4899" toneMapped={false} />
        </mesh>
      </RigidBody>

      {/* 2. Cyber-Tech Visual Columns Surrounding Platform */}
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (i * Math.PI * 2) / 6;
        const x = Math.cos(angle) * 15.5;
        const z = Math.sin(angle) * 15.5;
        const color = i % 2 === 0 ? '#38bdf8' : '#ec4899';
        
        return (
          <group key={i} position={[x, 3, z]}>
            {/* Main Column Pillar */}
            <mesh>
              <cylinderGeometry args={[0.2, 0.2, 7, 16]} />
              <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.7} />
            </mesh>
            {/* Glowing Top Ring Accent */}
            <mesh position={[0, 3.5, 0]}>
              <torusGeometry args={[0.3, 0.05, 8, 24]} />
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
            {/* Glowing Bottom Ring Accent */}
            <mesh position={[0, -3.5, 0]}>
              <torusGeometry args={[0.3, 0.05, 8, 24]} />
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
          </group>
        );
      })}

      {/* 3. Starry background environment */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 10]} intensity={1.5} color="#38bdf8" />
      <directionalLight position={[-10, 20, -10]} intensity={1.5} color="#ec4899" />
    </group>
  );
};
