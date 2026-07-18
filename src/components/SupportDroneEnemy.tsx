/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useMemo, useState, useEffect } from 'react';
import { SafeModel } from './SafeModel';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, BallCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { useGameStore, EnemyData, EntityState } from '../store';
import { useStore } from '../store/useStore';
import { getTranslation } from '../utils/translations';
import { getProxyUrl } from '../utils/proxy';
import { useGLTF, useAnimations, Html } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import { soundManager } from '../utils/soundManager';
import { idleTaskQueue } from '../utils/idleTaskQueue';

interface SupportDroneModelProps {
  disabled?: boolean;
}

function SupportDroneModel({ disabled }: SupportDroneModelProps) {
  const group = useRef<THREE.Group>(null);
  
  // Load standard Drone GLB from storage
  const { scene, animations } = useGLTF(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/Drone.glb'));
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions } = useAnimations(animations, group);
  const materials = useRef<THREE.MeshStandardMaterial[]>([]);

  useEffect(() => {
    if (clone) {
      const mats: THREE.MeshStandardMaterial[] = [];
      clone.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          obj.frustumCulled = true;
          if (obj.geometry) {
            if (!obj.geometry.boundingSphere) {
              obj.geometry.computeBoundingSphere();
            }
            if (obj.geometry.boundingSphere) {
              obj.geometry.boundingSphere.radius = Math.max(obj.geometry.boundingSphere.radius, 2.0);
            }
          }
          
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material = obj.material.map(m => {
                const clonedMat = m.clone();
                if (clonedMat instanceof THREE.MeshStandardMaterial) mats.push(clonedMat);
                return clonedMat;
              });
            } else {
              const clonedMat = obj.material.clone();
              obj.material = clonedMat;
              if (clonedMat instanceof THREE.MeshStandardMaterial) mats.push(clonedMat);
            }
          }
        }
      });
      materials.current = mats;
    }

    return () => {
      if (materials.current.length > 0) {
        materials.current.forEach((mat) => {
          idleTaskQueue.enqueue(() => {
            if (typeof mat.dispose === 'function') mat.dispose();
          });
        });
      }
      if (clone) {
        idleTaskQueue.disposeDeferred(clone);
      }
    };
  }, [clone]);

  useEffect(() => {
    // Spin/Fly animations
    if (disabled) {
      Object.values(actions).forEach(action => action?.stop());
      return;
    }
    const spinKey = Object.keys(actions).find(name => name.toLowerCase().includes('spin') || name.toLowerCase().includes('fly') || name.toLowerCase().includes('hover')) || Object.keys(actions)[0];
    const action = spinKey ? actions[spinKey] : null;
    if (action) {
      action.reset().fadeIn(0.25).play();
      action.timeScale = 1.8; // spin ultra fast
    }
  }, [disabled, actions]);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    materials.current.forEach((mat) => {
      const pulse = 0.8 + Math.sin(t * 8.0) * 0.4;
      mat.emissive.setRGB(pulse * 1.0, pulse * 0.32, 0.0); // Neon Orange pulse
      mat.emissiveIntensity = pulse * 3.5;
    });

    if (disabled && group.current) {
      // Deactivated/crashing tumbling spin
      group.current.rotation.x += delta * 12.0;
      group.current.rotation.y += delta * 8.0;
    }
  });

  return (
    <group ref={group}>
      <primitive object={clone} />
    </group>
  );
}

