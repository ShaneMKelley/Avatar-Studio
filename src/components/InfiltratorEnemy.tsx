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

interface InfiltratorModelProps {
  disabled?: boolean;
  speed?: number;
  hitTrigger?: number;
  isStaggered?: boolean;
  isLegDripping?: boolean;
  isDashing?: boolean;
  isAttacking?: boolean;
}

function InfiltratorModel({ disabled, speed, hitTrigger, isStaggered, isLegDripping, isDashing, isAttacking }: InfiltratorModelProps) {
  const group = useRef<THREE.Group>(null);
  
  // Load standard Infiltrator GLB from user specified bucket location
  const { scene, animations } = useGLTF(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/Infiltrator.glb'));
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions } = useAnimations(animations, group);
  const materials = useRef<THREE.MeshStandardMaterial[]>([]);
  const flashTimer = useRef(0);
  const lastHitTrigger = useRef(0);

  // Dynamic animation rigging and selectors
  const runAction = useMemo(() => {
    const key = Object.keys(actions).find(name => 
      name.toLowerCase().includes('run') || 
      name.toLowerCase().includes('sprint') || 
      name.toLowerCase().includes('fast')
    ) || Object.keys(actions)[0];
    return key ? actions[key] : null;
  }, [actions]);

  const walkAction = useMemo(() => {
    const key = Object.keys(actions).find(name => 
      name.toLowerCase().includes('walk') || 
      name.toLowerCase().includes('prowl') || 
      name.toLowerCase().includes('stealth')
    ) || Object.keys(actions)[1];
    return key ? actions[key] : null;
  }, [actions]);

  const attackAction = useMemo(() => {
    const key = Object.keys(actions).find(name => 
      name.toLowerCase().includes('attack') || 
      name.toLowerCase().includes('slash') || 
      name.toLowerCase().includes('strike') || 
      name.toLowerCase().includes('melee')
    ) || Object.keys(actions)[2];
    return key ? actions[key] : null;
  }, [actions]);

  const hitAction = useMemo(() => {
    const key = Object.keys(actions).find(name => 
      name.toLowerCase().includes('hit') || 
      name.toLowerCase().includes('react') || 
      name.toLowerCase().includes('pain') || 
      name.toLowerCase().includes('stagger')
    ) || Object.keys(actions)[3];
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

  // Main animation dispatcher to match smooth predatory crouches or swift charges
  useEffect(() => {
    if (disabled) {
      Object.values(actions).forEach(action => action?.stop());
      return;
    }

    if (isStaggered && hitAction) {
      Object.values(actions).forEach(action => action?.stop());
      hitAction.reset().fadeIn(0.15).setLoop(THREE.LoopOnce, 1).play();
    } else if (isAttacking && attackAction) {
      Object.values(actions).forEach(action => action?.stop());
      attackAction.reset().fadeIn(0.1).play();
    } else {
      Object.values(actions).forEach(action => action?.stop());
      if (speed && speed > 2.0 && runAction) {
        runAction.reset().fadeIn(0.2).play();
        runAction.timeScale = 1.4; // rapid run gait
      } else if (speed && speed > 0 && walkAction) {
        walkAction.reset().fadeIn(0.25).play();
        walkAction.timeScale = 0.85; // predatory prowl
      } else {
        const idle = actions['idle'] || actions['Armature|clip0|baselayer'] || Object.values(actions)[0];
        if (idle) idle.reset().fadeIn(0.3).play();
      }
    }
  }, [disabled, speed, actions, isStaggered, isAttacking, runAction, walkAction, attackAction, hitAction]);

  useEffect(() => {
    if (hitTrigger && hitTrigger !== lastHitTrigger.current) {
      lastHitTrigger.current = hitTrigger;
      flashTimer.current = 1.0;
    }
  }, [hitTrigger]);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    // Visual brightness levels and transparency traversal for Camo Dash
    materials.current.forEach((mat) => {
      if (isDashing) {
        mat.transparent = true;
        mat.opacity = THREE.MathUtils.lerp(mat.opacity, 0.15, 0.15); // Light bending active camo refraction
        mat.emissive.setRGB(0.9, 0.28, 0.0); // Neon orange outlines thrumming through refraction
        mat.emissiveIntensity = 4.0;
      } else {
        mat.transparent = false;
        mat.opacity = THREE.MathUtils.lerp(mat.opacity, 1.0, 0.2);
        
        if (flashTimer.current > 0) {
          flashTimer.current = Math.max(0, flashTimer.current - delta * 4.5);
          mat.emissive.setRGB(flashTimer.current * 0.95, flashTimer.current * 0.3, 0); // Burst orange-red flare
          mat.emissiveIntensity = flashTimer.current * 4.5;
        } else {
          // Dynamic signature based on stalk vs strike behavior
          const basePulse = isAttacking ? 2.5 : 0.15 + Math.sin(t * 5.0) * 0.08;
          mat.emissive.setRGB(basePulse * 0.9, basePulse * 0.25, 0); 
          mat.emissiveIntensity = basePulse * 2.8;
        }
      }
    });

    if (disabled && group.current) {
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, -Math.PI / 2.05, 0.12);
      group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, 0.05, 0.12);
    } else if (group.current) {
      let bob = 0;
      let leanX = 0;
      let leanZ = 0;

      if (isDashing) {
        leanX = 0.45; // extreme slide posture
        bob = Math.sin(t * 40) * 0.05;
      } else if (isAttacking) {
        leanX = 0.28;
        bob = Math.abs(Math.sin(t * 22)) * 0.12;
      } else if (speed && speed > 2.0) {
        bob = Math.abs(Math.sin(t * 16)) * 0.09; // rapid bouncy run bob
        leanX = 0.22; // forward momentum lean
        leanZ = Math.sin(t * 8.0) * 0.04; // frantic weave
      } else if (speed && speed > 0) {
        bob = Math.sin(t * 4.5) * 0.035; // smooth prowl slide
        leanX = 0.08; // stealth crouch head tilt
      }

      group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, bob, 0.15);
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, leanX, 0.15);
      group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, leanZ, 0.15);
    }
  });

  return (
    <group ref={group}>
      <primitive object={clone} rotation={[0, 0, 0]} />
    </group>
  );
}

