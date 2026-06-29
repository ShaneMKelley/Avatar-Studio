/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useMemo, useState, useEffect } from 'react';
import { SafeModel } from './SafeModel';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, useRapier, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { useGameStore, EnemyData } from '../store';
import { useStore } from '../store/useStore';
import { getTranslation } from '../utils/translations';
import { getProxyUrl } from '../utils/proxy';
import { useGLTF, useAnimations, Html } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import { soundManager } from '../utils/soundManager';
import { idleTaskQueue } from '../utils/idleTaskQueue';

interface BombardierModelProps {
  disabled?: boolean;
  speed?: number;
  hitTrigger?: number;
  isStaggered?: boolean;
  isBracing?: boolean;
}

function BombardierModel({ disabled, speed, hitTrigger, isStaggered, isBracing }: BombardierModelProps) {
  const group = useRef<THREE.Group>(null);
  
  // Load standard Bombardier GLB from spec storage location
  const { scene, animations } = useGLTF(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/Bombardier.glb'));
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions } = useAnimations(animations, group);
  const materials = useRef<THREE.MeshStandardMaterial[]>([]);
  const flashTimer = useRef(0);
  const lastHitTrigger = useRef(0);

  // Dynamic animation rigging
  const walkedAction = useMemo(() => {
    const key = Object.keys(actions).find(name => 
      name.toLowerCase().includes('walk') || 
      name.toLowerCase().includes('march') || 
      name.toLowerCase().includes('step') ||
      name.toLowerCase().includes('heavy')
    ) || Object.keys(actions)[0];
    return key ? actions[key] : null;
  }, [actions]);

  const braceAction = useMemo(() => {
    const key = Object.keys(actions).find(name => 
      name.toLowerCase().includes('brace') || 
      name.toLowerCase().includes('crouch') || 
      name.toLowerCase().includes('kneel') || 
      name.toLowerCase().includes('aim')
    ) || Object.keys(actions)[1];
    return key ? actions[key] : null;
  }, [actions]);

  const flinchAction = useMemo(() => {
    const key = Object.keys(actions).find(name => 
      name.toLowerCase().includes('hit') || 
      name.toLowerCase().includes('react') || 
      name.toLowerCase().includes('pain') || 
      name.toLowerCase().includes('stagger')
    ) || Object.keys(actions)[2];
    return key ? actions[key] : null;
  }, [actions]);

  useEffect(() => {
    if (clone) {
      const mats: THREE.MeshStandardMaterial[] = [];
      clone.traverse((obj) => {
        obj.frustumCulled = false;
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          
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

  // Handle gait transitions based on heavy step specifications
  useEffect(() => {
    if (disabled) {
      Object.values(actions).forEach(action => action?.stop());
      return;
    }

    if (isStaggered && flinchAction) {
      Object.values(actions).forEach(action => action?.stop());
      flinchAction.reset().fadeIn(0.12).setLoop(THREE.LoopOnce, 1).play();
    } else if (isBracing && braceAction) {
      Object.values(actions).forEach(action => action?.stop());
      braceAction.reset().fadeIn(0.15).play();
    } else {
      Object.values(actions).forEach(action => action?.stop());
      if (speed && speed > 0 && walkedAction) {
        walkedAction.reset().fadeIn(0.25).play();
        walkedAction.timeScale = 0.72; // Slow, pounding mechanical footsteps
      } else {
        const idle = actions['idle'] || actions['Armature|clip0|baselayer'] || Object.values(actions)[0];
        if (idle) idle.reset().fadeIn(0.35).play();
      }
    }
  }, [disabled, speed, actions, isStaggered, isBracing, walkedAction, braceAction, flinchAction]);

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
        mat.emissive.setRGB(flashTimer.current * 0.95, flashTimer.current * 0.3, 0); // Warning red heat flare
        mat.emissiveIntensity = flashTimer.current * 4.2;
      } else {
        // High emission on preparations
        const pulseRatio = isBracing ? 5.5 : 0.2 + Math.abs(Math.sin(t * 4.0)) * 0.25;
        mat.emissive.setRGB(pulseRatio * 0.95, pulseRatio * 0.28, 0.0); // #ff5100 orange venting
        mat.emissiveIntensity = pulseRatio * 3.5;
      }
    });

    if (disabled && group.current) {
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, -Math.PI / 2.05, 0.12);
      group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, 0.02, 0.12);
    } else if (group.current) {
      let bob = 0;
      let leanX = 0;

      if (isBracing) {
        leanX = 0.26; // Brace animation lean
        bob = Math.sin(t * 18.0) * 0.02; // Small servo tremors
      } else if (speed && speed > 0) {
        bob = Math.abs(Math.sin(t * 8.0)) * 0.08; // Heavy visual bounce
        leanX = 0.06;
      }

      group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, bob, 0.15);
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, leanX, 0.15);
    }
  });

  return (
    <group ref={group}>
      <primitive object={clone} rotation={[0, 0, 0]} />
    </group>
  );
}

