/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useMemo, useState, useEffect } from 'react';
import { SafeModel } from './SafeModel';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { useGameStore, EnemyData } from '../store';
import { useStore } from '../store/useStore';
import { getTranslation } from '../utils/translations';
import { getProxyUrl } from '../utils/proxy';
import { useGLTF, useAnimations, Html } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import { soundManager } from '../utils/soundManager';

interface OverseerModelProps {
  disabled?: boolean;
  speed?: number;
  hitTrigger?: number;
  isStaggered?: boolean;
}

function OverseerModel({ disabled, speed, hitTrigger, isStaggered }: OverseerModelProps) {
  const group = useRef<THREE.Group>(null);
  
  // Load standard Overseer GLB from storage
  const { scene, animations } = useGLTF(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/Overseer.glb'));
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions } = useAnimations(animations, group);
  const materials = useRef<THREE.MeshStandardMaterial[]>([]);
  const flashTimer = useRef(0);
  const lastHitTrigger = useRef(0);

  // Overseer typing / gesturing animations
  const typingAction = useMemo(() => {
    const key = Object.keys(actions).find(name => 
      name.toLowerCase().includes('type') || 
      name.toLowerCase().includes('gesture') || 
      name.toLowerCase().includes('talk') || 
      name.toLowerCase().includes('aim')
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

  const testWalkAction = useMemo(() => {
    const key = Object.keys(actions).find(name => 
      name.toLowerCase().includes('walk') || 
      name.toLowerCase().includes('move')
    );
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
  }, [clone]);

  useEffect(() => {
    if (disabled) {
      Object.values(actions).forEach(action => action?.stop());
      return;
    }

    Object.values(actions).forEach(action => action?.stop());
    if (speed && speed > 0 && testWalkAction) {
      testWalkAction.reset().fadeIn(0.2).play();
    } else if (typingAction) {
      typingAction.reset().fadeIn(0.25).play();
    } else if (idleAction) {
      idleAction.reset().fadeIn(0.25).play();
    } else {
      const fallback = Object.values(actions)[0];
      if (fallback) fallback.reset().fadeIn(0.25).play();
    }
  }, [disabled, speed, actions, typingAction, idleAction, testWalkAction]);

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
        mat.emissive.setRGB(flashTimer.current * 0.95, flashTimer.current * 0.3, 0);
        mat.emissiveIntensity = flashTimer.current * 4.5;
      } else {
        const pulse = 0.8 + Math.sin(t * 5.0) * 0.4;
        mat.emissive.setRGB(pulse * 0.95, pulse * 0.32, 0.0); // Orange pulse
        mat.emissiveIntensity = pulse * 2.8;
      }
    });

    if (disabled && group.current) {
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, -Math.PI / 2.05, 0.12);
      group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, 0.02, 0.12);
    } else if (group.current) {
      let b = 0;
      if (speed && speed > 0) {
        b = Math.sin(t * 12.0) * 0.05;
      } else {
        b = Math.sin(t * 2.5) * 0.02;
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

function OverseerFallbackVisuals({ isFiring }: { isFiring: boolean }) {
  const visorRef = useRef<THREE.Mesh>(null);
  const gauntletRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (visorRef.current && visorRef.current.material) {
      const p = 1.0 + Math.sin(t * 6.0) * 0.5;
      const mat = visorRef.current.material as THREE.MeshBasicMaterial;
      mat.color.setRGB(p * 0.95, p * 0.3, 0.0);
    }
    if (gauntletRef.current && gauntletRef.current.material) {
      const p = 1.5 + Math.sin(t * 12.0) * 0.5;
      const mat = gauntletRef.current.material as THREE.MeshBasicMaterial;
      mat.color.setRGB(0.0, p * 0.6, p * 0.95); // Glowing Cyan tactial gauntlet
    }
  });

  return (
    <group>
      {/* Tall sleek command frame */}
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.26, 0.32, 1.2, 10]} />
        <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.8} />
      </mesh>

      {/* Armored shoulder guards */}
      <mesh position={[-0.32, 1.3, 0]}>
        <boxGeometry args={[0.15, 0.25, 0.22]} />
        <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.9} />
      </mesh>
      <mesh position={[0.32, 1.3, 0]}>
        <boxGeometry args={[0.15, 0.25, 0.22]} />
        <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.9} />
      </mesh>

      {/* Multi-lensed helmet stack */}
      <group position={[0, 1.48, 0]}>
        {/* Main tall helm structure */}
        <mesh>
          <cylinderGeometry args={[0.13, 0.16, 0.44, 8]} />
          <meshStandardMaterial color="#1e293b" roughness={0.1} metalness={0.95} />
        </mesh>
        
        {/* Overlapping tactical vertical lenses (3 stacked red glowing cameras) */}
        <mesh ref={visorRef} position={[0, 0.12, 0.14]}>
          <boxGeometry args={[0.05, 0.04, 0.03]} />
          <meshBasicMaterial color="#ff5100" toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.02, 0.14]}>
          <boxGeometry args={[0.07, 0.04, 0.03]} />
          <meshBasicMaterial color="#ff5100" toneMapped={false} />
        </mesh>
        <mesh position={[0, -0.08, 0.14]}>
          <boxGeometry args={[0.05, 0.04, 0.03]} />
          <meshBasicMaterial color="#ff5100" toneMapped={false} />
        </mesh>
      </group>

      {/* Standing upright typing posture */}
      <group position={[-0.38, 0.95, 0.22]} rotation={[0.4, -0.3, 0]}>
        {/* Arm */}
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.06, 0.05, 0.38]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
        {/* Wrist gauntlet typing layout */}
        <mesh ref={gauntletRef} position={[0, -0.15, 0.06]} rotation={[0.5, 0, 0]}>
          <boxGeometry args={[0.14, 0.04, 0.18]} />
          <meshBasicMaterial color="#ff5100" toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