function InfiltratorFallbackVisuals({ isDashing, isAttacking }: { isDashing: boolean, isAttacking: boolean }) {
  const leftBlade = useRef<THREE.Mesh>(null);
  const rightBlade = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const pulseFactor = isDashing ? 0.3 : isAttacking ? 2.5 : 0.4 + Math.sin(t * 6.0) * 0.25;
    
    [leftBlade, rightBlade].forEach((bladeRef) => {
      if (bladeRef.current && bladeRef.current.material) {
        const mat = bladeRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = isDashing ? 0.15 : 0.95;
        bladeRef.current.scale.set(1.0, 1.0 + pulseFactor * 0.2, 1.0);
      }
    });
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Sleek form-fitting segmented black armor profile */}
      <mesh position={[0, 1.05, 0]}>
        <boxGeometry args={[0.36, 0.52, 0.22]} />
        <meshStandardMaterial color="#0b0f19" roughness={0.65} metalness={0.9} transparent={isDashing} opacity={isDashing ? 0.15 : 1} />
      </mesh>
      
      {/* Compact chest glowing power node */}
      <mesh position={[0, 1.12, 0.12]}>
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshBasicMaterial color="#ff5100" transparent opacity={isDashing ? 0.15 : 0.9} toneMapped={false} />
      </mesh>

      {/* Visor Helmet */}
      <mesh position={[0, 1.48, 0]}>
        <boxGeometry args={[0.22, 0.25, 0.22]} />
        <meshStandardMaterial color="#1e293b" roughness={0.1} metalness={0.95} transparent={isDashing} opacity={isDashing ? 0.15 : 1} />
      </mesh>
      <mesh position={[0, 1.5, 0.12]}>
        <boxGeometry args={[0.15, 0.04, 0.02]} />
        <meshBasicMaterial color="#ff5100" toneMapped={false} transparent opacity={isDashing ? 0.15 : 0.9} />
      </mesh>

      {/* Exposed carbon fiber exoskeleton joint cylinders */}
      <mesh position={[-0.14, 0.4, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.8, 8]} />
        <meshStandardMaterial color="#18181b" roughness={0.9} metalness={0.2} transparent={isDashing} opacity={isDashing ? 0.15 : 1} />
      </mesh>
      <mesh position={[0.14, 0.4, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.8, 8]} />
        <meshStandardMaterial color="#18181b" roughness={0.9} metalness={0.2} transparent={isDashing} opacity={isDashing ? 0.15 : 1} />
      </mesh>

      {/* Compact Glowing #ff5100 energy daggers attached to the wrist bracers */}
      <group position={[-0.24, 0.95, 0.1]} rotation={[0.45, 0, 0]}>
        <mesh ref={leftBlade}>
          <boxGeometry args={[0.025, 0.035, 0.48]} />
          <meshBasicMaterial color="#ff5100" toneMapped={false} transparent opacity={0.9} />
        </mesh>
      </group>
      <group position={[0.24, 0.95, 0.1]} rotation={[0.45, 0, 0]}>
        <mesh ref={rightBlade}>
          <boxGeometry args={[0.025, 0.035, 0.48]} />
          <meshBasicMaterial color="#ff5100" toneMapped={false} transparent opacity={0.9} />
        </mesh>
      </group>
    </group>
  );
}