function BombardierFallbackVisuals({ isBracing, isVenting }: { isBracing: boolean; isVenting: boolean }) {
  const podExhaustRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (podExhaustRef.current && podExhaustRef.current.material) {
      const pulsePower = isVenting ? 4.5 : 0.4 + Math.sin(t * 8.0) * 0.28;
      const mat = podExhaustRef.current.material as THREE.MeshBasicMaterial;
      mat.color.setRGB(pulsePower * 0.95, pulsePower * 0.28, 0.0); // Heat thrum #ff5100
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Heavy Segmented Lower Chassis Frame */}
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.38, 0.46, 0.9, 8]} />
        <meshStandardMaterial color="#1e293b" roughness={0.7} metalness={0.9} />
      </mesh>

      {/* Servo Reinforced Feet baseplates */}
      <mesh position={[-0.24, 0.08, 0]}>
        <boxGeometry args={[0.18, 0.15, 0.28]} />
        <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.95} />
      </mesh>
      <mesh position={[0.24, 0.08, 0]}>
        <boxGeometry args={[0.18, 0.15, 0.28]} />
        <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.95} />
      </mesh>

      {/* Stout Upper Steel Body torso */}
      <mesh position={[0, 1.15, 0]}>
        <boxGeometry args={[0.62, 0.58, 0.38]} />
        <meshStandardMaterial color="#334155" roughness={0.5} metalness={0.88} />
      </mesh>

      {/* Asymmetrical Right Shoulder-Mounted Rocket Pod */}
      <group position={[0.26, 1.45, 0.02]} rotation={isBracing ? [0.15, 0, 0] : [0, 0, 0]}>
        {/* Massive launcher box */}
        <mesh>
          <boxGeometry args={[0.28, 0.34, 0.58]} />
          <meshStandardMaterial color="#111827" roughness={0.3} metalness={0.9} />
        </mesh>
        
        {/* 4 Launch Tubes at front */}
        <group position={[0, 0, 0.3]}>
          <mesh position={[-0.07, 0.07, 0]}>
            <cylinderGeometry args={[0.042, 0.042, 0.03, 8]} />
            <meshBasicMaterial color="#ff5100" toneMapped={false} />
          </mesh>
          <mesh position={[0.07, 0.07, 0]}>
            <cylinderGeometry args={[0.042, 0.042, 0.03, 8]} />
            <meshBasicMaterial color="#ff5100" toneMapped={false} />
          </mesh>
          <mesh position={[-0.07, -0.07, 0]}>
            <cylinderGeometry args={[0.042, 0.042, 0.03, 8]} />
            <meshBasicMaterial color="#ff5100" toneMapped={false} />
          </mesh>
          <mesh position={[0.07, -0.07, 0]}>
            <cylinderGeometry args={[0.042, 0.042, 0.03, 8]} />
            <meshBasicMaterial color="#ff5100" toneMapped={false} />
          </mesh>
        </group>

        {/* Exhaust ports glowing on rear of launcher pod */}
        <mesh ref={podExhaustRef} position={[0, 0, -0.3]}>
          <boxGeometry args={[0.2, 0.22, 0.02]} />
          <meshBasicMaterial color="#ff5100" toneMapped={false} />
        </mesh>
      </group>

      {/* Heavy Cyclops Visor Core Head */}
      <mesh position={[-0.12, 1.48, 0]}>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[-0.12, 1.48, 0.13]}>
        <boxGeometry args={[0.14, 0.032, 0.02]} />
        <meshBasicMaterial color="#ff5100" toneMapped={false} />
      </mesh>
    </group>
  );
}

