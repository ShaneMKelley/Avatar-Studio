import React, { useRef } from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

export const LoungeBalcony: React.FC = () => {
  const tableNeonRef = useRef<THREE.Mesh>(null);
  const leftArchNeonRef = useRef<THREE.Mesh>(null);
  const rightArchNeonRef = useRef<THREE.Mesh>(null);
  const topArchNeonRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    
    // Slow, soothing pulse on the balcony neon lights
    const pulse = 1.8 + Math.sin(t * 3.0) * 0.5;
    
    if (tableNeonRef.current && tableNeonRef.current.material) {
      const mat = tableNeonRef.current.material as THREE.MeshBasicMaterial;
      if (mat && typeof mat === 'object' && 'opacity' in mat) {
        mat.opacity = 0.7 + Math.sin(t * 2.0) * 0.25;
      }
    }

    if (leftArchNeonRef.current && leftArchNeonRef.current.material) {
      const mat = leftArchNeonRef.current.material as THREE.MeshStandardMaterial;
      if (mat && typeof mat === 'object' && 'emissiveIntensity' in mat) {
        mat.emissiveIntensity = pulse;
      }
    }

    if (rightArchNeonRef.current && rightArchNeonRef.current.material) {
      const mat = rightArchNeonRef.current.material as THREE.MeshStandardMaterial;
      if (mat && typeof mat === 'object' && 'emissiveIntensity' in mat) {
        mat.emissiveIntensity = pulse;
      }
    }

    if (topArchNeonRef.current && topArchNeonRef.current.material) {
      const mat = topArchNeonRef.current.material as THREE.MeshStandardMaterial;
      if (mat && typeof mat === 'object' && 'emissiveIntensity' in mat) {
        mat.emissiveIntensity = pulse;
      }
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* 1. Raised Balcony Floor Deck */}
      <mesh position={[0, 0.05, 12.5]} receiveShadow>
        <boxGeometry args={[10, 0.1, 7]} />
        <meshStandardMaterial 
          color="#0b1329" 
          roughness={0.25} 
          metalness={0.8} 
        />
      </mesh>

      {/* 2. Sleek Glowing Neon Floor Outline (Cyan) */}
      {/* Back edge */}
      <mesh position={[0, 0.11, 15.95]}>
        <boxGeometry args={[10, 0.02, 0.05]} />
        <meshBasicMaterial color="#38bdf8" toneMapped={false} />
      </mesh>
      {/* Left edge */}
      <mesh position={[-4.95, 0.11, 12.5]}>
        <boxGeometry args={[0.05, 0.02, 7]} />
        <meshBasicMaterial color="#38bdf8" toneMapped={false} />
      </mesh>
      {/* Right edge */}
      <mesh position={[4.95, 0.11, 12.5]}>
        <boxGeometry args={[0.05, 0.02, 7]} />
        <meshBasicMaterial color="#38bdf8" toneMapped={false} />
      </mesh>


      {/* 3. Glass & Metal Railings */}
      {/* Back Glass Railing */}
      <mesh position={[0, 0.65, 15.95]} castShadow>
        <boxGeometry args={[10, 1.1, 0.04]} />
        <meshStandardMaterial 
          color="#38bdf8" 
          transparent 
          opacity={0.35} 
          roughness={0.05} 
          metalness={0.95} 
        />
      </mesh>
      {/* Back Railing Top Glowing Cap Bar */}
      <mesh position={[0, 1.2, 15.95]}>
        <boxGeometry args={[10.04, 0.05, 0.08]} />
        <meshStandardMaterial 
          color="#0284c7" 
          emissive="#06b6d4" 
          emissiveIntensity={2.5} 
          toneMapped={false} 
        />
      </mesh>

      {/* Left Glass Railing */}
      <mesh position={[-4.95, 0.65, 12.5]} castShadow>
        <boxGeometry args={[0.04, 1.1, 7]} />
        <meshStandardMaterial 
          color="#38bdf8" 
          transparent 
          opacity={0.35} 
          roughness={0.05} 
          metalness={0.95} 
        />
      </mesh>
      {/* Left Railing Top Glowing Cap Bar */}
      <mesh position={[-4.95, 1.2, 12.5]}>
        <boxGeometry args={[0.08, 0.05, 7.04]} />
        <meshStandardMaterial 
          color="#0284c7" 
          emissive="#06b6d4" 
          emissiveIntensity={2.5} 
          toneMapped={false} 
        />
      </mesh>

      {/* Right Glass Railing */}
      <mesh position={[4.95, 0.65, 12.5]} castShadow>
        <boxGeometry args={[0.04, 1.1, 7]} />
        <meshStandardMaterial 
          color="#38bdf8" 
          transparent 
          opacity={0.35} 
          roughness={0.05} 
          metalness={0.95} 
        />
      </mesh>
      {/* Right Railing Top Glowing Cap Bar */}
      <mesh position={[4.95, 1.2, 12.5]}>
        <boxGeometry args={[0.08, 0.05, 7.04]} />
        <meshStandardMaterial 
          color="#0284c7" 
          emissive="#06b6d4" 
          emissiveIntensity={2.5} 
          toneMapped={false} 
        />
      </mesh>


      {/* 4. Cozy Cyber Seating Area */}
      {/* Modern Cylinder Pedestal Table */}
      <mesh position={[-2.4, 0.45, 13.5]} castShadow>
        <cylinderGeometry args={[0.55, 0.35, 0.8, 16]} />
        <meshStandardMaterial 
          color="#1e1b4b" 
          roughness={0.3} 
          metalness={0.7} 
        />
      </mesh>
      {/* Table Glass Top */}
      <mesh position={[-2.4, 0.86, 13.5]} castShadow>
        <cylinderGeometry args={[0.65, 0.65, 0.03, 16]} />
        <meshStandardMaterial 
          color="#0284c7" 
          transparent 
          opacity={0.5} 
          roughness={0.1} 
        />
      </mesh>
      {/* Neon glowing center disk on Table top */}
      <mesh ref={tableNeonRef} position={[-2.4, 0.88, 13.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.0, 0.2, 16]} />
        <meshBasicMaterial color="#ec4899" transparent opacity={0.8} toneMapped={false} />
      </mesh>

      {/* Lounger Chair 1 */}
      <group position={[-1.4, 0.1, 13.5]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.9, 0.45, 0.9]} />
          <meshStandardMaterial color="#1e1e38" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.45, -0.4]} castShadow>
          <boxGeometry args={[0.9, 0.6, 0.15]} />
          <meshStandardMaterial color="#2e2e5c" roughness={0.4} />
        </mesh>
        <mesh position={[-0.4, 0.3, 0]} castShadow>
          <boxGeometry args={[0.1, 0.35, 0.9]} />
          <meshStandardMaterial color="#4f46e5" roughness={0.4} />
        </mesh>
        <mesh position={[0.4, 0.3, 0]} castShadow>
          <boxGeometry args={[0.1, 0.35, 0.9]} />
          <meshStandardMaterial color="#4f46e5" roughness={0.4} />
        </mesh>
      </group>

      {/* Lounger Chair 2 */}
      <group position={[-2.4, 0.1, 14.5]} rotation={[0, 0, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.9, 0.45, 0.9]} />
          <meshStandardMaterial color="#1e1e38" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.45, -0.4]} castShadow>
          <boxGeometry args={[0.9, 0.6, 0.15]} />
          <meshStandardMaterial color="#2e2e5c" roughness={0.4} />
        </mesh>
        <mesh position={[-0.4, 0.3, 0]} castShadow>
          <boxGeometry args={[0.1, 0.35, 0.9]} />
          <meshStandardMaterial color="#4f46e5" roughness={0.4} />
        </mesh>
        <mesh position={[0.4, 0.3, 0]} castShadow>
          <boxGeometry args={[0.1, 0.35, 0.9]} />
          <meshStandardMaterial color="#4f46e5" roughness={0.4} />
        </mesh>
      </group>


      {/* 5. Sliding Glass Doorway Arch Partition dividing the Indoor and Outdoor areas */}
      <group position={[0, 0, 9]}>
        {/* Left Solid Wall Column */}
        <mesh position={[-3.8, 1.8, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.4, 3.6, 0.3]} />
          <meshStandardMaterial color="#020617" roughness={0.4} metalness={0.6} />
        </mesh>
        {/* Right Solid Wall Column */}
        <mesh position={[3.8, 1.8, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.4, 3.6, 0.3]} />
          <meshStandardMaterial color="#020617" roughness={0.4} metalness={0.6} />
        </mesh>
        {/* Top Header Beam */}
        <mesh position={[0, 3.45, 0]} castShadow receiveShadow>
          <boxGeometry args={[5.2, 0.3, 0.3]} />
          <meshStandardMaterial color="#020617" roughness={0.4} metalness={0.6} />
        </mesh>

        {/* Sliding Glass Doors (Aesthetic / Half-open) */}
        {/* Left half-slid glass panel */}
        <mesh position={[-2.1, 1.6, -0.05]} castShadow>
          <boxGeometry args={[1.6, 3.1, 0.05]} />
          <meshStandardMaterial 
            color="#a855f7" 
            transparent 
            opacity={0.15} 
            roughness={0.1} 
            metalness={0.8}
          />
        </mesh>
        {/* Right half-slid glass panel */}
        <mesh position={[2.1, 1.6, -0.05]} castShadow>
          <boxGeometry args={[1.6, 3.1, 0.05]} />
          <meshStandardMaterial 
            color="#a855f7" 
            transparent 
            opacity={0.15} 
            roughness={0.1} 
            metalness={0.8}
          />
        </mesh>

        {/* Beautiful Purple Neon Archway Outlines */}
        <mesh ref={leftArchNeonRef} position={[-2.6, 1.65, 0.16]}>
          <boxGeometry args={[0.06, 3.3, 0.06]} />
          <meshStandardMaterial color="#c084fc" emissive="#a855f7" emissiveIntensity={2.0} toneMapped={false} />
        </mesh>
        <mesh ref={rightArchNeonRef} position={[2.6, 1.65, 0.16]}>
          <boxGeometry args={[0.06, 3.3, 0.06]} />
          <meshStandardMaterial color="#c084fc" emissive="#a855f7" emissiveIntensity={2.0} toneMapped={false} />
        </mesh>
        <mesh ref={topArchNeonRef} position={[0, 3.3, 0.16]}>
          <boxGeometry args={[5.2, 0.06, 0.06]} />
          <meshStandardMaterial color="#c084fc" emissive="#a855f7" emissiveIntensity={2.0} toneMapped={false} />
        </mesh>

        {/* Floating Futuristic Neon Sign above doorway */}
        <Text
          position={[0, 3.85, 0.18]}
          fontSize={0.28}
          color="#d946ef"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          LOUNGE BALCONY
        </Text>
      </group>
    </group>
  );
};
