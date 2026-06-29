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
import { InfiltratorEnemy } from './InfiltratorEnemy';
import { BombardierEnemy } from './BombardierEnemy';
import { OverseerEnemy } from './OverseerEnemy';
import { DroneOperatorEnemy } from './DroneOperatorEnemy';
import { SupportDroneEnemy } from './SupportDroneEnemy';
import { idleTaskQueue } from '../utils/idleTaskQueue';

interface SentinelModelProps {
  disabled?: boolean;
  speed?: number;
  hitTrigger?: number;
  shootTime?: number;
  chargeState?: 'idle' | 'telegraph' | 'charging' | 'cooldown';
}

function SentinalModel({ disabled, speed, hitTrigger, shootTime, chargeState }: SentinelModelProps) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/Sentinal.glb'));
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions } = useAnimations(animations, group);
  const materials = useRef<THREE.MeshStandardMaterial[]>([]);
  const flashTimer = useRef(0);
  const lastHitTrigger = useRef(0);
  const lastShootTime = useRef(0);

  const attackAction = useMemo(() => {
    const key = Object.keys(actions).find(name => 
      name.toLowerCase().includes('attack') || 
      name.toLowerCase().includes('shoot') || 
      name.toLowerCase().includes('fire')
    ) || Object.keys(actions)[1];
    return key ? actions[key] : null;
  }, [actions]);

  const hitAction = useMemo(() => {
    const key = Object.keys(actions).find(name => 
      name.toLowerCase().includes('hit') || 
      name.toLowerCase().includes('damage') || 
      name.toLowerCase().includes('react') || 
      name.toLowerCase().includes('pain')
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
      // Deferred dispose of all cloned materials to prevent leaks without causing frame drops
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
    } else {
      const anim = actions['Armature|clip0|baselayer'] || Object.values(actions)[0];
      if (anim) {
        anim.reset().fadeIn(0.2).play();
        anim.timeScale = speed && speed > 0 ? 0.65 : 0.25; // Slow, heavy marching speed gait
      }
    }
  }, [disabled, speed, actions]);

  useEffect(() => {
    if (shootTime && shootTime > lastShootTime.current && !disabled) {
      lastShootTime.current = shootTime;
      const baseAnim = actions['Armature|clip0|baselayer'] || Object.values(actions)[0];
      if (attackAction && baseAnim) {
        attackAction.reset().setLoop(THREE.LoopOnce, 1).play();
        baseAnim.crossFadeTo(attackAction, 0.1, true);
        
        const timer = setTimeout(() => {
          if (attackAction && baseAnim && !disabled) {
            attackAction.crossFadeTo(baseAnim, 0.2, true);
          }
        }, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [shootTime, attackAction, actions, disabled]);

  // High Stagger Resistance: small standard hits do not interrupt firing/marching animations
  // Only critical or knockout shots fire stagger animation flinches
  useEffect(() => {
    if (hitTrigger && hitTrigger !== lastHitTrigger.current) {
      lastHitTrigger.current = hitTrigger;
      flashTimer.current = 1.0;
    }
  }, [hitTrigger, hitAction, actions, disabled]);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    // Visual hit flashes thrumming orange/red
    if (flashTimer.current > 0) {
      flashTimer.current = Math.max(0, flashTimer.current - delta * 4.5);
      materials.current.forEach((mat) => {
        mat.emissive.setRGB(flashTimer.current * 0.9, flashTimer.current * 0.2, 0); // Neon flare orange impact
        mat.emissiveIntensity = flashTimer.current * 4.0;
      });
    } else {
      // Baseline thrumming orange state
      const pulseVal = 0.15 + Math.sin(t * 3.5) * 0.1;
      materials.current.forEach((mat) => {
        mat.emissive.setRGB(pulseVal * 0.9, pulseVal * 0.2, 0); // Constant pulsing orange indicators
        mat.emissiveIntensity = pulseVal * 3.0;
      });
    }

    if (disabled && group.current) {
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, -Math.PI / 2.1, 0.1);
      group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, 0.05, 0.1);
      group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, 0, 0.1);
    } else if (group.current) {
      let bob = 0;
      let leanX = 0;
      let leanZ = 0;
      
      if (chargeState === 'telegraph') {
        leanX = 0.22; // Lean intensely forward to charge!
        bob = Math.sin(t * 35) * 0.04; // aggressive power vibrate
      } else if (chargeState === 'charging') {
        leanX = 0.35; // extreme heavy lean running
        bob = Math.abs(Math.sin(t * 15)) * 0.15;
      } else if (speed && speed > 0) {
        bob = Math.abs(Math.sin(t * 3.5)) * 0.06; // Slow marching bob
        leanX = 0.05; // walking lean
        leanZ = Math.sin(t * 1.75) * 0.015; // slow march sway
      }
      
      group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, bob, 0.1);
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, leanX, 0.1);
      group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, leanZ, 0.1);
    }
  });

  return (
    <group ref={group}>
      <primitive object={clone} rotation={[0, 0, 0]} />
    </group>
  );
}

