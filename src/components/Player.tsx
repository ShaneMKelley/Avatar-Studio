/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, useRapier, CapsuleCollider } from '@react-three/rapier';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../store';
import { useStore } from '../store/useStore';
import { soundManager } from '../utils/soundManager';

const SPEED = 12;
const MAX_LASER_DIST = 100;

export function Player() {
  const body = useRef<RapierRigidBody>(null);
  const { camera } = useThree();
  const { rapier, world } = useRapier();
  
  const playerState = useGameStore(state => state.playerState);
  const gameState = useGameStore(state => state.gameState);
  const addLaser = useGameStore(state => state.addLaser);
  const hitEnemy = useGameStore(state => state.hitEnemy);
  const addParticles = useGameStore(state => state.addParticles);

  const isSettingsOpen = useStore(state => state.isSettingsOpen);
  const isRadialMenuOpen = useStore(state => state.isRadialMenuOpen);
  const setIsSettingsOpen = useStore(state => state.setIsSettingsOpen);

  useEffect(() => {
    const handlePointerLockChange = () => {
      const state = useStore.getState();
      if (document.pointerLockElement === null && !state.isRadialMenuOpen && !state.isSettingsOpen) {
        setIsSettingsOpen(true);
      }
    };
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
    };
  }, [setIsSettingsOpen]);

  const keys = useRef({ 
    w: false, a: false, s: false, d: false,
    arrowup: false, arrowdown: false, arrowleft: false, arrowright: false,
    c: false, shift: false
  });
  const crouchHeightRef = useRef(1.6);
  const lastEmitTime = useRef(0);
  const lastShootTime = useRef(0);

  const gunGroupRef = useRef<THREE.Group>(null);
  const gunVisualRef = useRef<THREE.Group>(null);
  const gunBarrelRef = useRef<THREE.Group>(null);

  // Aim Down Sights (ADS) & Weapon Recoil refs
  const isAiming = useRef(false);
  const aimProgress = useRef(0);
  const recoilOffset = useRef(0);
  const baseFov = useRef<number | null>(null);

  // Tactical Dash Ability State
  const lastPressTimes = useRef<Record<string, number>>({ w: 0, a: 0, s: 0, d: 0 });
  const dashDirection = useRef<THREE.Vector3 | null>(null);
  const dashTimeRemaining = useRef<number>(0);

  // More robust mobile detection (checks for touch support)
  const isTouchDevice = useRef(false);
  useEffect(() => {
    isTouchDevice.current = window.matchMedia('(pointer: coarse)').matches || 
                           'ontouchstart' in window || 
                           navigator.maxTouchPoints > 0;
  }, []);

  // Guarantee pointer lock release on unmount (leaving the game)
  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') {
        try {
          if (document.pointerLockElement) {
            document.exitPointerLock();
          }
        } catch (e) {
          console.warn("Could not exit pointer lock on unmount", e);
        }
      }
    };
  }, []);

  // Trigger dash logic
  const triggerDash = (dirKey: string) => {
    if (gameState !== 'playing' || playerState !== 'active') return;
    const storeState = useGameStore.getState();
    if ((storeState.dashCooldown || 0) > 0) return; // on cooldown

    // Set 3 seconds cooldown
    useGameStore.setState({ dashCooldown: 3000 });

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, camera.up).normalize();

    const dir = new THREE.Vector3();
    if (dirKey === 'w') dir.copy(forward);
    else if (dirKey === 's') dir.copy(forward).negate();
    else if (dirKey === 'a') dir.copy(right).negate();
    else if (dirKey === 'd') dir.copy(right);

    if (dir.lengthSq() > 0) {
      dir.normalize();
      dashDirection.current = dir;
      dashTimeRemaining.current = 0.18; // 180ms kinetic burst

      // Log the tactic to notifications feed
      useGameStore.getState().addMatchLog('general', `⚡ EVASIVE DASH: Evaded incoming hazard!`);

      // Spawn starter visual zaps at player pos
      if (body.current) {
        const pPos = body.current.translation();
        useGameStore.getState().addParticles([pPos.x, pPos.y, pPos.z], '#00f7ff');
      }

      // Play snappy warp escape audio cue
      soundManager.playWarpEntering?.();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      // Intercept double taps
      if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
        const now = Date.now();
        const prevTime = lastPressTimes.current[key];
        if (now - prevTime < 320) {
          triggerDash(key);
        }
        lastPressTimes.current[key] = now;
      }

      if (key in keys.current) {
        e.preventDefault();
        keys.current[key as keyof typeof keys.current] = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key in keys.current) {
        e.preventDefault();
        keys.current[key as keyof typeof keys.current] = false;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const updatePlayerPosition = useGameStore(state => state.updatePlayerPosition);

  // Shooting logic function
  const shoot = () => {
    if (gameState !== 'playing' || playerState !== 'active') return;
    
    // Rate limit shooting
    const now = Date.now();
    if (now - lastShootTime.current < 200) return;
    lastShootTime.current = now;

    // Raycast from camera
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    // Start raycast slightly ahead of the camera to avoid hitting the player's own collider
    const rayStart = camera.position.clone().add(raycaster.ray.direction.clone().multiplyScalar(0.8));
    const ray = new rapier.Ray(rayStart, raycaster.ray.direction);
    const hit = world.castRay(ray, MAX_LASER_DIST, true);

    const startPosVec = new THREE.Vector3();
    if (gunBarrelRef.current) {
      gunBarrelRef.current.getWorldPosition(startPosVec);
    } else {
      startPosVec.copy(camera.position);
    }
    const startPos: [number, number, number] = [startPosVec.x, startPosVec.y, startPosVec.z];

    // Apply recoil
    recoilOffset.current = -0.15;
    if (gunVisualRef.current) {
      gunVisualRef.current.rotation.x = 0.1;
    }

    let endPos: [number, number, number];

    if (hit) {
      const hitPoint = ray.pointAt(hit.timeOfImpact);
      endPos = [hitPoint.x, hitPoint.y, hitPoint.z];
      
      const collider = hit.collider;
      const rb = collider.parent();
      if (rb && rb.userData) {
        const userData = rb.userData as { name?: string };
        const name = userData.name;
        
        if (name) {
          // Check if it's a bot
          if (name.startsWith('bot-')) {
            const pb = rb.translation();
            const ly = hitPoint.y - pb.y;
            
            let damage = 1.0;
            let hitTypeMsg = 'STANDARD BODY';

            const targetEnemy = useGameStore.getState().enemies.find(e => e.id === name);
            const isBomb = targetEnemy?.type === 'bombardier';
            const isOver = targetEnemy?.type === 'overseer';
            const isOp = targetEnemy?.type === 'drone_operator';
            const isDrone = targetEnemy?.type === 'support_drone';
            
            if (isBomb) {
              if (ly >= 1.25 && ly <= 2.25) {
                // Rocket pod lies asymmetrical on the right shoulder at upper heights
                const dx = hitPoint.x - pb.x;
                const dz = hitPoint.z - pb.z;
                const lateralOffset = Math.sqrt(dx * dx + dz * dz);
                
                if (lateralOffset > 0.16) {
                  damage = 9.0; // Instantly kills via weakpoint malfunction trigger
                  hitTypeMsg = 'ROCKET POD WEAKPOINT';
                } else {
                  damage = 2.0;
                  hitTypeMsg = 'CRITICAL UPPER CHASSIS';
                }
              } else if (ly < 0.7) {
                damage = 0.5; // Armored servo legs: takes reduced damage
                hitTypeMsg = 'ARMORED SERVO LEGS';
              } else {
                damage = 1.0;
                hitTypeMsg = 'STANDARD BODY';
              }
            } else if (isOver) {
              if (ly > 1.55) {
                damage = 6.0; // Instantly neutralizes on precision helmet headshot
                hitTypeMsg = 'MULTI-LENSED HELMET';
              } else {
                damage = 1.0;
                hitTypeMsg = 'STANDARD BODY';
              }
            } else if (isOp) {
              if (ly > 1.25) {
                damage = 2.0;
                hitTypeMsg = 'CRITICAL COMMUNICATIONS GEAR';
              } else {
                damage = 1.0;
                hitTypeMsg = 'STANDARD BACKPACK';
              }
            } else if (isDrone) {
              damage = 1.2;
              hitTypeMsg = 'WING ROTOR VULNERABILITY';
            } else {
              // Standard Sentinel / Infiltrator hitboxes
              if (ly > 1.6) {
                damage = 2.0;
                hitTypeMsg = 'CRITICAL HELMET';
              } else if (ly >= 1.1 && ly <= 1.4) {
                damage = 2.0;
                hitTypeMsg = 'CRITICAL CHEST';
              } else if (ly >= 0.7 && ly < 1.1) {
                damage = 0.5;
                hitTypeMsg = 'ARMORED PLATE';
              } else if (ly < 0.6) {
                damage = 1.0;
                hitTypeMsg = 'LEG JOINT';
              }
            }
            
            hitEnemy(name, true, damage, hitTypeMsg);
          } 
          // Check if it's another player (socket ID)
          else if (name !== 'player' && useGameStore.getState().otherPlayers[name]) {
            hitEnemy(name, true);
          }
        }
      }
      
      addParticles(endPos, '#00ffff');
    } else {
      endPos = [
        camera.position.x + raycaster.ray.direction.x * MAX_LASER_DIST,
        camera.position.y + raycaster.ray.direction.y * MAX_LASER_DIST,
        camera.position.z + raycaster.ray.direction.z * MAX_LASER_DIST
      ];
    }

    addLaser(startPos, endPos, '#00ffff');
  };

  useFrame((_, delta) => {
    if (!body.current || gameState !== 'playing') return;

    const mobileInput = useGameStore.getState().mobileInput;

    // Handle Mobile Shooting
    if (mobileInput.shooting) {
      shoot();
    }

    // Movement
    const velocity = body.current.linvel();

    // Check if dash is currently active
    if (dashTimeRemaining.current > 0 && dashDirection.current) {
      dashTimeRemaining.current -= delta;
      const dashSpeed = 44.0; // High speed tactical burst
      const dashVel = dashDirection.current.clone().multiplyScalar(dashSpeed);
      body.current.setLinvel({ x: dashVel.x, y: velocity.y, z: dashVel.z }, true);

      // Spawn trail particles behind player
      const playerPosVec = body.current.translation();
      const storeState = useGameStore.getState();
      const colors = ['#00f7ff', '#ec4899', '#38bdf8', '#a855f7'];
      const chosenColor = colors[Math.floor(Math.random() * colors.length)];
      storeState.addParticles([
        playerPosVec.x + (Math.random() - 0.5) * 1.5,
        playerPosVec.y + (Math.random() - 0.5) * 1.5,
        playerPosVec.z + (Math.random() - 0.5) * 1.5
      ], chosenColor);
      return;
    }
    
    const k = keys.current;
    
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, camera.up).normalize();

    // Combine keyboard and joystick input
    // Joystick Y is inverted (up is negative), so we negate it for forward movement
    // Actually, in Joystick component: Up is negative Y.
    // Forward movement should be positive.
    // Let's assume Joystick Up -> y < 0.
    // We want moveZ to be negative for forward.
    // So if joystick.y is -1, moveZ should be -1.
    // So we add joystick.y directly?
    // Wait, standard WASD: W -> moveZ = -1 (forward in Threejs is -Z usually? No, camera looks down -Z).
    // Yes, forward is -Z.
    // W key: moveZ = -1.
    // Joystick Up (y < 0): moveZ should be negative.
    // So we add mobileInput.move.y.
    
    const moveZ = (k.w ? 1 : 0) - (k.s ? 1 : 0) + (mobileInput.move.y * -1); // Invert joystick Y to match W/S logic (W is +1 in my logic below? No wait)
    
    // Original logic:
    // const moveZ = (k.w ? 1 : 0) - (k.s ? 1 : 0);
    // const direction = new THREE.Vector3();
    // direction.addScaledVector(forward, moveZ);
    
    // If I press W, moveZ is 1.
    // forward vector points in camera direction.
    // If I add scaled vector (forward * 1), I move forward.
    // So W -> 1 is correct.
    
    // Joystick Up -> y is negative (e.g. -1).
    // We want to move forward (1).
    // So we need -y.
    const joyMoveZ = -mobileInput.move.y;
    
    // Joystick Right -> x is positive.
    // D key -> moveX = 1.
    // We want moveX = 1.
    const joyMoveX = mobileInput.move.x;

    const combinedMoveZ = (k.w || k.arrowup ? 1 : 0) - (k.s || k.arrowdown ? 1 : 0) + joyMoveZ;
    const combinedMoveX = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0) + joyMoveX;

    const isCrouching = k.c || k.shift || mobileInput.crouching;

    const leroyActive = useGameStore.getState().leroyChargeActiveUntil > Date.now();
    const baseSpeed = leroyActive ? SPEED * 1.55 : SPEED;
    const currentSpeed = isCrouching ? baseSpeed * 0.45 : baseSpeed;

    const direction = new THREE.Vector3();
    direction.addScaledVector(forward, combinedMoveZ);
    direction.addScaledVector(right, combinedMoveX);
    
    if (direction.lengthSq() > 0) {
      // Clamp length to 1 to prevent faster diagonal movement if both inputs active (though rare)
      if (direction.lengthSq() > 1) direction.normalize();
      direction.multiplyScalar(currentSpeed);
    }

    body.current.setLinvel({ x: direction.x, y: velocity.y, z: direction.z }, true);

    // Apply heavy enemy Juggernaut Charge knockback impulses
    const knockback = useGameStore.getState().playerKnockback;
    if (knockback && body.current) {
      body.current.applyImpulse({ x: knockback[0], y: knockback[1], z: knockback[2] }, true);
      useGameStore.getState().clearKnockback();
    }

    // Mobile Look Rotation
    if (Math.abs(mobileInput.look.x) > 0.01 || Math.abs(mobileInput.look.y) > 0.01) {
      const lookSpeed = 2.0 * delta;
      // Yaw (Left/Right) - Rotate around Y axis
      // Joystick Right (x > 0) -> Turn Right (negative rotation around Y in standard right-handed? No, usually -Y is right? Let's test)
      // PointerLockControls: moving mouse right -> camera rotates right.
      // Euler Y decreases?
      camera.rotation.y -= mobileInput.look.x * lookSpeed;
      
      // Pitch (Up/Down) - Rotate around X axis
      // Joystick Up (y < 0) -> Look Up.
      // Looking up means increasing X rotation? Or decreasing?
      // Usually looking up is positive X?
      // Let's try standard mapping.
      camera.rotation.x -= mobileInput.look.y * lookSpeed;
      
      // Clamp pitch to avoid flipping
      camera.rotation.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, camera.rotation.x));
    }

    // Update camera position to follow rigid body with smooth crouching eye levels
    const pos = body.current.translation();
    const targetCrouchHeight = isCrouching ? 0.9 : 1.6;
    crouchHeightRef.current = THREE.MathUtils.lerp(crouchHeightRef.current, targetCrouchHeight, delta * 12);
    camera.position.set(pos.x, pos.y + crouchHeightRef.current, pos.z);

    // Sync gun to camera
    if (gunGroupRef.current) {
      gunGroupRef.current.position.copy(camera.position);
      gunGroupRef.current.quaternion.copy(camera.quaternion);
    }
    
    // Safety check: reset aim if pointer lock is lost
    if (typeof document !== 'undefined' && !document.pointerLockElement) {
      isAiming.current = false;
    }

    // Smoothly progress aiming animation (zoom in)
    const targetAim = isAiming.current ? 1 : 0;
    aimProgress.current = THREE.MathUtils.lerp(aimProgress.current, targetAim, delta * 15);

    // Zoom the camera FOV in ADS mode
    const persCamera = camera as THREE.PerspectiveCamera;
    if (persCamera.isPerspectiveCamera) {
      if (baseFov.current === null) {
        baseFov.current = persCamera.fov;
      }
      const targetFov = THREE.MathUtils.lerp(baseFov.current, baseFov.current * 0.65, aimProgress.current);
      if (Math.abs(persCamera.fov - targetFov) > 0.01) {
        persCamera.fov = targetFov;
        persCamera.updateProjectionMatrix();
      }
    }

    // Recover recoil offset
    recoilOffset.current = THREE.MathUtils.lerp(recoilOffset.current, 0, delta * 15);

    // Apply ADS weapon offsets and recoil combined with dynamic crouch dip
    if (gunVisualRef.current) {
      const crouchGunOffset = THREE.MathUtils.lerp(0, -0.05, (1.6 - crouchHeightRef.current) / 0.7);
      const posX = THREE.MathUtils.lerp(0.4, 0.0, aimProgress.current);
      const posY = THREE.MathUtils.lerp(-0.3, -0.15, aimProgress.current) + crouchGunOffset;
      const posZ = THREE.MathUtils.lerp(-0.6, -0.4, aimProgress.current) + recoilOffset.current;
      
      gunVisualRef.current.position.set(posX, posY, posZ);
      gunVisualRef.current.rotation.x = THREE.MathUtils.lerp(gunVisualRef.current.rotation.x, 0, delta * 15);
    }

    // Emit position to server
    const now = Date.now();
    if (now - lastEmitTime.current > 50) {
      updatePlayerPosition([pos.x, pos.y, pos.z], camera.rotation.y);
      useStore.getState().setLocalUserPosition([pos.x, pos.y, pos.z]);
      useStore.getState().setLocalUserRotation([camera.rotation.x, camera.rotation.y, camera.rotation.z]);
      lastEmitTime.current = now;
    }
  });

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (!document.pointerLockElement || gameState !== 'playing' || playerState !== 'active') return;
      
      if (e.button === 0) {
        // Left click: shoot
        shoot();
      } else if (e.button === 2) {
        // Right click: start aiming (ADS)
        isAiming.current = true;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        // Release right click: stop aiming
        isAiming.current = false;
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      // Prevent browser default right-click menu while in pointer lock
      if (document.pointerLockElement) {
        e.preventDefault();
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [gameState, playerState, camera, world, rapier, hitEnemy, addParticles, addLaser]);

  const mouseSensitivity = useStore(state => state.mouseSensitivity);

  return (
    <>
      {!isTouchDevice.current && !isSettingsOpen && !isRadialMenuOpen && <PointerLockControls pointerSpeed={mouseSensitivity} />}
      <RigidBody
        ref={body}
        colliders={false}
        mass={1}
        type="dynamic"
        position={[0, 2, 0]}
        enabledRotations={[false, false, false]}
        userData={{ name: 'player', isLocal: true }}
        friction={0}
      >
        <CapsuleCollider args={[0.5, 0.5]} position={[0, 1, 0]} friction={0} />
      </RigidBody>

      {/* First Person Gun */}
      <group ref={gunGroupRef}>
        <group ref={gunVisualRef} position={[0.4, -0.3, -0.6]}>
          {/* Main body */}
          <mesh position={[0, 0, 0.2]}>
            <boxGeometry args={[0.1, 0.15, 0.4]} />
            <meshStandardMaterial color="#222" metalness={0.8} roughness={0.2} />
          </mesh>
          {/* Barrel */}
          <mesh position={[0, 0.05, -0.15]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.3, 8]} />
            <meshStandardMaterial color="#111" metalness={0.9} roughness={0.1} />
          </mesh>
          {/* Neon accents */}
          <mesh position={[0, 0.08, 0.1]}>
            <boxGeometry args={[0.11, 0.02, 0.2]} />
            <meshBasicMaterial color="#00ffff" toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.05, -0.25]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.05, 8]} />
            <meshBasicMaterial color="#ff00ff" toneMapped={false} />
          </mesh>
          {/* Barrel Tip Reference */}
          <group ref={gunBarrelRef} position={[0, 0.05, -0.3]} />
        </group>
      </group>
    </>
  );
}
