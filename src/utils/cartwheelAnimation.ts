import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';

const boneMap: Record<string, string> = {
  'Hips': 'hips',
  'Spine': 'spine',
  'Spine1': 'chest',
  'Spine2': 'upperChest',
  'Spine3': 'upperChest',
  'Neck': 'neck',
  'Head': 'head',
  'LeftShoulder': 'leftShoulder',
  'LeftArm': 'leftUpperArm',
  'LeftForeArm': 'leftLowerArm',
  'LeftHand': 'leftHand',
  'RightShoulder': 'rightShoulder',
  'RightArm': 'rightUpperArm',
  'RightForeArm': 'rightLowerArm',
  'RightHand': 'rightHand',
  'LeftUpLeg': 'leftUpperLeg',
  'LeftLeg': 'leftLowerLeg',
  'LeftFoot': 'leftFoot',
  'LeftToeBase': 'leftToes',
  'RightUpLeg': 'rightUpperLeg',
  'RightLeg': 'rightLowerLeg',
  'RightFoot': 'rightFoot',
  'RightToeBase': 'rightToes',
};

// Retargets a Cartwheel/Mixamo AnimationClip to a VRM model extracting rest poses mathematically
export const retargetClip = (
  clip: THREE.AnimationClip,
  vrm: VRM,
  gltfScene: THREE.Object3D,
  options: { applyAntiClipping?: boolean } = { applyAntiClipping: true }
): THREE.AnimationClip => {
  const tracks: THREE.KeyframeTrack[] = [];

  // 1. Parse the Cartwheel generic GLB scene once to extract its native rest poses.
  const sourceRestQuats: Record<string, THREE.Quaternion> = {};
  const sourceParentWorldQuats: Record<string, THREE.Quaternion> = {};
  
  gltfScene.updateMatrixWorld(true);
  
  gltfScene.traverse((child) => {
    if ((child as any).isBone) {
      sourceRestQuats[child.name] = child.quaternion.clone();
      
      const parentWorld = new THREE.Quaternion();
      if (child.parent && (child.parent as any).isBone) {
        child.parent.getWorldQuaternion(parentWorld);
      } else {
        // If no bone parent, the world quat is the orientation of the armature
        if (child.parent) {
          child.parent.getWorldQuaternion(parentWorld);
        }
      }
      sourceParentWorldQuats[child.name] = parentWorld;
    }
  });

  clip.tracks.forEach((track) => {
    const trackSplits = track.name.split('.');
    const nodeName = trackSplits[0];
    const propertyName = trackSplits[1];

    let cleanNodeName = nodeName.replace('mixamorig', '');
    
    if (cleanNodeName === 'Armature' || cleanNodeName === 'Root') {
      cleanNodeName = 'Hips';
    }

    const vrmBoneName = boneMap[cleanNodeName];
    if (!vrmBoneName) return;

    const vrmNode = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName as any);
    if (!vrmNode) return;

    const newTrackName = `${vrmNode.name}.${propertyName}`;

    if (propertyName === 'quaternion') {
      const qValues = new Float32Array(track.values.length);
      const quat = new THREE.Quaternion();
      
      // Get the specific rest pose of this source bone 
      const sourceBoneName = nodeName; 
      const restQuat = sourceRestQuats[sourceBoneName] || new THREE.Quaternion();
      const invRestQuat = restQuat.clone().invert();
      
      const parentWorldQuat = sourceParentWorldQuats[sourceBoneName] || new THREE.Quaternion();
      const invParentWorldQuat = parentWorldQuat.clone().invert();
      
      for (let i = 0; i < track.values.length; i += 4) {
        quat.set(track.values[i], track.values[i + 1], track.values[i + 2], track.values[i + 3]);
        
        // --- UNIVERSAL PURE DELTA EXTRACTION ---
        // 1. Get delta in parent local space: (Q_anim * inv(Q_rest))
        quat.multiply(invRestQuat);
        
        // 2. Transform the delta into World Space (which is VRM Normalized space)
        // D_world = W_parent * D_local * inv(W_parent)
        quat.premultiply(parentWorldQuat).multiply(invParentWorldQuat).normalize();
        
        // --- ANTI-CLIPPING POST-CORRECTION ---
        // VRM avatars often have larger heads or different shoulder widths than generic motion capture data.
        // We apply a slight outward/backward rotation to the shoulders/upper arms.
        if (options.applyAntiClipping) {
          if (vrmBoneName === 'leftShoulder') {
             // Rotate around local Z (which points backward in VRM) to push the arm outwards.
             const offset = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.15); 
             quat.multiply(offset);
          } else if (vrmBoneName === 'rightShoulder') {
             // Rotate around local Z (opposite direction for right arm)
             const offset = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.15); 
             quat.multiply(offset);
          }
        }

        // --- DIRECT HIERARCHICAL ASSIGNMENT ---
        // Pass it directly into the VRM keyframe matrix!
        qValues[i] = quat.x;
        qValues[i + 1] = quat.y;
        qValues[i + 2] = quat.z;
        qValues[i + 3] = quat.w;
      }
      
      tracks.push(new THREE.QuaternionKeyframeTrack(newTrackName, track.times as any, qValues));
    }
  });

  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
};

// Global memory cache for parsed animation GLTFs
const animationCache: Record<string, Promise<any>> = {};

/**
 * Loads a GLTF animation and caches its parsed structure so that subsequent requests
 * resolve instantly from memory, avoiding multiple network downloads.
 */
export const loadCachedAnimation = (url: string, loader: any): Promise<any> => {
  const absoluteUrl = url.startsWith('/') && typeof window !== 'undefined' ? `${window.location.origin}${url}` : url;
  if (!animationCache[url]) {
    animationCache[url] = new Promise((resolve, reject) => {
      loader.load(absoluteUrl, resolve, undefined, reject);
    });
  }
  return animationCache[url];
};

