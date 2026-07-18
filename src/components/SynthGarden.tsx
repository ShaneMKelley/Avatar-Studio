import React, { useMemo, useRef, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import { getProxyUrl } from '../utils/proxy';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RigidBody, CylinderCollider } from '@react-three/rapier';
import { ArenaWeather } from './ArenaWeather';
import { soundManager } from '../utils/soundManager';
import { Pond } from './Pond';

interface FoliageCollidersProps {
  matrices: THREE.Matrix4[];
  halfHeight: number;
  radius: number;
  plantType: 'palm' | 'vinetree' | 'fern' | 'mushrooms' | 'crystal' | 'succulent';
}

// React.memo is used here for peak low-latency optimization.
// The raw matrices never change after initialization, so these 
// static colliders will render exactly once and perform zero re-renders.
const FoliageColliders = React.memo(({ matrices, halfHeight, radius, plantType }: FoliageCollidersProps) => {
  return (
    <group>
      {matrices.map((matrix, idx) => {
        const position = new THREE.Vector3();
        const rotation = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        matrix.decompose(position, rotation, scale);
        const euler = new THREE.Euler().setFromQuaternion(rotation);

        // Calculate exact physical dimensions based on instance scale
        const scaledHalfHeight = halfHeight * scale.y;
        const scaledRadius = radius * scale.x;

        return (
          <RigidBody
            key={idx}
            type="fixed"
            position={position}
            rotation={[euler.x, euler.y, euler.z]}
            colliders={false}
          >
            {/* Trunk / Base main pillar collider */}
            <CylinderCollider args={[scaledHalfHeight, scaledRadius]} position={[0, scaledHalfHeight, 0]} />

            {/* Custom solid canopy / top leaves colliders so players can jump and stand on top of them! */}
            {plantType === 'palm' && (
              <CylinderCollider 
                args={[0.08 * scale.y, 1.85 * scale.x]} 
                position={[0, 2 * scaledHalfHeight - 0.1 * scale.y, 0]} 
              />
            )}

            {plantType === 'vinetree' && (
              <CylinderCollider 
                args={[0.1 * scale.y, 1.55 * scale.x]} 
                position={[0, 2 * scaledHalfHeight - 0.1 * scale.y, 0]} 
              />
            )}

            {plantType === 'fern' && (
              <CylinderCollider 
                args={[0.15 * scale.y, 1.5 * scaledRadius]} 
                position={[0, scaledHalfHeight * 1.25, 0]} 
              />
            )}

            {plantType === 'succulent' && (
              <CylinderCollider 
                args={[0.15 * scale.y, 1.5 * scaledRadius]} 
                position={[0, scaledHalfHeight * 1.35, 0]} 
              />
            )}
          </RigidBody>
        );
      })}
    </group>
  );
});

