import React, { useEffect, useRef, useState } from "react";
import { useFrame, createPortal, useThree } from "@react-three/fiber";
import { Text, Html, PositionalAudio } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  VRMLoaderPlugin,
  VRM,
  VRMHumanBoneName,
  VRMUtils,
} from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin, VRMAnimation, createVRMAnimationClip } from "@pixiv/three-vrm-animation";
import { MToonMaterialLoaderPlugin } from '@pixiv/three-vrm-materials-mtoon';
import { MToonNodeMaterial } from '@pixiv/three-vrm-materials-mtoon/nodes';
import {
  RigidBody,
  CapsuleCollider,
  RapierRigidBody,
  interactionGroups,
  useRapier,
} from "@react-three/rapier";
import { useXR, useXRInputSourceState } from "@react-three/xr";
import * as THREE from "three";
import { BoneSyncData, syncService } from "../services/sync";
import { useStore, DEFAULT_VRM_URL } from "../store/useStore";
import { useKeyboard } from "../hooks/useKeyboard";
import { useVoiceBones } from "../hooks/useVoiceBones";
import { solveTwoBoneIK } from "../utils/ik";
import { convertVRMMaterialsForWebGPU, isWebGPURendererActive } from "../utils/renderer";
import { loadVrmaWithCache } from "../utils/vrmaCache";

import { SignatureHugEffect } from "./SignatureHugEffect";


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

