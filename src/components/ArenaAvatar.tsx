import React, { useEffect, useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM, VRMUtils } from '@pixiv/three-vrm';
import { MToonMaterialLoaderPlugin } from '@pixiv/three-vrm-materials-mtoon';
import { MToonNodeMaterial } from '@pixiv/three-vrm-materials-mtoon/nodes';
import * as THREE from 'three';
import { DEFAULT_VRM_URL } from '../store/useStore';
import { convertVRMMaterialsForWebGPU, isWebGPURendererActive } from '../utils/renderer';

export function ArenaAvatar({ url, disabled = false, speedRef, lastShotTime, lastShotTarget, playerPosition }: { url?: string, disabled?: boolean, speedRef?: React.MutableRefObject<number>, lastShotTime?: number, lastShotTarget?: [number, number, number], playerPosition?: [number, number, number] }) {
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
      return new VRMLoaderPlugin(parser, {
        mtoonMaterialPlugin: new MToonMaterialLoaderPlugin(parser, {
          materialType: undefined,
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
              if (obj instanceof THREE.Mesh) {
                obj.castShadow = true;
                obj.frustumCulled = true;
                if (obj.geometry) {
                  if (!obj.geometry.boundingSphere) {
                    obj.geometry.computeBoundingSphere();
                  }
                  if (obj.geometry.boundingSphere) {
                    obj.geometry.boundingSphere.radius = Math.max(obj.geometry.boundingSphere.radius, 2.0);
                  }
                }
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
              if (obj instanceof THREE.Mesh) {
                obj.castShadow = true;
                obj.frustumCulled = true;
                if (obj.geometry) {
                  if (!obj.geometry.boundingSphere) {
                    obj.geometry.computeBoundingSphere();
                  }
                  if (obj.geometry.boundingSphere) {
                    obj.geometry.boundingSphere.radius = Math.max(obj.geometry.boundingSphere.radius, 2.0);
                  }
                }
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
        (err: any) => {
          console.error(`Failed to load Avatar model from ${targetUrl}:`, err);
          const isHtmlError = err instanceof SyntaxError || 
                              (err && typeof err === 'object' && err.message && (
                                err.message.includes('Unexpected token') || 
                                err.message.includes('<!doctype') || 
                                err.message.includes('JSON')
                              )) ||
                              (typeof err === 'string' && (
                                err.includes('Unexpected token') || 
                                err.includes('<!doctype') || 
                                err.includes('JSON')
                              ));

          if (retries > 0 && !isHtmlError) {
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

    const isShootingRecent = lastShotTime && (Date.now() - lastShotTime < 1000);
    let shootingPitch = 0;
    if (isShootingRecent && lastShotTarget && playerPosition) {
      const dx = lastShotTarget[0] - playerPosition[0];
      const dy = lastShotTarget[1] - (playerPosition[1] + 1.25);
      const dz = lastShotTarget[2] - playerPosition[2];
      const dist2D = Math.sqrt(dx * dx + dz * dz);
      if (dist2D > 0.1) {
        shootingPitch = Math.atan2(dy, dist2D);
      }
    }

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
          const rightLowerArm = v.humanoid.getNormalizedBoneNode('rightLowerArm');
          const head = v.humanoid.getNormalizedBoneNode('head');

          if (leftLeg && rightLeg && leftKnee && rightKnee && leftArm && rightArm) {
            leftLeg.rotation.x = Math.sin(t * walkFactor) * walkIntensity;
            rightLeg.rotation.x = -Math.sin(t * walkFactor) * walkIntensity;
            
            if (isRunning) {
              leftKnee.rotation.x = Math.max(0, -Math.sin(t * walkFactor) * walkIntensity * 2);
              rightKnee.rotation.x = Math.max(0, Math.sin(t * walkFactor) * walkIntensity * 2);
            } else {
              leftKnee.rotation.x = 0;
              rightKnee.rotation.x = 0;
            }

            if (isShootingRecent) {
              // Right Arm points forward adjusted by target pitch
              rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, -1.4 - shootingPitch, 15 * delta);
              rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, -0.15, 15 * delta);
              rightArm.rotation.y = THREE.MathUtils.lerp(rightArm.rotation.y, 0.0, 15 * delta);
              
              if (rightLowerArm) {
                rightLowerArm.rotation.x = THREE.MathUtils.lerp(rightLowerArm.rotation.x, -0.15, 15 * delta);
              }

              // Left Arm in tactical gun bracing/supporting pose
              leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, -0.6, 12 * delta);
              leftArm.rotation.z = THREE.MathUtils.lerp(leftArm.rotation.z, 0.4, 12 * delta);
              leftArm.rotation.y = THREE.MathUtils.lerp(leftArm.rotation.y, 0.0, 12 * delta);

              if (head) {
                head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, -shootingPitch, 15 * delta);
              }
            } else {
              if (isRunning) {
                leftArm.rotation.x = -Math.sin(t * walkFactor) * walkIntensity;
                rightArm.rotation.x = Math.sin(t * walkFactor) * walkIntensity;
                leftArm.rotation.z = 1.2;
                rightArm.rotation.z = -1.2;
              } else {
                leftArm.rotation.z = 1.2;
                rightArm.rotation.z = -1.2;
                leftArm.rotation.x = 0;
                rightArm.rotation.x = 0;
              }
              if (rightLowerArm) rightLowerArm.rotation.x = 0;
              if (head) head.rotation.x = 0;
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
  
  // High-contrast futuristic cyber-mesh fallback for Arena
  return (
    <group position={[0, 0.9, 0]}>
      <mesh>
        <capsuleGeometry args={[0.3, 0.9, 8, 16]} />
        <meshBasicMaterial 
          color="#f43f5e" 
          wireframe 
          transparent 
          opacity={0.65} 
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
