/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { useGameStore } from '../store';
import { Text } from '@react-three/drei';
import { ArenaAvatar } from './ArenaAvatar';

export function OtherPlayer({ id }: { id: string }) {
  const data = useGameStore(state => state.otherPlayers[id]);
  const body = useRef<RapierRigidBody>(null);
  const groupRef = useRef<THREE.Group>(null);
  const speedRef = useRef(0);
  const lastPosRef = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    if (!body.current || !data) return;
    
    // Smoothly interpolate position
    const currentPos = body.current.translation();
    const targetPos = new THREE.Vector3(...data.position);
    
    // Calculate speed for animation
    const dist = targetPos.distanceTo(lastPosRef.current);
    speedRef.current = dist / (delta || 0.016);
    lastPosRef.current.copy(targetPos);

    // Frame-rate independent lerp
    const lerpFactor = 1.0 - Math.exp(-20 * delta);
    const newPos = new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z).lerp(targetPos, lerpFactor);
    
    body.current.setNextKinematicTranslation({ x: newPos.x, y: newPos.y, z: newPos.z });

    // Smoothly interpolate rotation
    if (groupRef.current) {
      const isShootingRecent = data.lastShotTime && (Date.now() - data.lastShotTime < 1000);
      let targetRotationY = data.rotation;

      if (isShootingRecent && data.lastShotTarget) {
        const dx = data.lastShotTarget[0] - data.position[0];
        const dz = data.lastShotTarget[2] - data.position[2];
        if (dx * dx + dz * dz > 0.01) {
          targetRotationY = Math.atan2(dx, dz);
        }
      }

      // Handle angle wrap-around
      let diff = targetRotationY - groupRef.current.rotation.y;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      groupRef.current.rotation.y += diff * lerpFactor;
    }
  });

  if (!data) return null;

  return (
    <RigidBody
      ref={body}
      colliders={false}
      type="kinematicPosition"
      position={data.position}
      enabledRotations={[false, false, false]}
      userData={{ name: data.id }}
    >
      <CapsuleCollider args={[0.5, 0.5]} position={[0, 1, 0]} />
      <group ref={groupRef} position={[0, 0, 0]}>
        <ArenaAvatar 
          url={data.vrmUrl} 
          disabled={data.state === 'disabled'} 
          speedRef={speedRef} 
          lastShotTime={data.lastShotTime}
          lastShotTarget={data.lastShotTarget}
          playerPosition={data.position}
        />
        
        {/* Username Label */}
        <Text
          position={[0, 2.5, 0]}
          fontSize={0.3}
          color={data.state === 'active' ? data.color : '#666666'}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {data.name}
        </Text>
      </group>
    </RigidBody>
  );
}
