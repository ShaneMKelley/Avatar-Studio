import React, { useEffect, useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM, VRMUtils } from '@pixiv/three-vrm';
import { MToonMaterialLoaderPlugin } from '@pixiv/three-vrm-materials-mtoon';
import { MToonNodeMaterial } from '@pixiv/three-vrm-materials-mtoon/nodes';
import * as THREE from 'three';
import { DEFAULT_VRM_URL } from '../store/useStore';
import { convertVRMMaterialsForWebGPU, isWebGPURendererActive } from '../utils/renderer';

export function ArenaAvatar({ url, disabled = false, speedRef }: { url?: string, disabled?: boolean, speedRef?: React.MutableRefObject<number> }) {
  const [vrm, setVrm] = useState<VRM | null>(null);
  const [glbScene, setGlbScene] = useState<THREE.Group | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const timeRef = useRef(0);
  
  // For standard GLB animations
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  
  useEffect(() => {
    let active = true;
    const loader = new GLTFLoader();
    loader.register((parser) => {
      const isWebGPU = isWebGPURendererActive();
      return new VRMLoaderPlugin(parser, {
        mtoonMaterialPlugin: new MToonMaterialLoaderPlugin(parser, {
          materialType: isWebGPU ? MToonNodeMaterial : undefined,
        })
      });
    });

    const loadUrl = url || DEFAULT_VRM_URL;
    const loadModel = (targetUrl: string, isFallback = false, retries = 3) => {
      const finalUrl = targetUrl.startsWith('/') ? `${window.location.origin}${targetUrl}` : targetUrl;
      loader.load(
        finalUrl,
        (gltf) => {
          if (!active) return;
          const vrmData = gltf.userData.vrm as VRM | undefined;
          
          if (vrmData) {
            VRMUtils.removeUnnecessaryVertices(gltf.scene as any);
            VRMUtils.removeUnnecessaryJoints(gltf.scene as any);
            
            // Run high-fidelity compatibility transcode for WebGPU Materials
            convertVRMMaterialsForWebGPU(vrmData.scene);

            vrmData.scene.traverse((obj) => {
              obj.frustumCulled = false;
              if (obj instanceof THREE.Mesh) {
                obj.castShadow = true;
              }
            });
            
            // Face forward instead of backward
            vrmData.scene.rotation.y = Math.PI;
  
            setVrm(vrmData);
            vrmRef.current = vrmData;
            setGlbScene(null);
          } else {
            // Standard GLB
            gltf.scene.traverse((obj) => {
              obj.frustumCulled = false;
              if (obj instanceof THREE.Mesh) {
                obj.castShadow = true;
              }
            });
            // usually meshy models might need adjusting rotation/scale depending on orientation
            gltf.scene.rotation.y = Math.PI;
            
            setGlbScene(gltf.scene);
            setVrm(null);
            vrmRef.current = null;
            
            if (gltf.animations && gltf.animations.length > 0) {
              const mixer = new THREE.AnimationMixer(gltf.scene);
              mixerRef.current = mixer;
              const actions: Record<string, THREE.AnimationAction> = {};
              gltf.animations.forEach((clip) => {
                // Create action
                const action = mixer.clipAction(clip);
                actions[clip.name.toLowerCase()] = action;
                actions[clip.name] = action;
              });
              actionsRef.current = actions;
              
              // To play a default immediately:
              // mixer.clipAction(gltf.animations[0]).play();
            }
          }
        },
        undefined,
        (err) => {
          console.error(`Failed to load Avatar model from ${targetUrl}:`, err);
          if (retries > 0) {
            const delay = (4 - retries) * 1500;
            console.warn(`[ArenaAvatar] Retrying load due to error in ${delay}ms... (${retries} attempts left)`);
            setTimeout(() => {
              if (active) {
                loadModel(targetUrl, isFallback, retries - 1);
              }
            }, delay);
          } else if (!isFallback && targetUrl !== DEFAULT_VRM_URL) {
            console.warn("Attempting fallback load of default VRM for ArenaAvatar...");
            loadModel(DEFAULT_VRM_URL, true);
          }
        }
      );
    };
  
    loadModel(loadUrl);

    return () => {
      active = false;
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current = null;
        actionsRef.current = {};
      }
    };
  }, [url]);

  useFrame((_, r3fDelta) => {
    // Clamp delta to prevent physical explosion & extreme spin on page visibility/tab changes
    const delta = Math.min(0.05, r3fDelta);
    const t = timeRef.current;
    timeRef.current += delta;
    
    const speed = speedRef ? speedRef.current : 0;

    // Handle VRM procedural animation
    if (vrmRef.current) {
      const v = vrmRef.current;
      if (disabled) {
        if (v.humanoid) {
          v.humanoid.getNormalizedBoneNode('head')!.rotation.z = Math.PI / 4;
          v.humanoid.getNormalizedBoneNode('spine')!.rotation.x = 0.5;
          v.humanoid.getNormalizedBoneNode('leftUpperArm')!.rotation.z = 1;
          v.humanoid.getNormalizedBoneNode('rightUpperArm')!.rotation.z = -1;
        }
        if (v.expressionManager) {
          v.expressionManager.setValue('blink', 1);
          v.expressionManager.setValue('sad', 1);
        }
      } else {
        const isRunning = speed > 0.5;
        const walkFactor = isRunning ? 15 : 2;
        const walkIntensity = isRunning ? 0.5 : 0.05;
        
        if (v.humanoid) {
          v.humanoid.getNormalizedBoneNode('head')!.rotation.z = 0;
          v.humanoid.getNormalizedBoneNode('spine')!.rotation.x = 0;
          
          const leftLeg = v.humanoid.getNormalizedBoneNode('leftUpperLeg');
          const rightLeg = v.humanoid.getNormalizedBoneNode('rightUpperLeg');
          const leftKnee = v.humanoid.getNormalizedBoneNode('leftLowerLeg');
          const rightKnee = v.humanoid.getNormalizedBoneNode('rightLowerLeg');
          const leftArm = v.humanoid.getNormalizedBoneNode('leftUpperArm');
          const rightArm = v.humanoid.getNormalizedBoneNode('rightUpperArm');

          if (leftLeg && rightLeg && leftKnee && rightKnee && leftArm && rightArm) {
            leftLeg.rotation.x = Math.sin(t * walkFactor) * walkIntensity;
            rightLeg.rotation.x = -Math.sin(t * walkFactor) * walkIntensity;
            
            if (isRunning) {
              leftKnee.rotation.x = Math.max(0, -Math.sin(t * walkFactor) * walkIntensity * 2);
              rightKnee.rotation.x = Math.max(0, Math.sin(t * walkFactor) * walkIntensity * 2);
              leftArm.rotation.x = -Math.sin(t * walkFactor) * walkIntensity;
              rightArm.rotation.x = Math.sin(t * walkFactor) * walkIntensity;
              leftArm.rotation.z = 1.2;
              rightArm.rotation.z = -1.2;
            } else {
              leftKnee.rotation.x = 0;
              rightKnee.rotation.x = 0;
              leftArm.rotation.z = 1.2;
              rightArm.rotation.z = -1.2;
              leftArm.rotation.x = 0;
              rightArm.rotation.x = 0;
            }
          }
        }
        
        if (v.expressionManager) {
           v.expressionManager.setValue('blink', Math.sin(t * 5) > 0.95 ? 1 : 0);
           v.expressionManager.setValue('sad', 0);
        }
      }
      v.update(delta);
    } 
    
    // Handle regular GLB animation
    if (mixerRef.current) {
      if (disabled) {
        // Stop all animations if disabled
        mixerRef.current.stopAllAction();
      } else {
         const actions = actionsRef.current;
         const animNames = Object.keys(actions);
         if (animNames.length > 0) {
            // Find walk or run
            const walkKey = animNames.find(n => n.includes('walk') || n.includes('run'));
            const idleKey = animNames.find(n => n.includes('idle'));
            
            // simple state machine
            Object.values(actions).forEach(a => { a.setEffectiveWeight(0); });
            
            if (speed > 0) {
               if (walkKey && actions[walkKey]) {
                  const act = actions[walkKey];
                  act.setEffectiveWeight(1);
                  if (!act.isRunning()) act.play();
               } else if (actions[animNames[0]]) {
                  const act = actions[animNames[0]];
                  act.setEffectiveWeight(1);
                  if (!act.isRunning()) act.play();
               }
            } else {
               if (idleKey && actions[idleKey]) {
                  const act = actions[idleKey];
                  act.setEffectiveWeight(1);
                  if (!act.isRunning()) act.play();
               } else if (walkKey && actions[walkKey]) {
                  const act = actions[walkKey];
                  act.setEffectiveWeight(0); // Pause walk
                  act.stop();
               } else {
                  // Fallback to first animation if idle not found
                  const act = actions[animNames[0]];
                  if (act) {
                    act.setEffectiveWeight(1);
                    if (!act.isRunning()) act.play();
                  }
               }
            }
         }
         mixerRef.current.update(delta);
      }
    }
  });

  if (vrm) return <primitive object={vrm.scene} />;
  if (glbScene) return <primitive object={glbScene} />;
  return null;
}