export function InfiltratorEnemy({ data }: { data: EnemyData }) {
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

  // States
  const [speed, setSpeed] = useState(0);
  const [hitTrigger, setHitTrigger] = useState(0);
  const [isCamoDashing, setIsCamoDashing] = useState(false);
  const [isStriking, setIsStriking] = useState(false);
  const [isBuffed, setIsBuffed] = useState(false);
  const frameCount = useRef(0);

  const lastHealth = useRef(data.health ?? 3.6);
  const lastBotState = useRef(data.state);

  const lastDashTime = useRef(0);
  const dashDirection = useRef(new THREE.Vector3());
  const dashStartTime = useRef(0);

  const lastStrikeTime = useRef(0);
  const groupRef = useRef<THREE.Group>(null);
  const patrolTarget = useRef(new THREE.Vector3());
  const lastPatrolChange = useRef(0);

  // Weak Point States calculated from direct hits
  const isStaggered = data.dodgeTime !== undefined && Date.now() - data.dodgeTime < 750;
  const isCrawler = data.legShotTime !== undefined && Date.now() - data.legShotTime < 4000;

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
    lastHealth.current = data.health ?? 3.6;
    lastBotState.current = data.state;
  }, [data.health, data.state]);

  // Initial target setup
  useMemo(() => {
    patrolTarget.current.set(
      data.position[0] + (Math.random() - 0.5) * 20,
      data.position[1],
      data.position[2] + (Math.random() - 0.5) * 20
    );
  }, [data.position]);

  // Translate collider coordinate mappings
  useEffect(() => {
    if (body.current) {
      if (data.state === 'active') {
        body.current.setTranslation({ x: data.position[0], y: data.position[1], z: data.position[2] }, true);
        body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      } else {
        body.current.setTranslation({ x: data.position[0], y: -80, z: data.position[2] }, true);
        body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
        setIsCamoDashing(false);
        setIsStriking(false);
      }
    }
  }, [data.state, data.position]);

  const lastState = useRef(data.state);

  // Death/Respawn particle bursts
  useEffect(() => {
    if (data.state === 'disabled' && lastState.current === 'active') {
      const p = body.current ? body.current.translation() : { x: data.position[0], y: data.position[1], z: data.position[2] };
      for (let i = 0; i < 15; i++) {
        addParticles(
          [p.x + (Math.random() - 0.5) * 1.2, p.y + Math.random() * 1.8, p.z + (Math.random() - 0.5) * 1.2],
          '#ff3c00'
        );
      }
    } else if (data.state === 'active' && lastState.current === 'disabled') {
      for (let i = 0; i < 10; i++) {
        addParticles(
          [data.position[0] + (Math.random() - 0.5) * 1.0, data.position[1] + Math.random() * 1.8, data.position[2] + (Math.random() - 0.5) * 1.0],
          '#00ffff'
        );
      }
    }
    lastState.current = data.state;
  }, [data.state, data.position, addParticles]);

  useFrame((state_fiber) => {
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
    const strikeCooldownDuration = isBuffed ? 1200 : 1500;

    const nowTime = Date.now();

    // 1. Calculate Player Sight vectors & Dot configurations
    const playerLookDir = new THREE.Vector3();
    camera.getWorldDirection(playerLookDir);
    playerLookDir.y = 0;
    playerLookDir.normalize();

    const toPlayerVec = new THREE.Vector3().subVectors(camera.position, currentPos);
    toPlayerVec.y = 0;
    const distToPlayer = toPlayerVec.length();
    toPlayerVec.normalize();

    const fromPlayerVec = toPlayerVec.clone().negate();
    const playerSpottedDot = playerLookDir.dot(fromPlayerVec);

    // Detected if within player field of view scope (dot > 0.48)
    const isSpottedByPlayer = playerSpottedDot > 0.48;

    // 2. Active Camo Dashing mechanics
    if (isCamoDashing) {
      body.current.setLinvel({
        x: dashDirection.current.x * 8.5,
        y: body.current.linvel().y,
        z: dashDirection.current.z * 8.5
      }, true);
      setSpeed(8.5);

      // Light sparks visual distortion shadow stream
      if (Math.random() > 0.3) {
        addParticles([currentPos.x, currentPos.y + 1.0, currentPos.z], '#ff5100');
      }

      if (nowTime - dashStartTime.current > 500) {
        setIsCamoDashing(false);
        lastDashTime.current = nowTime;
      }
      return;
    }

    // 3. Low Stagger flinch response: blocks movement inputs completely
    if (isStaggered) {
      body.current.setLinvel({ x: 0, y: body.current.linvel().y, z: 0 }, true);
      setSpeed(0);
      return;
    }

    // 4. Melee combat strike execution triggers
    if (isStriking) {
      body.current.setLinvel({ x: 0, y: body.current.linvel().y, z: 0 }, true);
      setSpeed(0);

      if (nowTime - lastStrikeTime.current > 600) {
        setIsStriking(false);
      }
      return;
    }

    // 5. Active Camo / Dash triggers on warning detections
    const isPositionInSafeZone = (x: number, z: number) => {
      return Math.sqrt(x * x + z * z) < 10.5;
    };
    const playerInSafeZone = isPositionInSafeZone(camera.position.x, camera.position.z);

    const canDash = !isCrawler && (nowTime - lastDashTime.current > 6000);
    if (canDash && isSpottedByPlayer && distToPlayer > 7.0 && distToPlayer < 18.0 && playerState === 'active' && !playerInSafeZone) {
      setIsCamoDashing(true);
      dashStartTime.current = nowTime;
      
      // Dash perpendicular left or right relative to direct line of sight to break look vectors
      const isLeft = data.id.charCodeAt(data.id.length - 1) % 2 === 0;
      dashDirection.current.set(-toPlayerVec.z, 0, toPlayerVec.x).normalize();
      if (!isLeft) {
        dashDirection.current.negate();
      }

      soundManager.playCamoDash();
      return;
    }

    // 6. Navigation Vectors with flanking and isolated orbits
    const moveDirection = new THREE.Vector3();

    if (playerState === 'active' && !playerInSafeZone && distToPlayer < 28.0) {
      // Flanking and Close Attack branches
      if (distToPlayer <= 2.0 && nowTime - lastStrikeTime.current > strikeCooldownDuration) {
        // CLOSE MELEE STRIKE TRIGGERS!
        setIsStriking(true);
        lastStrikeTime.current = nowTime;
        soundManager.playDaggerStrike();
        
        hitPlayer(30); // 30 HP High-DPS melee strike
        const kbDir = new THREE.Vector3().subVectors(camera.position, currentPos).normalize();
        applyKnockback([kbDir.x * 12.0, 4.0, kbDir.z * 12.0]);
        camera.rotation.x += (Math.random() - 0.5) * 0.08;
        addParticles([camera.position.x, camera.position.y, camera.position.z], '#ff0000');
        return;
      }
      
      if (distToPlayer > 6.5) {
        // Orbit / Flank state around perimeter to avoid direct confrontation
        const isLeftFlank = data.id.charCodeAt(data.id.length - 1) % 2 === 0;
        const perp = new THREE.Vector3(-toPlayerVec.z, 0, toPlayerVec.x).normalize();
        
        // Blend moving forward slightly and orbiting perpendicular
        const circleWeight = isCrawler ? 0.2 : 0.82;
        const forwardWeight = isCrawler ? 0.8 : 0.18;
        
        moveDirection.copy(toPlayerVec).multiplyScalar(forwardWeight);
        moveDirection.add(perp.multiplyScalar(circleWeight * (isLeftFlank ? 1 : -1)));
        moveDirection.normalize();
      } else {
        // Strike Sprint! Aggressive forward charge
        moveDirection.copy(toPlayerVec).normalize();
      }
    } else {
      // Idle patrol navigation
      if (currentPos.distanceTo(patrolTarget.current) < 2.0 || nowTime - lastPatrolChange.current > 4000) {
        patrolTarget.current.set(
          currentPos.x + (Math.random() - 0.5) * 45,
          currentPos.y,
          currentPos.z + (Math.random() - 0.5) * 45
        );
        lastPatrolChange.current = nowTime;
      }
      moveDirection.subVectors(patrolTarget.current, currentPos).normalize();
    }

    // 7. Determine kinematic velocities and constraint states
    // Infiltrators creep or leap based on leg joint health
    const maxSpd = (isCrawler 
      ? 0.55  // Creep crawl state when leg index shot
      : (distToPlayer < 6.5 ? 3.8 : 2.0)) * buffFactorSpeed; // Sprint charge vs stalking prowl

    body.current.setLinvel({
      x: moveDirection.x * maxSpd,
      y: body.current.linvel().y,
      z: moveDirection.z * maxSpd
    }, true);

    setSpeed(moveDirection.lengthSq() > 0.01 ? maxSpd : 0);

    // Dynamic horizontal look coordinate syncing
    if (groupRef.current && moveDirection.lengthSq() > 0.05) {
      const rot = Math.atan2(moveDirection.x, moveDirection.z);
      let diff = rot - groupRef.current.rotation.y;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      groupRef.current.rotation.y += diff * 0.18;
    }
  });

  return (
    <RigidBody
      ref={body}
      colliders={false}
      mass={1.2} // Highly agile light dynamic density
      type="dynamic"
      position={data.position}
      enabledRotations={[false, false, false]}
      userData={{ name: data.id }}
    >
      <CapsuleCollider args={[0.42, 0.42]} position={[0, 0.85, 0]} />
      <group ref={groupRef} visible={data.state !== 'disabled'}>
        <group scale={1}>
          <SafeModel fallback={<InfiltratorFallbackVisuals isDashing={isCamoDashing} isAttacking={isStriking} />}>
            <InfiltratorModel
              disabled={data.state === 'disabled'}
              speed={speed}
              hitTrigger={hitTrigger}
              isStaggered={isStaggered}
              isLegDripping={isCrawler}
              isDashing={isCamoDashing}
              isAttacking={isStriking}
            />
          </SafeModel>
          {data.state === 'active' && !isCamoDashing && (
            <group position={[0, 0.8, 0]}>
              {/* Optional dynamic emitters nodes could reside here */}
            </group>
          )}
        </group>

        {/* 2D Overlay Tag elements */}
        {showEnemyHealthBars && (
          <Html
            position={[0, 2.5, 0]}
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
                isCamoDashing 
                  ? 'bg-orange-950/95 text-orange-400 border-orange-500/80 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse'
                  : isCrawler
                    ? 'bg-zinc-950/90 text-red-500 border-red-500/40'
                    : 'bg-black/95 text-orange-500 border-orange-500/20'
              }`}>
                {isCamoDashing 
                  ? getTranslation(language, 'enemyActiveCamo')
                  : isCrawler
                    ? getTranslation(language, 'enemyLegSystemDisable')
                    : `⚔️ ${getTranslation(language, 'enemyInfiltrator')} ${data.id.replace('bot-', '#0')}`
                }
              </div>

              {data.state === 'active' && (() => {
                const maxHp = 3.6;
                const curHp = data.health ?? 3.6;
                const percent = (curHp / maxHp) * 100;
                
                return (
                  <div className="flex flex-col gap-0.5 p-1 bg-black/90 border border-zinc-800 rounded-md w-24">
                    <div className="w-full bg-zinc-950 rounded overflow-hidden relative" style={{ height: '5px' }}>
                      <div 
                        className="h-full rounded-sm transition-all duration-150 bg-gradient-to-r from-orange-600 to-amber-500 shadow-[0_0_5px_#ff5100]"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[7.5px] font-bold text-zinc-500">
                      <span>HP</span>
                      <span>{curHp.toFixed(1)} / 3.6</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </Html>
        )}
      </group>
    </RigidBody>
  );
}
