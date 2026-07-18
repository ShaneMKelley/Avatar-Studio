import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import { RigidBody, CylinderCollider, CuboidCollider } from '@react-three/rapier';
import { useStore } from '../store/useStore';
import { soundManager } from '../utils/soundManager';
import { getProxyUrl } from '../utils/proxy';
import { isWebGPURendererActive } from '../utils/renderer';

// Custom GLTF Model Loader for User-uploaded Lilypad model
const CustomLilyPadModel: React.FC<{ url: string; scale: [number, number, number] }> = ({ url, scale }) => {
  const gltf = useGLTF(getProxyUrl(url));
  const clone = useMemo(() => gltf.scene.clone(), [gltf.scene]);
  
  useEffect(() => {
    clone.traverse((child) => {
      if ((child as any).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [clone]);

  return <primitive object={clone} scale={scale} />;
};

// Custom GLTF Model Loader for User-uploaded animated Koi model
const CustomKoiModel: React.FC<{ url: string; scale: [number, number, number] }> = ({ url, scale }) => {
  const gltf = useGLTF(getProxyUrl(url));
  const clone = useMemo(() => gltf.scene.clone(), [gltf.scene]);
  const { actions, names } = useAnimations(gltf.animations, clone);

  useEffect(() => {
    clone.traverse((child) => {
      if ((child as any).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    if (actions && names.length > 0) {
      const firstActionName = names[0];
      const action = actions[firstActionName];
      if (action) {
        action.reset().fadeIn(0.5).play();
      }
    }
  }, [clone, actions, names]);

  return <primitive object={clone} scale={scale} />;
};

interface LotusFlowerProps {
  position: [number, number, number];
  scale: number;
  offset: number;
  customLilyPadUrl?: string | null;
  onStepChange?: (pressed: boolean) => void;
}

const LotusFlower: React.FC<LotusFlowerProps> = ({ position, scale, offset, customLilyPadUrl = null, onStepChange }) => {
  const ref = useRef<THREE.Group>(null);
  const isPlayerOn = useRef(false);
  const pressOffset = useRef(0);
  const tiltX = useRef(0);
  const tiltZ = useRef(0);

  const handleCollisionEnter = () => {
    soundManager.playSplash();
    isPlayerOn.current = true;
    onStepChange?.(true);
  };

  const handleCollisionExit = () => {
    isPlayerOn.current = false;
    onStepChange?.(false);
  };

  useFrame((state, delta) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime() + offset;

    // Targets for stepping on responsiveness
    let targetPress = 0;
    let targetTiltX = 0;
    let targetTiltZ = 0;

    if (isPlayerOn.current) {
      targetPress = -0.07 * scale; // Sink slightly under player weight
      targetTiltX = Math.sin(t * 3.5) * 0.025 + 0.04;
      targetTiltZ = Math.cos(t * 3.5) * 0.025 - 0.04;
    }

    // Smoothly interpolate positions & angles
    pressOffset.current = THREE.MathUtils.lerp(pressOffset.current, targetPress, delta * 8);
    tiltX.current = THREE.MathUtils.lerp(tiltX.current, targetTiltX, delta * 6);
    tiltZ.current = THREE.MathUtils.lerp(tiltZ.current, targetTiltZ, delta * 6);

    // Floating bob + stepped press
    const bob = Math.sin(t * 1.4) * 0.015 + Math.cos(t * 0.7) * 0.01;
    ref.current.position.y = bob + pressOffset.current;

    // Floating tilt + stepped tilt
    ref.current.rotation.x = Math.sin(t * 0.8) * 0.03 + tiltX.current;
    ref.current.rotation.z = Math.cos(t * 1.0) * 0.03 + tiltZ.current;
    ref.current.rotation.y = t * 0.04; // Very slow rotation
  });

  return (
    <RigidBody 
      type="fixed" 
      position={position} 
      colliders={false}
      onCollisionEnter={handleCollisionEnter}
      onCollisionExit={handleCollisionExit}
    >
      <group ref={ref}>
        {customLilyPadUrl ? (
          <React.Suspense fallback={
            <mesh receiveShadow castShadow>
              <cylinderGeometry args={[0.55 * scale, 0.55 * scale, 0.01 * scale, 24, 1, false, 0.1, Math.PI * 2 - 0.2]} />
              <meshStandardMaterial color="#047857" roughness={0.8} metalness={0.1} />
            </mesh>
          }>
            <CustomLilyPadModel url={customLilyPadUrl} scale={[scale, scale, scale]} />
          </React.Suspense>
        ) : (
          <group scale={[scale, scale, scale]}>
            {/* Lily Pad Leaf with realistic radial wedge cutout */}
            <mesh receiveShadow castShadow>
              <cylinderGeometry args={[0.55, 0.55, 0.01, 24, 1, false, 0.1, Math.PI * 2 - 0.2]} />
              <meshStandardMaterial color="#047857" roughness={0.8} metalness={0.1} />
            </mesh>
            {/* Flower Structure */}
            <group position={[0, 0.03, 0]}>
              {Array.from({ length: 8 }).map((_, i) => {
                const angle = (i / 8) * Math.PI * 2;
                return (
                  <mesh 
                    key={i} 
                    position={[Math.cos(angle) * 0.15, 0.04, Math.sin(angle) * 0.15]} 
                    rotation={[0.3, -angle, 0]}
                    castShadow
                  >
                    <coneGeometry args={[0.07, 0.22, 4]} />
                    <meshStandardMaterial 
                      color="#f472b6" 
                      emissive="#db2777" 
                      emissiveIntensity={1.8} 
                      roughness={0.6} 
                    />
                  </mesh>
                );
              })}
              {/* Flower Center (Glowing Stamen) */}
              <mesh position={[0, 0.05, 0]}>
                <sphereGeometry args={[0.08, 8, 8]} />
                <meshStandardMaterial 
                  color="#fbbf24" 
                  emissive="#d97706" 
                  emissiveIntensity={2.5} 
                  roughness={0.3} 
                />
              </mesh>
            </group>
          </group>
        )}
      </group>
      {/* Physical Cylinder Collider slightly offset to cover the leaf surface */}
      <CylinderCollider args={[0.03, 0.55 * scale]} position={[0, 0.01, 0]} />
    </RigidBody>
  );
};

interface KoiFishProps {
  orbitRadius: number;
  speed: number;
  depth: number;
  color: string;
  emissive: string;
  scale: number;
  offset: number;
  customKoiUrl?: string | null;
}

const KoiFish: React.FC<KoiFishProps> = ({
  orbitRadius,
  speed,
  depth,
  color,
  emissive,
  scale,
  offset,
  customKoiUrl = null,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  
  // Segment refs for joint-wagging animation
  const j1 = useRef<THREE.Group>(null);
  const j2 = useRef<THREE.Group>(null);
  const j3 = useRef<THREE.Group>(null);
  const j4 = useRef<THREE.Group>(null);
  const leftFin = useRef<THREE.Mesh>(null);
  const rightFin = useRef<THREE.Mesh>(null);

  // Keep track of swim physics states
  const stateRef = useRef<{
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    wanderAngle: number;
    speedTimer: number;
    currentSpeed: number;
    targetSpeed: number;
  } | null>(null);

  if (!stateRef.current) {
    const angle = offset;
    const initialPos = new THREE.Vector3(
      Math.cos(angle) * orbitRadius,
      depth,
      Math.sin(angle) * orbitRadius
    );
    // velocity tangent to the initial circle
    const initialVel = new THREE.Vector3(
      -Math.sin(angle) * Math.abs(speed),
      0,
      Math.cos(angle) * Math.abs(speed)
    );
    stateRef.current = {
      pos: initialPos,
      vel: initialVel,
      wanderAngle: Math.random() * Math.PI * 2,
      speedTimer: Math.random() * 2,
      currentSpeed: Math.abs(speed),
      targetSpeed: Math.abs(speed),
    };
  }

  useFrame((state, delta) => {
    if (!groupRef.current || !stateRef.current) return;
    const t = state.clock.getElapsedTime() + offset;
    const fishState = stateRef.current;

    // Limit delta to prevent massive jumps when tab is inactive
    const dt = Math.min(delta, 0.1);

    // 1. Procedural Speed Adjustments (Accelerations and glides)
    fishState.speedTimer -= dt;
    if (fishState.speedTimer <= 0) {
      // Set new random target speed and reset timer
      fishState.targetSpeed = Math.abs(speed) * (0.4 + Math.random() * 1.3);
      fishState.speedTimer = 2.0 + Math.random() * 3.0; // Change every 2-5 seconds
    }
    // Smoothly interpolate current speed toward target speed
    fishState.currentSpeed = THREE.MathUtils.lerp(fishState.currentSpeed, fishState.targetSpeed, dt * 1.5);

    // 2. Craig Reynolds Wander Steering Behavior
    // Small random deviation to the wander angle
    fishState.wanderAngle += (Math.random() - 0.5) * 1.2;
    
    // Project a circle in front of the fish
    const circleCenter = fishState.vel.clone().normalize().multiplyScalar(1.2);
    const displacement = new THREE.Vector3(
      Math.cos(fishState.wanderAngle) * 0.7,
      0,
      Math.sin(fishState.wanderAngle) * 0.7
    );
    const wanderForce = circleCenter.add(displacement).multiplyScalar(1.5);

    // 3. Containment Steering Force (Stay inside pond boundary)
    // The pond is at [0, 0], with a radius of around 5.5. Keep fish within radius 4.2.
    const distToCenter = fishState.pos.length();
    const containmentForce = new THREE.Vector3(0, 0, 0);
    if (distToCenter > 4.2) {
      // Strong steering force back toward the center
      const toCenter = fishState.pos.clone().multiplyScalar(-1.0).normalize();
      const penetration = (distToCenter - 4.2) / 1.3;
      containmentForce.copy(toCenter).multiplyScalar(penetration * 6.0);
    }

    // 4. Combine Forces & Update Velocity
    const steerForce = wanderForce.add(containmentForce);
    
    // Smoothly apply steering force to velocity
    fishState.vel.addScaledVector(steerForce, dt * 3.0);
    
    // Force velocity to remain horizontal on XZ plane, then scale to currentSpeed
    fishState.vel.y = 0;
    if (fishState.vel.lengthSq() > 0.001) {
      fishState.vel.normalize().multiplyScalar(fishState.currentSpeed);
    } else {
      // Fallback forward velocity
      fishState.vel.set(Math.cos(t), 0, Math.sin(t)).normalize().multiplyScalar(fishState.currentSpeed);
    }

    // 5. Vertical Wandering (Gently bobbing and rising/sinking)
    const targetDepth = depth + Math.sin(t * 0.5) * 0.35 + Math.cos(t * 0.2) * 0.15;
    fishState.pos.y = THREE.MathUtils.lerp(fishState.pos.y, targetDepth, dt * 1.2);

    // 6. Update position
    fishState.pos.addScaledVector(fishState.vel, dt);
    groupRef.current.position.copy(fishState.pos);

    // 7. Turning & Rotation Alignment
    if (fishState.vel.lengthSq() > 0.001) {
      // Calculate target yaw (Y rotation)
      const targetRotY = Math.atan2(fishState.vel.x, fishState.vel.z);
      
      // Smoothly interpolate rotation.y (handling angle wrap-around)
      let diffY = targetRotY - groupRef.current.rotation.y;
      diffY = Math.atan2(Math.sin(diffY), Math.cos(diffY));
      groupRef.current.rotation.y += diffY * dt * 3.5;

      // Add a roll tilt (banking) based on turning rate (change in rotation.y)
      const turningRate = diffY; // proxy for angular velocity
      const targetRoll = -turningRate * 0.45;
      groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, targetRoll, dt * 4.0);
    }

    // Gentle pitch (tilting up/down based on depth changes)
    const pitch = (targetDepth - fishState.pos.y) * 0.35;
    groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, pitch, dt * 3.0);

    // 8. Coordinated Tail Wagging and Fin Flapping
    // Tail wagging frequency and amplitude scales with speed!
    const speedRatio = fishState.currentSpeed / Math.abs(speed);
    const wagFreq = (3.5 + speedRatio * 7.5) * (0.8 + 0.2 * Math.sin(t));
    const wagAmp = 0.25 + speedRatio * 0.45;

    if (j1.current) j1.current.rotation.y = Math.sin(t * wagFreq) * wagAmp * 0.25;
    if (j2.current) j2.current.rotation.y = Math.sin(t * wagFreq - 0.4) * wagAmp * 0.55;
    if (j3.current) j3.current.rotation.y = Math.sin(t * wagFreq - 0.8) * wagAmp * 0.85;
    if (j4.current) j4.current.rotation.y = Math.sin(t * wagFreq - 1.2) * wagAmp * 1.05;

    // Flapping pectoral fins
    if (leftFin.current) leftFin.current.rotation.z = -0.25 - Math.sin(t * wagFreq) * 0.2;
    if (rightFin.current) rightFin.current.rotation.z = 0.25 + Math.sin(t * wagFreq) * 0.2;
  });

  return (
    <group ref={groupRef}>
      {customKoiUrl ? (
        <React.Suspense fallback={null}>
          <CustomKoiModel url={customKoiUrl} scale={[scale * 1.5, scale * 1.5, scale * 1.5]} />
        </React.Suspense>
      ) : (
        <group scale={[scale, scale, scale]}>
          {/* Procedurally Modeled Cybernetic Bioluminescent Koi Fish */}
          {/* Main Head and Body Section */}
          <mesh castShadow receiveShadow>
            {/* Elongated head sphere */}
            <sphereGeometry args={[0.22, 16, 16]} />
            <meshStandardMaterial 
              color={color} 
              emissive={emissive} 
              emissiveIntensity={2.5} 
              roughness={0.1} 
              metalness={0.8}
            />
          </mesh>

          {/* Left Pectoral Fin */}
          <mesh ref={leftFin} position={[-0.15, 0, 0.05]} rotation={[0.2, 0, -0.3]} castShadow>
            <coneGeometry args={[0.04, 0.22, 3]} />
            <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={3.5} transparent opacity={0.85} />
          </mesh>

          {/* Right Pectoral Fin */}
          <mesh ref={rightFin} position={[0.15, 0, 0.05]} rotation={[0.2, 0, 0.3]} castShadow>
            <coneGeometry args={[0.04, 0.22, 3]} />
            <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={3.5} transparent opacity={0.85} />
          </mesh>

          {/* Glowing Bioluminescent Cyber Eyes */}
          <mesh position={[-0.1, 0.08, 0.12]} castShadow>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={3.0} />
          </mesh>
          <mesh position={[0.1, 0.08, 0.12]} castShadow>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={3.0} />
          </mesh>

          {/* Nested Joint Segment 1 */}
          <group ref={j1} position={[0, 0, -0.18]}>
            <mesh castShadow receiveShadow>
              <sphereGeometry args={[0.19, 12, 12]} />
              <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={2.0} roughness={0.1} metalness={0.8} />
            </mesh>

            {/* Nested Joint Segment 2 */}
            <group ref={j2} position={[0, 0, -0.18]}>
              <mesh castShadow receiveShadow>
                <sphereGeometry args={[0.15, 12, 12]} />
                <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={1.5} roughness={0.1} metalness={0.8} />
              </mesh>

              {/* Nested Joint Segment 3 */}
              <group ref={j3} position={[0, 0, -0.16]}>
                <mesh castShadow receiveShadow>
                  <sphereGeometry args={[0.1, 10, 10]} />
                  <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={1.0} roughness={0.1} metalness={0.8} />
                </mesh>

                {/* Nested Joint Segment 4 (Tail Fin Connection) */}
                <group ref={j4} position={[0, 0, -0.14]}>
                  {/* Tail Fin mesh (flattened cone) */}
                  <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                    <coneGeometry args={[0.14, 0.35, 3]} />
                    <meshStandardMaterial 
                      color={color} 
                      emissive={emissive} 
                      emissiveIntensity={4.0} 
                      transparent 
                      opacity={0.85} 
                    />
                  </mesh>
                </group>
              </group>
            </group>
          </group>
        </group>
      )}
    </group>
  );
};


interface PondCrystalProps {
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
  color: string;
  emissive: string;
}

const PondCrystal: React.FC<PondCrystalProps> = ({ position, scale, rotation, color, emissive }) => {
  return (
    <RigidBody type="fixed" position={position} rotation={rotation} colliders={false}>
      <mesh scale={scale} castShadow>
        <octahedronGeometry args={[1, 0]} />
        <meshStandardMaterial 
          color={color} 
          emissive={emissive} 
          emissiveIntensity={3.0} 
          roughness={0.1} 
          metalness={0.9} 
        />
      </mesh>
      {/* Match the physical footprint of the beautiful glowing octahedron */}
      <CuboidCollider args={[scale[0] * 0.7, scale[1] * 0.9, scale[2] * 0.7]} />
    </RigidBody>
  );
};

interface GroundPlateProps {
  position: [number, number, number];
  args: [number, number, number];
  color: string;
}

const GroundPlate: React.FC<GroundPlateProps> = ({ position, args, color }) => {
  const [w, h, d] = args;
  return (
    <RigidBody type="fixed" position={position} friction={0.9}>
      <mesh receiveShadow>
        <boxGeometry args={args} />
        <meshStandardMaterial 
          color={color} 
          roughness={0.85} 
          metalness={0.15} 
        />
      </mesh>
      <CuboidCollider args={[w / 2, h / 2, d / 2]} />
    </RigidBody>
  );
};

interface SteppingStoneProps {
  position: [number, number, number];
  radius: number;
  height: number;
  color: string;
}

const SteppingStone: React.FC<SteppingStoneProps> = ({ position, radius, height, color }) => {
  return (
    <RigidBody type="fixed" position={position} friction={0.9}>
      <group>
        {/* Main Step Cylinder */}
        <mesh receiveShadow castShadow>
          <cylinderGeometry args={[radius, radius, height, 24]} />
          <meshStandardMaterial 
            color={color} 
            roughness={0.2} 
            metalness={0.8}
            emissive={color}
            emissiveIntensity={1.5}
          />
        </mesh>
        {/* Cyber Ring Highlight on top rim */}
        <mesh position={[0, height / 2 + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius - 0.08, radius, 24]} />
          <meshStandardMaterial 
            color="#ffffff" 
            emissive="#ffffff" 
            emissiveIntensity={2.5} 
            transparent 
            opacity={0.95} 
          />
        </mesh>
      </group>
      <CylinderCollider args={[height / 2, radius]} />
    </RigidBody>
  );
};

// --- LOD COMPONENTS FOR PERFORMANCE AND FAILSAFE COLLISION LOAD ---

const LowPolyPalm: React.FC<{ scale: [number, number, number] }> = ({ scale }) => {
  return (
    <group scale={scale}>
      {/* Curved cyber trunk */}
      <mesh position={[0, 2.0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.15, 0.28, 4.0, 8]} />
        <meshStandardMaterial color="#78350f" roughness={0.9} />
      </mesh>
      {/* Neon glowing palm fronds */}
      <group position={[0, 4.0, 0]}>
        {Array.from({ length: 6 }).map((_, i) => {
          const angle = (i / 6) * Math.PI * 2;
          return (
            <mesh 
              key={i} 
              position={[Math.cos(angle) * 1.0, -0.3, Math.sin(angle) * 1.0]} 
              rotation={[0.4, -angle, 0.2]} 
              castShadow
            >
              <coneGeometry args={[0.3, 2.2, 4]} />
              <meshStandardMaterial color="#059669" emissive="#047857" emissiveIntensity={0.8} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
};

const LowPolyVine: React.FC<{ scale: [number, number, number] }> = ({ scale }) => {
  return (
    <group scale={scale}>
      {/* Vertical spiraled abstract trunk */}
      <mesh position={[0, 1.8, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.12, 0.22, 3.6, 6]} />
        <meshStandardMaterial color="#1e293b" roughness={0.85} />
      </mesh>
      {/* Cyber dome foliage */}
      <mesh position={[0, 3.5, 0]} castShadow receiveShadow>
        <sphereGeometry args={[1.2, 8, 8]} />
        <meshStandardMaterial color="#ec4899" emissive="#be185d" emissiveIntensity={1.0} roughness={0.5} />
      </mesh>
    </group>
  );
};

const HighPolyPalm: React.FC<{ scale: [number, number, number] }> = ({ scale }) => {
  const palmGltf = useGLTF(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/palmtree.glb'));
  const clone = useMemo(() => {
    const s = palmGltf.scene.clone();
    s.traverse((child) => {
      if ((child as any).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return s;
  }, [palmGltf.scene]);

  return <primitive object={clone} scale={scale} />;
};

const HighPolyVine: React.FC<{ scale: [number, number, number] }> = ({ scale }) => {
  const vinetreeGltf = useGLTF(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/vinetree.glb'));
  const clone = useMemo(() => {
    const s = vinetreeGltf.scene.clone();
    s.traverse((child) => {
      if ((child as any).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return s;
  }, [vinetreeGltf.scene]);

  return <primitive object={clone} scale={scale} />;
};

const LowPolyPondBasin: React.FC = () => {
  return (
    <group position={[0, -2.4, 0]}>
      {/* Outer Basin Wall Cylinder */}
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[6.1, 6.1, 4.6, 24, 1, true]} />
        <meshStandardMaterial color="#022c22" roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      {/* Inner Floor Cylinder */}
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <cylinderGeometry args={[5.9, 5.9, 0.1, 24]} />
        <meshStandardMaterial color="#022c22" roughness={0.9} />
      </mesh>
      {/* Glowing Neon Cyber Rim Ring */}
      <mesh position={[0, 2.3, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <ringGeometry args={[5.9, 6.2, 32]} />
        <meshStandardMaterial color="#22d3ee" emissive="#06b6d4" emissiveIntensity={2.5} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};

const HighPolyPondBasin: React.FC = () => {
  const pondGltf = useGLTF(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/pond.glb'));
  const clone = useMemo(() => {
    const s = pondGltf.scene.clone();
    s.traverse((child) => {
      if ((child as any).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return s;
  }, [pondGltf.scene]);

  return (
    <RigidBody type="fixed" colliders="trimesh" position={[0, -2.4, 0]} scale={[55.0, 55.0, 55.0]}>
      <primitive object={clone} />
    </RigidBody>
  );
};

export const Pond: React.FC = () => {
  const [customLilyPadUrl, setCustomLilyPadUrl] = useState<string | null>(null);
  const [customKoiUrl, setCustomKoiUrl] = useState<string | null>(null);

  useEffect(() => {
    const checkUrls = async () => {
      const lilypadCandidates = [
        'https://storage.googleapis.com/gemmai-lounge-assets/GLB/lilly.glb',
        'https://storage.googleapis.com/gemmai-lounge-assets/GLB/lily%20flower.glb',
        'https://storage.googleapis.com/gemmai-lounge-assets/GLB/lilypad.glb',
        '/models/lilly.glb',
        '/models/lilypad.glb'
      ];

      const koiCandidates = [
        'https://storage.googleapis.com/gemmai-lounge-assets/GLB/koifish.glb',
        'https://storage.googleapis.com/gemmai-lounge-assets/GLB/koi.glb',
        '/models/koifish.glb',
        '/models/koi.glb'
      ];

      // Check lilypad candidates
      for (const url of lilypadCandidates) {
        try {
          const res = await fetch(url, { method: 'HEAD' });
          if (res.ok) {
            setCustomLilyPadUrl(url);
            break;
          }
        } catch (e) {
          try {
            const resGet = await fetch(url);
            if (resGet.ok) {
              setCustomLilyPadUrl(url);
              break;
            }
          } catch (e2) {}
        }
      }

      // Check koi candidates
      for (const url of koiCandidates) {
        try {
          const res = await fetch(url, { method: 'HEAD' });
          if (res.ok) {
            setCustomKoiUrl(url);
            break;
          }
        } catch (e) {
          try {
            const resGet = await fetch(url);
            if (resGet.ok) {
              setCustomKoiUrl(url);
              break;
            }
          } catch (e2) {}
        }
      }
    };

    checkUrls();
  }, []);

  const waterRef = useRef<THREE.Mesh>(null);
  const shaderMatRef = useRef<THREE.ShaderMaterial>(null);
  
  // Track player entry/exit state to trigger splash synthesizers
  const localWasInPond = useRef(false);
  const remoteInPond = useRef<{ [key: string]: boolean }>({});

  // Center coordinate of the pond (aligns with Synth Garden spacing)
  const pondCenter = useMemo(() => new THREE.Vector3(0, 0, -12), []);
  const pondRadius = 6.0;

  // Track lilypad step ripple states
  const lilypadState = useRef([
    { active: false, timeSinceActive: 99.0, intensity: 0.0 },
    { active: false, timeSinceActive: 99.0, intensity: 0.0 },
    { active: false, timeSinceActive: 99.0, intensity: 0.0 },
    { active: false, timeSinceActive: 99.0, intensity: 0.0 },
  ]);

  const handleLilypadChange = (index: number, pressed: boolean) => {
    const item = lilypadState.current[index];
    if (pressed) {
      item.active = true;
      item.timeSinceActive = 0.0;
      item.intensity = 1.0;
    } else {
      item.active = false;
      item.timeSinceActive = 0.0;
      item.intensity = 0.6; // Step-off has a lighter ripple
    }
  };

  // Custom water shader uniforms
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColorDeep: { value: new THREE.Color('#082f49') },    // Deep cyber-ocean sky slate
    uColorShallow: { value: new THREE.Color('#0d9488') }, // Bioluminescent dark teal
    uColorNeon: { value: new THREE.Color('#22d3ee') },    // Cyber-neon cyan
    uPlayerPos: { value: new THREE.Vector3(0, 0, 0) },
    uIsPlayerInPond: { value: 0.0 },
    uLilypadPositions: { value: [
      new THREE.Vector2(-2.2, -1.8 - 12.0), // align to world position by adding pondCenter.z
      new THREE.Vector2(2.5, 1.5 - 12.0),
      new THREE.Vector2(-1.5, 2.8 - 12.0),
      new THREE.Vector2(1.8, -2.5 - 12.0)
    ] },
    uLilypadRippleTimes: { value: new Float32Array([99, 99, 99, 99]) },
    uLilypadRippleIntensities: { value: new Float32Array([0, 0, 0, 0]) }
  }), []);

  // Update loop
  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();
    if (shaderMatRef.current) {
      shaderMatRef.current.uniforms.uTime.value = time;
    }

    // High performance pattern: get state directly from store without triggers
    const localUserPosition = useStore.getState().localUserPosition;
    const users = useStore.getState().users;

    // 1. Check local player proximity & wading mechanics
    if (localUserPosition) {
      const pX = localUserPosition[0];
      const pZ = localUserPosition[2];
      const dist = Math.sqrt((pX - pondCenter.x) ** 2 + (pZ - pondCenter.z) ** 2);
      const inPondNow = dist < pondRadius;

      if (shaderMatRef.current) {
        shaderMatRef.current.uniforms.uPlayerPos.value.set(pX, 0, pZ);
        shaderMatRef.current.uniforms.uIsPlayerInPond.value = inPondNow ? 1.0 : 0.0;
      }

      // Transition check for sound effects
      if (inPondNow && !localWasInPond.current) {
        soundManager.playSplash();
        localWasInPond.current = true;
      } else if (!inPondNow && localWasInPond.current) {
        soundManager.playSplash(); // Gentle exit ripple
        localWasInPond.current = false;
      }
    }

    // 2. Check remote users wading
    if (users) {
      Object.entries(users).forEach(([userId, user]) => {
        if (!user.position) return;
        const uX = user.position[0];
        const uZ = user.position[2];
        const dist = Math.sqrt((uX - pondCenter.x) ** 2 + (uZ - pondCenter.z) ** 2);
        const inPondNow = dist < pondRadius;
        const wasInPond = !!remoteInPond.current[userId];

        if (inPondNow && !wasInPond) {
          soundManager.playSplash();
          remoteInPond.current[userId] = true;
        } else if (!inPondNow && wasInPond) {
          soundManager.playSplash();
          remoteInPond.current[userId] = false;
        }
      });
    }

    // 3. Update lilypad ripple state timers
    const dt = Math.min(delta, 0.1);
    const times = new Float32Array(4);
    const intensities = new Float32Array(4);

    for (let i = 0; i < 4; i++) {
      const item = lilypadState.current[i];
      item.timeSinceActive += dt;
      // Fade intensity out slowly over 3 seconds
      if (!item.active) {
        item.intensity = Math.max(0.0, item.intensity - dt * 0.35);
      }
      times[i] = item.timeSinceActive;
      intensities[i] = item.intensity;
    }

    if (shaderMatRef.current) {
      shaderMatRef.current.uniforms.uLilypadRippleTimes.value = times;
      shaderMatRef.current.uniforms.uLilypadRippleIntensities.value = intensities;
    }
  });

  // Custom GLSL shaders for real-time cybernetic water physics simulation
  const vertexShader = `
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    uniform float uTime;

    void main() {
      vUv = uv;
      vec3 pos = position;

      // Real-time wave mathematical equations sit directly inside the vertex shader
      float d = length(pos.xy);
      float wave = sin(d * 3.5 - uTime * 2.8) * 0.035 * smoothstep(6.0, 1.0, d);
      wave += cos(pos.x * 1.8 + uTime * 1.2) * 0.025;
      wave += sin(pos.y * 2.4 + uTime * 1.6) * 0.015;
      
      pos.z += wave; // Apply wave height before horizontal plane rotation

      vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
      vWorldPosition = worldPosition.xyz;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;

  const fragmentShader = `
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    uniform float uTime;
    uniform vec3 uColorDeep;
    uniform vec3 uColorShallow;
    uniform vec3 uColorNeon;
    uniform vec3 uPlayerPos;
    uniform float uIsPlayerInPond;

    uniform vec2 uLilypadPositions[4];
    uniform float uLilypadRippleTimes[4];
    uniform float uLilypadRippleIntensities[4];

    void main() {
      // Calculate polar coordinates matching our circular basin
      vec2 uvFromCenter = vUv - vec2(0.5);
      float dist = length(uvFromCenter);

      // High-tech digital grid overlay lines scrolling down the stream
      float gridPattern = sin(vWorldPosition.x * 2.5 + uTime * 0.5) * cos(vWorldPosition.z * 2.5 + uTime * 0.5);
      gridPattern = smoothstep(0.97, 0.99, gridPattern);

      // Procedural intersecting cyber wave patterns
      float wave1 = sin(dist * 16.0 - uTime * 3.5) * 0.5 + 0.5;
      float wave2 = cos((vWorldPosition.x + vWorldPosition.z) * 1.2 - uTime * 1.8) * 0.5 + 0.5;
      float waves = mix(wave1, wave2, 0.55);

      // Live player coordinate interaction ripple circles
      float playerDist = distance(vWorldPosition.xz, uPlayerPos.xz);
      float rippleField = 0.0;
      if (playerDist < 4.5 && uIsPlayerInPond > 0.5) {
        rippleField = sin(playerDist * 14.0 - uTime * 7.5) * 0.5 + 0.5;
        rippleField *= smoothstep(4.5, 0.0, playerDist); // Exponential fade-out boundary
        rippleField *= 0.35; // Amplitude modulation
      }

      // Add Lilypad contact ripples!
      float lilypadRipples = 0.0;
      for (int i = 0; i < 4; i++) {
        float rDist = distance(vWorldPosition.xz, uLilypadPositions[i]);
        float rTime = uLilypadRippleTimes[i];
        float rIntensity = uLilypadRippleIntensities[i];

        if (rTime < 3.0 && rIntensity > 0.01) {
          // Calculate expanding circular ripple wavefront
          float speed = 2.4;
          float waveFront = rTime * speed;
          float distToWaveFront = abs(rDist - waveFront);

          if (distToWaveFront < 1.0) {
            // Sinusoidal wave inside the wavefront envelope
            float ripple = sin((rDist - waveFront) * 18.0) * 0.5 + 0.5;
            // Fade-out ripple envelope over space and time
            float spatialFade = smoothstep(1.0, 0.0, distToWaveFront);
            float temporalFade = smoothstep(3.0, 0.0, rTime);
            
            lilypadRipples += ripple * spatialFade * temporalFade * rIntensity * 0.65;
          }
        }
      }

      // Glossy Fresnel neon metallic sheen highlights at glancing angles
      float specularRim = 1.0 - dot(vec3(0.0, 1.0, 0.0), normalize(vec3(0.0, 1.0, 0.0) + vec3(0.12, 0.18, 0.12) * waves));
      specularRim = pow(specularRim, 5.0);

      // Core water color interpolation
      vec3 waterColor = mix(uColorDeep, uColorShallow, waves);

      // Composite grid pattern overlay
      waterColor = mix(waterColor, vec3(0.9, 0.3, 0.8), gridPattern * 0.4); // Neon Magenta grid lines

      // Composite player ripple waves
      waterColor = mix(waterColor, uColorNeon, rippleField * 0.9);

      // Composite lilypad ripples
      waterColor = mix(waterColor, vec3(0.14, 0.95, 0.65), clamp(lilypadRipples, 0.0, 1.0));

      // Add edge highlight rim
      waterColor += uColorNeon * specularRim * 2.0;

      // Digital outer neon outline that glows in harmony
      float digitalRing = smoothstep(0.485, 0.495, dist) * smoothstep(0.505, 0.495, dist);
      waterColor = mix(waterColor, uColorNeon * 1.5, digitalRing * (0.6 + 0.4 * sin(uTime * 4.0)));

      // Retain opacity high enough to look wet, yet clear enough to showcase bottom crystals
      gl_FragColor = vec4(waterColor, 0.84);
    }
  `;

  return (
    <group position={[pondCenter.x, 0, pondCenter.z]}>
      
      {/* 0. CUSTOM DECK GROUND SURROUNDING THE WATER HOLE */}
      {/* South Plate (Front - Covers spawn area at [0, 12, 0] relative to pond center) */}
      <GroundPlate 
        position={[0, -0.5, 53]} 
        args={[200, 1.0, 94]} 
        color="#01160d" 
      />
      {/* North Plate (Back) */}
      <GroundPlate 
        position={[0, -0.5, -53]} 
        args={[200, 1.0, 94]} 
        color="#01160d" 
      />
      {/* West Plate (Left) */}
      <GroundPlate 
        position={[-53, -0.5, 0]} 
        args={[94, 1.0, 12]} 
        color="#01160d" 
      />
      {/* East Plate (Right) */}
      <GroundPlate 
        position={[53, -0.5, 0]} 
        args={[94, 1.0, 12]} 
        color="#01160d" 
      />

      {/* INTERACTIVE BIOLUMINESCENT STEPPING STONES (To easily walk up and out of the deep pool) */}
      {/* Central Landing Pad Base */}
      <SteppingStone position={[0.0, -2.4, 0.0]} radius={1.25} height={0.6} color="#06b6d4" />

      {/* Southwest Winding Staircase (Escapes to South/Front Deck) */}
      <SteppingStone position={[-1.2, -2.25, 1.2]} radius={1.05} height={0.9} color="#0891b2" />
      <SteppingStone position={[-2.1, -2.1, 2.1]} radius={1.0} height={1.2} color="#3b82f6" />
      <SteppingStone position={[-2.8, -1.95, 2.8]} radius={0.95} height={1.5} color="#2563eb" />
      <SteppingStone position={[-3.3, -1.8, 3.6]} radius={0.9} height={1.8} color="#8b5cf6" />
      <SteppingStone position={[-3.1, -1.65, 4.6]} radius={0.85} height={2.1} color="#a855f7" />
      <SteppingStone position={[-2.2, -1.5, 5.3]} radius={0.8} height={2.4} color="#6366f1" />

      {/* Northeast Winding Staircase (Escapes to North/Back Deck) */}
      <SteppingStone position={[1.2, -2.25, -1.2]} radius={1.05} height={0.9} color="#ec4899" />
      <SteppingStone position={[2.1, -2.1, -2.1]} radius={1.0} height={1.2} color="#db2777" />
      <SteppingStone position={[2.8, -1.95, -2.8]} radius={0.95} height={1.5} color="#f43f5e" />
      <SteppingStone position={[3.3, -1.8, -3.6]} radius={0.9} height={1.8} color="#e11d48" />
      <SteppingStone position={[3.1, -1.65, -4.6]} radius={0.85} height={2.1} color="#fb7185" />
      <SteppingStone position={[2.2, -1.5, -5.3]} radius={0.8} height={2.4} color="#ec4899" />

      {/* Wide Intermediate Side Landing Ledges for East/West Escapes with Gradual Climbing Steps */}
      {/* West Side Staircase */}
      <SteppingStone position={[-1.3, -2.25, 0.0]} radius={1.0} height={0.9} color="#059669" />
      <SteppingStone position={[-2.3, -2.1, 0.0]} radius={1.0} height={1.2} color="#0d9488" />
      <SteppingStone position={[-3.3, -1.95, 0.0]} radius={1.0} height={1.5} color="#10b981" />
      <SteppingStone position={[-4.3, -1.8, 0.0]} radius={1.05} height={1.8} color="#34d399" />
      <SteppingStone position={[-5.1, -1.65, 0.0]} radius={1.1} height={2.1} color="#059669" />
      <SteppingStone position={[-5.5, -1.5, 0.0]} radius={1.15} height={2.4} color="#10b981" />

      {/* East Side Staircase */}
      <SteppingStone position={[1.3, -2.25, 0.0]} radius={1.0} height={0.9} color="#d97706" />
      <SteppingStone position={[2.3, -2.1, 0.0]} radius={1.0} height={1.2} color="#ea580c" />
      <SteppingStone position={[3.3, -1.95, 0.0]} radius={1.0} height={1.5} color="#fbbf24" />
      <SteppingStone position={[4.3, -1.8, 0.0]} radius={1.05} height={1.8} color="#f59e0b" />
      <SteppingStone position={[5.1, -1.65, 0.0]} radius={1.1} height={2.1} color="#ea580c" />
      <SteppingStone position={[5.5, -1.5, 0.0]} radius={1.15} height={2.4} color="#fbbf24" />

      {/* 1. SOLID POND STRUCTURE WITH LOD & INSTANT ACCESSIBILITY */}
      <React.Suspense fallback={<LowPolyPondBasin />}>
        <HighPolyPondBasin />
      </React.Suspense>

      {/* 2. SOLID TREES PLACED AROUND THE POND EDGE WITH LOD & FAST-LOADING COLLISION CYLINDERS */}
      {/* Palm Tree 1 (Front Left) */}
      <RigidBody type="fixed" colliders={false} position={[-6.5, 0, 5.5]}>
        <CylinderCollider args={[4.0, 0.4]} position={[0, 4.0, 0]} />
        <React.Suspense fallback={<LowPolyPalm scale={[4.2, 4.2, 4.2]} />}>
          <HighPolyPalm scale={[4.2, 4.2, 4.2]} />
        </React.Suspense>
      </RigidBody>

      {/* Palm Tree 2 (Back Right) */}
      <RigidBody type="fixed" colliders={false} position={[6.5, 0, -5.5]}>
        <CylinderCollider args={[4.0, 0.4]} position={[0, 4.0, 0]} />
        <React.Suspense fallback={<LowPolyPalm scale={[4.2, 4.2, 4.2]} />}>
          <HighPolyPalm scale={[4.2, 4.2, 4.2]} />
        </React.Suspense>
      </RigidBody>

      {/* Vine Tree 1 (Front Right) */}
      <RigidBody type="fixed" colliders={false} position={[6.5, 0, 5.5]}>
        <CylinderCollider args={[3.5, 0.45]} position={[0, 3.5, 0]} />
        <React.Suspense fallback={<LowPolyVine scale={[3.8, 3.8, 3.8]} />}>
          <HighPolyVine scale={[3.8, 3.8, 3.8]} />
        </React.Suspense>
      </RigidBody>

      {/* Vine Tree 2 (Back Left) */}
      <RigidBody type="fixed" colliders={false} position={[-6.5, 0, -5.5]}>
        <CylinderCollider args={[3.5, 0.45]} position={[0, 3.5, 0]} />
        <React.Suspense fallback={<LowPolyVine scale={[3.8, 3.8, 3.8]} />}>
          <HighPolyVine scale={[3.8, 3.8, 3.8]} />
        </React.Suspense>
      </RigidBody>

      {/* 3. BIOLUMINESCENT UNDERWATER LOTUS FLOWERS (Floating floating on water surface at y = -0.32) */}
      <LotusFlower 
        position={[-2.2, -0.32, -1.8]} 
        scale={1.1} 
        offset={0.0} 
        customLilyPadUrl={customLilyPadUrl} 
        onStepChange={(p) => handleLilypadChange(0, p)}
      />
      <LotusFlower 
        position={[2.5, -0.32, 1.5]} 
        scale={0.9} 
        offset={Math.PI * 0.4} 
        customLilyPadUrl={customLilyPadUrl} 
        onStepChange={(p) => handleLilypadChange(1, p)}
      />
      <LotusFlower 
        position={[-1.5, -0.32, 2.8]} 
        scale={1.0} 
        offset={Math.PI * 0.85} 
        customLilyPadUrl={customLilyPadUrl} 
        onStepChange={(p) => handleLilypadChange(2, p)}
      />
      <LotusFlower 
        position={[1.8, -0.32, -2.5]} 
        scale={1.15} 
        offset={Math.PI * 1.3} 
        customLilyPadUrl={customLilyPadUrl} 
        onStepChange={(p) => handleLilypadChange(3, p)}
      />


      {/* 3.5. ANIMATED NEON KOI FISH (Swimming gracefully in procedurally wandering winding patterns) */}
      <KoiFish 
        orbitRadius={2.2} 
        speed={0.6} 
        depth={-1.0} 
        color="#ff5a36" 
        emissive="#ff2200" 
        scale={0.85} 
        offset={0.0} 
        customKoiUrl={customKoiUrl}
      />
      <KoiFish 
        orbitRadius={3.4} 
        speed={-0.42} 
        depth={-1.25} 
        color="#06b6d4" 
        emissive="#0891b2" 
        scale={1.15} 
        offset={Math.PI * 0.5} 
        customKoiUrl={customKoiUrl}
      />
      <KoiFish 
        orbitRadius={4.2} 
        speed={0.48} 
        depth={-0.85} 
        color="#a855f7" 
        emissive="#7e22ce" 
        scale={0.95} 
        offset={Math.PI * 1.1} 
        customKoiUrl={customKoiUrl}
      />
      <KoiFish 
        orbitRadius={1.7} 
        speed={-0.75} 
        depth={-1.4} 
        color="#fbbf24" 
        emissive="#d97706" 
        scale={0.75} 
        offset={Math.PI * 1.6} 
        customKoiUrl={customKoiUrl}
      />


      {/* 4. GLOWING MOSS CRYSTALS (Submerged sitting beautifully on the solid bottom plate at y = -2.3) */}
      <PondCrystal 
        position={[-3.5, -2.3, -2.5]} 
        scale={[0.3, 0.7, 0.3]} 
        rotation={[0.3, 0.5, 0.2]} 
        color="#10b981" 
        emissive="#059669" 
      />
      <PondCrystal 
        position={[3.2, -2.25, -1.0]} 
        scale={[0.25, 0.5, 0.25]} 
        rotation={[-0.4, 0.8, -0.3]} 
        color="#a855f7" 
        emissive="#7e22ce" 
      />
      <PondCrystal 
        position={[-0.5, -2.28, 3.8]} 
        scale={[0.28, 0.6, 0.28]} 
        rotation={[0.2, -0.6, 0.4]} 
        color="#06b6d4" 
        emissive="#0891b2" 
      />
      <PondCrystal 
        position={[2.0, -2.22, 3.0]} 
        scale={[0.35, 0.8, 0.35]} 
        rotation={[0.5, 0.2, -0.1]} 
        color="#ec4899" 
        emissive="#be185d" 
      />


      {/* 5. INTERACTIVE 3D WATER SURFACE MESH (Waving plane sized to fit snug inside metal rim boundary) */}
      <mesh 
        ref={waterRef} 
        position={[0, -0.3, 0]} 
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[11.8, 11.8, 64, 64]} />
        {isWebGPURendererActive() ? (
          <meshStandardMaterial
            color="#0d9488"
            roughness={0.05}
            metalness={0.8}
            transparent={true}
            opacity={0.85}
            emissive="#022c22"
            emissiveIntensity={0.8}
          />
        ) : (
          <shaderMaterial
            ref={shaderMatRef}
            vertexShader={vertexShader}
            fragmentShader={fragmentShader}
            uniforms={uniforms}
            transparent={true}
            depthWrite={false}
          />
        )}
      </mesh>

      {/* Underwater spotlight casting glow upward from centerpiece */}
      <pointLight position={[0, -2.0, 0]} color="#22d3ee" intensity={7} distance={15} decay={1.3} />
    </group>
  );
};

// Preload the pond.glb along with other essential assets
useGLTF.preload(getProxyUrl('https://storage.googleapis.com/gemmai-lounge-assets/GLB/pond.glb'));
