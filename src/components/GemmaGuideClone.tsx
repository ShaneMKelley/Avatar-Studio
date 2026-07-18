import React, { useEffect, useRef, useState, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  VRMLoaderPlugin,
  VRM,
  VRMUtils,
  VRMExpressionPresetName,
} from "@pixiv/three-vrm";
import { MToonMaterialLoaderPlugin } from '@pixiv/three-vrm-materials-mtoon';
import { MToonNodeMaterial } from '@pixiv/three-vrm-materials-mtoon/nodes';
import * as THREE from "three";
import { useStore } from "../store/useStore";
import { soundManager } from "../utils/soundManager";
import { convertVRMMaterialsForWebGPU, isWebGPURendererActive } from "../utils/renderer";
import { VRMAnimationLoaderPlugin, VRMAnimation, createVRMAnimationClip } from "@pixiv/three-vrm-animation";
import { loadVrmaWithCache } from "../utils/vrmaCache";

interface GemmaGuideCloneProps {
  id: string;
  newUserId: string;
  newUserName: string;
  targetUserId: string;
  targetUserName: string;
  onDestroy: () => void;
}

export const GemmaGuideClone: React.FC<GemmaGuideCloneProps> = ({
  id,
  newUserId,
  newUserName,
  targetUserId,
  targetUserName,
  onDestroy,
}) => {
  const { camera } = useThree();
  const [vrm, setVrm] = useState<VRM | null>(null);
  const vrmUrl = "https://storage.googleapis.com/gemmai-lounge-assets/VRM/Cat.vrm";

  const groupRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const walkActionRef = useRef<THREE.AnimationAction | null>(null);
  const waveActionRef = useRef<THREE.AnimationAction | null>(null);
  const danceActionRef = useRef<THREE.AnimationAction | null>(null);

  const localUserId = useStore((state) => state.localUserId);
  const localUserPosition = useStore((state) => state.localUserPosition);
  const users = useStore((state) => state.users);

  // States
  // 'greeting' | 'leading' | 'merging'
  const [stage, setStage] = useState<'greeting' | 'leading' | 'merging'>('greeting');
  const [bubbleText, setBubbleText] = useState("");
  const [opacity, setOpacity] = useState(0.85); // slightly translucent pink glowing holographic look
  const [showPortalParticles, setShowPortalParticles] = useState(false);

  // Particle list for merge effect
  const [particles, setParticles] = useState<{ id: number; color: string; initialOffset: [number, number, number]; speed: number }[]>([]);

  // Refs for tracking positions
  const clonePos = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const stageAgeRef = useRef(0);
  const speechTimerRef = useRef(0);

  // Generate beautiful glowing merge particles data
  useEffect(() => {
    const list = Array.from({ length: 24 }).map((_, i) => ({
      id: i,
      color: i % 2 === 0 ? "#ec4899" : "#38bdf8", // Neon Pink & Cyber Sky Blue
      initialOffset: [
        (Math.random() - 0.5) * 1.5,
        Math.random() * 2.2,
        (Math.random() - 0.5) * 1.5,
      ] as [number, number, number],
      speed: 0.5 + Math.random() * 1.5,
    }));
    setParticles(list);
  }, []);

  // Compute a starting position near the newly joined user
  const initialPosCalculated = useMemo(() => {
    let basePos: [number, number, number] = [0, 0, 0];
    if (newUserId === localUserId) {
      basePos = localUserPosition;
    } else if (users[newUserId]) {
      basePos = users[newUserId].position;
    }
    // Spawn 1.5 meters to the right/forward of joining user
    const spawnVec = new THREE.Vector3(...basePos);
    return spawnVec.add(new THREE.Vector3(1.2, 0, 1.2));
  }, [newUserId, localUserId]);

  useEffect(() => {
    clonePos.current.copy(initialPosCalculated);
    if (groupRef.current) {
      groupRef.current.position.copy(clonePos.current);
    }
  }, [initialPosCalculated]);

  // Load VRM Model
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

    const finalUrl = vrmUrl.startsWith('/') ? `${window.location.origin}${vrmUrl}` : vrmUrl;
    loader.load(
      finalUrl,
      (gltf) => {
        if (!active) {
          VRMUtils.deepDispose(gltf.scene as any);
          return;
        }
        const vrmData = gltf.userData.vrm as VRM;
        VRMUtils.removeUnnecessaryVertices(gltf.scene as any);
        VRMUtils.combineSkeletons(gltf.scene as any);

        convertVRMMaterialsForWebGPU(vrmData.scene);

        // Customize materials to look like a high-tech glowing pink/blue holographic guardian clone!
        vrmData.scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.transparent = true;
            mat.opacity = 0.85; // translucent
            // Add custom ambient cyan/pink hues to make them stand out
            mat.emissive = new THREE.Color("#ec4899");
            mat.emissiveIntensity = 0.35;
          }
        });

        // Hands relaxed initially
        const leftUpperArm = vrmData.humanoid?.getNormalizedBoneNode("leftUpperArm");
        if (leftUpperArm) leftUpperArm.rotation.z = -1.0;
        const rightUpperArm = vrmData.humanoid?.getNormalizedBoneNode("rightUpperArm");
        if (rightUpperArm) rightUpperArm.rotation.z = 1.0;

        setVrm(vrmData);

        // Mixer and animations loading (converted to 100% standard VRMA)
        mixerRef.current = new THREE.AnimationMixer(vrmData.scene);

        // Wave Animation
        loadVrmaWithCache("/animations/waving.vrma")
          .then((vrmaGltf) => {
            if (!active || !mixerRef.current) return;
            try {
              const vrmAnimations = vrmaGltf.userData?.vrmAnimations;
              if (vrmAnimations && vrmAnimations.length > 0) {
                const vrmAnimation = vrmAnimations[0] as VRMAnimation;
                const clip = createVRMAnimationClip(vrmAnimation, vrmData as any);
                waveActionRef.current = mixerRef.current.clipAction(clip);
                waveActionRef.current.loop = THREE.LoopRepeat;
                waveActionRef.current.play();
              }
            } catch (err) {
              console.warn("[GuideClone] wave parse error:", err);
            }
          })
          .catch((err: any) => console.warn("[GuideClone] wave vrma load error:", err?.message || err));

        // Walking Animation
        loadVrmaWithCache("/animations/catwalk.vrma")
          .then((vrmaGltf) => {
            if (!active || !mixerRef.current) return;
            try {
              const vrmAnimations = vrmaGltf.userData?.vrmAnimations;
              if (vrmAnimations && vrmAnimations.length > 0) {
                const vrmAnimation = vrmAnimations[0] as VRMAnimation;
                const clip = createVRMAnimationClip(vrmAnimation, vrmData as any);
                walkActionRef.current = mixerRef.current.clipAction(clip);
                walkActionRef.current.loop = THREE.LoopRepeat;
              }
            } catch (err) {
              console.warn("[GuideClone] walk parse error:", err);
            }
          })
          .catch((err: any) => console.warn("[GuideClone] walk vrma load error:", err?.message || err));

        // Dance Animation
        loadVrmaWithCache("/animations/dance.vrma")
          .then((vrmaGltf) => {
            if (!active || !mixerRef.current) return;
            try {
              const vrmAnimations = vrmaGltf.userData?.vrmAnimations;
              if (vrmAnimations && vrmAnimations.length > 0) {
                const vrmAnimation = vrmAnimations[0] as VRMAnimation;
                const clip = createVRMAnimationClip(vrmAnimation, vrmData as any);
                danceActionRef.current = mixerRef.current.clipAction(clip);
                danceActionRef.current.loop = THREE.LoopRepeat;
              }
            } catch (err) {
              console.warn("[GuideClone] dance parse error:", err);
            }
          })
          .catch((err: any) => console.warn("[GuideClone] dance vrma load error:", err?.message || err));
      },
      undefined,
      (error) => console.error("[GuideClone] loading failed:", error)
    );

    return () => {
      active = false;
      if (vrm) {
        VRMUtils.deepDispose(vrm.scene as any);
      }
    };
  }, []);

  // Audio queue welcoming tone
  useEffect(() => {
    soundManager.playWarpEntering();
  }, []);

  // Handle stage dialog sequences
  useEffect(() => {
    if (stage === 'greeting') {
      setBubbleText(`Welcome, ${newUserName}! 🌟 Let me guide you to the other person!`);
      const speech1 = setTimeout(() => {
        setBubbleText("Follow me, partner! Let's go!");
        // Stop waving, set up walking ready
        if (waveActionRef.current) waveActionRef.current.stop();
      }, 2500);

      const transition = setTimeout(() => {
        setStage('leading');
        // Trigger walking animation
        if (walkActionRef.current) {
          walkActionRef.current.setEffectiveWeight(1.0);
          walkActionRef.current.play();
        }
      }, 5000);

      return () => {
        clearTimeout(speech1);
        clearTimeout(transition);
      };
    } else if (stage === 'leading') {
      setBubbleText("Stay close! Leading the way...");
    } else if (stage === 'merging') {
      setBubbleText("We've arrived! Merging projection arrays... ✨");
      setShowPortalParticles(true);
      soundManager.playWarpExiting();

      // Over 1.5 seconds, blend opacity to 0 and trigger onDestroy
      let start: number | null = null;
      const animateOpacity = (timestamp: number) => {
        if (!start) start = timestamp;
        const progress = (timestamp - start) / 1500;
        if (progress >= 1.0) {
          onDestroy();
        } else {
          setOpacity(0.85 * (1.0 - progress));
          requestAnimationFrame(animateOpacity);
        }
      };
      const reqId = requestAnimationFrame(animateOpacity);
      return () => cancelAnimationFrame(reqId);
    }
  }, [stage, newUserName]);

  // Main tick Loop
  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }
    if (vrm) {
      vrm.update(delta);
      // Continuous eye squint or blink loop for the clone
      if (vrm.expressionManager) {
        const blinkVal = Math.abs(Math.sin(t * 3)) > 0.98 ? 1.0 : 0.0;
        vrm.expressionManager.setValue(VRMExpressionPresetName.Blink, blinkVal);
        vrm.expressionManager.setValue(VRMExpressionPresetName.Happy, stage === 'merging' ? 1.0 : 0.5);
      }
    }

    if (!groupRef.current) return;

    // Resolve target location dynamically
    let targetPosVec = new THREE.Vector3(0, 0, 0);
    if (targetUserId === localUserId) {
      targetPosVec.set(...localUserPosition);
    } else if (users[targetUserId]) {
      targetPosVec.set(...users[targetUserId].position);
    }

    // Ground target height
    targetPosVec.y = groupRef.current.position.y;

    if (stage === 'greeting') {
      // Look at the new user who joined
      let lookAtUserVec = new THREE.Vector3(0, 0, 0);
      if (newUserId === localUserId) {
        lookAtUserVec.set(...localUserPosition);
      } else if (users[newUserId]) {
        lookAtUserVec.set(...users[newUserId].position);
      }
      lookAtUserVec.y = groupRef.current.position.y;

      const targetRotationY = Math.atan2(
        lookAtUserVec.x - groupRef.current.position.x,
        lookAtUserVec.z - groupRef.current.position.z
      );
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        targetRotationY,
        5 * delta
      );
    } else if (stage === 'leading') {
      const dir = targetPosVec.clone().sub(clonePos.current);
      const dist = dir.length();

      if (dist > 1.8) {
        // Move towards target
        dir.normalize();
        clonePos.current.addScaledVector(dir, delta * 2.8); // elegant run speed of 2.8 m/s
        groupRef.current.position.copy(clonePos.current);

        // Rotate towards movement direction
        const targetRotationY = Math.atan2(dir.x, dir.z);
        groupRef.current.rotation.y = THREE.MathUtils.lerp(
          groupRef.current.rotation.y,
          targetRotationY,
          10 * delta
        );

        if (walkActionRef.current) {
          walkActionRef.current.setEffectiveWeight(1.0);
          walkActionRef.current.setEffectiveTimeScale(1.4); // slightly faster footwork for companion
        }
      } else {
        // Arrived at destination! Transition to merge
        if (walkActionRef.current) walkActionRef.current.stop();
        if (danceActionRef.current) {
          danceActionRef.current.play();
          danceActionRef.current.setEffectiveWeight(1.0);
        }
        setStage('merging');
      }
    }
  });

  return (
    <group ref={groupRef}>
      {/* Speech / Dialog bubble */}
      {bubbleText && (
        <Html position={[0, 2.3, 0]} center distanceFactor={14}>
          <div className="bg-slate-900/90 border border-pink-500/80 text-pink-100 px-4 py-2 rounded-xl shadow-lg shadow-pink-500/20 text-xs font-sans whitespace-nowrap backdrop-blur-md animate-bounce">
            <div className="font-semibold text-pink-400 mb-0.5">GEMMA ASSISTANT CLONE</div>
            <div>{bubbleText}</div>
          </div>
        </Html>
      )}

      {/* Hologram Vector Halo ring at her feet */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.5, 0.58, 32]} />
        <meshBasicMaterial color="#ec4899" transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Floating Sparkle Merge Particles */}
      {showPortalParticles && (
        <group>
          {particles.map((p) => (
            <React.Fragment key={p.id}>
              <GuideSparkleParticle
                initialOffset={p.initialOffset}
                color={p.color}
                speed={p.speed}
              />
            </React.Fragment>
          ))}
        </group>
      )}

      {/* Actual loaded VRM scene */}
      {vrm && (
        <primitive object={vrm.scene} />
      )}
    </group>
  );
};

// Isolated individual particle wrapper for supreme performance
const GuideSparkleParticle: React.FC<{
  initialOffset: [number, number, number];
  color: string;
  speed: number;
}> = ({ initialOffset, color, speed }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.getElapsedTime();
    // Spiral upward particles
    const angle = t * speed * 4.5 + initialOffset[0];
    const radius = 0.45 + Math.sin(t * speed) * 0.2;
    
    meshRef.current.position.x = Math.sin(angle) * radius;
    meshRef.current.position.y = (initialOffset[1] + t * speed * 0.8) % 2.5;
    meshRef.current.position.z = Math.cos(angle) * radius;

    // Pulsate scale beautifully
    const scale = (0.05 + Math.abs(Math.sin(t * 8)) * 0.08) * (1.0 - (meshRef.current.position.y / 2.5));
    meshRef.current.scale.setScalar(Math.max(0.01, scale));
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color={color} transparent opacity={0.9} />
    </mesh>
  );
};
