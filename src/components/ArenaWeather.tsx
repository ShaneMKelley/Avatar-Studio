import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store/useStore';
import { useGameStore } from '../store';

export const ArenaWeather: React.FC = () => {
  const weather = useStore(state => state.weather);
  const setWeather = useStore(state => state.setWeather);
  const { scene } = useThree();

  const particleCount = 1200;
  const pointsRef = useRef<THREE.Points>(null);
  const geometryRef = useRef<THREE.BufferGeometry>(null);

  // Define weather sequence for periodic cycling
  const weatherCycleList: Array<'clear' | 'light_rain' | 'neon_fog' | 'solar_storm'> = [
    'clear',
    'light_rain',
    'neon_fog',
    'solar_storm',
  ];

  // Auto-cycle weather every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const currentIndex = weatherCycleList.indexOf(weather);
      const nextIndex = (currentIndex + 1) % weatherCycleList.length;
      const nextWeather = weatherCycleList[nextIndex];
      
      setWeather(nextWeather);

      // Trigger high-fidelity combat HUD messages
      const addEvent = useGameStore.getState().addEvent;
      if (addEvent) {
        if (nextWeather === 'clear') {
          addEvent("☀️ WEATHER ANNOUNCEMENT: Atmospheric grid stabilization complete. Weather cleared.");
        } else if (nextWeather === 'light_rain') {
          addEvent("🌧️ WEATHER ANNOUNCEMENT: Cybernetic high-velocity precipitation active. Ground slick detected!");
        } else if (nextWeather === 'neon_fog') {
          addEvent("🌫️ WEATHER ANNOUNCEMENT: Low-altitude neon exhaust cloud rolling in. Sensor resolution reduced!");
        } else if (nextWeather === 'solar_storm') {
          addEvent("🔥 WEATHER ANNOUNCEMENT: Overcharged electromagnetic particulate storm flare-up. Stay alert!");
        }
      }
    }, 30000); // 30s period

    return () => clearInterval(interval);
  }, [weather, setWeather]);

  // Generate randomized particle grid coordinates once
  const [initialPositions, speeds] = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const spds = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      // Spread particles across the 200m x 200m arena perimeter
      pos[i * 3] = (Math.random() - 0.5) * 190;
      pos[i * 3 + 1] = Math.random() * 25; // height up to 25m ceiling
      pos[i * 3 + 2] = (Math.random() - 0.5) * 190;
      spds[i] = 0.5 + Math.random() * 1.5; // individual velocity multiplier
    }
    return [pos, spds];
  }, []);

  // Update particles positions in real-time based on active weather type
  useFrame((state, delta) => {
    const elapsed = state.clock.getElapsedTime();

    // 1. Particle positions simulation
    if (pointsRef.current && geometryRef.current) {
      const positionAttr = geometryRef.current.getAttribute('position') as THREE.BufferAttribute;
      if (positionAttr) {
        const positions = positionAttr.array as Float32Array;

        for (let i = 0; i < particleCount; i++) {
          const idx = i * 3;
          const individualSpeed = speeds[i];

          if (weather === 'light_rain') {
            // Hard vertical downpour drop
            positions[idx + 1] -= delta * 35 * individualSpeed; // Falling at high speed
            // Slight angle wind sway
            positions[idx] += Math.sin(elapsed * 0.1) * delta * 2;
            
            // Re-spawn rain particles near ceiling when they ground-strike
            if (positions[idx + 1] < -0.4) {
              positions[idx + 1] = 24.5;
              positions[idx] = (Math.random() - 0.5) * 190;
              positions[idx + 2] = (Math.random() - 0.5) * 190;
            }
          } 
          else if (weather === 'neon_fog') {
            // Sluggish, swelling orbital drifting
            positions[idx] += Math.sin(elapsed * 0.2 + positions[idx + 1] * 0.1) * delta * 1.5;
            positions[idx + 2] += Math.cos(elapsed * 0.15 + positions[idx] * 0.1) * delta * 1.5;
            positions[idx + 1] += Math.sin(elapsed * 0.5 + i) * delta * 0.4; // subtle wave bobbing

            // Bounce back limits
            if (positions[idx + 1] < 0.1) positions[idx + 1] = 0.15;
            if (positions[idx + 1] > 24) positions[idx + 1] = 23.5;
            if (Math.abs(positions[idx]) > 95) positions[idx] *= -0.98;
            if (Math.abs(positions[idx + 2]) > 95) positions[idx + 2] *= -0.98;
          } 
          else if (weather === 'solar_storm') {
            // Rising sparks (heat waves rising)
            positions[idx + 1] += delta * 6 * individualSpeed;
            // Brownian horizontal shaking
            positions[idx] += (Math.random() - 0.5) * 0.3;
            positions[idx + 2] += (Math.random() - 0.5) * 0.3;

            // Reset back down on top escape
            if (positions[idx + 1] > 24.8) {
              positions[idx + 1] = 0.2;
              positions[idx] = (Math.random() - 0.5) * 190;
              positions[idx + 2] = (Math.random() - 0.5) * 190;
            }
          } 
          else {
            // Clear weather: ambient dust floating slowly, standard starry drift
            positions[idx + 1] -= delta * 0.3 * individualSpeed;
            positions[idx] += Math.sin(elapsed * 0.05 + i) * delta * 0.1;
            
            if (positions[idx + 1] < 0) {
              positions[idx + 1] = 24;
            }
          }
        }
        positionAttr.needsUpdate = true;
      }
    }

    // 2. Procedural transition of parent Three.JS Depth Fog values
    if (scene.fog && (scene.fog instanceof THREE.FogExp2)) {
      let targetColorString = '#0b1224';
      let targetDensity = 0.015;

      if (weather === 'clear') {
        targetColorString = '#0f172a'; // standard deep slate
        targetDensity = 0.015;
      } else if (weather === 'light_rain') {
        targetColorString = '#090d16'; // darker gray-blue
        targetDensity = 0.026;
      } else if (weather === 'neon_fog') {
        // Slow pulsing color sweep for spectacular holographic depth visual
        const hues = [280, 320, 200, 160]; // violet, magenta, cyan, teal
        const progress = (elapsed * 0.05) % hues.length;
        const colorIndex = Math.floor(progress);
        const nextColorIndex = (colorIndex + 1) % hues.length;
        const subProgress = progress - colorIndex;
        
        const h = THREE.MathUtils.lerp(hues[colorIndex], hues[nextColorIndex], subProgress);
        // Transform to hex color object
        const tempColor = new THREE.Color().setHSL(h / 360, 0.9, 0.18);
        targetColorString = `#${tempColor.getHexString()}`;
        targetDensity = 0.048; // thick atmospheric coverage
      } else if (weather === 'solar_storm') {
        targetColorString = '#22071d'; // deep crimson/magenta charging
        targetDensity = 0.034;
      }

      const currentFogColor = scene.fog.color;
      const targetColor = new THREE.Color(targetColorString);
      
      // Perform smooth exponential interpolation
      currentFogColor.lerp(targetColor, delta * 3.0);
      scene.fog.density = THREE.MathUtils.lerp(scene.fog.density, targetDensity, delta * 2.0);
    }
  });

  // Determine styling based on active weather state
  const weatherSpecs = useMemo(() => {
    switch (weather) {
      case 'light_rain':
        return {
          color: '#38bdf8', // Blue neon rain
          size: 0.14,
          opacity: 0.85,
        };
      case 'neon_fog':
        return {
          color: '#d946ef', // Magenta ambient specs
          size: 0.38,
          opacity: 0.5,
        };
      case 'solar_storm':
        return {
          color: '#fbbf24', // Yellow ember flares
          size: 0.22,
          opacity: 0.9,
        };
      default:
        return {
          color: '#00ffff', // cyan sparks
          size: 0.18,
          opacity: 0.3,
        };
    }
  }, [weather]);

  return (
    <points ref={pointsRef}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={initialPositions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color={weatherSpecs.color}
        size={weatherSpecs.size}
        transparent
        opacity={weatherSpecs.opacity}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};
