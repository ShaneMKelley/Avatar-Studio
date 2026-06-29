import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { convertVRMMaterialsForWebGPU, isWebGPURendererActive } from '../utils/renderer';
import { idleTaskQueue } from '../utils/idleTaskQueue';

export function WebGPUSceneSanitizer() {
  const { scene } = useThree();
  const frameCountRef = useRef(0);
  const isPendingRef = useRef(false);

  // Initial scan on mount
  useEffect(() => {
    if (isWebGPURendererActive()) {
      idleTaskQueue.enqueue(() => {
        convertVRMMaterialsForWebGPU(scene);
      });
    }
  }, [scene]);

  // Periodic scan (every 60 frames, approx. once per second) to safely transcode
  // any dynamic/late-loaded custom ShaderMaterials (such as Drei's Text components)
  useFrame(() => {
    if (!isWebGPURendererActive()) return;
    
    frameCountRef.current++;
    if (frameCountRef.current >= 60) {
      frameCountRef.current = 0;
      if (!isPendingRef.current) {
        isPendingRef.current = true;
        idleTaskQueue.enqueue(() => {
          convertVRMMaterialsForWebGPU(scene);
          isPendingRef.current = false;
        });
      }
    }
  });

  return null;
}

