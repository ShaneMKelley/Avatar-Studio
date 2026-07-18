import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/useStore';

export const AvatarInstancer: React.FC = () => {
  const users = useStore(state => state.users);
  const localUserId = useStore(state => state.localUserId);
  const performanceMode = useStore(state => state.performanceMode);
  const currentRoom = useStore(state => state.currentRoom);

  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);

  const _tempMatrix = useRef(new THREE.Matrix4()).current;
  const _tempPosition = useRef(new THREE.Vector3()).current;
  const _tempRotation = useRef(new THREE.Euler()).current;
  const _tempQuaternion = useRef(new THREE.Quaternion()).current;
  const _tempScale = useRef(new THREE.Vector3(1, 1, 1)).current;
  const _tempColor = useRef(new THREE.Color()).current;

  useFrame((state) => {
    if (!bodyRef.current || !headRef.current || currentRoom === 'arena') return;

    const remoteUsers = Object.values(users).filter(u => u.id !== localUserId);
    const camera = state.camera;
    const threshold = performanceMode ? 6 : 14;

    // Filter distant users
    const distantUsers = remoteUsers.filter(u => {
      _tempPosition.set(u.position[0], u.position[1], u.position[2]);
      return camera.position.distanceTo(_tempPosition) > threshold;
    });

    const count = distantUsers.length;
    
    // Update InstancedMesh counts dynamically
    bodyRef.current.count = count;
    headRef.current.count = count;

    if (count === 0) return;

    distantUsers.forEach((user, idx) => {
      const px = user.position[0];
      const py = user.position[1];
      const pz = user.position[2];

      const rx = user.rotation[0];
      const ry = user.rotation[1];
      const rz = user.rotation[2];

      // Body (centered around y = 0.9)
      _tempPosition.set(px, py + 0.9, pz);
      _tempRotation.set(rx, ry, rz);
      _tempQuaternion.setFromEuler(_tempRotation);
      _tempScale.set(1, 1, 1);
      _tempMatrix.compose(_tempPosition, _tempQuaternion, _tempScale);
      bodyRef.current!.setMatrixAt(idx, _tempMatrix);

      // Head (offset up)
      _tempPosition.set(px, py + 1.6, pz);
      _tempScale.set(1, 1, 1);
      _tempMatrix.compose(_tempPosition, _tempQuaternion, _tempScale);
      headRef.current!.setMatrixAt(idx, _tempMatrix);

      // Colors based on user profile or generic cyberpunk aesthetics
      _tempColor.set('#a855f7'); // purple
      bodyRef.current!.setColorAt(idx, _tempColor);
      
      _tempColor.set('#06b6d4'); // cyan
      headRef.current!.setColorAt(idx, _tempColor);
    });

    bodyRef.current.instanceMatrix.needsUpdate = true;
    headRef.current.instanceMatrix.needsUpdate = true;
    if (bodyRef.current.instanceColor) bodyRef.current.instanceColor.needsUpdate = true;
    if (headRef.current.instanceColor) headRef.current.instanceColor.needsUpdate = true;
  });

  if (currentRoom === 'arena') return null;

  return (
    <group>
      {/* Body: Capsule geometry */}
      <instancedMesh ref={bodyRef} args={[null as any, null as any, 100]}>
        <capsuleGeometry args={[0.3, 0.9, 4, 8]} />
        <meshStandardMaterial 
          roughness={0.2}
          metalness={0.8}
          transparent
          opacity={0.9}
        />
      </instancedMesh>

      {/* Head: Sphere geometry */}
      <instancedMesh ref={headRef} args={[null as any, null as any, 100]}>
        <sphereGeometry args={[0.22, 8, 8]} />
        <meshStandardMaterial 
          roughness={0.1}
          metalness={0.9}
          emissive="#06b6d4"
          emissiveIntensity={0.5}
        />
      </instancedMesh>
    </group>
  );
};
