import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export const TextureLODManager: React.FC = () => {
  const { scene, camera } = useThree();
  const lastUpdateRef = useRef(0);
  const _meshWorldPos = useRef(new THREE.Vector3()).current;

  useFrame((state) => {
    const now = state.clock.getElapsedTime();
    // Throttle scene traversal to once every 500ms to eliminate CPU overhead
    if (now - lastUpdateRef.current < 0.5) return;
    lastUpdateRef.current = now;

    const camPos = camera.position;

    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        // Compute world position of this mesh
        object.getWorldPosition(_meshWorldPos);
        const dist = camPos.distanceTo(_meshWorldPos);

        const materials = Array.isArray(object.material) ? object.material : [object.material];

        materials.forEach((material) => {
          if (!material) return;

          // Search all properties for textures
          for (const key in material) {
            try {
              const texture = (material as any)[key];
              if (texture && texture instanceof THREE.Texture) {
                let changed = false;

                if (dist < 6) {
                  // High Quality (Close range)
                  if (texture.minFilter !== THREE.LinearMipmapLinearFilter) {
                    texture.minFilter = THREE.LinearMipmapLinearFilter;
                    changed = true;
                  }
                  if (texture.anisotropy !== 8) {
                    texture.anisotropy = 8;
                    changed = true;
                  }
                } else if (dist < 18) {
                  // Medium Quality (Mid range)
                  if (texture.minFilter !== THREE.LinearMipmapNearestFilter) {
                    texture.minFilter = THREE.LinearMipmapNearestFilter;
                    changed = true;
                  }
                  if (texture.anisotropy !== 2) {
                    texture.anisotropy = 2;
                    changed = true;
                  }
                } else {
                  // Low Quality / High Performance (Far range)
                  if (texture.minFilter !== THREE.NearestMipmapNearestFilter) {
                    texture.minFilter = THREE.NearestMipmapNearestFilter;
                    changed = true;
                  }
                  if (texture.anisotropy !== 1) {
                    texture.anisotropy = 1;
                    changed = true;
                  }
                }

                if (changed) {
                  texture.needsUpdate = true;
                }
              }
            } catch (err) {
              // Ignore any property access errors
            }
          }
        });
      }
    });
  });

  return null;
};