export function OverseerEnemy({ data }: { data: EnemyData }) {
  const showEnemyHealthBars = useStore(state => state.showEnemyHealthBars);
  const language = useStore(state => state.language);
  const body = useRef<RapierRigidBody>(null);
  const { camera } = useThree();

  const gameState = useGameStore(state => state.gameState);
  const playerState = useGameStore(state => state.playerState);
  const hitPlayer = useGameStore(state => state.hitPlayer);
  const addLaser = useGameStore(state => state.addLaser);
  const addParticles = useGameStore(state => state.addParticles);
  const addEvent = useGameStore(state => state.addEvent);

  const [speed, setSpeed] = useState(0);
  const [hitTrigger, setHitTrigger] = useState(0);
  const [isFiringSelfDefense, setIsFiringSelfDefense] = useState(false);
  const [isPaintingPlayer, setIsPaintingPlayer] = useState(false);

  const lastHealth = useRef(data.health ?? 6.0);
  const lastBotState = useRef(data.state);

  const lastShotTime = useRef(0);
  const lastPaintAlertTime = useRef(0);
  const groupRef = useRef<THREE.Group>(null);
  const patrolTarget = useRef(new THREE.Vector3());
  const lastPatrolChange = useRef(0);

  // Standard stagger duration
  const isStaggered = data.dodgeTime !== undefined && Date.now() - data.dodgeTime < 750;

  // Station Tracking Metrics to detect "Stay in one spot too long" Target Painting
  const playerLastPos = useRef(new THREE.Vector3());
  const playerStationaryStartTime = useRef(Date.now());

  // Ground feedback colors
  const BUFF_RADIUS = 18.0;

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
    lastHealth.current = data.health ?? 6.0;
    lastBotState.current = data.state;
  }, [data.health, data.state]);

  // Patrol Coordinates Strategy: seeks highest ground coordinates (y value) or maintains squad centers
  useMemo(() => {
    patrolTarget.current.set(
      data.position[0] + (Math.random() - 0.5) * 15,
      data.position[1],
      data.position[2] + (Math.random() - 0.5) * 15
    );
  }, [data.position]);

  // Sync RigidBody states
  useEffect(() => {
    if (body.current) {
      if (data.state === 'active') {
        body.current.setTranslation({ x: data.position[0], y: data.position[1], z: data.position[2] }, true);
        body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      } else {
        body.current.setTranslation({ x: data.position[0], y: -90, z: data.position[2] }, true);
        body.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
        setIsPaintingPlayer(false);
      }
    }
  }, [data.state, data.position]);

  const lastState = useRef(data.state);

  // Respawn and Death particle animations
  useEffect(() => {
    if (data.state === 'disabled' && lastState.current === 'active') {
      const p = body.current ? body.current.translation() : { x: data.position[0], y: data.position[1], z: data.position[2] };
      for (let i = 0; i < 24; i++) {
        addParticles(
          [p.x + (Math.random() - 0.5) * 1.5, p.y + Math.random() * 2.5, p.z + (Math.random() - 0.5) * 1.5],
          '#ff3b00'
        );
      }
    } else if (data.state === 'active' && lastState.current === 'disabled') {
      for (let i = 0; i < 10; i++) {
        addParticles(
          [data.position[0] + (Math.random() - 0.5) * 1.2, data.position[1] + Math.random() * 2.0, data.position[2] + (Math.random() - 0.5) * 1.2],
          '#ff8c00'
        );
      }
    }
    lastState.current = data.state;
  }, [data.state, data.position, addParticles]);

  useFrame((state, delta) => {
    if (!body.current || gameState !== 'playing' || data.state === 'disabled') {
      if (body.current) {
        body.current.setLinvel({ x: 0, y: body.current.linvel().y, z: 0 }, true);
      }
      setSpeed(0);
      return;
    }

    const pos = body.current.translation();
    const currentPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    
    const toPlayerVec = new THREE.Vector3().subVectors(camera.position, currentPos);
    toPlayerVec.y = 0;
    const distToPlayer = toPlayerVec.length();
    toPlayerVec.normalize();

    const nowTime = Date.now();

    const isPositionInSafeZone = (x: number, z: number) => {
      return Math.sqrt(x * x + z * z) < 10.5;
    };
    const playerInSafeZone = isPositionInSafeZone(camera.position.x, camera.position.z);

    // 1. Target Painting system triggers if the player remains stationary inside 1.5 meters for > 3.0s
    if (playerState === 'active' && !playerInSafeZone) {
      const flatPlayerPos = new THREE.Vector3(camera.position.x, 0, camera.position.z);
      const distMovement = flatPlayerPos.distanceTo(playerLastPos.current);

      if (distMovement > 1.5) {
        playerLastPos.current.copy(flatPlayerPos);
        playerStationaryStartTime.current = nowTime;
        setIsPaintingPlayer(false);
      } else {
        const durationStationary = nowTime - playerStationaryStartTime.current;
        if (durationStationary > 3000) {
          setIsPaintingPlayer(true);
          
          if (nowTime - lastPaintAlertTime.current > 7000) {
            lastPaintAlertTime.current = nowTime;
            soundManager.playAlarm();
            addEvent('⚠️ DANGER: OVERSEER IS LOCKING SENSOR LAUNCH TARGETS! SHIFT / DODGE IMMEDIATELY!');
          }
        }
      }
    } else {
      setIsPaintingPlayer(false);
    }

    // 2. Standard sidearm Pistol defending check if player gets too close (within 12.0 units)
    if (playerState === 'active' && !playerInSafeZone && distToPlayer <= 12.0) {
      if (nowTime - lastShotTime.current > 1800 && !isStaggered) {
        lastShotTime.current = nowTime;
        setIsFiringSelfDefense(true);

        const startHeight = 1.35;
        const shootingStart: [number, number, number] = [currentPos.x, currentPos.y + startHeight, currentPos.z];
        const shootingEnd: [number, number, number] = [camera.position.x, camera.position.y - 0.25, camera.position.z];
        
        addLaser(shootingStart, shootingEnd, '#ff3c00');
        hitPlayer(7); // Light defensive firearm splash damage

        setTimeout(() => setIsFiringSelfDefense(false), 200);
      }
    }

    if (isStaggered) {
      body.current.setLinvel({ x: 0, y: body.current.linvel().y, z: 0 }, true);
      setSpeed(0);
      return;
    }

    // 3. Tactial support AI displacement (moves methodically, avoids close contact, circles around central area)
    const secureCombatRadius = 24.0;
    const moveDir = new THREE.Vector3();

    if (playerState === 'active' && !playerInSafeZone && distToPlayer < secureCombatRadius) {
      // Displace away from player to preserve safety margins
      moveDir.copy(toPlayerVec).negate().normalize();
    } else {
      // Periodic tactical flanking patrols
      if (currentPos.distanceTo(patrolTarget.current) < 2.0 || nowTime - lastPatrolChange.current > 3500) {
        const randArc = Math.random() * Math.PI * 2;
        const rad = 25.0 + Math.random() * 12.0;

        const anchorX = playerInSafeZone ? 0 : camera.position.x;
        const anchorZ = playerInSafeZone ? 0 : camera.position.z;

        patrolTarget.current.set(
          anchorX + Math.cos(randArc) * rad,
          currentPos.y,
          anchorZ + Math.sin(randArc) * rad
        );
        lastPatrolChange.current = nowTime;
      }
      moveDir.subVectors(patrolTarget.current, currentPos).normalize();
    }

    const OVERSEER_SPD = 1.65; // Methodical medium pace
    body.current.setLinvel({
      x: moveDir.x * OVERSEER_SPD,
      y: body.current.linvel().y,
      z: moveDir.z * OVERSEER_SPD
    }, true);

    setSpeed(moveDir.lengthSq() > 0.01 ? OVERSEER_SPD : 0);

    // Look towards the tracking direction/player
    if (groupRef.current) {
      let lookDirection = moveDir;
      if (playerState === 'active' && distToPlayer < 45.0) {
        lookDirection = toPlayerVec;
      }

      if (lookDirection.lengthSq() > 0.01) {
        const rotationAngle = Math.atan2(lookDirection.x, lookDirection.z);
        let diff = rotationAngle - groupRef.current.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        groupRef.current.rotation.y += diff * 0.12;
      }
    }
  });

  return (
    <group>
      {/* Dynamic laser painting lines directly target players stayed stationary */}
      {isPaintingPlayer && data.state === 'active' && (
        <group>
          {/* Laser beam rendering from headset vertical lens to camera positional center */}
          <line>
            <bufferGeometry attach="geometry">
              <float32BufferAttribute 
                attach="attributes-position"
                args={[
                  new Float32Array([
                    data.position[0], data.position[1] + 1.48, data.position[2],
                    camera.position.x, camera.position.y - 0.45, camera.position.z
                  ]),
                  3
                ]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#ff0000" linewidth={3.0} />
          </line>
        </group>
      )}

      {/* Visual glowing orange radial ring showing commander's unit tactical buffer radius */}
      {data.state === 'active' && (
        <mesh position={[data.position[0], data.position[1] + 0.04, data.position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[BUFF_RADIUS - 0.22, BUFF_RADIUS, 64]} />
          <meshBasicMaterial color="#ff5100" transparent opacity={0.65} depthWrite={false} toneMapped={false} />
        </mesh>
      )}

      <RigidBody
        ref={body}
        colliders={false}
        mass={1.8}
        type="dynamic"
        position={data.position}
        enabledRotations={[false, false, false]}
        userData={{ name: data.id }}
      >
        <CapsuleCollider args={[0.55, 0.55]} position={[0, 1.0, 0]} />
        <group ref={groupRef} visible={data.state !== 'disabled'}>
          <group scale={1}>
            <SafeModel fallback={<OverseerFallbackVisuals isFiring={isFiringSelfDefense} />}>
              <BombardierVisualHacks type="overseer" data={data}>
                <OverseerModel
                  disabled={data.state === 'disabled'}
                  speed={speed}
                  hitTrigger={hitTrigger}
                  isStaggered={isStaggered}
                />
              </BombardierVisualHacks>
            </SafeModel>
          </group>

          {/* Interactive display components */}
          {showEnemyHealthBars && (
            <Html
              position={[0, 2.65, 0]}
              center
              distanceFactor={15}
              zIndexRange={[100, 0]}
              style={{ pointerEvents: 'none' }}
            >
              <div className="flex flex-col items-center gap-1 select-none font-mono">
                <div className={`px-2 py-0.5 rounded text-[10px] border transition-all duration-300 ${
                  isPaintingPlayer 
                    ? 'bg-red-950/95 text-red-400 border-red-500 shadow-[0_0_8px_#ff0000] animate-pulse font-bold'
                    : 'bg-black/95 text-amber-500 border-amber-500/20'
                }`}>
                  {isPaintingPlayer 
                    ? getTranslation(language, 'enemyTargetPainting') 
                    : `📡 ${getTranslation(language, 'enemyOverseer')} ${data.id.replace('bot-', '#0')}`
                  }
                </div>

                {data.state === 'active' && (() => {
                  const maxHp = 6.0;
                  const curHp = data.health ?? 6.0;
                  const percent = (curHp / maxHp) * 100;
                  return (
                    <div className="flex flex-col gap-0.5 p-1 bg-black/90 border border-zinc-950 rounded w-24">
                      <div className="w-full bg-zinc-950 rounded overflow-hidden" style={{ height: '4px' }}>
                        <div 
                          className="h-full rounded transition-all duration-150 bg-gradient-to-r from-orange-600 to-amber-500 shadow-[0_0_4px_#ff6600]"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[7px] text-zinc-500 font-bold">
                        <span>CMD HP</span>
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
    </group>
  );
}

// Quick fallback helper context wrapper to allow proper bounding
function BombardierVisualHacks({ children, type, data }: { children: React.ReactNode; type: string; data: EnemyData }) {
  return <group>{children}</group>;
}