function SentinelGlowDecorations({ chargeState }: { chargeState: 'idle' | 'telegraph' | 'charging' | 'cooldown' }) {
  const chestNode = useRef<THREE.Mesh>(null);
  const shoulderLNode = useRef<THREE.Mesh>(null);
  const shoulderRNode = useRef<THREE.Mesh>(null);
  const kneeLNode = useRef<THREE.Mesh>(null);
  const kneeRNode = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    let pulse = 0.5 + Math.sin(t * 3.5) * 0.35;
    let scale = 0.85 + Math.abs(Math.sin(t * 3.5)) * 0.2;

    if (chargeState === 'telegraph') {
      // Violent sparking white/orange flaring
      pulse = 1.0 + Math.sin(t * 45) * 0.5;
      scale = 1.2 + Math.abs(Math.sin(t * 45)) * 0.3;
    } else if (chargeState === 'charging') {
      // Extremely bright solid orange
      pulse = 1.5;
      scale = 1.4;
    }
    
    const setMatPulse = (nodeRef: React.RefObject<THREE.Mesh | null>) => {
      if (nodeRef.current && nodeRef.current.material) {
        const mat = nodeRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.min(1.0, pulse);
        nodeRef.current.scale.set(scale, scale, scale);
      }
    };
    
    setMatPulse(chestNode);
    setMatPulse(shoulderLNode);
    setMatPulse(shoulderRNode);
    setMatPulse(kneeLNode);
    setMatPulse(kneeRNode);
  });
  
  return (
    <group>
      {/* Glow Nodes signature #ff5100 */}
      <mesh ref={chestNode} position={[0, 1.3, 0.28]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshBasicMaterial color="#ff5100" transparent opacity={0.8} toneMapped={false} />
      </mesh>
      <mesh ref={shoulderLNode} position={[-0.35, 1.48, 0.08]}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshBasicMaterial color="#ff5100" transparent opacity={0.8} toneMapped={false} />
      </mesh>
      <mesh ref={shoulderRNode} position={[0.35, 1.48, 0.08]}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshBasicMaterial color="#ff5100" transparent opacity={0.8} toneMapped={false} />
      </mesh>
      <mesh ref={kneeLNode} position={[-0.2, 0.42, 0.12]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshBasicMaterial color="#ff5100" transparent opacity={0.8} toneMapped={false} />
      </mesh>
      <mesh ref={kneeRNode} position={[0.2, 0.42, 0.12]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshBasicMaterial color="#ff5100" transparent opacity={0.8} toneMapped={false} />
      </mesh>

      {/* Dual Antennae on helmet */}
      <mesh position={[-0.1, 1.82, -0.05]} rotation={[0.2, 0, -0.25]}>
        <cylinderGeometry args={[0.006, 0.006, 0.35, 8]} />
        <meshStandardMaterial color="#475569" roughness={0.3} metalness={0.8} />
      </mesh>
      <mesh position={[-0.1, 1.95, -0.05]} rotation={[0.2, 0, -0.25]}>
        <sphereGeometry args={[0.015, 8, 8]} />
        <meshBasicMaterial color="#ff5100" toneMapped={false} />
      </mesh>

      <mesh position={[0.1, 1.82, -0.05]} rotation={[0.2, 0, 0.25]}>
        <cylinderGeometry args={[0.006, 0.006, 0.35, 8]} />
        <meshStandardMaterial color="#475569" roughness={0.3} metalness={0.8} />
      </mesh>
      <mesh position={[0.1, 1.95, -0.05]} rotation={[0.2, 0, 0.25]}>
        <sphereGeometry args={[0.015, 8, 8]} />
        <meshBasicMaterial color="#ff5100" toneMapped={false} />
      </mesh>
    </group>
  );
}

function SentinelFallbackVisuals() {
  return (
    <group position={[0, 0, 0]}>
      {/* Heavy Heavy Torso / Steel alloy breast plate */}
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[0.65, 0.6, 0.35]} />
        <meshStandardMaterial color="#334155" roughness={0.2} metalness={0.8} />
      </mesh>
      {/* Heavy Steel Shoulder Plates */}
      <mesh position={[-0.34, 1.35, 0]}>
        <boxGeometry args={[0.18, 0.2, 0.3]} />
        <meshStandardMaterial color="#1f2937" roughness={0.3} metalness={0.9} />
      </mesh>
      <mesh position={[0.34, 1.35, 0]}>
        <boxGeometry args={[0.18, 0.2, 0.3]} />
        <meshStandardMaterial color="#1f2937" roughness={0.3} metalness={0.9} />
      </mesh>

      {/* Head Helmet with Visor */}
      <mesh position={[0, 1.65, 0]}>
        <boxGeometry args={[0.3, 0.32, 0.3]} />
        <meshStandardMaterial color="#334155" roughness={0.2} metalness={0.8} />
      </mesh>
      {/* Orange Laser Eye Visor */}
      <mesh position={[0, 1.68, 0.16]}>
        <boxGeometry args={[0.24, 0.06, 0.04]} />
        <meshBasicMaterial color="#ff5100" toneMapped={false} />
      </mesh>

      {/* Armored Leg Exoskeleton Bracers */}
      <mesh position={[-0.18, 0.45, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.9, 12]} />
        <meshStandardMaterial color="#4b5563" roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[0.18, 0.45, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.9, 12]} />
        <meshStandardMaterial color="#4b5563" roughness={0.4} metalness={0.7} />
      </mesh>

      {/* Tactical Hip Pouches */}
      <mesh position={[-0.3, 0.85, 0.12]} rotation={[0, 0, 0.1]}>
        <boxGeometry args={[0.12, 0.2, 0.12]} />
        <meshStandardMaterial color="#111827" roughness={0.9} metalness={0.1} />
      </mesh>
      <mesh position={[0.3, 0.85, 0.12]} rotation={[0, 0, -0.1]}>
        <boxGeometry args={[0.12, 0.2, 0.12]} />
        <meshStandardMaterial color="#111827" roughness={0.9} metalness={0.1} />
      </mesh>

      {/* Heavy HMG Armored Shotgun Attachment */}
      <mesh position={[0.42, 1.0, 0.18]} rotation={[0.1, 0, 0]}>
        <boxGeometry args={[0.15, 0.15, 0.65]} />
        <meshStandardMaterial color="#111827" roughness={0.4} metalness={0.8} />
      </mesh>
      <mesh position={[0.42, 1.0, 0.52]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.15, 8]} />
        <meshStandardMaterial color="#1f2937" roughness={0.2} metalness={0.9} />
      </mesh>
    </group>
  );
}

