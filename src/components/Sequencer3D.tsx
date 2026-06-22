import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import * as Tone from 'tone';
import { Text } from '@react-three/drei';
import { useStore } from '../store/useStore';
import { syncService } from '../services/sync';
import { RigidBody } from '@react-three/rapier';

const TRACK_COLORS = ['#ff00ff', '#00ffff', '#ffff00', '#00ff88'];
const TRACK_NAMES = ['KICK', 'SNARE', 'HI-HAT', 'SYNTH'];

export const Sequencer3D = ({ position }: { position: [number, number, number] }) => {
  const sequencerGrid = useStore(state => state.sequencerGrid);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  
  const synthsRef = useRef<any[]>([]);

  useEffect(() => {
    // Setup Tone.js instruments
    const kick = new Tone.MembraneSynth().toDestination();
    const snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 }
    }).toDestination();
    const hihat = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.1, release: 0.01 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5
    }).toDestination();
    hihat.frequency.value = 200;
    const synth = new Tone.PolySynth(Tone.Synth).toDestination();

    synthsRef.current = [kick, snare, hihat, synth];

    Tone.Transport.bpm.value = 120;
    
    let step = 0;
    const loop = new Tone.Loop((time) => {
      setCurrentStep(step);
      
      const grid = useStore.getState().sequencerGrid;
      
      if (grid[0][step]) kick.triggerAttackRelease("C1", "8n", time);
      if (grid[1][step]) snare.triggerAttackRelease("16n", time);
      if (grid[2][step]) hihat.triggerAttackRelease("16n", time, 0.3);
      if (grid[3][step]) synth.triggerAttackRelease("C4", "8n", time);
      
      step = (step + 1) % 16;
    }, "16n");

    loop.start(0);

    return () => {
      loop.dispose();
      kick.dispose();
      snare.dispose();
      hihat.dispose();
      synth.dispose();
    };
  }, []);

  const togglePlayback = async () => {
    if (!isPlaying) {
      await Tone.start();
      Tone.Transport.start();
      setIsPlaying(true);
    } else {
      Tone.Transport.pause();
      setIsPlaying(false);
    }
  };

  const handlePadClick = (track: number, step: number) => {
    const currentValue = sequencerGrid[track][step];
    const newValue = !currentValue;
    
    // Optimistic local update
    useStore.getState().updateSequencerGrid(track, step, newValue);
    // Broadcast
    syncService.broadcastSequencerUpdate(track, step, newValue);
  };

  return (
    <group position={position}>
      {/* Central console / table */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[12, 1, 8]} />
          <meshStandardMaterial color="#111111" metalness={0.8} roughness={0.2} />
        </mesh>
      </RigidBody>

      <Text position={[0, 1.2, -3.5]} fontSize={0.8} color="#00ffff" outlineWidth={0.02}>
        NEON SEQUENCER
      </Text>

      {/* Play / Stop Button */}
      <group position={[-5, 1.1, -3.5]} onClick={togglePlayback} onPointerOver={() => document.body.style.cursor = 'pointer'} onPointerOut={() => document.body.style.cursor = 'auto'}>
        <mesh>
          <boxGeometry args={[1.5, 0.2, 1]} />
          <meshStandardMaterial color={isPlaying ? "#ff0055" : "#00ff55"} emissive={isPlaying ? "#ff0055" : "#00ff55"} emissiveIntensity={0.5} />
        </mesh>
        <Text position={[0, 0.2, 0]} fontSize={0.3} rotation={[-Math.PI / 2, 0, 0]} color="black">
          {isPlaying ? 'STOP' : 'PLAY'}
        </Text>
      </group>

      {/* Grid */}
      <group position={[-5, 1.1, -2]}>
        {sequencerGrid.map((track, tIdx) => (
          <group key={`track-${tIdx}`} position={[0, 0, tIdx * 1.5]}>
            <Text position={[-1, 0.2, 0]} fontSize={0.3} rotation={[-Math.PI / 2, 0, 0]} color={TRACK_COLORS[tIdx]}>
              {TRACK_NAMES[tIdx]}
            </Text>
            {track.map((active, sIdx) => {
              const isCurrent = currentStep === sIdx && isPlaying;
              const color = active ? TRACK_COLORS[tIdx] : (isCurrent ? "#ffffff" : "#222222");
              const emissiveIntensity = active ? (isCurrent ? 2 : 1) : (isCurrent ? 0.5 : 0);
              
              return (
                <mesh 
                  key={`pad-${tIdx}-${sIdx}`} 
                  position={[sIdx * 0.7, 0, 0]} 
                  onClick={() => handlePadClick(tIdx, sIdx)}
                  onPointerOver={() => document.body.style.cursor = 'pointer'}
                  onPointerOut={() => document.body.style.cursor = 'auto'}
                >
                  <boxGeometry args={[0.6, 0.2, 1.2]} />
                  <meshStandardMaterial 
                    color={color} 
                    emissive={color} 
                    emissiveIntensity={emissiveIntensity}
                    metalness={0.5}
                    roughness={0.2}
                  />
                  {/* Step indicator light */}
                  {isCurrent && (
                    <pointLight position={[0, 0.5, 0]} color={TRACK_COLORS[tIdx]} intensity={2} distance={3} />
                  )}
                </mesh>
              );
            })}
          </group>
        ))}
      </group>

      {/* Giant floating visualizers behind the synth */}
      <group position={[0, 5, -8]}>
        {sequencerGrid.map((track, tIdx) => (
          <mesh key={`vis-${tIdx}`} position={[(tIdx - 1.5) * 4, 0, 0]}>
             <cylinderGeometry args={[1, 1, track[currentStep] && isPlaying ? 8 : 2, 32]} />
             <meshStandardMaterial 
                color={TRACK_COLORS[tIdx]} 
                emissive={TRACK_COLORS[tIdx]} 
                emissiveIntensity={track[currentStep] && isPlaying ? 2 : 0.2} 
                transparent 
                opacity={0.8} 
             />
          </mesh>
        ))}
      </group>
    </group>
  );
};
