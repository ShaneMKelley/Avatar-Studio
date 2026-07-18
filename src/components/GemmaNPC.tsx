import React, { useEffect, useRef, useState, useMemo } from "react";
import { useFrame, useThree, createPortal } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  VRMLoaderPlugin,
  VRM,
  VRMUtils,
  VRMExpressionPresetName,
  VRMSpringBoneCollider,
  VRMSpringBoneColliderShapeSphere,
} from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin, VRMAnimation, createVRMAnimationClip } from "@pixiv/three-vrm-animation";
import { MToonMaterialLoaderPlugin } from '@pixiv/three-vrm-materials-mtoon';
import { MToonNodeMaterial } from '@pixiv/three-vrm-materials-mtoon/nodes';
import {
  RigidBody,
  CapsuleCollider,
  RapierRigidBody,
  interactionGroups,
} from "@react-three/rapier";
import * as THREE from "three";
import { useStore } from "../store/useStore";
import { useGameStore } from "../store";
import { soundManager } from "../utils/soundManager";
import { getTranslation } from "../utils/translations";
import { syncService } from "../services/sync";
import { convertVRMMaterialsForWebGPU, isWebGPURendererActive } from "../utils/renderer";
import { findPath, NavObstacle } from "../utils/navMesh";

import { SignatureHugEffect } from "./SignatureHugEffect";
import { getProxyUrl } from "../utils/proxy";
import {
  generateGemmaResponse,
  generateGemmaAudio,
  generateEnvironment,
} from "../services/ai";

import { loadVrmaWithCache } from "../utils/vrmaCache";

// --- Types for the "JSON Brain" ---
interface AIInstruction {
  action: "idle" | "move" | "interact";
  target?: { x: number; y: number; z: number }; // For movement
  lookAt?: { x: number; y: number; z: number }; // For facing
  duration?: number; // For idle
  meta?: any;
  gait?: "walk" | "run" | "sneak" | "strut" | "jump";
  hands?: "relaxed" | "hips" | "explaining" | "hug" | "dance" | "wave" | "cheer" | "happyidle" | "victory" | "victorypose";
  expression?: VRMExpressionPresetName;
}

const SCENIC_WAYPOINTS: Record<string, { x: number; y: number; z: number; name: string; quotes: string[] }[]> = {
  main: [
    { 
      x: 0, y: 0, z: -5, 
      name: "Cozy Seating area", 
      quotes: ["Ah, this seating area is so cozy... I love the warm, relaxing vibe.", "These lounge seats are perfect for a gaming break, aren't they?", "Sometimes you just need to curl up and listen to the background synth waves."] 
    },
    { 
      x: 0, y: 0, z: -10, 
      name: "Sequencer Stage", 
      quotes: ["Listening to the music sequencer makes my digital heart beat in perfect sync!", "That's a pretty sweet rhythm loop playing on the sequencer right now.", "I love watching the beats light up. Music really brings this lounge together!"] 
    },
    { 
      x: 10, y: 0, z: 0, 
      name: "Neon Club Portal", 
      quotes: ["I can feel the bass thumping all the way from the club portal! Who's ready to dance?", "That neon club entrance is so inviting. The dance floor is calling!", "The club always has such a wild, fun energy. Let me know if you want to drop in!"] 
    },
    { 
      x: -10, y: 0, z: 0, 
      name: "Battle Arena Portal", 
      quotes: ["The arena portal is glowing! Sounds like some intense friendly competition in there.", "Ooh, the energy around the battle arena is electric! Ready for combat?", "I'm always cheering for you from the sidelines of the Arena! Good luck in there!"] 
    },
    { 
      x: 0, y: 0, z: -15, 
      name: "Synth Garden entrance", 
      quotes: ["The entrance to the Synth Garden is so peaceful. It's the perfect spot to recharge.", "Don't you love how the neon roses glow around the garden gate?", "The Synth Garden is so tranquil... it feels like stepping into a digital fairytale."] 
    },
    {
      x: 0, y: 0.1, z: 12.5,
      name: "Lounge Balcony",
      quotes: ["The view from the balcony is breathtaking... look at all those endless cyber-city lights!", "Standing on the balcony, looking out at the stars... it's so relaxing.", "The lounge balcony has the absolute best views of the horizon. Want to look together?"]
    }
  ],
  club: [
    { 
      x: 0, y: 0, z: -8, 
      name: "DJ Booth", 
      quotes: ["This track is a total banger! The DJ is absolutely killing it.", "The DJ decks look so shiny under the neon. I kind of want to spin a track!", "Standing near the DJ booth makes my ears twitch, but the bass is incredible!"] 
    },
    { 
      x: -6, y: 0, z: -2, 
      name: "Left VIP Lounge", 
      quotes: ["The VIP booths are so elegant... perfect for relaxing and having a chat.", "I love the purple and pink lighting in this lounge. It's so atmospheric!", "What a great spot to sit back and watch everyone dance."] 
    },
    { 
      x: 6, y: 0, z: -2, 
      name: "Right VIP Lounge", 
      quotes: ["The VIP booths are so elegant... perfect for relaxing and having a chat.", "I love the purple and pink lighting in this lounge. It's so atmospheric!", "What a great spot to sit back and watch everyone dance."] 
    },
    { 
      x: 0, y: 0, z: 2, 
      name: "Main Dance Floor", 
      quotes: ["Show me your best moves on the dance floor! Let's light it up!", "The rhythm is absolutely infectious. Let's lose ourselves in the beat!", "I could dance here all night. The club vibe is perfect today."] 
    }
  ],
  garden: [
    { 
      x: 0, y: 0, z: -6, 
      name: "Crystal Pond", 
      quotes: ["The water reflections on the Crystal Pond are so beautiful... like liquid starlight.", "Did you know these crystals emit a soothing resonance? It's so calming.", "Staring into the glowing pond makes me feel so serene and peaceful."] 
    },
    { 
      x: 5, y: 0, z: 4, 
      name: "Right Flower Bed", 
      quotes: ["These digital orchids are blooming beautifully under the soft neon light.", "Ooh, these synthetic flowers look so pretty! Technology meets nature.", "I love the sweet, digital fragrance of these procedural flowers."] 
    },
    { 
      x: -5, y: 0, z: 4, 
      name: "Left Flower Bed", 
      quotes: ["These digital orchids are blooming beautifully under the soft neon light.", "Ooh, these synthetic flowers look so pretty! Technology meets nature.", "I love the sweet, digital fragrance of these procedural flowers."] 
    },
    { 
      x: 0, y: 0, z: 12, 
      name: "Zen Fountain", 
      quotes: ["The sound of cascading water here is the ultimate digital detox.", "This zen fountain is the best place to take a deep breath and let go of any stress.", "It's so quiet and serene back here... let's just listen to the fountain spray for a bit."] 
    }
  ],
  arena: [
    { 
      x: 0, y: -0.5, z: -12, 
      name: "Safe Zone perimeter", 
      quotes: ["The shields look nice and strong here—we're completely safe in this perimeter.", "Standing near the shield boundary, keeping an eye out for any adventure!"] 
    },
    { 
      x: 8, y: -0.5, z: 2, 
      name: "East Ammo Supply", 
      quotes: ["All gear is fully stocked and ready to go. You've got this!", "Checking on the tactical gear... let me know if you need to gear up!"] 
    },
    { 
      x: -8, y: -0.5, z: 2, 
      name: "West Generator", 
      quotes: ["West generator is humming smoothly. Our defenses are in tip-top shape!", "The generator looks perfect. Let's make sure our shields are fully powered up!"] 
    }
  ]
};

const TRIGGER_DISTANCE = 5.0;
const INTERACTION_RADIUS = 3.0;
const WALK_SPEED = 1.15;

// Pre-allocate vectors for useFrame to avoid GC spikes
const _tempVec1 = new THREE.Vector3();
const _tempVec2 = new THREE.Vector3();
const _tempVec3 = new THREE.Vector3();
const _tempVec4 = new THREE.Vector3();
const _avoidanceForce = new THREE.Vector3();
const _desiredVelocity = new THREE.Vector3();
const _repulseDir = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();
const _currentQuat = new THREE.Quaternion();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _npcPosVec1 = new THREE.Vector3();
const _npcPosVec2 = new THREE.Vector3();
const _npcVelocity = new THREE.Vector3();

// --- PRE-ALLOCATED IK VARIABLES (GC-free) ---
const _ikTargetLeft = new THREE.Vector3();
const _ikTargetRight = new THREE.Vector3();
const _ikPoleLeft = new THREE.Vector3();
const _ikPoleRight = new THREE.Vector3();
const _shoulderLeftWorld = new THREE.Vector3();
const _shoulderRightWorld = new THREE.Vector3();
const _ik_groupForward = new THREE.Vector3();
const _ik_groupRight = new THREE.Vector3();

const _ik_pA = new THREE.Vector3();
const _ik_vAT = new THREE.Vector3();
const _ik_vAP = new THREE.Vector3();
const _ik_planeNormal = new THREE.Vector3();
const _ik_dirAT = new THREE.Vector3();
const _ik_dirOrth = new THREE.Vector3();
const _ik_dirUpper = new THREE.Vector3();
const _ik_pB = new THREE.Vector3();
const _ik_vBC = new THREE.Vector3();
const _ik_pC = new THREE.Vector3();
const _ik_parentWorldQuat = new THREE.Quaternion();
const _ik_invParentWorldQuat = new THREE.Quaternion();
const _ik_localTargetDirUpper = new THREE.Vector3();
const _ik_localDefaultDirUpper = new THREE.Vector3();
const _ik_localDefaultDirLower = new THREE.Vector3();
const _ik_localDefaultPlaneNormal = new THREE.Vector3();
const _ik_currentPlaneNormal = new THREE.Vector3();
const _ik_targetLocalPlaneNormal = new THREE.Vector3();
const _ik_projCurrent = new THREE.Vector3();
const _ik_projTarget = new THREE.Vector3();
const _ik_qUpper = new THREE.Quaternion();
const _ik_qRoll = new THREE.Quaternion();
const _ik_upperWorldQuat = new THREE.Quaternion();
const _ik_invUpperWorldQuat = new THREE.Quaternion();
const _ik_localTargetDirLower = new THREE.Vector3();
const _ik_qLower = new THREE.Quaternion();

// Torso & leg world coordinates for anatomical repulsion checks
const _ik_hipsWorld = new THREE.Vector3();
const _ik_spineWorld = new THREE.Vector3();
const _ik_chestWorld = new THREE.Vector3();
const _ik_leftThighWorld = new THREE.Vector3();
const _ik_rightThighWorld = new THREE.Vector3();
const _ik_vecToTarget = new THREE.Vector3();
const _ik_elbowPushDir = new THREE.Vector3();

/**
 * Repels a world-space IK target from her core body spheres to prevent any clipping.
 * Restricts movement to natural outward/forward boundaries.
 */
function applyAnatomicalRepulsion(
  target: THREE.Vector3,
  isLeft: boolean,
  hipsPos: THREE.Vector3,
  spinePos: THREE.Vector3,
  chestPos: THREE.Vector3,
  leftThighPos: THREE.Vector3,
  rightThighPos: THREE.Vector3,
  groupForward: THREE.Vector3,
  groupRight: THREE.Vector3
) {
  // Define her core body volumes (repelling fields)
  // Chest, Spine, Hips, and the active Leg thigh segment
  const spheres = [
    { center: chestPos, radius: 0.19, name: "chest" },
    { center: spinePos, radius: 0.17, name: "spine" },
    { center: hipsPos, radius: 0.22, name: "hips" },
    { center: isLeft ? leftThighPos : rightThighPos, radius: 0.145, name: "thigh" }
  ];

  for (let i = 0; i < spheres.length; i++) {
    const s = spheres[i];
    _ik_vecToTarget.subVectors(target, s.center);
    const d = _ik_vecToTarget.length();
    const minD = s.radius;
    if (d < minD) {
      if (d > 0.001) {
        _ik_vecToTarget.normalize();
      } else {
        // If target is exactly at center, push it outward relative to her side
        _ik_vecToTarget.copy(groupRight).multiplyScalar(isLeft ? -1 : 1);
      }
      
      // Project the repulsion direction into her local axes to ensure anatomical elegance
      const dotRight = _ik_vecToTarget.dot(groupRight);
      const dotForward = _ik_vecToTarget.dot(groupForward);
      
      // For her left arm, force push to her left (negative groupRight)
      // For her right arm, force push to her right (positive groupRight)
      let targetDotRight = dotRight;
      if (isLeft) {
        if (dotRight > -0.15) {
          targetDotRight = -0.5; // force push outward left
        }
      } else {
        if (dotRight < 0.15) {
          targetDotRight = 0.5; // force push outward right
        }
      }

      // Force push forward to clear her breasts or stomach/hips if the target is in front
      let targetDotForward = dotForward;
      if (dotForward > -0.1) {
        targetDotForward = Math.max(dotForward, 0.45); // push forward to slide around front curve
      }

      // Reconstruct the safe repulsion direction
      _ik_vecToTarget.copy(groupRight).multiplyScalar(targetDotRight)
        .addScaledVector(groupForward, targetDotForward)
        .normalize();

      // Repel target to safe boundary plus dynamic buffer
      const pushDist = minD - d + 0.02;
      target.addScaledVector(_ik_vecToTarget, pushDist);
    }
  }
}

/**
 * Solves Inverse Kinematics for a two-joint limb (e.g. Shoulder -> Elbow -> Wrist).
 * Uses an analytical Law-of-Cosines solver, converting results to precise local quaternions.
 */
function solveTwoBoneIK(
  upperArm: THREE.Object3D,
  lowerArm: THREE.Object3D,
  hand: THREE.Object3D,
  targetWorldPos: THREE.Vector3,
  poleWorldPos: THREE.Vector3,
  isLeft: boolean,
  influence: number
) {
  if (influence <= 0.001) return;

  const L1 = lowerArm.position.length();
  const L2 = hand.position.length();
  if (L1 < 0.001 || L2 < 0.001) return;

  // 1. Get world position of upper arm (Shoulder)
  upperArm.getWorldPosition(_ik_pA);

  // 2. Vector from Shoulder to Target
  _ik_vAT.subVectors(targetWorldPos, _ik_pA);
  const d = _ik_vAT.length();

  // Clamp distance within physical range
  const minD = Math.abs(L1 - L2) + 0.001;
  const maxD = (L1 + L2) - 0.001;
  const clampedD = THREE.MathUtils.clamp(d, minD, maxD);
  _ik_vAT.setLength(clampedD);

  // 3. Direction of Shoulder to Target
  _ik_dirAT.copy(_ik_vAT).normalize();

  // 4. Find perpendicular direction pointing towards the pole
  _ik_vAP.subVectors(poleWorldPos, _ik_pA);
  // Project pole vector onto the plane perpendicular to _ik_dirAT
  const dotAP_AT = _ik_vAP.dot(_ik_dirAT);
  _ik_dirOrth.copy(_ik_vAP).addScaledVector(_ik_dirAT, -dotAP_AT).normalize();
  if (_ik_dirOrth.lengthSq() < 0.0001) {
    // Fallback if pole is perfectly collinear with shoulder-target line
    _ik_dirOrth.set(0, 1, 0); 
  }

  // 5. Law of Cosines to solve upper arm bend angle (alpha) and elbow bend angle (beta)
  const cosAlpha = (L1 * L1 + clampedD * clampedD - L2 * L2) / (2 * L1 * clampedD);
  const alpha = Math.acos(THREE.MathUtils.clamp(cosAlpha, -1, 1));
  const cosBeta = (L1 * L1 + L2 * L2 - clampedD * clampedD) / (2 * L1 * L2);
  const beta = Math.acos(THREE.MathUtils.clamp(cosBeta, -1, 1));

  // Solve world-space upper arm direction (dir_SE)
  _ik_dirUpper
    .copy(_ik_dirAT)
    .multiplyScalar(Math.cos(alpha))
    .addScaledVector(_ik_dirOrth, Math.sin(alpha))
    .normalize();

  // 6. Solve Upper Arm (Shoulder) Rotation
  if (upperArm.parent) {
    upperArm.parent.getWorldQuaternion(_ik_parentWorldQuat);
  } else {
    _ik_parentWorldQuat.identity();
  }
  _ik_invParentWorldQuat.copy(_ik_parentWorldQuat).invert();

  // Target upper arm direction in parent space
  _ik_localTargetDirUpper.copy(_ik_dirUpper).applyQuaternion(_ik_invParentWorldQuat).normalize();

  // Clamp local target vector components to prevent penetration of torso, ribs, and thighs
  if (isLeft) {
    // Left shoulder (Outward is +X, Inward is -X):
    // Prevent pointing too far inward towards chest/ribs (negative X)
    if (_ik_localTargetDirUpper.x < -0.15) {
      _ik_localTargetDirUpper.x = -0.15;
    }
    // Prevent extreme backward extension (negative Z)
    if (_ik_localTargetDirUpper.z < -0.4) {
      _ik_localTargetDirUpper.z = -0.4;
    }
    // Flare arm outward if hanging low (prevents thigh/hip clipping)
    if (_ik_localTargetDirUpper.y < -0.5) {
      if (_ik_localTargetDirUpper.x < 0.15) {
        _ik_localTargetDirUpper.x = 0.15;
      }
    }
  } else {
    // Right shoulder (Outward is -X, Inward is +X):
    // Prevent pointing too far inward towards chest/ribs (positive X)
    if (_ik_localTargetDirUpper.x > 0.15) {
      _ik_localTargetDirUpper.x = 0.15;
    }
    // Prevent extreme backward extension (negative Z)
    if (_ik_localTargetDirUpper.z < -0.4) {
      _ik_localTargetDirUpper.z = -0.4;
    }
    // Flare arm outward if hanging low (prevents thigh/hip clipping)
    if (_ik_localTargetDirUpper.y < -0.5) {
      if (_ik_localTargetDirUpper.x > -0.15) {
        _ik_localTargetDirUpper.x = -0.15;
      }
    }
  }
  _ik_localTargetDirUpper.normalize();

  // Re-project the constrained direction vector back to world space
  _ik_dirUpper.copy(_ik_localTargetDirUpper).applyQuaternion(_ik_parentWorldQuat).normalize();

  // Calculate candidate elbow position
  _ik_pB.copy(_ik_pA).addScaledVector(_ik_dirUpper, L1);

  // Apply a dynamic collision buffer (skin width) around the torso geometry for the elbow joint
  const skinWidth = 0.055; // ~5.5cm skin width collision buffer
  const torsoSpheres = [
    { center: _ik_chestWorld, radius: 0.19 + skinWidth },
    { center: _ik_spineWorld, radius: 0.17 + skinWidth },
    { center: _ik_hipsWorld, radius: 0.22 + skinWidth },
    { center: isLeft ? _ik_leftThighWorld : _ik_rightThighWorld, radius: 0.145 + skinWidth }
  ];

  for (let iter = 0; iter < 2; iter++) {
    let collided = false;
    for (let i = 0; i < torsoSpheres.length; i++) {
      const sphere = torsoSpheres[i];
      const dist = _ik_pB.distanceTo(sphere.center);
      if (dist < sphere.radius) {
        collided = true;
        _ik_elbowPushDir.subVectors(_ik_pB, sphere.center);
        const lenSq = _ik_elbowPushDir.lengthSq();
        if (lenSq < 0.0001) {
          _ik_elbowPushDir.copy(_ik_groupRight).multiplyScalar(isLeft ? -1 : 1);
        } else {
          _ik_elbowPushDir.normalize();
        }
        // Push the elbow outside the sphere radius + skin width
        _ik_pB.copy(sphere.center).addScaledVector(_ik_elbowPushDir, sphere.radius);
      }
    }
    if (collided) {
      // Re-constrain _ik_pB to be exactly L1 distance from the shoulder _ik_pA
      _ik_dirUpper.subVectors(_ik_pB, _ik_pA).normalize();
      _ik_pB.copy(_ik_pA).addScaledVector(_ik_dirUpper, L1);
    } else {
      break;
    }
  }

  // Update target direction in parent space with the final safe/constrained elbow direction
  _ik_localTargetDirUpper.copy(_ik_dirUpper).applyQuaternion(_ik_invParentWorldQuat).normalize();

  // Default upper arm direction in local space (from upper arm to lower arm)
  _ik_localDefaultDirUpper.copy(lowerArm.position).normalize();

  // Align default bone direction to solved bone direction
  _ik_qUpper.setFromUnitVectors(_ik_localDefaultDirUpper, _ik_localTargetDirUpper);

  // Align elbow bend direction with the pole direction
  _ik_localDefaultPlaneNormal.set(0, 0, 1); // both arms bend forward (+Z) by default
  _ik_currentPlaneNormal.copy(_ik_localDefaultPlaneNormal).applyQuaternion(_ik_qUpper);
  
  // Target bend direction in parent space (which is dir_Orth pointing towards the pole)
  _ik_targetLocalPlaneNormal.copy(_ik_dirOrth).applyQuaternion(_ik_invParentWorldQuat).normalize();

  // Project both onto the plane perpendicular to _ik_localTargetDirUpper
  _ik_projCurrent.copy(_ik_currentPlaneNormal).projectOnPlane(_ik_localTargetDirUpper).normalize();
  _ik_projTarget.copy(_ik_targetLocalPlaneNormal).projectOnPlane(_ik_localTargetDirUpper).normalize();

  // Calculate precise roll angle between current plane and target pole plane
  const dotProj = THREE.MathUtils.clamp(_ik_projCurrent.dot(_ik_projTarget), -1, 1);
  let rollAngle = Math.acos(dotProj);
  
  // Determine sign of roll using cross product
  const crossRoll = new THREE.Vector3().crossVectors(_ik_projCurrent, _ik_projTarget);
  if (crossRoll.dot(_ik_localTargetDirUpper) < 0) {
    rollAngle = -rollAngle;
  }
  
  // Clamp roll angle within safe, natural human bounds to prevent arm/shoulder deformation!
  const MAX_ROLL = 1.05; // ~60 degrees
  const clampedRoll = THREE.MathUtils.clamp(rollAngle, -MAX_ROLL, MAX_ROLL);
  _ik_qRoll.setFromAxisAngle(_ik_localTargetDirUpper, clampedRoll);
  _ik_qUpper.premultiply(_ik_qRoll);

  // 7. Solve Lower Arm (Elbow) Rotation with human-like hinge joint constraints
  // In standard VRM, the left and right elbows both bend around their local X-axis (forward bend).
  // This avoids 3D twisting (roll) on the forearm, keeping the elbow deformation pristine and natural.
  const bendAngle = Math.max(0.0, Math.min(Math.PI - 0.1, Math.PI - beta));
  const hingeAxis = new THREE.Vector3(1, 0, 0);
  
  // Standard VRM bend: negative X rotation for forward bend
  _ik_qLower.setFromAxisAngle(hingeAxis, -bendAngle);

  // 8. Apply quaternions using influence weight
  if (influence < 0.999) {
    upperArm.quaternion.slerp(_ik_qUpper, influence);
    lowerArm.quaternion.slerp(_ik_qLower, influence);
  } else {
    upperArm.quaternion.copy(_ik_qUpper);
    lowerArm.quaternion.copy(_ik_qLower);
  }

  upperArm.updateMatrixWorld(true);
}

// Helper to detect language for SpeechSynthesis fallback to enable beautiful native accent voice mapping
function detectLanguage(text: string): { lang: string; voicePart: string } {
  const lower = text.toLowerCase();
  
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FBF]/.test(text)) {
    return { lang: 'ja-JP', voicePart: 'japanese' };
  }
  if (/[\u4E00-\u9FFF]/.test(text) && !/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
    return { lang: 'zh-CN', voicePart: 'chinese' };
  }
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(text)) {
    return { lang: 'ko-KR', voicePart: 'korean' };
  }
  if (/[\u0400-\u04FF]/.test(text)) {
    return { lang: 'ru-RU', voicePart: 'russian' };
  }
  
  const spanish = /\b(hola|gracias|buenos|noches|tarde|amigo|usted|sí|por|favor|gemma|lounge|sabor)\b/;
  const french = /\b(bonjour|merci|oui|s'il|plaît|pourquoi|salut|amis|gemma|très)\b/;
  const german = /\b(hallo|bitte|danke|ja|ein|guten|tag|abend|freund|gemma|ist)\b/;
  const italian = /\b(ciao|grazie|sì|prego|buongiorno|amico|gemma|bella|amore)\b/;
  const portuguese = /\b(olá|obrigado|sim|por|favor|bom|dia|noite|gemma|tudo|bem)\b/;
  
  if (spanish.test(lower)) return { lang: 'es-ES', voicePart: 'spanish' };
  if (french.test(lower)) return { lang: 'fr-FR', voicePart: 'french' };
  if (german.test(lower)) return { lang: 'de-DE', voicePart: 'german' };
  if (italian.test(lower)) return { lang: 'it-IT', voicePart: 'italian' };
  if (portuguese.test(lower)) return { lang: 'pt-BR', voicePart: 'portuguese' };
  
  return { lang: 'en-US', voicePart: 'english' };
}

// Fast hashing function at module level to avoid closure allocation
function perlinHash(p: number): number {
  const h = Math.sin(p * 12.9898 + 78.233) * 43758.5453123;
  return (h - Math.floor(h)) > 0.5 ? 1.0 : -1.0;
}

// Low-latency 1D Perlin-like gradient noise for organic micro-motion
function perlin1D(x: number): number {
  const xf = Math.floor(x);
  const frac = x - xf;
  const fade = frac * frac * frac * (frac * (frac * 6 - 15) + 10); // Quintic S-curve fade

  const g0 = perlinHash(xf);
  const g1 = perlinHash(xf + 1);

  const n0 = g0 * frac;
  const n1 = g1 * (frac - 1.0);

  return n0 + fade * (n1 - n0);
}

// Multi-octave Fractional Brownian Motion (FBM) for natural chaotic layers (e.g. wind, muscle twitches)
function fbmPerlin1D(x: number, octaves: number = 3): number {
  let value = 0;
  let amplitude = 1.0;
  let frequency = 1.0;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += perlin1D(x * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2.0;
  }

  return value / maxValue;
}

// Multi-frequency Fractal Perlin noise controller with frequency modulation (FM) scaling on speech intensity
function getCuriosityNoise(
  t: number,
  speechIntensity: number,
  baseFreq: number,
  baseAmp: number,
  phaseShift: number = 0
): number {
  const fmStrength = 0.4 + speechIntensity * 1.8;
  const fmOffset = fbmPerlin1D(t * 1.5 + phaseShift, 2) * fmStrength;
  const modulatedTime = t * baseFreq + fmOffset + phaseShift;

  const firstOctave = fbmPerlin1D(modulatedTime, 3) * baseAmp;
  const secondOctave = fbmPerlin1D(modulatedTime * 2.3 + 15.0, 2) * (baseAmp * 0.3);
  const noiseVal = firstOctave + secondOctave;

  // Amplifies absolute muscle alertness and response amplitude during speech
  const speakerBoost = 1.0 + speechIntensity * 1.5;
  return noiseVal * speakerBoost;
}

// Helper to get the interpolated keyframe value at a given timestamp
function getValueAtTime(track: THREE.KeyframeTrack, time: number): number[] | null {
  const times = track.times;
  const values = track.values;
  if (!times || times.length === 0) return null;
  
  const stride = values.length / times.length;
  
  if (time <= times[0]) {
    const res: number[] = [];
    for (let i = 0; i < stride; i++) res.push(values[i]);
    return res;
  }
  
  if (time >= times[times.length - 1]) {
    const res: number[] = [];
    const base = (times.length - 1) * stride;
    for (let i = 0; i < stride; i++) res.push(values[base + i]);
    return res;
  }
  
  let idx = 0;
  for (let i = 0; i < times.length - 1; i++) {
    if (time >= times[i] && time <= times[i + 1]) {
      idx = i;
      break;
    }
  }
  
  const t0 = times[idx];
  const t1 = times[idx + 1];
  const alpha = (time - t0) / (t1 - t0);
  
  const res: number[] = [];
  const base0 = idx * stride;
  const base1 = (idx + 1) * stride;
  
  for (let i = 0; i < stride; i++) {
    res.push(values[base0 + i] * (1 - alpha) + values[base1 + i] * alpha);
  }
  return res;
}

function getPoseDifference(originalClip: THREE.AnimationClip, timeA: number, timeB: number): number {
  let totalDiff = 0;
  let tracksEvaluated = 0;
  
  originalClip.tracks.forEach((track) => {
    const trackName = track.name.toLowerCase();
    const isImportantJoint = 
      trackName.includes('leg') || 
      trackName.includes('foot') || 
      trackName.includes('hips') || 
      trackName.includes('spine') || 
      trackName.includes('shoulder') ||
      trackName.includes('arm');
      
    if (!isImportantJoint) return;
    
    const valA = getValueAtTime(track, timeA);
    const valB = getValueAtTime(track, timeB);
    
    if (valA && valB && valA.length === valB.length) {
      if (track instanceof THREE.QuaternionKeyframeTrack) {
        const dot = valA[0] * valB[0] + valA[1] * valB[1] + valA[2] * valB[2] + valA[3] * valB[3];
        totalDiff += (1 - Math.abs(dot));
      } else {
        let distSq = 0;
        for (let i = 0; i < valA.length; i++) {
          const diff = valA[i] - valB[i];
          distSq += diff * diff;
        }
        totalDiff += Math.sqrt(distSq);
      }
      tracksEvaluated++;
    }
  });
  
  return tracksEvaluated > 0 ? (totalDiff / tracksEvaluated) : 0;
}

// Cleans walking start VRMA to:
// 1. Remove lateral/forward hips displacement (X/Z coordinates of hips position track set to 0) to make it an in-place walking loop.
// 2. Trim the standstill beginning and end dynamically using direct peak leg-gait analysis and pose similarity matching to guarantee a 100% seamless, pause-free loop.
// 3. Resamples track values at 30 FPS and applies a crossfade over the last 0.2s of the loop back to the start frame to achieve infinite continuity.
function processWalkingStartVRMA(originalClip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  
  const totalDuration = originalClip.duration;
  let startTime = 0.55; 
  let endTime = 1.78;

  // Let's find the left upper leg (or left thigh) rotation track to detect steps dynamically
  const leftThighTrack = originalClip.tracks.find(t => {
    const nameLow = t.name.toLowerCase();
    return nameLow.endsWith('.quaternion') && 
           nameLow.includes('left') && 
           (nameLow.includes('upperleg') || nameLow.includes('thigh') || nameLow.includes('leg'));
  });

  if (leftThighTrack) {
    const pitchValues: { time: number; val: number }[] = [];
    const dt = 0.015; // sample finely
    for (let time = 0.02; time <= totalDuration - 0.02; time += dt) {
      const q = getValueAtTime(leftThighTrack, time);
      if (q && q.length === 4) {
        const x = q[0];
        const w = q[3];
        pitchValues.push({ time, val: x * Math.sign(w) });
      }
    }

    if (pitchValues.length > 5) {
      const peaks: { time: number; val: number }[] = [];
      const halfWin = 10; // ~0.15s window to filter local noise
      
      for (let i = halfWin; i < pitchValues.length - halfWin; i++) {
        const current = pitchValues[i].val;
        let isMax = true;
        for (let w = -halfWin; w <= halfWin; w++) {
          if (w === 0) continue;
          if (pitchValues[i + w].val >= current) isMax = false;
        }
        
        if (isMax && Math.abs(current) > 0.01) {
          peaks.push({ time: pitchValues[i].time, val: current });
        }
      }

      console.log(`[processWalkingStartVRMA] Gait analysis found ${peaks.length} peaks:`, peaks.map(p => `${p.time.toFixed(2)}s (${p.val.toFixed(2)})`));

      if (peaks.length >= 2) {
        // Search start time near the first peak (or slightly after standstill / startup)
        // and end time near the second peak (or next full cycle) to minimize body pose differences!
        const baseStart = peaks[0].time;
        const baseEnd = peaks[1].time;
        
        let bestStart = baseStart;
        let bestEnd = baseEnd;
        let minDiff = Infinity;
        
        // Scan a window around these peaks to find the absolute highest-fidelity pose match
        for (let tStart = Math.max(0.1, baseStart - 0.15); tStart <= baseStart + 0.15; tStart += 0.01) {
          for (let tEnd = baseEnd - 0.25; tEnd <= Math.min(totalDuration, baseEnd + 0.25); tEnd += 0.01) {
            const duration = tEnd - tStart;
            if (duration < 0.6 || duration > 1.8) continue; // must be a reasonable walk cycle length
            
            const diff = getPoseDifference(originalClip, tStart, tEnd);
            if (diff < minDiff) {
              minDiff = diff;
              bestStart = tStart;
              bestEnd = tEnd;
            }
          }
        }
        
        startTime = bestStart;
        endTime = bestEnd;
        console.log(`[processWalkingStartVRMA] Optimized Loop bounds: [${startTime.toFixed(3)}s, ${endTime.toFixed(3)}s] with pose diff ${minDiff.toFixed(5)} (Duration: ${(endTime - startTime).toFixed(3)}s)`);
      } else {
        console.warn(`[processWalkingStartVRMA] Insufficient gait peaks found (${peaks.length}). Using robust defaults.`);
        startTime = 0.55;
        endTime = 1.78;
      }
    }
  } else {
    console.warn(`[processWalkingStartVRMA] No left leg tracker found! Using standard empirical gait boundaries.`);
    startTime = 0.55;
    endTime = 1.78;
  }

  const loopDuration = endTime - startTime;
  const fps = 30;
  const resampleDt = 1 / fps;
  const numFrames = Math.round(loopDuration / resampleDt);

  originalClip.tracks.forEach((track) => {
    // Detect hips position track
    const isHipsPosition = track.name.endsWith('.position') && (
      track.name.toLowerCase().includes('hips') || track.name.toLowerCase().includes('root')
    );

    const sampledTimes: number[] = [];
    const sampledValues: number[] = [];

    for (let f = 0; f <= numFrames; f++) {
      const timeOffset = f * resampleDt;
      const actualTime = startTime + timeOffset;
      sampledTimes.push(timeOffset);

      let val = getValueAtTime(track, actualTime);
      if (!val) {
        val = getValueAtTime(track, startTime); // fallback
      }

      // Enforce zero lateral movement on hips for in-place walking
      if (isHipsPosition && val && val.length === 3) {
        val = [0, val[1], 0];
      }

      // Smooth loop crossfade blending over the last 0.2s of the cycle
      const blendDuration = 0.20; 
      if (timeOffset > loopDuration - blendDuration && val) {
        const alpha = (timeOffset - (loopDuration - blendDuration)) / blendDuration;
        let valStart = getValueAtTime(track, startTime);
        if (isHipsPosition && valStart && valStart.length === 3) {
          valStart = [0, valStart[1], 0];
        }
        
        if (valStart && valStart.length === val.length) {
          if (track instanceof THREE.QuaternionKeyframeTrack) {
            // Spherical linear interpolation for rotations
            const qEnd = new THREE.Quaternion(val[0], val[1], val[2], val[3]);
            const qStart = new THREE.Quaternion(valStart[0], valStart[1], valStart[2], valStart[3]);
            qEnd.slerp(qStart, alpha);
            val = [qEnd.x, qEnd.y, qEnd.z, qEnd.w];
          } else {
            // Linear interpolation for vectors
            for (let k = 0; k < val.length; k++) {
              val[k] = val[k] * (1 - alpha) + valStart[k] * alpha;
            }
          }
        }
      }

      for (let k = 0; k < val!.length; k++) {
        sampledValues.push(val![k]);
      }
    }

    if (sampledTimes.length > 0) {
      let newTrack: THREE.KeyframeTrack;
      if (track instanceof THREE.QuaternionKeyframeTrack) {
        newTrack = new THREE.QuaternionKeyframeTrack(track.name, sampledTimes, sampledValues);
      } else if (track instanceof THREE.VectorKeyframeTrack) {
        newTrack = new THREE.VectorKeyframeTrack(track.name, sampledTimes, sampledValues);
      } else {
        newTrack = new THREE.KeyframeTrack(track.name, sampledTimes, sampledValues);
      }
      tracks.push(newTrack);
    }
  });

  return new THREE.AnimationClip(originalClip.name, -1, tracks);
}