function SupportDroneFallbackVisuals({ disabled, paintProgress }: { disabled: boolean; paintProgress: number }) {
  const centralEyeRef = useRef<THREE.Mesh>(null);
  const rotorRef1 = useRef<THREE.Mesh>(null);
  const rotorRef2 = useRef<THREE.Mesh>(null);
  const rotorRef3 = useRef<THREE.Mesh>(null);
  const rotorRef4 = useRef<THREE.Mesh>(null);
  const turretRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    if (disabled) {
      return;
    }

    const spinSpeed = 24.0;
    if (rotorRef1.current) rotorRef1.current.rotation.y += spinSpeed * 0.1;
    if (rotorRef2.current) rotorRef2.current.rotation.y += spinSpeed * 0.1;
    if (rotorRef3.current) rotorRef3.current.rotation.y += spinSpeed * 0.1;
    if (rotorRef4.current) rotorRef4.current.rotation.y += spinSpeed * 0.1;

    if (centralEyeRef.current && centralEyeRef.current.material) {
      const mat = centralEyeRef.current.material as THREE.MeshBasicMaterial;
      const intensity = 1.0 + Math.sin(t * 12.0) * 0.4;
      
      // Eye flashes intensely red as target lock nears completion (2s)
      const lockPercent = Math.min(1.0, paintProgress / 2.0);
      const r = THREE.MathUtils.lerp(1.0, 1.2, lockPercent);
      const g = THREE.MathUtils.lerp(0.32, 0.0, lockPercent);
      mat.color.setRGB(r * intensity, g * intensity, 0.0);
    }
  });

  return (
    <group>
      {/* Central Drone Core Body Frame */}
      <mesh position={[0, 0, 0]} castShadow>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshStandardMaterial color="#334155" roughness={0.3} metalness={0.8} />
      </mesh>

      {/* Glowing Orange Tracking Eye */}
      <mesh ref={centralEyeRef} position={[0, -0.04, 0.16]}>
        <sphereGeometry args={[0.08, 10, 10]} />
        <meshBasicMaterial color="#ff5100" toneMapped={false} />
      </mesh>

      {/* Underslung tactical micro-turret gimbal */}
      <group ref={turretRef} position={[0, -0.22, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.07, 8, 8]} />
          <meshStandardMaterial color="#1e293b" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, 0.08]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.14, 6]} />
          <meshStandardMaterial color="#0f172a" metalness={0.9} />
        </mesh>
      </group>

      {/* Quadcopter radiating strut arms */}
      {/* Arm 1 North-East */}
      <group position={[0.22, 0.08, 0.22]} rotation={[0, Math.PI / 4, 0.1]}>
        <mesh castShadow>
          <boxGeometry args={[0.26, 0.025, 0.045]} />
          <meshStandardMaterial color="#1e293b" metalness={0.5} />
        </mesh>
        <mesh ref={rotorRef1} position={[0.12, 0.025, 0]}>
          <boxGeometry args={[0.18, 0.005, 0.02]} />
          <meshBasicMaterial color="#ff5100" toneMapped={false} transparent opacity={0.65} />
        </mesh>
      </group>

      {/* Arm 2 South-East */}
      <group position={[0.22, 0.08, -0.22]} rotation={[0, -Math.PI / 4, 0.1]}>
        <mesh castShadow>
          <boxGeometry args={[0.26, 0.025, 0.045]} />
          <meshStandardMaterial color="#1e293b" metalness={0.5} />
        </mesh>
        <mesh ref={rotorRef2} position={[0.12, 0.025, 0]}>
          <boxGeometry args={[0.18, 0.005, 0.02]} />
          <meshBasicMaterial color="#ff5100" toneMapped={false} transparent opacity={0.65} />
        </mesh>
      </group>

      {/* Arm 3 North-West */}
      <group position={[-0.22, 0.08, 0.22]} rotation={[0, -Math.PI / 4, -0.1]}>
        <mesh castShadow>
          <boxGeometry args={[0.26, 0.025, 0.045]} />
          <meshStandardMaterial color="#1e293b" metalness={0.5} />
        </mesh>
        <mesh ref={rotorRef3} position={[-0.12, 0.025, 0]}>
          <boxGeometry args={[0.18, 0.005, 0.02]} />
          <meshBasicMaterial color="#ff5100" toneMapped={false} transparent opacity={0.65} />
        </mesh>
      </group>

      {/* Arm 4 South-West */}
      <group position={[-0.22, 0.08, -0.22]} rotation={[0, Math.PI / 4, -0.1]}>
        <mesh castShadow>
          <boxGeometry args={[0.26, 0.025, 0.045]} />
          <meshStandardMaterial color="#1e293b" metalness={0.5} />
        </mesh>
        <mesh ref={rotorRef4} position={[-0.12, 0.025, 0]}>
          <boxGeometry args={[0.18, 0.005, 0.02]} />
          <meshBasicMaterial color="#ff5100" toneMapped={false} transparent opacity={0.65} />
        </mesh>
      </group>
    </group>
  );
}

