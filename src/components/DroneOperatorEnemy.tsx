/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useMemo, useState, useEffect } from 'react';
import { SafeModel } from './SafeModel';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { useGameStore, EnemyData, EntityState } from '../store';
import { useStore } from '../store/useStore';
import { getTranslation } from '../utils/translations';
import { getProxyUrl } from '../utils/proxy';
import { useGLTF, useAnimations, Html } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import { soundManager } from '../utils/soundManager';
import { idleTaskQueue } from '../utils/idleTaskQueue';

interface DroneOperatorModelProps {
  disabled?: boolean;
  speed?: number;
  hitTrigger?: number;
  isStunned?: boolean;
}

function DroneOperatorModel({ disabled, speed, hitTrigger, isStunned }: DroneOperatorModelProps) {
  const group = useRef<THREE.Group>(null);
  
  // Load standard DroneOperator GLB from storage
  const { scene, animations } = useGLTF(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/DroneOperator.glb'));
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions } = useAnimations(animations, group);
  const materials = useRef<THREE.MeshStandardMaterial[]>([]);
  const flashTimer = useRef(0);
  const lastHitTrigger = useRef(0);

  // Operator crouch typing or idle animations
  const crouchAction = useMemo(() => {
    const key = Object.keys(actions).find(name => 
      name.toLowerCase().includes('crouch') || 
      name.toLowerCase().includes('type') || 
      name.toLowerCase().includes('tablet') ||
      name.toLowerCase().includes('sit')
    ) || Object.keys(actions)[1];
    return key ? actions[key] : null;
  }, [actions]);

  const idleAction = useMemo(() => {
    const key = Object.keys(actions).find(name => 
      name.toLowerCase().includes('idle') || 
      name.toLowerCase().includes('stand')
    ) || Object.keys(actions)[0];
    return key ? actions[key] : null;
  }, [actions]);

  const walkAction = useMemo(() => {
    const key = Object.keys(actions).find(name => 
      name.toLowerCase().includes('walk') || 
      name.toLowerCase().includes('run') ||
      name.toLowerCase().includes('move')
    );
    return key ? actions[key] : null;
  }, [actions]);

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
    if (disabled) {
      Object.values(actions).forEach(action => action?.stop());
      return;
    }

    Object.values(actions).forEach(action => action?.stop());
    if (isStunned) {
      const stunAct = actions['hit'] || actions['stagger'] || Object.values(actions)[0];
      if (stunAct) stunAct.reset().fadeIn(0.1).play();
    } else if (speed && speed > 0 && walkAction) {
      walkAction.reset().fadeIn(0.2).play();
    } else if (crouchAction) {
      crouchAction.reset().fadeIn(0.25).play();
    } else if (idleAction) {
      idleAction.reset().fadeIn(0.25).play();
    }
  }, [disabled, speed, actions, crouchAction, idleAction, walkAction, isStunned]);

  useEffect(() => {
    if (hitTrigger && hitTrigger !== lastHitTrigger.current) {
      lastHitTrigger.current = hitTrigger;
      flashTimer.current = 1.0;
    }
  }, [hitTrigger]);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    materials.current.forEach((mat) => {
      if (flashTimer.current > 0) {
        flashTimer.current = Math.max(0, flashTimer.current - delta * 4.0);
        mat.emissive.setRGB(flashTimer.current * 0.95, flashTimer.current * 0.25, 0);
        mat.emissiveIntensity = flashTimer.current * 5.0;
      } else {
        const pulse = 0.7 + Math.sin(t * 4.0) * 0.3;
        mat.emissive.setRGB(pulse * 1.0, pulse * 0.32, 0.0); // Neon Orange pulse
        mat.emissiveIntensity = pulse * 2.2;
      }
    });

    if (disabled && group.current) {
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, -Math.PI / 2.05, 0.12);
      group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, 0.02, 0.12);
    } else if (group.current) {
      let b = 0;
      if (isStunned) {
        b = Math.sin(t * 30.0) * 0.08; // heavy shaking stun feedback
      } else if (speed && speed > 0) {
        b = Math.sin(t * 14.0) * 0.06;
      } else {
        b = Math.sin(t * 3.0) * 0.02; // soft crouch idle bob
      }
      group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, b, 0.15);
    }
  });

  return (
    <group ref={group}>
      <primitive object={clone} />
    </group>
  );
}