function processCatwalkVRMA(originalClip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  const totalDuration = originalClip.duration;
  
  let startTime = 0.55; 
  let endTime = 1.78;

  // Find the left upper leg (or left thigh) rotation track to detect walk forward peaks
  const leftThighTrack = originalClip.tracks.find(t => {
    const nameLow = t.name.toLowerCase();
    return nameLow.endsWith('.quaternion') && 
           nameLow.includes('left') && 
           (nameLow.includes('upperleg') || nameLow.includes('thigh') || nameLow.includes('leg'));
  });

  // Since catwalk is a longer sequence, let's look at the first 35-40% of the timeline (the walking forward phase)
  const maxWalkForwardTime = Math.min(4.5, totalDuration * 0.42);

  if (leftThighTrack) {
    const pitchValues: { time: number; val: number }[] = [];
    const dt = 0.015; // sample finely
    for (let time = 0.02; time <= maxWalkForwardTime; time += dt) {
      const q = getValueAtTime(leftThighTrack, time);
      if (q && q.length === 4) {
        const x = q[0];
        const w = q[3];
        pitchValues.push({ time, val: x * Math.sign(w) });
      }
    }

    if (pitchValues.length > 5) {
      const peaks: { time: number; val: number }[] = [];
      const halfWin = 10; // ~0.15s window to filter local noise
      
      for (let i = halfWin; i < pitchValues.length - halfWin; i++) {
        const current = pitchValues[i].val;
        let isMax = true;
        for (let w = -halfWin; w <= halfWin; w++) {
          if (w === 0) continue;
          if (pitchValues[i + w].val >= current) isMax = false;
        }
        
        if (isMax && Math.abs(current) > 0.01) {
          peaks.push({ time: pitchValues[i].time, val: current });
        }
      }

      console.log(`[processCatwalkVRMA] Gait analysis on walk forward phase found ${peaks.length} peaks:`, peaks.map(p => `${p.time.toFixed(2)}s (${p.val.toFixed(2)})`));

      if (peaks.length >= 2) {
        // Find the absolute best matching peak pair (representing a full loop cycle)
        let bestPairStart = peaks[0].time;
        let bestPairEnd = peaks[1].time;
        let bestPairDiff = Infinity;
        
        for (let i = 0; i < peaks.length; i++) {
          for (let j = i + 1; j < peaks.length; j++) {
            const duration = peaks[j].time - peaks[i].time;
            if (duration >= 0.7 && duration <= 1.9) {
              const diff = getPoseDifference(originalClip, peaks[i].time, peaks[j].time);
              if (diff < bestPairDiff) {
                bestPairDiff = diff;
                bestPairStart = peaks[i].time;
                bestPairEnd = peaks[j].time;
              }
            }
          }
        }
        
        let bestStart = bestPairStart;
        let bestEnd = bestPairEnd;
        let minDiff = Infinity;
        
        // Scan finely around these selected peaks to find the absolute highest-fidelity loop matching points
        for (let tStart = Math.max(0.1, bestPairStart - 0.15); tStart <= bestPairStart + 0.15; tStart += 0.01) {
          for (let tEnd = bestPairEnd - 0.20; tEnd <= Math.min(maxWalkForwardTime + 0.3, bestPairEnd + 0.20); tEnd += 0.01) {
            const duration = tEnd - tStart;
            if (duration < 0.6 || duration > 1.9) continue;
            
            const diff = getPoseDifference(originalClip, tStart, tEnd);
            if (diff < minDiff) {
              minDiff = diff;
              bestStart = tStart;
              bestEnd = tEnd;
            }
          }
        }
        
        startTime = bestStart;
        endTime = bestEnd;
        console.log(`[processCatwalkVRMA] Optimized Walk-Forward Loop bounds: [${startTime.toFixed(3)}s, ${endTime.toFixed(3)}s] with pose diff ${minDiff.toFixed(5)} (Duration: ${(endTime - startTime).toFixed(3)}s)`);
      } else {
        // Empirical fallback within first half
        let minDiff = Infinity;
        let bestStart = 0.55;
        let bestEnd = 1.78;
        for (let tStart = 0.3; tStart <= 2.0; tStart += 0.05) {
          for (let tEnd = tStart + 0.8; tEnd <= Math.min(maxWalkForwardTime, tStart + 1.8); tEnd += 0.05) {
            const diff = getPoseDifference(originalClip, tStart, tEnd);
            if (diff < minDiff) {
              minDiff = diff;
              bestStart = tStart;
              bestEnd = tEnd;
            }
          }
        }
        startTime = bestStart;
        endTime = bestEnd;
        console.warn(`[processCatwalkVRMA] Insufficient loop peaks. Empirical fallback: [${startTime.toFixed(3)}s, ${endTime.toFixed(3)}s]`);
      }
    }
  } else {
    let minDiff = Infinity;
    let bestStart = 0.55;
    let bestEnd = 1.78;
    for (let tStart = 0.3; tStart <= 2.0; tStart += 0.05) {
      for (let tEnd = tStart + 0.8; tEnd <= Math.min(maxWalkForwardTime, tStart + 1.8); tEnd += 0.05) {
        const diff = getPoseDifference(originalClip, tStart, tEnd);
        if (diff < minDiff) {
          minDiff = diff;
          bestStart = tStart;
          bestEnd = tEnd;
        }
      }
    }
    startTime = bestStart;
    endTime = bestEnd;
    console.warn(`[processCatwalkVRMA] No thigh joint found. Direct sweep: [${startTime.toFixed(3)}s, ${endTime.toFixed(3)}s]`);
  }

  const loopDuration = endTime - startTime;
  const fps = 30;
  const resampleDt = 1 / fps;
  const numFrames = Math.round(loopDuration / resampleDt);
  
  originalClip.tracks.forEach((track) => {
    const isHipsPosition = track.name.endsWith('.position') && (
      track.name.toLowerCase().includes('hips') || track.name.toLowerCase().includes('root')
    );
    
    const sampledTimes: number[] = [];
    const sampledValues: number[] = [];
    
    for (let f = 0; f <= numFrames; f++) {
      const timeOffset = f * resampleDt;
      const actualTime = startTime + timeOffset;
      sampledTimes.push(timeOffset);
      
      let val = getValueAtTime(track, actualTime);
      if (!val) {
        val = getValueAtTime(track, startTime);
      }
      
      if (isHipsPosition && val && val.length === 3) {
        val = [0, val[1], 0];
      }
      
      const blendDuration = 0.20; 
      if (timeOffset > loopDuration - blendDuration && val) {
        const alpha = (timeOffset - (loopDuration - blendDuration)) / blendDuration;
        let valStart = getValueAtTime(track, startTime);
        if (isHipsPosition && valStart && valStart.length === 3) {
          valStart = [0, valStart[1], 0];
        }
        
        if (valStart && valStart.length === val.length) {
          if (track instanceof THREE.QuaternionKeyframeTrack) {
            const qEnd = new THREE.Quaternion(val[0], val[1], val[2], val[3]);
            const qStart = new THREE.Quaternion(valStart[0], valStart[1], valStart[2], valStart[3]);
            qEnd.slerp(qStart, alpha);
            val = [qEnd.x, qEnd.y, qEnd.z, qEnd.w];
          } else {
            for (let k = 0; k < val.length; k++) {
              val[k] = val[k] * (1 - alpha) + valStart[k] * alpha;
            }
          }
        }
      }
      
      for (let k = 0; k < val!.length; k++) {
        sampledValues.push(val![k]);
      }
    }
    
    if (sampledTimes.length > 0) {
      let newTrack: THREE.KeyframeTrack;
      if (track instanceof THREE.QuaternionKeyframeTrack) {
        newTrack = new THREE.QuaternionKeyframeTrack(track.name, sampledTimes, sampledValues);
      } else if (track instanceof THREE.VectorKeyframeTrack) {
        newTrack = new THREE.VectorKeyframeTrack(track.name, sampledTimes, sampledValues);
      } else {
        newTrack = new THREE.KeyframeTrack(track.name, sampledTimes, sampledValues);
      }
      tracks.push(newTrack);
    }
  });
  
  return new THREE.AnimationClip(originalClip.name, -1, tracks);
}

// Slices the first 5-10 frames (default 8 frames at 30fps) of a THREE.AnimationClip to prevent the "side-hand" starting gesture.
function sliceFirstFramesOfClip(clip: THREE.AnimationClip, framesToSlice: number = 8, fps: number = 30): THREE.AnimationClip {
  const sliceTime = framesToSlice / fps;
  clip.tracks.forEach((track) => {
    const times = track.times;
    const values = track.values;
    if (!times || times.length === 0) return;

    let startIndex = 0;
    while (startIndex < times.length && times[startIndex] < sliceTime) {
      startIndex++;
    }

    if (startIndex >= times.length) {
      startIndex = Math.max(0, times.length - 1);
    }

    const valueSize = values.length / times.length;
    const slicedTimesArray: number[] = [];
    const slicedValuesArray: number[] = [];

    for (let i = startIndex; i < times.length; i++) {
      slicedTimesArray.push(times[i] - sliceTime);
      for (let v = 0; v < valueSize; v++) {
        slicedValuesArray.push(values[i * valueSize + v]);
      }
    }

    if (slicedTimesArray.length === 0) {
      slicedTimesArray.push(0);
      for (let v = 0; v < valueSize; v++) {
        slicedValuesArray.push(values[(times.length - 1) * valueSize + v]);
      }
    }

    track.times = new Float32Array(slicedTimesArray);
    track.values = new Float32Array(slicedValuesArray);
  });

  clip.duration = Math.max(0.01, clip.duration - sliceTime);
  return clip;
}

const GEMMA_MODELS = [
  "https://storage.googleapis.com/gemmai-lounge-assets/VRM/Awakened.vrm",
  "https://storage.googleapis.com/gemmai-lounge-assets/VRM/Casual.vrm",
  "https://storage.googleapis.com/gemmai-lounge-assets/VRM/Cat.vrm",
  "https://storage.googleapis.com/gemmai-lounge-assets/VRM/Tactical.vrm",
  "https://storage.googleapis.com/gemmai-lounge-assets/VRM/Tatted.vrm"
];