export function SynthGarden() {
  const palmGltf = useGLTF(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/palmtree.glb'));
  const fernGltf = useGLTF(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/pottedfern.glb'));
  const crystalGltf = useGLTF(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/mosscrystals.glb'));
  
  // Custom uploaded assets
  const succulentGltf = useGLTF(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/Succulent.glb'));
  const vinetreeGltf = useGLTF(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/vinetree.glb'));
  const mushroomsGltf = useGLTF(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/mushrooms.glb'));

  // Trigger synthesized jungle soundtrack (audio stream) on mount and stop on unmount
  useEffect(() => {
    soundManager.startLyriaJungleStream();
    return () => {
      soundManager.stopLyriaJungleStream();
    };
  }, []);

  // Lush foliage counts split in half to introduce the new asset variety in the tropical environment
  const palmCount = 25;
  const vinetreeCount = 25;
  const fernCount = 60;
  const mushroomsCount = 60;
  const crystalCount = 50;
  const succulentCount = 50;

  // Generate unique, grounded layouts with custom size multipliers
  const palmMatrices = useMemo(() => generateMatrices(palmCount, 45, 3.2, 5.2), [palmCount]);
  const vinetreeMatrices = useMemo(() => generateMatrices(vinetreeCount, 45, 3.0, 5.0), [vinetreeCount]);
  const fernMatrices = useMemo(() => generateMatrices(fernCount, 45, 1.0, 1.6), [fernCount]);
  const mushroomsMatrices = useMemo(() => generateMatrices(mushroomsCount, 45, 1.0, 1.8), [mushroomsCount]);
  const crystalMatrices = useMemo(() => generateMatrices(crystalCount, 45, 1.2, 2.2), [crystalCount]);
  const succulentMatrices = useMemo(() => generateMatrices(succulentCount, 45, 1.5, 2.5), [succulentCount]);

  // Extract meshes from the scenes
  const palmMeshes = useMemo(() => extractMeshes(palmGltf.scene), [palmGltf.scene]);
  const vinetreeMeshes = useMemo(() => extractMeshes(vinetreeGltf.scene), [vinetreeGltf.scene]);
  const fernMeshes = useMemo(() => extractMeshes(fernGltf.scene), [fernGltf.scene]);
  const mushroomsMeshes = useMemo(() => extractMeshes(mushroomsGltf.scene), [mushroomsGltf.scene]);
  const crystalMeshes = useMemo(() => extractMeshes(crystalGltf.scene), [crystalGltf.scene]);
  const succulentMeshes = useMemo(() => extractMeshes(succulentGltf.scene), [succulentGltf.scene]);

  // Create references to the instanced meshes for real-time frustum culling
  const palmRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const vinetreeRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const fernRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const mushroomsRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const crystalRefs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const succulentRefs = useRef<(THREE.InstancedMesh | null)[]>([]);

  // Create reusable math objects outside of frame loop to prevent Garbage Collection allocation spikes
  const frustum = useMemo(() => new THREE.Frustum(), []);
  const projScreenMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempPos = useMemo(() => new THREE.Vector3(), []);
  const tempSphere = useMemo(() => new THREE.Sphere(), []);

  // CPU Frustum Culling and Distance Check Loop
  useFrame(({ camera }) => {
    // 1. Compute view frustum matching camera
    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);

    const camPos = camera.position;

    // Helper to filter and update InstancedMesh counts based on camera frustum + proximity
    const updateCulling = (
      refs: (THREE.InstancedMesh | null)[],
      matrices: THREE.Matrix4[],
      originalCount: number,
      boundingRadius: number
    ) => {
      refs.forEach((instancedMesh) => {
        if (!instancedMesh) return;

        let visibleCount = 0;

        for (let i = 0; i < originalCount; i++) {
          const matrix = matrices[i];
          tempPos.setFromMatrixPosition(matrix);
          tempSphere.set(tempPos, boundingRadius);

          // 1. Frustum intersections check
          // 2. High-speed look-around distance buffer (8m) to prevent immediate popping
          const isVisible = frustum.intersectsSphere(tempSphere) || tempPos.distanceTo(camPos) < 8.0;

          if (isVisible) {
            instancedMesh.setMatrixAt(visibleCount, matrix);
            visibleCount++;
          }
        }

        // Limit the rendering subset to only the visible instances
        instancedMesh.count = visibleCount;
        instancedMesh.instanceMatrix.needsUpdate = true;
      });
    };

    // Apply frustum culling dynamically to each category
    updateCulling(palmRefs.current, palmMatrices, palmCount, 8.0);
    updateCulling(vinetreeRefs.current, vinetreeMatrices, vinetreeCount, 8.0);
    updateCulling(fernRefs.current, fernMatrices, fernCount, 3.0);
    updateCulling(mushroomsRefs.current, mushroomsMatrices, mushroomsCount, 3.0);
    updateCulling(crystalRefs.current, crystalMatrices, crystalCount, 4.0);
    updateCulling(succulentRefs.current, succulentMatrices, succulentCount, 4.0);
  });

  return (
    <group>
      {/* Weather particles for a vibrant botanical atmosphere inside the garden */}
      <ArenaWeather />

      {/* Palm Trees - cast/receive shadows for majestic scale */}
      {palmMeshes.map((m, idx) => (
        <instancedMesh
          key={`palm-${idx}`}
          args={[m.geometry, m.material, palmCount]}
          castShadow
          receiveShadow
          frustumCulled={false}
          ref={(ref) => {
            palmRefs.current[idx] = ref;
          }}
        />
      ))}

      {/* Vine Trees - elegant white willow structures */}
      {vinetreeMeshes.map((m, idx) => (
        <instancedMesh
          key={`vinetree-${idx}`}
          args={[m.geometry, m.material, vinetreeCount]}
          castShadow
          receiveShadow
          frustumCulled={false}
          ref={(ref) => {
            vinetreeRefs.current[idx] = ref;
          }}
        />
      ))}

      {/* Potted Ferns - shadows disabled for peak performance */}
      {fernMeshes.map((m, idx) => (
        <instancedMesh
          key={`fern-${idx}`}
          args={[m.geometry, m.material, fernCount]}
          frustumCulled={false}
          ref={(ref) => {
            fernRefs.current[idx] = ref;
          }}
        />
      ))}

      {/* Mushrooms - neon glowing caps */}
      {mushroomsMeshes.map((m, idx) => (
        <instancedMesh
          key={`mushrooms-${idx}`}
          args={[m.geometry, m.material, mushroomsCount]}
          frustumCulled={false}
          ref={(ref) => {
            mushroomsRefs.current[idx] = ref;
          }}
        />
      ))}

      {/* Moss Crystals - glow emitting, shadow casting disabled for optimization */}
      {crystalMeshes.map((m, idx) => (
        <instancedMesh
          key={`crystal-${idx}`}
          args={[m.geometry, m.material, crystalCount]}
          frustumCulled={false}
          ref={(ref) => {
            crystalRefs.current[idx] = ref;
          }}
        />
      ))}

      {/* Succulents - neon highlighted organic rock structures */}
      {succulentMeshes.map((m, idx) => (
        <instancedMesh
          key={`succulent-${idx}`}
          args={[m.geometry, m.material, succulentCount]}
          frustumCulled={false}
          ref={(ref) => {
            succulentRefs.current[idx] = ref;
          }}
        />
      ))}

      {/* Static Physical Colliders for All Lush Foliage */}
      <FoliageColliders matrices={palmMatrices} halfHeight={2.5} radius={0.12} plantType="palm" />
      <FoliageColliders matrices={vinetreeMatrices} halfHeight={2.5} radius={0.14} plantType="vinetree" />
      <FoliageColliders matrices={fernMatrices} halfHeight={0.5} radius={0.4} plantType="fern" />
      <FoliageColliders matrices={mushroomsMatrices} halfHeight={0.4} radius={0.25} plantType="mushrooms" />
      <FoliageColliders matrices={crystalMatrices} halfHeight={0.6} radius={0.35} plantType="crystal" />
      <FoliageColliders matrices={succulentMatrices} halfHeight={0.5} radius={0.5} plantType="succulent" />

      {/* Central Interactive Cyber Pond */}
      <Pond />

      {/* Bioluminescent organic ambient lighting for Synth Garden */}
      <pointLight position={[-15, 4, -15]} color="#22c55e" intensity={4} distance={35} decay={2} />
      <pointLight position={[15, 4, 15]} color="#10b981" intensity={4} distance={35} decay={2} />
      <pointLight position={[0, 5, 0]} color="#059669" intensity={3} distance={45} decay={2} />
    </group>
  );
}

function generateMatrices(count: number, range: number, scaleMin = 0.8, scaleMax = 1.3) {
  const result: THREE.Matrix4[] = [];
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const matrix = new THREE.Matrix4();
    
    // Scatter across floor grid (range x 2 width/length)
    let x = (Math.random() - 0.5) * range * 2;
    let z = (Math.random() - 0.5) * range * 2;
    
    // Keep spawn point area (0,0) and cyber-pond area (0,-12) clear of random dense foliage meshes
    const distFromCenter = Math.sqrt(x * x + z * z);
    const distFromPond = Math.sqrt(x * x + (z + 12.0) * (z + 12.0));
    if (distFromCenter < 5.0 || distFromPond < 8.0) {
      const angle = Math.random() * Math.PI * 2;
      x = Math.cos(angle) * 14.0;
      z = -12.0 + Math.sin(angle) * 14.0;
    }

    const y = 0; // Grounded on the floor plane (y=0)

    position.set(x, y, z);

    // Apply random Y-axis rotation (Math.random() * Math.PI * 2) so they face different directions
    const angleRot = Math.random() * Math.PI * 2;
    rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angleRot);

    // Apply slight random scale variation
    const s = Math.random() * (scaleMax - scaleMin) + scaleMin;
    scale.set(s, s, s);

    matrix.compose(position, rotation, scale);
    result.push(matrix);
  }
  return result;
}

function extractMeshes(scene: THREE.Group) {
  const meshes: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];
  
  // Fully resolve internal transformations within GLFB scene structure
  scene.updateMatrixWorld(true);
  
  // Calculate collective absolute minimum Y boundary across all sub-components
  const overallBBox = new THREE.Box3().setFromObject(scene);
  const bottomOffset = overallBBox.min.y;

  scene.traverse((child) => {
    if ((child as any).isMesh) {
      const mesh = child as THREE.Mesh;
      
      // Clone geometry to prevent altering the cached useGLTF entry
      const geom = mesh.geometry.clone();
      
      // Bake the node's hierarchical transform directly into geometry coordinates
      geom.applyMatrix4(mesh.matrixWorld);
      
      // Translate uniformly so the collective lowest point of the model sits perfectly at Y = 0
      geom.translate(0, -bottomOffset, 0);
      
      meshes.push({
        geometry: geom,
        material: mesh.material as THREE.Material
      });
    }
  });
  return meshes;
}

// Preload assets for ultra-smooth transition
useGLTF.preload(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/palmtree.glb'));
useGLTF.preload(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/pottedfern.glb'));
useGLTF.preload(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/mosscrystals.glb'));
useGLTF.preload(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/Succulent.glb'));
useGLTF.preload(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/vinetree.glb'));
useGLTF.preload(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/mushrooms.glb'));