function DroneOperatorFallbackVisuals({ isStunned, speed }: { isStunned: boolean; speed: number }) {
  const visorRef = useRef<THREE.Mesh>(null);
  const tabletRef = useRef<THREE.Mesh>(null);
  const antennaRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (visorRef.current && visorRef.current.material) {
      const p = 1.0 + Math.sin(t * (isStunned ? 25.0 : 6.0)) * 0.4;
      const mat = visorRef.current.material as THREE.MeshBasicMaterial;
      mat.color.setRGB(p * 1.0, p * 0.3, 0.0);
    }
    if (tabletRef.current && tabletRef.current.material) {
      const p = 1.2 + Math.sin(t * 15.0) * 0.5;
      const mat = tabletRef.current.material as THREE.MeshBasicMaterial;
      mat.color.setRGB(0.0, p * 0.5, p * 1.0); // glowing blueprint control tablet
    }
    if (antennaRef.current) {
      antennaRef.current.rotation.y = t * 1.5;
    }
  });

  // Crouch configuration
  const crouchYOffset = -0.3;

  return (
    <group>
      {/* Crouched operator capsule representation */}
      <mesh position={[0, 0.65 + crouchYOffset, 0]}>
        <cylinderGeometry args={[0.22, 0.28, 1.0, 10]} />
        <meshStandardMaterial color="#475569" roughness={0.6} metalness={0.5} />
      </mesh>

      {/* Heavy Communications Backpack */}
      <group position={[0, 0.75 + crouchYOffset, -0.22]}>
        <mesh castShadow>
          <boxGeometry args={[0.3, 0.48, 0.18]} />
          <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.7} />
        </mesh>
        
        {/* Antennas projecting upwards */}
        <group ref={antennaRef}>
          <mesh position={[-0.08, 0.32, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 0.45, 6]} />
            <meshStandardMaterial color="#0f172a" metalness={0.9} />
          </mesh>
          <mesh position={[-0.08, 0.52, 0]}>
            <sphereGeometry args={[0.03, 6, 6]} />
            <meshBasicMaterial color="#ff5100" toneMapped={false} />
          </mesh>

          <mesh position={[0.08, 0.4, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.55, 6]} />
            <meshStandardMaterial color="#0f172a" metalness={0.9} />
          </mesh>
          <mesh position={[0.08, 0.65, 0]}>
            <sphereGeometry args={[0.025, 6, 6]} />
            <meshBasicMaterial color="#ff5100" toneMapped={false} />
          </mesh>
        </group>
      </group>

      {/* Ruggedized control tablet held forward */}
      <group position={[0, 0.6 + crouchYOffset, 0.28]} rotation={[0.4, 0, 0]}>
        {/* Tablet frame */}
        <mesh castShadow>
          <boxGeometry args={[0.3, 0.02, 0.2]} />
          <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.8} />
        </mesh>
        {/* Glowing blueprint interactive face */}
        <mesh ref={tabletRef} position={[0, 0.011, 0]}>
          <planeGeometry args={[0.26, 0.16]} />
          <meshBasicMaterial color="#38bdf8" toneMapped={false} />
        </mesh>
      </group>

      {/* Cybernetic Visor helmet */}
      <group position={[0, 1.25 + crouchYOffset, 0.05]}>
        <mesh castShadow>
          <sphereGeometry args={[0.18, 12, 12]} />
          <meshStandardMaterial color="#0f172a" roughness={0.15} metalness={0.9} />
        </mesh>
        {/* Neon Orange visor horizontal strip */}
        <mesh ref={visorRef} position={[0, 0.04, 0.11]}>
          <boxGeometry args={[0.22, 0.04, 0.08]} />
          <meshBasicMaterial color="#ff5100" toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

