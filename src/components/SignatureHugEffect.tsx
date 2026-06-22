import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface Particle {
  id: number;
  position: [number, number, number];
  speed: number;
  scale: number;
  angle: number;
}

export const SignatureHugEffect: React.FC<{ active: boolean; height?: number }> = ({
  active,
  height = 1.4,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const heartRef = useRef<THREE.Mesh>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Group>(null);

  // Generate stable particle offsets
  const particles = React.useMemo(() => {
    const arr: Particle[] = [];
    for (let i = 0; i < 24; i++) {
      arr.push({
        id: i,
        position: [
          (Math.random() - 0.5) * 1.5,
          Math.random() * 0.5,
          (Math.random() - 0.5) * 1.5,
        ],
        speed: 0.8 + Math.random() * 1.2,
        scale: 0.05 + Math.random() * 0.08,
        angle: Math.random() * Math.PI * 2,
      });
    }
    return arr;
  }, []);

  useFrame((state, delta) => {
    if (!active || !groupRef.current) return;

    const t = state.clock.elapsedTime;

    // Heart pulsing beating rhythm
    if (heartRef.current) {
      const pulse = 1.0 + Math.sin(t * 7) * 0.12 * (Math.sin(t * 3.5) > 0 ? 1 : 0.3);
      heartRef.current.scale.set(pulse, pulse, pulse);
      heartRef.current.rotation.y = t * 1.5;
      heartRef.current.position.y = height + Math.sin(t * 2) * 0.08;
    }

    // Concentric rings rotation
    if (ring1Ref.current) {
      ring1Ref.current.rotation.z = t * 1.0;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.z = -t * 1.5;
    }

    // Animate individual particles rising
    if (particlesRef.current) {
      particlesRef.current.children.forEach((mesh, index) => {
        const p = particles[index];
        if (p) {
          mesh.position.y += p.speed * delta;
          mesh.position.x += Math.sin(t * 4 + p.id) * 0.005;
          mesh.position.z += Math.cos(t * 4 + p.id) * 0.005;

          // Fade out as it goes higher
          if (mesh.position.y > 2.5) {
            mesh.position.y = 0.1;
            mesh.position.x = (Math.random() - 0.5) * 1.2;
            mesh.position.z = (Math.random() - 0.5) * 1.2;
          }

          // Scale cycle
          const progress = Math.min(1, Math.max(0, 1.0 - mesh.position.y / 2.5));
          mesh.scale.setScalar(p.scale * progress);
        }
      });
    }
  });

  if (!active) return null;

  return (
    <group ref={groupRef}>
      {/* 1. Holographic Beating Heart */}
      <group position={[0, height, 0]}>
        {/* We build a 3D heart shape dynamically or with standard geometries */}
        <mesh ref={heartRef}>
          <dodecahedronGeometry args={[0.25, 1]} />
          <meshBasicMaterial
            color="#ff4081"
            wireframe
            transparent
            opacity={0.8}
            side={THREE.DoubleSide}
          />
        </mesh>
        
        {/* Glow point light centered inside heart */}
        <pointLight color="#ff4081" intensity={2} distance={4} decay={2} />
      </group>

      {/* 2. Concentric ground spinning cyber-rings */}
      <group position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh ref={ring1Ref}>
          <ringGeometry args={[0.7, 0.8, 32]} />
          <meshBasicMaterial
            color="#ec4899"
            transparent
            opacity={0.4}
            side={THREE.DoubleSide}
          />
        </mesh>

        <mesh ref={ring2Ref}>
          <ringGeometry args={[0.9, 0.95, 32]} />
          <meshBasicMaterial
            color="#3b82f6"
            transparent
            opacity={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* 3. Aura Halo floating over individual's head */}
      <group position={[0, height + 1.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh>
          <ringGeometry args={[0.3, 0.35, 16]} />
          <meshBasicMaterial
            color="#a855f7"
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* 4. Sparkling floating particle fountain */}
      <group ref={particlesRef}>
        {particles.map((p) => (
          <mesh key={p.id} position={p.position}>
            <octahedronGeometry args={[1]} />
            <meshBasicMaterial
              color={p.id % 2 === 0 ? "#ff2a85" : "#a855f7"}
              transparent
              opacity={0.7}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
};