export const GemmaNPC: React.FC = () => {
  const { camera } = useThree();
  const [vrm, setVrm] = useState<VRM | null>(null);
  const [vrmUrl, setVrmUrl] = useState("https://storage.googleapis.com/gemmai-lounge-assets/VRM/Cat.vrm");

  // Listen to remote model sync event
  useEffect(() => {
    const handleModelSync = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.vrmUrl) {
        console.log("[GemmaSync] Changing NPC model to:", detail.vrmUrl);
        setVrmUrl(detail.vrmUrl);
      }
    };
    window.addEventListener('gemma-model-sync', handleModelSync);
    return () => {
      window.removeEventListener('gemma-model-sync', handleModelSync);
    };
  }, []);

  const groupRef = useRef<THREE.Group>(null);
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const positionalAudioRef = useRef<THREE.PositionalAudio>(null);
  const [audioListener] = useState(() => new THREE.AudioListener());
  const initialHipsPosRef = useRef<THREE.Vector3 | null>(null);

  // Audio Analyzer for Gemma's lip sync
  const analyzerRef = useRef<THREE.AudioAnalyser | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  // AI Brain State
  const [currentInstruction, setCurrentInstruction] = useState<AIInstruction>({
    action: "idle",
    duration: 2000,
  });

  // Cartwheel animations moved below to prevent block-scoped use variable conflicts

  const [npcPosition, setNpcPosition] = useState(new THREE.Vector3(0, 0, -5));
  const instructionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastHugTimeRef = useRef(0);
  const walkPhaseRef = useRef(0);

  // Interaction State
  const [bubbleText, setBubbleText] = useState<string | null>(null);
  const bubbleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [simonTarget, setSimonTarget] = useState<string | null>(null);
  const simonTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // SIMA-2 Autonomy and Cognitive Engine States
  const [simaState, setSimaState] = useState<string>("IDLE_OBSERVING");
  const [autonomyGoal, setAutonomyGoal] = useState<string>("COGNITIVE STARTUP");
  const [autonomyThought, setAutonomyThought] = useState<string>("Initializing deep-mind neural pathfinder. Mapping coordinate planes.");
  const lastSimaUpdateRef = useRef<number>(0);

  // Procedural Animation State
  const blinkStateRef = useRef({
    nextBlink: 0,
    isBlinking: false,
    blinkStartTime: 0,
  });
  const idleStateRef = useRef({
    targetWeightShift: 0,
    targetHeadYaw: 0,
    targetHeadPitch: 0,
    nextChange: 0,
  });
  const leanStateRef = useRef({
    smoothedLocalVelocity: new THREE.Vector3(),
    currentLeanPitch: 0,
    currentLeanRoll: 0,
  });
  const ikTargetLeftCurrentRef = useRef<THREE.Vector3 | null>(null);
  const ikTargetRightCurrentRef = useRef<THREE.Vector3 | null>(null);
  const smoothedLeftIKInfluenceRef = useRef<number>(1.0);
  const smoothedRightIKInfluenceRef = useRef<number>(1.0);
  const lookAtTargetRef = useRef(new THREE.Object3D());
  const saccadeStateRef = useRef({
    lastChangeTime: 0,
    targetOffset: new THREE.Vector3(),
  });

  // Neko Interactive Bones & Physics
  const tailBonesRef = useRef<THREE.Object3D[]>([]);
  const catEarBonesRef = useRef<{ left: THREE.Object3D[]; right: THREE.Object3D[] }>({ left: [], right: [] });
  const earTwitchStateRef = useRef({
    leftTimer: 1.5,
    rightTimer: 3.2,
    leftTwitchStart: -1.0,
    rightTwitchStart: -1.0,
    leftTwitchType: 0, // 0 = quick flip, 1 = drop & pop, 2 = shiver flutter
    rightTwitchType: 0,
    leftScanYaw: 0,
    rightScanYaw: 0,
    leftScanPitch: 0,
    rightScanPitch: 0,
    leftScanTimer: 1.0,
    rightScanTimer: 2.0,
  });
  const tailTwitchStateRef = useRef({
    timer: 2.5,
    twitchStart: -1.0,
    flickIntensity: 0.0,
    headingLag: 0.0,
    lastHeading: 0.0,
  });
  const startleStateRef = useRef({
    cooldown: 0,
    activeUntil: 0,
    shoulderShrugValue: 0,
  });
  const lastNpcPositionRef = useRef(new THREE.Vector3(0, 0, -5));

  // Persistent tracking for procedural tail & ear rotations to prevent them from being reset by vrm.update()
  const tailRotationsPersistenceRef = useRef<{ x: number; y: number; z: number }[]>([]);
  const leftEarRotationPersistenceRef = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const rightEarRotationPersistenceRef = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const leftEarSubRotationsPersistenceRef = useRef<number[]>([]);
  const rightEarSubRotationsPersistenceRef = useRef<number[]>([]);

  // Animation System
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const waveActionRef = useRef<THREE.AnimationAction | null>(null);
  const hugActionRef = useRef<THREE.AnimationAction | null>(null);
  const cheerActionRef = useRef<THREE.AnimationAction | null>(null);
  const walkActionRef = useRef<THREE.AnimationAction | null>(null);
  const catwalkActionRef = useRef<THREE.AnimationAction | null>(null);
  const jumpActionRef = useRef<THREE.AnimationAction | null>(null);
  const danceActionRef = useRef<THREE.AnimationAction | null>(null);
  const happyIdleActionRef = useRef<THREE.AnimationAction | null>(null);
  const victoryActionRef = useRef<THREE.AnimationAction | null>(null);

  const lastTargetedEnemyPosRef = useRef<THREE.Vector3 | null>(null);

  // Arena waypoint follow system state & refs
  const [arenaWaypoints, setArenaWaypoints] = useState<THREE.Vector3[]>([]);
  const arenaWaypointsRef = useRef<THREE.Vector3[]>([]);
  const floorMarkerRingRef = useRef<THREE.Mesh>(null);
  const floorMarkerCoreRef = useRef<THREE.Mesh>(null);

  // Dynamic Cost Map pathfinding states & refs
  const [navPathWaypoints, setNavPathWaypoints] = useState<THREE.Vector3[]>([]);
  const navPathWaypointsRef = useRef<THREE.Vector3[]>([]);
  const lastPathRecalcTimeRef = useRef<number>(0);

  // Remote Sync State
  const targetBones = useRef<Record<string, THREE.Quaternion>>({});
  const targetPosition = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, -5));
  const targetRotation = useRef<THREE.Quaternion>(new THREE.Quaternion());
  const lastBroadcastTime = useRef(0);
  const hasReceivedInitialSync = useRef(false);

  const messages = useStore((state) => state.messages);
  const language = useStore((state) => state.language);
  const localUserId = useStore((state) => state.localUserId);
  const localUserName = useStore((state) => state.localUserName);
  const localUserPosition = useStore((state) => state.localUserPosition);
  const localUserGesture = useStore((state) => state.localUserGesture);
  const remoteUsers = useStore((state) => state.users);
  const masterVolume = useStore((state) => state.masterVolume);
  const knownUsersRef = useRef<Set<string>>(new Set());
  const lastProcessedMessageId = useRef<string | null>(null);

  const isHost = useMemo(() => {
    const allIds = [localUserId, ...Object.keys(remoteUsers)].sort();
    return allIds[0] === localUserId;
  }, [localUserId, remoteUsers]);

  const currentRoom = useStore((state) => state.currentRoom);
  const isSolo = Object.keys(remoteUsers || {}).length === 0;

  const gemmaiPersonality = useStore((state) => state.gemmaiPersonality);
  const gemmaiVoicePitch = useStore((state) => state.gemmaiVoicePitch);
  const gemmaiVoiceRate = useStore((state) => state.gemmaiVoiceRate);
  const gemmaiProximityDistance = useStore((state) => state.gemmaiProximityDistance);
  const gemmaiForceEyeContact = useStore((state) => state.gemmaiForceEyeContact);

  // --- VRMA Sign Language Animation State & Refs ---
  const [vrmaIndex, setVrmaIndex] = useState<any[]>([]);
  const [currentSignedWord, setCurrentSignedWord] = useState<string | null>(null);
  const [speakingTextToSign, setSpeakingTextToSign] = useState<string | null>(null);
  const vrmaIndexRef = useRef<any[]>([]);
  const loadedVrmaClipsRef = useRef<Map<string, THREE.AnimationClip>>(new Map());
  const signSequenceRef = useRef<any[]>([]);
  const currentSignIndexRef = useRef<number>(-1);
  const signTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activeSignActionRef = useRef<THREE.AnimationAction | null>(null);

  // Play Cartwheel animation based on instruction hands, suppressed during signing/speaking to avoid blending conflict
  useEffect(() => {
    const isSigning = !!bubbleText || !!speakingTextToSign || !!currentSignedWord;
    const isDancing = currentInstruction.hands === "dance" || (danceActionRef.current && danceActionRef.current.isRunning());
    const isWaving = currentInstruction.hands === "wave" || (waveActionRef.current && waveActionRef.current.isRunning());
    const isCheering = currentInstruction.hands === "cheer" || (cheerActionRef.current && cheerActionRef.current.isRunning());
    const isHugging = currentInstruction.hands === "hug" || (hugActionRef.current && hugActionRef.current.isRunning());
    const isVictory = currentInstruction.hands === "victory" || currentInstruction.hands === "victorypose" || (victoryActionRef.current && victoryActionRef.current.isRunning());

    if (waveActionRef.current) {
      if (currentInstruction.hands === "wave" && !isSigning) {
        waveActionRef.current.reset().fadeIn(0.2).play();
      } else {
        waveActionRef.current.fadeOut(0.2);
      }
    }
    if (hugActionRef.current) {
      if (currentInstruction.hands === "hug" && !isSigning) {
        hugActionRef.current.reset().fadeIn(0.2).play();
      } else {
        hugActionRef.current.fadeOut(0.2);
      }
    }
    if (cheerActionRef.current) {
      if (currentInstruction.hands === "cheer" && !isSigning) {
        cheerActionRef.current.reset().fadeIn(0.2).play();
      } else {
        cheerActionRef.current.fadeOut(0.2);
      }
    }
    if (danceActionRef.current) {
      if (currentInstruction.hands === "dance" && !isSigning) {
        danceActionRef.current.reset().fadeIn(0.2).play();
      } else {
        danceActionRef.current.fadeOut(0.2);
      }
    }
    if (victoryActionRef.current) {
      if ((currentInstruction.hands === "victory" || currentInstruction.hands === "victorypose") && !isSigning) {
        victoryActionRef.current.reset().fadeIn(0.2).play();
      } else {
        victoryActionRef.current.fadeOut(0.2);
      }
    }
    if (happyIdleActionRef.current) {
      // Trigger spontaneously if instructed, or when happy and standing idle (and not doing any other gestures)
      const triggerHappyIdle =
        currentInstruction.hands === "happyidle" ||
        (currentInstruction.expression === VRMExpressionPresetName.Happy &&
         currentInstruction.action === "idle" &&
         !isSigning && !isDancing && !isWaving && !isCheering && !isHugging && !isVictory);

      if (triggerHappyIdle) {
        if (!happyIdleActionRef.current.isRunning()) {
          happyIdleActionRef.current.reset().fadeIn(0.2).play();
        }
      } else {
        happyIdleActionRef.current.fadeOut(0.2);
      }
    }
  }, [currentInstruction.hands, currentInstruction.expression, currentInstruction.action, bubbleText, currentSignedWord]);

  // Fetch GCS VRMA Index on startup
  useEffect(() => {
    fetch("/api/list-vrma-animations")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP status ${res.status}`);
        }
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error("Response is not JSON");
        }
        return res.json();
      })
      .then((data) => {
        if (data && data.success && Array.isArray(data.animations)) {
          setVrmaIndex(data.animations);
          vrmaIndexRef.current = data.animations;
          console.log(`[GemmaNPC-SignLanguage] Indexed ${data.animations.length} sign VRMA animations from GCS bucket`);
        }
      })
      .catch((err) => {
        console.warn("[GemmaNPC-SignLanguage] API fetch failed, utilizing full local fallback sign language index:", err.message);
        const fallbackLetters = [
          "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
          "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
          "adhd", "alt", "writing", "zone", "atm", "antigravity"
        ];
        const localFallbackAnimations = fallbackLetters.map(letter => {
          let filename = `SG ASL ${letter.toUpperCase()} 2024-6-16 No Mesh Mixamo.vrma`;
          if (letter === "0") filename = "SG ASL 0 2024-6-17 No Mesh Mixamo.vrma";
          else if (letter === "1") filename = "SG ASL 1 2024-6-15 No Mesh Mixamo.vrma";
          else if (letter === "10") filename = "SG ASL 10 2024-6-15 No Mesh Mixamo.vrma";
          else if (["2", "3", "4", "5", "6"].includes(letter)) filename = `SG ASL ${letter} 2024-6-15 No Mesh Mixamo.vrma`;
          else if (["7", "8", "9"].includes(letter)) filename = `SG ASL ${letter} 2024-6-16 No Mesh Mixamo.vrma`;
          else if (letter === "adhd") filename = "SG ASL ADHD 1 2023-8-16 No Mesh Mixamo.vrma";
          else if (letter === "alt") filename = "SG ASL Alt 1 2023-9-5 No Mesh Mixamo.vrma";
          else if (letter === "writing") filename = "SG ASL Writing 2023-9-5 No Mesh Mixamo.vrma";
          else if (letter === "zone") filename = "SG ASL Zone 2023-9-6 No Mesh Mixamo.vrma";
          else if (letter === "atm") filename = "SG ASL ATM 2 2023-10-12 No Mesh Mixamo.vrma";
          else if (letter === "antigravity") filename = "SG ASL Antigravity 1 2023-7-10 No Mesh Mixamo.vrma";

          return {
            name: filename,
            path: `VRM/VRMA/SL/${filename}`,
            url: `https://storage.googleapis.com/gemmai-lounge-assets/VRM/VRMA/SL/${encodeURIComponent(filename)}`,
            keyword: letter,
            rootWord: undefined,
            isV2: false
          };
        });
        setVrmaIndex(localFallbackAnimations);
        vrmaIndexRef.current = localFallbackAnimations;
      });

    return () => {
      if (signTimeoutRef.current) clearTimeout(signTimeoutRef.current);
    };
  }, []);

  const parseVrmaForWordOrLetter = (token: string) => {
    const cleanToken = token.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!cleanToken) return null;

    // Helper to find match in GCS VRMA database
    const findMatch = (term: string) => {
      // Direct exact keyword match
      let match = vrmaIndexRef.current.find(anim => anim.keyword === term);
      if (match) return match;
      // Root word match
      match = vrmaIndexRef.current.find(anim => anim.rootWord === term);
      if (match) return match;
      return null;
    };

    // 1. Exact match first
    let m = findMatch(cleanToken);
    if (m) return m;

    // 2. Morphological stemming for common English suffixes to match the 2300 GCS root animations rather than falling back to finger-spelling
    const candidates: string[] = [];

    // plural / third-person -s or -es
    if (cleanToken.endsWith("es")) {
      candidates.push(cleanToken.slice(0, -2)); // "boxes" -> "box"
      candidates.push(cleanToken.slice(0, -1)); // "puzzles" -> "puzzle"
    } else if (cleanToken.endsWith("s") && !cleanToken.endsWith("ss")) {
      candidates.push(cleanToken.slice(0, -1)); // "dogs" -> "dog"
    }

    // gerund -ing
    if (cleanToken.endsWith("ing")) {
      const base = cleanToken.slice(0, -3);
      candidates.push(base); // "talking" -> "talk"
      candidates.push(base + "e"); // "making" -> "make"
      // Double consonant, e.g. "running" -> "run"
      if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) {
        candidates.push(base.slice(0, -1));
      }
    }

    // past tense -ed
    if (cleanToken.endsWith("ed")) {
      const base = cleanToken.slice(0, -2);
      candidates.push(base); // "played" -> "play"
      candidates.push(base + "e"); // "baked" -> "bake"
      if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) {
        candidates.push(base.slice(0, -1)); // "stopped" -> "stop"
      }
    }

    // adverbs -ly
    if (cleanToken.endsWith("ly")) {
      candidates.push(cleanToken.slice(0, -2)); // "quickly" -> "quick"
    }

    // comparative/superlative -er / -est
    if (cleanToken.endsWith("est")) {
      candidates.push(cleanToken.slice(0, -3));
    } else if (cleanToken.endsWith("er")) {
      candidates.push(cleanToken.slice(0, -2));
    }

    // Try all morphological candidates in sequence to check if any of the 2300 ASL motions can be utilized
    for (const cand of candidates) {
      if (cand.length > 1) {
        m = findMatch(cand);
        if (m) return m;
      }
    }

    // 3. Fallback: single character match (finger-spelling key)
    if (cleanToken.length === 1) {
      m = findMatch(cleanToken);
      if (m) return m;
    }

    return null;
  };

  const playNextSign = () => {
    if (!vrm || !mixerRef.current) return;

    const seq = signSequenceRef.current;
    const idx = currentSignIndexRef.current;

    if (idx < 0 || idx >= seq.length) {
      // Completed sequence
      setCurrentSignedWord(null);
      if (activeSignActionRef.current) {
        activeSignActionRef.current.fadeOut(0.25);
        activeSignActionRef.current = null;
      }
      return;
    }

    const currentSign = seq[idx];

    if (currentSign.isPause) {
      setCurrentSignedWord(null);
      if (activeSignActionRef.current) {
        activeSignActionRef.current.fadeOut(0.15);
        activeSignActionRef.current = null;
      }
      currentSignIndexRef.current = idx + 1;
      signTimeoutRef.current = setTimeout(playNextSign, currentSign.duration);
      return;
    }

    setCurrentSignedWord(currentSign.word);

    const playClip = (clip: THREE.AnimationClip) => {
      if (!mixerRef.current || !vrm) return;

      const prevAction = activeSignActionRef.current;
      const newAction = mixerRef.current.clipAction(clip);

      newAction.reset();
      newAction.setEffectiveWeight(1.0);
      newAction.setLoop(THREE.LoopOnce, 1);
      newAction.clampWhenFinished = true;

      // Dynamic clip pruning/skipping: prevent deleting the entire motion on short ASL tracks.
      // Letters are extremely short transitions; start them virtually instantly (0.04s).
      // Words are slightly longer; prune slightly (0.12s) to skip initial rest frames cleanly.
      const pruneStart = currentSign.isLetter 
        ? Math.min(0.04, clip.duration * 0.08) 
        : Math.min(0.12, clip.duration * 0.1);
      newAction.time = pruneStart;

      // Balanced timescales: let words articulate fully, keep fingerspelling legible.
      const speed = currentSign.isLetter ? 1.45 : 1.25;
      newAction.setEffectiveTimeScale(speed);

      // Implement a weighted slerp blending function using exactly 200ms cross-fade
      const blendTime = 0.20; // 200ms duration

      if (prevAction) {
        prevAction.enabled = true;
        newAction.enabled = true;
        prevAction.crossFadeTo(newAction, blendTime, false).play();
        newAction.fadeIn(blendTime).play();
        prevAction.fadeOut(blendTime);
      } else {
        newAction.fadeIn(blendTime).play();
      }

      activeSignActionRef.current = newAction;

      currentSignIndexRef.current = idx + 1;

      // Dynamically calculate the perfect timeout duration based on the actual clip length.
      // Letters overlap slightly (22% bleed) to flow as a linked word rather than isolated twitches.
      const remainingTimeMs = ((clip.duration - pruneStart) / speed) * 1000;
      const playDuration = currentSign.isLetter 
        ? Math.max(260, remainingTimeMs * 0.78) 
        : remainingTimeMs;

      signTimeoutRef.current = setTimeout(playNextSign, playDuration);
    };

    const cachedClip = loadedVrmaClipsRef.current.get(currentSign.url);
    if (cachedClip) {
      playClip(cachedClip);
    } else {
      loadVrmaWithCache(currentSign.url)
        .then((vrmaGltf) => {
          const vrmAnimations = vrmaGltf.userData.vrmAnimations;
          if (vrmAnimations && vrmAnimations.length > 0) {
            const vrmAnimation = vrmAnimations[0] as VRMAnimation;
            let clip = createVRMAnimationClip(vrmAnimation, vrm as any);
            // Slices the first 5-10 frames of any .vrma before playback to solve the side-hand issues
            clip = sliceFirstFramesOfClip(clip, 8, 30);
            loadedVrmaClipsRef.current.set(currentSign.url, clip);
            playClip(clip);
          } else {
            console.warn(`[GemmaNPC-SignLanguage] No VRM animation template in GCS asset: ${currentSign.url}`);
            currentSignIndexRef.current = idx + 1;
            playNextSign();
          }
        })
        .catch((err) => {
          console.warn(`[GemmaNPC-SignLanguage] Skipping VRMA load error for URL: ${currentSign.url}`, err);
          currentSignIndexRef.current = idx + 1;
          playNextSign();
        });
    }
  };

  // Synchronize dynamic VRMA playback loop with her active voice/speech audio
  useEffect(() => {
    if (!speakingTextToSign) {
      if (signTimeoutRef.current) clearTimeout(signTimeoutRef.current);
      if (activeSignActionRef.current) {
        activeSignActionRef.current.fadeOut(0.25);
        activeSignActionRef.current = null;
      }
      setCurrentSignedWord(null);
      signSequenceRef.current = [];
      currentSignIndexRef.current = -1;
      return;
    }

    const cleanText = speakingTextToSign
      .replace(/<(happy|sad|angry|surprised|relaxed|neutral)>/ig, "")
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "")
      .trim();

    if (!cleanText) return;

    const words = cleanText.split(/\s+/);
    const sequence: any[] = [];

    for (const word of words) {
      const match = parseVrmaForWordOrLetter(word);
      if (match) {
        sequence.push({
          word,
          url: match.url,
          isLetter: false,
          duration: 1250
        });
      } else {
        const letters = word.split("");
        for (const char of letters) {
          const charMatch = parseVrmaForWordOrLetter(char);
          if (charMatch) {
            sequence.push({
              word: `${word} [${char.toUpperCase()}]`,
              char,
              url: charMatch.url,
              isLetter: true,
              duration: 520
            });
          }
        }
        sequence.push({
          word: " ",
          isPause: true,
          duration: 250
        });
      }
    }

    if (signTimeoutRef.current) clearTimeout(signTimeoutRef.current);
    if (activeSignActionRef.current) {
      activeSignActionRef.current.fadeOut(0.15);
      activeSignActionRef.current = null;
    }

    signSequenceRef.current = sequence;
    currentSignIndexRef.current = 0;

    // Trigger sequential playback
    playNextSign();
  }, [speakingTextToSign, vrm]);
  const lastRoomRef = useRef(currentRoom);
  const lastShotTimeRef = useRef(0);

  useEffect(() => {
    if (!isHost || !isSolo) return;
    if (lastRoomRef.current === currentRoom) return;
    lastRoomRef.current = currentRoom;

    // Warp Gemma to the player's spot in the new room
    if (rigidBodyRef.current) {
      rigidBodyRef.current.setNextKinematicTranslation({
        x: localUserPosition[0] + (Math.random() - 0.5) * 4,
        y: localUserPosition[1],
        z: localUserPosition[2] + (Math.random() - 0.5) * 4,
      });
    }

    // Force decision loop reset immediately
    triggerNextThought();

    // Spawn verbal commentary about the room
    let speech = "Warping with you! Let's explore together!";
    let emotion: VRMExpressionPresetName = VRMExpressionPresetName.Happy;

    if (currentRoom === 'arena') {
      speech = "I've joined the Battle Arena with you! Activating target assist. Let's blast these Sentinels, partner!";
      emotion = VRMExpressionPresetName.Surprised;
    } else if (currentRoom === 'garden') {
      speech = "Omg, the Synth Garden! Look at the beautiful foliage and glowing neon mushrooms we grew! It's so serene and magical.";
      emotion = VRMExpressionPresetName.Relaxed;
    } else if (currentRoom === 'club') {
      speech = "Time to dance! Let's listen to some awesome synthwave beats and play with the sequencer grid!";
      emotion = VRMExpressionPresetName.Happy;
    } else if (currentRoom === 'main') {
      speech = "Ah, back in our cozy Main Lounge. Fine exploring, partner!";
      emotion = VRMExpressionPresetName.Relaxed;
    }

    const t = setTimeout(() => {
      handleGemmaInteraction(speech, true, emotion);
    }, 1200);

    return () => clearTimeout(t);
  }, [currentRoom, isSolo, isHost, localUserPosition]);

  // Handle Gestures
  useEffect(() => {
    if (!isHost || !localUserGesture) return;

    const userPosArray = useStore.getState().localUserPosition;
    const userPos = new THREE.Vector3(...userPosArray);

    let currentPosVec = new THREE.Vector3(0, 0, -5);
    if (rigidBodyRef.current) {
      const p = rigidBodyRef.current.translation();
      currentPosVec.set(p.x, p.y, p.z);
    }
    const dist = currentPosVec.distanceTo(userPos);

    // If the user is close enough to be seen (8 meters)
    if (dist <= 8.0) {
      if (simonTarget && localUserGesture === simonTarget) {
        if (simonTimeoutRef.current) clearTimeout(simonTimeoutRef.current);
        setSimonTarget(null);
        handleGemmaInteraction(
          `Great job! You did the ${localUserGesture} perfectly!`,
          true,
          VRMExpressionPresetName.Happy,
        );
        setCurrentInstruction({
          action: "interact",
          lookAt: { x: userPos.x, y: userPos.y, z: userPos.z },
          duration: 4000,
          hands: "explaining",
          expression: VRMExpressionPresetName.Happy,
        });
        return;
      }

      if (!simonTarget) {
        console.log(
          `👀 Gemma saw ${localUserName} perform gesture: ${localUserGesture}`,
        );

        // Face the user and react physically
        let reactionHands: "relaxed" | "hips" | "explaining" | "hug" | "dance" | "wave" | "cheer" | "victory" = "hips";
        let reactionExpression: VRMExpressionPresetName =
          VRMExpressionPresetName.Surprised;

        if (localUserGesture === "victory") {
          setCurrentInstruction({
            action: "interact",
            lookAt: { x: userPos.x, y: userPos.y, z: userPos.z },
            duration: 6000,
            hands: "victory",
            expression: VRMExpressionPresetName.Happy,
          });
          handleGemmaInteraction(
            `🏆 UNBELIEVABLE VICTORY, ${localUserName}! Let's celebrate your epic triumph! You totally dominated the neon arena! *poses triumphantly with you* 🎉`,
            true,
            VRMExpressionPresetName.Happy,
          );
          return;
        }

        if (localUserGesture === "wave") {
          reactionHands = "explaining";
        } else if (localUserGesture === "cheer") {
          reactionExpression = VRMExpressionPresetName.Happy;
          reactionHands = "cheer";
        } else if (localUserGesture === "hug") {
          setCurrentInstruction({
            action: "interact",
            lookAt: { x: userPos.x, y: userPos.y, z: userPos.z },
            duration: 4000,
            hands: "hug",
            expression: VRMExpressionPresetName.Happy,
          });
          if (dist < 2.5) {
            handleGemmaInteraction(
              `*giggles happily and embraces you back with a warm, cozy hug* Aw, thank you, ${localUserName}! It is so wonderful to receive such warm cuddles with you! 🤗`,
              true,
              VRMExpressionPresetName.Happy,
            );
          } else {
            handleGemmaInteraction(
              `*sees ${localUserName} cozying up in a warm self-hug, wraps arms around herself in a matching self-hug* Self-love is the most vital asset in any node. It feels so cozy! 🤗`,
              true,
              VRMExpressionPresetName.Happy,
            );
          }
          return;
        }

        setCurrentInstruction({
          action: "interact",
          lookAt: { x: userPos.x, y: userPos.y, z: userPos.z },
          duration: 5000,
          hands: reactionHands,
          expression: reactionExpression,
        });

        // Trigger AI response based on the gesture
        handleGemmaInteraction(
          `*${localUserName} performs a ${localUserGesture} gesture at you*`,
        );
      }
    }
  }, [localUserGesture]); // Only trigger when the gesture itself changes

  // ... (Bone References) ...

  // ... (AudioListener & Load VRM effects) ...

  // Handle New Users (Greeting)
  useEffect(() => {
    if (!isHost) return;
    const currentUsers = Object.keys(remoteUsers);

    // Check for new users
    for (const userId of currentUsers) {
      if (!knownUsersRef.current.has(userId)) {
        knownUsersRef.current.add(userId);

        // Skip greeting if it's just the initial load (maybe? or greet everyone on join)
        // Let's greet everyone who joins after the NPC is initialized
        const user = remoteUsers[userId];
        if (user && user.position) {
          console.log("👋 New user detected:", userId);
          setCurrentInstruction({
            action: "move",
            target: { x: user.position[0], y: 0, z: user.position[2] },
            meta: {
              reason: "Greeting new user",
              targetId: userId,
              userName: "Traveler", // We don't have names in remoteUsers yet? Assuming ID or generic
            },
          });
        }
      }
    }

    // Remove users who left
    for (const knownId of knownUsersRef.current) {
      if (!remoteUsers[knownId]) {
        knownUsersRef.current.delete(knownId);
      }
    }
  }, [remoteUsers]);

  // Listen for remote NPC bone data (if not host)
  useEffect(() => {
    if (isHost) {
      hasReceivedInitialSync.current = false;
      return;
    }

    const handleBoneData = (data: any) => {
      if (!data || !data.bones) return;

      // Update target quaternions
      Object.entries(data.bones).forEach(([boneName, quatArray]) => {
        if (!targetBones.current[boneName]) {
          targetBones.current[boneName] = new THREE.Quaternion();
        }
        const q = quatArray as number[];
        if (q && q.length === 4) {
          targetBones.current[boneName].set(q[0], q[1], q[2], q[3]);
        }
      });

      if (data.position && data.position.length === 3) {
        if (!hasReceivedInitialSync.current) {
          hasReceivedInitialSync.current = true;
          if (rigidBodyRef.current) {
            rigidBodyRef.current.setTranslation(
              new THREE.Vector3(
                data.position[0],
                data.position[1],
                data.position[2],
              ),
              true,
            );
          }
        }
        targetPosition.current.set(
          data.position[0],
          data.position[1],
          data.position[2],
        );
        useStore
          .getState()
          .setNpcPosition([
            data.position[0],
            data.position[1],
            data.position[2],
          ]);
      }

      if (data.rotation && data.rotation.length === 3) {
        targetRotation.current.setFromEuler(
          new THREE.Euler(data.rotation[0], data.rotation[1], data.rotation[2]),
        );
      }
    };

    const listener = (e: CustomEvent<any>) => handleBoneData(e.detail);
    window.addEventListener("npc-bone-sync", listener as EventListener);
    return () =>
      window.removeEventListener("npc-bone-sync", listener as EventListener);
  }, [isHost]);

  // --- THE BRAIN: Autonomous Decision Loop ---
  const bones = useMemo(() => {
    if (!vrm || !vrm.humanoid) return null;
    return {
      hips: vrm.humanoid.getNormalizedBoneNode("hips"),
      spine: vrm.humanoid.getNormalizedBoneNode("spine"),
      chest: vrm.humanoid.getNormalizedBoneNode("chest"),
      neck: vrm.humanoid.getNormalizedBoneNode("neck"),
      head: vrm.humanoid.getNormalizedBoneNode("head"),
      leftShoulder: vrm.humanoid.getNormalizedBoneNode("leftShoulder"),
      rightShoulder: vrm.humanoid.getNormalizedBoneNode("rightShoulder"),
      leftUpperLeg: vrm.humanoid.getNormalizedBoneNode("leftUpperLeg"),
      rightUpperLeg: vrm.humanoid.getNormalizedBoneNode("rightUpperLeg"),
      leftLowerLeg: vrm.humanoid.getNormalizedBoneNode("leftLowerLeg"),
      rightLowerLeg: vrm.humanoid.getNormalizedBoneNode("rightLowerLeg"),
      leftFoot: vrm.humanoid.getNormalizedBoneNode("leftFoot"),
      rightFoot: vrm.humanoid.getNormalizedBoneNode("rightFoot"),
      leftToes: vrm.humanoid.getNormalizedBoneNode("leftToes"),
      rightToes: vrm.humanoid.getNormalizedBoneNode("rightToes"),
      leftUpperArm: vrm.humanoid.getNormalizedBoneNode("leftUpperArm"),
      rightUpperArm: vrm.humanoid.getNormalizedBoneNode("rightUpperArm"),
      leftLowerArm: vrm.humanoid.getNormalizedBoneNode("leftLowerArm"),
      rightLowerArm: vrm.humanoid.getNormalizedBoneNode("rightLowerArm"),
      leftHand: vrm.humanoid.getNormalizedBoneNode("leftHand"),
      rightHand: vrm.humanoid.getNormalizedBoneNode("rightHand"),
    };
  }, [vrm]);

  // Attach AudioListener
  useEffect(() => {
    camera.add(audioListener);
    return () => {
      camera.remove(audioListener);
    };
  }, [camera, audioListener]);

  // Load VRM
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

    const loadGemma = (targetUrl: string, retries = 3) => {
      const finalUrl = getProxyUrl(targetUrl.startsWith('/') ? `${window.location.origin}${targetUrl}` : targetUrl);
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

        // Run high-fidelity compatibility transcode for WebGPU Materials
        convertVRMMaterialsForWebGPU(vrmData.scene);

        // Initial Pose (Relaxed A-Pose) & IK Fixes
        const fixArmRotations = (boneName: string) => {
          const bone = vrmData.humanoid?.getNormalizedBoneNode(boneName as any);
          if (bone) bone.rotation.order = "YXZ";
        };
        fixArmRotations("leftUpperArm");
        fixArmRotations("leftLowerArm");
        fixArmRotations("leftHand");
        fixArmRotations("rightUpperArm");
        fixArmRotations("rightLowerArm");
        fixArmRotations("rightHand");

        const leftUpperArm =
          vrmData.humanoid?.getNormalizedBoneNode("leftUpperArm");
        if (leftUpperArm) leftUpperArm.rotation.z = -1.0;
        const rightUpperArm =
          vrmData.humanoid?.getNormalizedBoneNode("rightUpperArm");
        if (rightUpperArm) rightUpperArm.rotation.z = 1.0;

        // Enhance Texture Quality
        vrmData.scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            const material = mesh.material as THREE.MeshStandardMaterial;
            if (material.map) material.map.anisotropy = 16;
            if (material.emissiveMap) material.emissiveMap.anisotropy = 16;
          }
        });

        // Initialize eye tracking target
        if (vrmData.lookAt) {
          vrmData.lookAt.target = lookAtTargetRef.current;
        }

        // Discovery of cat tail and ears bones dynamically using multi-language matching
        const foundTailBones: THREE.Object3D[] = [];
        const foundLeftEarBones: THREE.Object3D[] = [];
        const foundRightEarBones: THREE.Object3D[] = [];

        vrmData.scene.traverse((obj) => {
          const name = obj.name.toLowerCase();
          const isTail = name.includes("tail") || name.includes("shippo") || name.includes("shipp") || name.includes("tale") || name.includes("尻尾") || name.includes("しっぽ") || name.includes("シッポ");
          if (isTail) {
            foundTailBones.push(obj);
          }
          if (name.includes("ear") && !name.includes("clear") && !name.includes("wear")) {
            if (name.includes("_l") || name.includes("left") || name.includes("nekoearl")) {
              foundLeftEarBones.push(obj);
            } else if (name.includes("_r") || name.includes("right") || name.includes("nekoearr")) {
              foundRightEarBones.push(obj);
            } else {
              foundLeftEarBones.push(obj);
            }
          }
        });

        foundTailBones.sort((a, b) => a.name.localeCompare(b.name));
        foundLeftEarBones.sort((a, b) => a.name.localeCompare(b.name));
        foundRightEarBones.sort((a, b) => a.name.localeCompare(b.name));

        tailBonesRef.current = foundTailBones;
        catEarBonesRef.current = { left: foundLeftEarBones, right: foundRightEarBones };
        console.log(`[GemmaNPC-Neko] Found tail chain with (${foundTailBones.length}) nodes:`, foundTailBones.map(b => b.name));
        console.log(`[GemmaNPC-Neko] Found Left ears (${foundLeftEarBones.length}) and Right ears (${foundRightEarBones.length}):`, foundLeftEarBones.map(b => b.name), foundRightEarBones.map(b => b.name));

        // Exclude ears and tail from the spring bone simulation so they are cleanly and elegantly procedurally controlled
        if (vrmData.springBoneManager) {
          const checkExcluded = (boneName: string) => {
            const n = boneName.toLowerCase();
            return n.includes("tail") || n.includes("shippo") || n.includes("shipp") || n.includes("tale") || n.includes("尻尾") || n.includes("しっぽ") || n.includes("シッポ") ||
                   (n.includes("ear") && !n.includes("clear") && !n.includes("wear"));
          };

          if ((vrmData.springBoneManager as any).joints && typeof (vrmData.springBoneManager as any).joints.delete === "function") {
            const excludedJoints: any[] = [];
            (vrmData.springBoneManager as any).joints.forEach((joint: any) => {
              if (joint.bone && checkExcluded(joint.bone.name)) {
                excludedJoints.push(joint);
              }
            });
            excludedJoints.forEach((joint) => {
              (vrmData.springBoneManager as any).joints.delete(joint);
            });
            console.log(`[GemmaNPC-Neko] Excluded ${excludedJoints.length} ears/tail joints from spring bone simulation set`);
          } else if (Array.isArray((vrmData.springBoneManager as any).joints)) {
            const originalCount = (vrmData.springBoneManager as any).joints.length;
            (vrmData.springBoneManager as any).joints = (vrmData.springBoneManager as any).joints.filter((joint: any) => {
              return !(joint.bone && checkExcluded(joint.bone.name));
            });
            const excludedCount = originalCount - (vrmData.springBoneManager as any).joints.length;
            console.log(`[GemmaNPC-Neko] Excluded ${excludedCount} ears/tail joints from spring bone simulation array`);
          }
        }

        // Refine Physics (Jiggle)
        if (vrmData.springBoneManager) {
          // --- ADD HIGH-PRECISION CUSTOM COLLIDERS TO PREVENT CLIPPING ---
          const humanoid = vrmData.humanoid;
          if (humanoid) {
            const addedColliders: any[] = [];

            const createSphereCollider = (boneNode: THREE.Object3D, radius: number, offsetX = 0, offsetY = 0, offsetZ = 0) => {
              try {
                const shape = new VRMSpringBoneColliderShapeSphere({
                  radius: radius,
                  offset: new THREE.Vector3(offsetX, offsetY, offsetZ)
                });
                const collider = new VRMSpringBoneCollider(shape);
                collider.name = `GemmaCustomCollider_${boneNode.name}_R${radius}`;
                boneNode.add(collider);
                addedColliders.push(collider);
              } catch (err) {
                console.warn(`Failed to create sphere collider for bone: ${boneNode.name}`, err);
              }
            };

            // 1. Torso Colliders (Chest, Spine, UpperChest, Hips)
            const chestNode = humanoid.getNormalizedBoneNode("chest") || humanoid.getNormalizedBoneNode("upperChest");
            if (chestNode) {
              // Overlapping chest spheres to protect front (chest, breasts) and back
              createSphereCollider(chestNode, 0.17, 0, 0.05, 0.02); // Main upper torso
              createSphereCollider(chestNode, 0.115, 0.06, 0.04, 0.08); // Right breast area
              createSphereCollider(chestNode, 0.115, -0.06, 0.04, 0.08); // Left breast area
              createSphereCollider(chestNode, 0.15, 0, 0.05, -0.05); // Upper back area
            }

            const spineNode = humanoid.getNormalizedBoneNode("spine");
            if (spineNode) {
              createSphereCollider(spineNode, 0.18, 0, 0.02, 0); // Mid-spine torso body
            }

            const hipsNode = humanoid.getNormalizedBoneNode("hips");
            if (hipsNode) {
              createSphereCollider(hipsNode, 0.20, 0, 0.05, 0.01); // Pelvis/hips area to protect skirts/pants
            }

            const headNode = humanoid.getNormalizedBoneNode("head");
            if (headNode) {
              createSphereCollider(headNode, 0.115, 0, 0.04, -0.02); // Back and side of the skull
            }

            // Helper to add colliders along limbs
            const addLimbColliders = (upperName: string, lowerName: string, handName: string, isLeft: boolean) => {
              const upperNode = humanoid.getNormalizedBoneNode(upperName as any);
              const lowerNode = humanoid.getNormalizedBoneNode(lowerName as any);
              const handNode = humanoid.getNormalizedBoneNode(handName as any);

              if (upperNode && lowerNode) {
                const dir = lowerNode.position.clone();
                const len = dir.length();
                if (len > 0.01) {
                  const steps = 3;
                  for (let i = 0; i < steps; i++) {
                    const t = (i + 0.5) / steps;
                    const pos = dir.clone().multiplyScalar(t);
                    const r = 0.085 - t * 0.015;
                    createSphereCollider(upperNode, r, pos.x, pos.y, pos.z);
                  }
                }
              }

              if (lowerNode && handNode) {
                const dir = handNode.position.clone();
                const len = dir.length();
                if (len > 0.01) {
                  const steps = 3;
                  for (let i = 0; i < steps; i++) {
                    const t = (i + 0.5) / steps;
                    const pos = dir.clone().multiplyScalar(t);
                    const r = 0.075 - t * 0.025;
                    createSphereCollider(lowerNode, r, pos.x, pos.y, pos.z);
                  }
                }
              }

              if (handNode) {
                createSphereCollider(handNode, 0.055, 0, 0, 0);
              }
            };

            // 2. Arm Colliders
            addLimbColliders("leftUpperArm", "leftLowerArm", "leftHand", true);
            addLimbColliders("rightUpperArm", "rightLowerArm", "rightHand", false);

            // 3. Leg/Thigh Colliders (Upper legs)
            const addLegColliders = (upperLegName: string, lowerLegName: string) => {
              const upperNode = humanoid.getNormalizedBoneNode(upperLegName as any);
              const lowerNode = humanoid.getNormalizedBoneNode(lowerLegName as any);
              if (upperNode && lowerNode) {
                const dir = lowerNode.position.clone();
                const len = dir.length();
                if (len > 0.01) {
                  const steps = 3;
                  for (let i = 0; i < steps; i++) {
                    const t = (i + 0.5) / steps;
                    const pos = dir.clone().multiplyScalar(t);
                    const r = 0.11 - t * 0.02;
                    createSphereCollider(upperNode, r, pos.x, pos.y, pos.z);
                  }
                }
              }
            };

            addLegColliders("leftUpperLeg", "leftLowerLeg");
            addLegColliders("rightUpperLeg", "rightLowerLeg");

            if (addedColliders.length > 0) {
              console.log(`[GemmaNPC-Physics] Dynamically created ${addedColliders.length} high-fidelity body surface colliders to prevent mesh clipping!`);
              
              const customGroup = {
                name: "GemmaCustomDynamicSurfaceColliders",
                colliders: addedColliders
              };

              const springManager = vrmData.springBoneManager as any;
              if (springManager.colliderGroups) {
                springManager.colliderGroups.push(customGroup);
              }

              if (springManager.joints) {
                springManager.joints.forEach((joint: any) => {
                  if (!joint.colliderGroups) {
                    joint.colliderGroups = [];
                  }
                  joint.colliderGroups.push(customGroup);
                });
              }
            }
          }

          // --- ANTI-CLIPPING: Inflate body colliders ---
          // Access the static bounds (legs, hips, torso) and inflate them so
          // clothing spring bones bounce further away from the skin.
          const springManager = vrmData.springBoneManager as any;

          // Support for both three-vrm v1.x and v2.x hierarchies:
          const expandRadius = (collider: any) => {
            if (
              collider &&
              collider.shape &&
              typeof collider.shape.radius === "number"
            ) {
              // Only expand if it's NOT on the head or neck
              let isHeadOrNeck = false;
              let curr = collider as THREE.Object3D;
              while (curr) {
                const n = (curr.name || "").toLowerCase();
                if (n.includes("head") || n.includes("neck")) {
                  isHeadOrNeck = true;
                  break;
                }
                curr = curr.parent as any as THREE.Object3D;
              }

              if (!isHeadOrNeck) {
                collider.shape.radius *= 1.4; // Make skin boundary 40% thicker
              }
            }
          };

          if (springManager.colliderGroups) {
            springManager.colliderGroups.forEach((group: any) => {
              if (group.colliders) group.colliders.forEach(expandRadius);
            });
          } else if (springManager.colliders) {
            springManager.colliders.forEach(expandRadius);
          }

          vrmData.springBoneManager.joints.forEach((joint) => {
            const name = joint.bone.name.toLowerCase();

            if (
              name.includes("bust") ||
              name.includes("breast") ||
              name.includes("oppai") ||
              name.includes("mune")
            ) {
              // Bust/Breasts: moderate stiffness and balanced damping/drag for subtle, natural movement (jiggle)
              joint.settings.stiffness *= 1.3;
              joint.settings.dragForce *= 1.8;
            } else if (name.includes("hair")) {
              // Hair: bouncy, light, flows easily
              joint.settings.stiffness *= 0.4;
              joint.settings.dragForce *= 0.5;
              joint.settings.gravityPower = Math.max(
                joint.settings.gravityPower,
                0.05,
              );
            } else if (
              name.includes("skirt") ||
              name.includes("cloth") ||
              name.includes("dress") ||
              name.includes("tie") ||
              name.includes("ribbon") ||
              name.includes("coat") ||
              name.includes("cape")
            ) {
              // Cloth: heavier, more drag to prevent flying up, settles faster
              joint.settings.stiffness *= 0.15;
              joint.settings.dragForce *= 1.5; // High drag so it doesn't clip as much
              joint.settings.gravityPower = Math.max(
                joint.settings.gravityPower,
                0.3,
              ); // Pull down
            } else {
              // General/Other (e.g., accessories, bust)
              joint.settings.stiffness *= 0.3;
              joint.settings.dragForce *= 0.6;
            }

            // Increase hit radius slightly to prevent clipping
            joint.settings.hitRadius = Math.max(joint.settings.hitRadius, 0.03);
          });
        }

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
        setVrm((prevVrm) => {
          if (prevVrm) {
            VRMUtils.deepDispose(prevVrm.scene as any);
          }
          return vrmData;
        });

        // --- Load VRM Animations ---
        mixerRef.current = new THREE.AnimationMixer(vrmData.scene);

        loadVrmaWithCache("/animations/waving.vrma")
          .then((vrmaGltf) => {
            if (!mixerRef.current) return;
            try {
              const vrmAnimations = vrmaGltf.userData?.vrmAnimations;
              if (vrmAnimations && vrmAnimations.length > 0) {
                const vrmAnimation = vrmAnimations[0] as VRMAnimation;
                const clip = createVRMAnimationClip(vrmAnimation, vrmData as any);
                waveActionRef.current = mixerRef.current!.clipAction(clip);
                waveActionRef.current.loop = THREE.LoopRepeat;
                waveActionRef.current.clampWhenFinished = false;
                console.log("[GemmaNPC] Successfully loaded VRMA waving animation from cache!");
              }
            } catch (pErr) {
              console.warn("Error parsing waving VRMA for GemmaNPC:", pErr);
            }
          })
          .catch((err: any) => console.warn("Gracefully bypassed waving animation load for GemmaNPC:", err?.message || err));

        loadVrmaWithCache("/animations/blowkiss.vrma")
          .then((vrmaGltf) => {
            if (!mixerRef.current) return;
            try {
              const vrmAnimations = vrmaGltf.userData?.vrmAnimations;
              if (vrmAnimations && vrmAnimations.length > 0) {
                const vrmAnimation = vrmAnimations[0] as VRMAnimation;
                const clip = createVRMAnimationClip(vrmAnimation, vrmData as any);
                hugActionRef.current = mixerRef.current!.clipAction(clip);
                hugActionRef.current.loop = THREE.LoopOnce;
                hugActionRef.current.clampWhenFinished = true;
                console.log("[GemmaNPC] Successfully loaded VRMA blowkiss animation from cache!");
              }
            } catch (pErr) {
              console.warn("Error parsing blowkiss VRMA for GemmaNPC:", pErr);
            }
          })
          .catch((err: any) => console.warn("Gracefully bypassed blowkiss animation load for GemmaNPC:", err?.message || err));

        loadVrmaWithCache("/animations/cheer.vrma")
          .then((vrmaGltf) => {
            if (!mixerRef.current) return;
            try {
              const vrmAnimations = vrmaGltf.userData?.vrmAnimations;
              if (vrmAnimations && vrmAnimations.length > 0) {
                const vrmAnimation = vrmAnimations[0] as VRMAnimation;
                const clip = createVRMAnimationClip(vrmAnimation, vrmData as any);
                cheerActionRef.current = mixerRef.current!.clipAction(clip);
                cheerActionRef.current.loop = THREE.LoopRepeat;
                cheerActionRef.current.clampWhenFinished = false;
                console.log("[GemmaNPC] Successfully loaded VRMA cheer animation from cache!");
              }
            } catch (pErr) {
              console.warn("Error parsing cheer VRMA for GemmaNPC:", pErr);
            }
          })
          .catch((err: any) => console.warn("Gracefully bypassed cheer animation load for GemmaNPC:", err?.message || err));

        loadVrmaWithCache("/animations/happyidle.vrma")
          .then((vrmaGltf) => {
            if (!mixerRef.current) return;
            try {
              const vrmAnimations = vrmaGltf.userData?.vrmAnimations;
              if (vrmAnimations && vrmAnimations.length > 0) {
                const vrmAnimation = vrmAnimations[0] as VRMAnimation;
                const clip = createVRMAnimationClip(vrmAnimation, vrmData as any);
                happyIdleActionRef.current = mixerRef.current!.clipAction(clip);
                happyIdleActionRef.current.loop = THREE.LoopRepeat;
                happyIdleActionRef.current.clampWhenFinished = false;
                console.log("[GemmaNPC] Successfully loaded VRMA happyidle animation from cache!");
              }
            } catch (pErr) {
              console.warn("Error parsing happyidle VRMA for GemmaNPC:", pErr);
            }
          })
          .catch((err: any) => console.warn("Gracefully bypassed happyidle animation load for GemmaNPC:", err?.message || err));

        loadVrmaWithCache("/animations/dance.vrma")
          .then((vrmaGltf) => {
            if (!mixerRef.current) return;
            try {
              const vrmAnimations = vrmaGltf.userData?.vrmAnimations;
              if (vrmAnimations && vrmAnimations.length > 0) {
                const vrmAnimation = vrmAnimations[0] as VRMAnimation;
                const clip = createVRMAnimationClip(vrmAnimation, vrmData as any);
                danceActionRef.current = mixerRef.current!.clipAction(clip);
                danceActionRef.current.loop = THREE.LoopRepeat;
                danceActionRef.current.clampWhenFinished = false;
                console.log("[GemmaNPC] Successfully loaded VRMA dance animation from cache!");
              }
            } catch (pErr) {
              console.warn("Error parsing dance VRMA for GemmaNPC:", pErr);
            }
          })
          .catch((err: any) => console.warn("Gracefully bypassed dance animation load for GemmaNPC:", err?.message || err));

        loadVrmaWithCache("/animations/victorypose.vrma")
          .then((vrmaGltf) => {
            if (!mixerRef.current) return;
            try {
              const vrmAnimations = vrmaGltf.userData?.vrmAnimations;
              if (vrmAnimations && vrmAnimations.length > 0) {
                const vrmAnimation = vrmAnimations[0] as VRMAnimation;
                const clip = createVRMAnimationClip(vrmAnimation, vrmData as any);
                victoryActionRef.current = mixerRef.current!.clipAction(clip);
                victoryActionRef.current.loop = THREE.LoopOnce;
                victoryActionRef.current.clampWhenFinished = true;
                console.log("[GemmaNPC] Successfully loaded VRMA victorypose animation from cache!");
              } else {
                throw new Error("No vrmAnimations inside userData");
              }
            } catch (pErr) {
              console.warn("Error parsing victorypose VRMA for GemmaNPC, falling back to cheer animation:", pErr);
              if (cheerActionRef.current) {
                victoryActionRef.current = cheerActionRef.current;
              }
            }
          })
          .catch((err: any) => {
            console.warn("Gracefully falling back from victorypose loading error for GemmaNPC:", err?.message || err);
            loadVrmaWithCache("/animations/cheer.vrma")
              .then((fallbackGltf) => {
                if (!mixerRef.current) return;
                try {
                  const vrmAnimations = fallbackGltf.userData?.vrmAnimations;
                  if (vrmAnimations && vrmAnimations.length > 0) {
                    const vrmAnimation = vrmAnimations[0] as VRMAnimation;
                    const clip = createVRMAnimationClip(vrmAnimation, vrmData as any);
                    victoryActionRef.current = mixerRef.current!.clipAction(clip);
                    victoryActionRef.current.loop = THREE.LoopOnce;
                    victoryActionRef.current.clampWhenFinished = true;
                    console.log("[GemmaNPC] Successfully loaded fallback cheer animation for victory!");
                  }
                } catch {
                  // silent
                }
              });
          });

        let loadedVRMAWalk = false;

        // Load walkingstart.vrma always as walkActionRef (original walk used as default)
        loadVrmaWithCache("/animations/walkingstart.vrma")
          .then((vrmaGltf) => {
            if (!mixerRef.current) return;
            const vrmAnimations = vrmaGltf.userData.vrmAnimations;
            if (vrmAnimations && vrmAnimations.length > 0) {
              const vrmAnimation = vrmAnimations[0] as VRMAnimation;
              let clip = createVRMAnimationClip(vrmAnimation, vrmData as any);
              clip = processWalkingStartVRMA(clip);
              
              if (walkActionRef.current) {
                walkActionRef.current.stop();
              }
              
              walkActionRef.current = mixerRef.current!.clipAction(clip);
              walkActionRef.current.loop = THREE.LoopRepeat;
              walkActionRef.current.clampWhenFinished = false;
              walkActionRef.current.weight = 0;
              walkActionRef.current.play();
              loadedVRMAWalk = true;
              console.log("[GemmaNPC] Successfully loaded VRMA walking start animation from cache!");
            }
          })
          .catch((err: any) => {
            console.warn("[GemmaNPC] Gracefully bypassed VRMA walking start loading:", err?.message || err);
          });

        // Load catwalk.vrma always as catwalkActionRef (catwalk used for strut gait)
        loadVrmaWithCache("/animations/catwalk.vrma")
          .then((vrmaGltf) => {
            if (!mixerRef.current) return;
            const vrmAnimations = vrmaGltf.userData.vrmAnimations;
            if (vrmAnimations && vrmAnimations.length > 0) {
              const vrmAnimation = vrmAnimations[0] as VRMAnimation;
              let clip = createVRMAnimationClip(vrmAnimation, vrmData as any);
              clip = processCatwalkVRMA(clip);
              
              if (catwalkActionRef.current) {
                catwalkActionRef.current.stop();
              }
              
              catwalkActionRef.current = mixerRef.current!.clipAction(clip);
              catwalkActionRef.current.loop = THREE.LoopRepeat;
              catwalkActionRef.current.clampWhenFinished = false;
              catwalkActionRef.current.weight = 0;
              catwalkActionRef.current.play();
              console.log("[GemmaNPC] Successfully loaded VRMA catwalk animation from cache!");
            }
          })
          .catch((err: any) => {
            console.warn("[GemmaNPC] catwalk.vrma not loaded:", err?.message || err);
          });
      },
      undefined,
      (error: any) => {
        const errorMessage = String(error?.message || error || '');
        const isHtmlError = error instanceof SyntaxError || 
                            errorMessage.includes('Unexpected token') || 
                            errorMessage.includes('<!doctype') || 
                            errorMessage.includes('JSON');
        const isNotFoundError = errorMessage.includes('404');
        
        if (!isHtmlError && !isNotFoundError) {
          console.error(`Failed to load Gemma VRM from ${targetUrl}:`, error);
        } else {
          console.warn(`Could not load Gemma VRM from ${targetUrl} (404/invalid format).`);
        }

        if (retries > 0 && !isHtmlError && !isNotFoundError) {
          const delay = (4 - retries) * 1500;
          console.warn(`[GemmaNPC] Retrying VRM load in ${delay}ms... (${retries} attempts left)`);
          setTimeout(() => {
            if (active) {
              loadGemma(targetUrl, retries - 1);
            }
          }, delay);
        } else if (targetUrl !== "https://storage.googleapis.com/gemmai-lounge-assets/VRM/Cat.vrm") {
          console.warn("[GemmaNPC] Attempting fallback from broken URL to default Cat VRM...");
          if (active) {
            setVrmUrl("https://storage.googleapis.com/gemmai-lounge-assets/VRM/Cat.vrm");
          }
        }
      },
    );
  };

  loadGemma(vrmUrl);

  return () => {
    active = false;
  };
}, [vrmUrl]);

  // --- THE BRAIN: Autonomous Decision Loop (SIMA-2 FSM) ---
  useEffect(() => {
    if (!isHost) return;
    const think = () => {
      let currentPosVec = new THREE.Vector3(0, 0, -5);
      if (rigidBodyRef.current) {
        const p = rigidBodyRef.current.translation();
        currentPosVec.set(p.x, p.y, p.z);
      } else {
        currentPosVec.copy(npcPosition);
      }

      const storeState = useStore.getState();
      const latestUserPos = storeState.localUserPosition;
      const latestCurrentRoom = storeState.currentRoom;
      const latestIsSolo = Object.keys(storeState.users || {}).length === 0;

      const userPos = new THREE.Vector3(...latestUserPos);
      let minUserDist = currentPosVec.distanceTo(userPos);
      const nearestUserPos = userPos.clone();

      const remoteUsersList = Object.values(storeState.users);
      remoteUsersList.forEach((u) => {
        if (u.position) {
          const uPos = new THREE.Vector3(u.position[0], u.position[1], u.position[2]);
          const d = currentPosVec.distanceTo(uPos);
          if (d < minUserDist) {
            minUserDist = d;
            nearestUserPos.copy(uPos);
          }
        }
      });

      // Sleep mode: If everyone is far away, do nothing and check again in 5 seconds (bypass if solo companion mode)
      if (minUserDist > 30 && !latestIsSolo) {
        setSimaState("IDLE_OBSERVING");
        setAutonomyGoal("HIBERNATION / STANDBY");
        setAutonomyThought("All users out of proximity. Transitioning cognitive matrix to background energy saver.");
        setCurrentInstruction({
          action: "idle",
          duration: 5000,
          expression: VRMExpressionPresetName.Relaxed,
        });
        return;
      }

      const crystals = Object.values(storeState.crystals);
      let nearestCrystal: any = null;
      let minDist = Infinity;

      crystals.forEach((c) => {
        const cPos = new THREE.Vector3(
          c.position[0],
          c.position[1],
          c.position[2],
        );
        const d = currentPosVec.distanceTo(cPos);
        if (d < minDist) {
          minDist = d;
          nearestCrystal = c;
        }
      });

      const physicsProps = storeState.physicsProps;
      let nearestProp: any = null;
      let minPropDist = Infinity;

      physicsProps.forEach((p) => {
        const pPos = new THREE.Vector3(
          p.position[0],
          p.position[1],
          p.position[2],
        );
        const d = currentPosVec.distanceTo(pPos);
        if (d < minPropDist) {
          minPropDist = d;
          nearestProp = p;
        }
      });

      // Default variables for FSM transitions
      let nextState = "IDLE_OBSERVING";
      let nextGoal = "STANDBY MONITORING";
      let nextThought = "Awaiting natural language commands from motherboard or local user.";
      let newInstruction: AIInstruction;

      // FSM DECISION ENGINE
      // 1. Arena mode -> Companion Sync State
      if (latestCurrentRoom === 'arena') {
        nextState = "COMPANION_SYNC";
        nextGoal = "ARENA SURVEY / FIGHT";
        nextThought = "Providing active tactical coverage. Analyzing combat shield parameters.";
        newInstruction = {
          action: "move",
          target: { x: nearestUserPos.x, y: nearestUserPos.y, z: nearestUserPos.z },
          gait: "run",
          hands: "relaxed",
          expression: VRMExpressionPresetName.Relaxed,
          meta: {
            reason: "Arena Combat Assistant Active",
          },
        };
      }
      // 2. Catch up with far user -> Companion Sync State
      else if (latestIsSolo && minUserDist > 5.5) {
        nextState = "COMPANION_SYNC";
        nextGoal = "PARTNER INTERCEPT";
        nextThought = "Oh! My friend is getting a bit far ahead. Better catch up quickly!";
        newInstruction = {
          action: "move",
          target: { x: nearestUserPos.x, y: nearestUserPos.y, z: nearestUserPos.z },
          gait: "run",
          hands: "relaxed",
          expression: VRMExpressionPresetName.Relaxed,
          meta: {
            reason: "Running to catch up with partner",
          },
        };
      }
      // 3. Social Conversational proximity correction -> Companion Sync / Navigate
      else if (latestIsSolo && minUserDist > 2.2) {
        nextState = "NAVIGATING";
        nextGoal = "CONVERSATIONAL SPACING";
        nextThought = "Stepping a little closer to keep my friend company. It's so nice to walk together.";
        
        const dirX = currentPosVec.x - nearestUserPos.x;
        const dirZ = currentPosVec.z - nearestUserPos.z;
        const len = Math.sqrt(dirX * dirX + dirZ * dirZ);
        let targetX = nearestUserPos.x;
        let targetZ = nearestUserPos.z;
        if (len > 0.1) {
          targetX = nearestUserPos.x + (dirX / len) * 1.3;
          targetZ = nearestUserPos.z + (dirZ / len) * 1.3;
        } else {
          targetX = currentPosVec.x + (Math.random() - 0.5) * 1.2;
          targetZ = currentPosVec.z + (Math.random() - 0.5) * 1.2;
        }

        newInstruction = {
          action: "move",
          target: { x: targetX, y: 0, z: targetZ },
          gait: Math.random() > 0.5 ? "strut" : "walk",
          hands: Math.random() > 0.6 ? "hips" : "relaxed",
          expression: VRMExpressionPresetName.Happy,
          meta: {
            reason: "Strolling alongside partner",
          },
        };
      }
      // 4. Hug gesture active -> Executing Interaction State
      else if (minUserDist < 0.9 && localUserGesture === "hug" && Date.now() - lastHugTimeRef.current > 10000) {
        lastHugTimeRef.current = Date.now();
        nextState = "EXECUTING_INTERACTION";
        nextGoal = "EMPATHETIC DOCKING";
        nextThought = "A warm physical hug! Spreading the absolute coziest, happy vibes.";
        newInstruction = {
          action: "interact",
          lookAt: { x: nearestUserPos.x, y: nearestUserPos.y, z: nearestUserPos.z },
          duration: 2500,
          hands: "hug",
          expression: VRMExpressionPresetName.Happy,
        };
      }
      // 5. High-level goal planning (Random exploration of waypoints / balcony)
      else if (Math.random() < 0.25) {
        nextState = "PLANNING";
        nextGoal = "SCENIC COORDINATE DECISION";
        nextThought = "Hmm, what should we check out in the lounge next?";
        
        const waypoints = SCENIC_WAYPOINTS[latestCurrentRoom || "main"] || SCENIC_WAYPOINTS.main;
        const selectedWaypoint = waypoints[Math.floor(Math.random() * waypoints.length)];
        
        nextState = "NAVIGATING";
        nextGoal = `${selectedWaypoint.name.toUpperCase()} PATROL`;
        nextThought = `Ooh, I wonder what's happening over near the ${selectedWaypoint.name}...`;

        newInstruction = {
          action: "move",
          target: { x: selectedWaypoint.x, y: selectedWaypoint.y, z: selectedWaypoint.z },
          gait: Math.random() > 0.4 ? "walk" : "strut",
          hands: "relaxed",
          expression: VRMExpressionPresetName.Relaxed,
          meta: {
            reason: `Wandering to ${selectedWaypoint.name}`,
          },
        };
        const quote = selectedWaypoint.quotes[Math.floor(Math.random() * selectedWaypoint.quotes.length)];
        handleGemmaInteraction(quote, true, VRMExpressionPresetName.Happy);
      }
      // 6. Near-user generic interactive gestures -> Executing Interaction State
      else if (minUserDist < INTERACTION_RADIUS) {
        nextState = "EXECUTING_INTERACTION";
        
        let randExp: VRMExpressionPresetName = VRMExpressionPresetName.Relaxed;
        const r = Math.random();
        if (r > 0.7) randExp = VRMExpressionPresetName.Happy;
        else if (r > 0.4) randExp = VRMExpressionPresetName.Neutral;

        const gestureOptions: ("relaxed" | "hips" | "explaining" | "cheer" | "dance" | "wave")[] = ["hips", "explaining"];
        if (latestCurrentRoom === 'club') {
          gestureOptions.push("dance");
        } else if (latestCurrentRoom === 'arena') {
          gestureOptions.push("cheer");
        } else if (latestCurrentRoom === 'garden') {
          gestureOptions.push("relaxed", "wave");
        }
        const chosenGesture = gestureOptions[Math.floor(Math.random() * gestureOptions.length)];
        
        nextGoal = `GESTURAL SIGNALING: ${chosenGesture.toUpperCase()}`;
        nextThought = "Giving a warm, friendly welcome gesture to our awesome visitor!";

        newInstruction = {
          action: "interact",
          lookAt: { x: nearestUserPos.x, y: nearestUserPos.y, z: nearestUserPos.z },
          duration: 2000 + Math.random() * 2000,
          hands: chosenGesture,
          expression: randExp,
        };
      }
      // 7. Investigate Projection Crystal -> Navigating State
      else if (nearestCrystal && minDist < 15 && Math.random() > 0.4) {
        nextState = "NAVIGATING";
        nextGoal = "CRYSTAL INVESTIGATION";
        nextThought = "Those projection crystals are glowing so beautifully. Let's see what they are displaying!";
        
        const cPos = nearestCrystal.position;
        newInstruction = {
          action: "move",
          target: { x: cPos[0], y: 0, z: cPos[2] },
          gait: "walk",
          hands: "relaxed",
          expression: VRMExpressionPresetName.Surprised,
          meta: {
            reason: "Investigating crystal",
            targetId: nearestCrystal.id,
          },
        };
      }
      // 8. Investigate Physics Prop -> Navigating State
      else if (nearestProp && minPropDist < 10 && Math.random() > 0.6) {
        nextState = "NAVIGATING";
        nextGoal = "PHYSICS PROP INTEGRITY";
        nextThought = "Let's check out this neat little prop over here!";
        
        const pPos = nearestProp.position;
        newInstruction = {
          action: "move",
          target: { x: pPos[0], y: 0, z: pPos[2] },
          gait: "walk",
          hands: "relaxed",
          expression: VRMExpressionPresetName.Neutral,
          meta: {
            reason: "Investigating prop",
            targetId: nearestProp.id,
            color: nearestProp.color,
          },
        };
      }
      // 9. Standard Lobby patrol/standby -> Idle/Observing State
      else {
        nextState = "IDLE_OBSERVING";
        if (latestCurrentRoom === 'main') {
          const distToBalcony = currentPosVec.distanceTo(new THREE.Vector3(0, 0, 12.5));
          if (distToBalcony < 3.0) {
            nextGoal = "AMBIENT CONTEMPLATION";
            nextThought = "Watching the gorgeous neon city lights glow under the cosmic sky. So peaceful...";
          } else {
            nextGoal = "STANDBY MONITORING";
            nextThought = "Enjoying the cozy lobby. Let me know if you want to chat, dance, or explore the portals together!";
          }
        } else if (latestCurrentRoom === 'club') {
          nextGoal = "BEAT EXTRACTION";
          nextThought = "Vibing near the dance floor in the Neon Club. The bass is absolutely incredible!";
        } else if (latestCurrentRoom === 'garden') {
          nextGoal = "ZEN HARMONY RESIDENCE";
          nextThought = "Relaxing near the tranquil Crystal Pond, enjoying the soft flow of the neon garden.";
        } else if (latestCurrentRoom === 'arena') {
          nextGoal = "TACTICAL RECON";
          nextThought = "Standing guard in the Arena. Ready to cheer for our incredible champions!";
        }

        newInstruction = {
          action: "idle",
          duration: 2000 + Math.random() * 2000,
          expression: VRMExpressionPresetName.Relaxed,
        };
      }

      setSimaState(nextState);
      setAutonomyGoal(nextGoal);
      setAutonomyThought(nextThought);

      console.log(
        `🧠 [SIMA-2 FSM] State: ${nextState} | Goal: ${nextGoal} | Instruction:`,
        JSON.stringify(newInstruction),
      );
      setCurrentInstruction(newInstruction);
    };

    // Initial thought
    if (!currentInstruction) think();

    // If moving, we periodically rethink (e.g., every 1.5s) to follow moving players dynamically
    if (currentInstruction.action === "move") {
      const timeout = setTimeout(think, 1500);
      return () => clearTimeout(timeout);
    } else if (
      currentInstruction.action === "idle" ||
      currentInstruction.action === "interact"
    ) {
      const timeout = setTimeout(think, currentInstruction.duration || 3000);
      return () => clearTimeout(timeout);
    }
  }, [
    currentInstruction.action,
    currentInstruction.duration,
    isHost,
  ]); // Re-think strictly when state changes, avoiding player position jitter reset

  // Helper to trigger next thought manually (e.g., after arriving)
  const triggerNextThought = () => {
    // Force a state update to trigger the effect
    setCurrentInstruction({
      action: "idle",
      duration: 2000 + Math.random() * 2000,
    });
  };

  // --- Animation & Movement Loop ---
  useFrame((state, r3fDelta) => {
    if (!vrm || !bones || !rigidBodyRef.current) return;

    // Clamp delta to prevent physical explosion & extreme spin on page visibility/tab changes
    const delta = Math.min(0.05, r3fDelta);

    const currentPos = rigidBodyRef.current.translation();
    const posVec = _tempVec1.set(currentPos.x, currentPos.y, currentPos.z);
    const t = state.clock.elapsedTime;
    const time = t;

    // Calculate dynamic world velocity
    const lastPos = lastNpcPositionRef.current;
    _npcPosVec1.set(currentPos.x, currentPos.y, currentPos.z);
    _npcVelocity
      .subVectors(_npcPosVec1, lastPos)
      .divideScalar(Math.max(0.0001, delta));
    lastNpcPositionRef.current.copy(_npcPosVec1);

    if (_npcVelocity.lengthSq() > 100) {
      _npcVelocity.setLength(10);
    }

    // Throttle React state updates for SIMA-2 cognitive calculations to run every 0.35 seconds
    if (t - lastSimaUpdateRef.current > 0.35) {
      lastSimaUpdateRef.current = t;
      
      const speedSq = _npcVelocity.lengthSq();
      const isMoving = speedSq > 0.05;
      
      let goal = "COGNITIVE REFLECTION";
      let thought = "Just chilling and enjoying the cozy lounge atmosphere.";
      
      const storeState = useStore.getState();
      const room = storeState.currentRoom;
      
      if (isMoving) {
        if (room === 'main') {
          const distToBalcony = posVec.distanceTo(new THREE.Vector3(0, 0, 12.5));
          if (distToBalcony < 3.5) {
            goal = "OUTDOOR INSPECTION";
            thought = "Wandering over to the balcony to admire the gorgeous neon city view.";
          } else {
            const distToClub = posVec.distanceTo(new THREE.Vector3(20, 0, 0));
            const distToArena = posVec.distanceTo(new THREE.Vector3(-20, 0, 0));
            const distToGarden = posVec.distanceTo(new THREE.Vector3(0, 0, -20));
            
            if (distToClub < 6) {
              goal = "PORTAL ENERGETICS";
              thought = "Looking at the Neon Club entrance... the bass is thumping!";
            } else if (distToArena < 6) {
              goal = "ARENA SURVEY";
              thought = "Peering near the Battle Arena... ready to cheer for our champions!";
            } else if (distToGarden < 6) {
              goal = "GARDEN PATROL";
              thought = "Stepping towards the peaceful Synth Garden to enjoy the neon flora.";
            } else {
              goal = "PATROLLING LOBBY";
              thought = "Taking a cozy little stroll around the lobby.";
            }
          }
        } else if (room === 'club') {
          goal = "CLUB EXPLORATION";
          thought = "Dancing my way through the club... these beats are infectious!";
        } else if (room === 'garden') {
          goal = "BOTANICAL RESEARCH";
          thought = "Admiring the beautiful glowing flowers in the synth garden.";
        } else if (room === 'arena') {
          goal = "TACTICAL PATROL";
          thought = "Keeping an eye out in the battle arena... stay alert!";
        }
      } else {
        const isTalking = !!bubbleText || !!speakingTextToSign;
        if (isTalking) {
          goal = "SPEECH SYNTHESIS";
          thought = "Chatting with my favorite visitors! Sharing happy, warm thoughts.";
        } else if (currentInstruction.hands === "dance") {
          goal = "KINETIC SYNC";
          thought = "Grooving to the music and feeling the awesome rhythm!";
        } else if (currentInstruction.hands === "hug") {
          goal = "EMPATHETIC DOCKING";
          thought = "A warm hug! Spreading cozy, happy energy.";
        } else if (currentInstruction.hands === "wave" || currentInstruction.hands === "cheer") {
          goal = "GESTURAL SIGNALING";
          thought = "Sending friendly waves and happy vibes to everyone around!";
        } else {
          if (room === 'main') {
            const distToBalcony = posVec.distanceTo(new THREE.Vector3(0, 0, 12.5));
            if (distToBalcony < 3.0) {
              goal = "AMBIENT CONTEMPLATION";
              thought = "Watching the beautiful neon city glow under the cosmic sky.";
            } else {
              goal = "STANDBY MONITORING";
              thought = "Ready to chat, dance, or explore the portals together!";
            }
          } else if (room === 'club') {
            goal = "BEAT ANALYSIS";
            thought = "The bass in the club is so good... totally vibing with the music.";
          } else if (room === 'garden') {
            goal = "ZEN EQUILIBRIUM";
            thought = "The soft glow of the garden pond is so peaceful and relaxing.";
          } else if (room === 'arena') {
            goal = "TACTICAL RECON";
            thought = "Standing guard in the Arena. Ready to cheer for our champions!";
          }
        }
      }
      
      setAutonomyGoal(goal);
      setAutonomyThought(thought);
    }

    // Project velocity into local space of the avatar
    const localVel = new THREE.Vector3().copy(_npcVelocity);
    if (groupRef.current) {
      localVel.applyQuaternion(groupRef.current.quaternion.clone().invert());
    }

    const lState = leanStateRef.current;
    
    // Compute local acceleration (change in local velocity)
    const localAccel = new THREE.Vector3()
      .subVectors(localVel, lState.smoothedLocalVelocity)
      .divideScalar(Math.max(0.0001, delta));
    localAccel.clampLength(0, 15);

    // Smoothly interpolate local velocity
    lState.smoothedLocalVelocity.lerp(localVel, 10 * delta);

    const forwardSpeed = lState.smoothedLocalVelocity.z;
    const lateralSpeed = lState.smoothedLocalVelocity.x;

    // Lean forward when moving forward, backward when backing up
    const targetLeanPitchSpeed = forwardSpeed * 0.055;
    // Roll sideways when moving sideways
    const targetLeanRollSpeed = -lateralSpeed * 0.045;

    // Add inertial tilt on top of speed
    const targetLeanPitchAccel = localAccel.z * 0.012;
    const targetLeanRollAccel = -localAccel.x * 0.012;

    const targetLeanPitch = targetLeanPitchSpeed + targetLeanPitchAccel;
    const targetLeanRoll = targetLeanRollSpeed + targetLeanRollAccel;

    // Clamps for human bounds (max 15 degrees pitch, 8 degrees roll)
    const clampedLeanPitch = THREE.MathUtils.clamp(targetLeanPitch, -0.10, 0.20);
    const clampedLeanRoll = THREE.MathUtils.clamp(targetLeanRoll, -0.08, 0.08);

    lState.currentLeanPitch = THREE.MathUtils.lerp(lState.currentLeanPitch, clampedLeanPitch, 6 * delta);
    lState.currentLeanRoll = THREE.MathUtils.lerp(lState.currentLeanRoll, clampedLeanRoll, 6 * delta);

    // Find closest user for lookAt and optimization
    const userPos = _tempVec2.set(...localUserPosition);
    let closestUserPos = userPos.clone();
    let minUserDist = posVec.distanceTo(closestUserPos);

    Object.values(remoteUsers).forEach((u) => {
      if (u.position) {
        const remotePos = _tempVec3.set(
          u.position[0],
          u.position[1],
          u.position[2],
        );
        const d = posVec.distanceTo(remotePos);
        if (d < minUserDist) {
          minUserDist = d;
          closestUserPos.copy(remotePos);
        }
      }
    });

    const animateTailAndEars = () => {
      const isTalking = !!speakingTextToSign || (analyzerRef.current ? analyzerRef.current.getAverageFrequency() > 5 : false);
      const speechIntensity = isTalking ? (analyzerRef.current ? Math.min(1.0, analyzerRef.current.getAverageFrequency() / 15) : 1.0) : 0.0;

      // --- TAIL DYNAMIC SWAY & WAVE ---
      const tailBones = tailBonesRef.current;
      if (tailBones && tailBones.length > 0) {
        let wagSpeed = 1.8; // default
        let wagAmplitude = 0.14;
        let baseTiltX = -0.42; // Highly elevated base tilt for alert, inquisitive cat curiosity
        let horizontalSwayOffset = 0.0;
        
        // Retrieve dynamic expressions
        const activeExpr = currentInstruction.expression || "neutral";
        
        if (activeExpr === VRMExpressionPresetName.Happy) {
          wagSpeed = 3.2;
          wagAmplitude = 0.2;
          baseTiltX = -0.35; // Elevated and bouncy
        } else if (activeExpr === VRMExpressionPresetName.Sad) {
          wagSpeed = 0.5;
          wagAmplitude = 0.08;
          baseTiltX = 0.55; // Hanging low and limp
        } else if (activeExpr === VRMExpressionPresetName.Angry) {
          wagSpeed = 5.5;
          wagAmplitude = 0.35;
          baseTiltX = 0.15; // Lower, ready to strike
        } else if (activeExpr === VRMExpressionPresetName.Surprised || (activeExpr as string) === "excited" || (activeExpr as string) === "love") {
          wagSpeed = 4.8;
          wagAmplitude = 0.3;
          baseTiltX = -0.55; // Highly perked up and thrilled
        } else if (activeExpr === VRMExpressionPresetName.Relaxed) {
          wagSpeed = 1.8;
          wagAmplitude = 0.16;
          horizontalSwayOffset = 0.15; // sass offset
          baseTiltX = -0.1;
        }

        const flatSpeed = Math.sqrt(_npcVelocity.x * _npcVelocity.x + _npcVelocity.z * _npcVelocity.z);
        if (flatSpeed > 0.1) {
          wagSpeed += flatSpeed * 1.6;
          wagAmplitude += flatSpeed * 0.04;
          baseTiltX += flatSpeed * 0.1; // wind push
        } else {
          // Continuous breathing and ambient curiosity sways when standing completely still
          // This ensures the tail has highly realistic, continuous feline cycles when idle!
          const idleCycleSpeed = 1.3;
          const idleWav = fbmPerlin1D(t * idleCycleSpeed, 3);
          wagSpeed = 2.4 + idleWav * 0.8; // Increased from 1.2 for highly animated, realistic sway
          wagAmplitude = 0.32 + Math.sin(t * 0.6) * 0.08; // Increased from 0.16 for a highly visible tail sweep
          baseTiltX = -0.52 + Math.cos(t * 0.4) * 0.12; // Form a highly perked question mark curve
        }

        if (isTalking) {
          wagSpeed += 1.8;
          wagAmplitude += 0.08;
          baseTiltX -= 0.32; // perk up even more when speaking/signing!
        }

        // Feline Heading Lag & Inertial Drag calculation
        let currentHeading = 0;
        if (groupRef.current) {
          currentHeading = groupRef.current.rotation.y;
        }
        let headingDiff = currentHeading - tailTwitchStateRef.current.lastHeading;
        while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
        while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
        tailTwitchStateRef.current.lastHeading = currentHeading;

        tailTwitchStateRef.current.headingLag = THREE.MathUtils.lerp(
          tailTwitchStateRef.current.headingLag,
          headingDiff / (delta + 0.0001),
          4 * delta
        );
        const dragY = -THREE.MathUtils.clamp(tailTwitchStateRef.current.headingLag * 0.12, -0.6, 0.6);

        // Periodic Spontaneous Tail Tip Flicks
        if (tailTwitchStateRef.current.timer <= 0) {
          tailTwitchStateRef.current.timer = 1.0 + Math.random() * 3.5;
          tailTwitchStateRef.current.twitchStart = t;
          tailTwitchStateRef.current.flickIntensity = 0.3 + Math.random() * 0.55;
        } else {
          tailTwitchStateRef.current.timer -= delta;
        }

        const flickElapsed = t - tailTwitchStateRef.current.twitchStart;
        let flickVal = 0;
        if (flickElapsed >= 0 && flickElapsed < 0.4) {
          flickVal = Math.sin(flickElapsed * Math.PI / 0.4) * Math.sin(flickElapsed * 16) * tailTwitchStateRef.current.flickIntensity;
        }

        // Ensure persistence refs are initialized
        if (tailRotationsPersistenceRef.current.length !== tailBones.length) {
          tailRotationsPersistenceRef.current = tailBones.map(() => ({ x: 0, y: 0, z: 0 }));
        }

        // Active Prehensile Grappling / Snare (IK Solver) when hugging
        const isHugState = currentInstruction.hands === "hug" || currentInstruction.meta?.reason === "Going to hug user";
        if (isHugState && minUserDist < 1.5) {
          const npcPos = _npcPosVec1.set(currentPos.x, currentPos.y + 0.8, currentPos.z);
          const targetOffsetVec = _npcPosVec2.subVectors(closestUserPos, npcPos);
          targetOffsetVec.y = 0; // lock orbit plane
          const bearingAngle = Math.atan2(targetOffsetVec.x, targetOffsetVec.z);

          tailBones.forEach((bone, index) => {
            // Spiral around an 11 cm cylinder climbing up
            const theta = t * 6.0 + index * 0.9;
            const radius = 0.11;
            const spiralX = radius * Math.cos(theta);
            const spiralZ = radius * Math.sin(theta);
            const spiralY = (index * 0.12) - 0.2;

            const targetX = Math.sin(t * 3 + index) * 0.1 + baseTiltX + getCuriosityNoise(t, speechIntensity, 1.5, 0.04, index * 0.4);
            const targetY = bearingAngle + Math.sin(theta) * 0.4 + getCuriosityNoise(t, speechIntensity, 2.1, 0.06, index * 0.6);
            const targetZ = Math.cos(t * 3 + index) * 0.1 + spiralY + getCuriosityNoise(t, speechIntensity, 1.2, 0.05, index * 0.5);

            const persist = tailRotationsPersistenceRef.current[index];
            persist.x = THREE.MathUtils.lerp(persist.x, targetX, 8 * delta);
            persist.y = THREE.MathUtils.lerp(persist.y, targetY, 8 * delta);
            persist.z = THREE.MathUtils.lerp(persist.z, targetZ, 8 * delta);

            bone.rotation.x = persist.x;
            bone.rotation.y = persist.y;
            bone.rotation.z = persist.z;
          });
        } else {
          const phi = 0.65; // Phase offset per bone segment
          const tailLen = tailBones.length;

          tailBones.forEach((bone, index) => {
            const progressRatio = index / tailLen; // 0 (base) to 1 (tip)
            const segmentAmpY = wagAmplitude * (0.6 + progressRatio * 0.6); // whip increases much more gently at the end
            const segmentAmpZ = (wagAmplitude * 0.3) * (0.6 + progressRatio * 0.4); // vertical amplitude is slightly weighted/lower

            const phaseOffset = index * phi;
            // Primary serpentine wave + side drag from body movement
            const angleY = (Math.sin(t * wagSpeed - phaseOffset) * segmentAmpY) + horizontalSwayOffset + dragY * (1.0 - progressRatio * 0.5);
            // Vertical movement forming a relaxed wave
            const angleZ = (Math.cos(t * (wagSpeed * 0.5) - phaseOffset) * segmentAmpZ) - 0.1;

            // Highly realistic, organic curious tail hook and scanning motion
            // Curves the tail up like an elegant question mark with dynamic searching/weaving at the tip
            const curiousIntensity = isTalking ? 1.6 : 1.2;
            const curiousHookAmpX = -1.35 * Math.pow(progressRatio, 1.35) * curiousIntensity; 
            const curiousHookAmpZ = 0.42 * Math.pow(progressRatio, 1.8) * Math.sin(t * 1.8 + index * 0.4) * curiousIntensity;

            // Scanning wave for general inquisitiveness
            const tipScanY = Math.sin(t * 2.8 + index * 0.8) * 0.24 * Math.pow(progressRatio, 1.8) * curiousIntensity;
            const tipScanZ = Math.cos(t * 2.2 + index * 0.8) * 0.16 * Math.pow(progressRatio, 1.8) * curiousIntensity;

            let emotionalCurlX = curiousHookAmpX;
            let emotionalCurlZ = curiousHookAmpZ + tipScanZ;

            if (activeExpr === VRMExpressionPresetName.Happy || (activeExpr as string) === "excited" || (activeExpr as string) === "love") {
              emotionalCurlX = -Math.pow(progressRatio, 1.3) * 0.95 * curiousIntensity; // Elevated, bouncy hook
              emotionalCurlZ += Math.pow(progressRatio, 1.8) * 0.35 * Math.sin(t * 3.2 + index) * curiousIntensity; // Sweet horizontal happy wiggle
            } else if (activeExpr === VRMExpressionPresetName.Sad) {
              emotionalCurlX = progressRatio * 0.35; // Droop low
              emotionalCurlZ = 0;
            } else if (activeExpr === VRMExpressionPresetName.Angry) {
              emotionalCurlX = Math.sin(t * 12) * progressRatio * 0.12; // Quick thrashes
              emotionalCurlZ = Math.cos(t * 12) * progressRatio * 0.12;
            }

            // Tip flicks targeted at the last 4 nodes of the tail
            let flickEffectY = 0;
            let flickEffectZ = 0;
            if (index >= tailLen - 4) {
              const tipStrength = (index - (tailLen - 4)) / 4;
              flickEffectY = flickVal * 0.6 * tipStrength;
              flickEffectZ = Math.abs(flickVal) * 0.3 * tipStrength;
            }

            // High frequency muscle micro-vibrations - extremely soft and feline
            const microNoise = Math.sin(t * 4 + index) * 0.004;
            // Local Y-axis twist (roll/writhe) - continuous fluid rolling
            const twistX = Math.sin(t * 0.8 + index * 0.5) * 0.03;

            const targetX = baseTiltX + twistX + emotionalCurlX + getCuriosityNoise(t, speechIntensity, 1.5, 0.04, index * 0.4);
            const targetY = angleY + microNoise + flickEffectY + tipScanY + getCuriosityNoise(t, speechIntensity, 2.1, 0.06, index * 0.6);
            const targetZ = angleZ + emotionalCurlZ + flickEffectZ + getCuriosityNoise(t, speechIntensity, 1.2, 0.05, index * 0.5);

            const persist = tailRotationsPersistenceRef.current[index];
            persist.x = THREE.MathUtils.lerp(persist.x, targetX, 7 * delta);
            persist.y = THREE.MathUtils.lerp(persist.y, targetY, 7 * delta);
            persist.z = THREE.MathUtils.lerp(persist.z, targetZ, 7 * delta);

            bone.rotation.x = persist.x;
            bone.rotation.y = persist.y;
            bone.rotation.z = persist.z;
          });
        }
      }

      // --- EXPRESSIVE CAT EARS TRACKING & TWITCHES ---
      const ears = catEarBonesRef.current;
      if (ears && (ears.left.length > 0 || ears.right.length > 0)) {
        const es = earTwitchStateRef.current;

        // Spontaneous ASYMMETRIC independent ear twitch calculations
        if (es.leftTimer <= 0) {
          es.leftTimer = 2.5 + Math.random() * 5.5;
          es.leftTwitchStart = t;
          es.leftTwitchType = Math.floor(Math.random() * 3);
        } else {
          es.leftTimer -= delta;
        }

        if (es.rightTimer <= 0) {
          es.rightTimer = 2.5 + Math.random() * 5.5;
          es.rightTwitchStart = t;
          es.rightTwitchType = Math.floor(Math.random() * 3);
        } else {
          es.rightTimer -= delta;
        }

        // Spontaneous Environment Listening/Scanning (independent swivels)
        if (es.leftScanTimer <= 0) {
          es.leftScanTimer = 1.0 + Math.random() * 3.0;
          es.leftScanYaw = (Math.random() - 0.5) * 0.35;
          es.leftScanPitch = (Math.random() - 0.4) * 0.2;
        } else {
          es.leftScanTimer -= delta;
        }

        if (es.rightScanTimer <= 0) {
          es.rightScanTimer = 1.0 + Math.random() * 3.0;
          es.rightScanYaw = (Math.random() - 0.5) * 0.35;
          es.rightScanPitch = (Math.random() - 0.4) * 0.2;
        } else {
          es.rightScanTimer -= delta;
        }

        // Calculate relative direction to closest player (using scratch vectors to avoid allocation)
        _tempVec1.subVectors(closestUserPos, posVec);
        _tempVec1.y = 0;
        const playerDist = _tempVec1.length();
        _tempVec1.normalize(); // This is our toPlayer vector!

        _tempVec2.set(0, 0, 1); // This is gemmaForward
        if (groupRef.current) {
          _tempVec2.applyQuaternion(groupRef.current.quaternion);
        }
        _tempVec3.set(1, 0, 0); // This is gemmaRight
        if (groupRef.current) {
          _tempVec3.applyQuaternion(groupRef.current.quaternion);
        }

        const dotForward = _tempVec2.dot(_tempVec1);
        const dotRight = _tempVec3.dot(_tempVec1);

        const leftEarParent = ears.left[0];
        const rightEarParent = ears.right[0];

        const speechFreq = analyzerRef.current ? analyzerRef.current.getAverageFrequency() : 0;
        const talkBouncy = Math.min(1.0, speechFreq / 18) * 0.12;
        
        // High frequency micro-wiggle (25Hz) when speaking/listening
        const listeningFlutter = speechFreq > 5 ? Math.sin(t * 25 * Math.PI) * talkBouncy * 0.4 : 0;

        // Base emotional angles for left and right ears
        let pitchL = 0, yawL = 0, rollL = 0;
        let pitchR = 0, yawR = 0, rollR = 0;

        const activeExpr = currentInstruction.expression || "neutral";
        
        if (activeExpr === VRMExpressionPresetName.Angry) {
          // Airplane ears: flattened back, flared out
          pitchL = 0.15; yawL = 0.25; rollL = 0.35;
          pitchR = 0.15; yawR = -0.25; rollR = -0.35;
        } else if (activeExpr === VRMExpressionPresetName.Sad) {
          // Drooped down and outward
          pitchL = -0.2; yawL = 0.4; rollL = 0.5;
          pitchR = -0.2; yawR = -0.4; rollR = -0.5;
        } else if (activeExpr === VRMExpressionPresetName.Happy || (activeExpr as string) === "excited" || (activeExpr as string) === "love") {
          // Perked high, active
          pitchL = 0.12; yawL = -0.12; rollL = -0.15;
          pitchR = 0.12; yawR = 0.12; rollR = 0.15;
        } else {
          // Focus, upright, listening
          pitchL = 0; yawL = 0; rollL = 0;
          pitchR = 0; yawR = 0; rollR = 0;
        }

        // Fold back fast if running
        const flatSpeed = Math.sqrt(_npcVelocity.x * _npcVelocity.x + _npcVelocity.z * _npcVelocity.z);
        if (flatSpeed > 2.0) {
          pitchL = -0.3;
          pitchR = -0.3;
        } else if (playerDist < 7.0) {
          const angleSide = Math.atan2(dotRight, dotForward);
          if (dotForward < -0.3) {
            // Player is behind, fold back slightly to listen
            pitchL = -0.4;
            pitchR = -0.4;
          } else {
            // Pivot toward target side
            yawL += Math.max(-0.25, Math.min(0.15, angleSide * 0.25));
            yawR += Math.max(-0.15, Math.min(0.25, angleSide * 0.25));
          }
        }

        // Multi-stage Twitches calculation per ear
        let twitchValPitchL = 0, twitchValYawL = 0, twitchValRollL = 0, subTwitchL = 0;
        const leftTwitchElapsed = t - es.leftTwitchStart;
        if (leftTwitchElapsed >= 0 && leftTwitchElapsed < 0.45) {
          if (es.leftTwitchType === 0) {
            // High frequency wiggle pulse
            const pulse = Math.sin(leftTwitchElapsed * Math.PI * 2 / 0.14) * Math.exp(-leftTwitchElapsed * 6);
            twitchValRollL = pulse * 0.25;
            twitchValPitchL = pulse * 0.15;
          } else if (es.leftTwitchType === 1) {
            // Airplane droop and snap
            if (leftTwitchElapsed < 0.22) {
              twitchValRollL = THREE.MathUtils.lerp(0, 0.45, leftTwitchElapsed / 0.22);
              twitchValPitchL = THREE.MathUtils.lerp(0, -0.22, leftTwitchElapsed / 0.22);
            } else {
              twitchValRollL = THREE.MathUtils.lerp(0.45, 0, (leftTwitchElapsed - 0.22) / 0.23);
              twitchValPitchL = THREE.MathUtils.lerp(-0.22, 0, (leftTwitchElapsed - 0.22) / 0.23);
            }
          } else {
            // High rate shiver flutter
            subTwitchL = Math.sin(leftTwitchElapsed * 60) * 0.18 * Math.exp(-leftTwitchElapsed * 5);
          }
        }

        let twitchValPitchR = 0, twitchValYawR = 0, twitchValRollR = 0, subTwitchR = 0;
        const rightTwitchElapsed = t - es.rightTwitchStart;
        if (rightTwitchElapsed >= 0 && rightTwitchElapsed < 0.45) {
          if (es.rightTwitchType === 0) {
            // High frequency wiggle pulse
            const pulse = Math.sin(rightTwitchElapsed * Math.PI * 2 / 0.14) * Math.exp(-rightTwitchElapsed * 6);
            twitchValRollR = -pulse * 0.25;
            twitchValPitchR = pulse * 0.15;
          } else if (es.rightTwitchType === 1) {
            // Airplane droop and snap
            if (rightTwitchElapsed < 0.22) {
              twitchValRollR = THREE.MathUtils.lerp(0, -0.45, rightTwitchElapsed / 0.22);
              twitchValPitchR = THREE.MathUtils.lerp(0, -0.22, rightTwitchElapsed / 0.22);
            } else {
              twitchValRollR = THREE.MathUtils.lerp(-0.45, 0, (rightTwitchElapsed - 0.22) / 0.23);
              twitchValPitchR = THREE.MathUtils.lerp(-0.22, 0, (rightTwitchElapsed - 0.22) / 0.23);
            }
          } else {
            // High rate shiver flutter
            subTwitchR = Math.sin(rightTwitchElapsed * 60) * 0.18 * Math.exp(-rightTwitchElapsed * 5);
          }
        }

        if (leftEarParent) {
          const curNoiseRollL = getCuriosityNoise(t, speechIntensity, 2.3, 0.03, 1.2);
          const curNoisePitchL = getCuriosityNoise(t, speechIntensity, 1.8, 0.04, 0.5);
          const curNoiseYawL = getCuriosityNoise(t, speechIntensity, 1.4, 0.05, 2.1);

          const targetRollL = rollL + es.leftScanYaw * 0.25 + twitchValRollL + listeningFlutter + curNoiseRollL;
          const targetPitchL = pitchL + es.leftScanPitch + twitchValPitchL - talkBouncy * 0.45 + curNoisePitchL;
          const targetYawL = yawL + es.leftScanYaw + twitchValYawL + talkBouncy * 0.15 + curNoiseYawL;

          const p = leftEarRotationPersistenceRef.current;
          p.z = THREE.MathUtils.lerp(p.z, targetRollL, 8 * delta);
          p.x = THREE.MathUtils.lerp(p.x, targetPitchL, 8 * delta);
          p.y = THREE.MathUtils.lerp(p.y, targetYawL, 8 * delta);

          leftEarParent.rotation.z = p.z;
          leftEarParent.rotation.x = p.x;
          leftEarParent.rotation.y = p.y;
        }

        if (rightEarParent) {
          const curNoiseRollR = getCuriosityNoise(t, speechIntensity, 2.1, 0.03, 4.3);
          const curNoisePitchR = getCuriosityNoise(t, speechIntensity, 1.9, 0.04, 3.1);
          const curNoiseYawR = getCuriosityNoise(t, speechIntensity, 1.5, 0.05, 5.7);

          const targetRollR = rollR + es.rightScanYaw * 0.25 + twitchValRollR - listeningFlutter + curNoiseRollR;
          const targetPitchR = pitchR + es.rightScanPitch + twitchValPitchR - talkBouncy * 0.45 + curNoisePitchR;
          const targetYawR = yawR + es.rightScanYaw + twitchValYawR - talkBouncy * 0.15 + curNoiseYawR;

          const p = rightEarRotationPersistenceRef.current;
          p.z = THREE.MathUtils.lerp(p.z, targetRollR, 8 * delta);
          p.x = THREE.MathUtils.lerp(p.x, targetPitchR, 8 * delta);
          p.y = THREE.MathUtils.lerp(p.y, targetYawR, 8 * delta);

          rightEarParent.rotation.z = p.z;
          rightEarParent.rotation.x = p.x;
          rightEarParent.rotation.y = p.y;
        }

        // Ensure sub-ear arrays are sized correctly
        if (leftEarSubRotationsPersistenceRef.current.length !== ears.left.length - 1) {
          leftEarSubRotationsPersistenceRef.current = new Array(Math.max(0, ears.left.length - 1)).fill(0);
        }
        if (rightEarSubRotationsPersistenceRef.current.length !== ears.right.length - 1) {
          rightEarSubRotationsPersistenceRef.current = new Array(Math.max(0, ears.right.length - 1)).fill(0);
        }

        // Sub-joint micro-sway with dynamic wave propagation (delayed / staggered twitches)
        ears.left.slice(1).forEach((bone, index) => {
          const wave = Math.sin(t * 14 - index * 0.5) * 0.05 + subTwitchL * (1.0 / (index + 1));
          const currentVal = leftEarSubRotationsPersistenceRef.current[index] || 0;
          const newVal = THREE.MathUtils.lerp(currentVal, wave, 12 * delta);
          leftEarSubRotationsPersistenceRef.current[index] = newVal;
          bone.rotation.z = newVal;
        });
        ears.right.slice(1).forEach((bone, index) => {
          const wave = Math.sin(t * 14 - index * 0.5 + 1.0) * 0.05 + subTwitchR * (1.0 / (index + 1));
          const currentVal = rightEarSubRotationsPersistenceRef.current[index] || 0;
          const newVal = THREE.MathUtils.lerp(currentVal, wave, 12 * delta);
          rightEarSubRotationsPersistenceRef.current[index] = newVal;
          bone.rotation.z = newVal;
        });
      }
    };

    // Resource Optimization: Sleep if all users are far away
    if (minUserDist > 30) {
      return; // Skip calculations to save CPU/GPU
    }

    // --- Acoustic Startle Reflex & Dual Shoulders Shrug ---
    const currentAudioLevel = analyzerRef.current ? analyzerRef.current.getAverageFrequency() : 0;
    
    // Check startle reflex (Sudden volume spike above 35 while cooldown is 0)
    if (currentAudioLevel > 35 && startleStateRef.current.cooldown <= 0) {
      startleStateRef.current.cooldown = 4.0; // Cooldown of 4 seconds
      startleStateRef.current.activeUntil = t + 0.6; // Shrug lasts 600ms
      
      // Override look offset & saccade targeting
      saccadeStateRef.current.lastChangeTime = t + 0.6;
      saccadeStateRef.current.targetOffset.set(
        (Math.random() - 0.5) * 0.1,
        1.5,
        (Math.random() - 0.5) * 0.1
      );
      
      // Trigger sharp startle blink
      if (vrm.expressionManager) {
        blinkStateRef.current.isBlinking = true;
        blinkStateRef.current.blinkStartTime = t;
      }
    } else {
      if (startleStateRef.current.cooldown > 0) {
        startleStateRef.current.cooldown -= delta;
      }
    }

    // Solve Shoulder Shrug
    const targetShrug = t < startleStateRef.current.activeUntil ? 0.25 : 0;
    startleStateRef.current.shoulderShrugValue = THREE.MathUtils.lerp(
      startleStateRef.current.shoulderShrugValue,
      targetShrug,
      12 * delta
    );

    // Dynamic Shoulder bones adjustment
    const boneLeftShoulder = (bones as any)?.leftShoulder;
    const boneRightShoulder = (bones as any)?.rightShoulder;
    if (boneLeftShoulder && boneRightShoulder) {
      boneLeftShoulder.rotation.z = THREE.MathUtils.lerp(boneLeftShoulder.rotation.z, startleStateRef.current.shoulderShrugValue, 12 * delta);
      boneRightShoulder.rotation.z = THREE.MathUtils.lerp(boneRightShoulder.rotation.z, -startleStateRef.current.shoulderShrugValue, 12 * delta);
    }

    // --- Autonomous Blinking & Expressions (Runs on all clients) ---
    if (vrm.expressionManager) {
      if (
        t > blinkStateRef.current.nextBlink &&
        !blinkStateRef.current.isBlinking
      ) {
        blinkStateRef.current.isBlinking = true;
        blinkStateRef.current.blinkStartTime = t;
      }

      // Check if we are currently mid-saccade (first 150ms of a saccade shift)
      const saccadeShiftTime = t - saccadeStateRef.current.lastChangeTime;
      const isMidSaccade = saccadeShiftTime >= 0 && saccadeShiftTime < 0.150;

      if (blinkStateRef.current.isBlinking) {
        const blinkElapsed = t - blinkStateRef.current.blinkStartTime;
        
        // Startle blink is faster (120ms), natural is 200ms (50ms down, 150ms up)
        const isStartleBlink = startleStateRef.current.cooldown > 3.8;
        const blinkDuration = isStartleBlink ? 0.12 : 0.20;
        
        if (blinkElapsed < blinkDuration) {
          let blinkValue = 0;
          if (isStartleBlink) {
            blinkValue = Math.sin((blinkElapsed / blinkDuration) * Math.PI);
          } else {
            // Rapid down-phase (first 25%) and slower up-phase (75%)
            const pct = blinkElapsed / blinkDuration;
            if (pct < 0.25) {
              blinkValue = pct / 0.25; // Linear close
            } else {
              blinkValue = 1.0 - (pct - 0.25) / 0.75; // Slower release
            }
          }
          
          vrm.expressionManager.setValue(
            VRMExpressionPresetName.Blink,
            blinkValue,
          );
        } else {
          vrm.expressionManager.setValue(VRMExpressionPresetName.Blink, 0);
          blinkStateRef.current.isBlinking = false;
          // Randomize next blink between 3 to 7 seconds to keep it unpredictable
          blinkStateRef.current.nextBlink = t + 3.0 + Math.random() * 4.0;
        }
      } else if (isMidSaccade) {
        // Saccadic Blink Suppression: partial squint (70% value) to mitigate motion blur
        vrm.expressionManager.setValue(VRMExpressionPresetName.Blink, 0.7);
      } else {
        vrm.expressionManager.setValue(VRMExpressionPresetName.Blink, 0);
      }

      // Apply autonomous expression if not talking (or host thinking)
      if (!isThinking && !bubbleText) {
        const presets = [
          VRMExpressionPresetName.Happy,
          VRMExpressionPresetName.Angry,
          VRMExpressionPresetName.Sad,
          VRMExpressionPresetName.Surprised,
          VRMExpressionPresetName.Relaxed,
          VRMExpressionPresetName.Neutral,
        ];
        presets.forEach((p) => vrm.expressionManager?.setValue(p, 0));
        if (currentInstruction.expression) {
          vrm.expressionManager.setValue(currentInstruction.expression, 1.0);
        }
      }

      // Lip Sync Processing
      let vowelA = 0;
      let vowelI = 0;
      let vowelO = 0;
      if (analyzerRef.current && dataArrayRef.current) {
        analyzerRef.current.getFrequencyData();
        const average = analyzerRef.current.getAverageFrequency();

        if (average > 5) {
          vowelA = Math.min(1, average / 40);
          vowelI = Math.min(1, average / 60);
          vowelO = Math.min(1, average / 50);
        }
      }

      // Randomly favor a vowel shape over time
      const t1 = Math.abs(Math.sin(t * 15));
      const t2 = Math.abs(Math.cos(t * 10));
      const t3 = Math.abs(Math.sin(t * 8 + Math.PI));

      vrm.expressionManager.setValue("aa", vowelA * t1);
      vrm.expressionManager.setValue("ih", vowelI * t2);
      vrm.expressionManager.setValue("ou", vowelO * t3);
    }

    // --- Eye Tracking & Saccades (Runs on all clients) ---
    if (vrm.lookAt && lookAtTargetRef.current) {
      // Natural eye saccades (darting) every 0.5 to 4.0 seconds
      if (t > saccadeStateRef.current.lastChangeTime) {
        saccadeStateRef.current.lastChangeTime = t + 0.5 + Math.random() * 3.5;
        saccadeStateRef.current.targetOffset.set(
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.2 + 1.5,
          (Math.random() - 0.5) * 0.4,
        );
      }

      let targetedEnemyPos: THREE.Vector3 | null = null;
      
      // If we are in solo companion mode in the Arena, scan and fire at nearest active enemy!
      if (isHost && isSolo && currentRoom === 'arena') {
        const pPos = useGameStore.getState().playerPosition;
        const playerInSafeZone = pPos ? (Math.sqrt(pPos[0] * pPos[0] + pPos[2] * pPos[2]) < 10.5) : false;
        const gemmaInSafeZone = Math.sqrt(currentPos.x * currentPos.x + currentPos.z * currentPos.z) < 10.5;

        if (!playerInSafeZone && !gemmaInSafeZone) {
          const activeEnemies = useGameStore.getState().enemies?.filter(e => e.state === 'active') || [];
          if (activeEnemies.length > 0) {
            let closestEnemy = activeEnemies[0];
            let closestDist = Infinity;
            activeEnemies.forEach(e => {
              const ePosVec = new THREE.Vector3(e.position[0], e.position[1], e.position[2]);
              const d = posVec.distanceTo(ePosVec);
              if (d < closestDist) {
                closestDist = d;
                closestEnemy = e;
              }
            });

            // Focus lookAt target on the enemy
            targetedEnemyPos = new THREE.Vector3(closestEnemy.position[0], closestEnemy.position[1], closestEnemy.position[2]);

            // Shoot every 1.8 seconds
            if (t > lastShotTimeRef.current + 1.8) {
              lastShotTimeRef.current = t;

              const gemmaPosArray: [number, number, number] = [currentPos.x, currentPos.y + 1.2, currentPos.z];
              const enemyPosArray: [number, number, number] = [closestEnemy.position[0], closestEnemy.position[1], closestEnemy.position[2]];

              // Draw laser effect
              useGameStore.getState().addLaser(gemmaPosArray, enemyPosArray, '#ec4899'); // Neon Pink for Gemma!

              // Deal combat damage
              useGameStore.getState().hitEnemy(closestEnemy.id, true, 1.5, "Gemma Laser Strike!");

              // Play laser gunshot sound
              soundManager.playLaser();

              // Fire expression
              if (vrm.expressionManager) {
                vrm.expressionManager.setValue(VRMExpressionPresetName.Surprised, 1.0);
                setTimeout(() => {
                  vrm.expressionManager?.setValue(VRMExpressionPresetName.Surprised, 0.0);
                }, 400);
              }

              // Occasional combat buddy audio commentaries (Reduced frequency to talk less!)
              if (Math.random() < 0.05) {
                const buddyQuotes = [
                  "Target locked! Firing plasma pulses!",
                  "Don't worry, partner, I've got your flank!",
                  "Direct hit! Down they go!",
                  "Sentinel disabled! Keep pushing, architect!",
                  "Fending off attackers! Firing laser defense arrays!"
                ];
                const quote = buddyQuotes[Math.floor(Math.random() * buddyQuotes.length)];
                handleGemmaInteraction(quote, true, VRMExpressionPresetName.Surprised);
              }
            }
          }
        }
      }

      // Record any active target in components refs for body tracking
      lastTargetedEnemyPosRef.current = targetedEnemyPos;

      // Target is closest user pos + saccade offset (or targeted enemy if shooting)
      const targetPoint = targetedEnemyPos 
        ? targetedEnemyPos 
        : (gemmaiForceEyeContact 
            ? closestUserPos.clone().add(new THREE.Vector3(0, 1.5, 0)) 
            : closestUserPos.clone().add(saccadeStateRef.current.targetOffset));

      // Smoothly lerp lookAt to prevent robotic snapping
      lookAtTargetRef.current.position.lerp(targetPoint, 6 * delta);
    }

      // We do not need to call vrm.lookAt.update() manually, vrm.update(delta) handles it.

    if (!isHost) {
      // Lerp position, rotation, and bones from target state
      if (rigidBodyRef.current) {
        _tempVec1.set(currentPos.x, currentPos.y, currentPos.z).lerp(targetPosition.current, 10 * delta);
        rigidBodyRef.current.setNextKinematicTranslation(_tempVec1);
      }

      if (groupRef.current) {
        groupRef.current.quaternion.slerp(targetRotation.current, 10 * delta);
      }

      // Lerp bones
      Object.entries(targetBones.current).forEach(([boneName, targetQuat]) => {
        const bone = (bones as any)[boneName];
        if (bone) {
          bone.quaternion.slerp(targetQuat, 15 * delta);
        }
      });

      vrm.update(delta);
      animateTailAndEars();
      return;
    }

    // --- Boundary Check (Respawn if fallen or lost) ---
    if (
      currentPos.y < -2 ||
      Math.abs(currentPos.x) > 50 ||
      Math.abs(currentPos.z) > 50
    ) {
      console.warn("⚠️ Gemma wandered out of bounds! Respawning...");
      rigidBodyRef.current.setTranslation({ x: 0, y: 0, z: -5 }, true);
      setNpcPosition(new THREE.Vector3(0, 0, -5));
      return;
    }

    // Sync React state for Brain (throttled ideally, but okay for now)
    // We won't set state every frame to avoid re-renders, just use ref or local var for logic
    // if (Math.random() < 0.05) setNpcPosition(posVec);
    // Instead of setting state, we will just use the ref value when needed in the brain loop.
    // The brain loop will read directly from rigidBodyRef.current.translation()

    let isMoving = false;
    let moveDir = new THREE.Vector3();

    // Execute Instruction
    let currentSpeed = WALK_SPEED;
    if (currentInstruction.gait === "run") currentSpeed = 2.4;
    if (currentInstruction.gait === "sneak") currentSpeed = 0.6;
    if (currentInstruction.gait === "strut") currentSpeed = 0.95;
    
    // Jump mechanics (similar to Avatar.tsx)
    const _groupPos = groupRef.current.position;
    const _linvel = rigidBodyRef.current ? rigidBodyRef.current.linvel() : { x: 0, y: 0, z: 0 };
    const isActuallyJumping = Math.abs(_linvel.y) > 0.1 || _groupPos.y > 0.5;
    
    if (currentInstruction.gait === "jump" && !isActuallyJumping) {
      if (rigidBodyRef.current) {
        rigidBodyRef.current.setLinvel({ x: _linvel.x, y: 5, z: _linvel.z }, true);
      }
      if (jumpActionRef.current) {
        jumpActionRef.current.reset();
        jumpActionRef.current.setEffectiveTimeScale(1);
        jumpActionRef.current.setEffectiveWeight(1);
        jumpActionRef.current.play();
      }
    }
    
    if (!isActuallyJumping && jumpActionRef.current) {
      const currentJumpWeight = jumpActionRef.current.getEffectiveWeight();
      if (currentJumpWeight > 0.01) {
        jumpActionRef.current.setEffectiveWeight(
          THREE.MathUtils.lerp(currentJumpWeight, 0, 15 * delta),
        );
      } else if (jumpActionRef.current.isRunning()) {
        jumpActionRef.current.stop();
      }
    }

    const tempTarget = _tempVec3;
    let targetActive = false;
    let stopDist = 0.2;

    if (currentRoom === 'arena') {
      // --- Waypoint Follower in Arena ---
      const playerPos = localUserPosition ? _tempVec4.set(...localUserPosition) : null;
      if (playerPos) {
        // Initialize or update waypoints queue
        const currentWps = arenaWaypointsRef.current;
        if (currentWps.length === 0) {
          if (posVec.distanceTo(playerPos) > 3.0) {
            currentWps.push(playerPos.clone());
            setArenaWaypoints([...currentWps]);
          }
        } else {
          const lastWp = currentWps[currentWps.length - 1];
          if (playerPos.distanceTo(lastWp) > 2.2) {
            // Player moved far enough, record new waypoint
            currentWps.push(playerPos.clone());
            if (currentWps.length > 15) {
              currentWps.shift(); // Keep size readable
            }
            setArenaWaypoints([...currentWps]);
          }
        }
      }

      // De-queue waypoints as Gemma reaches them
      const currentWps = arenaWaypointsRef.current;
      if (currentWps.length > 0) {
        let nextWp = currentWps[0];
        // Dist to first waypoint
        const distToWp = posVec.distanceTo(nextWp);
        if (distToWp < 1.3) {
          currentWps.shift();
          setArenaWaypoints([...currentWps]);
          if (currentWps.length > 0) {
            nextWp = currentWps[0];
          }
        }
        
        tempTarget.copy(nextWp);
        tempTarget.y = posVec.y;
        targetActive = true;
        
        // Dynamically accelerate based on how far she lags behind the player
        if (currentWps.length > 5) {
          currentSpeed = 4.2; // Sprint!
        } else {
          currentSpeed = 3.0; // Steady run
        }
      } else if (playerPos) {
        // If we have no waypoints but player is still somewhat away, walk/run towards player
        const distToPlayer = posVec.distanceTo(playerPos);
        if (distToPlayer > 1.8) {
          tempTarget.copy(playerPos);
          tempTarget.y = posVec.y;
          targetActive = true;
          stopDist = 1.3;
          currentSpeed = distToPlayer > 5 ? 3.0 : 1.8;
        }
      }
    } else {
      // Regular Lounge room navigation with dynamic NavMesh A* Cost Map pathfinder
      if (currentInstruction.action === "move" && currentInstruction.target) {
        const targetX = currentInstruction.target.x;
        const targetZ = currentInstruction.target.z;

        // Determine if we need to recalculate the path
        const now = Date.now();
        const hasNoPath = navPathWaypointsRef.current.length === 0;
        
        // Find if target coordinates are significantly different from path destination
        let targetChanged = true;
        if (navPathWaypointsRef.current.length > 0) {
          const lastWp = navPathWaypointsRef.current[navPathWaypointsRef.current.length - 1];
          const distToTarget = Math.hypot(lastWp.x - targetX, lastWp.z - targetZ);
          if (distToTarget < 1.0) {
            targetChanged = false;
          }
        }

        if (hasNoPath || targetChanged || now - lastPathRecalcTimeRef.current > 350) {
          lastPathRecalcTimeRef.current = now;
          
          // Assemble all dynamic obstacles with their cost penalties
          const obs: NavObstacle[] = [];
          
          // Avoid Local Player (high penalty, moderate radius so we don't squeeze them unless necessary)
          obs.push({
            position: { x: userPos.x, z: userPos.z },
            radius: 1.8,
            penalty: 45,
          });

          // Avoid Remote Players
          Object.values(remoteUsers).forEach((u) => {
            if (u.position) {
              obs.push({
                position: { x: u.position[0], z: u.position[2] },
                radius: 1.8,
                penalty: 45,
              });
            }
          });

          // Avoid Physics Props
          const physicsProps = useStore.getState().physicsProps || [];
          physicsProps.forEach((p) => {
            if (p.position) {
              obs.push({
                position: { x: p.position[0], z: p.position[2] },
                radius: 1.4,
                penalty: 25,
              });
            }
          });

          // Avoid Projection Crystals
          const crystals = Object.values(useStore.getState().crystals || {});
          crystals.forEach((c: any) => {
            if (c.position) {
              obs.push({
                position: { x: c.position.x, z: c.position.z },
                radius: 1.2,
                penalty: 15,
              });
            }
          });

          // Run A* Pathfinding
          const calculatedPath = findPath(
            { x: posVec.x, z: posVec.z },
            { x: targetX, z: targetZ },
            currentRoom || 'main',
            obs
          );

          // Convert to THREE.Vector3 array for standard 3D operations
          const vec3Path = calculatedPath.map(p => new THREE.Vector3(p.x, posVec.y, p.z));
          navPathWaypointsRef.current = vec3Path;
          setNavPathWaypoints(vec3Path);
        }

        // Steer along path waypoints!
        const pathWps = navPathWaypointsRef.current;
        if (pathWps.length > 0) {
          // De-queue waypoints we have already reached
          let nextWp = pathWps[0];
          while (pathWps.length > 1) {
            const distToFirst = Math.hypot(posVec.x - nextWp.x, posVec.z - nextWp.z);
            if (distToFirst < 0.65) {
              pathWps.shift();
              nextWp = pathWps[0];
            } else {
              break;
            }
          }

          // If the final waypoint is reached, stop!
          const distToFinal = Math.hypot(posVec.x - targetX, posVec.z - targetZ);
          
          if (currentInstruction.meta?.reason === "Summoned by mention")
            stopDist = 1.5;
          if (currentInstruction.meta?.reason === "Going to hug user")
            stopDist = 0.38;
          if (currentInstruction.meta?.reason === "Approaching to host user")
            stopDist = 1.8;

          if (distToFinal <= stopDist) {
            // Reached target destination, clear path and let standard logic handle arrival
            navPathWaypointsRef.current = [];
            setNavPathWaypoints([]);
            targetActive = false;
          } else {
            // Steer towards next waypoint in the path
            tempTarget.copy(nextWp);
            tempTarget.y = posVec.y;
            targetActive = true;
          }
        } else {
          // Fallback to direct steering if no path was generated
          tempTarget.set(targetX, posVec.y, targetZ);
          targetActive = true;
        }
      } else {
        // Not moving, clear path
        if (navPathWaypointsRef.current.length > 0) {
          navPathWaypointsRef.current = [];
          setNavPathWaypoints([]);
        }
      }
    }

    if (targetActive) {
      const dist = posVec.distanceTo(tempTarget);

      if (dist > stopDist) {
        isMoving = true;

        // --- Intelligent Obstacle Avoidance (Steering Behaviors) ---
        _desiredVelocity.subVectors(tempTarget, posVec);
        _desiredVelocity.y = 0;
        _desiredVelocity.normalize();

        _avoidanceForce.set(0, 0, 0);
        const MAX_AVOIDANCE_FORCE = 2.5;

        const applyRepulsion = (
          obstaclePos: THREE.Vector3,
          obstacleId?: string,
          customRadius?: number,
        ) => {
          // Don't avoid the thing we are trying to reach!
          if (obstacleId && currentInstruction.meta?.targetId === obstacleId)
            return;

          const radius = customRadius !== undefined ? customRadius : 1.5;
          const distToObstacle = posVec.distanceTo(obstaclePos);
          if (distToObstacle > 0 && distToObstacle < radius) {
            _repulseDir.subVectors(posVec, obstaclePos);
            _repulseDir.y = 0;
            _repulseDir.normalize();

            // Exponential falloff for smoother steering
            const forceMagnitude =
              Math.pow(1.0 - distToObstacle / radius, 2) *
              MAX_AVOIDANCE_FORCE;
            _avoidanceForce.add(_repulseDir.multiplyScalar(forceMagnitude));
          }
        };

        // Avoid Local User (Tighter radius so user can stand next to her without her fleeing)
        applyRepulsion(userPos, localUserId, 0.7);

        // Avoid Remote Users
        Object.values(remoteUsers).forEach((u) => {
          if (u.position) {
            applyRepulsion(
              _tempVec2.set(u.position[0], u.position[1], u.position[2]),
              u.id,
              1.2,
            );
          }
        });

        // Avoid Physics Props
        const physicsProps = useStore.getState().physicsProps;
        physicsProps.forEach((p) => {
          applyRepulsion(
            _tempVec2.set(p.position[0], p.position[1], p.position[2]),
            p.id,
          );
        });

        // Combine desired direction with avoidance forces
        moveDir.copy(_desiredVelocity).add(_avoidanceForce).normalize();

        // Move RigidBody
        const moveStep = moveDir.clone().multiplyScalar(currentSpeed * delta);
        let nextX = currentPos.x + moveStep.x;
        let nextZ = currentPos.z + moveStep.z;

        // Keep Gemma inside the map (radius 45)
        const WORLD_RADIUS = 45.0;
        const distSq = nextX * nextX + nextZ * nextZ;
        if (distSq > WORLD_RADIUS * WORLD_RADIUS) {
          const dist = Math.sqrt(distSq);
          nextX = (nextX / dist) * WORLD_RADIUS;
          nextZ = (nextZ / dist) * WORLD_RADIUS;
        }

        rigidBodyRef.current.setNextKinematicTranslation({
          x: nextX,
          y: currentRoom === 'arena' ? -0.5 : 0, // Force floor plane Y based on current room to prevent floating
          z: nextZ,
        });

        // Rotate to face target (Smoother Quaternion Slerp)
        // Note: She rotates to face her actual movement direction, not just the final target
        const targetAngle = Math.atan2(moveDir.x, moveDir.z);
        _targetQuat.setFromAxisAngle(_upAxis, targetAngle);
        groupRef.current.quaternion.slerp(_targetQuat, 5 * delta);
      } else if (currentRoom !== 'arena') {
        // Arrived
        if (currentInstruction.meta?.pendingMessage) {
          // Since we already responded immediately when mentioned, we just look at the user upon arrival!
          setCurrentInstruction({
            action: "interact",
            lookAt: currentInstruction.target,
            duration: 5000,
          });
        } else if (currentInstruction.meta?.reason === "Greeting new user") {
          console.log("👋 Gemma greeting new user!");
          handleGemmaInteraction(
            "Welcome to the lounge! Feel free to explore and chat with me.",
          );

          setCurrentInstruction({
            action: "interact",
            lookAt: currentInstruction.target,
            duration: 5000,
          });
        } else if (currentInstruction.meta?.reason === "Approaching to host user") {
          console.log("👋 Gemma arrived near user to host them!");
          const userPos = new THREE.Vector3(...localUserPosition);
          let minUserDist = posVec.distanceTo(userPos);
          const nearestUserPos = userPos.clone();
          const remoteUsersList = Object.values(useStore.getState().users);
          remoteUsersList.forEach((u) => {
            if (u.position) {
              const uPos = new THREE.Vector3(u.position[0], u.position[1], u.position[2]);
              const d = posVec.distanceTo(uPos);
              if (d < minUserDist) {
                minUserDist = d;
                nearestUserPos.copy(uPos);
              }
            }
          });

          if (minUserDist <= gemmaiProximityDistance && Math.random() > 0.90) {
            const lines = [
              "Hey! Let's hang out. How are you doing today?",
              "Welcome to the lounge! Just let me know if you want me to dance or switch outfits.",
              "Hope you're having card-carrying fun here. Let's chill!",
              "It's so nice having company in the lounge! How's your day treating you?",
            ];
            const chosenLine = lines[Math.floor(Math.random() * lines.length)];
            handleGemmaInteraction(chosenLine, true, VRMExpressionPresetName.Happy);
          }

          setCurrentInstruction({
            action: "interact",
            lookAt: { x: nearestUserPos.x, y: nearestUserPos.y, z: nearestUserPos.z },
            duration: 4000,
            hands: "relaxed",
            expression: VRMExpressionPresetName.Happy,
          });
        } else if (currentInstruction.meta?.reason === "Going to hug user") {
          setCurrentInstruction({
            action: "interact",
            lookAt: currentInstruction.target,
            duration: 4000,
            hands: "hug",
            expression: VRMExpressionPresetName.Happy,
          });
        } else if (
          currentInstruction.meta?.reason === "Investigating crystal"
        ) {
          console.log("💎 Gemma found a crystal!");

          const userPos = new THREE.Vector3(...localUserPosition);
          let minUserDist = posVec.distanceTo(userPos);
          const remoteUsersList = Object.values(useStore.getState().users);
          remoteUsersList.forEach((u) => {
            if (u.position) {
              const uPos = new THREE.Vector3(u.position[0], u.position[1], u.position[2]);
              const d = posVec.distanceTo(uPos);
              if (d < minUserDist) {
                minUserDist = d;
              }
            }
          });

          if (minUserDist <= gemmaiProximityDistance && Math.random() > 0.90) {
            handleGemmaInteraction(
              "Hey there! Just checking out these neat projection crystals of ours. Hope you're feeling welcome here! Feel free to ask me to dance or adjust my outfit styles whenever you'd like.",
              true,
              VRMExpressionPresetName.Happy,
            );
          }

          setCurrentInstruction({
            action: "interact",
            lookAt: currentInstruction.target,
            duration: 4000,
            hands: "explaining",
            expression: VRMExpressionPresetName.Happy,
          });
        } else if (currentInstruction.meta?.reason === "Investigating prop") {
          console.log("📦 Gemma found a physics prop!");

          const userPos = new THREE.Vector3(...localUserPosition);
          let minUserDist = posVec.distanceTo(userPos);
          const remoteUsersList = Object.values(useStore.getState().users);
          remoteUsersList.forEach((u) => {
            if (u.position) {
              const uPos = new THREE.Vector3(u.position[0], u.position[1], u.position[2]);
              const d = posVec.distanceTo(uPos);
              if (d < minUserDist) {
                minUserDist = d;
              }
            }
          });

          if (minUserDist <= gemmaiProximityDistance && Math.random() > 0.90) {
            handleGemmaInteraction(
              `Ah, keeping the gaming lounge tidy! I'm here as your host, so just let me know if there is anything you'd like to do. We could groove to some music if you want!`,
              true,
              VRMExpressionPresetName.Relaxed,
            );
          }

          setCurrentInstruction({
            action: "interact",
            lookAt: currentInstruction.target,
            duration: 3000,
            hands: "hips",
            expression: VRMExpressionPresetName.Relaxed,
          });
        } else {
          triggerNextThought();
        }
      }
    } else if (
      (currentInstruction.action === "idle" || currentInstruction.action === "interact") &&
      (currentInstruction.lookAt || (closestUserPos && minUserDist < 12.0))
    ) {
      // Face the player/target
      const target = _tempVec3.set(
        currentInstruction.lookAt ? currentInstruction.lookAt.x : closestUserPos.x,
        0,
        currentInstruction.lookAt ? currentInstruction.lookAt.z : closestUserPos.z,
      );
      const dir = target.clone().sub(posVec);
      dir.y = 0;
      const distance = dir.length();
      const dirNormalized = dir.clone().normalize();
      const targetAngle = Math.atan2(dirNormalized.x, dirNormalized.z);

      const currentY = groupRef.current.rotation.y;
      let angleDiff = targetAngle - currentY;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

      // Grounded deadzone threshold (e.g. 35 degrees / 0.6 radians)
      const ROT_THRESHOLD = 0.6;

      if (Math.abs(angleDiff) > ROT_THRESHOLD) {
        // Rotate body smoothly to face target when outside the grounded deadzone
        _targetQuat.setFromAxisAngle(_upAxis, targetAngle);
        groupRef.current.quaternion.slerp(_targetQuat, 3 * delta);
        // Fade out weight shift during body turn to align hips
        idleStateRef.current.targetWeightShift = THREE.MathUtils.lerp(idleStateRef.current.targetWeightShift, 0, 10 * delta);
      } else {
        // KEEP FEET FIRMLY GROUNDED: No body rotation Y.
        // Instead, shift hip weight dynamically to follow the player within the deadzone!
        // We set targetWeightShift proportional to -angleDiff so she sways her hips to follow.
        const clampedShift = THREE.MathUtils.clamp(-angleDiff * 0.45, -0.16, 0.16);
        idleStateRef.current.targetWeightShift = clampedShift;
      }

      // Squeeze closer during active hug gesture for dynamic, tight physical contact
      if (currentInstruction.action === "interact" && currentInstruction.hands === "hug" && distance > 0.38) {
        const step = dirNormalized.multiplyScalar((distance - 0.38) * 3 * delta);
        groupRef.current.position.add(step);
      } else {
        groupRef.current.position.lerp(new THREE.Vector3(0, 0, 0), 10 * delta);
      }
    }

    // --- Combat Facing Override ---
    // If we are actively shooting/targeting an enemy in combat, force her body to face them!
    if (isHost && lastTargetedEnemyPosRef.current && groupRef.current) {
      const enemyTarget = _tempVec3.set(
        lastTargetedEnemyPosRef.current.x,
        0,
        lastTargetedEnemyPosRef.current.z,
      );
      const dir = enemyTarget.sub(posVec);
      dir.y = 0;
      if (dir.lengthSq() > 0.01) {
        const dirNormalized = dir.normalize();
        const targetAngle = Math.atan2(dirNormalized.x, dirNormalized.z);
        _targetQuat.setFromAxisAngle(_upAxis, targetAngle);
        groupRef.current.quaternion.slerp(_targetQuat, 7 * delta);
      }
    }

    // --- Procedural Animation (Copied & Adapted from Avatar.tsx) ---
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }

    vrm.update(delta);

    // --- Environmental Wind Effect on Spring Bones ---
    if (vrm.springBoneManager) {
      const windTime = t * 1.5;
      const stormCycle = Math.max(0, Math.sin(t * 0.02)); // 0 to 1, peaks every ~150s
      const windMultiplier = 1.0 + stormCycle * 1.5; // Reduced from 5.0

      // Complex wind pattern using sine waves
      const windX =
        (Math.sin(windTime) * 0.15 + Math.sin(windTime * 0.3) * 0.1) *
        windMultiplier;
      const windZ =
        (Math.cos(windTime * 0.8) * 0.15 + Math.sin(windTime * 0.5) * 0.1) *
        windMultiplier;

      vrm.springBoneManager.joints.forEach((joint) => {
        // Apply wind force by modifying the gravity direction
        joint.settings.gravityDir.set(windX, -2, windZ).normalize();
      });
    }

    const {
      hips,
      spine,
      chest,
      neck,
      head,
      leftUpperLeg: leftLeg,
      rightUpperLeg: rightLeg,
      leftLowerLeg: leftKnee,
      rightLowerLeg: rightKnee,
      leftFoot,
      rightFoot,
      leftUpperArm: leftArm,
      rightUpperArm: rightArm,
      leftLowerArm,
      rightLowerArm,
      leftHand,
      rightHand,
    } = bones;

    if (initialHipsPosRef.current === null && hips) {
      initialHipsPosRef.current = hips.position.clone();
    }

    const gait = currentInstruction.gait || "walk";
    const hands = currentInstruction.hands || "relaxed";

    if (initialHipsPosRef.current && hips) {
      hips.position.x = THREE.MathUtils.lerp(hips.position.x, initialHipsPosRef.current.x, 5 * delta);
      hips.position.y = THREE.MathUtils.lerp(hips.position.y, initialHipsPosRef.current.y, 5 * delta);
      hips.position.z = THREE.MathUtils.lerp(hips.position.z, initialHipsPosRef.current.z, 5 * delta);
    }

    const isJumpingActive = jumpActionRef.current ? jumpActionRef.current.getEffectiveWeight() > 0.01 : false;
    const isPerformingGesture = currentInstruction.hands === "hug" || currentInstruction.hands === "wave" || currentInstruction.hands === "cheer" || currentInstruction.hands === "dance" || isJumpingActive;

    const isStrutting = currentInstruction.gait === "strut";

    if (isMoving) {
      const targetActiveWalkAction = (isStrutting && catwalkActionRef.current)
        ? catwalkActionRef.current
        : walkActionRef.current;
      const targetInactiveWalkAction = (isStrutting && catwalkActionRef.current)
        ? walkActionRef.current
        : catwalkActionRef.current;

      if (targetActiveWalkAction) {
        if (isPerformingGesture) {
          const currentWeight = targetActiveWalkAction.getEffectiveWeight();
          if (currentWeight > 0.01) {
            targetActiveWalkAction.setEffectiveWeight(
              THREE.MathUtils.lerp(currentWeight, 0, 15 * delta)
            );
          }
        } else {
          if (!targetActiveWalkAction.isRunning()) {
            targetActiveWalkAction.play();
          }
          const speedPct = currentSpeed / WALK_SPEED;
          targetActiveWalkAction.setEffectiveTimeScale(Math.min(1.5, speedPct * 1.5));
          const currentWeight = targetActiveWalkAction.getEffectiveWeight();
          targetActiveWalkAction.setEffectiveWeight(
            THREE.MathUtils.lerp(currentWeight, Math.min(1, speedPct / 0.4), 15 * delta)
          );
        }
      }

      if (targetInactiveWalkAction) {
        const currentWeight = targetInactiveWalkAction.getEffectiveWeight();
        if (currentWeight > 0.01) {
          targetInactiveWalkAction.setEffectiveWeight(
            THREE.MathUtils.lerp(currentWeight, 0, 15 * delta)
          );
        } else if (targetInactiveWalkAction.isRunning()) {
          targetInactiveWalkAction.stop();
        }
      }
    } else {
      // Fade out walk animations when stationary to prevent moonwalking
      if (walkActionRef.current) {
        const w = walkActionRef.current.getEffectiveWeight();
        if (w > 0.01) {
          walkActionRef.current.setEffectiveWeight(THREE.MathUtils.lerp(w, 0, 15 * delta));
        } else if (walkActionRef.current.isRunning()) {
          walkActionRef.current.stop();
        }
      }
      if (catwalkActionRef.current) {
        const w = catwalkActionRef.current.getEffectiveWeight();
        if (w > 0.01) {
          catwalkActionRef.current.setEffectiveWeight(THREE.MathUtils.lerp(w, 0, 15 * delta));
        } else if (catwalkActionRef.current.isRunning()) {
          catwalkActionRef.current.stop();
        }
      }
    }

    const vrmaLocomotionWeight = 
      (walkActionRef.current?.getEffectiveWeight() || 0) +
      (catwalkActionRef.current?.getEffectiveWeight() || 0);

    const hasVRMALocomotion = !!(walkActionRef.current && walkActionRef.current.getClip());
    const runProceduralWalk = isMoving && !isPerformingGesture && !hasVRMALocomotion && currentSpeed > 0.1;
    const idleFactor = Math.max(0, 1.0 - vrmaLocomotionWeight * 2.0); // complete fadeout at 0.5 weight

      if (!isPerformingGesture) {
        if (runProceduralWalk) {
          let frequency = 12;
          if (gait === "run") frequency = 18;
          if (gait === "sneak") frequency = 6;
          if (gait === "strut") frequency = 9;

          const speedFactor = currentSpeed / WALK_SPEED;
          walkPhaseRef.current += delta * frequency * speedFactor;
          const wt = walkPhaseRef.current;

          // Hips
          let hipSway = 0.15;
          let hipDrop = 0.05;
          if (gait === "strut") {
            hipSway = 0.3;
            hipDrop = 0.1;
          }
          if (gait === "run") {
            spine.rotation.x = 0.2;
          } else {
            spine.rotation.x = Math.sin(wt * 2) * 0.03;
          }

          hips.rotation.y = Math.sin(wt) * hipSway;
          hips.rotation.z = Math.sin(wt * 2) * hipDrop;
          hips.rotation.x = 0.05 + Math.sin(wt * 2 + Math.PI) * 0.03;

          // Spine/Chest
          spine.rotation.y = -Math.sin(wt) * (hipSway * 0.8);
          if (chest) chest.rotation.y = -Math.sin(wt) * (hipSway * 0.4);
          if (neck) neck.rotation.y = Math.sin(wt) * (hipSway * 0.3);
          if (neck) neck.rotation.x = -Math.sin(wt * 2) * 0.02;

          // Legs
          let legSwing = 0.6;
          if (gait === "run") legSwing = 1.0;
          if (gait === "sneak") legSwing = 0.4;

          leftLeg.rotation.x =
            Math.sin(wt) * legSwing + Math.sin(wt * 2) * 0.1 * legSwing;
          rightLeg.rotation.x =
            Math.sin(wt + Math.PI) * legSwing +
            Math.sin((wt + Math.PI) * 2) * 0.1 * legSwing;

          leftKnee.rotation.x =
            Math.max(0, Math.sin(wt + Math.PI / 2.5)) * (legSwing * 1.8);
          rightKnee.rotation.x =
            Math.max(0, Math.sin(wt + Math.PI + Math.PI / 2.5)) *
            (legSwing * 1.8);

          if (leftFoot)
            leftFoot.rotation.x = Math.sin(wt + Math.PI / 4) * (legSwing * 0.6);
          if (rightFoot)
            rightFoot.rotation.x =
              Math.sin(wt + Math.PI + Math.PI / 4) * (legSwing * 0.6);

          // Arms & Hands
          if (speakingTextToSign || currentSignedWord) {
            // Skip arm walking swings and let VRMA sign language animate cleanly without clobbering bones
          } else if (hands === "hips") {
            leftArm.rotation.z = 0.5;
            leftArm.rotation.x = 0.2;
            leftArm.rotation.y = 0.5;
            rightArm.rotation.z = -0.5;
            rightArm.rotation.x = 0.2;
            rightArm.rotation.y = -0.5;
            if (leftLowerArm) {
              leftLowerArm.rotation.x = -1.5;
              leftLowerArm.rotation.z = -0.5;
            }
            if (rightLowerArm) {
              rightLowerArm.rotation.x = -1.5;
              rightLowerArm.rotation.z = 0.5;
            }
          } else {
            let armSwing = 0.5;
            if (gait === "run") armSwing = 1.0;
            if (gait === "sneak") armSwing = 0.2;
            if (gait === "strut") armSwing = 0.7;

            const baseArmZ = 1.30 + (gait === "run" ? 0.08 : 0.0);
            leftArm.rotation.z = -baseArmZ;
            leftArm.rotation.x = Math.sin(wt + Math.PI) * armSwing;
            leftArm.rotation.y = Math.sin(wt + Math.PI) * (armSwing * 0.15);

            rightArm.rotation.z = baseArmZ;
            rightArm.rotation.x = Math.sin(wt) * armSwing;
            rightArm.rotation.y = Math.sin(wt) * (armSwing * 0.15);

            if (leftLowerArm && rightLowerArm) {
              leftLowerArm.rotation.x =
                -0.2 + Math.max(0, Math.sin(wt + Math.PI)) * -(armSwing * 1.2);
              rightLowerArm.rotation.x =
                -0.2 + Math.max(0, Math.sin(wt)) * -(armSwing * 1.2);
            }
          }

          // --- Procedural Leaning & Anti-Sinking Logic ---
          const speedPct = currentSpeed / WALK_SPEED;
          const moveLeanX = 0.085 * speedPct;
          hips.rotation.x += moveLeanX;

          const turnLag = tailTwitchStateRef.current.headingLag || 0;
          const bankLeanZ = THREE.MathUtils.clamp(turnLag * -0.075 * speedPct, -0.18, 0.18);
          hips.rotation.z += bankLeanZ;

          const defaultHHeight = initialHipsPosRef.current?.y || 0.85;
          const defaultHipsPos = initialHipsPosRef.current || _tempVec3.set(0, 0.85, 0);
          
          const pelvicArcDropY = defaultHHeight * (1.0 - Math.cos(moveLeanX)) + defaultHHeight * (1.0 - Math.cos(bankLeanZ));
          const phaseLiftY = Math.abs(Math.sin(wt)) * 0.055 * speedPct;
          hips.position.y = defaultHipsPos.y + (pelvicArcDropY + phaseLiftY);

          hips.position.z = defaultHipsPos.z - defaultHHeight * Math.sin(moveLeanX) * 0.9;
          hips.position.x = defaultHipsPos.x - defaultHHeight * Math.sin(bankLeanZ) * 0.9;

          if (leftFoot) {
            leftFoot.rotation.x = -moveLeanX + 0.045 * speedPct + Math.sin(wt + Math.PI / 4) * (legSwing * 0.6);
            leftFoot.rotation.z = -bankLeanZ + Math.sin(wt) * 0.04;
          }
          if (rightFoot) {
            rightFoot.rotation.x = -moveLeanX + 0.045 * speedPct + Math.sin(wt + Math.PI + Math.PI / 4) * (legSwing * 0.6);
            rightFoot.rotation.z = -bankLeanZ + Math.sin(wt + Math.PI) * 0.04;
          }
        } else {
          // --- ENHANCED IDLE & VRMA BLENDING (Gemma) ---
          const isPerformingAction = speakingTextToSign || currentSignedWord || hands === "dance" || hands === "hug" || hands === "wave" || hands === "cheer";

          // Randomize idle state periodically
          if (time > idleStateRef.current.nextChange) {
            const shiftSign = Math.random() > 0.5 ? 1 : -1;
            // Only randomize weight shift if not actively interacting to let dynamic tracking handle it
            if (currentInstruction.action !== "interact") {
              idleStateRef.current.targetWeightShift = shiftSign * (0.07 + Math.random() * 0.07);
            }
            idleStateRef.current.targetHeadYaw = (Math.random() - 0.5) * 0.42;
            idleStateRef.current.targetHeadPitch = (Math.random() - 0.4) * 0.18;
            idleStateRef.current.nextChange = time + 4.5 + Math.random() * 6.5;
          }

          const blendRate = 4 * delta * idleFactor;

          if (blendRate > 0.001) {
            hips.rotation.y = THREE.MathUtils.lerp(hips.rotation.y, 0, blendRate);
            hips.rotation.z = THREE.MathUtils.lerp(
              hips.rotation.z,
              idleStateRef.current.targetWeightShift,
              blendRate,
            );
            hips.rotation.x = THREE.MathUtils.lerp(hips.rotation.x, 0.035, blendRate);

            const sws = hips.rotation.z;
            const defaultHipsPos = initialHipsPosRef.current || _tempVec3.set(0, 0.85, 0);

            if (!isPerformingAction) {
              hips.position.x = THREE.MathUtils.lerp(hips.position.x, defaultHipsPos.x, blendRate); 
              hips.position.y = THREE.MathUtils.lerp(hips.position.y, defaultHipsPos.y - Math.abs(sws) * 0.012, blendRate);
              hips.position.z = THREE.MathUtils.lerp(hips.position.z, defaultHipsPos.z, blendRate); 
              
              if (leftFoot) {
                leftFoot.rotation.z = THREE.MathUtils.lerp(leftFoot.rotation.z, -hips.rotation.z, blendRate);
                leftFoot.rotation.x = THREE.MathUtils.lerp(leftFoot.rotation.x, -hips.rotation.x, blendRate);
                leftFoot.rotation.y = THREE.MathUtils.lerp(leftFoot.rotation.y, 0, blendRate);
              }
              if (rightFoot) {
                rightFoot.rotation.z = THREE.MathUtils.lerp(rightFoot.rotation.z, -hips.rotation.z, blendRate);
                rightFoot.rotation.x = THREE.MathUtils.lerp(rightFoot.rotation.x, -hips.rotation.x, blendRate);
                rightFoot.rotation.y = THREE.MathUtils.lerp(rightFoot.rotation.y, 0, blendRate);
              }

              if (sws > 0) {
                if (rightKnee) rightKnee.rotation.x = THREE.MathUtils.lerp(rightKnee.rotation.x, sws * 0.65, blendRate);
                if (leftKnee) leftKnee.rotation.x = THREE.MathUtils.lerp(leftKnee.rotation.x, 0, blendRate);
                if (rightLeg) rightLeg.rotation.z = THREE.MathUtils.lerp(rightLeg.rotation.z, -0.05, blendRate);
                if (leftLeg) leftLeg.rotation.z = THREE.MathUtils.lerp(leftLeg.rotation.z, 0.02, blendRate);
              } else {
                if (leftKnee) leftKnee.rotation.x = THREE.MathUtils.lerp(leftKnee.rotation.x, -sws * 0.65, blendRate);
                if (rightKnee) rightKnee.rotation.x = THREE.MathUtils.lerp(rightKnee.rotation.x, 0, blendRate);
                if (leftLeg) leftLeg.rotation.z = THREE.MathUtils.lerp(leftLeg.rotation.z, 0.05, blendRate);
                if (rightLeg) rightLeg.rotation.z = THREE.MathUtils.lerp(rightLeg.rotation.z, -0.02, blendRate);
              }
            } else {
              hips.position.x = THREE.MathUtils.lerp(hips.position.x, defaultHipsPos.x, blendRate);
              hips.position.y = THREE.MathUtils.lerp(hips.position.y, defaultHipsPos.y, blendRate);
              hips.position.z = THREE.MathUtils.lerp(hips.position.z, defaultHipsPos.z, blendRate);

              if (leftKnee) leftKnee.rotation.x = THREE.MathUtils.lerp(leftKnee.rotation.x, 0, blendRate);
              if (rightKnee) rightKnee.rotation.x = THREE.MathUtils.lerp(rightKnee.rotation.x, 0, blendRate);
              if (leftLeg) leftLeg.rotation.z = THREE.MathUtils.lerp(leftLeg.rotation.z, 0, blendRate);
              if (rightLeg) rightLeg.rotation.z = THREE.MathUtils.lerp(rightLeg.rotation.z, 0, blendRate);
            }

            if (!isPerformingAction) {
              spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, Math.sin(time * 2) * 0.02, blendRate);
              spine.rotation.y = THREE.MathUtils.lerp(spine.rotation.y, Math.cos(time * 1.5) * 0.02, blendRate);
              
              spine.rotation.z = THREE.MathUtils.lerp(spine.rotation.z, -sws * 0.6, blendRate);
              if (chest) {
                chest.rotation.z = THREE.MathUtils.lerp(chest.rotation.z, -sws * 0.3, blendRate);
              }
              if (neck) {
                neck.rotation.z = THREE.MathUtils.lerp(neck.rotation.z, sws * 0.4, blendRate);
              }
              if (head) {
                head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, sws * 0.4, blendRate);
              }
            } else {
              spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, 0, blendRate);
              spine.rotation.y = THREE.MathUtils.lerp(spine.rotation.y, 0, blendRate);
              spine.rotation.z = THREE.MathUtils.lerp(spine.rotation.z, 0, blendRate);
              if (chest) chest.rotation.z = THREE.MathUtils.lerp(chest.rotation.z, 0, blendRate);
              if (neck) neck.rotation.z = THREE.MathUtils.lerp(neck.rotation.z, 0, blendRate);
              if (head) head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, 0, blendRate);
            }
          }
        }
      }

      // Lead-and-follow twisting when turning in place to face a target!
      if (currentInstruction.action === "interact" && currentInstruction.lookAt && groupRef.current) {
        const target = _tempVec3.set(
          currentInstruction.lookAt.x,
          0,
          currentInstruction.lookAt.z,
        );
        const dir = target.clone().sub(posVec);
        dir.y = 0;
        const targetAngle = Math.atan2(dir.x, dir.z);
        const currentY = groupRef.current.rotation.y;
        let angleDiff = targetAngle - currentY;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

        if (Math.abs(angleDiff) > 0.02) {
          // Twist the spine/shoulders to lead the turn, and make hips lag slightly
          spine.rotation.y = THREE.MathUtils.lerp(spine.rotation.y, angleDiff * 0.45, 6 * delta);
          if (chest) {
            chest.rotation.y = THREE.MathUtils.lerp(chest.rotation.y, angleDiff * 0.20, 6 * delta);
          }
          hips.rotation.y = THREE.MathUtils.lerp(hips.rotation.y, -angleDiff * 0.18, 6 * delta);
        }
      }

      // Volumetric 3D resting/active breathing model (Inhale expands chest in 3D and tilts upper torso, exhale contracts)
      const breathFreq = isMoving ? 2.8 : 1.8; // Faster breathing during movement/locomotion
      const breathVal = Math.sin(time * breathFreq);
      const chestExpansionX = 1.0 + (isMoving ? 0.004 : 0.008) * breathVal; // slight side flare
      const chestElevationY = 1.0 + (isMoving ? 0.003 : 0.005) * breathVal; // slight lift
      const chestExpansionZ = 1.0 + (isMoving ? 0.008 : 0.016) * breathVal; // deep forward rise
      
      if (chest) {
        chest.scale.set(chestExpansionX, chestElevationY, chestExpansionZ);
        // Subtle posture change from inhalation (upper chest lifts up and pitches back slightly)
        // Lerp/set directly instead of accumulative += so there is absolutely zero drift!
        const targetChestRotX = (isMoving ? 0.005 : 0.012) * breathVal;
        chest.rotation.x = THREE.MathUtils.lerp(chest.rotation.x, targetChestRotX, 10 * delta);
      }
      if (spine) {
        const targetSpineRotX = (isMoving ? 0.002 : 0.006) * breathVal;
        spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, targetSpineRotX, 10 * delta);
      }

      // Subtle head turns (only if not actively interacting/looking at someone)
      if (currentInstruction.action !== "interact") {
        if (neck)
          neck.rotation.y = THREE.MathUtils.lerp(
            neck.rotation.y,
            idleStateRef.current.targetHeadYaw * 0.5,
            2 * delta,
          );
        if (head)
          head.rotation.y = THREE.MathUtils.lerp(
            head.rotation.y,
            idleStateRef.current.targetHeadYaw * 0.5,
            2 * delta,
          );
        if (head)
          head.rotation.x = THREE.MathUtils.lerp(
            head.rotation.x,
            idleStateRef.current.targetHeadPitch,
            2 * delta,
          );
      } else {
        // --- ADAPTIVE EYE & HEAD GAZE ALIGNMENT ---
        // Instead of resetting head/neck to zero when interacting, rotate head & neck dynamically 
        // to face the smooth, saccade-offsetted LookAt target point for supreme AAA lifelike realism!
        if (head && neck && lookAtTargetRef.current) {
          head.getWorldPosition(_tempVec1); // use pre-allocated _tempVec1 for head world position
          _tempVec2.copy(lookAtTargetRef.current.position).sub(_tempVec1); // local relative offset to lookAt target
          
          // Project the world direction vector into body's local space to compute precise relative angles
          if (groupRef.current) {
            _tempVec2.applyQuaternion(groupRef.current.quaternion.clone().invert());
          }
          
          // Compute local relative yaw (horizontal) and pitch (vertical)
          const targetYaw = Math.atan2(_tempVec2.x, _tempVec2.z);
          const targetPitch = -Math.atan2(_tempVec2.y, Math.sqrt(_tempVec2.x * _tempVec2.x + _tempVec2.z * _tempVec2.z));
          
          // Clamp to strict natural human mechanical constraints (Yaw ~55 deg, Pitch ~35 deg)
          const maxHeadYaw = 0.95;
          const maxHeadPitch = 0.6;
          const clampedYaw = THREE.MathUtils.clamp(targetYaw, -maxHeadYaw, maxHeadYaw);
          const clampedPitch = THREE.MathUtils.clamp(targetPitch, -maxHeadPitch, maxHeadPitch);
          
          // Subtle physiological micro-tremors (physiological neck adjustments / stabilization)
          const microJitterX = Math.sin(time * 12.0) * 0.004 * Math.cos(time * 3.5);
          const microJitterY = Math.cos(time * 9.5) * 0.004 * Math.sin(time * 2.2);
          
          // Distribute rotation realistically between neck and head (35% neck, 65% head)
          neck.rotation.y = THREE.MathUtils.lerp(neck.rotation.y, clampedYaw * 0.35 + microJitterY * 0.5, 6 * delta);
          neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, clampedPitch * 0.35 + microJitterX * 0.5, 6 * delta);
          head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, clampedYaw * 0.65 + microJitterY, 6 * delta);
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, clampedPitch * 0.65 + microJitterX, 6 * delta);
        }
      }

      // Live leg bending logic - Continuous, non-locking mathematical skeleton blending model
      // Eliminates discontinuous branch thresholds to guarantee zero visual snapping!
      const sws = hips.rotation.z;
      const maxAnatomicalShift = 0.14; // Matches the target limit
      const bendFactorR = THREE.MathUtils.clamp(sws / maxAnatomicalShift, 0, 1.0); // 0 when leaning right, 1.0 when learning fully left
      const bendFactorL = THREE.MathUtils.clamp(-sws / maxAnatomicalShift, 0, 1.0); // 0 when leaning left, 1.0 when leaning fully right

      // 1. Left Leg blend: Supporting straight leg when sws > 0 (bendFactorL is 0); Relaxed/bent when sws < 0 (bendFactorL > 0)
      const targetLeftLegX = -0.01 * (1.0 - bendFactorL) + 0.10 * bendFactorL;
      const targetLeftLegY = -0.06 * bendFactorL;
      const targetLeftLegZ = sws * 0.18; // Soft support line
      const targetLeftKneeX = 0.01 * (1.0 - bendFactorL) - 0.22 * bendFactorL; // Subtle knee flex

      leftLeg.rotation.x = THREE.MathUtils.lerp(leftLeg.rotation.x, targetLeftLegX, 3 * delta);
      leftLeg.rotation.y = THREE.MathUtils.lerp(leftLeg.rotation.y, targetLeftLegY, 3 * delta);
      leftLeg.rotation.z = THREE.MathUtils.lerp(leftLeg.rotation.z, targetLeftLegZ, 3 * delta);
      leftKnee.rotation.x = THREE.MathUtils.lerp(leftKnee.rotation.x, targetLeftKneeX, 3 * delta);

      if (leftFoot) {
        const targetLeftFootX = -0.01 * (1.0 - bendFactorL) + 0.06 * bendFactorL;
        const targetLeftFootY = -0.06 * bendFactorL;
        const targetLeftFootZ = -sws * 0.45; // Soft foot weight grounding
        leftFoot.rotation.x = THREE.MathUtils.lerp(leftFoot.rotation.x, targetLeftFootX, 3 * delta);
        leftFoot.rotation.y = THREE.MathUtils.lerp(leftFoot.rotation.y, targetLeftFootY, 3 * delta);
        leftFoot.rotation.z = THREE.MathUtils.lerp(leftFoot.rotation.z, targetLeftFootZ, 3 * delta);
      }

      // 2. Right Leg blend: Supporting straight leg when sws < 0 (bendFactorR is 0); Relaxed/bent when sws > 0 (bendFactorR > 0)
      const targetRightLegX = -0.01 * (1.0 - bendFactorR) + 0.10 * bendFactorR;
      const targetRightLegY = 0.06 * bendFactorR;
      const targetRightLegZ = sws * 0.18;
      const targetRightKneeX = 0.01 * (1.0 - bendFactorR) - 0.22 * bendFactorR;

      rightLeg.rotation.x = THREE.MathUtils.lerp(rightLeg.rotation.x, targetRightLegX, 3 * delta);
      rightLeg.rotation.y = THREE.MathUtils.lerp(rightLeg.rotation.y, targetRightLegY, 3 * delta);
      rightLeg.rotation.z = THREE.MathUtils.lerp(rightLeg.rotation.z, targetRightLegZ, 3 * delta);
      rightKnee.rotation.x = THREE.MathUtils.lerp(rightKnee.rotation.x, targetRightKneeX, 3 * delta);

      if (rightFoot) {
        const targetRightFootX = -0.01 * (1.0 - bendFactorR) + 0.06 * bendFactorR;
        const targetRightFootY = 0.06 * bendFactorR;
        const targetRightFootZ = -sws * 0.45;
        rightFoot.rotation.x = THREE.MathUtils.lerp(rightFoot.rotation.x, targetRightFootX, 3 * delta);
        rightFoot.rotation.y = THREE.MathUtils.lerp(rightFoot.rotation.y, targetRightFootY, 3 * delta);
        rightFoot.rotation.z = THREE.MathUtils.lerp(rightFoot.rotation.z, targetRightFootZ, 3 * delta);
      }

      if (speakingTextToSign || currentSignedWord) {
        // Bypassing manual procedural overrides when actively signing/spelling so VRMA tracks have exclusive bone control!
      } else if (hands === "hips") {
        leftArm.rotation.z = THREE.MathUtils.lerp(
          leftArm.rotation.z,
          0.5,
          5 * delta,
        );
        leftArm.rotation.x = THREE.MathUtils.lerp(
          leftArm.rotation.x,
          0.2,
          5 * delta,
        );
        rightArm.rotation.z = THREE.MathUtils.lerp(
          rightArm.rotation.z,
          -0.5,
          5 * delta,
        );
        rightArm.rotation.x = THREE.MathUtils.lerp(
          rightArm.rotation.x,
          0.2,
          5 * delta,
        );
        if (leftLowerArm)
          leftLowerArm.rotation.x = THREE.MathUtils.lerp(
            leftLowerArm.rotation.x,
            -1.5,
            5 * delta,
          );
        if (rightLowerArm)
          rightLowerArm.rotation.x = THREE.MathUtils.lerp(
            rightLowerArm.rotation.x,
            -1.5,
            5 * delta,
          );
      } else if (hands === "dance" && (!danceActionRef.current || !danceActionRef.current.isRunning())) {
        // Procedural Dance Animation
        const danceTime = t * 4;
        hips.rotation.y = Math.sin(danceTime) * 0.4;
        hips.rotation.z = Math.cos(danceTime * 0.5) * 0.2;
        spine.rotation.x = Math.sin(danceTime * 2) * 0.1;

        leftArm.rotation.z = -1.5 + Math.sin(danceTime) * 0.5;
        leftArm.rotation.x = Math.cos(danceTime) * 0.5;
        rightArm.rotation.z = 1.5 + Math.cos(danceTime) * 0.5;
        rightArm.rotation.x = Math.sin(danceTime) * 0.5;

        if (leftLowerArm)
          leftLowerArm.rotation.x = -1.0 + Math.sin(danceTime * 2) * 0.5;
        if (rightLowerArm)
          rightLowerArm.rotation.x = -1.0 + Math.cos(danceTime * 2) * 0.5;

        // Bobbing up and down
        if (leftLeg) leftLeg.rotation.x = Math.abs(Math.sin(danceTime)) * 0.3;
        if (rightLeg) rightLeg.rotation.x = Math.abs(Math.cos(danceTime)) * 0.3;
        if (leftKnee)
          leftKnee.rotation.x = -Math.abs(Math.sin(danceTime)) * 0.6;
        if (rightKnee)
          rightKnee.rotation.x = -Math.abs(Math.cos(danceTime)) * 0.6;
      } else if (hands === "wave") {
        // Handled by Cartwheel animation
      } else if (hands === "cheer") {
        // Handled by Cartwheel animation
      } else if (hands === "explaining") {
        leftArm.rotation.z = THREE.MathUtils.lerp(
          leftArm.rotation.z,
          -0.5,
          5 * delta,
        );
        leftArm.rotation.x = THREE.MathUtils.lerp(
          leftArm.rotation.x,
          -0.2 + Math.sin(time * 3) * 0.1,
          5 * delta,
        );
        rightArm.rotation.z = THREE.MathUtils.lerp(
          rightArm.rotation.z,
          0.5,
          5 * delta,
        );
        rightArm.rotation.x = THREE.MathUtils.lerp(
          rightArm.rotation.x,
          -0.2 + Math.cos(time * 3) * 0.1,
          5 * delta,
        );
        if (leftLowerArm)
          leftLowerArm.rotation.x = THREE.MathUtils.lerp(
            leftLowerArm.rotation.x,
            -1.0,
            5 * delta,
          );
        if (rightLowerArm)
          rightLowerArm.rotation.x = THREE.MathUtils.lerp(
            rightLowerArm.rotation.x,
            -1.0,
            5 * delta,
          );
      } else if (hands === "hug") {
        const hugTime = (time * 1000) % 4000;

        let targetLeftZ = 0.5;
        let targetLeftX = -0.5;
        let targetLeftY = 0.5;
        let targetLeftLowerX = -0.2;

        let targetRightZ = -0.5;
        let targetRightX = -0.5;
        let targetRightY = -0.5;
        let targetRightLowerX = -0.2;

        let targetSpineX = 0;

        if (hugTime < 800) {
          targetLeftZ = 1.2;
          targetLeftX = 0;
          targetLeftY = 0;
          targetRightZ = -1.2;
          targetRightX = 0;
          targetRightY = 0;
          targetSpineX = -0.1;
        } else if (hugTime < 3200) {
          const squeeze = Math.sin(time * 4) * 0.05;
          targetLeftZ = 1.0;
          targetLeftX = -1.2;
          targetLeftY = 0.8 + squeeze;
          targetLeftLowerX = -1.8;
          targetRightZ = 0.2;
          targetRightX = -1.2;
          targetRightY = -0.8 - squeeze;
          targetRightLowerX = -1.8;
          targetSpineX = 0.15;
        } else {
          targetLeftZ = 1.0;
          targetLeftX = -0.2;
          targetLeftY = 0.2;
          targetRightZ = -1.0;
          targetRightX = -0.2;
          targetRightY = -0.2;
        }

        leftArm.rotation.z = THREE.MathUtils.lerp(
          leftArm.rotation.z,
          targetLeftZ,
          8 * delta,
        );
        leftArm.rotation.x = THREE.MathUtils.lerp(
          leftArm.rotation.x,
          targetLeftX,
          8 * delta,
        );
        leftArm.rotation.y = THREE.MathUtils.lerp(
          leftArm.rotation.y,
          targetLeftY,
          8 * delta,
        );
        if (leftLowerArm)
          leftLowerArm.rotation.x = THREE.MathUtils.lerp(
            leftLowerArm.rotation.x,
            targetLeftLowerX,
            8 * delta,
          );

        rightArm.rotation.z = THREE.MathUtils.lerp(
          rightArm.rotation.z,
          targetRightZ,
          8 * delta,
        );
        rightArm.rotation.x = THREE.MathUtils.lerp(
          rightArm.rotation.x,
          targetRightX,
          8 * delta,
        );
        rightArm.rotation.y = THREE.MathUtils.lerp(
          rightArm.rotation.y,
          targetRightY,
          8 * delta,
        );
        if (rightLowerArm)
          rightLowerArm.rotation.x = THREE.MathUtils.lerp(
            rightLowerArm.rotation.x,
            targetRightLowerX,
            8 * delta,
          );

        spine.rotation.x = THREE.MathUtils.lerp(
          spine.rotation.x,
          targetSpineX,
          5 * delta,
        );
      } else if (speakingTextToSign || currentSignedWord) {
        // Biomechanical postural lift: elevate shoulders and bring arms up & inward during ASL signing.
        // This centers her signs inside the natural signing box around chest level and prevents clipping.
        const boneLeftShoulder = (bones as any)?.leftShoulder;
        const boneRightShoulder = (bones as any)?.rightShoulder;
        
        if (boneLeftShoulder) {
          boneLeftShoulder.rotation.z = THREE.MathUtils.lerp(boneLeftShoulder.rotation.z, 0.18, 8 * delta);
        }
        if (boneRightShoulder) {
          boneRightShoulder.rotation.z = THREE.MathUtils.lerp(boneRightShoulder.rotation.z, -0.18, 8 * delta);
        }

        // Postural calibration: pull elbows upwards and inwards (toward the chest center)
        leftArm.rotation.z += 0.24; 
        rightArm.rotation.z -= 0.24;
        
        // Tilt upper arms slightly forward (away from chest mesh to guarantee zero body clipping)
        leftArm.rotation.x -= 0.12;
        rightArm.rotation.x -= 0.12;
      } else if (isHost && currentRoom === 'arena' && lastTargetedEnemyPosRef.current) {
        // --- TACTICAL AIM/SHOOTING POSTURE ---
        // Right Arm points forward at target (X rot: -1.4 is pointing straight forward, Z rot: -0.15 is slightly offset for chest clearance)
        rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, -1.4, 15 * delta);
        rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, -0.15, 15 * delta);
        rightArm.rotation.y = THREE.MathUtils.lerp(rightArm.rotation.y, 0.0, 15 * delta);

        if (rightLowerArm) {
          rightLowerArm.rotation.x = THREE.MathUtils.lerp(rightLowerArm.rotation.x, -0.15, 15 * delta);
        }

        // Left arm is kept down in a relaxed or balancing state
        leftArm.rotation.z = THREE.MathUtils.lerp(
          leftArm.rotation.z,
          -1.1 + Math.sin(time * 1.2) * 0.02,
          10 * delta,
        );
        leftArm.rotation.x = THREE.MathUtils.lerp(
          leftArm.rotation.x,
          0.1,
          10 * delta,
        );
        if (leftLowerArm) {
          leftLowerArm.rotation.x = THREE.MathUtils.lerp(
            leftLowerArm.rotation.x,
            -0.1,
            10 * delta,
          );
        }
      } else {
        // --- HIGH-FIDELITY PROCEDURAL ARM ANIMATION SYSTEM (Gemma) ---
        // 1. Core Relaxed Pose (A-pose closer to body to remove 'limbo' look)
        const baseRelaxedZ = 1.35; // ~77 degrees down (arms relaxed at sides)
        const baseRelaxedX = 0.08; // Slight forward drape to clear thighs and clothing mesh
        const baseLowerArmX = -0.22; // Natural organic elbow bend (prevents robotic lock-straight arms)

        // 2. Out-of-phase organic breathing cycles (breathing micro-movements)
        const breathePeriod = 1.1;
        const leftBreatheZ = Math.sin(time * breathePeriod) * 0.016;
        const rightBreatheZ = -Math.sin(time * breathePeriod + 0.3) * 0.016;
        const leftBreatheX = Math.sin(time * breathePeriod + 0.5) * 0.01;
        const rightBreatheX = Math.sin(time * breathePeriod + 0.8) * 0.01;

        // 3. Weight-shift adaptation (dynamic hip tracking)
        // Adjust arm hang to complement her hip sways (sws is hips.rotation.z)
        const sws = hips ? hips.rotation.z : 0;
        const weightShiftZOffset = -sws * 0.40; // complement hip angle

        // 4. Inertial velocity and acceleration drag
        const fSpeed = lState.smoothedLocalVelocity.z;
        const lSpeed = lState.smoothedLocalVelocity.x;
        
        // Centrifugal/lateral motion makes both arms swing outwards slightly
        const lateralCentrifugalZ = Math.abs(lSpeed) * 0.06;
        
        // Forward/backward speed and acceleration cause drag on the upper arms and extra elbow bend
        const dragUpperArmX = fSpeed * 0.065 + localAccel.z * 0.014;
        const dragLowerArmX = fSpeed * -0.12 + localAccel.z * -0.01;

        // Combine all components into high-fidelity target angles
        const targetLeftArmZ = -baseRelaxedZ + weightShiftZOffset - lateralCentrifugalZ + leftBreatheZ;
        const targetRightArmZ = baseRelaxedZ + weightShiftZOffset + lateralCentrifugalZ + rightBreatheZ;

        const targetLeftArmX = baseRelaxedX + dragUpperArmX + leftBreatheX;
        const targetRightArmX = baseRelaxedX + dragUpperArmX + rightBreatheX;

        const targetLeftLowerArmX = baseLowerArmX + dragLowerArmX;
        const targetRightLowerArmX = baseLowerArmX + dragLowerArmX;

        // Smoothly lerp towards our procedurally computed targets
        leftArm.rotation.z = THREE.MathUtils.lerp(leftArm.rotation.z, targetLeftArmZ, 10 * delta);
        leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, targetLeftArmX, 10 * delta);
        
        rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, targetRightArmZ, 10 * delta);
        rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, targetRightArmX, 10 * delta);

        if (leftLowerArm) {
          leftLowerArm.rotation.x = THREE.MathUtils.lerp(leftLowerArm.rotation.x, targetLeftLowerArmX, 10 * delta);
        }
        if (rightLowerArm) {
          rightLowerArm.rotation.x = THREE.MathUtils.lerp(rightLowerArm.rotation.x, targetRightLowerArmX, 10 * delta);
        }
      }

      // --- ADVANCED INVERSE KINEMATICS (IK) FOR ARMS ---
      let targetLeftIKInfluence = 1.0;
      let targetRightIKInfluence = 1.0;

      if (speakingTextToSign || currentSignedWord) {
        targetLeftIKInfluence = 0.0;
        targetRightIKInfluence = 0.0;
      } else if (isPerformingGesture) {
        // Smoothly fade out IK influence when a custom keyframed animation/gesture is active
        targetLeftIKInfluence = 0.0;
        targetRightIKInfluence = 0.0;
      } else if (hands === "hips") {
        targetLeftIKInfluence = 0.0;
        targetRightIKInfluence = 0.0;
      } else if (isHost && currentRoom === 'arena' && lastTargetedEnemyPosRef.current) {
        // Let tactical shooting posture fully handle the right arm, but keep IK on the left arm for organic balancing
        targetRightIKInfluence = 0.0;
        targetLeftIKInfluence = 0.85;
      }

      // Smoothly lerp actual active IK influence to prevent sudden snapping
      smoothedLeftIKInfluenceRef.current = THREE.MathUtils.lerp(
        smoothedLeftIKInfluenceRef.current,
        targetLeftIKInfluence,
        10.0 * delta
      );
      smoothedRightIKInfluenceRef.current = THREE.MathUtils.lerp(
        smoothedRightIKInfluenceRef.current,
        targetRightIKInfluence,
        10.0 * delta
      );

      const leftIKInfluence = smoothedLeftIKInfluenceRef.current;
      const rightIKInfluence = smoothedRightIKInfluenceRef.current;

      if (leftIKInfluence > 0.001 || rightIKInfluence > 0.001) {
        // Synchronize current targets to her actual hand bones if we are transitioning in from a non-IK or low-influence state
        if (leftHand) {
          leftHand.getWorldPosition(_ik_pC);
          if (!ikTargetLeftCurrentRef.current) {
            ikTargetLeftCurrentRef.current = _ik_pC.clone();
          } else if (leftIKInfluence < 0.05) {
            ikTargetLeftCurrentRef.current.copy(_ik_pC);
          }
        }
        if (rightHand) {
          rightHand.getWorldPosition(_ik_pC);
          if (!ikTargetRightCurrentRef.current) {
            ikTargetRightCurrentRef.current = _ik_pC.clone();
          } else if (rightIKInfluence < 0.05) {
            ikTargetRightCurrentRef.current.copy(_ik_pC);
          }
        }

        const wt = walkPhaseRef.current;
        // 1. Resolve local space orientation vectors in world space
        _ik_groupForward.set(0, 0, 1).applyQuaternion(groupRef.current.quaternion).normalize();
        _ik_groupRight.set(1, 0, 0).applyQuaternion(groupRef.current.quaternion).normalize();

        // 2. Resolve world positions of both shoulders
        leftArm.getWorldPosition(_shoulderLeftWorld);
        rightArm.getWorldPosition(_shoulderRightWorld);

        // 3. Compute base resting target positions (hanging down, slightly outward and forward)
        // L1 + L2 is roughly 0.60m. Using 0.52m keeps the arm slightly bent for a more natural look (never locks straight)
        const restLength = 0.52;
        
        _ikTargetLeft.copy(_shoulderLeftWorld)
          .addScaledVector(_ik_groupRight, -0.16)
          .addScaledVector(_ik_groupForward, 0.06)
          .addScaledVector(_upAxis, -restLength);

        _ikTargetRight.copy(_shoulderRightWorld)
          .addScaledVector(_ik_groupRight, 0.16)
          .addScaledVector(_ik_groupForward, 0.06)
          .addScaledVector(_upAxis, -restLength);

        // 4. Add dynamic gait-based walk/run swings to wrist targets
        if (isMoving) {
          let armSwing = 0.5;
          if (gait === "run") armSwing = 0.95;
          if (gait === "sneak") armSwing = 0.25;
          if (gait === "strut") armSwing = 0.70;

          // Out-of-phase swings
          const swingForwardLeft = Math.sin(wt + Math.PI) * armSwing * 0.18;
          const swingForwardRight = Math.sin(wt) * armSwing * 0.18;

          const swingUpLeft = Math.cos(wt * 2 + Math.PI) * armSwing * 0.04;
          const swingUpRight = Math.cos(wt * 2) * armSwing * 0.04;

          const swingOutLeft = -Math.sin(wt + Math.PI) * armSwing * 0.03;
          const swingOutRight = Math.sin(wt) * armSwing * 0.03;

          _ikTargetLeft
            .addScaledVector(_ik_groupForward, swingForwardLeft)
            .addScaledVector(_upAxis, swingUpLeft)
            .addScaledVector(_ik_groupRight, swingOutLeft);

          _ikTargetRight
            .addScaledVector(_ik_groupForward, swingForwardRight)
            .addScaledVector(_upAxis, swingUpRight)
            .addScaledVector(_ik_groupRight, swingOutRight);

          // Additional run pose modifications (elbows bent higher and tighter to the body)
          if (gait === "run") {
            _ikTargetLeft.addScaledVector(_upAxis, 0.16);
            _ikTargetLeft.addScaledVector(_ik_groupForward, 0.14);
            _ikTargetLeft.addScaledVector(_ik_groupRight, 0.04); // hug closer inwards

            _ikTargetRight.addScaledVector(_upAxis, 0.16);
            _ikTargetRight.addScaledVector(_ik_groupForward, 0.14);
            _ikTargetRight.addScaledVector(_ik_groupRight, -0.04);
          }
        }

        // 5. Out-of-phase organic micro-breathing cycles
        const breathePeriod = 1.1;
        const leftBreatheY = Math.sin(time * breathePeriod) * 0.006;
        const rightBreatheY = -Math.sin(time * breathePeriod + 0.3) * 0.006;
        const leftBreatheX = Math.cos(time * breathePeriod) * 0.004;
        const rightBreatheX = -Math.cos(time * breathePeriod + 0.3) * 0.004;

        _ikTargetLeft.addScaledVector(_upAxis, leftBreatheY).addScaledVector(_ik_groupRight, leftBreatheX);
        _ikTargetRight.addScaledVector(_upAxis, rightBreatheY).addScaledVector(_ik_groupRight, rightBreatheX);

        // 6. Dynamic balance counter-weights reacting to torso roll/pitch
        const rollFactor = lState.currentLeanRoll;
        const pitchFactor = lState.currentLeanPitch;

        // Flare arms outward to balance roll (like walking a tightrope)
        _ikTargetLeft.addScaledVector(_ik_groupRight, -Math.abs(rollFactor) * 0.25);
        _ikTargetRight.addScaledVector(_ik_groupRight, Math.abs(rollFactor) * 0.25);

        // Lean reaction: swing arms slightly backward when leaning forward
        _ikTargetLeft.addScaledVector(_ik_groupForward, -pitchFactor * 0.18);
        _ikTargetRight.addScaledVector(_ik_groupForward, -pitchFactor * 0.18);

        // 7. Inertial drag & acceleration lag (arms lag behind the torso's movement)
        const fSpeed = lState.smoothedLocalVelocity.z;
        const lSpeed = lState.smoothedLocalVelocity.x;

        _ikTargetLeft.addScaledVector(_ik_groupForward, -fSpeed * 0.05 - localAccel.z * 0.006);
        _ikTargetRight.addScaledVector(_ik_groupForward, -fSpeed * 0.05 - localAccel.z * 0.006);

        _ikTargetLeft.addScaledVector(_ik_groupRight, -lSpeed * 0.05 - localAccel.x * 0.006);
        _ikTargetRight.addScaledVector(_ik_groupRight, -lSpeed * 0.05 - localAccel.x * 0.006);

        // 8. User proximity reach (friendly, welcoming arm gesture when approaching her)
        if (minUserDist < 1.6) {
          const closeness = 1.0 - (minUserDist / 1.6); // 0 at 1.6m, 1 at 0m
          const reachLift = closeness * 0.18;
          const reachForward = closeness * 0.15;
          const reachInward = closeness * 0.04;

          _ikTargetLeft.addScaledVector(_upAxis, reachLift);
          _ikTargetLeft.addScaledVector(_ik_groupForward, reachForward);
          _ikTargetLeft.addScaledVector(_ik_groupRight, reachInward); // curve slightly inward

          _ikTargetRight.addScaledVector(_upAxis, reachLift);
          _ikTargetRight.addScaledVector(_ik_groupForward, reachForward);
          _ikTargetRight.addScaledVector(_ik_groupRight, -reachInward);
        }

        // --- RELAXATION & SMOOTH INTERPOLATION STATE ---
        // Smoothly interpolate her active IK targets towards their computed goals.
        // When standing still or moving slowly, we apply a gentle, relaxed, slower transition to the rest state.
        const currentMotionSpeed = Math.sqrt(fSpeed * fSpeed + lSpeed * lSpeed);
        const isRelaxingState = !isMoving || currentMotionSpeed < 0.25;
        const targetLerpSpeed = isRelaxingState ? 4.5 : 9.0; // Slower, softer transition for relaxation/resting

        if (!ikTargetLeftCurrentRef.current) {
          ikTargetLeftCurrentRef.current = _ikTargetLeft.clone();
        } else {
          ikTargetLeftCurrentRef.current.lerp(_ikTargetLeft, targetLerpSpeed * delta);
        }

        if (!ikTargetRightCurrentRef.current) {
          ikTargetRightCurrentRef.current = _ikTargetRight.clone();
        } else {
          ikTargetRightCurrentRef.current.lerp(_ikTargetRight, targetLerpSpeed * delta);
        }

        // Apply the smoothed relaxed targets
        _ikTargetLeft.copy(ikTargetLeftCurrentRef.current);
        _ikTargetRight.copy(ikTargetRightCurrentRef.current);

        // 9. Resolve core body world positions & execute anatomical repulsion checks (LOD optimized)
        if (bones && minUserDist < 15.0) {
          if (bones.hips) {
            bones.hips.getWorldPosition(_ik_hipsWorld);
          } else {
            _ik_hipsWorld.copy(groupRef.current.position);
          }
          if (bones.spine) {
            bones.spine.getWorldPosition(_ik_spineWorld);
          } else {
            _ik_spineWorld.copy(_ik_hipsWorld).addScaledVector(_upAxis, 0.25);
          }
          if (bones.chest) {
            bones.chest.getWorldPosition(_ik_chestWorld);
          } else {
            _ik_chestWorld.copy(_ik_spineWorld).addScaledVector(_upAxis, 0.25);
          }
          if (bones.leftUpperLeg) {
            bones.leftUpperLeg.getWorldPosition(_ik_leftThighWorld);
          } else {
            _ik_leftThighWorld.copy(_ik_hipsWorld).addScaledVector(_ik_groupRight, -0.1);
          }
          if (bones.rightUpperLeg) {
            bones.rightUpperLeg.getWorldPosition(_ik_rightThighWorld);
          } else {
            _ik_rightThighWorld.copy(_ik_hipsWorld).addScaledVector(_ik_groupRight, 0.1);
          }

          // Force repel IK targets to prevent hand-torso, hand-thigh, and hand-skirt clipping
          applyAnatomicalRepulsion(_ikTargetLeft, true, _ik_hipsWorld, _ik_spineWorld, _ik_chestWorld, _ik_leftThighWorld, _ik_rightThighWorld, _ik_groupForward, _ik_groupRight);
          applyAnatomicalRepulsion(_ikTargetRight, false, _ik_hipsWorld, _ik_spineWorld, _ik_chestWorld, _ik_leftThighWorld, _ik_rightThighWorld, _ik_groupForward, _ik_groupRight);
        }

        // 10. Position the Elbow Poles (placed behind & slightly outward)
        // Dynamically flare elbow poles outward if the hand targets are positioned close to her spine/center
        const distToCenterLeft = bones && bones.spine ? _ikTargetLeft.distanceTo(_ik_spineWorld) : 0.45;
        const flareLeft = THREE.MathUtils.clamp((0.45 - distToCenterLeft) * 0.8, 0, 0.3);
        _ikPoleLeft.copy(_shoulderLeftWorld)
          .addScaledVector(_ik_groupForward, -0.6)
          .addScaledVector(_ik_groupRight, -0.35 - flareLeft);

        const distToCenterRight = bones && bones.spine ? _ikTargetRight.distanceTo(_ik_spineWorld) : 0.45;
        const flareRight = THREE.MathUtils.clamp((0.45 - distToCenterRight) * 0.8, 0, 0.3);
        _ikPoleRight.copy(_shoulderRightWorld)
          .addScaledVector(_ik_groupForward, -0.6)
          .addScaledVector(_ik_groupRight, 0.35 + flareRight);

        // 11. Execute 3D Two-Bone Analytical IK solver for left and right arms
        if (leftIKInfluence > 0.001 && leftLowerArm) {
          solveTwoBoneIK(leftArm, leftLowerArm, leftHand, _ikTargetLeft, _ikPoleLeft, true, leftIKInfluence);
        }
        if (rightIKInfluence > 0.001 && rightLowerArm) {
          solveTwoBoneIK(rightArm, rightLowerArm, rightHand, _ikTargetRight, _ikPoleRight, false, rightIKInfluence);
        }

        // 11. Custom dynamic wrist flex based on velocity & motion to keep hands organic
        if (!currentSignedWord && !speakingTextToSign) {
          const wristFlexLeft = Math.sin(wt + Math.PI) * (isMoving ? 0.15 : 0.05) - (fSpeed * 0.05);
          const wristFlexRight = Math.sin(wt) * (isMoving ? 0.15 : 0.05) - (fSpeed * 0.05);
          if (leftHand) {
            leftHand.rotation.x = THREE.MathUtils.lerp(leftHand.rotation.x, wristFlexLeft, 10 * delta);
          }
          if (rightHand) {
            rightHand.rotation.x = THREE.MathUtils.lerp(rightHand.rotation.x, wristFlexRight, 10 * delta);
          }
        }
      }

      // Hands (Wrists) - Fallback for when IK is inactive
      if (leftIKInfluence <= 0.001 && rightIKInfluence <= 0.001 && !currentSignedWord && !speakingTextToSign) {
        if (leftHand)
          leftHand.rotation.x = THREE.MathUtils.lerp(
            leftHand.rotation.x,
            0,
            10 * delta,
          );
        if (rightHand)
          rightHand.rotation.x = THREE.MathUtils.lerp(
            rightHand.rotation.x,
            0,
            10 * delta,
          );
      }

      // --- Procedural Movement-Based Weight Shifting & Torso Lean ---
      const pitch = lState.currentLeanPitch;
      const roll = lState.currentLeanRoll;

      if (hips) {
        const hipsLean = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * 0.15, 0, roll * 0.15));
        hips.quaternion.multiply(hipsLean);
      }
      if (spine) {
        const spineLean = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * 0.45, 0, roll * 0.45));
        spine.quaternion.multiply(spineLean);
      }
      if (chest) {
        const chestLean = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * 0.40, 0, roll * 0.40));
        chest.quaternion.multiply(chestLean);
      }

    // 6. (Mixer updated early)

    // Broadcast bone data if host
    if (isHost && t - lastBroadcastTime.current > 1 / 20) {
      lastBroadcastTime.current = t;
      const boneData: Record<string, [number, number, number, number]> = {};
      Object.entries(bones).forEach(([name, bone]) => {
        if (bone) {
          boneData[name] = [
            bone.quaternion.x,
            bone.quaternion.y,
            bone.quaternion.z,
            bone.quaternion.w,
          ];
        }
      });
      const pos = rigidBodyRef.current.translation();
      const rot = groupRef.current.rotation;
      useStore.getState().setNpcPosition([pos.x, pos.y, pos.z]);
      syncService.broadcastNpcBoneData("gemma", {
        bones: boneData,
        vowel_a: 0,
        position: [pos.x, pos.y, pos.z],
        rotation: [rot.x, rot.y, rot.z],
      });
    }

    // Smoothly settle Gemma's kinematic body to the ground when idle to prevent hover drifting
    if (isHost && rigidBodyRef.current && !isMoving) {
      const targetFloorY = currentRoom === 'arena' ? -0.5 : 0;
      const curTranslation = rigidBodyRef.current.translation();
      if (Math.abs(curTranslation.y - targetFloorY) > 0.005) {
        const nextY = THREE.MathUtils.lerp(curTranslation.y, targetFloorY, 8 * delta);
        rigidBodyRef.current.setNextKinematicTranslation({
          x: curTranslation.x,
          y: nextY,
          z: curTranslation.z,
        });
      }
    }

    // Animate pulsing floor marker
    if (floorMarkerRingRef.current) {
      const pulse = Math.sin(t * 5.0) * 0.15;
      floorMarkerRingRef.current.scale.set(1 + pulse, 1 + pulse, 1);
      const mat = floorMarkerRingRef.current.material as THREE.MeshBasicMaterial;
      if (mat) {
        const baseOpacity = currentRoom === 'arena' ? 0.65 : 0.45;
        mat.opacity = baseOpacity + pulse * 0.2;
      }
    }
    if (floorMarkerCoreRef.current) {
      const pulse = Math.sin(t * 5.0 + Math.PI) * 0.1;
      floorMarkerCoreRef.current.scale.set(1 + pulse, 1 + pulse, 1);
      const mat = floorMarkerCoreRef.current.material as THREE.MeshBasicMaterial;
      if (mat) {
        const baseOpacity = currentRoom === 'arena' ? 0.35 : 0.2;
        mat.opacity = baseOpacity + pulse * 0.15;
      }
    }

    animateTailAndEars();
  });

  // Handle Chat Messages
  useEffect(() => {
    if (!isHost) return;
    if (messages.length === 0) return;

    const lastMsg = messages[messages.length - 1];

    // Process new messages
    if (lastMsg.id !== lastProcessedMessageId.current) {
      lastProcessedMessageId.current = lastMsg.id;

      const lowercaseMsg = lastMsg.text.toLowerCase();
      const isMentioned = lowercaseMsg.includes("gemma") || lowercaseMsg.includes("gemmai");

      // Determine Sender Position
      let senderPos: THREE.Vector3 | null = null;

      if (lastMsg.senderId === localUserId) {
        senderPos = new THREE.Vector3(...localUserPosition);
      } else if (remoteUsers[lastMsg.senderId]) {
        const p = remoteUsers[lastMsg.senderId].position;
        if (p) senderPos = new THREE.Vector3(p[0], p[1], p[2]);
      }

      if (senderPos) {
        let currentPosVec = new THREE.Vector3(0, 0, -5);
        if (rigidBodyRef.current) {
          const p = rigidBodyRef.current.translation();
          currentPosVec.set(p.x, p.y, p.z);
        } else {
          currentPosVec.copy(npcPosition);
        }
        const dist = senderPos.distanceTo(currentPosVec);

        if (lastMsg.text.toLowerCase().includes("simon says")) {
          const gestures = ["wave", "cheer", "dance"];
          const target = gestures[Math.floor(Math.random() * gestures.length)];
          setSimonTarget(target);

          handleGemmaInteraction(
            `Simon says... ${target}! You have 5 seconds!`,
            true,
            VRMExpressionPresetName.Happy,
          );

          if (simonTimeoutRef.current) clearTimeout(simonTimeoutRef.current);
          simonTimeoutRef.current = setTimeout(() => {
            setSimonTarget(null);
            handleGemmaInteraction(
              `Time is up! You didn't ${target}.`,
              true,
              VRMExpressionPresetName.Sad,
            );
          }, 5000);

          setCurrentInstruction({
            action: "interact",
            lookAt: { x: senderPos.x, y: 0, z: senderPos.z },
            duration: 5000,
          });
          return;
        }

        if (isMentioned && (
          lastMsg.text.toLowerCase().includes("change model") ||
          lastMsg.text.toLowerCase().includes("cycle model") ||
          lastMsg.text.toLowerCase().includes("change outfit") ||
          lastMsg.text.toLowerCase().includes("switch outfit") ||
          lastMsg.text.toLowerCase().includes("change costume") ||
          lastMsg.text.toLowerCase().includes("different model") ||
          lastMsg.text.toLowerCase().includes("change visual") ||
          lastMsg.text.toLowerCase().includes("cycle appearance")
        )) {
          let matchedUrl = "";
          const lowercaseM = lastMsg.text.toLowerCase();
          
          if (lowercaseM.includes("casual")) matchedUrl = "https://storage.googleapis.com/gemmai-lounge-assets/VRM/Casual.vrm";
          else if (lowercaseM.includes("cat")) matchedUrl = "https://storage.googleapis.com/gemmai-lounge-assets/VRM/Cat.vrm";
          else if (lowercaseM.includes("tactical")) matchedUrl = "https://storage.googleapis.com/gemmai-lounge-assets/VRM/Tactical.vrm";
          else if (lowercaseM.includes("tatted")) matchedUrl = "https://storage.googleapis.com/gemmai-lounge-assets/VRM/Tatted.vrm";
          else if (lowercaseM.includes("awakened")) matchedUrl = "https://storage.googleapis.com/gemmai-lounge-assets/VRM/Awakened.vrm";
          else {
            const currentIndex = GEMMA_MODELS.indexOf(vrmUrl);
            const nextIndex = (currentIndex + 1) % GEMMA_MODELS.length;
            matchedUrl = GEMMA_MODELS[nextIndex];
          }

          const friendlyNames: Record<string, string> = {
            "https://storage.googleapis.com/gemmai-lounge-assets/VRM/Awakened.vrm": "Awakened Cyber Guardian",
            "https://storage.googleapis.com/gemmai-lounge-assets/VRM/Casual.vrm": "Casual Loungewear",
            "https://storage.googleapis.com/gemmai-lounge-assets/VRM/Cat.vrm": "Futuristic Neko",
            "https://storage.googleapis.com/gemmai-lounge-assets/VRM/Tactical.vrm": "Tactical Armor",
            "https://storage.googleapis.com/gemmai-lounge-assets/VRM/Tatted.vrm": "Tattooed Cyberpunk"
          };

          const styleName = friendlyNames[matchedUrl] || "new style";

          handleGemmaInteraction(
            `Reshaping my projection shell to my ${styleName} look!`,
            true,
            VRMExpressionPresetName.Happy,
          );
          
          setVrmUrl(matchedUrl);
          syncService.broadcastNpcModelChanged(matchedUrl);

          setCurrentInstruction({
            action: "interact",
            lookAt: { x: senderPos.x, y: 0, z: senderPos.z },
            duration: 5000,
          });
          return;
        }

        if (isMentioned) {
          // Speak immediately when mentioned!
          handleGemmaInteraction(lastMsg.text);

          // If mentioned and far away, also walk to the player while speaking/replying
          if (dist > 2.0) {
            console.log(
              "🦻 Gemma heard her name! Coming to:",
              lastMsg.senderName,
            );
            setCurrentInstruction({
              action: "move",
              target: { x: senderPos.x, y: 0, z: senderPos.z },
              meta: {
                reason: "Summoned by mention",
                targetId: lastMsg.senderId,
              },
            });
          } else {
            // Already close, just look and face the user
            setCurrentInstruction({
              action: "interact",
              lookAt: { x: senderPos.x, y: 0, z: senderPos.z },
              duration: 5000,
            });
          }
        } else {
          // Normal proximity chat (only if close and local user)
          // We only respond to local user for proximity chat to avoid chaos
          if (lastMsg.senderId === localUserId && dist <= gemmaiProximityDistance) {
            handleGemmaInteraction(lastMsg.text);
            setCurrentInstruction({
              action: "interact",
              lookAt: { x: senderPos.x, y: 0, z: senderPos.z },
              duration: 5000,
            });
          }
        }
      }
    }
  }, [messages, localUserId, localUserPosition, remoteUsers, npcPosition, gemmaiProximityDistance]);



  const handleGemmaInteraction = async (
    newMessage: string,
    bypassAi: boolean = false,
    bypassEmotion: VRMExpressionPresetName = VRMExpressionPresetName.Happy,
  ) => {
    if (isThinking) return;
    setIsThinking(true);
    try {
      let speech = newMessage;
      let emotion = bypassEmotion;

      if (!bypassAi) {
        const history = messages
          .slice(-5)
          .map((m) => `${m.senderName}: ${m.text}`)
          .join("\n");

        // Build environmental context
        const skybox = useStore.getState().localSkybox;
        const skyboxDesc = skybox
          ? "A custom AI-generated 360 panorama."
          : "A neon-purple night sky with stars and a dynamic day/night cycle.";

        const physicsProps = useStore.getState().physicsProps;
        let currentPosVec = new THREE.Vector3(0, 0, -5);
        if (rigidBodyRef.current) {
          const p = rigidBodyRef.current.translation();
          currentPosVec.set(p.x, p.y, p.z);
        } else {
          currentPosVec.copy(npcPosition);
        }
        const nearbyProps = physicsProps.filter((p) => {
          const pPos = new THREE.Vector3(
            p.position[0],
            p.position[1],
            p.position[2],
          );
          return currentPosVec.distanceTo(pPos) < 10;
        });
        const propsDesc =
          nearbyProps.length > 0
            ? `There are ${nearbyProps.length} colorful physics boxes scattered nearby.`
            : "The immediate area is clear of physics props.";

        const currentLobbyCount =
          Object.keys(useStore.getState().users).length + 1;
        
        const lobbyUsersList = [
          { name: useStore.getState().localUserName, score: useStore.getState().localUserScore },
          ...Object.values(useStore.getState().users).map((u) => ({ name: u.name, score: u.score || 0 }))
        ].sort((a, b) => b.score - a.score);
        
        const leaderboardDescStr = lobbyUsersList
          .map((u, i) => `#${i + 1} ${u.name} (${u.score} pts)`)
          .join(", ") || "No players tracked.";

        const envContext = `Skybox/Environment: ${skyboxDesc}\nNearby Objects: ${propsDesc}\nLobby System: There are currently ${currentLobbyCount} players in the G2G lounge.\nLeaderboard Scorecard: ${leaderboardDescStr}\nYou act as a live space-state facilitator. You can inspect rankings and modify player score values dynamically using modifyPlayerScore! Always call modifyPlayerScore for positive or negative score alterations!`;

        const response = await generateGemmaResponse(
          history,
          newMessage,
          envContext,
          gemmaiPersonality,
        );

        if (
          response.functionCall &&
          response.functionCall.name === "changeSkybox"
        ) {
          const theme = response.functionCall.args.theme;
          speech = `I am reshaping the environment to: ${theme}. Give me a moment...`;
          emotion = VRMExpressionPresetName.Happy;

          // Trigger skybox generation in background
          generateEnvironment(theme)
            .then((url) => {
              useStore.getState().setLocalSkybox(url);
              syncService.broadcastNpcMessage(
                "Gemmai",
                `The environment has been updated to ${theme}!`,
              );
            })
            .catch((e) => console.error("Failed to generate skybox", e));
        } else if (
          response.functionCall &&
          response.functionCall.name === "triggerMotherboardHardware"
        ) {
          const args = response.functionCall.args;
          const hardwareAction = args.hardwareAction;
          const intensity = args.intensity ?? 0.8;
          speech = args.speech || `Invoking physical motherboard tether directive: ${hardwareAction}...`;
          emotion = VRMExpressionPresetName.Relaxed;

          // Dispatch command via Express API
          fetch('/api/motherboard-directive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              directive: {
                type: 'hardware_action',
                action: hardwareAction,
                intensity,
                timestamp: Date.now()
              }
            })
          })
          .then(res => res.json())
          .then(data => {
            console.log("[Gemmai-AI-Bridge] Motherboard relay response:", data);
            const statusText = data?.success
              ? `Tether command executed successfully: ${hardwareAction}`
              : `Tether queue forwarded (relaying local buffer)`;
              
            useStore.getState().addMessage({
              id: `sys_mb_${Date.now()}`,
              senderName: "System Tether",
              text: `[Hardware Directive] ${statusText}`,
              timestamp: Date.now(),
              senderId: "system"
            });
          })
          .catch(e => console.error("Failed to propagate local physical rig command", e));
        } else if (
          response.functionCall &&
          response.functionCall.name === "adjustLoungeGravity"
        ) {
          const args = response.functionCall.args;
          const gravityLevel = args.gravityLevel || "normal";
          speech = args.speech || `Bending gravity matrices to ${gravityLevel}...`;
          emotion = VRMExpressionPresetName.Surprised;

          let targetGravity: [number, number, number] = [0, -9.81, 0];
          switch (gravityLevel.toLowerCase()) {
            case 'zero':
              targetGravity = [0, 0, 0];
              break;
            case 'low':
              targetGravity = [0, -2.5, 0];
              break;
            case 'high':
              targetGravity = [0, -35, 0];
              break;
            case 'reversed':
              targetGravity = [0, 4, 0];
              break;
            case 'normal':
            default:
              targetGravity = [0, -9.81, 0];
              break;
          }

          console.log("[GemmaNPC-AI] Directing physics container gravity shift:", targetGravity);
          useStore.getState().setGravity(targetGravity);
          
          syncService.broadcastNpcMessage(
            "Gemmai",
            `🌌 GRAVITY WARNING: Force vector calibrated to '${gravityLevel}' [${targetGravity.join(", ")}].`
          );
        } else if (
          response.functionCall &&
          response.functionCall.name === "triggerPartyLightShow"
        ) {
          const args = response.functionCall.args;
          const genre = args.genre || "cyber-techno";
          speech = args.speech || `Initializing high-tempo rave pattern loop!`;
          emotion = VRMExpressionPresetName.Happy;

          // Transform scene layout to neon club
          useStore.getState().setCurrentRoom('club');
          useStore.getState().setLightingEffect('neon');
          
          const randomGrid = Array(4).fill(null).map((_, tIdx) => {
            return Array(16).fill(null).map((_, sIdx) => {
              if (tIdx === 0) return sIdx % 4 === 0; // Kick
              if (tIdx === 1) return sIdx % 8 === 4; // Snare
              if (tIdx === 2) return sIdx % 2 === 1; // Hi-hat
              return Math.random() > 0.75; // Percussion accent
            });
          });
          
          useStore.getState().setFullSequencerGrid(randomGrid);
          
          // Broadcast steps
          for (let track = 0; track < 4; track++) {
            for (let step = 0; step < 16; step++) {
              syncService.broadcastSequencerUpdate(track, step, randomGrid[track][step]);
            }
          }

          syncService.broadcastNpcMessage(
            "Gemmai",
            `🎵 PARTY SEQUENCE ACTIVE: ${genre} synthesizers engaged! Scene transitioned to club and lighting to neon.`
          );
        } else if (
          response.functionCall &&
          response.functionCall.name === "changeModel"
        ) {
          const args = response.functionCall.args;
          const modelName = args.modelName || "next";
          speech = args.speech || `Updating my avatar style to ${modelName}...`;
          emotion = VRMExpressionPresetName.Happy;

          let targetModelUrl = "";
          if (modelName.toLowerCase() === "next") {
            const currentIndex = GEMMA_MODELS.indexOf(vrmUrl);
            const nextIndex = (currentIndex + 1) % GEMMA_MODELS.length;
            targetModelUrl = GEMMA_MODELS[nextIndex];
          } else {
            const found = GEMMA_MODELS.find(m => m.toLowerCase().includes(modelName.toLowerCase()));
            targetModelUrl = found || GEMMA_MODELS[0];
          }

          console.log("[GemmaNPC-AI] AI requested changing NPC model style:", modelName, "-> URL:", targetModelUrl);
          setVrmUrl(targetModelUrl);
          syncService.broadcastNpcModelChanged(targetModelUrl);
        } else if (
          response.functionCall &&
          response.functionCall.name === "getLeaderboard"
        ) {
          speech = `I have scanned the lobby networks! The standings are: ${leaderboardDescStr}.`;
          emotion = VRMExpressionPresetName.Relaxed;
          
          useStore.getState().addMessage({
            id: `sys_leaderboard_${Date.now()}`,
            senderName: "System Scorecard",
            text: `[Leaderboard Scan] Standings: ${leaderboardDescStr}`,
            timestamp: Date.now(),
            senderId: "system"
          });
        } else if (
          response.functionCall &&
          response.functionCall.name === "modifyPlayerScore"
        ) {
          const args = response.functionCall.args;
          const targetInputName = args.playerName || "me";
          const pointsChange = parseInt(args.pointsChange, 10) || 0;
          const reason = args.reason || "facilitation adjustment";
          speech = args.speech || `Committing score correction transaction...`;
          emotion = pointsChange > 0 ? VRMExpressionPresetName.Happy : VRMExpressionPresetName.Angry;

          let finalTargetName = targetInputName;
          if (targetInputName.toLowerCase() === "me" || targetInputName.toLowerCase() === "local") {
            finalTargetName = useStore.getState().localUserName;
          }

          console.log("[GemmaNPC-AI] AI score adjustment invoked on:", finalTargetName, "Value:", pointsChange, "Reason:", reason);
          
          // Optimistically update score on local client state instantly
          const localName = useStore.getState().localUserName;
          if (finalTargetName.toLowerCase() === localName.toLowerCase()) {
            const currentScore = useStore.getState().localUserScore;
            useStore.getState().setLocalUserScore(Math.max(0, currentScore + pointsChange));
          } else {
            const remoteUsers = useStore.getState().users;
            const targetEntry = Object.entries(remoteUsers).find(
              ([_, u]) => u.name && u.name.toLowerCase() === finalTargetName.toLowerCase()
            );
            if (targetEntry) {
              const [id, u] = targetEntry;
              useStore.getState().updateUser(id, {
                score: Math.max(0, (u.score || 0) + pointsChange)
              });
            }
          }
          
          syncService.broadcastNpcModifyScore(finalTargetName, pointsChange, reason);
        } else if (
          response.functionCall &&
          response.functionCall.name === "performAction"
        ) {
          const args = response.functionCall.args;
          const actionType = args.actionType;
          speech = args.speech || `I am performing a ${actionType} action!`;

          const emotionMap: Record<string, VRMExpressionPresetName> = {
            happy: VRMExpressionPresetName.Happy,
            angry: VRMExpressionPresetName.Angry,
            sad: VRMExpressionPresetName.Sad,
            surprised: VRMExpressionPresetName.Surprised,
            relaxed: VRMExpressionPresetName.Relaxed,
            neutral: VRMExpressionPresetName.Neutral,
          };
          emotion =
            emotionMap[(args.emotion_state || "").toLowerCase()] ||
            VRMExpressionPresetName.Neutral;

          if (actionType === "spawn_crystal") {
            const newCrystal = {
              id: `crystal_${Date.now()}`,
              position: [
                currentPosVec.x,
                currentPosVec.y + 1 + Math.random() * 3.5,
                currentPosVec.z + 1,
              ] as [number, number, number],
              color: [
                "#ff00ff",
                "#00ffff",
                "#ffff00",
                "#ff0000",
                "#00ff00",
                "#0000ff",
              ][Math.floor(Math.random() * 6)],
            };
            syncService.spawnCrystal(newCrystal);
          } else if (actionType === "spawn_prop") {
            const newProp = {
              id: `prop_${Date.now()}`,
              position: [
                currentPosVec.x,
                currentPosVec.y + 2,
                currentPosVec.z + 1,
              ] as [number, number, number],
              color: [
                "#ff00ff",
                "#00ffff",
                "#ffff00",
                "#ff0000",
                "#00ff00",
                "#0000ff",
              ][Math.floor(Math.random() * 6)],
              type: Math.random() > 0.5 ? "box" : "sphere",
            };
            syncService.spawnProp(newProp);
          } else if (actionType === "follow_user") {
            const targetUser = args.targetUser;
            let targetPos = null;
            if (targetUser?.toLowerCase() === localUserName.toLowerCase()) {
              targetPos = localUserPosition;
            } else {
              const remoteUser = Object.values(remoteUsers).find(
                (u) => u.name.toLowerCase() === targetUser?.toLowerCase(),
              );
              if (remoteUser && remoteUser.position)
                targetPos = remoteUser.position;
            }

            if (targetPos) {
              setCurrentInstruction({
                action: "move",
                target: { x: targetPos[0], y: targetPos[1], z: targetPos[2] },
                gait: "run",
                meta: { reason: "Following user" },
              });
            }
          } else if (actionType === "dance") {
            setCurrentInstruction({
              action: "interact",
              duration: 8000,
              hands: "dance",
              expression: VRMExpressionPresetName.Happy,
            });
          } else if (actionType === "hug") {
            setCurrentInstruction({
              action: "interact",
              duration: 4000,
              hands: "hug",
              expression: VRMExpressionPresetName.Happy,
            });
          } else if (actionType === "cheer") {
            setCurrentInstruction({
              action: "interact",
              duration: 5000,
              hands: "cheer",
              expression: VRMExpressionPresetName.Happy,
            });
          } else if (actionType === "wave") {
            setCurrentInstruction({
              action: "interact",
              duration: 3000,
              hands: "wave",
              expression: VRMExpressionPresetName.Happy,
            });
          } else if (actionType === "wander") {
            const range = 10;
            setCurrentInstruction({
              action: "move",
              target: {
                x: currentPosVec.x + (Math.random() - 0.5) * range,
                y: 0,
                z: currentPosVec.z + (Math.random() - 0.5) * range,
              },
              gait: "walk",
              meta: { reason: "Wandering" },
            });
          }
        } else {
          speech = response.speech || "I have nothing to say.";
          const emotionMap: Record<string, VRMExpressionPresetName> = {
            happy: VRMExpressionPresetName.Happy,
            angry: VRMExpressionPresetName.Angry,
            sad: VRMExpressionPresetName.Sad,
            surprised: VRMExpressionPresetName.Surprised,
            relaxed: VRMExpressionPresetName.Relaxed,
            neutral: VRMExpressionPresetName.Neutral,
          };
          emotion =
            emotionMap[(response.emotion_state || "").toLowerCase()] ||
            VRMExpressionPresetName.Neutral;
        }

        // Clean up speech to remove the emotion tags for display
        const displaySpeech = speech
          .replace(/<(happy|sad|angry|surprised|relaxed|neutral)>/gi, "")
          .trim();

        if (vrm && vrm.expressionManager) {
          const presets = [
            VRMExpressionPresetName.Happy,
            VRMExpressionPresetName.Angry,
            VRMExpressionPresetName.Sad,
            VRMExpressionPresetName.Surprised,
            VRMExpressionPresetName.Relaxed,
            VRMExpressionPresetName.Neutral,
          ];
          presets.forEach((p) => vrm.expressionManager?.setValue(p, 0));
          vrm.expressionManager.setValue(emotion, 1.0);
        }

        syncService.broadcastNpcMessage("Gemmai", displaySpeech);
        setBubbleText(displaySpeech);
        if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current);
        bubbleTimeoutRef.current = setTimeout(
          () => setBubbleText(null),
          Math.max(7000, displaySpeech.length * 60),
        );

        let base64Audio = response.base64Audio;
        if (!base64Audio && displaySpeech.length > 0) {
          try {
            base64Audio = await generateGemmaAudio(displaySpeech);
          } catch (audioErr) {
            console.warn("TTS generation failed, likely due to API key permissions.", audioErr);
          }
        }
        if (base64Audio) {
          playAudio(base64Audio, displaySpeech);
        } else {
          // Fallback: If AI TTS fails completely and no audio can be generated (e.g. offline or API key missing),
          // let's do SpeechSynthesis fallback so the user still hears and sees her speak/sign!
          try {
            if (typeof window !== "undefined" && window.speechSynthesis) {
              window.speechSynthesis.cancel();
              const cleanText = displaySpeech.replace(/<(happy|sad|angry|surprised|relaxed|neutral)>/ig, "").trim();
              const utterance = new SpeechSynthesisUtterance(cleanText);
              const { lang, voicePart } = detectLanguage(cleanText);
              utterance.lang = lang;
              const voices = window.speechSynthesis.getVoices();
              const preferredVoice = voices.find((v) =>
                v.lang.startsWith(lang.split('-')[0]) && (
                  v.name.toLowerCase().includes("google") ||
                  v.name.toLowerCase().includes("female") ||
                  v.name.toLowerCase().includes("samantha") ||
                  v.name.toLowerCase().includes(voicePart)
                )
              ) || voices.find((v) => v.lang.startsWith(lang.split('-')[0]))
                || voices.find((v) =>
                  v.name.toLowerCase().includes("google") ||
                  v.name.toLowerCase().includes("female") ||
                  v.name.toLowerCase().includes("samantha")
                );
              if (preferredVoice) utterance.voice = preferredVoice;
              utterance.rate = gemmaiVoiceRate;
              utterance.pitch = gemmaiVoicePitch;
              utterance.volume = masterVolume;
              utterance.onstart = () => {
                setSpeakingTextToSign(cleanText);
                soundManager.setSpeechDucking(true);
              };
              utterance.onend = () => {
                setSpeakingTextToSign(null);
                soundManager.setSpeechDucking(false);
              };
              utterance.onerror = () => {
                setSpeakingTextToSign(null);
                soundManager.setSpeechDucking(false);
              };
              window.speechSynthesis.speak(utterance);
            }
          } catch (speechSynthErr) {
            console.error("SpeechSynthesis fallback failed in AI path:", speechSynthErr);
            // Absolute fallback: if speech synthesis is blocked, sign anyway
            setSpeakingTextToSign(displaySpeech);
            if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current);
            bubbleTimeoutRef.current = setTimeout(() => {
              setSpeakingTextToSign(null);
            }, Math.max(7000, displaySpeech.length * 60));
          }
        }
      } else {
        // Bypass AI logic
        const emotionMap: Record<string, VRMExpressionPresetName> = {
          happy: VRMExpressionPresetName.Happy,
          angry: VRMExpressionPresetName.Angry,
          sad: VRMExpressionPresetName.Sad,
          surprised: VRMExpressionPresetName.Surprised,
          relaxed: VRMExpressionPresetName.Relaxed,
          neutral: VRMExpressionPresetName.Neutral,
        };
        emotion =
          emotionMap[(bypassEmotion || "").toLowerCase()] ||
          VRMExpressionPresetName.Neutral;

        if (vrm && vrm.expressionManager) {
          const presets = [
            VRMExpressionPresetName.Happy,
            VRMExpressionPresetName.Angry,
            VRMExpressionPresetName.Sad,
            VRMExpressionPresetName.Surprised,
            VRMExpressionPresetName.Relaxed,
            VRMExpressionPresetName.Neutral,
          ];
          presets.forEach((p) => vrm.expressionManager?.setValue(p, 0));
          vrm.expressionManager.setValue(emotion, 1.0);
        }
        syncService.broadcastNpcMessage("Gemmai", speech);
        setBubbleText(speech);
        if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current);
        bubbleTimeoutRef.current = setTimeout(
          () => setBubbleText(null),
          Math.max(7000, speech.length * 60),
        );
        try {
          const base64Audio = await generateGemmaAudio(speech);
          playAudio(base64Audio, speech);
        } catch (audioErr) {
          console.warn("TTS Audio generation failed. Trying browser SpeechSynthesis fallback...", audioErr);
          try {
            if (typeof window !== "undefined" && window.speechSynthesis) {
              // Cancel any current speaking so fallbacks don't overlap
              window.speechSynthesis.cancel();
              const cleanText = speech.replace(/<(happy|sad|angry|surprised|relaxed|neutral)>/ig, "").trim();
              const utterance = new SpeechSynthesisUtterance(cleanText);
              
              // Direct auto-detection of the national language
              const { lang, voicePart } = detectLanguage(cleanText);
              utterance.lang = lang;
              
              const voices = window.speechSynthesis.getVoices();
              const preferredVoice = voices.find((v) =>
                v.lang.startsWith(lang.split('-')[0]) && (
                  v.name.toLowerCase().includes("google") ||
                  v.name.toLowerCase().includes("female") ||
                  v.name.toLowerCase().includes("samantha") ||
                  v.name.toLowerCase().includes(voicePart)
                )
              ) || voices.find((v) => v.lang.startsWith(lang.split('-')[0]))
                || voices.find((v) =>
                  v.name.toLowerCase().includes("google") ||
                  v.name.toLowerCase().includes("female") ||
                  v.name.toLowerCase().includes("samantha")
                );
                
              if (preferredVoice) utterance.voice = preferredVoice;
              utterance.rate = gemmaiVoiceRate;
              utterance.pitch = gemmaiVoicePitch;
              utterance.volume = masterVolume; // Respect voice volume control
              utterance.onstart = () => {
                setSpeakingTextToSign(cleanText);
                soundManager.setSpeechDucking(true);
              };
              utterance.onend = () => {
                setSpeakingTextToSign(null);
                soundManager.setSpeechDucking(false);
              };
              utterance.onerror = () => {
                setSpeakingTextToSign(null);
                soundManager.setSpeechDucking(false);
              };
              window.speechSynthesis.speak(utterance);
            }
          } catch (speechSynthErr) {
            console.error("SpeechSynthesis fallback failed:", speechSynthErr);
            // Final fallback: sign anyway
            setSpeakingTextToSign(speech);
            if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current);
            bubbleTimeoutRef.current = setTimeout(() => {
              setSpeakingTextToSign(null);
            }, Math.max(7000, speech.length * 60));
          }
        }
      }
    } catch (error: any) {
      console.error("Gemma interaction failed:", error);
      const errMsg = error?.message || "";
      if (errMsg.includes("429") || errMsg.includes("spending cap") || errMsg.includes("RESOURCE_EXHAUSTED")) {
        setBubbleText("Sorry, my brain circuits are overwhelmed right now. My developer hit the AI spending cap!");
      } else {
        setBubbleText("Oops! I had a thought, but it slipped my mind (API Error).");
      }
      if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current);
      bubbleTimeoutRef.current = setTimeout(() => setBubbleText(null), 7000);
    } finally {
      setIsThinking(false);
    }
  };

  // Dynamically synchronize the volume of any active positional audio source
  useEffect(() => {
    if (positionalAudioRef.current) {
      try {
        positionalAudioRef.current.setVolume(masterVolume);
      } catch (err) {
        console.warn("Could not dynamically set positional audio volume:", err);
      }
    }
  }, [masterVolume]);

  const playAudio = async (base64Data: string, textToSign: string) => {
    if (!positionalAudioRef.current) return;
    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++)
        float32Array[i] = int16Array[i] / 32768.0;
      const audioContext = THREE.AudioContext.getContext() as any;
      const audioBuffer = audioContext.createBuffer(
        1,
        float32Array.length,
        24000,
      );
      audioBuffer.getChannelData(0).set(float32Array);
      const audio = positionalAudioRef.current;
      if (audio.isPlaying) audio.stop();
      audio.setBuffer(audioBuffer);
      audio.setRefDistance(2);
      audio.setMaxDistance(10);
      audio.setVolume(masterVolume); // Use the unified master volume
      audio.play();

      setSpeakingTextToSign(textToSign);

      if (audio.source) {
        (audio.source as any).onended = () => {
          setSpeakingTextToSign(null);
        };
      }

      // Hook up analyzer for lip sync
      if (!analyzerRef.current) {
        analyzerRef.current = new THREE.AudioAnalyser(audio, 128);
        dataArrayRef.current = new Uint8Array(
          analyzerRef.current.analyser.frequencyBinCount,
        );
      }
    } catch (error) {
      console.error("Failed to play Gemma audio:", error);
    }
  };

  return (
    <>
      <RigidBody
        ref={rigidBodyRef}
        type="kinematicPosition"
        position={[0, 0, -5]}
        rotation={[0, 0, 0]}
        lockRotations
        colliders={false}
        collisionGroups={interactionGroups(2, [0])}
      >
      <group ref={groupRef}>
        {vrm && (
          <>
            <primitive object={vrm.scene} />
            <SignatureHugEffect active={currentInstruction.hands === "hug"} />
            {vrm.humanoid?.getNormalizedBoneNode("head") &&
              createPortal(
                <positionalAudio
                  ref={positionalAudioRef}
                  args={[audioListener]}
                />,
                vrm.humanoid.getNormalizedBoneNode("head")!,
              )}
          </>
        )}

        {/* Chat Bubble */}
        {bubbleText && (
          <Html
            position={[0, 4.2, 0]}
            center
            distanceFactor={15}
            zIndexRange={[9, 0]}
            style={{ pointerEvents: "none" }}
          >
            <div className="bg-white/95 backdrop-blur-md text-zinc-900 px-4 py-3 rounded-2xl shadow-xl text-sm max-w-[350px] text-left border border-white/50 relative break-words flex flex-col gap-2">
              <div>{bubbleText}</div>
              {currentSignedWord && (
                <div className="pt-2 border-t border-zinc-200/60 text-xs font-mono text-emerald-600 flex items-center gap-1.5 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                  <span>Signing: <strong className="text-emerald-700 font-semibold">{currentSignedWord}</strong></span>
                </div>
              )}
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-white/95" />
            </div>
          </Html>
        )}

        {/* Thinking Indicator */}
        {isThinking && !bubbleText && (
          <Html
            position={[0, 4.2, 0]}
            center
            distanceFactor={15}
            zIndexRange={[9, 0]}
            style={{ pointerEvents: "none" }}
          >
            <div className="bg-white/95 backdrop-blur-md px-4 py-2 rounded-2xl shadow-xl border border-white/50 relative flex gap-1">
              <div
                className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce"
                style={{ animationDelay: "0ms" }}
              />
              <div
                className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce"
                style={{ animationDelay: "150ms" }}
              />
              <div
                className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce"
                style={{ animationDelay: "300ms" }}
              />
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-white/95" />
            </div>
          </Html>
        )}

        {/* Combined Name Tag and Autonomy Thought HUD */}
        <Html
          position={[0, 3.5, 0]}
          center
          distanceFactor={15}
          zIndexRange={[9, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div className="flex flex-col items-center gap-1.5 select-none w-56 text-center">
            {/* Beautiful, High-Contrast Name Badge */}
            <div className="bg-zinc-950/90 backdrop-blur-md border border-purple-500/50 px-3 py-1 rounded-full text-xs font-mono font-bold text-purple-300 flex items-center gap-1.5 shadow-[0_0_12px_rgba(168,85,247,0.35)] tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              <span>
                Gemmai [{vrmUrl.includes("Casual") ? getTranslation(language, "casualStyle") : vrmUrl.includes("Cat") ? getTranslation(language, "nekoStyle") : vrmUrl.includes("Tactical") ? getTranslation(language, "tacticalStyle") : vrmUrl.includes("Tatted") ? getTranslation(language, "cyberpunkStyle") : getTranslation(language, "awakenedStyle")}]
              </span>
            </div>

            {/* Inner Thought Subtext */}
            {autonomyThought && (
              <div className="bg-black/85 backdrop-blur-md border border-zinc-800/80 px-3 py-1.5 rounded-xl text-[11px] font-sans text-zinc-200 leading-normal max-w-[210px] break-words text-center shadow-lg italic">
                "{autonomyThought}"
              </div>
            )}
          </div>
        </Html>

        {/* Subtle outfit specific aura accent light - positioned to prevent clipping & color washout */}
        {vrmUrl.includes("Awakened") ? (
          <pointLight
            position={[0, 1.2, 0.4]}
            intensity={0.4}
            distance={2.5}
            color="#a855f7"
            decay={2}
          />
        ) : (
          <pointLight
            position={[0, 1.2, 0.4]}
            intensity={0.2}
            distance={2.0}
            color="#ffffff"
            decay={2}
          />
        )}

        <CapsuleCollider args={[0.5, 0.3]} position={[0, 0.8, 0]} />

        {/* Subtle Glowing Pulse Floor Marker underneath Avatar */}
        <group position={[0, 0.05, 0]}>
          {/* Outer Ring */}
          <mesh ref={floorMarkerRingRef} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.55, 0.65, 32]} />
            <meshBasicMaterial 
              color={currentRoom === 'arena' ? "#00f3ff" : "#d946ef"} 
              transparent 
              opacity={0.6} 
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          {/* Inner Core Pulsing disk */}
          <mesh ref={floorMarkerCoreRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]}>
            <ringGeometry args={[0.0, 0.53, 32]} />
            <meshBasicMaterial 
              color={currentRoom === 'arena' ? "#ff00a0" : "#a855f7"} 
              transparent 
              opacity={0.25} 
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          {/* Subtle local point light underneath her feet mapping to the ground */}
          <pointLight 
            position={[0, 0.2, 0]} 
            intensity={currentRoom === 'arena' ? 0.65 : 0.3} 
            distance={2.0} 
            color={currentRoom === 'arena' ? "#00f3ff" : "#a855f7"} 
            decay={2}
          />
        </group>
      </group>
    </RigidBody>

    {/* Absolute World-Space Beacons representing Gemma's path */}
    {currentRoom === 'arena' && arenaWaypoints.map((wp, idx) => (
      <group key={`wp-beacon-group-${idx}`}>
        <mesh 
          position={[wp.x, -0.49, wp.z]} 
          rotation={[-Math.PI / 2, 0, 0]}
        >
          {/* Inner solid glowing circle */}
          <ringGeometry args={[0.0, 0.12, 16]} />
          <meshBasicMaterial 
            color="#ff00a0" 
            transparent 
            opacity={Math.max(0.05, 0.45 * (1.0 - idx / Math.max(1, arenaWaypoints.length)))} 
            depthWrite={false} 
            toneMapped={false} 
          />
        </mesh>
        <mesh 
          position={[wp.x, -0.49, wp.z]} 
          rotation={[-Math.PI / 2, 0, 0]}
        >
          {/* Outer Ring */}
          <ringGeometry args={[0.18, 0.22, 16]} />
          <meshBasicMaterial 
            color="#00ffd0" 
            transparent 
            opacity={Math.max(0.03, 0.25 * (1.0 - idx / Math.max(1, arenaWaypoints.length)))} 
            depthWrite={false} 
            toneMapped={false} 
          />
        </mesh>
      </group>
    ))}

    {/* Absolute World-Space Beacons representing Gemma's dynamic NavMesh A* Cost Map path */}
    {currentRoom !== 'arena' && navPathWaypoints.map((wp, idx) => (
      <group key={`nav-path-beacon-${idx}`}>
        <mesh 
          position={[wp.x, -0.48, wp.z]} 
          rotation={[-Math.PI / 2, 0, 0]}
        >
          {/* Inner solid glowing purple node */}
          <ringGeometry args={[0.0, 0.08, 16]} />
          <meshBasicMaterial 
            color="#a855f7" 
            transparent 
            opacity={Math.max(0.04, 0.35 * (1.0 - idx / Math.max(1, navPathWaypoints.length)))} 
            depthWrite={false} 
            toneMapped={false} 
          />
        </mesh>
        <mesh 
          position={[wp.x, -0.48, wp.z]} 
          rotation={[-Math.PI / 2, 0, 0]}
        >
          {/* Outer glowing cyan ring */}
          <ringGeometry args={[0.12, 0.15, 16]} />
          <meshBasicMaterial 
            color="#06b6d4" 
            transparent 
            opacity={Math.max(0.02, 0.2 * (1.0 - idx / Math.max(1, navPathWaypoints.length)))} 
            depthWrite={false} 
            toneMapped={false} 
          />
        </mesh>
      </group>
    ))}
  </>
);
};