export function DroneOperatorEnemy({ data }: { data: EnemyData }) {
  const showEnemyHealthBars = useStore(state => state.showEnemyHealthBars);
  const language = useStore(state => state.language);
  const body = useRef<RapierRigidBody>(null);
  const { camera } = useThree();

  const gameState = useGameStore(state => state.gameState);
  const playerState = useGameStore(state => state.playerState);
  const hitPlayer = useGameStore(state => state.hitPlayer);
  const addLaser = useGameStore(state => state.addLaser);
  const addParticles = useGameStore(state => state.addParticles);

  const [speed, setSpeed] = useState(0);
  const [hitTrigger, setHitTrigger] = useState(0);

  const lastHealth = useRef(data.health ?? 4.8);
  const lastBotState = useRef(data.state);

  const lastSMGTime = useRef(0);
  const groupRef = useRef<THREE.Group>(null);
  
  // Custom SMG Burst sequence properties
  const burstCount = useRef(0);
  const lastBurstShot = useRef(0);

  // Stun status is heavily extended if Support Drone is destroyed first
  const isStunned = data.dodgeTime !== undefined && Date.now() - data.dodgeTime < 3800;

  useEffect(() => {
    const healthDropped = data.health !== undefined && data.health < lastHealth.current;
    const isNowDisabled = data.state === 'disabled' && lastBotState.current === 'active';

    if (healthDropped || isNowDisabled) {
      setHitTrigger(p => p + 1);
      if (isNowDisabled) {
        soundManager.playScoreBig();
      } else {
        soundManager.playImpact();
      }
    }
    lastHealth.current = data.health ?? 4.8;
    lastBotState.current = data.state;
  }, [data.health, data.state]);

  useFrame((state, delta) => {
    if (!body.current || gameState !== 'playing') return;

    if (data.state === 'disabled') {
      body.current.setLinvel({ x: 0, y: -4, z: 0 }, true);
      return;
    }

    const pos = body.current.translation();
    const currentPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    const playerPos = new THREE.Vector3().copy(camera.position);

    const toPlayerVec = new THREE.Vector3().subVectors(playerPos, currentPos);
    toPlayerVec.y = 0;
    const distToPlayer = toPlayerVec.length();

    // 1. STUN STABILIZER: Can't move or act if operators tablet recently short-circuited/exploded!
    if (isStunned) {
      body.current.setLinvel({ x: 0, y: body.current.linvel().y, z: 0 }, true);
      setSpeed(0);
      
      // Spawn rapid malfunction electric blue particles
      if (Math.random() < 0.3) {
        addParticles([pos.x + (Math.random() - 0.5) * 1.5, pos.y + 1.2 + (Math.random() - 0.5) * 1.0, pos.z + (Math.random() - 0.5) * 1.5], '#38bdf8');
      }
      return;
    }

    // 2. TACTICAL DECISIONS & ESCAPE MECHANICS
    let targetCover: THREE.Vector3 | null = null;
    
    // Choose cover or sentinel shield buddy to stand behind:
    const activeSentinel = useGameStore.getState().enemies?.find(
      e => (e.type === 'sentinel' || e.type === 'overseer') && e.id !== data.id && e.state === 'active'
    );

    if (activeSentinel) {
      const sentPos = new THREE.Vector3(...activeSentinel.position);
      const dirFromPlayer = new THREE.Vector3().subVectors(sentPos, playerPos).setY(0).normalize();
      
      // Stand directly behind the sentinel
      targetCover = sentPos.clone().addScaledVector(dirFromPlayer, 2.5);
    } else {
      // Find coordinates furthest from the player to hide safely
      const coverCoordinates = [
        new THREE.Vector3(45, 1, 45),
        new THREE.Vector3(-45, 1, 45),
        new THREE.Vector3(45, 1, -45),
        new THREE.Vector3(-45, 1, -45),
        new THREE.Vector3(-18, 1, 0),
        new THREE.Vector3(0, 1, -50),
        new THREE.Vector3(65, 1, 10),
        new THREE.Vector3(-65, 1, -10)
      ];

      // Pick cover furthest from the player, but reasonably close to current operator
      let bestCover = coverCoordinates[0];
      let bestWeight = -Infinity;

      coverCoordinates.forEach(c => {
        const dPlayer = c.distanceTo(playerPos);
        const dMe = c.distanceTo(currentPos);
        
        // Weight covers that are far from player, but relatively close to current pos
        const weight = dPlayer - dMe * 0.4;
        if (weight > bestWeight) {
          bestWeight = weight;
          bestCover = c;
        }
      });
      targetCover = bestCover;
    }

    // 3. MOTION INTEGRATION toward hideTarget
    const moveDirection = new THREE.Vector3();
    let currentSpeed = 0;
    const OPERATOR_FAST_SPEED = 2.4;

    if (targetCover && targetCover.distanceTo(currentPos) > 2.0 && distToPlayer > 5.0) {
      // Operator heads to cover rapidly!
      moveDirection.subVectors(targetCover, currentPos).setY(0).normalize();
      currentSpeed = OPERATOR_FAST_SPEED;
    } else {
      // Arrived under cover or Sentinel shadow; crouch stationary to type/control
      currentSpeed = 0;
    }

    const vel = body.current.linvel();
    body.current.setLinvel({
      x: moveDirection.x * currentSpeed,
      y: vel.y,
      z: moveDirection.z * currentSpeed
    }, true);
    setSpeed(currentSpeed);

    // Dynamic snap rotation to face safety position or face player if blind firing
    if (groupRef.current) {
      if (currentSpeed > 0 && moveDirection.lengthSq() > 0.05) {
        const targetAngle = Math.atan2(moveDirection.x, moveDirection.z);
        groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetAngle, 0.15);
      } else {
        // Face player while stationary typing
        const lookAngle = Math.atan2(toPlayerVec.x, toPlayerVec.z);
        groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, lookAngle, 0.1);
      }
    }

    // 4. WEAPONRY: SMG Blind Fire Over Cover
    const now = Date.now();
    const isPositionInSafeZone = (x: number, z: number) => {
      return Math.sqrt(x * x + z * z) < 10.5;
    };
    const playerInSafeZone = isPositionInSafeZone(camera.position.x, camera.position.z);
    
    const canTriggerSMG = distToPlayer < 7.0 && playerState === 'active' && !playerInSafeZone && now - lastSMGTime.current > 2200 && burstCount.current === 0;
    
    if (canTriggerSMG) {
      // Trigger blind fire sequence of 3 quick shots
      burstCount.current = 3;
      lastBurstShot.current = now;
      lastSMGTime.current = now;
    }

    if (burstCount.current > 0 && now - lastBurstShot.current > 120) {
      burstCount.current--;
      lastBurstShot.current = now;

      soundManager.playLaser(); // Play high-key laser sound
      
      const startBeam: [number, number, number] = [pos.x, pos.y + 0.8, pos.z];
      const endBeam: [number, number, number] = [
        camera.position.x + (Math.random() - 0.5) * 0.8,
        camera.position.y - 0.2 + (Math.random() - 0.5) * 0.8,
        camera.position.z + (Math.random() - 0.5) * 0.8
      ];

      addLaser(startBeam, endBeam, '#ff5100'); // Faint orange blind fire laser beam
      
      // Calculate hits
      const rayDir = new THREE.Vector3().subVectors(new THREE.Vector3(...endBeam), new THREE.Vector3(...startBeam)).normalize();
      const dotProduct = toPlayerVec.clone().normalize().dot(rayDir);
      
      if (dotProduct > 0.94) {
        // Blind SMG shot lands! Chip damage
        hitPlayer(6);
        addParticles(endBeam, '#ff0055');
      }
    }
  });

  return (
    <group>
      <RigidBody
        ref={body}
        type="dynamic"
        position={data.position}
        enabledRotations={[false, false, false]}
        userData={{ name: data.id }}
        linearDamping={1.5}
        colliders={false}
      >
        <CapsuleCollider args={[0.45, 0.45]} position={[0, 0.75, 0]} />

        {/* 3D Visual Mesh Attachment */}
        <group ref={groupRef}>
          <SafeModel fallback={<DroneOperatorFallbackVisuals isStunned={isStunned} speed={speed} />}>
            <DroneOperatorModel 
              disabled={data.state === 'disabled'} 
              speed={speed} 
              hitTrigger={hitTrigger} 
              isStunned={isStunned}
            />
          </SafeModel>
        </group>

        {/* Tactical Screen Status Overlay */}
        {showEnemyHealthBars && (
          <Html
            position={[0, 1.9, 0]}
            center
            distanceFactor={18}
            style={{ pointerEvents: 'none' }}
            zIndexRange={[100, 0]}
          >
            <div className="flex flex-col items-center gap-1 whitespace-nowrap select-none font-mono">
              {isStunned && data.state === 'active' && (
                <div className="bg-cyan-600/95 text-white text-[8px] px-1 py-0.5 rounded border border-cyan-400 font-bold animate-pulse shadow-[0_0_10px_#00d4ff]">
                  {getTranslation(language, 'enemyDeviceStunned')}
                </div>
              )}
              {!isStunned && speed > 0 && data.state === 'active' && (
                <div className="bg-amber-600/90 text-white text-[7px] px-1 py-0.2 rounded border border-amber-400 font-semibold shadow-[0_0_5px_#f59e0b]">
                  {getTranslation(language, 'enemyEvadingPlayer')}
                </div>
              )}
              <div className={`px-2 py-0.5 rounded text-[10px] border transition-all duration-300 ${
                isStunned
                  ? 'bg-cyan-950/90 text-cyan-400 border-cyan-500 shadow-[0_0_12px_rgba(34,211,238,0.8)]'
                  : 'bg-orange-950/85 text-orange-400 border-orange-500/80 shadow-[0_0_6px_rgba(255,81,0,0.4)]'
              }`}>
                {isStunned ? getTranslation(language, 'enemyOperatorTabErr') : getTranslation(language, 'enemyDroneOperator')} #{data.id.replace('bot-', '')}
              </div>
            </div>
          </Html>
        )}
      </RigidBody>
    </group>
  );
}
