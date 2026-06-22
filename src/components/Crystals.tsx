import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { useStore } from '../store/useStore';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

const sharedGeometry = new THREE.OctahedronGeometry(0.5, 0);
const sharedMaterial = new THREE.MeshStandardMaterial({
  color: "#38bdf8",
  emissive: "#0ea5e9",
  emissiveIntensity: 2,
  toneMapped: false,
  wireframe: true
});

const CrystalModelGltf = ({ url }: { url: string }) => {
  const { scene } = useGLTF(url);
  return <primitive object={scene.clone()} scale={1.5} />;
};

const CrystalModelStl = ({ url }: { url: string }) => {
  const geometry = useLoader(STLLoader, url);
  return <mesh geometry={geometry} material={sharedMaterial} scale={0.05} />;
};

class ErrorBoundary extends React.Component<{ fallback: React.ReactNode, children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.warn("Could not load crystal model:", error);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

const CrystalModel = ({ position }: { position: [number, number, number] }) => {
  const meshRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.02;
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2 + position[0]) * 0.2;
    }
  });

  const fallbackMesh = <mesh geometry={sharedGeometry} material={sharedMaterial} />;

  return (
    <group ref={meshRef} position={position}>
      {fallbackMesh}
    </group>
  );
};

const sharedParticleGeometry = new THREE.SphereGeometry(0.08, 8, 8);
const sharedParticleMaterial = new THREE.MeshBasicMaterial({
  color: "#0ea5e9",
  transparent: true,
  toneMapped: false
});

const ParticleBurst = ({ position, onComplete }: { position: [number, number, number], onComplete: () => void }) => {
  const count = 12;
  const particles = useRef(Array.from({ length: count }).map(() => ({
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2
    ).normalize().multiplyScalar(Math.random() * 3 + 2),
    position: new THREE.Vector3(...position),
    scale: Math.random() * 0.5 + 0.5,
    life: 1.0
  })));

  const groupRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    let alive = false;
    
    groupRef.current.children.forEach((child, i) => {
      const p = particles.current[i];
      if (p.life > 0) {
        p.life -= delta * 2.0; // Fade out speed
        p.position.add(p.velocity.clone().multiplyScalar(delta));
        child.position.copy(p.position);
        child.scale.setScalar(p.scale * p.life);
        
        const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (material) material.opacity = p.life;
        
        alive = true;
      } else {
        child.scale.setScalar(0);
      }
    });

    if (!alive) {
      onComplete();
    }
  });

  return (
    <group ref={groupRef}>
      {particles.current.map((_, i) => (
        <mesh key={i} geometry={sharedParticleGeometry} material={sharedParticleMaterial.clone()} />
      ))}
    </group>
  );
};

export const Crystals = () => {
  const crystals = useStore(state => state.crystals);
  const [bursts, setBursts] = useState<{ id: string, position: [number, number, number] }[]>([]);

  useEffect(() => {
    const handleCollect = (e: CustomEvent) => {
      const { position } = e.detail;
      const id = Math.random().toString(36).substr(2, 9);
      setBursts(prev => [...prev, { id, position }]);
    };
    
    window.addEventListener('crystal-collected', handleCollect as EventListener);
    return () => window.removeEventListener('crystal-collected', handleCollect as EventListener);
  }, []);

  const removeBurst = (id: string) => {
    setBursts(prev => prev.filter(b => b.id !== id));
  };

  return (
    <>
      {Object.values(crystals).map(c => (
        <CrystalModel key={c.id} position={c.position} />
      ))}
      {bursts.map(b => (
        <ParticleBurst key={b.id} position={b.position} onComplete={() => removeBurst(b.id)} />
      ))}
    </>
  );
};
