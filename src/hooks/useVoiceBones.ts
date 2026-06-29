import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { useStore } from "../store/useStore";

export function useVoiceBones(vrm: VRM | null, isLocal: boolean) {
  const tailBonesRef = useRef<THREE.Object3D[]>([]);
  const catEarBonesRef = useRef<{ left: THREE.Object3D[]; right: THREE.Object3D[] }>({ left: [], right: [] });
  const earTwitchStateRef = useRef({
    timer: 1.5,
    activeSide: "none" as "left" | "right" | "none",
    twitchStart: 0,
  });

  const micStream = useStore((state) => state.micStream);
  const isMicMuted = useStore((state) => state.isMicMuted);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  // Discover tail and ear bones
  useEffect(() => {
    if (!vrm) return;

    const foundTailBones: THREE.Object3D[] = [];
    const foundLeftEarBones: THREE.Object3D[] = [];
    const foundRightEarBones: THREE.Object3D[] = [];

    vrm.scene.traverse((obj) => {
      const name = obj.name.toLowerCase();
      const isTail =
        name.includes("tail") ||
        name.includes("shippo") ||
        name.includes("shipp") ||
        name.includes("tale") ||
        name.includes("尻尾") ||
        name.includes("しっぽ") ||
        name.includes("シッポ");

      if (isTail) {
        foundTailBones.push(obj);
      } else if (name.includes("ear") && !name.includes("clear") && !name.includes("wear")) {
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

    console.log(
      `[useVoiceBones] Dynamic Discovery - Found tail bones count: ${foundTailBones.length}, Left ears: ${foundLeftEarBones.length}, Right ears: ${foundRightEarBones.length}`
    );
  }, [vrm]);

  // Handle local microphone setup
  useEffect(() => {
    if (!isLocal || !micStream || isMicMuted) {
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch (e) {}
        sourceRef.current = null;
      }
      analyserRef.current = null;
      return;
    }

    const initAudio = () => {
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const ctx = audioContextRef.current;
        if (ctx.state === "suspended") {
          ctx.resume();
        }

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        const source = ctx.createMediaStreamSource(micStream);
        source.connect(analyser);

        analyserRef.current = analyser;
        sourceRef.current = source;
        dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      } catch (err) {
        console.warn("[useVoiceBones] Audio analysis initialization skipped:", err);
      }
    };

    initAudio();

    return () => {
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch (e) {}
        sourceRef.current = null;
      }
      analyserRef.current = null;
    };
  }, [isLocal, micStream, isMicMuted]);

  // Clean audio context on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, []);

  useFrame((state, delta) => {
    if (!vrm) return;

    let averageVolume = 0;
    let trebleValue = 0; // high frequencies

    if (isLocal && analyserRef.current && dataArrayRef.current) {
      const analyser = analyserRef.current;
      const dataArray = dataArrayRef.current;
      analyser.getByteFrequencyData(dataArray);

      const len = dataArray.length;
      if (len > 0) {
        let sum = 0;
        let trebleSum = 0;
        let trebleCount = 0;

        for (let i = 0; i < len; i++) {
          sum += dataArray[i];
          // Collect treble frequencies from the high-frequency bin portion
          if (i > len / 2) {
            trebleSum += dataArray[i];
            trebleCount++;
          }
        }
        averageVolume = sum / len / 255; // Normalized amplitude 0.0 - 1.0
        if (trebleCount > 0) {
          trebleValue = trebleSum / trebleCount / 255;
        }
      }
    }

    const t = state.clock.elapsedTime;

    // --- PROCEDURAL ANIMATE TAIL ---
    const tailBones = tailBonesRef.current;
    if (tailBones && tailBones.length > 0) {
      // Base relaxed wag vs. excited high-pitched/loud microphone audio
      const baseSpeed = 2.4;
      const voiceBonusSpeed = averageVolume * 15.0;
      const wagSpeed = baseSpeed + voiceBonusSpeed;

      const baseAmplitude = 0.16;
      const voiceBonusAmp = averageVolume * 0.6;
      const wagAmplitude = baseAmplitude + voiceBonusAmp;

      tailBones.forEach((bone, index) => {
        // Form an organic wave traveling along the tail bones
        const phaseOffset = index * 0.52;
        const targetRotY = Math.sin(t * wagSpeed - phaseOffset) * wagAmplitude;
        const targetRotZ = Math.cos(t * (wagSpeed * 0.45) - phaseOffset) * wagAmplitude * 0.4 - 0.12;

        bone.rotation.y = THREE.MathUtils.lerp(bone.rotation.y, targetRotY, 11 * delta);
        bone.rotation.z = THREE.MathUtils.lerp(bone.rotation.z, targetRotZ, 11 * delta);
      });
    }

    // --- PROCEDURAL ANIMATE CAT EARS ---
    const ears = catEarBonesRef.current;
    if (ears && (ears.left.length > 0 || ears.right.length > 0)) {
      const leftEar = ears.left[0];
      const rightEar = ears.right[0];

      // Random spontaneous ear twitches combined with voice treble triggers
      if (earTwitchStateRef.current.timer <= 0) {
        earTwitchStateRef.current.timer = 1.2 + Math.random() * 4.5;
        earTwitchStateRef.current.activeSide = Math.random() < 0.5 ? "left" : "right";
        earTwitchStateRef.current.twitchStart = t;
      } else {
        // Treble pitch (e.g. consonants, sibilants, laughter) drastically speeds up twitch frequency
        const reduction = delta + trebleValue * 18.0 * delta;
        earTwitchStateRef.current.timer -= reduction;
      }

      // Voice amplitude causes slight vibration of the ears
      const bounceAmplitude = averageVolume * 0.35;
      const earVibration = Math.abs(Math.sin(t * 45.0)) * bounceAmplitude * 0.8;

      let twitchValueL = 0;
      let twitchValueR = 0;
      const twitchElapsed = t - earTwitchStateRef.current.twitchStart;

      // Realtime twitch: rapid high-speed angular oscillation
      if (twitchElapsed < 0.32) {
        const wiggle = Math.sin(twitchElapsed * 78.0) * 0.28;
        if (earTwitchStateRef.current.activeSide === "left") {
          twitchValueL = wiggle;
        } else if (earTwitchStateRef.current.activeSide === "right") {
          twitchValueR = wiggle;
        }
      }

      if (leftEar) {
        const targetZL = -0.1 + earVibration - twitchValueL;
        const targetXL = -bounceAmplitude * 0.35; // Flatten backward slightly with volume peaks
        const targetYL = bounceAmplitude * 0.18;

        leftEar.rotation.z = THREE.MathUtils.lerp(leftEar.rotation.z, targetZL, 12 * delta);
        leftEar.rotation.x = THREE.MathUtils.lerp(leftEar.rotation.x, targetXL, 12 * delta);
        leftEar.rotation.y = THREE.MathUtils.lerp(leftEar.rotation.y, targetYL, 12 * delta);
      }

      if (rightEar) {
        const targetZR = 0.1 - earVibration + twitchValueR;
        const targetXR = -bounceAmplitude * 0.35;
        const targetYR = -bounceAmplitude * 0.18;

        rightEar.rotation.z = THREE.MathUtils.lerp(rightEar.rotation.z, targetZR, 12 * delta);
        rightEar.rotation.x = THREE.MathUtils.lerp(rightEar.rotation.x, targetXR, 12 * delta);
        rightEar.rotation.y = THREE.MathUtils.lerp(rightEar.rotation.y, targetYR, 12 * delta);
      }

      // Chain secondary secondary ear joints add micro-sway elastic feel
      ears.left.slice(1).forEach((bone, idx) => {
        bone.rotation.z = Math.sin(t * 16.0 + idx) * (0.025 + averageVolume * 0.12);
      });
      ears.right.slice(1).forEach((bone, idx) => {
        bone.rotation.z = Math.sin(t * 16.0 + idx + 3) * (0.025 + averageVolume * 0.12);
      });
    }
  });
}