export function Enemy({ data }: { data: EnemyData }) {
  if (data.type === 'infiltrator') {
    return <InfiltratorEnemy data={data} />;
  }
  if (data.type === 'bombardier') {
    return <BombardierEnemy data={data} />;
  }
  if (data.type === 'overseer') {
    return <OverseerEnemy data={data} />;
  }
  if (data.type === 'drone_operator') {
    return <DroneOperatorEnemy data={data} />;
  }
  if (data.type === 'support_drone') {
    return <SupportDroneEnemy data={data} />;
  }
  return <SentinelEnemy data={data} />;
}

export function SentinelEnemy({ data }: { data: EnemyData }) {
  const showEnemyHealthBars = useStore(state => state.showEnemyHealthBars);
  const language = useStore(state => state.language);
  // Heavy march attributes
  const ENEMY_SPEED = 1.35; // Slow, heavy walking march speed
  const CHASE_DIST = 26; 
  const SHOOT_DIST = 18;
  const SHOOT_COOLDOWN = 3000; // Auto-Shotgun slow fire cooldown
  const body = useRef<RapierRigidBody>(null);
  const { camera } = useThree();
  const { world, rapier } = useRapier();
  
  const gameState = useGameStore(state => state.gameState);
  const playerState = useGameStore(state => state.playerState);
  const hitPlayer = useGameStore(state => state.hitPlayer);
  const applyKnockback = useGameStore(state => state.applyKnockback);
  const addLaser = useGameStore(state => state.addLaser);
  const addParticles = useGameStore(state => state.addParticles);

  const lastShootTime = useRef(0);
  const [shootTime, setShootTime] = useState(0);
  const patrolTarget = useRef(new THREE.Vector3());
  const lastPatrolChange = useRef(0);
  const state = useRef<'patrol' | 'chase'>('patrol');
  const [speed, setSpeed] = useState(0);

  const [hitTrigger, setHitTrigger] = useState(0);
  const lastHealth = useRef(data.health ?? 6);
  const lastBotState = useRef(data.state);

  // v1.58 Juggernaut Charge State
  const [chargeState, setChargeState] = useState<'idle' | 'telegraph' | 'charging' | 'cooldown'>('idle');
  const lastChargeTime = useRef(0);
  const chargeStartTime = useRef(0);
  const chargeDirection = useRef(new THREE.Vector3());
  const [isBuffed, setIsBuffed] = useState(false);
  const frameCount = useRef(0);

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
    lastHealth.current = data.health ?? 6;
    lastBotState.current = data.state;
  }, [data.health, data.state]);

  const groupRef = useRef<THREE.Group>(null);

  // Initialize patrol target
  useMemo(() => {
    patrolTarget.current.set(
      data.position[0] + (Math.random() - 0.5) * 10,
      data.position[1],
      data.position[2] + (Math.random() - 0.5) * 10
    );
  }, [data.position]);

  // Handle coordinates coordinate syncing on active/death
  useEffect(() => {
    if (body.current) {
      if (data.state === 'active') {
        body.current.setTranslation({ x: data.position[0], y: data.position[1], z: data.position[2] }, true);
        body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      } else {
        // Hide disabled bot collider underground safely
        body.current.setTranslation({ x: data.position[0], y: -80, z: data.position[2] }, true);
        body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
        setChargeState('idle');
      }
    }
  }, [data.state, data.position]);

  const lastState = useRef(data.state);

  // Visual particles on Neutralize and Respawn
  useEffect(() => {
    if (data.state === 'disabled' && lastState.current === 'active') {
      const p = body.current ? body.current.translation() : { x: data.position[0], y: data.position[1], z: data.position[2] };
      for (let i = 0; i < 20; i++) {
        const px = p.x + (Math.random() - 0.5) * 1.5;
        const py = p.y + Math.random() * 2.0;
        const pz = p.z + (Math.random() - 0.5) * 1.5;
        addParticles([px, py, pz], '#ff5100'); // Neon Orange particles
      }
    } else if (data.state === 'active' && lastState.current === 'disabled') {
      for (let i = 0; i < 15; i++) {
        const angle = (i / 15) * Math.PI * 2;
        const px = data.position[0] + Math.cos(angle) * 1.0;
        const py = data.position[1] + Math.random() * 2.0;
        const pz = data.position[2] + Math.sin(angle) * 1.0;
        addParticles([px, py, pz], '#ffae00');
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

    const isDashing = useGameStore.getState().isDashing;
    const slowMultiplier = isDashing ? 0.25 : 1.0;

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
    const buffFactorCooldown = isBuffed ? 0.8 : 1.0;

    const nowTime = Date.now();

    let closestTargetPos: THREE.Vector3 | null = null;
    let closestDist = CHASE_DIST;

    // Check Player
    const isPositionInSafeZone = (x: number, z: number) => {
      return Math.sqrt(x * x + z * z) < 10.5;
    };
    const playerInSafeZone = isPositionInSafeZone(camera.position.x, camera.position.z);

    if (playerState === 'active' && !playerInSafeZone) {
      const playerPos = camera.position.clone();
      playerPos.y = pos.y; // horizontal only
      const distToPlayer = currentPos.distanceTo(playerPos);
      if (distToPlayer < closestDist) {
        closestDist = distToPlayer;
        closestTargetPos = playerPos;
      }
    }

    // Check Other Players
    const otherPlayers = useGameStore.getState().otherPlayers;
    Object.values(otherPlayers).forEach(p => {
      if (p.state === 'active') {
        const pPos = new THREE.Vector3(p.position[0], pos.y, p.position[2]);
        const distToPlayer = currentPos.distanceTo(pPos);
        if (distToPlayer < closestDist) {
          closestDist = distToPlayer;
          closestTargetPos = pPos;
        }
      }
    });

    // Toggle patrol vs chase
    if (closestTargetPos) {
      state.current = 'chase';
    } else if (state.current === 'chase') {
      state.current = 'patrol';
      patrolTarget.current.set(
        currentPos.x + (Math.random() - 0.5) * 40,
        currentPos.y,
        currentPos.z + (Math.random() - 0.5) * 40
      );
      lastPatrolChange.current = nowTime;
    }

    const direction = new THREE.Vector3();

    // Heavy step visual screen vibration camera shaking nearby
    if (speed > 0 && closestTargetPos) {
      if (closestDist < 12.0) {
        // Trigger stomp vibration at peak of the slow bob march cycle
        const wave = Math.sin(state_fiber.clock.getElapsedTime() * 3.5);
        if (wave > 0.96) {
          const intensity = 0.008 * (1.0 - closestDist / 12.0);
          camera.rotation.x += (Math.random() - 0.5) * intensity;
          camera.rotation.z += (Math.random() - 0.5) * intensity;
        }
      }
    }

    // --- AI Combat Behavior States ---
    if (chargeState === 'telegraph') {
      // Stand still and spark warning flare glowing orange nodes
      body.current.setLinvel({ x: 0, y: body.current.linvel().y, z: 0 }, true);
      setSpeed(0);

      // Play charge spark particles
      if (Math.random() > 0.5) {
        addParticles([currentPos.x + (Math.random() - 0.5), currentPos.y + 1.2, currentPos.z + (Math.random() - 0.5)], '#ff5100');
      }

      if (nowTime - chargeStartTime.current > 1200) {
        setChargeState('charging');
        chargeStartTime.current = nowTime;
        soundManager.playLaserCharge?.(); // cue high pitch servo sound
      }
      return;
    }

    if (chargeState === 'charging') {
      // Dash in the fixed charge direction at 16.5m/s (massive momentum)
      body.current.setLinvel({
        x: chargeDirection.current.x * 16.5 * slowMultiplier,
        y: body.current.linvel().y,
        z: chargeDirection.current.z * 16.5 * slowMultiplier
      }, true);
      setSpeed(16.5 * slowMultiplier);

      // Particle shadow stream
      if (Math.random() > 0.3) {
        addParticles([currentPos.x, currentPos.y + 0.8, currentPos.z], '#ffae00');
      }

      // Check collision with Local Player
      if (playerState === 'active') {
        const playerPos = camera.position.clone();
        playerPos.y = pos.y;
        if (currentPos.distanceTo(playerPos) < 1.9) {
          // Impact tagged player! Apply 40 HP and severe kinetic knockback impulse and shake camera
          hitPlayer(40);
          
          const knockbackDir = new THREE.Vector3().subVectors(playerPos, currentPos).normalize();
          applyKnockback([knockbackDir.x * 18.0, 7.5, knockbackDir.z * 18.0]);
          
          // Camera violent shake
          camera.rotation.x += (Math.random() - 0.5) * 0.12;
          camera.rotation.y += (Math.random() - 0.5) * 0.12;
          
          addParticles([camera.position.x, camera.position.y, camera.position.z], '#ff0000');
          soundManager.playImpact();
          
          // Terminate charge and transition to cooldown
          setChargeState('cooldown');
          lastChargeTime.current = nowTime;
        }
      }

      if (nowTime - chargeStartTime.current > 650) {
        // Finished dash duration
        setChargeState('cooldown');
        lastChargeTime.current = nowTime;
      }
      return;
    }

    // Standard chasing / patrolling
    if (state.current === 'chase' && closestTargetPos) {
      direction.subVectors(closestTargetPos, currentPos).normalize();
      
      // Calculate target rotation for shooting threshold
      const targetRotation = Math.atan2(direction.x, direction.z);
      let diff = targetRotation - (groupRef.current?.rotation.y || 0);
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      const isFacingTarget = Math.abs(diff) < 0.5;

      // v1.58 Juggernaut Charge trigger check:
      // Player is between 12m and 25m, charge is off a 10s cooldown
      const canCharge = chargeState === 'idle' || (chargeState === 'cooldown' && nowTime - lastChargeTime.current > 10000);
      if (canCharge && closestDist > 12.0 && closestDist < 25.0 && isFacingTarget && playerState === 'active') {
        setChargeState('telegraph');
        chargeStartTime.current = nowTime;
        chargeDirection.current.copy(direction);
        soundManager.playAlarm?.(); // cue warning beep
        return;
      }

      // Auto-Shotgun Firing logic
      if (closestDist < SHOOT_DIST && nowTime - lastShootTime.current > SHOOT_COOLDOWN * buffFactorCooldown && isFacingTarget) {
        const targetEyePos = closestTargetPos.clone();
        if (closestTargetPos.distanceTo(camera.position) < 2.0) {
          targetEyePos.y = camera.position.y;
        } else {
          targetEyePos.y += 1.2;
        }

        const startPos = new THREE.Vector3(currentPos.x, currentPos.y + 1.2, currentPos.z);
        
        // HMG / Auto-Shotgun slow fire rate spread (3 separate scatter beams)
        const centralDir = new THREE.Vector3().subVectors(targetEyePos, startPos).normalize();
        
        // Offset start position to avoid hitting self
        startPos.add(centralDir.clone().multiplyScalar(1.5));

        setShootTime(nowTime);
        lastShootTime.current = nowTime;
        soundManager.playLaser(); // Deep shot play

        // Fire 3 shotgun scatter beams
        const beamAngles = isBuffed ? [-0.06, 0, 0.06] : [-0.08, 0, 0.08];
        
        beamAngles.forEach((angleOffset) => {
          const beamDir = centralDir.clone();
          // Apply horizontal spread rotation
          const cos = Math.cos(angleOffset);
          const sin = Math.sin(angleOffset);
          const rx = beamDir.x * cos - beamDir.z * sin;
          const rz = beamDir.x * sin + beamDir.z * cos;
          beamDir.x = rx;
          beamDir.z = rz;
          beamDir.normalize();

          // Add a minor generic vertical dispersion
          beamDir.y += (Math.random() - 0.5) * 0.03;
          beamDir.normalize();

          const ray = new rapier.Ray(startPos, beamDir);
          const hit = world.castRay(ray, SHOOT_DIST, true);

          if (hit) {
            const hitPoint = ray.pointAt(hit.timeOfImpact);
            const collider = hit.collider;
            const rb = collider.parent();
            
            if (rb && rb.userData) {
              const userData = rb.userData as { name?: string };
              if (userData.name === 'player') {
                hitPlayer(18); // Deal slow hard 18 HP per shotgun pellet hit
                addParticles([camera.position.x, camera.position.y, camera.position.z], '#ff5100');
                addLaser(
                  [startPos.x, startPos.y, startPos.z],
                  [camera.position.x, camera.position.y, camera.position.z],
                  '#ff5100'
                );
              } else {
                addParticles([hitPoint.x, hitPoint.y, hitPoint.z], '#ff5100');
                addLaser(
                  [startPos.x, startPos.y, startPos.z],
                  [hitPoint.x, hitPoint.y, hitPoint.z],
                  '#ff5100'
                );
              }
            } else {
              const hitPoint = ray.pointAt(hit.timeOfImpact);
              addParticles([hitPoint.x, hitPoint.y, hitPoint.z], '#ff5100');
              addLaser(
                [startPos.x, startPos.y, startPos.z],
                [hitPoint.x, hitPoint.y, hitPoint.z],
                '#ff5100'
              );
            }
          }
        });
      }
    } else {
      // Patrolling
      if (currentPos.distanceTo(patrolTarget.current) < 2 || nowTime - lastPatrolChange.current > 4000) {
        patrolTarget.current.set(
          currentPos.x + (Math.random() - 0.5) * 60,
          currentPos.y,
          currentPos.z + (Math.random() - 0.5) * 60
        );
        lastPatrolChange.current = nowTime;
      }
      direction.subVectors(patrolTarget.current, currentPos).normalize();
    }

    // Set relational rigid body velocity
    const velocity = body.current.linvel();
    body.current.setLinvel({
      x: direction.x * ENEMY_SPEED * buffFactorSpeed * slowMultiplier,
      y: velocity.y,
      z: direction.z * ENEMY_SPEED * buffFactorSpeed * slowMultiplier
    }, true);
    
    const horizontalMove = direction.x * direction.x + direction.z * direction.z;
    setSpeed(horizontalMove > 0.05 ? ENEMY_SPEED * buffFactorSpeed * slowMultiplier : 0);

    // Dynamic rotation smoothly
    if (groupRef.current && direction.lengthSq() > 0.1) {
      const targetRotation = Math.atan2(direction.x, direction.z);
      const currentRotation = groupRef.current.rotation.y;
      let diff = targetRotation - currentRotation;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      groupRef.current.rotation.y += diff * 0.12 * slowMultiplier;
    }
  });

  return (
    <RigidBody
      ref={body}
      colliders={false}
      mass={3.5} // Heavily weighted tank
      type="dynamic"
      position={data.position}
      enabledRotations={[false, false, false]}
      userData={{ name: data.id }}
    >
      <CapsuleCollider args={[0.5, 0.5]} position={[0, 1, 0]} />
      <group ref={groupRef} position={[0, 0, 0]} visible={data.state !== 'disabled'}>
        <group scale={1}>
          <SafeModel fallback={<SentinelFallbackVisuals />}>
            <SentinalModel 
              disabled={data.state === 'disabled'} 
              speed={speed} 
              hitTrigger={hitTrigger} 
              shootTime={shootTime} 
              chargeState={chargeState}
            />
          </SafeModel>
          {data.state === 'active' && (
            <SentinelGlowDecorations chargeState={chargeState} />
          )}
        </group>
        
        {/* Futuristic Cyber Name & Health Tag (2D Overlay Billboarding to escape Chrome 3D clip plane bugs) */}
        {showEnemyHealthBars && (
          <Html
            position={[0, 2.8, 0]}
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
              {/* Custom Cyberpunk Username */}
              <div className={`px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold border transition-all duration-300 ${
                chargeState === 'telegraph' || chargeState === 'charging'
                  ? 'bg-amber-950/95 text-amber-400 border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.5)] animate-pulse'
                  : data.state === 'active'
                    ? 'bg-black/90 text-orange-500 border-orange-500/20'
                    : 'bg-zinc-900/80 text-zinc-500 border-zinc-800'
              }`}>
                {chargeState === 'telegraph'
                  ? getTranslation(language, 'enemyJuggernautOvervolt')
                  : chargeState === 'charging'
                    ? getTranslation(language, 'enemyChargingSentinel')
                    : `${getTranslation(language, 'enemySentinel')} ${data.id.replace('bot-', '#0')}`
                }
              </div>

              {/* Health Bar System */}
              {data.state === 'active' && (() => {
                const maxHp = 6;
                const curHp = data.health ?? 6;
                const ratio = Math.max(0, Math.min(1, curHp / maxHp));
                const percent = ratio * 100;
                
                return (
                  <div className="flex flex-col gap-0.5 p-1 bg-black/90 border border-zinc-800 rounded-md w-24">
                    <div className="w-full bg-zinc-950 rounded overflow-hidden relative animate-none" style={{ height: '6px' }}>
                      <div 
                        className="h-full rounded-sm transition-all duration-150 bg-gradient-to-r from-orange-600 to-amber-500 shadow-[0_0_5px_#ff5100]"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[8px] font-bold text-zinc-500">
                      <span>HP</span>
                      <span>{curHp.toFixed(1)} / 6.0</span>
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