interface StrikeState {
  id: string;
  targetPos: [number, number, number];
  elapsed: number;
}

export function BombardierEnemy({ data }: { data: EnemyData }) {
  const showEnemyHealthBars = useStore(state => state.showEnemyHealthBars);
  const language = useStore(state => state.language);
  const body = useRef<RapierRigidBody>(null);
  const { camera } = useThree();
  const { world, rapier } = useRapier();

  const gameState = useGameStore(state => state.gameState);
  const playerState = useGameStore(state => state.playerState);
  const hitPlayer = useGameStore(state => state.hitPlayer);
  const applyKnockback = useGameStore(state => state.applyKnockback);
  const addParticles = useGameStore(state => state.addParticles);
  const addEvent = useGameStore(state => state.addEvent);

  // Local state modifiers
  const [speed, setSpeed] = useState(0);
  const [hitTrigger, setHitTrigger] = useState(0);
  const [isBracing, setIsBracing] = useState(false);
  const [isBuffed, setIsBuffed] = useState(false);
  const frameCount = useRef(0);
  const [projectileStrikes, setProjectileStrikes] = useState<StrikeState[]>([]);

  const lastHealth = useRef(data.health ?? 9.0);
  const lastBotState = useRef(data.state);

  const lastBarrageTime = useRef(0);
  const braceStartTime = useRef(0);
  const groupRef = useRef<THREE.Group>(null);
  const patrolTarget = useRef(new THREE.Vector3());
  const lastPatrolChange = useRef(0);

  // Status conditions
  const isStaggered = data.dodgeTime !== undefined && Date.now() - data.dodgeTime < 750;

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
    lastHealth.current = data.health ?? 9.0;
    lastBotState.current = data.state;
  }, [data.health, data.state]);

  // Patrol Coordinates
  useMemo(() => {
    patrolTarget.current.set(
      data.position[0] + (Math.random() - 0.5) * 15,
      data.position[1],
      data.position[2] + (Math.random() - 0.5) * 15
    );
  }, [data.position]);

  // Coordinate RigidBody sync values on respawns / disable states
  useEffect(() => {
    if (body.current) {
      if (data.state === 'active') {
        body.current.setTranslation({ x: data.position[0], y: data.position[1], z: data.position[2] }, true);
        body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      } else {
        body.current.setTranslation({ x: data.position[0], y: -100, z: data.position[2] }, true);
        body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
        setIsBracing(false);
        setProjectileStrikes([]);
      }
    }
  }, [data.state, data.position]);

  const lastState = useRef(data.state);

  // Core visual energy bursts
  useEffect(() => {
    if (data.state === 'disabled' && lastState.current === 'active') {
      const p = body.current ? body.current.translation() : { x: data.position[0], y: data.position[1], z: data.position[2] };
      // Mass heavy scrap blast
      for (let i = 0; i < 28; i++) {
        addParticles(
          [p.x + (Math.random() - 0.5) * 1.8, p.y + Math.random() * 2.2, p.z + (Math.random() - 0.5) * 1.8],
          '#ff4400'
        );
      }
    } else if (data.state === 'active' && lastState.current === 'disabled') {
      for (let i = 0; i < 8; i++) {
        addParticles(
          [data.position[0] + (Math.random() - 0.5) * 1.2, data.position[1] + Math.random() * 2.0, data.position[2] + (Math.random() - 0.5) * 1.2],
          '#ff7300'
        );
      }
    }
    lastState.current = data.state;
  }, [data.state, data.position, addParticles]);

  useFrame((state_fiber, delta) => {
    // 1. Process mortar flight timings and impact explosions locally
    if (projectileStrikes.length > 0) {
      const expired: string[] = [];
      const updated = projectileStrikes.map(strike => {
        const nextTime = strike.elapsed + delta;
        if (nextTime >= 1.5) {
          expired.push(strike.id);
          
          // Triggers mortar blast damage and sound mechanics
          soundManager.playBombardierExplosion();
          
          // Flash explosion debris
          for (let k = 0; k < 12; k++) {
            addParticles([
              strike.targetPos[0] + (Math.random() - 0.5) * 1.6,
              strike.targetPos[1] + Math.random() * 2.5,
              strike.targetPos[2] + (Math.random() - 0.5) * 1.6
            ], '#ff5100');
          }

          // Damage check against Player position
          if (playerState === 'active') {
            const playerPosFlat = new THREE.Vector3(camera.position.x, 0, camera.position.z);
            const strikePosFlat = new THREE.Vector3(strike.targetPos[0], 0, strike.targetPos[2]);
            const dist = playerPosFlat.distanceTo(strikePosFlat);
            
            if (dist < 4.0) {
              hitPlayer(35); // Heavy Area-denial splash damage
              
              // Project explosive vectors
              const rawKb = new THREE.Vector3().subVectors(camera.position, strikePosFlat);
              rawKb.y = 3.5; // Upward shockwave
              rawKb.normalize().multiplyScalar(16.5);
              applyKnockback([rawKb.x, 3.5, rawKb.z]);
            }
          }
        }
        return { ...strike, elapsed: nextTime };
      }).filter(s => s.elapsed < 1.5);

      if (expired.length > 0) {
        setProjectileStrikes(updated);
      } else {
        setProjectileStrikes(updated);
      }
    }

    if (!body.current || gameState !== 'playing' || data.state === 'disabled') {
      if (body.current) {
        body.current.setLinvel({ x: 0, y: body.current.linvel().y, z: 0 }, true);
      }
      setSpeed(0);
      return;
    }

    const pos = body.current.translation();
    const currentPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    
    // Check Overseer tactical Command Network Buffer
    frameCount.current++;
    if (frameCount.current % 12 === 0) {
      const activeOverseerInRange = useGameStore.getState().enemies?.some(
        e => e.type === 'overseer' && e.state === 'active' && new THREE.Vector3(...e.position).distanceTo(currentPos) < 18.0
      );
      if (activeOverseerInRange !== isBuffed) {
        setIsBuffed(!!activeOverseerInRange);
      }
    }

    const buffFactorSpeed = isBuffed ? 1.25 : 1.0;
    const barrageCooldownDuration = isBuffed ? 5200 : 6500;
    const offsetRange = isBuffed ? 4.5 : 6.5;

    const isPositionInSafeZone = (x: number, z: number) => {
      return Math.sqrt(x * x + z * z) < 10.5;
    };
    const playerInSafeZone = isPositionInSafeZone(camera.position.x, camera.position.z);

    const toPlayerVec = new THREE.Vector3().subVectors(camera.position, currentPos);
    toPlayerVec.y = 0;
    const distToPlayer = toPlayerVec.length();
    toPlayerVec.normalize();

    const nowTime = Date.now();

    // 2. Heavy mortar brace and firing states
    if (isBracing) {
      body.current.setLinvel({ x: 0, y: body.current.linvel().y, z: 0 }, true);
      setSpeed(0);

      // Thrum heavy heat exhaust particles from shoulder rear
      if (Math.random() > 0.4) {
        addParticles([currentPos.x + 0.26, currentPos.y + 1.45, currentPos.z - 0.3], '#ff5100');
      }

      const braceProgress = nowTime - braceStartTime.current;
      if (braceProgress > 800) {
        // Prepare rocket volley coordinates at current player tracking location!
        soundManager.playBombardierLaunch();
        
        const offsetRatios = [
          [0, 0], // Direct target
          [(Math.random() - 0.5) * offsetRange, (Math.random() - 0.5) * offsetRange], // Offset 1
          [(Math.random() - 0.5) * offsetRange, (Math.random() - 0.5) * offsetRange]  // Offset 2
        ];

        const newStrikes = offsetRatios.map((offset, idx) => ({
          id: `${data.id}-strike-${nowTime}-${idx}`,
          targetPos: [
            camera.position.x + offset[0],
            0.05,
            camera.position.z + offset[1]
          ] as [number, number, number],
          elapsed: 0
        }));

        setProjectileStrikes(prev => [...prev, ...newStrikes]);
        setIsBracing(false);
        lastBarrageTime.current = nowTime;
      }
      return;
    }

    // 3. Stagger check (Infiltrator and Sentinel stagger, Bombardier has standard stagger except on hyper-armor attacks)
    if (isStaggered) {
      body.current.setLinvel({ x: 0, y: body.current.linvel().y, z: 0 }, true);
      setSpeed(0);
      return;
    }

    // 4. Trigger Barrage on Cooldown if in range (between 10.0 and 38.0 units away)
    const canFire = nowTime - lastBarrageTime.current > barrageCooldownDuration;
    if (canFire && playerState === 'active' && !playerInSafeZone && distToPlayer >= 10.0 && distToPlayer <= 38.0) {
      setIsBracing(true);
      braceStartTime.current = nowTime;
      soundManager.playBombardierBrace();
      addEvent("⚠️ INCOMING MORTAR WARNING: Heavy artillery barrage locked on player coordinate!");
      return;
    }

    // 5. Heavy defensive AI navigation
    const moveDirection = new THREE.Vector3();
    const retreatLimit = 13.0; // Avoid close range at all costs

    if (playerState === 'active' && !playerInSafeZone && distToPlayer < retreatLimit) {
      // Retract/Back out: reverse from player to stay out of melee
      moveDirection.copy(toPlayerVec).negate().normalize();
    } else {
      // Stroll to patrol coordinates or maintain distance
      if (currentPos.distanceTo(patrolTarget.current) < 2.0 || nowTime - lastPatrolChange.current > 4000) {
        // Move towards a flanking distance relative to the player
        if (playerState === 'active' && !playerInSafeZone && distToPlayer > retreatLimit) {
          // Circle around the player at a safe combat radius (between 18 - 28 units)
          const rad = 20.0 + Math.random() * 8.0;
          const randomArc = Math.random() * Math.PI * 2;
          patrolTarget.current.set(
            camera.position.x + Math.cos(randomArc) * rad,
            currentPos.y,
            camera.position.z + Math.sin(randomArc) * rad
          );
        } else {
          patrolTarget.current.set(
            currentPos.x + (Math.random() - 0.5) * 28,
            currentPos.y,
            currentPos.z + (Math.random() - 0.5) * 28
          );
        }
        lastPatrolChange.current = nowTime;
      }
      moveDirection.subVectors(patrolTarget.current, currentPos).normalize();
    }

    // Heavy, deliberate paced mechanics: maximum speed 1.15 units
    const BOMBARDIER_SPD = 1.15 * buffFactorSpeed;
    body.current.setLinvel({
      x: moveDirection.x * BOMBARDIER_SPD,
      y: body.current.linvel().y,
      z: moveDirection.z * BOMBARDIER_SPD
    }, true);

    setSpeed(moveDirection.lengthSq() > 0.01 ? BOMBARDIER_SPD : 0);

    // Look at player if in combat, else look at path direction
    if (groupRef.current) {
      let lookTarget = moveDirection;
      if (playerState === 'active' && distToPlayer < 40.0) {
        lookTarget = toPlayerVec;
      }

      if (lookTarget.lengthSq() > 0.01) {
        const rot = Math.atan2(lookTarget.x, lookTarget.z);
        let diff = rot - groupRef.current.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        groupRef.current.rotation.y += diff * 0.12;
      }
    }
  });

  return (
    <>
      {/* 3D Mortar Projektile and Paint-Decles Overlay system */}
      {projectileStrikes.map(strike => {
        const progress = strike.elapsed / 1.5;
        const radius = 3.6; // Flat blast sweep boundaries
        const rocketHeight = 35.0 * (1.0 - progress);

        return (
          <group key={strike.id} position={[strike.targetPos[0], 0, strike.targetPos[2]]}>
            {/* Exploding glowing warning indicator */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
              <ringGeometry args={[radius - 0.1, radius, 32]} />
              <meshBasicMaterial color="#ff3300" transparent opacity={0.88} depthWrite={false} toneMapped={false} />
            </mesh>

            {/* Glowing expansion feedback indicator */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
              <circleGeometry args={[radius * progress, 32]} />
              <meshBasicMaterial color="#ff3300" transparent opacity={0.25 + progress * 0.22} depthWrite={false} toneMapped={false} />
            </mesh>

            {/* Falling Heavy Rocket visual model */}
            {rocketHeight > 0.2 && (
              <mesh position={[0, rocketHeight, 0]}>
                <cylinderGeometry args={[0.08, 0.12, 0.9, 8]} />
                <meshBasicMaterial color="#ff4400" toneMapped={false} />
              </mesh>
            )}
          </group>
        );
      })}

      <RigidBody
        ref={body}
        colliders={false}
        mass={2.8} // Heavy iron plating
        type="dynamic"
        position={data.position}
        enabledRotations={[false, false, false]}
        userData={{ name: data.id }}
      >
        <CapsuleCollider args={[0.55, 0.55]} position={[0, 1.0, 0]} />
        <group ref={groupRef} visible={data.state !== 'disabled'}>
          <group scale={1}>
            <SafeModel fallback={<BombardierFallbackVisuals isBracing={isBracing} isVenting={isBracing} />}>
              <BombardierModel
                disabled={data.state === 'disabled'}
                speed={speed}
                hitTrigger={hitTrigger}
                isStaggered={isStaggered}
                isBracing={isBracing}
              />
            </SafeModel>
          </group>

          {/* 2D Overlay Tag elements */}
          {showEnemyHealthBars && (
            <Html
              position={[0, 2.7, 0]}
              center
              distanceFactor={15}
              zIndexRange={[100, 0]}
              style={{ pointerEvents: 'none' }}
            >
              <div className="flex flex-col items-center gap-1 whitespace-nowrap select-none font-mono">
                {isBuffed && data.state === 'active' && (
                  <div className="bg-orange-600/95 text-white text-[8px] px-1 py-0.5 rounded border border-orange-400 font-bold animate-pulse shadow-[0_0_8px_#ff5100]">
                    {getTranslation(language, 'enemyNetworkBuffed')}
                  </div>
                )}
                <div className={`px-2 py-0.5 rounded text-[10px] border transition-all duration-300 ${
                  isBracing 
                    ? 'bg-amber-950/95 text-amber-500 border-amber-500/80 shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse'
                    : 'bg-black/95 text-yellow-500 border-yellow-500/20'
                }`}>
                  {isBracing 
                    ? getTranslation(language, 'enemyBracingBarrage')
                    : `⚔️ ${getTranslation(language, 'enemyBombardier')} ${data.id.replace('bot-', '#0')}`
                  }
                </div>

                {data.state === 'active' && (() => {
                  const maxHp = 9.0;
                  const curHp = data.health ?? 9.0;
                  const percent = (curHp / maxHp) * 100;
                  
                  return (
                    <div className="flex flex-col gap-0.5 p-1 bg-black/90 border border-zinc-800 rounded-md w-24">
                      <div className="w-full bg-zinc-950 rounded overflow-hidden relative" style={{ height: '5px' }}>
                        <div 
                          className="h-full rounded-sm transition-all duration-150 bg-gradient-to-r from-red-600 to-orange-500 shadow-[0_0_5px_#ff4400]"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[7.5px] font-bold text-zinc-500">
                        <span>HP</span>
                        <span>{curHp.toFixed(1)} / 9.0</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </Html>
          )}
        </group>
      </RigidBody>
    </>
  );
}