function processLocomotionVRMA(
  originalClip: THREE.AnimationClip,
  options: {
    inPlace?: boolean;
    minLoopDuration?: number;
    maxLoopDuration?: number;
    crossfadeDuration?: number;
  } = {}
): THREE.AnimationClip {
  const inPlace = options.inPlace !== false;
  const minLoopDuration = options.minLoopDuration ?? 0.6;
  const maxLoopDuration = options.maxLoopDuration ?? 2.0;
  const crossfadeDuration = options.crossfadeDuration ?? 0.2;

  const totalDuration = originalClip.duration;
  let startTime = 0.0;
  let endTime = totalDuration;

  // Let's scan the timeline to find two frames with the lowest pose difference
  let bestStart = 0.0;
  let bestEnd = totalDuration;
  let minDiff = Infinity;

  // We scan potential startTime from 0 to totalDuration * 0.4
  // and potential endTime from startTime + minLoopDuration to min(totalDuration, startTime + maxLoopDuration)
  const step = 0.05; // 50ms step size for finding loop bounds
  const scanStartEnd = Math.min(totalDuration * 0.4, 1.5);

  for (let tStart = 0.0; tStart <= scanStartEnd; tStart += step) {
    for (let tEnd = tStart + minLoopDuration; tEnd <= Math.min(totalDuration, tStart + maxLoopDuration); tEnd += step) {
      const diff = getPoseDifference(originalClip, tStart, tEnd);
      if (diff < minDiff) {
        minDiff = diff;
        bestStart = tStart;
        bestEnd = tEnd;
      }
    }
  }

  // If we found a valid loop range, use it! Otherwise fallback to full clip.
  if (minDiff < Infinity && (bestEnd - bestStart) >= minLoopDuration) {
    startTime = bestStart;
    endTime = bestEnd;
  }

  const loopDuration = endTime - startTime;
  const fps = 30;
  const resampleDt = 1 / fps;
  const numFrames = Math.round(loopDuration / resampleDt);
  const tracks: THREE.KeyframeTrack[] = [];

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

      // Enforce zero lateral movement on hips for in-place
      if (inPlace && isHipsPosition && val && val.length === 3) {
        val = [0, val[1], 0];
      }

      // Smooth loop crossfade blending over the last part of the cycle
      if (timeOffset > loopDuration - crossfadeDuration && val) {
        const alpha = (timeOffset - (loopDuration - crossfadeDuration)) / crossfadeDuration;
        let valStart = getValueAtTime(track, startTime);
        if (inPlace && isHipsPosition && valStart && valStart.length === 3) {
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

      if (val) {
        for (let k = 0; k < val.length; k++) {
          sampledValues.push(val[k]);
        }
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


interface AvatarProps {
  url: string;
  isLocal?: boolean;
  userId: string;
}

// The main bones we want to sync
const SYNC_BONES = [
  VRMHumanBoneName.Hips,
  VRMHumanBoneName.Spine,
  VRMHumanBoneName.Chest,
  VRMHumanBoneName.UpperChest,
  VRMHumanBoneName.Neck,
  VRMHumanBoneName.Head,
  VRMHumanBoneName.LeftShoulder,
  VRMHumanBoneName.LeftUpperArm,
  VRMHumanBoneName.LeftLowerArm,
  VRMHumanBoneName.LeftHand,
  VRMHumanBoneName.RightShoulder,
  VRMHumanBoneName.RightUpperArm,
  VRMHumanBoneName.RightLowerArm,
  VRMHumanBoneName.RightHand,
  VRMHumanBoneName.LeftUpperLeg,
  VRMHumanBoneName.LeftLowerLeg,
  VRMHumanBoneName.LeftFoot,
  VRMHumanBoneName.LeftToes,
  VRMHumanBoneName.RightUpperLeg,
  VRMHumanBoneName.RightLowerLeg,
  VRMHumanBoneName.RightFoot,
  VRMHumanBoneName.RightToes,
];

// Pre-allocate objects for useFrame to avoid GC spikes
const _moveDir = new THREE.Vector3();
const _cameraForward = new THREE.Vector3();
const _cameraRight = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _xAxis = new THREE.Vector3(1, 0, 0);
const _toCenter = new THREE.Vector3();
const _moveVec = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();
const _currentQuat = new THREE.Quaternion();
const _cameraWorldQuat = new THREE.Quaternion();
const _parentWorldQuat = new THREE.Quaternion();
const _controllerWorldQuat = new THREE.Quaternion();
const _offsetQuat = new THREE.Quaternion();
const _indexOffsetQuat = new THREE.Quaternion();
const _targetPos = new THREE.Vector3();
const _worldPos = new THREE.Vector3();
const _localPos = new THREE.Vector3();
const _currentPosVec = new THREE.Vector3();
const _nextPosVec = new THREE.Vector3();
const _tempAvatarPos = new THREE.Vector3();
const _currentVel = new THREE.Vector3();
const _targetVel = new THREE.Vector3();
const _tempEuler = new THREE.Euler();
const _poleTarget = new THREE.Vector3();
const _tempOffsetVec = new THREE.Vector3();

let footstepAudioContext: AudioContext | null = null;

function playSynthesizedFootstep(speed: number) {
  try {
    if (typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!footstepAudioContext) {
      footstepAudioContext = new AudioContextClass();
    }

    if (footstepAudioContext.state === "suspended") {
      footstepAudioContext.resume();
    }

    const ctx = footstepAudioContext;
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    const baseVolume = Math.min(0.12, speed * 0.03); // polite scuff volume
    masterGain.gain.setValueAtTime(baseVolume, now);
    masterGain.connect(ctx.destination);

    // 1. HEEL STRIKE (THUMP)
    const osc = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    osc.type = Math.random() > 0.5 ? "sine" : "triangle";
    const pitch = 80 + Math.random() * 35;
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.12);

    thumpGain.gain.setValueAtTime(1.0, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);

    osc.connect(thumpGain);
    thumpGain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.15);

    // 2. SHOE SCUFF (NOISE BURST)
    const bufferSize = ctx.sampleRate * 0.1;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    const filterFreq = 1100 + Math.random() * 400;
    noiseFilter.frequency.setValueAtTime(filterFreq, now);
    noiseFilter.Q.setValueAtTime(3.0, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);

    noiseSource.start(now);
    noiseSource.stop(now + 0.1);
  } catch (err) {
    console.warn("Footstep synthesizer bypassed:", err);
  }
}

const ChatBubble = ({ userId }: { userId: string }) => {
  const messages = useStore((state) => state.messages);
  const [bubbleText, setBubbleText] = useState<string | null>(null);

  useEffect(() => {
    const userMsgs = messages.filter((m) => m.senderId === userId);
    const lastMsg = userMsgs[userMsgs.length - 1];

    if (lastMsg) {
      const age = Date.now() - lastMsg.timestamp;
      const displayTime = Math.max(7000, lastMsg.text.length * 60);
      if (age < displayTime) {
        setBubbleText(lastMsg.text);
        const timeout = setTimeout(() => {
          setBubbleText(null);
        }, displayTime - age);
        return () => clearTimeout(timeout);
      }
    }
  }, [messages, userId]);

  if (!bubbleText) return null;

  return (
    <Html
      position={[0, 4.2, 0]}
      center
      distanceFactor={15}
      zIndexRange={[9, 0]}
      style={{ pointerEvents: "none" }}
    >
      <div className="bg-white/95 backdrop-blur-md text-zinc-900 px-4 py-2 rounded-2xl shadow-xl text-sm max-w-[350px] text-left border border-white/50 relative break-words">
        {bubbleText}
        {/* Tail */}
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-white/95" />
      </div>
    </Html>
  );
};

export const Avatar: React.FC<AvatarProps> = ({
  url,
  isLocal = false,
  userId,
}) => {
  const { rapier, world } = useRapier();
  const [vrm, setVrm] = useState<VRM | null>(null);
  
  // Connect local user microphone to cat ears & tail bones
  useVoiceBones(vrm, isLocal);

  const groupRef = useRef<THREE.Group>(null);
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const targetBones = useRef<Record<string, THREE.Quaternion>>({});
  const targetVowelA = useRef<number>(0);

  const initialUser = useStore.getState().users[userId];
  const initialLocalPosition = useRef(useStore.getState().localUserPosition).current;
  const initialRemotePosition = useRef<[number, number, number]>(initialUser?.position || [0, 5, 0]).current;
  const targetPosition = useRef<THREE.Vector3>(
    initialUser && initialUser.position
      ? new THREE.Vector3(
          initialUser.position[0],
          initialUser.position[1],
          initialUser.position[2],
        )
      : new THREE.Vector3(),
  );
  const jumpCooldownRef = useRef<number>(0);
  const stuckTimerRef = useRef<number>(0);
  const targetRotation = useRef<THREE.Quaternion>(
    initialUser && initialUser.rotation
      ? new THREE.Quaternion().setFromEuler(
          new THREE.Euler(
            initialUser.rotation[0],
            initialUser.rotation[1],
            initialUser.rotation[2],
          ),
        )
      : new THREE.Quaternion(),
  );
  const walkTime = useRef<number>(0);
  const velocity = useRef<THREE.Vector3>(new THREE.Vector3());
  const positionalAudioRef = useRef<THREE.PositionalAudio>(null);
  const auraRef = useRef<THREE.Mesh>(null);
  const [audioListener] = useState(() => new THREE.AudioListener());

  // Kinematic colliders for hands and feet
  const leftHandColliderRef = useRef<RapierRigidBody>(null);
  const rightHandColliderRef = useRef<RapierRigidBody>(null);
  const leftFootColliderRef = useRef<RapierRigidBody>(null);
  const rightFootColliderRef = useRef<RapierRigidBody>(null);

  const userName = useStore((state) =>
    isLocal
      ? state.localUserName
      : state.users[userId]?.name || `User-${userId.slice(0, 4)}`,
  );
  
  const currentRoom = useStore((state) => state.currentRoom);
  const isFirstPerson = useStore((state) => state.isFirstPerson);
  
  const playerNumber = useStore((state) => {
    const allIds = [state.localUserId, ...Object.keys(state.users)].sort();
    return allIds.indexOf(isLocal ? state.localUserId : userId) + 1;
  });

  const remoteStream = useStore((state) => state.users[userId]?.stream);
  const masterVolume = useStore((state) => state.masterVolume);
  const isPianoActive = useStore((state) => state.isPianoActive);

  const keys = useKeyboard(isLocal && !isPianoActive);

  // Subscribe to store updates for this remote user's position/rotation/vrmUrl
  const storeUser = useStore((state) => state.users[userId]);

  useEffect(() => {
    if (!isLocal && storeUser) {
      if (storeUser.position) {
        targetPosition.current.set(
          storeUser.position[0],
          storeUser.position[1],
          storeUser.position[2]
        );
      }
      if (storeUser.rotation) {
        targetRotation.current.setFromEuler(
          new THREE.Euler(
            storeUser.rotation[0],
            storeUser.rotation[1],
            storeUser.rotation[2]
          )
        );
      }
    }
  }, [isLocal, storeUser]);

  // WebXR Hooks
  const isPresenting = useXR((state) => state.session !== undefined);
  const xrOrigin = useXR((state) => state.origin);
  const leftController = useXRInputSourceState("controller", "left");
  const rightController = useXRInputSourceState("controller", "right");

  // Audio analyzer for local lip sync
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  // Custom eye tracking & blinking state refs
  const lookAtTargetRef = useRef(new THREE.Object3D());
  const blinkStateRef = useRef({
    nextBlink: 0,
    isBlinking: false,
    blinkStartTime: 0,
  });
  const saccadeStateRef = useRef({
    lastChangeTime: 0,
    targetOffset: new THREE.Vector3(),
  });

  // Animation System
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const waveActionRef = useRef<THREE.AnimationAction | null>(null);
  const hugActionRef = useRef<THREE.AnimationAction | null>(null);
  const cheerActionRef = useRef<THREE.AnimationAction | null>(null);
  const walkActionRef = useRef<THREE.AnimationAction | null>(null);
  const catwalkActionRef = useRef<THREE.AnimationAction | null>(null);
  const jumpActionRef = useRef<THREE.AnimationAction | null>(null);
  const dropActionRef = useRef<THREE.AnimationAction | null>(null);
  const danceActionRef = useRef<THREE.AnimationAction | null>(null);
  const victoryActionRef = useRef<THREE.AnimationAction | null>(null);
  const signActionRef = useRef<THREE.AnimationAction | null>(null);
  const joggingActionRef = useRef<THREE.AnimationAction | null>(null);
  const runActionRef = useRef<THREE.AnimationAction | null>(null);
  const turnLeftActionRef = useRef<THREE.AnimationAction | null>(null);
  const turnRightActionRef = useRef<THREE.AnimationAction | null>(null);
  const turnaroundActionRef = useRef<THREE.AnimationAction | null>(null);
  const walkToRunActionRef = useRef<THREE.AnimationAction | null>(null);
  const prevRotationYRef = useRef<number>(0);
  const prevHorizSpeedRef = useRef<number>(0);
  const lerpedHorizSpeedRef = useRef<number>(0);
  const smoothTurnLeftWeightRef = useRef<number>(0);
  const smoothTurnRightWeightRef = useRef<number>(0);
  const lastHugTriggerTime = useRef(0);
  const setAvatarLoading = useStore((state) => state.setAvatarLoading);
  const setAvatarLoadingProgress = useStore((state) => state.setAvatarLoadingProgress);
  const isLoading = useStore((state) => state.avatarLoading);
  const hasDroppedRef = useRef<boolean>(false);
  const lerpedMoveDirRef = useRef<THREE.Vector3>(new THREE.Vector3());

  useEffect(() => {
    let isMounted = true;
    let currentVrm: VRM | null = null;
    
    if (isLocal) {
      setTimeout(() => {
        if (isMounted) {
          setAvatarLoading(true);
          setAvatarLoadingProgress(0);
        }
      }, 0);
    }

    const loader = new GLTFLoader();
    loader.register((parser) => {
      return new VRMLoaderPlugin(parser, {
        mtoonMaterialPlugin: new MToonMaterialLoaderPlugin(parser, {
          materialType: undefined,
        })
      });
    });

    const loadVRM = (vrmUrl: string, isFallback = false, retries = 3) => {
      const targetUrl = vrmUrl.startsWith('/') ? `${window.location.origin}${vrmUrl}` : vrmUrl;
      loader.load(
        targetUrl,
        (gltf) => {
          if (!isMounted) {
            // Dispose immediately if unmounted during load
            VRMUtils.deepDispose(gltf.scene as any);
            return;
          }
  
          const loadedVrm = gltf.userData.vrm as VRM;

        // Run high-fidelity compatibility transcode for WebGPU Materials
        convertVRMMaterialsForWebGPU(loadedVrm.scene);

        // Enable high-performance frustum culling for VRM with generous bounding spheres
        loadedVrm.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
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

        // Refine Physics (Jiggle)
        if (loadedVrm.springBoneManager) {
          // --- ANTI-CLIPPING & IK FIXES ---
          // Prevent arms from twisting/deforming during procedural movement or IK
          const fixArmRotations = (boneName: VRMHumanBoneName) => {
            const bone = loadedVrm.humanoid?.getNormalizedBoneNode(boneName);
            if (bone) bone.rotation.order = "YXZ";
          };
          fixArmRotations(VRMHumanBoneName.LeftUpperArm);
          fixArmRotations(VRMHumanBoneName.LeftLowerArm);
          fixArmRotations(VRMHumanBoneName.LeftHand);
          fixArmRotations(VRMHumanBoneName.RightUpperArm);
          fixArmRotations(VRMHumanBoneName.RightLowerArm);
          fixArmRotations(VRMHumanBoneName.RightHand);

          // Access the static bounds (legs, hips, torso) and inflate them so
          // clothing spring bones bounce further away from the skin.
          const springManager = loadedVrm.springBoneManager as any;

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

          // Exclude ears and tail from spring simulation to allow clean voice-driven procedural animation
          const checkExcluded = (boneName: string) => {
            const n = boneName.toLowerCase();
            return (
              n.includes("tail") ||
              n.includes("shippo") ||
              n.includes("shipp") ||
              n.includes("tale") ||
              n.includes("尻尾") ||
              n.includes("しっぽ") ||
              n.includes("シッポ") ||
              (n.includes("ear") && !n.includes("clear") && !n.includes("wear"))
            );
          };

          if (loadedVrm.springBoneManager.joints && typeof (loadedVrm.springBoneManager.joints as any).delete === "function") {
            const excludedJoints: any[] = [];
            (loadedVrm.springBoneManager.joints as any).forEach((joint: any) => {
              if (joint.bone && checkExcluded(joint.bone.name)) {
                excludedJoints.push(joint);
              }
            });
            excludedJoints.forEach((joint) => {
              (loadedVrm.springBoneManager.joints as any).delete(joint);
            });
            console.log(`[Avatar-VoiceBones] Excluded ${excludedJoints.length} ears/tail joints from spring bone simulation set`);
          } else if (Array.isArray(loadedVrm.springBoneManager.joints)) {
            const originalCount = loadedVrm.springBoneManager.joints.length;
            (loadedVrm.springBoneManager as any).joints = loadedVrm.springBoneManager.joints.filter((joint: any) => {
              return !(joint.bone && checkExcluded(joint.bone.name));
            });
            const excludedCount = originalCount - loadedVrm.springBoneManager.joints.length;
            console.log(`[Avatar-VoiceBones] Excluded ${excludedCount} ears/tail joints from spring bone simulation array`);
          }

          loadedVrm.springBoneManager.joints.forEach((joint) => {
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

        currentVrm = loadedVrm;
        setVrm(loadedVrm);

        // Initialize eye tracking target
        if (loadedVrm.lookAt) {
          loadedVrm.lookAt.target = lookAtTargetRef.current;
        }

        // --- Load VRM Animations ---
        mixerRef.current = new THREE.AnimationMixer(loadedVrm.scene);

        loadVrmaWithCache("/animations/waving.vrma")
          .then((vrmaGltf) => {
            if (!isMounted || !mixerRef.current) return;
            try {
              const vrmAnimations = vrmaGltf.userData?.vrmAnimations;
              if (vrmAnimations && vrmAnimations.length > 0) {
                const vrmAnimation = vrmAnimations[0] as VRMAnimation;
                const clip = createVRMAnimationClip(vrmAnimation, loadedVrm as any);
                waveActionRef.current = mixerRef.current!.clipAction(clip);
                waveActionRef.current.loop = THREE.LoopRepeat;
                waveActionRef.current.clampWhenFinished = false;
                console.log("[Avatar] Successfully loaded VRMA waving animation!");
              }
            } catch (pErr) {
              console.warn("Error parsing waving VRMA:", pErr);
            }
          })
          .catch((err: any) => console.warn("Gracefully bypassed waving animation load:", err?.message || err));

        loadVrmaWithCache("/animations/blowkiss.vrma")
          .then((vrmaGltf) => {
            if (!isMounted || !mixerRef.current) return;
            try {
              const vrmAnimations = vrmaGltf.userData?.vrmAnimations;
              if (vrmAnimations && vrmAnimations.length > 0) {
                const vrmAnimation = vrmAnimations[0] as VRMAnimation;
                const clip = createVRMAnimationClip(vrmAnimation, loadedVrm as any);
                hugActionRef.current = mixerRef.current!.clipAction(clip);
                hugActionRef.current.loop = THREE.LoopOnce;
                hugActionRef.current.clampWhenFinished = true;
                console.log("[Avatar] Successfully loaded VRMA blowkiss animation!");
              }
            } catch (pErr) {
              console.warn("Error parsing blowkiss VRMA:", pErr);
            }
          })
          .catch((err: any) => console.warn("Gracefully bypassed blowkiss animation load:", err?.message || err));

        loadVrmaWithCache("/animations/cheer.vrma")
          .then((vrmaGltf) => {
            if (!isMounted || !mixerRef.current) return;
            try {
              const vrmAnimations = vrmaGltf.userData?.vrmAnimations;
              if (vrmAnimations && vrmAnimations.length > 0) {
                const vrmAnimation = vrmAnimations[0] as VRMAnimation;
                const clip = createVRMAnimationClip(vrmAnimation, loadedVrm as any);
                cheerActionRef.current = mixerRef.current!.clipAction(clip);
                cheerActionRef.current.loop = THREE.LoopRepeat;
                cheerActionRef.current.clampWhenFinished = false;
                console.log("[Avatar] Successfully loaded VRMA cheer animation!");
              }
            } catch (pErr) {
              console.warn("Error parsing cheer VRMA:", pErr);
            }
          })
          .catch((err: any) => console.warn("Gracefully bypassed cheer animation load:", err?.message || err));

        loadVrmaWithCache("/animations/dance.vrma")
          .then((vrmaGltf) => {
            if (!isMounted || !mixerRef.current) return;
            try {
              const vrmAnimations = vrmaGltf.userData?.vrmAnimations;
              if (vrmAnimations && vrmAnimations.length > 0) {
                const vrmAnimation = vrmAnimations[0] as VRMAnimation;
                const clip = createVRMAnimationClip(vrmAnimation, loadedVrm as any);
                danceActionRef.current = mixerRef.current!.clipAction(clip);
                danceActionRef.current.loop = THREE.LoopRepeat;
                danceActionRef.current.clampWhenFinished = false;
                console.log("[Avatar] Successfully loaded VRMA dance animation!");
              }
            } catch (pErr) {
              console.warn("Error parsing dance VRMA:", pErr);
            }
          })
          .catch((err: any) => console.warn("Gracefully bypassed dance animation load:", err?.message || err));

        loadVrmaWithCache("/animations/victorypose.vrma")
          .then((vrmaGltf) => {
            if (!isMounted || !mixerRef.current) return;
            try {
              const vrmAnimations = vrmaGltf.userData?.vrmAnimations;
              if (vrmAnimations && vrmAnimations.length > 0) {
                const vrmAnimation = vrmAnimations[0] as VRMAnimation;
                const clip = createVRMAnimationClip(vrmAnimation, loadedVrm as any);
                victoryActionRef.current = mixerRef.current!.clipAction(clip);
                victoryActionRef.current.loop = THREE.LoopOnce;
                victoryActionRef.current.clampWhenFinished = true;
                console.log("[Avatar] Successfully loaded VRMA victorypose animation!");
              } else {
                throw new Error("No vrmAnimations inside userData");
              }
            } catch (pErr) {
              console.warn("Error parsing victorypose VRMA, falling back to cheer animation:", pErr);
              if (cheerActionRef.current) {
                victoryActionRef.current = cheerActionRef.current;
              }
            }
          })
          .catch((err: any) => {
            console.warn("Gracefully falling back from victorypose loading error:", err?.message || err);
            loadVrmaWithCache("/animations/cheer.vrma")
              .then((fallbackGltf) => {
                if (!isMounted || !mixerRef.current) return;
                try {
                  const vrmAnimations = fallbackGltf.userData?.vrmAnimations;
                  if (vrmAnimations && vrmAnimations.length > 0) {
                    const vrmAnimation = vrmAnimations[0] as VRMAnimation;
                    const clip = createVRMAnimationClip(vrmAnimation, loadedVrm as any);
                    victoryActionRef.current = mixerRef.current!.clipAction(clip);
                    victoryActionRef.current.loop = THREE.LoopOnce;
                    victoryActionRef.current.clampWhenFinished = true;
                    console.log("[Avatar] Successfully loaded fallback cheer animation for victory!");
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
            if (!isMounted || !mixerRef.current) return;
            const vrmAnimations = vrmaGltf.userData.vrmAnimations;
            if (vrmAnimations && vrmAnimations.length > 0) {
              const vrmAnimation = vrmAnimations[0] as VRMAnimation;
              let clip = createVRMAnimationClip(vrmAnimation, loadedVrm as any);
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
              console.log("[Avatar] Successfully loaded VRMA walking start animation!");
            }
          })
          .catch((err: any) => {
            console.warn("Gracefully bypassed VRMA walking start loading:", err?.message || err);
          });

        // Load catwalk.vrma always as catwalkActionRef (catwalk used for strut gesture)
        loadVrmaWithCache("/animations/catwalk.vrma")
          .then((vrmaGltf) => {
            if (!isMounted || !mixerRef.current) return;
            const vrmAnimations = vrmaGltf.userData.vrmAnimations;
            if (vrmAnimations && vrmAnimations.length > 0) {
              const vrmAnimation = vrmAnimations[0] as VRMAnimation;
              let clip = createVRMAnimationClip(vrmAnimation, loadedVrm as any);
              clip = processCatwalkVRMA(clip);
              
              if (catwalkActionRef.current) {
                catwalkActionRef.current.stop();
              }
              
              catwalkActionRef.current = mixerRef.current!.clipAction(clip);
              catwalkActionRef.current.loop = THREE.LoopRepeat;
              catwalkActionRef.current.clampWhenFinished = false;
              catwalkActionRef.current.weight = 0;
              catwalkActionRef.current.play();
              console.log("[Avatar] Successfully loaded VRMA catwalk animation!");
            }
          })
          .catch((err: any) => {
            console.warn("[Avatar] catwalk.vrma not loaded:", err?.message || err);
          });

        // Load jogging.vrma
        loadVrmaWithCache("/animations/jogging.vrma")
          .then((vrmaGltf) => {
            if (!isMounted || !mixerRef.current) return;
            const vrmAnimations = vrmaGltf.userData.vrmAnimations;
            if (vrmAnimations && vrmAnimations.length > 0) {
              const vrmAnimation = vrmAnimations[0] as VRMAnimation;
              let clip = createVRMAnimationClip(vrmAnimation, loadedVrm as any);
              clip = processLocomotionVRMA(clip, { inPlace: true });
              
              if (joggingActionRef.current) {
                joggingActionRef.current.stop();
              }
              
              joggingActionRef.current = mixerRef.current!.clipAction(clip);
              joggingActionRef.current.loop = THREE.LoopRepeat;
              joggingActionRef.current.clampWhenFinished = false;
              joggingActionRef.current.weight = 0;
              joggingActionRef.current.play();
              console.log("[Avatar] Successfully loaded VRMA jogging animation!");
            }
          })
          .catch((err: any) => {
            console.warn("[Avatar] jogging.vrma not loaded:", err?.message || err);
          });

        // Load run.vrma
        loadVrmaWithCache("/animations/run.vrma")
          .then((vrmaGltf) => {
            if (!isMounted || !mixerRef.current) return;
            const vrmAnimations = vrmaGltf.userData.vrmAnimations;
            if (vrmAnimations && vrmAnimations.length > 0) {
              const vrmAnimation = vrmAnimations[0] as VRMAnimation;
              let clip = createVRMAnimationClip(vrmAnimation, loadedVrm as any);
              clip = processLocomotionVRMA(clip, { inPlace: true });
              
              if (runActionRef.current) {
                runActionRef.current.stop();
              }
              
              runActionRef.current = mixerRef.current!.clipAction(clip);
              runActionRef.current.loop = THREE.LoopRepeat;
              runActionRef.current.clampWhenFinished = false;
              runActionRef.current.weight = 0;
              runActionRef.current.play();
              console.log("[Avatar] Successfully loaded VRMA run animation!");
            }
          })
          .catch((err: any) => {
            console.warn("[Avatar] run.vrma not loaded:", err?.message || err);
          });

        // Load walkturnleft.vrma
        loadVrmaWithCache("/animations/walkturnleft.vrma")
          .then((vrmaGltf) => {
            if (!isMounted || !mixerRef.current) return;
            const vrmAnimations = vrmaGltf.userData.vrmAnimations;
            if (vrmAnimations && vrmAnimations.length > 0) {
              const vrmAnimation = vrmAnimations[0] as VRMAnimation;
              let clip = createVRMAnimationClip(vrmAnimation, loadedVrm as any);
              clip = processLocomotionVRMA(clip, { inPlace: true });
              
              if (turnLeftActionRef.current) {
                turnLeftActionRef.current.stop();
              }
              
              turnLeftActionRef.current = mixerRef.current!.clipAction(clip);
              turnLeftActionRef.current.loop = THREE.LoopRepeat;
              turnLeftActionRef.current.clampWhenFinished = false;
              turnLeftActionRef.current.weight = 0;
              turnLeftActionRef.current.play();
              console.log("[Avatar] Successfully loaded VRMA walkturnleft animation!");
            }
          })
          .catch((err: any) => {
            console.warn("[Avatar] walkturnleft.vrma not loaded:", err?.message || err);
          });

        // Load walkturnright.vrma
        loadVrmaWithCache("/animations/walkturnright.vrma")
          .then((vrmaGltf) => {
            if (!isMounted || !mixerRef.current) return;
            const vrmAnimations = vrmaGltf.userData.vrmAnimations;
            if (vrmAnimations && vrmAnimations.length > 0) {
              const vrmAnimation = vrmAnimations[0] as VRMAnimation;
              let clip = createVRMAnimationClip(vrmAnimation, loadedVrm as any);
              clip = processLocomotionVRMA(clip, { inPlace: true });
              
              if (turnRightActionRef.current) {
                turnRightActionRef.current.stop();
              }
              
              turnRightActionRef.current = mixerRef.current!.clipAction(clip);
              turnRightActionRef.current.loop = THREE.LoopRepeat;
              turnRightActionRef.current.clampWhenFinished = false;
              turnRightActionRef.current.weight = 0;
              turnRightActionRef.current.play();
              console.log("[Avatar] Successfully loaded VRMA walkturnright animation!");
            }
          })
          .catch((err: any) => {
            console.warn("[Avatar] walkturnright.vrma not loaded:", err?.message || err);
          });

        // Load turnaroundwalk.vrma
        loadVrmaWithCache("/animations/turnaroundwalk.vrma")
          .then((vrmaGltf) => {
            if (!isMounted || !mixerRef.current) return;
            const vrmAnimations = vrmaGltf.userData.vrmAnimations;
            if (vrmAnimations && vrmAnimations.length > 0) {
              const vrmAnimation = vrmAnimations[0] as VRMAnimation;
              let clip = createVRMAnimationClip(vrmAnimation, loadedVrm as any);
              clip = processLocomotionVRMA(clip, { inPlace: true });
              
              if (turnaroundActionRef.current) {
                turnaroundActionRef.current.stop();
              }
              
              turnaroundActionRef.current = mixerRef.current!.clipAction(clip);
              turnaroundActionRef.current.loop = THREE.LoopOnce;
              turnaroundActionRef.current.clampWhenFinished = true;
              turnaroundActionRef.current.weight = 0;
              turnaroundActionRef.current.play();
              console.log("[Avatar] Successfully loaded VRMA turnaroundwalk animation!");
            }
          })
          .catch((err: any) => {
            console.warn("[Avatar] turnaroundwalk.vrma not loaded:", err?.message || err);
          });

        // Load walktorun.vrma
        loadVrmaWithCache("/animations/walktorun.vrma")
          .then((vrmaGltf) => {
            if (!isMounted || !mixerRef.current) return;
            const vrmAnimations = vrmaGltf.userData.vrmAnimations;
            if (vrmAnimations && vrmAnimations.length > 0) {
              const vrmAnimation = vrmAnimations[0] as VRMAnimation;
              let clip = createVRMAnimationClip(vrmAnimation, loadedVrm as any);
              clip = processLocomotionVRMA(clip, { inPlace: true });
              
              if (walkToRunActionRef.current) {
                walkToRunActionRef.current.stop();
              }
              
              walkToRunActionRef.current = mixerRef.current!.clipAction(clip);
              walkToRunActionRef.current.loop = THREE.LoopOnce;
              walkToRunActionRef.current.clampWhenFinished = true;
              walkToRunActionRef.current.weight = 0;
              walkToRunActionRef.current.play();
              console.log("[Avatar] Successfully loaded VRMA walktorun animation!");
            }
          })
          .catch((err: any) => {
            console.warn("[Avatar] walktorun.vrma not loaded:", err?.message || err);
          });





        loadVrmaWithCache("/animations/SG ASL Antigravity 1 2023-7-10 No Mesh Mixamo.vrma")
          .then((vrmaGltf) => {
            if (!isMounted || !mixerRef.current) return;
            const vrmAnimations = vrmaGltf.userData.vrmAnimations;
            if (vrmAnimations && vrmAnimations.length > 0) {
              const vrmAnimation = vrmAnimations[0] as VRMAnimation;
              const clip = createVRMAnimationClip(vrmAnimation, loadedVrm as any);
              signActionRef.current = mixerRef.current!.clipAction(clip);
              signActionRef.current.loop = THREE.LoopRepeat;
              signActionRef.current.clampWhenFinished = false;
              console.log("[Avatar] Successfully loaded VRMA sign language animation!");
            }
          })
          .catch((err: any) => console.warn("Gracefully bypassed VRMA sign language loading:", err?.message || err));
        
        if (isLocal) {
          setTimeout(() => {
            if (isMounted) {
              setAvatarLoadingProgress(100);
              setTimeout(() => {
                if (isMounted) {
                  setAvatarLoading(false);
                }
              }, 500);
            }
          }, 0);
        }
      },
      (progress) => {
        if (isLocal) {
          let pct = 0;
          if (progress.total > 0) {
             pct = 100.0 * (progress.loaded / progress.total);
          } else if (progress.loaded > 0) {
             pct = 50; // default to 50 if unknown payload size
          }
          // Defer to prevent React Error 185 synchronous update loop
          setTimeout(() => {
            if (isMounted) {
              setAvatarLoadingProgress(pct);
            }
          }, 0);
        }
      },
        (error: any) => {
          const errorMessage = String(error?.message || error || '');
          const isHtmlError = error instanceof SyntaxError || 
                              errorMessage.includes('Unexpected token') || 
                              errorMessage.includes('<!doctype') || 
                              errorMessage.includes('JSON');
          const isNotFoundError = errorMessage.includes('404');
          
          if (!isHtmlError && !isNotFoundError) {
            console.error(`Error loading VRM from ${vrmUrl}:`, error);
          } else {
            console.warn(`Could not load VRM from ${vrmUrl} (404/invalid format).`);
          }

          if (retries > 0 && !isHtmlError && !isNotFoundError) {
            const delay = (4 - retries) * 1500;
            console.warn(`[Avatar] Retrying VRM load due to error in ${delay}ms... (${retries} attempts left)`);
            setTimeout(() => {
              if (isMounted) {
                loadVRM(vrmUrl, isFallback, retries - 1);
              }
            }, delay);
          } else if (!isFallback && vrmUrl !== DEFAULT_VRM_URL) {
            console.warn("Attempting fallback from broken URL to default VRM model...");
            loadVRM(DEFAULT_VRM_URL, true);
          } else {
            if (isMounted && isLocal) {
              useStore.getState().setLocalVrmUrl(DEFAULT_VRM_URL);
              syncService.updatePresenceVrmUrl(DEFAULT_VRM_URL);
            }
          }
        }
      );
    };

    loadVRM(url);

    return () => {
      isMounted = false;
      if (currentVrm) {
        currentVrm.scene.parent?.remove(currentVrm.scene);
        VRMUtils.deepDispose(currentVrm.scene as any);
      }
    };
  }, [url]);

  const localUserGesture = useStore((state) => state.localUserGesture);

  useEffect(() => {
    if (!isLoading && isLocal && dropActionRef.current && !hasDroppedRef.current) {
      dropActionRef.current.reset().fadeIn(0.2).play();
      hasDroppedRef.current = true;
      // Also teleport rigidBody higher up in case we were already loaded at 5y
      if (rigidBodyRef.current) {
         rigidBodyRef.current.setTranslation({ x: 0, y: 15, z: 0 }, true);
         rigidBodyRef.current.setLinvel({ x: 0, y: -2, z: 0 }, true);
      }
    }
  }, [isLoading, isLocal]);

  // Play animation when gesture matches (Locally only, as bones sync remotely)
  useEffect(() => {
    if (isLocal) {
      if (waveActionRef.current) {
        if (localUserGesture === "wave") {
          waveActionRef.current.reset().fadeIn(0.2).play();
        } else {
          waveActionRef.current.fadeOut(0.2);
        }
      }

      if (hugActionRef.current) {
        if (localUserGesture === "hug") {
          hugActionRef.current.paused = false;
          hugActionRef.current.reset().fadeIn(0.2).play();
        } else {
          hugActionRef.current.fadeOut(0.2);
        }
      }

      if (cheerActionRef.current) {
        if (localUserGesture === "cheer") {
          cheerActionRef.current.reset().fadeIn(0.2).play();
        } else {
          cheerActionRef.current.fadeOut(0.2);
        }
      }

      if (danceActionRef.current) {
        if (localUserGesture === "dance") {
          danceActionRef.current.reset().fadeIn(0.2).play();
        } else {
          danceActionRef.current.fadeOut(0.2);
        }
      }

      if (victoryActionRef.current) {
        if (localUserGesture === "victory") {
          victoryActionRef.current.paused = false;
          victoryActionRef.current.reset().fadeIn(0.2).play();
        } else {
          victoryActionRef.current.fadeOut(0.2);
        }
      }

      if (signActionRef.current) {
        if (localUserGesture === "sign") {
          signActionRef.current.reset().fadeIn(0.2).play();
        } else {
          signActionRef.current.fadeOut(0.2);
        }
      }
    }
  }, [localUserGesture, isLocal]);

  // Teleport local player to safe spawn center on room switch, preventing immediate portal loops
  useEffect(() => {
    if (isLocal && rigidBodyRef.current) {
      rigidBodyRef.current.setTranslation({ x: 0, y: 5, z: 0 }, true);
      rigidBodyRef.current.setLinvel({ x: 0, y: -1, z: 0 }, true);
    }
  }, [currentRoom, isLocal]);

  // Handle global teleportation event for administrative portal warps and debugging
  useEffect(() => {
    if (!isLocal) return;

    const handleTeleport = (e: Event) => {
      const customEvent = e as CustomEvent<{ x: number; y: number; z: number }>;
      if (rigidBodyRef.current && customEvent.detail) {
        rigidBodyRef.current.setTranslation({
          x: customEvent.detail.x,
          y: customEvent.detail.y + 1.5, // Spawn slightly higher up
          z: customEvent.detail.z
        }, true);
        rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    };

    window.addEventListener('teleport-local-player', handleTeleport);
    return () => {
      window.removeEventListener('teleport-local-player', handleTeleport);
    };
  }, [isLocal]);

  // Setup remote audio stream
  const { camera } = useThree();

  useEffect(() => {
    if (!isLocal) {
      camera.add(audioListener);
      return () => {
        camera.remove(audioListener);
      };
    }
  }, [isLocal, camera, audioListener]);

  useEffect(() => {
    if (!isLocal && remoteStream && positionalAudioRef.current) {
      const audio = positionalAudioRef.current;

      // Drei's PositionalAudio might not have context exposed directly if it's just the THREE object,
      // but it is a THREE.PositionalAudio.
      if (audio.context && audio.context.state === "suspended") {
        audio.context.resume();
      }

      if (audio.source) {
        audio.disconnect();
      }

      audio.setMediaStreamSource(remoteStream);
      audio.setRefDistance(2);
      audio.setRolloffFactor(1);
      audio.setDistanceModel("inverse");
      audio.setVolume(masterVolume);

      return () => {
        if (audio.source) {
          audio.disconnect();
        }
      };
    }
  }, [isLocal, remoteStream, masterVolume]);

  // Setup local audio analyzer
  useEffect(() => {
    if (isLocal) {
      const initAudio = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          const audioContext = new AudioContext();
          const analyzer = audioContext.createAnalyser();
          analyzer.fftSize = 256;
          const source = audioContext.createMediaStreamSource(stream);
          source.connect(analyzer);
          analyzerRef.current = analyzer;
          dataArrayRef.current = new Uint8Array(analyzer.frequencyBinCount);
          useStore.getState().setMicStream(stream);
        } catch (err) {
          console.warn("Microphone access is unavailable or denied. The system will fall back to automatic procedural animations.", err);
        }
      };
      initAudio();

      return () => {
        const stream = useStore.getState().micStream;
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
        }
      };
    }
  }, [isLocal]);

  // Listen for remote bone data
  useEffect(() => {
    if (!isLocal) {
      const handleBoneData = (data: BoneSyncData) => {
        if (!data || data.userId !== userId || !data.bones) return;

        // Update target quaternions
        Object.entries(data.bones).forEach(([boneName, quatArray]) => {
          if (!targetBones.current[boneName]) {
            targetBones.current[boneName] = new THREE.Quaternion();
          }
          if (quatArray && quatArray.length === 4) {
            targetBones.current[boneName].set(
              quatArray[0],
              quatArray[1],
              quatArray[2],
              quatArray[3],
            );
          }
        });

        targetVowelA.current = data.vowel_a || 0;

        if (data.position && data.position.length === 3) {
          targetPosition.current.set(
            data.position[0],
            data.position[1],
            data.position[2],
          );
        }

        if (data.rotation && data.rotation.length === 3) {
          targetRotation.current.setFromEuler(
            new THREE.Euler(
              data.rotation[0],
              data.rotation[1],
              data.rotation[2],
            ),
          );
        }
      };

      // We need a way to register this callback. For simplicity, we'll use a global event or direct assignment
      // Since syncService is a singleton, we can just assign it, but it overwrites.
      // Better to use an event emitter, but let's just mock it for now with a custom event.
      const listener = (e: CustomEvent<BoneSyncData>) =>
        handleBoneData(e.detail);
      window.addEventListener("vrm-bone-sync", listener as EventListener);
      return () =>
        window.removeEventListener("vrm-bone-sync", listener as EventListener);
    }
  }, [isLocal, userId]);

  useFrame((state, r3fDelta) => {
    if (!vrm || !groupRef.current || !rigidBodyRef.current) return;

    // Clamp delta to prevent physical explosion & extreme spin on page visibility/tab changes
    const delta = Math.min(0.05, r3fDelta);

    if (isLocal) {
      // 1. Local Lip Sync
      let vowelA = 0;
      let vowelI = 0;
      let vowelO = 0;
      if (analyzerRef.current && dataArrayRef.current) {
        analyzerRef.current.getByteFrequencyData(dataArrayRef.current);
        const sum = dataArrayRef.current.reduce((a, b) => a + b, 0);
        const average = sum / dataArrayRef.current.length;

        if (average > 5) {
          vowelA = Math.min(1, average / 40);
          vowelI = Math.min(1, average / 60);
          vowelO = Math.min(1, average / 50);
        }

        const t = state.clock.elapsedTime;
        const t1 = Math.abs(Math.sin(t * 15));
        const t2 = Math.abs(Math.cos(t * 10));
        const t3 = Math.abs(Math.sin(t * 8 + Math.PI));

        vrm.expressionManager?.setValue("aa", vowelA * t1);
        vrm.expressionManager?.setValue("ih", vowelI * t2);
        vrm.expressionManager?.setValue("ou", vowelO * t3);
      }

      // 1.5 Sync Kinematic Colliders
      // (Moved to end of useFrame to ensure bones are fully updated)

      // 2. WASD Movement & Rotation & Jumping
      const isHugging = useStore.getState().localUserGesture === "hug";
      const speed = keys.shift ? 4.0 : 1.5; // m/s
      _moveDir.set(0, 0, 0);

      state.camera.getWorldDirection(_cameraForward);
      _cameraForward.y = 0;
      _cameraForward.normalize();

      _cameraRight.crossVectors(_cameraForward, _upAxis).normalize();

      // Keyboard Input
      if (keys.w) _moveDir.add(_cameraForward);
      if (keys.s) _moveDir.sub(_cameraForward);
      if (keys.a) _moveDir.sub(_cameraRight);
      if (keys.d) _moveDir.add(_cameraRight);

      // Joystick Input
      const joystick = useStore.getState().joystickVector;
      if (joystick.x !== 0 || joystick.y !== 0) {
        _moveDir.add(_cameraRight.clone().multiplyScalar(joystick.x));
        _moveDir.add(_cameraForward.clone().multiplyScalar(-joystick.y)); // Invert Y-axis for correct forward/backward movement
      }

      // VR Controller Input (Thumbsticks)
      if (isPresenting) {
        // Left Stick: Movement
        if (leftController && leftController.gamepad) {
          const thumbstick = leftController.gamepad["xr-standard-thumbstick"];
          if (
            thumbstick &&
            thumbstick.xAxis !== undefined &&
            thumbstick.yAxis !== undefined
          ) {
            const x = thumbstick.xAxis;
            const y = thumbstick.yAxis;

            // Deadzone
            if (Math.abs(x) > 0.1)
              _moveDir.add(_cameraRight.clone().multiplyScalar(x));
            if (Math.abs(y) > 0.1)
              _moveDir.add(_cameraForward.clone().multiplyScalar(-y)); // Y is inverted usually
          }
        }

        // Right Stick: Snap Turning (Optional, but let's just do smooth rotation for now)
        if (rightController && rightController.gamepad) {
          const thumbstick = rightController.gamepad["xr-standard-thumbstick"];
          if (thumbstick && thumbstick.xAxis !== undefined) {
            const x = thumbstick.xAxis;
            if (Math.abs(x) > 0.5) {
              // Rotate the avatar (and thus the camera rig)
              // This is tricky in VR because the camera is driven by the headset.
              // We usually rotate the parent group or the rigid body.
              // For now, let's just let the user turn their physical body.
            }
          }
        }
      }

      // Normalize raw input direction to keep speed uniform across diagonals
      if (_moveDir.lengthSq() > 0.001) {
        _moveDir.normalize();
      }

      // Smoothly interpolate the movement control input vector (lerp)
      const inputLerpRate = _moveDir.lengthSq() > 0.001 ? 10 : 15; // Smooth onset, faster cessation
      lerpedMoveDirRef.current.lerp(_moveDir, inputLerpRate * delta);

      const linvel = rigidBodyRef.current.linvel();

      // Implement acceleration/deceleration curves using lerp
      _currentVel.set(linvel.x, 0, linvel.z);
      _targetVel.set(lerpedMoveDirRef.current.x * speed, 0, lerpedMoveDirRef.current.z * speed);
      
      const hasInput = lerpedMoveDirRef.current.lengthSq() > 0.001;
      const velocityLerpRate = hasInput ? 8 * delta : 12 * delta;
      _currentVel.lerp(_targetVel, velocityLerpRate);

      // Apply horizontal velocity
      let nextVel = {
        x: _currentVel.x,
        y: linvel.y,
        z: _currentVel.z,
      };

      // World Boundary (Bubble) Check
      const WORLD_RADIUS = 45.0;
      const currentPos = rigidBodyRef.current.translation();
      const distSq = currentPos.x * currentPos.x + currentPos.z * currentPos.z;

      if (distSq > WORLD_RADIUS * WORLD_RADIUS) {
        // If outside, only allow movement towards center
        _toCenter.set(-currentPos.x, 0, -currentPos.z).normalize();
        _moveVec.set(nextVel.x, 0, nextVel.z);
        const dot = _moveVec.dot(_toCenter);

        if (dot < 0) {
          // Trying to move further out? Project velocity to slide along the wall
          // Or just zero it out if pushing directly against wall
          // Simple approach: dampen velocity moving away from center
          nextVel.x *= 0.1;
          nextVel.z *= 0.1;

          // Push back slightly
          const pushBack = _toCenter.multiplyScalar(1.0);
          nextVel.x += pushBack.x;
          nextVel.z += pushBack.z;
        }
      }

      rigidBodyRef.current.setLinvel(nextVel, true);

      // Unstuck trigger mechanism: if movement velocity drops near zero while direction input is active for >500ms
      const speedXZ = Math.sqrt(linvel.x * linvel.x + linvel.z * linvel.z);
      if (hasInput && speedXZ < 0.25) {
        stuckTimerRef.current += delta;
        if (stuckTimerRef.current > 0.5) {
          const pushDir = lerpedMoveDirRef.current.clone();
          if (pushDir.lengthSq() < 0.001) {
            state.camera.getWorldDirection(pushDir);
            pushDir.y = 0;
          }
          pushDir.normalize();
          pushDir.y = 0.25; // small upward lift
          pushDir.x += (Math.random() - 0.5) * 0.4; // slight side push
          pushDir.z += (Math.random() - 0.5) * 0.4;
          pushDir.normalize();

          const pushImpulse = pushDir.multiplyScalar(3.5);
          rigidBodyRef.current.applyImpulse({ x: pushImpulse.x, y: pushImpulse.y, z: pushImpulse.z }, true);
          stuckTimerRef.current = 0;
        }
      } else {
        stuckTimerRef.current = 0;
      }

      if (jumpCooldownRef.current > 0) {
        jumpCooldownRef.current -= delta;
      }

      const isJumpingState = Math.abs(linvel.y) > 0.5;

      // Jumping
      let justJumped = false;
      if (keys.space && !isJumpingState && jumpCooldownRef.current <= 0) {
        rigidBodyRef.current.setLinvel(
          { x: linvel.x, y: 5.5, z: linvel.z },
          true,
        );
        justJumped = true;
        jumpCooldownRef.current = 0.4; // 400ms cooldown to allow leaving ground
        if (jumpActionRef.current) {
          jumpActionRef.current.reset();
          jumpActionRef.current.setEffectiveTimeScale(1);
          jumpActionRef.current.setEffectiveWeight(1);
          jumpActionRef.current.play();
        }
      }
      
      const updatedLinvel = rigidBodyRef.current.linvel();
      const isActuallyJumping = justJumped || Math.abs(updatedLinvel.y) > 0.5 || jumpCooldownRef.current > 0.2;
      
      // Debug log every second or so
      const _t = Math.floor(state.clock.elapsedTime * 10);
      if (_t % 10 === 0 && (isActuallyJumping || jumpActionRef.current?.isRunning())) {
        console.log("Jumping stats:", { isActuallyJumping, yVel: updatedLinvel.y, posY: currentPos.y, weight: jumpActionRef.current?.getEffectiveWeight() });
      }

      let isJumpingStateAction = false;
      if (!isActuallyJumping && jumpActionRef.current) {
        const currentJumpWeight = jumpActionRef.current.getEffectiveWeight();
        if (currentJumpWeight > 0.01) {
          jumpActionRef.current.setEffectiveWeight(
            Math.max(0, currentJumpWeight - delta * 5)
          );
          isJumpingStateAction = true;
        } else if (jumpActionRef.current.isRunning()) {
          console.log("Stopping jump action");
          jumpActionRef.current.stop();
        }
      } else if (isActuallyJumping && jumpActionRef.current) {
         isJumpingStateAction = true;
      }

      const currentPhysVelVec = rigidBodyRef.current.linvel();
      const horizSpeed = Math.sqrt(currentPhysVelVec.x * currentPhysVelVec.x + currentPhysVelVec.z * currentPhysVelVec.z);
      const isPhysicallyMoving = horizSpeed > 0.1;
      const isMoving = isPhysicallyMoving;

      // Cancel gesture if physically moving (except for the self-hug and strut, so we can walk around hugging or strutting ourselves)
      if (isPhysicallyMoving && useStore.getState().localUserGesture && useStore.getState().localUserGesture !== "hug" && useStore.getState().localUserGesture !== "strut") {
        useStore.getState().setLocalUserGesture(null);
      }

      if (isPhysicallyMoving) {
        // Rotate visual model to face actual movement direction
        const targetAngle = Math.atan2(currentPhysVelVec.x, currentPhysVelVec.z);
        _targetQuat.setFromAxisAngle(_upAxis, targetAngle);

        // Rotate RigidBody instead of Group
        const currentRot = rigidBodyRef.current.rotation();
        _currentQuat.set(
          currentRot.x,
          currentRot.y,
          currentRot.z,
          currentRot.w,
        );
        _currentQuat.slerp(_targetQuat, 10 * delta);
        rigidBodyRef.current.setRotation(_currentQuat, true);

        // Calculate turning delta dynamically
        _tempEuler.setFromQuaternion(_currentQuat, 'YXZ');
        const currentRotY = _tempEuler.y;
        
        let angleDelta = currentRotY - prevRotationYRef.current;
        // Wrap to [-PI, PI] to handle coordinate boundaries seamlessly
        while (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
        while (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
        
        prevRotationYRef.current = currentRotY;
        
        const angularVelocity = angleDelta / Math.max(0.0001, delta);

        // Advance walk cycle based on actual physical travel speed
        const prevStepCycle = Math.floor(walkTime.current / Math.PI);
        walkTime.current += delta * horizSpeed * 4;
        const currentStepCycle = Math.floor(walkTime.current / Math.PI);

        if (currentStepCycle > prevStepCycle && !isActuallyJumping) {
          playSynthesizedFootstep(horizSpeed);
        }

        // Smoothly interpolate speed to prevent visual popping or sudden animation state changes
        const speedLerpRate = 5.0; // Perfect balance of responsiveness and smoothness
        lerpedHorizSpeedRef.current = THREE.MathUtils.lerp(
          lerpedHorizSpeedRef.current,
          horizSpeed,
          speedLerpRate * delta
        );
        const animSpeed = lerpedHorizSpeedRef.current;

        const isStrutting = useStore.getState().localUserGesture === "strut";

        let targetWalkWeight = 0;
        let targetJogWeight = 0;
        let targetRunWeight = 0;
        let targetCatwalkWeight = 0;
        let targetTurnLeftWeight = 0;
        let targetTurnRightWeight = 0;

        if (isActuallyJumping) {
          // If jumping, all horizontal locomotion weights decay
          targetWalkWeight = 0;
          targetJogWeight = 0;
          targetRunWeight = 0;
          targetCatwalkWeight = 0;
          targetTurnLeftWeight = 0;
          targetTurnRightWeight = 0;
        } else if (isStrutting) {
          // Strut (Catwalk) gesture override
          targetCatwalkWeight = Math.min(1.0, animSpeed / 0.4);
          targetWalkWeight = 0;
          targetJogWeight = 0;
          targetRunWeight = 0;
          targetTurnLeftWeight = 0;
          targetTurnRightWeight = 0;
        } else {
          // Real-time 1D Blend Space between Walk -> Jog -> Run based on travel speed
          // - Walk peaks at 1.5 m/s, decaying to 0 at 4.5 m/s
          // - Jog peaks at 4.5 m/s, decaying to 0 at 1.5 and 8.5 m/s
          // - Run peaks at 8.5 m/s and above
          if (animSpeed <= 1.5) {
            targetWalkWeight = Math.min(1.0, animSpeed / 0.4); // scale up from standstill
            targetJogWeight = 0;
            targetRunWeight = 0;
          } else if (animSpeed <= 4.5) {
            const alpha = (animSpeed - 1.5) / 3.0;
            targetWalkWeight = 1.0 - alpha;
            targetJogWeight = alpha;
            targetRunWeight = 0;
          } else if (animSpeed <= 8.5) {
            const alpha = (animSpeed - 4.5) / 4.0;
            targetWalkWeight = 0;
            targetJogWeight = 1.0 - alpha;
            targetRunWeight = alpha;
          } else {
            targetWalkWeight = 0;
            targetJogWeight = 0;
            targetRunWeight = 1.0;
          }

          // Blend in Turning motion Layer (Sensitivity threshold 0.15 rad/s, peaks at 1.8 rad/s)
          if (Math.abs(angularVelocity) > 0.15) {
            const turnStrength = Math.min(0.75, (Math.abs(angularVelocity) - 0.15) / 1.65);
            // Three.js Right-Handed Coordinate System: positive Y rotation (counter-clockwise) = turning LEFT, negative = turning RIGHT
            if (angularVelocity > 0) {
              targetTurnLeftWeight = turnStrength;
            } else {
              targetTurnRightWeight = turnStrength;
            }
            // Scale down primary linear locomotion weights slightly to make way for anatomical turning poses
            const scaleFactor = 1.0 - turnStrength;
            targetWalkWeight *= scaleFactor;
            targetJogWeight *= scaleFactor;
            targetRunWeight *= scaleFactor;
          }
        }

        // --- SHARP TURN / TURNAROUND TRANSITION DETECTION ---
        // Find angle difference between current visual rotation angle (currentRotY) and target movement direction
        let pathAngleDiff = targetAngle - currentRotY;
        while (pathAngleDiff < -Math.PI) pathAngleDiff += Math.PI * 2;
        while (pathAngleDiff > Math.PI) pathAngleDiff -= Math.PI * 2;
        const absPathDiff = Math.abs(pathAngleDiff);

        // If reversing direction sharply (> 2.1 rad / 120 degrees) with active speed, fire turnaround transition
        if (absPathDiff > 2.1 && animSpeed > 1.2) {
          if (turnaroundActionRef.current && !turnaroundActionRef.current.isRunning()) {
            turnaroundActionRef.current.paused = false;
            turnaroundActionRef.current.reset().setEffectiveWeight(1.0).play();
          }
        }

        // Compute turnaround action's contribution with smooth ease-in/ease-out envelope
        let targetTurnaroundWeight = 0;
        if (turnaroundActionRef.current && turnaroundActionRef.current.isRunning()) {
          const clip = turnaroundActionRef.current.getClip();
          const progress = turnaroundActionRef.current.time / Math.max(0.01, clip.duration);
          
          if (progress < 0.15) {
            targetTurnaroundWeight = progress / 0.15; // Ease in smoothly to prevent pop
          } else {
            targetTurnaroundWeight = Math.max(0, (1.0 - progress) / 0.85); // Ease out smoothly
          }
          
          if (progress >= 0.99) {
            turnaroundActionRef.current.stop();
            targetTurnaroundWeight = 0;
          }
        }

        // --- WALK-TO-RUN / SPRINT ACCELERATION DETECTION ---
        const speedDelta = animSpeed - prevHorizSpeedRef.current;
        const acceleration = speedDelta / Math.max(0.0001, delta);
        const isAcceleratingQuickly = prevHorizSpeedRef.current < 2.2 && animSpeed >= 4.0 && acceleration > 8.0;
        
        if (isAcceleratingQuickly) {
          if (walkToRunActionRef.current && !walkToRunActionRef.current.isRunning()) {
            walkToRunActionRef.current.paused = false;
            walkToRunActionRef.current.reset().setEffectiveWeight(1.0).play();
          }
        }
        prevHorizSpeedRef.current = animSpeed;

        // Compute walktorun transition contribution with smooth ease-in/ease-out envelope
        let targetWalkToRunWeight = 0;
        if (walkToRunActionRef.current && walkToRunActionRef.current.isRunning()) {
          const clip = walkToRunActionRef.current.getClip();
          const progress = walkToRunActionRef.current.time / Math.max(0.01, clip.duration);
          
          if (progress < 0.15) {
            targetWalkToRunWeight = progress / 0.15; // Ease in smoothly
          } else {
            targetWalkToRunWeight = Math.max(0, (1.0 - progress) / 0.85); // Ease out smoothly
          }
          
          if (progress >= 0.99) {
            walkToRunActionRef.current.stop();
            targetWalkToRunWeight = 0;
          }
        }

        // Apply transition dampening factor to primary linear weights so the animations merge seamlessly
        if (targetTurnaroundWeight > 0.05) {
          const transFactor = 1.0 - targetTurnaroundWeight;
          targetWalkWeight *= transFactor;
          targetJogWeight *= transFactor;
          targetRunWeight *= transFactor;
          targetTurnLeftWeight *= transFactor;
          targetTurnRightWeight *= transFactor;
        }

        if (targetWalkToRunWeight > 0.05) {
          const transFactor = 1.0 - targetWalkToRunWeight;
          targetWalkWeight *= transFactor;
          targetJogWeight *= transFactor;
          targetRunWeight *= transFactor;
        }

        // Adjust animation play speed (time scale) dynamically to match physical travel speed & prevent foot sliding
        if (walkActionRef.current) {
          walkActionRef.current.setEffectiveTimeScale(Math.max(0.6, Math.min(1.6, animSpeed / 1.6)));
        }
        if (joggingActionRef.current) {
          joggingActionRef.current.setEffectiveTimeScale(Math.max(0.7, Math.min(1.7, animSpeed / 4.2)));
        }
        if (runActionRef.current) {
          runActionRef.current.setEffectiveTimeScale(Math.max(0.8, Math.min(1.8, animSpeed / 8.5)));
        }
        if (catwalkActionRef.current) {
          catwalkActionRef.current.setEffectiveTimeScale(Math.max(0.5, Math.min(1.5, animSpeed / 1.7)));
        }
        if (turnLeftActionRef.current) {
          turnLeftActionRef.current.setEffectiveTimeScale(Math.max(0.6, Math.min(1.4, Math.abs(angularVelocity) / 1.2)));
        }
        if (turnRightActionRef.current) {
          turnRightActionRef.current.setEffectiveTimeScale(Math.max(0.6, Math.min(1.4, Math.abs(angularVelocity) / 1.2)));
        }
        if (turnaroundActionRef.current) {
          turnaroundActionRef.current.setEffectiveTimeScale(Math.max(0.8, Math.min(1.5, animSpeed / 3.0)));
        }
        if (walkToRunActionRef.current) {
          walkToRunActionRef.current.setEffectiveTimeScale(Math.max(0.9, Math.min(1.4, animSpeed / 5.0)));
        }

        // Apply weights and execute plays/fades
        const list = [
          { ref: walkActionRef, target: targetWalkWeight },
          { ref: catwalkActionRef, target: targetCatwalkWeight },
          { ref: joggingActionRef, target: targetJogWeight },
          { ref: runActionRef, target: targetRunWeight },
          { ref: turnLeftActionRef, target: targetTurnLeftWeight },
          { ref: turnRightActionRef, target: targetTurnRightWeight },
          { ref: turnaroundActionRef, target: targetTurnaroundWeight },
          { ref: walkToRunActionRef, target: targetWalkToRunWeight },
        ];

        list.forEach((item) => {
          const action = item.ref.current;
          if (!action) return;
          
          const currentWeight = action.getEffectiveWeight();
          const targetWeight = item.target;
          
          if (targetWeight > 0.01) {
            if (!action.isRunning()) {
              action.play();
            }
            action.setEffectiveWeight(
              THREE.MathUtils.lerp(currentWeight, targetWeight, 12 * delta)
            );
          } else {
            if (currentWeight > 0.01) {
              action.setEffectiveWeight(
                THREE.MathUtils.lerp(currentWeight, 0, 15 * delta)
              );
            } else if (action.isRunning()) {
              action.stop();
            }
          }
        });

        // --- MASTER GAIT PHASE SYNCHRONIZATION ---
        // Ensure walk, jog, run, and catwalk animation loops stay synchronized in phase.
        // This keeps the character's footsteps perfectly step-matched inside the Blend Space.
        const runningLocoActions = [
          walkActionRef.current,
          joggingActionRef.current,
          runActionRef.current,
          catwalkActionRef.current
        ].filter(act => act && act.isRunning() && act.getEffectiveWeight() > 0.05);

        if (runningLocoActions.length > 1) {
          const primaryAction = runningLocoActions.reduce((prev, curr) => 
            (prev!.getEffectiveWeight() > curr!.getEffectiveWeight()) ? prev : curr
          );
          if (primaryAction) {
            const progressRatio = primaryAction.time / primaryAction.getClip().duration;
            runningLocoActions.forEach(act => {
              if (act && act !== primaryAction) {
                act.time = progressRatio * act.getClip().duration;
              }
            });
          }
        }
      } else if (isHugging) {
        // Stop walk time
        walkTime.current = THREE.MathUtils.lerp(
          walkTime.current,
          0,
          10 * delta,
        );

        // Reset rotation tracking & speed tracking
        _tempEuler.setFromQuaternion(_currentQuat, 'YXZ');
        prevRotationYRef.current = _tempEuler.y;
        prevHorizSpeedRef.current = 0;
        lerpedHorizSpeedRef.current = 0;

        const locoActions = [
          walkActionRef,
          catwalkActionRef,
          joggingActionRef,
          runActionRef,
          turnLeftActionRef,
          turnRightActionRef,
          turnaroundActionRef,
          walkToRunActionRef,
        ];

        locoActions.forEach((ref) => {
          const action = ref.current;
          if (action && action.isRunning()) {
            action.fadeOut(0.2);
          }
        });
        // Since it is a self-hug, we do not require facing or turning towards other players or Gemma!
      } else {
        // Return to idle
        walkTime.current = THREE.MathUtils.lerp(
          walkTime.current,
          0,
          10 * delta,
        );

        // Reset rotation tracking & speed tracking
        _tempEuler.setFromQuaternion(_currentQuat, 'YXZ');
        prevRotationYRef.current = _tempEuler.y;
        prevHorizSpeedRef.current = 0;
        lerpedHorizSpeedRef.current = 0;

        const locoActions = [
          walkActionRef,
          catwalkActionRef,
          joggingActionRef,
          runActionRef,
          turnLeftActionRef,
          turnRightActionRef,
          turnaroundActionRef,
          walkToRunActionRef,
        ];

        locoActions.forEach((ref) => {
          const action = ref.current;
          if (action) {
            const currentWeight = action.getEffectiveWeight();
            if (currentWeight > 0.01) {
              action.setEffectiveWeight(
                THREE.MathUtils.lerp(currentWeight, 0, 15 * delta)
              );
            } else if (action.isRunning()) {
              action.stop();
            }
          }
        });
      }

      // 2.5 Collision Detection with Crystals
      const crystals = useStore.getState().crystals || {};
      const crystalCheckPos = rigidBodyRef.current.translation();
      if (crystalCheckPos) {
        Object.values(crystals).forEach((crystal) => {
          if (!crystal || !crystal.position) return;
          const dx = crystalCheckPos.x - crystal.position[0];
          const dy = crystalCheckPos.y - crystal.position[1];
          const dz = crystalCheckPos.z - crystal.position[2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < 2.0) {
            // Collection radius
            syncService.collectCrystal(crystal.id);
          }
        });
      }

      // 3. Update Animation Mixer Early so we can override it additively
      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }

      // 4. Procedural Kinematics (Walk Cycle)
      const hips = vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Hips);
      const spine = vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Spine);
      const chest = vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Chest);
      const neck = vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Neck);

      const leftLeg = vrm.humanoid?.getNormalizedBoneNode(
        VRMHumanBoneName.LeftUpperLeg,
      );
      const rightLeg = vrm.humanoid?.getNormalizedBoneNode(
        VRMHumanBoneName.RightUpperLeg,
      );
      const leftKnee = vrm.humanoid?.getNormalizedBoneNode(
        VRMHumanBoneName.LeftLowerLeg,
      );
      const rightKnee = vrm.humanoid?.getNormalizedBoneNode(
        VRMHumanBoneName.RightLowerLeg,
      );
      const leftFoot = vrm.humanoid?.getNormalizedBoneNode(
        VRMHumanBoneName.LeftFoot,
      );
      const rightFoot = vrm.humanoid?.getNormalizedBoneNode(
        VRMHumanBoneName.RightFoot,
      );

      const leftArm = vrm.humanoid?.getNormalizedBoneNode(
        VRMHumanBoneName.LeftUpperArm,
      );
      const rightArm = vrm.humanoid?.getNormalizedBoneNode(
        VRMHumanBoneName.RightUpperArm,
      );
      const leftLowerArm = vrm.humanoid?.getNormalizedBoneNode(
        VRMHumanBoneName.LeftLowerArm,
      );
      const rightLowerArm = vrm.humanoid?.getNormalizedBoneNode(
        VRMHumanBoneName.RightLowerArm,
      );
      const leftHand = vrm.humanoid?.getNormalizedBoneNode(
        VRMHumanBoneName.LeftHand,
      );
      const rightHand = vrm.humanoid?.getNormalizedBoneNode(
        VRMHumanBoneName.RightHand,
      );

      if (
        hips &&
        leftLeg &&
        rightLeg &&
        leftKnee &&
        rightKnee &&
        leftArm &&
        rightArm &&
        spine
      ) {
        const wt = walkTime.current;

        // --- HARDWARE TRACKING (VR/XR) ---
        if (isPresenting) {
          // 1. Head Tracking
          const head = vrm.humanoid?.getNormalizedBoneNode(
            VRMHumanBoneName.Head,
          );
          if (head) {
            // Convert camera world rotation to head local rotation
            state.camera.getWorldQuaternion(_cameraWorldQuat);

            if (head.parent) {
              head.parent.getWorldQuaternion(_parentWorldQuat);
              const localQuat = _parentWorldQuat
                .invert()
                .multiply(_cameraWorldQuat);
              head.quaternion.copy(localQuat);
            }
          }

          // 2. Hand Tracking
          if (leftHand && leftController?.object) {
            leftController.object.getWorldQuaternion(_controllerWorldQuat);

            if (leftHand.parent) {
              leftHand.parent.getWorldQuaternion(_parentWorldQuat);
              const localQuat = _parentWorldQuat
                .invert()
                .multiply(_controllerWorldQuat);

              // Base offset for most controllers (Oculus, etc.)
              _offsetQuat.setFromAxisAngle(_xAxis, Math.PI / 2);

              // Valve Index (Knuckles) specific adjustment
              // Knuckles grip is slightly different, usually needs a slight X rotation adjustment
              if (
                leftController.inputSource?.profiles?.includes("valve-index") ||
                leftController.inputSource?.profiles?.includes("htc-vive")
              ) {
                // Rotate -30 degrees on X to align better with natural grip
                _indexOffsetQuat.setFromAxisAngle(_xAxis, -Math.PI / 6);
                _offsetQuat.multiply(_indexOffsetQuat);
              }

              localQuat.multiply(_offsetQuat);

              leftHand.quaternion.copy(localQuat);
            }

            // Arm IK using Two-Bone solver
            if (leftArm && leftLowerArm && leftHand) {
              leftController.object.getWorldPosition(_targetPos);
              
              // Pole target for elbow: Down and slightly back from the shoulder
              leftArm.getWorldPosition(_worldPos);
              _poleTarget.copy(_worldPos).add(_tempOffsetVec.set(-0.2, -1.0, -0.2));
              
              solveTwoBoneIK(leftArm, leftLowerArm, leftHand, _targetPos, _poleTarget);
            }
          }

          if (rightHand && rightController?.object) {
            rightController.object.getWorldQuaternion(_controllerWorldQuat);

            if (rightHand.parent) {
              rightHand.parent.getWorldQuaternion(_parentWorldQuat);
              const localQuat = _parentWorldQuat
                .invert()
                .multiply(_controllerWorldQuat);

              // Base offset
              _offsetQuat.setFromAxisAngle(_xAxis, Math.PI / 2);

              // Valve Index (Knuckles) specific adjustment
              if (
                rightController.inputSource?.profiles?.includes(
                  "valve-index",
                ) ||
                rightController.inputSource?.profiles?.includes("htc-vive")
              ) {
                _indexOffsetQuat.setFromAxisAngle(_xAxis, -Math.PI / 6);
                _offsetQuat.multiply(_indexOffsetQuat);
              }

              localQuat.multiply(_offsetQuat);

              rightHand.quaternion.copy(localQuat);
            }

            // Arm IK using Two-Bone solver
            if (rightArm && rightLowerArm && rightHand) {
              rightController.object.getWorldPosition(_targetPos);
              
              // Pole target for elbow: Down and slightly back from the shoulder
              rightArm.getWorldPosition(_worldPos);
              _poleTarget.copy(_worldPos).add(_tempOffsetVec.set(0.2, -1.0, -0.2));
              
              solveTwoBoneIK(rightArm, rightLowerArm, rightHand, _targetPos, _poleTarget);
            }
          }

          // Keep legs idle while in VR (unless moving)
          if (isMoving) {
            leftLeg.rotation.x = Math.sin(wt) * 0.6;
            rightLeg.rotation.x = Math.sin(wt + Math.PI) * 0.6;
            leftKnee.rotation.x = Math.max(0, -Math.sin(wt - 0.3)) * 1.0;
            rightKnee.rotation.x =
              Math.max(0, -Math.sin(wt + Math.PI - 0.3)) * 1.0;
          } else {
            leftLeg.rotation.x = THREE.MathUtils.lerp(
              leftLeg.rotation.x,
              0,
              10 * delta,
            );
            rightLeg.rotation.x = THREE.MathUtils.lerp(
              rightLeg.rotation.x,
              0,
              10 * delta,
            );
            leftKnee.rotation.x = THREE.MathUtils.lerp(
              leftKnee.rotation.x,
              0,
              10 * delta,
            );
            rightKnee.rotation.x = THREE.MathUtils.lerp(
              rightKnee.rotation.x,
              0,
              10 * delta,
            );
          }
        } else {
          // --- NON-VR PROCEDURAL ANIMATION ---
          const gesture = useStore.getState().localUserGesture;
          const isJumping = isJumpingStateAction;
          const isDropping = dropActionRef.current ? dropActionRef.current.getEffectiveWeight() > 0.01 || dropActionRef.current.isRunning() : false;
          const isPlayingAnim = gesture === "wave" || gesture === "cheer" || gesture === "dance" || gesture === "sign" || gesture === "hug" || isJumping || isDropping; // Add more full-body Cartwheel animations here later

          const vrmaLocomotionWeight =
            (walkActionRef.current?.getEffectiveWeight() || 0) +
            (joggingActionRef.current?.getEffectiveWeight() || 0) +
            (runActionRef.current?.getEffectiveWeight() || 0) +
            (catwalkActionRef.current?.getEffectiveWeight() || 0);

          const hasVRMALocomotion = !!(walkActionRef.current && walkActionRef.current.getClip());
          const runProceduralWalk = !isPlayingAnim && !hasVRMALocomotion && (isMoving || wt > 0.01);
          // Seamless blend window from idle to walk: complete fadeout at 0.1 m/s to prevent bone clobbering/fighting with VRMA locomotion
          const idleFactor = Math.max(0, 1.0 - (lerpedHorizSpeedRef.current / 0.1));

          if (!isPlayingAnim) {
            if (runProceduralWalk) {
              // --- ENHANCED WALK CYCLE (Desktop Fallback) ---

              // Adjust amplitude based on speed
              const speedFactor = Math.min(1.0, speed / 5.0);
              const swayAmp = 0.2 * speedFactor;
              const legAmp = 0.8 * speedFactor;
              const armAmp = 0.7 * speedFactor;

              // 1. Pelvis/Hips (Weight shift and twist)
              hips.rotation.y = Math.sin(wt) * swayAmp; // Twist with legs
              hips.rotation.z = Math.sin(wt * 2) * (swayAmp * 0.5); // Drop weight on planted foot
              hips.rotation.x =
                0.08 * speedFactor + Math.sin(wt * 2 + Math.PI) * 0.03; // Slight forward lean + bobbing

              // 2. Spine & Chest (Counter-rotation for balance)
              spine.rotation.y = -Math.sin(wt) * (swayAmp * 0.8);
              spine.rotation.x = Math.sin(wt * 2) * 0.03; // Spine flexes with steps
              if (chest) chest.rotation.y = -Math.sin(wt) * (swayAmp * 0.4);
              if (neck) neck.rotation.y = Math.sin(wt) * (swayAmp * 0.3); // Head stays forward
              if (neck) neck.rotation.x = -Math.sin(wt * 2) * 0.02; // Head bobs slightly opposite to spine

              // 3. Legs (More natural swing and snap)
              leftLeg.rotation.x =
                Math.sin(wt) * legAmp + Math.sin(wt * 2) * 0.1 * legAmp;
              rightLeg.rotation.x =
                Math.sin(wt + Math.PI) * legAmp +
                Math.sin((wt + Math.PI) * 2) * 0.1 * legAmp;

              // Knees bend sharply when swinging forward, straighten when planted
              leftKnee.rotation.x =
                Math.max(0, Math.sin(wt + Math.PI / 2.5)) * (legAmp * 1.8);
              rightKnee.rotation.x =
                Math.max(0, Math.sin(wt + Math.PI + Math.PI / 2.5)) *
                (legAmp * 1.8);

              // Feet flex up to clear the ground, point down slightly when pushing off
              if (leftFoot)
                leftFoot.rotation.x =
                  Math.sin(wt + Math.PI / 4) * (legAmp * 0.6);
              if (rightFoot)
                rightFoot.rotation.x =
                  Math.sin(wt + Math.PI + Math.PI / 4) * (legAmp * 0.6);

              // 4. Arms (Natural pendulum with elbow bend)
              leftArm.rotation.z = -1.15 + speedFactor * 0.1;
              leftArm.rotation.x = Math.sin(wt + Math.PI) * armAmp;
              leftArm.rotation.y = Math.sin(wt + Math.PI) * (armAmp * 0.2); // Arm twists slightly inward

              rightArm.rotation.z = 1.15 - speedFactor * 0.1;
              rightArm.rotation.x = Math.sin(wt) * armAmp;
              rightArm.rotation.y = Math.sin(wt) * (armAmp * 0.2);

              // Elbows bend when swinging forward, straighten when swinging back
              if (leftLowerArm && rightLowerArm) {
                leftLowerArm.rotation.x =
                  -0.2 + Math.max(0, Math.sin(wt + Math.PI)) * -(armAmp * 1.2);
                rightLowerArm.rotation.x =
                  -0.2 + Math.max(0, Math.sin(wt)) * -(armAmp * 1.2);

                // Reset other axes
                leftLowerArm.rotation.y = THREE.MathUtils.lerp(
                  leftLowerArm.rotation.y,
                  0,
                  10 * delta,
                );
                leftLowerArm.rotation.z = THREE.MathUtils.lerp(
                  leftLowerArm.rotation.z,
                  0,
                  10 * delta,
                );
                rightLowerArm.rotation.y = THREE.MathUtils.lerp(
                  rightLowerArm.rotation.y,
                  0,
                  10 * delta,
                );
                rightLowerArm.rotation.z = THREE.MathUtils.lerp(
                  rightLowerArm.rotation.z,
                  0,
                  10 * delta,
                );
              }

              // Reset hands during walk
              if (leftHand && rightHand) {
                leftHand.rotation.set(0, 0, 0);
                rightHand.rotation.set(0, 0, 0);
              }
            } else {
              // --- ENHANCED IDLE & VRMA BLENDING ---
              const time = state.clock.elapsedTime;
              const blendRate = 10 * delta * idleFactor;

              if (blendRate > 0.001) {
                // Smoothly reset walk rotations
                hips.rotation.y = THREE.MathUtils.lerp(
                  hips.rotation.y,
                  0,
                  blendRate,
                );
                hips.rotation.z = THREE.MathUtils.lerp(
                  hips.rotation.z,
                  0,
                  blendRate,
                );
                hips.rotation.x = THREE.MathUtils.lerp(
                  hips.rotation.x,
                  0,
                  blendRate,
                );

                // Reset spine fully with idle sway
                spine.rotation.x = THREE.MathUtils.lerp(
                  spine.rotation.x,
                  Math.sin(time * 2) * 0.02,
                  blendRate,
                );
                spine.rotation.y = THREE.MathUtils.lerp(
                  spine.rotation.y,
                  Math.cos(time * 1.5) * 0.02,
                  blendRate,
                );
                spine.rotation.z = THREE.MathUtils.lerp(
                  spine.rotation.z,
                  0,
                  blendRate,
                );

                if (chest) {
                  chest.rotation.x = THREE.MathUtils.lerp(
                    chest.rotation.x,
                    Math.sin(time * 2) * 0.02,
                    blendRate,
                  );
                  chest.rotation.y = THREE.MathUtils.lerp(
                    chest.rotation.y,
                    0,
                    blendRate,
                  );
                  chest.rotation.z = THREE.MathUtils.lerp(
                    chest.rotation.z,
                    0,
                    blendRate,
                  );
                }

                if (neck) {
                  neck.rotation.x = THREE.MathUtils.lerp(
                    neck.rotation.x,
                    0,
                    blendRate,
                  );
                  neck.rotation.y = THREE.MathUtils.lerp(
                    neck.rotation.y,
                    0,
                    blendRate,
                  );
                  neck.rotation.z = THREE.MathUtils.lerp(
                    neck.rotation.z,
                    0,
                    blendRate,
                  );
                }

                leftLeg.rotation.x = THREE.MathUtils.lerp(
                  leftLeg.rotation.x,
                  0,
                  blendRate,
                );
                rightLeg.rotation.x = THREE.MathUtils.lerp(
                  rightLeg.rotation.x,
                  0,
                  blendRate,
                );
                leftKnee.rotation.x = THREE.MathUtils.lerp(
                  leftKnee.rotation.x,
                  0,
                  blendRate,
                );
                rightKnee.rotation.x = THREE.MathUtils.lerp(
                  rightKnee.rotation.x,
                  0,
                  blendRate,
                );
                if (leftFoot)
                  leftFoot.rotation.x = THREE.MathUtils.lerp(
                    leftFoot.rotation.x,
                    0,
                    blendRate,
                  );
                if (rightFoot)
                  rightFoot.rotation.x = THREE.MathUtils.lerp(
                    rightFoot.rotation.x,
                    0,
                    blendRate,
                  );

                leftArm.rotation.x = THREE.MathUtils.lerp(
                  leftArm.rotation.x,
                  0,
                  blendRate,
                );
                leftArm.rotation.y = THREE.MathUtils.lerp(
                  leftArm.rotation.y,
                  0,
                  blendRate,
                );
                leftArm.rotation.z = THREE.MathUtils.lerp(
                  leftArm.rotation.z,
                  -1.1 + Math.sin(time * 1.2) * 0.02,
                  blendRate,
                );

                rightArm.rotation.x = THREE.MathUtils.lerp(
                  rightArm.rotation.x,
                  0,
                  blendRate,
                );
                rightArm.rotation.y = THREE.MathUtils.lerp(
                  rightArm.rotation.y,
                  0,
                  blendRate,
                );
                rightArm.rotation.z = THREE.MathUtils.lerp(
                  rightArm.rotation.z,
                  1.1 - Math.sin(time * 1.2) * 0.02,
                  blendRate,
                );

                if (leftLowerArm && rightLowerArm) {
                  leftLowerArm.rotation.x = THREE.MathUtils.lerp(
                    leftLowerArm.rotation.x,
                    -0.1,
                    blendRate,
                  );
                  leftLowerArm.rotation.y = THREE.MathUtils.lerp(
                    leftLowerArm.rotation.y,
                    0,
                    blendRate,
                  );
                  leftLowerArm.rotation.z = THREE.MathUtils.lerp(
                    leftLowerArm.rotation.z,
                    0,
                    blendRate,
                  );

                  rightLowerArm.rotation.x = THREE.MathUtils.lerp(
                    rightLowerArm.rotation.x,
                    -0.1,
                    blendRate,
                  );
                  rightLowerArm.rotation.y = THREE.MathUtils.lerp(
                    rightLowerArm.rotation.y,
                    0,
                    blendRate,
                  );
                  rightLowerArm.rotation.z = THREE.MathUtils.lerp(
                    rightLowerArm.rotation.z,
                    0,
                    blendRate,
                  );
                }

                if (leftHand && rightHand) {
                  leftHand.rotation.x = THREE.MathUtils.lerp(
                    leftHand.rotation.x,
                    -0.1,
                    blendRate,
                  );
                  leftHand.rotation.y = THREE.MathUtils.lerp(
                    leftHand.rotation.y,
                    0,
                    blendRate,
                  );
                  leftHand.rotation.z = THREE.MathUtils.lerp(
                    leftHand.rotation.z,
                    0,
                    blendRate,
                  );

                  rightHand.rotation.x = THREE.MathUtils.lerp(
                    rightHand.rotation.x,
                    -0.1,
                    blendRate,
                  );
                  rightHand.rotation.y = THREE.MathUtils.lerp(
                    rightHand.rotation.y,
                    0,
                    blendRate,
                  );
                  rightHand.rotation.z = THREE.MathUtils.lerp(
                    rightHand.rotation.z,
                    0,
                    blendRate,
                  );
                }
              }
            } // Close idle block
          }

            // 3.5 Gestures (Overrides walk/idle for specific bones)
            const t = state.clock.elapsedTime * 12;

            if (gesture === "dance" && (!danceActionRef.current || !danceActionRef.current.isRunning())) {
              const beat = Math.sin(t * 1.2);

              // Hips twist
              hips.rotation.y = beat * 0.6;
              // Spine counter-twist
              spine.rotation.y = -beat * 0.3;

              // Arms sway in opposition
              leftArm.rotation.z = THREE.MathUtils.lerp(
                leftArm.rotation.z,
                -1.0 + Math.cos(t * 1.2) * 0.5,
                10 * delta,
              );
              leftArm.rotation.x = THREE.MathUtils.lerp(
                leftArm.rotation.x,
                0.5,
                10 * delta,
              );

              rightArm.rotation.z = THREE.MathUtils.lerp(
                rightArm.rotation.z,
                1.0 + Math.cos(t * 1.2) * 0.5,
                10 * delta,
              );
              rightArm.rotation.x = THREE.MathUtils.lerp(
                rightArm.rotation.x,
                0.5,
                10 * delta,
              );

              // Head bob
              if (neck) {
                neck.rotation.x = Math.abs(Math.sin(t * 2.4)) * 0.15;
                neck.rotation.y = beat * 0.1;
              }

              // Slight hop on beat
              if (!isMoving && Math.abs(linvel.y) < 0.1) {
                groupRef.current.position.y = Math.abs(Math.cos(t * 1.2)) * 0.1;
              }
            } // End gesture === 'dance'
        } // End non-vr else
      } // End if (hips)

      // 4. Broadcast Kinematic Delta at 15Hz
      const bonesData: Record<string, [number, number, number, number]> = {};
      SYNC_BONES.forEach((boneName) => {
        const node = vrm.humanoid?.getNormalizedBoneNode(boneName);
        if (node) {
          // Extract Local Rotation (Quaternion)
          bonesData[boneName] = [
            node.quaternion.x,
            node.quaternion.y,
            node.quaternion.z,
            node.quaternion.w,
          ];
        }
      });

      // Update Kinematic Colliders for Local User
      if (isLocal) {
        const updateCollider = (
          boneName: VRMHumanBoneName,
          colliderRef: React.RefObject<RapierRigidBody>,
        ) => {
          const bone = vrm.humanoid?.getNormalizedBoneNode(boneName);
          if (bone && colliderRef.current) {
            bone.getWorldPosition(_worldPos);
            colliderRef.current.setNextKinematicTranslation(_worldPos);
          }
        };

        updateCollider(VRMHumanBoneName.LeftHand, leftHandColliderRef);
        updateCollider(VRMHumanBoneName.RightHand, rightHandColliderRef);
        updateCollider(VRMHumanBoneName.LeftFoot, leftFootColliderRef);
        updateCollider(VRMHumanBoneName.RightFoot, rightFootColliderRef);
      }

      const pos = rigidBodyRef.current.translation();
      const rotQ = rigidBodyRef.current.rotation();
      // Avoid Euler allocation if possible, or just use the quaternion
      // We broadcast euler for rotation, let's just use Euler but avoid allocating every frame if we can
      // Actually, we can just use a shared Euler
      _tempEuler.setFromQuaternion(
        _currentQuat.set(rotQ.x, rotQ.y, rotQ.z, rotQ.w),
      );

      const stateUserPos = useStore.getState().localUserPosition || [0, 0, 0];
      const posDiffSq = (pos.x - stateUserPos[0])**2 + (pos.y - stateUserPos[1])**2 + (pos.z - stateUserPos[2])**2;
      const currentRot = useStore.getState().localUserRotation || [0, 0, 0];
      const rotDistSq = (_tempEuler.x - currentRot[0])**2 + (_tempEuler.y - currentRot[1])**2 + (_tempEuler.z - currentRot[2])**2;

      if (posDiffSq > 0.0001 || rotDistSq > 0.0001) {
        useStore.getState().setLocalUserPosition([pos.x, pos.y, pos.z]);
        useStore.getState().setLocalUserRotation([_tempEuler.x, _tempEuler.y, _tempEuler.z]);
      }

      // Sync XR origin to avatar position so the player moves with the avatar
      if (isPresenting && xrOrigin) {
        xrOrigin.position.set(pos.x, pos.y, pos.z);
      }

      syncService.broadcastBoneData({
        bones: bonesData,
        vowel_a: vowelA,
        vowel_i: vowelI,
        vowel_o: vowelO,
        position: [pos.x, pos.y, pos.z],
        rotation: [_tempEuler.x, _tempEuler.y, _tempEuler.z],
      });
    } else {
      // Remote User: Client-Side SLERP

      // Distance Throttling: If the user is too far away, don't do complex bone math
      const currentPos = rigidBodyRef.current.translation();
      const localPosArray = useStore.getState().localUserPosition || [0, 0, 0];
      _localPos.set(localPosArray[0], localPosArray[1], localPosArray[2]);
      const dist = currentPos
        ? _currentPosVec
            .set(currentPos.x, currentPos.y, currentPos.z)
            .distanceTo(_localPos)
        : 0;

      const slerpFactor = 10 * delta; // Adjust for smoothness

      const globalState = useStore.getState();
      const threshold = globalState.performanceMode ? 6 : 14;
      const isDistantCurrent = dist > threshold;

      // Control VRM scene visibility dynamically for draw call instancing
      if (vrm && vrm.scene) {
        vrm.scene.visible = !isDistantCurrent;
      }

      // Only do complex bone math if within the high-fidelity visibility threshold
      if (dist <= threshold) {
        for (const boneName in targetBones.current) {
          const targetQuat = targetBones.current[boneName];
          if (targetQuat) {
            const node = vrm.humanoid?.getNormalizedBoneNode(
              boneName as VRMHumanBoneName,
            );
            if (node) {
              node.quaternion.slerp(targetQuat, slerpFactor);
            }
          }
        }

        // Interpolate blendshapes
        if (vrm.expressionManager) {
          // We only sync 'aa' remotely since the other vowels are derived procedurally.
          // BUT since we synced them, let's use them!
          // Wait, targetVowelA comes from listener. Where are I and O stored?
          // I didn't add targetVowelI and targetVowelO refs, so let's just derive them locally for remote players like we do for Gemma!
          const currentVowelA = vrm.expressionManager.getValue("aa") || 0;
          const newA = THREE.MathUtils.lerp(
            currentVowelA,
            targetVowelA.current,
            slerpFactor,
          );

          const t = state.clock.elapsedTime;
          const t1 = Math.abs(Math.sin(t * 15));
          const t2 = Math.abs(Math.cos(t * 10));
          const t3 = Math.abs(Math.sin(t * 8 + Math.PI));

          vrm.expressionManager.setValue("aa", newA * t1);
          vrm.expressionManager.setValue("ih", newA * 0.6 * t2); // Derived
          vrm.expressionManager.setValue("ou", newA * 0.8 * t3); // Derived
        }
      }

      // Always interpolate position and rotation so they don't teleport
      if (currentPos && targetPosition.current) {
        _nextPosVec
          .set(currentPos.x, currentPos.y, currentPos.z)
          .lerp(targetPosition.current, slerpFactor);
        rigidBodyRef.current.setNextKinematicTranslation(_nextPosVec);
      }

      if (targetRotation.current) {
        const currentRot = rigidBodyRef.current.rotation();
        _currentQuat.set(
          currentRot.x,
          currentRot.y,
          currentRot.z,
          currentRot.w,
        );
        _currentQuat.slerp(targetRotation.current, slerpFactor);
        rigidBodyRef.current.setNextKinematicRotation(_currentQuat);
      }
    }

    // 5. Audio Visualizer (Speech Ring)
    const speakingVolume = isLocal
      ? vrm.expressionManager?.getValue("aa") || 0
      : targetVowelA.current;
    if (auraRef.current) {
      const scale = 1 + speakingVolume * 0.8;
      auraRef.current.scale.set(scale, scale, scale);
      (auraRef.current.material as THREE.MeshBasicMaterial).opacity =
        speakingVolume * 0.6;
    }

    // 6. (Mixer updated early)

    // --- Environmental Wind Effect on Spring Bones ---
    if (vrm.springBoneManager) {
      const t = state.clock.elapsedTime;
      const windTime = t * 1.5;
      const stormCycle = Math.max(0, Math.sin(t * 0.02)); // 0 to 1, peaks every ~150s
      const windMultiplier = 1.0 + stormCycle * 1.5; // Reduced from 5.0 so it doesn't stick straight out

      // Complex wind pattern using sine waves
      const windX =
        (Math.sin(windTime) * 0.15 + Math.sin(windTime * 0.3) * 0.1) *
        windMultiplier;
      const windZ =
        (Math.cos(windTime * 0.8) * 0.15 + Math.sin(windTime * 0.5) * 0.1) *
        windMultiplier;

      vrm.springBoneManager.joints.forEach((joint) => {
        // Apply wind force by modifying the gravity direction (use -2 so it mostly points down)
        joint.settings.gravityDir.set(windX, -2, windZ).normalize();
      });
    }

    // --- Autonomous Eye Tracking, Blinking, and Saccades (Runs on ALL clients for ALL avatars) ---
    const currentTranslation = rigidBodyRef.current.translation();
    const posVec = _tempAvatarPos.set(
      currentTranslation.x,
      currentTranslation.y,
      currentTranslation.z,
    );
    const time = state.clock.elapsedTime;
    const globalState = useStore.getState();

    // Distance to local user (if this is a remote avatar)
    const localUserVec = _localPos.set(
      globalState.localUserPosition[0],
      globalState.localUserPosition[1],
      globalState.localUserPosition[2],
    );
    const distToLocal = isLocal ? 0 : posVec.distanceTo(localUserVec);
    const threshold = globalState.performanceMode ? 6 : 14;

    // Only process heavy visuals if we are close enough to the local camera
    if (distToLocal <= threshold) {
      if (vrm.expressionManager) {
        // Blinking
        if (
          time > blinkStateRef.current.nextBlink &&
          !blinkStateRef.current.isBlinking
        ) {
          blinkStateRef.current.isBlinking = true;
          blinkStateRef.current.blinkStartTime = time;
        }

        if (blinkStateRef.current.isBlinking) {
          const blinkElapsed = time - blinkStateRef.current.blinkStartTime;
          const blinkDuration = 0.15;
          if (blinkElapsed < blinkDuration) {
            const blinkValue = Math.sin(
              (blinkElapsed / blinkDuration) * Math.PI,
            );
            vrm.expressionManager.setValue("blink", blinkValue); // Using raw blendshape name
          } else {
            vrm.expressionManager.setValue("blink", 0);
            blinkStateRef.current.isBlinking = false;
            blinkStateRef.current.nextBlink = time + 2.0 + Math.random() * 4.0;
          }
        }
      }

      // Eye tracking LookAt target
      if (vrm.lookAt && lookAtTargetRef.current) {
        // Find closest target (either another user or Gemma)
        let closestPos = posVec.clone();
        let minDistToOther = Infinity;

        // Check if we should look at Gemma
        if (globalState.npcPosition) {
          const gemmaPos = _targetPos.set(
            globalState.npcPosition[0],
            globalState.npcPosition[1],
            globalState.npcPosition[2],
          );
          const d = posVec.distanceTo(gemmaPos);
          if (d < minDistToOther && d > 0.5) {
            // don't look at self
            minDistToOther = d;
            closestPos.copy(gemmaPos);
          }
        }

        // Check if we should look at other users
        if (isLocal) {
          // Local player looks at closest remote user
          Object.values(globalState.users).forEach((u) => {
            if (u.id !== userId && u.position) {
              const remotePos = _worldPos.set(
                u.position[0],
                u.position[1],
                u.position[2],
              );
              const d = posVec.distanceTo(remotePos);
              if (d < minDistToOther && d > 0.5) {
                minDistToOther = d;
                closestPos.copy(remotePos);
              }
            }
          });
        } else {
          // Remote players look at the local player (simplest, visually pleasing)
          const d = posVec.distanceTo(localUserVec);
          if (d < minDistToOther && d > 0.5) {
            minDistToOther = d;
            closestPos.copy(localUserVec);
          }
        }

        // Saccade calculations
        if (time > saccadeStateRef.current.lastChangeTime) {
          saccadeStateRef.current.lastChangeTime =
            time + 0.5 + Math.random() * 2.0;
          saccadeStateRef.current.targetOffset.set(
            (Math.random() - 0.5) * 0.4,
            (Math.random() - 0.5) * 0.2 + 1.5, // Target roughly head height
            (Math.random() - 0.5) * 0.4,
          );
        }

        if (minDistToOther < 15) {
          // Only track if someone is relatively close
          const targetPoint = closestPos
            .clone()
            .add(saccadeStateRef.current.targetOffset);
          lookAtTargetRef.current.position.lerp(targetPoint, 5 * delta);
        } else {
          // Look straight ahead lazily if nobody is close
          _targetPos
            .set(0, 1.5, 5)
            .applyQuaternion(groupRef.current.quaternion)
            .add(posVec);
          lookAtTargetRef.current.position.lerp(_targetPos, 2 * delta);
        }
      }
    }

    vrm.update(delta);
  });

  return (
    <>
      <RigidBody
        ref={rigidBodyRef}
        type={isLocal ? "dynamic" : "kinematicPosition"}
        lockRotations
        colliders={false}
        position={isLocal ? [initialLocalPosition[0], 5, initialLocalPosition[2]] : initialRemotePosition}
        friction={0} // No friction so we don't get stuck on walls
        collisionGroups={interactionGroups(1, [0])}
        userData={{ isLocal }}
      >
        <CapsuleCollider args={[0.5, 0.3]} position={[0, 0.8, 0]} />
        <group ref={groupRef}>
          {vrm ? (
            <>
              <primitive object={vrm.scene} visible={!(isLocal && isFirstPerson)} />
              <mesh
                ref={auraRef}
                position={[0, 0.05, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <ringGeometry args={[0.6, 0.8, 32]} />
                <meshBasicMaterial
                  color="#34d399"
                  transparent
                  opacity={0}
                  side={THREE.DoubleSide}
                />
              </mesh>
              <SignatureHugEffect active={isLocal && localUserGesture === "hug"} />
              {!isLocal &&
                vrm.humanoid.getNormalizedBoneNode("head") &&
                createPortal(
                  <positionalAudio
                    ref={positionalAudioRef}
                    args={[audioListener]}
                  />,
                  vrm.humanoid.getNormalizedBoneNode("head")!,
                )}
            </>
          ) : (
            // Futuristic glowing holographic loader placeholder
            <mesh position={[0, 0.9, 0]}>
              <capsuleGeometry args={[0.3, 0.9, 8, 16]} />
              <meshBasicMaterial 
                color={isLocal ? "#10b981" : "#06b6d4"} 
                wireframe 
                transparent 
                opacity={0.65} 
                toneMapped={false}
              />
            </mesh>
          )}

          {/* Persistent Name tag rendering even during VRM model download */}
          {!isLocal && (
            <Html
              position={[0, 2.5, 0]} // Fixed height above player origin
              center
              distanceFactor={15}
              zIndexRange={[9, 0]}
              style={{ pointerEvents: "none" }}
            >
              <div className="flex flex-col items-center justify-center select-none">
                <div className="bg-black/75 backdrop-blur-md text-white px-3 py-1 rounded-lg text-sm font-bold font-mono border border-cyan-500/30 shadow-lg flex items-center gap-1.5">
                  {!vrm && (
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                    </span>
                  )}
                  Player {playerNumber}
                </div>
                <div className="text-white/95 text-xs mt-1 font-semibold drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] font-sans bg-zinc-950/40 px-2 py-0.5 rounded flex items-center gap-1">
                  <span>{userName}</span>
                  {!vrm && <span className="text-[10px] text-cyan-400 font-normal animate-pulse">(Downloading VRM...)</span>}
                </div>
              </div>
            </Html>
          )}

          <ChatBubble userId={userId} />
        </group>
      </RigidBody>

      {/* Kinematic Colliders for Local User */}
      {isLocal && (
        <>
          <RigidBody
            ref={leftHandColliderRef}
            type="kinematicPosition"
            colliders="ball"
            collisionGroups={interactionGroups(2, [0])}
          >
            <mesh visible={false}>
              <sphereGeometry args={[0.1]} />
            </mesh>
          </RigidBody>
          <RigidBody
            ref={rightHandColliderRef}
            type="kinematicPosition"
            colliders="ball"
            collisionGroups={interactionGroups(2, [0])}
          >
            <mesh visible={false}>
              <sphereGeometry args={[0.1]} />
            </mesh>
          </RigidBody>
          <RigidBody
            ref={leftFootColliderRef}
            type="kinematicPosition"
            colliders="ball"
            collisionGroups={interactionGroups(2, [0])}
          >
            <mesh visible={false}>
              <sphereGeometry args={[0.15]} />
            </mesh>
          </RigidBody>
          <RigidBody
            ref={rightFootColliderRef}
            type="kinematicPosition"
            colliders="ball"
            collisionGroups={interactionGroups(2, [0])}
          >
            <mesh visible={false}>
              <sphereGeometry args={[0.15]} />
            </mesh>
          </RigidBody>
        </>
      )}
    </>
  );
};