export function SupportDroneEnemy({ data }: { data: EnemyData }) {
  const showEnemyHealthBars = useStore(state => state.showEnemyHealthBars);
  const language = useStore(state => state.language);
  const body = useRef<RapierRigidBody>(null);
  const { camera } = useThree();

  const gameState = useGameStore(state => state.gameState);
  const playerState = useGameStore(state => state.playerState);
  const hitPlayer = useGameStore(state => state.hitPlayer);
  const addLaser = useGameStore(state => state.addLaser);
  const addParticles = useGameStore(state => state.addParticles);

  const [paintProgress, setPaintProgress] = useState(0);

  const lastHealth = useRef(data.health ?? 2.4);
  const lastBotState = useRef(data.state);

  const lastStandardShot = useRef(0);
  const groupRef = useRef<THREE.Group>(null);
  
  // Target Lock state properties
  const targetLockStartTime = useRef(0);
  const targetLockFiring = useRef(false);
  const targetLockBurstCount = useRef(0);
  const targetLockLastBurstShot = useRef(0);

  useEffect(() => {
    const healthDropped = data.health !== undefined && data.health < lastHealth.current;
    const isNowDisabled = data.state === 'disabled' && lastBotState.current === 'active';

    if (healthDropped || isNowDisabled) {
      if (isNowDisabled) {
        soundManager.playScoreBig();
      } else {
        soundManager.playImpact();
      }
    }
    lastHealth.current = data.health ?? 2.4;
    lastBotState.current = data.state;
  }, [data.health, data.state]);

  useFrame((state, delta) => {
    if (!body.current || gameState !== 'playing') return;

    const pos = body.current.translation();
    const currentPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    const playerPos = new THREE.Vector3().copy(camera.position);

    const toPlayerVec = new THREE.Vector3().subVectors(playerPos, currentPos);
    const distToPlayer = toPlayerVec.length();

    // 1. CRASH DEACTIVATION SIMULATOR
    if (data.state === 'disabled') {
      // Operator killed first, drone loses signal and crashes harmlessly
      body.current.setLinvel({ x: 0, y: -9.8, z: 0 }, true);
      
      // lost signal tumbling spinning feedback
      if (groupRef.current) {
        groupRef.current.rotation.x += delta * 15.0;
        groupRef.current.rotation.z += delta * 10.0;
        // spawn deactivation electric blue sparks/gray smoke
        if (Math.random() < 0.15) {
          addParticles([pos.x, pos.y, pos.z], '#64748b');
        }
      }
      return;
    }

    // 2. ORBIT & FLY FLANK PATTERNS
    // Find our linked operator to coordinate orbiting paths
    const opId = data.id.replace('-drone', '');
    const companionOperator = useGameStore.getState().enemies?.find(e => e.id === opId);
    
    // Default orbit centroid: fly slightly above the Drone Operator if active, otherwise orbit in place
    let targetOrbitCenter = currentPos.clone();
    if (companionOperator && companionOperator.state === 'active') {
      const parentPos = new THREE.Vector3(...companionOperator.position);
      targetOrbitCenter.copy(parentPos).setY(4.5); // float 4.5 meters above operator
    } else {
      // float 4.0 meters above baseline arena floor
      targetOrbitCenter.set(currentPos.x, 4.0, currentPos.z);
    }

    // High velocity flying strafe movement:
    const t = state.clock.getElapsedTime();
    const orbitAngle = t * 1.5 + (data.id.charCodeAt(data.id.length - 1) * 0.5);
    
    // Add horizontal circular offset to orbit center to flanked position
    const hoverTarget = targetOrbitCenter.clone().add(new THREE.Vector3(
      Math.sin(orbitAngle) * 5.0,
      Math.cos(t * 3.0) * 0.6, // Rapid rhythmic vertical bouncing
      Math.cos(orbitAngle) * 5.0
    ));

    // Vector direction to hover target
    const hoverDirection = new THREE.Vector3().subVectors(hoverTarget, currentPos);
    const hoverDist = hoverDirection.length();
    
    const DRONE_FLY_SPEED = 4.2; // very fast hovers and elevation shifts
    
    const moveVel = hoverDirection.normalize().multiplyScalar(Math.min(DRONE_FLY_SPEED, hoverDist * 1.8));
    
    body.current.setLinvel({
      x: moveVel.x,
      y: moveVel.y,
      z: moveVel.z
    }, true);

    // Keep Perfectly Level Hovering Physics (0 pitch/roll by default unless tumbling)
    if (groupRef.current) {
      const lookAngle = Math.atan2(toPlayerVec.x, toPlayerVec.z);
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, lookAngle, 0.1);
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, 0, 0.15);
      groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, 0, 0.15);
    }

    // 3. TARGET LOCK SPECIAL ABILITY & MICRO-TURRET WEAPONRY
    const now = Date.now();
    const isPositionInSafeZone = (x: number, z: number) => {
      return Math.sqrt(x * x + z * z) < 10.5;
    };
    const playerInSafeZone = isPositionInSafeZone(camera.position.x, camera.position.z);
    const canPaint = distToPlayer < 24.0 && playerState === 'active' && !playerInSafeZone;

    if (canPaint && !targetLockFiring.current) {
      if (targetLockStartTime.current === 0) {
        targetLockStartTime.current = now;
      }
      
      const elapsed = (now - targetLockStartTime.current) / 1000;
      setPaintProgress(elapsed);

      // Trigger Target Lock burst after 2 seconds continuous laser hold!
      if (elapsed >= 2.0) {
        targetLockFiring.current = true;
        targetLockBurstCount.current = 4; // 4 micro-projectiles burst
        targetLockLastBurstShot.current = now;
      }
    } else {
      if (!targetLockFiring.current) {
        targetLockStartTime.current = 0;
        setPaintProgress(0);
      }
    }

    // A. Handle Locked Burst Firing Mechanics
    if (targetLockFiring.current && targetLockBurstCount.current > 0 && now - targetLockLastBurstShot.current > 120) {
      targetLockBurstCount.current--;
      targetLockLastBurstShot.current = now;

      soundManager.playLaser(); // Play high fire rate micro-turret zaps

      const beamStart: [number, number, number] = [pos.x, pos.y - 0.12, pos.z];
      const beamEnd: [number, number, number] = [
        camera.position.x + (Math.random() - 0.5) * 0.15, // perfectly accurate minimal variance
        camera.position.y + (Math.random() - 0.5) * 0.15,
        camera.position.z + (Math.random() - 0.5) * 0.15
      ];

      addLaser(beamStart, beamEnd, '#ff5100'); // glowing neon orange laser sight fire beam
      hitPlayer(4); // deals 4 damage per micro-projectile (16 total per lock burst)
      
      addParticles(beamEnd, '#ff3c00');

      if (targetLockBurstCount.current === 0) {
        // Complete burst lock, reset timer for lock cycle cooldowned
        targetLockFiring.current = false;
        targetLockStartTime.current = now + 2500; // 2.5s lock cooldown
        setPaintProgress(0);
      }
    }

    // B. Handle Slow Chip Damage Micro-Turret Firing
    const slowTurretCooldown = 1500;
    const canFireSlowChip = !targetLockFiring.current && distToPlayer < 28.0 && playerState === 'active' && !playerInSafeZone && now - lastStandardShot.current > slowTurretCooldown;
    
    if (canFireSlowChip) {
      lastStandardShot.current = now;
      
      soundManager.playLaser();

      const beamStart: [number, number, number] = [pos.x, pos.y - 0.12, pos.z];
      const beamEnd: [number, number, number] = [
        camera.position.x + (Math.random() - 0.5) * 1.5, // slightly less accurate standard spray
        camera.position.y + (Math.random() - 0.5) * 1.5,
        camera.position.z + (Math.random() - 0.5) * 1.5
      ];

      addLaser(beamStart, beamEnd, '#ffad73'); // soft chip laser beam
      
      const rayDir = new THREE.Vector3().subVectors(new THREE.Vector3(...beamEnd), new THREE.Vector3(...beamStart)).normalize();
      const dot = toPlayerVec.clone().normalize().dot(rayDir);
      
      if (dot > 0.95) {
        hitPlayer(2); // slow low-intensityチップ damage
        addParticles(beamEnd, '#ffa366');
      }
    }
  });

  // Calculate painter laser characteristics
  const paintLine = useMemo(() => {
    if (data.state === 'disabled' || paintProgress === 0 || playerState !== 'active') return null;
    const lockPercent = Math.min(1.0, paintProgress / 2.0);
    // Becomes intensely glowing thick red laser paint closer to 1.0
    const color = lockPercent > 0.8 ? '#ff0000' : '#ff5100';
    const opacity = 0.2 + lockPercent * 0.7;
    return { color, opacity };
  }, [paintProgress, data.state, playerState]);

  return (
    <group>
      {/* Laser sight painter active mesh line targeted directly from drone to camera */}
      {paintLine && (
        <mesh position={[
          (data.position[0] * 0.1 + camera.position.x * 0.9 + data.position[0]) / 2, // approximation fallback
          (data.position[1] * 0.1 + camera.position.y * 0.9 + data.position[1]) / 2,
          (data.position[2] * 0.1 + camera.position.z * 0.9 + data.position[2]) / 2
        ]}>
          <lineBasicMaterial color={paintLine.color} transparent opacity={paintLine.opacity} depthWrite={false} />
        </mesh>
      )}

      <RigidBody
        ref={body}
        type="kinematicVelocity"
        position={data.position}
        userData={{ name: data.id }}
        enabledRotations={[false, false, false]}
        colliders={false}
      >
        <BallCollider args={[0.35]} position={[0, 0, 0]} />

        {/* 3D Visual Mesh attachment */}
        <group ref={groupRef}>
          <SafeModel fallback={<SupportDroneFallbackVisuals disabled={data.state === 'disabled'} paintProgress={paintProgress} />}>
            <SupportDroneModel disabled={data.state === 'disabled'} />
          </SafeModel>
          {/* Neon laser painter pointer vector from client-side direct mesh lines mapping */}
          {paintProgress > 0 && data.state === 'active' && (
            <mesh position={[0, -0.15, 6.0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.005, 0.005, 12, 4]} />
              <meshBasicMaterial 
                color={paintProgress >= 1.8 ? '#ff0000' : '#ff5100'} 
                toneMapped={false} 
                transparent 
                opacity={0.35 + (paintProgress / 2.0) * 0.65} 
              />
            </mesh>
          )}
        </group>

        {/* Floating Tag display overlay */}
        {showEnemyHealthBars && (
          <Html
            position={[0, 0.7, 0]}
            center
            distanceFactor={18}
            style={{ pointerEvents: 'none' }}
            zIndexRange={[100, 0]}
          >
            <div className="flex flex-col items-center gap-0.5 select-none font-mono text-[8px] sm:text-[9px]">
              {paintProgress > 0 && data.state === 'active' && (
                <div className="bg-red-600 text-white px-1 py-0.2 rounded font-bold animate-ping text-[6px]">
                  {getTranslation(language, 'enemyAcquiringTargetLock')} [{(paintProgress / 2 * 100).toFixed(0)}%]
                </div>
              )}
              <div className={`px-1.5 py-0.2 rounded border shadow-[0_0_4px_rgba(255,81,0,0.5)] ${
                paintProgress > 1.2
                  ? 'bg-red-950/90 text-red-400 border-red-500 animate-pulse'
                  : 'bg-slate-900/90 text-orange-400 border-orange-500/50'
              }`}>
                {paintProgress > 0 ? getTranslation(language, 'enemyTargetAcquire') : `${getTranslation(language, 'enemyHarassDrone')} #${data.id.replace('bot-', '').replace('-drone', '')}`}
              </div>
            </div>
          </Html>
        )}
      </RigidBody>
    </group>
  );
}
