import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

/**
 * Solves Two-Bone IK analytically.
 * 
 * @param root The root bone (e.g., UpperLeg)
 * @param mid The middle bone (e.g., LowerLeg)
 * @param end The end effector bone (e.g., Foot)
 * @param targetPos The target position in world space
 * @param polePos The pole target position in world space (e.g., in front of the knee)
 */
export function solveTwoBoneIK(
  root: THREE.Object3D,
  mid: THREE.Object3D,
  end: THREE.Object3D,
  targetPos: THREE.Vector3,
  polePos: THREE.Vector3
) {
  if (!root || !mid || !end) return;

  // 1. Get current world positions
  const rootPos = new THREE.Vector3();
  const midPos = new THREE.Vector3();
  const endPos = new THREE.Vector3();
  
  root.getWorldPosition(rootPos);
  mid.getWorldPosition(midPos);
  end.getWorldPosition(endPos);

  // 2. Calculate bone lengths
  // We assume the hierarchy is root -> mid -> end
  const len1 = rootPos.distanceTo(midPos);
  const len2 = midPos.distanceTo(endPos);
  if (len1 < 0.001 || len2 < 0.001) return;
  const totalLen = len1 + len2;

  // 3. Calculate distance to target
  const distToTarget = rootPos.distanceTo(targetPos);
  
  // Clamp target distance to max reach
  // Avoid fully straightening to prevent popping (0.999)
  const reach = Math.min(distToTarget, totalLen * 0.999);
  
  // 4. Calculate the bend angle using Law of Cosines
  // c^2 = a^2 + b^2 - 2ab * cos(C)
  // We want the internal angles of the triangle formed by root, mid, target.
  
  // Angle at Root (alpha)
  const cosAlpha = (len1 * len1 + reach * reach - len2 * len2) / (2 * len1 * reach);
  const alpha = Math.acos(Math.max(-1, Math.min(1, cosAlpha)));
  
  // Angle at Mid (beta) - this is the external bend angle usually
  const cosBeta = (len1 * len1 + len2 * len2 - reach * reach) / (2 * len1 * len2);
  const beta = Math.acos(Math.max(-1, Math.min(1, cosBeta)));
  
  // 5. Orient the Root Bone
  // We need to rotate the root bone such that:
  // a) The mid joint is at the correct angle (alpha) relative to the target vector
  // b) The limb plane aligns with the pole vector
  
  // Vector from Root to Target
  const rootToTargetDist = rootPos.distanceTo(targetPos);
  if (rootToTargetDist < 0.001) return;
  const rootToTarget = new THREE.Vector3().subVectors(targetPos, rootPos).divideScalar(rootToTargetDist);
  
  // Vector from Root to Pole
  const rootToPoleDist = rootPos.distanceTo(polePos);
  if (rootToPoleDist < 0.001) return;
  const rootToPole = new THREE.Vector3().subVectors(polePos, rootPos).divideScalar(rootToPoleDist);
  
  // Calculate the plane normal for the limb (Root, Target, Pole)
  // Normal = (Root->Target) x (Root->Pole)
  const planeNormal = new THREE.Vector3().crossVectors(rootToTarget, rootToPole);
  if (planeNormal.lengthSq() < 0.0001) {
    // Target and Pole are collinear, use a default plane normal (e.g. forward or right)
    planeNormal.set(1, 0, 0); 
  } else {
    planeNormal.normalize();
  }
  
  // Calculate the "Bend Direction" vector (perpendicular to Root->Target, in the plane)
  // This is where the Mid joint should point relative to the Root->Target line
  const bendDir = new THREE.Vector3().crossVectors(planeNormal, rootToTarget).normalize();
  
  // Calculate the Mid joint position in world space
  // MidPos = RootPos + (RootToTarget * cos(alpha) * len1) + (BendDir * sin(alpha) * len1)
  const newMidPos = rootPos.clone()
    .add(rootToTarget.clone().multiplyScalar(Math.cos(alpha) * len1))
    .add(bendDir.clone().multiplyScalar(Math.sin(alpha) * len1));
    
  // 6. Apply Rotations
  
  // --- Root Rotation ---
  // Rotate Root to point to newMidPos
  // We need to know the local "forward" vector of the bone.
  // For VRM:
  // - Legs: -Y is down (towards child)
  // - Arms: +X or -X is towards child
  // Let's deduce it from the initial rest pose or just assume standard VRM T-pose.
  // Actually, a safer way is to use `lookAt` logic but preserve the roll.
  
  // Helper to rotate bone `b` to look at `target` with `up` vector
  // We'll use a helper function that respects the bone's local axis.
  lookAtBone(root, newMidPos, planeNormal);
  
  // --- Mid Rotation ---
  // Rotate Mid to point to targetPos
  lookAtBone(mid, targetPos, planeNormal);
}

/**
 * Rotates a bone to look at a target position in world space.
 * Assumes the bone's "forward" axis is the vector to its child.
 * 
 * @param bone The bone to rotate
 * @param targetWorldPos The target position in world space
 * @param bendNormal The normal vector of the bend plane (optional hint for up vector)
 */
function lookAtBone(bone: THREE.Object3D, targetWorldPos: THREE.Vector3, bendNormal?: THREE.Vector3) {
  const parent = bone.parent;
  if (!parent) return;

  // 1. Determine the bone's local forward axis
  // We assume the child is at (0, length, 0) or similar in local space.
  // Let's find the child to determine the axis.
  const child = bone.children.find(c => c.type === 'Bone') || bone.children[0];
  let localForward = new THREE.Vector3(0, 1, 0); // Default to Y-up
  
  if (child && child.position.lengthSq() > 0.0001) {
    localForward.copy(child.position).normalize();
  }
  
  // 2. Calculate the target rotation in world space
  const boneWorldPos = new THREE.Vector3();
  bone.getWorldPosition(boneWorldPos);
  
  if (targetWorldPos.distanceToSquared(boneWorldPos) < 0.0001) return;
  const targetDir = new THREE.Vector3().subVectors(targetWorldPos, boneWorldPos).normalize();
  
  // 3. Calculate the rotation quaternion
  // We want to rotate `localForward` to align with `targetDir` in world space.
  
  // Current world rotation
  const currentWorldQuat = new THREE.Quaternion();
  bone.getWorldQuaternion(currentWorldQuat);
  
  // Current forward vector in world space
  const currentForward = localForward.clone().applyQuaternion(currentWorldQuat).normalize();
  
  // Rotation needed to align currentForward to targetDir
  const rotQuat = new THREE.Quaternion().setFromUnitVectors(currentForward, targetDir);
  
  // Apply this rotation to the bone's world rotation
  const newWorldQuat = rotQuat.multiply(currentWorldQuat);
  
  // 4. Apply twist/roll constraint if bendNormal is provided
  // We want to align the "up" vector (or right vector) to the plane normal if possible
  if (bendNormal) {
    // This is complex for arbitrary axes.
    // Simplified: Just set the rotation.
  }
  
  // 5. Convert to local space and apply
  const parentWorldQuat = new THREE.Quaternion();
  parent.getWorldQuaternion(parentWorldQuat);
  
  const newLocalQuat = parentWorldQuat.clone().invert().multiply(newWorldQuat);
  bone.quaternion.copy(newLocalQuat);
  
  bone.updateMatrixWorld(true);
}
