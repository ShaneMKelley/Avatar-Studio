import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import * as Tone from 'tone';
import { Text, Html } from '@react-three/drei';
import { RigidBody } from '@react-three/rapier';
import { useStore } from '../store/useStore';

// Define the keyboard key layout representing exactly C4 to E5 with natural mapping
interface PianoKey {
  note: string;
  isBlack: boolean;
  xOffset: number;
  keyChar: string;
  color: string;
}

const TRACK_KEYS: PianoKey[] = [
  { note: 'C4', isBlack: false, xOffset: -3.15, keyChar: 'A', color: '#00ffff' },
  { note: 'C#4', isBlack: true, xOffset: -2.8, keyChar: 'W', color: '#ff00ff' },
  { note: 'D4', isBlack: false, xOffset: -2.45, keyChar: 'S', color: '#00ffff' },
  { note: 'D#4', isBlack: true, xOffset: -2.1, keyChar: 'E', color: '#ff00ff' },
  { note: 'E4', isBlack: false, xOffset: -1.75, keyChar: 'D', color: '#00ffff' },
  { note: 'F4', isBlack: false, xOffset: -1.05, keyChar: 'F', color: '#00ff88' },
  { note: 'F#4', isBlack: true, xOffset: -0.7, keyChar: 'T', color: '#ffcc00' },
  { note: 'G4', isBlack: false, xOffset: -0.35, keyChar: 'G', color: '#00ff88' },
  { note: 'G#4', isBlack: true, xOffset: 0.0, keyChar: 'Y', color: '#ffcc00' },
  { note: 'A4', isBlack: false, xOffset: 0.35, keyChar: 'H', color: '#00ff88' },
  { note: 'A#4', isBlack: true, xOffset: 0.7, keyChar: 'U', color: '#ffcc00' },
  { note: 'B4', isBlack: false, xOffset: 1.05, keyChar: 'J', color: '#00ff88' },
  { note: 'C5', isBlack: false, xOffset: 1.75, keyChar: 'K', color: '#ff0055' },
  { note: 'C#5', isBlack: true, xOffset: 2.1, keyChar: 'O', color: '#ff00aa' },
  { note: 'D5', isBlack: false, xOffset: 2.45, keyChar: 'L', color: '#ff0055' },
  { note: 'D#5', isBlack: true, xOffset: 2.8, keyChar: 'P', color: '#ff00aa' },
  { note: 'E5', isBlack: false, xOffset: 3.15, keyChar: ';', color: '#ff0055' },
];

// Pre-compiled shared static geometries to eliminate construction/destruction and GC pauses
const BLACK_KEY_GEOMETRY = new THREE.BoxGeometry(0.3, 0.35, 1.6);
const WHITE_KEY_GEOMETRY = new THREE.BoxGeometry(0.62, 0.22, 2.6);
const PARTICLE_GEOMETRY = new THREE.BoxGeometry(0.2, 0.2, 0.2);

interface Particle {
  position: THREE.Vector3;
  color: THREE.Color;
  speed: number;
  scale: number;
  opacity: number;
}

const MAX_PARTICLES = 80;

export const NeonPiano = ({ position }: { position: [number, number, number] }) => {
  const isPianoActive = useStore(state => state.isPianoActive);
  const setIsPianoActive = useStore(state => state.setIsPianoActive);

  const [activeKeys, setActiveKeys] = useState<{ [key: string]: boolean }>({});
  
  // Use high-performance Ref-based tracking for particle animations
  const particlesRef = useRef<Particle[]>([]);
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
  
  // Reusable object/color instances to avoid memory allocation inside the 60FPS loop
  const tempObject = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  // Audio Synth Setup
  const synthRef = useRef<Tone.PolySynth | null>(null);

  // Lyria API Generation UI States
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationLogs, setGenerationLogs] = useState<string[]>([]);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [generatedLyrics, setGeneratedLyrics] = useState<string | null>(null);
  
  // Playback of generated AI Track
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isAiTrackPlaying, setIsAiTrackPlaying] = useState(false);
  const [autoplayKeys, setAutoplayKeys] = useState(false);

  // Initialize Tone.js synth
  useEffect(() => {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.02, decay: 0.1, sustain: 0.4, release: 0.6 }
    }).toDestination();
    synthRef.current = synth;

    return () => {
      synth.dispose();
    };
  }, []);

  // Spawn note particle effect directly inside Ref (no React re-renders!)
  const spawnParticle = (x: number, colorStr: string) => {
    const newParticle: Particle = {
      position: new THREE.Vector3(x, 0.5, 0),
      color: new THREE.Color(colorStr),
      speed: 1.5 + Math.random() * 2.0,
      scale: 0.3 + Math.random() * 0.4,
      opacity: 1.0,
    };
    particlesRef.current.push(newParticle);
    if (particlesRef.current.length > MAX_PARTICLES) {
      particlesRef.current.shift();
    }
  };

  // Trigger Note On Action
  const handleNoteOn = async (note: string, xOffset: number, color: string) => {
    try {
      await Tone.start();
      if (synthRef.current) {
        synthRef.current.triggerAttack(note);
      }
      setActiveKeys(prev => ({ ...prev, [note]: true }));
      spawnParticle(xOffset, color);
    } catch (e) {
      console.error(e);
    }
  };

  // Trigger Note Off Action
  const handleNoteOff = (note: string) => {
    if (synthRef.current) {
      synthRef.current.triggerRelease(note);
    }
    setActiveKeys(prev => ({ ...prev, [note]: false }));
  };

  // Activate Performance Mode - Snap user avatar to front of piano
  const enterPerformanceMode = () => {
    try {
      Tone.start();
    } catch (_) {}
    
    // Position local player directly in front of the keys facing the piano
    const targetPos: [number, number, number] = [position[0], position[1], position[2] + 1.25];
    useStore.getState().setLocalUserPosition(targetPos);
    useStore.getState().setLocalUserRotation([0, Math.PI, 0]);
    setIsPianoActive(true);
  };

  const leavePerformanceMode = () => {
    setIsPianoActive(false);
    setActiveKeys({});
  };

  // Keyboard Event Listeners for PC input - active only in performance mode
  useEffect(() => {
    if (!isPianoActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        leavePerformanceMode();
        return;
      }

      if (e.repeat) return;
      // Skip if typing in the prompt input field
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      const char = e.key.toUpperCase();
      const matchedKey = TRACK_KEYS.find(k => k.keyChar === char);
      if (matchedKey) {
        handleNoteOn(matchedKey.note, matchedKey.xOffset, matchedKey.color);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const char = e.key.toUpperCase();
      const matchedKey = TRACK_KEYS.find(k => k.keyChar === char);
      if (matchedKey) {
        handleNoteOff(matchedKey.note);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPianoActive, position]);

  // Frame animation updates particle matrices without causing React re-renders!
  useFrame((_, delta) => {
    const pArray = particlesRef.current;
    const mesh = instancedMeshRef.current;

    // Update positions and opacity of active particles
    for (let i = pArray.length - 1; i >= 0; i--) {
      const p = pArray[i];
      p.position.y += p.speed * delta;
      p.position.z += Math.sin(p.position.y * 5) * 0.2 * delta;
      p.opacity -= delta * 0.8;

      if (p.opacity <= 0) {
        pArray.splice(i, 1);
      }
    }

    // Set matrices and colors inside the instancedMesh for 120fps hardware rendering
    if (mesh) {
      for (let i = 0; i < MAX_PARTICLES; i++) {
        if (i < pArray.length) {
          const p = pArray[i];
          tempObject.position.copy(p.position);
          tempObject.scale.setScalar(p.scale * p.opacity);
          tempObject.updateMatrix();
          mesh.setMatrixAt(i, tempObject.matrix);

          // Render with fading emissive intensity
          tempColor.copy(p.color).multiplyScalar(p.opacity);
          mesh.setColorAt(i, tempColor);
        } else {
          // Put extra matrices far away out of view
          tempObject.position.set(0, -999, 0);
          tempObject.scale.set(0, 0, 0);
          tempObject.updateMatrix();
          mesh.setMatrixAt(i, tempObject.matrix);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    }

    // Dynamic Autoplay visual effect when AI track is active
    if (autoplayKeys && isAiTrackPlaying) {
      const t = Date.now();
      // Simulate notes triggered by the playing AI track rhythmically
      TRACK_KEYS.forEach((k, index) => {
        const trigFreq = 300 + (index * 80);
        const shouldBeActive = Math.sin(t / trigFreq + index) > 0.82;
        const currentlyActive = activeKeys[k.note];
        
        if (shouldBeActive && !currentlyActive) {
          setActiveKeys(prev => ({ ...prev, [k.note]: true }));
          spawnParticle(k.xOffset, k.color);
        } else if (!shouldBeActive && currentlyActive) {
          setActiveKeys(prev => ({ ...prev, [k.note]: false }));
        }
      });
    }
  });

  // Call server API for Lyria Music Generation
  const generateLyriaMusic = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setGenerationLogs(['[AI Engine] Dispatching request to Lyria (lyria-3-clip-preview)...', '[System] Establishing secure streaming link...']);
    
    // Rhythmic log simulation while waiting for API
    const logInterval = setInterval(() => {
      const messages = [
        '[Lyria-Model] Crafting rich stereo orchestration...',
        '[Lyria-Model] Synchronizing rhythmic grids & transients...',
        '[System] Finalizing wave encoding buffers...',
        '[AI Engine] Compiling audio into playable WAV format...'
      ];
      const randomMsg = messages[Math.floor(Math.random() * messages.length)];
      setGenerationLogs(prev => [...prev, randomMsg]);
    }, 2800);

    try {
      const response = await fetch('/api/generate-music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data = await response.json();
      clearInterval(logInterval);

      if (data.success && data.audioUrl) {
        setGenerationLogs(prev => [...prev, '✅ Music Generated Successfully!', `[Saved] ${data.audioUrl}`]);
        setGeneratedAudioUrl(data.audioUrl);
        setGeneratedLyrics(data.lyrics || null);
        
        // Auto-play the generated track
        setTimeout(() => {
          playAiTrack(data.audioUrl);
        }, 1000);
      } else {
        throw new Error(data.error || 'Server returned unsuccessful response.');
      }
    } catch (err: any) {
      clearInterval(logInterval);
      console.error('Lyria Generation Failed:', err);
      setGenerationLogs(prev => [
        ...prev,
        '❌ Generation Failed!',
        `[Error] ${err.message || 'The configured API key might not support Lyria models, or the server timed out. Check your .env setup.'}`
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const playAiTrack = (url: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play();
    setIsAiTrackPlaying(true);
    setAutoplayKeys(true);

    audio.onended = () => {
      setIsAiTrackPlaying(false);
      setAutoplayKeys(false);
      setActiveKeys({});
    };
  };

  const stopAiTrack = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsAiTrackPlaying(false);
    setAutoplayKeys(false);
    setActiveKeys({});
  };

  return (
    <group position={position}>
      {/* GLOWING PERFORMANCE STAGE DECK */}
      <RigidBody type="fixed" colliders="cuboid">
        <group position={[0, -0.15, 0.4]}>
          {/* Glass Stage Floor */}
          <mesh>
            <boxGeometry args={[9.4, 0.3, 4.2]} />
            <meshStandardMaterial color="#0b0813" roughness={0.1} metalness={0.9} />
          </mesh>
          {/* Neon Purple Border Underglow */}
          <mesh position={[0, 0.16, 2.11]}>
            <boxGeometry args={[9.5, 0.04, 0.04]} />
            <meshStandardMaterial color="#ff00ff" emissive="#ff00ff" emissiveIntensity={2.5} />
          </mesh>
          <mesh position={[-4.71, 0.16, 0]}>
            <boxGeometry args={[0.04, 0.04, 4.3]} />
            <meshStandardMaterial color="#ff00ff" emissive="#ff00ff" emissiveIntensity={2.5} />
          </mesh>
          <mesh position={[4.71, 0.16, 0]}>
            <boxGeometry args={[0.04, 0.04, 4.3]} />
            <meshStandardMaterial color="#ff00ff" emissive="#ff00ff" emissiveIntensity={2.5} />
          </mesh>

          {/* Dual Cyberpunk Stage Light Pillars */}
          <group position={[-4.4, 1.2, -1.8]}>
            <mesh>
              <cylinderGeometry args={[0.08, 0.12, 2.4]} />
              <meshStandardMaterial color="#1a1a2e" metalness={0.9} roughness={0.2} />
            </mesh>
            <mesh position={[0, 1.2, 0]}>
              <sphereGeometry args={[0.2, 16, 16]} />
              <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={3.0} />
            </mesh>
          </group>
          <group position={[4.4, 1.2, -1.8]}>
            <mesh>
              <cylinderGeometry args={[0.08, 0.12, 2.4]} />
              <meshStandardMaterial color="#1a1a2e" metalness={0.9} roughness={0.2} />
            </mesh>
            <mesh position={[0, 1.2, 0]}>
              <sphereGeometry args={[0.2, 16, 16]} />
              <meshStandardMaterial color="#ff00aa" emissive="#ff00aa" emissiveIntensity={3.0} />
            </mesh>
          </group>
        </group>
      </RigidBody>

      {/* Heavy Steel Instrument Stand (Slightly raised onto stage deck) */}
      <RigidBody type="fixed" colliders="cuboid">
        <group position={[0, 0.4, 0]}>
          {/* Main Keybed Chassis Box */}
          <mesh>
            <boxGeometry args={[8.2, 0.5, 3.4]} />
            <meshStandardMaterial color="#0b0f19" metalness={0.9} roughness={0.1} />
          </mesh>
          {/* Back panel dashboard framing keys */}
          <mesh position={[0, 0.4, -1.5]}>
            <boxGeometry args={[8.2, 0.5, 0.4]} />
            <meshStandardMaterial color="#0d1527" metalness={0.9} roughness={0.15} />
          </mesh>
          {/* Side Cheeks */}
          <mesh position={[-4.0, 0.35, 0]}>
            <boxGeometry args={[0.2, 0.6, 3.4]} />
            <meshStandardMaterial color="#ff00aa" emissive="#ff00aa" emissiveIntensity={0.3} />
          </mesh>
          <mesh position={[4.0, 0.35, 0]}>
            <boxGeometry args={[0.2, 0.6, 3.4]} />
            <meshStandardMaterial color="#ff00aa" emissive="#ff00aa" emissiveIntensity={0.3} />
          </mesh>
          {/* Dual futuristic glowing pillar legs */}
          <mesh position={[-3.2, -0.65, 0]}>
            <cylinderGeometry args={[0.15, 0.25, 1.2]} />
            <meshStandardMaterial color="#070c1b" metalness={0.9} roughness={0.1} />
          </mesh>
          <mesh position={[3.2, -0.65, 0]}>
            <cylinderGeometry args={[0.15, 0.25, 1.2]} />
            <meshStandardMaterial color="#070c1b" metalness={0.9} roughness={0.1} />
          </mesh>
          {/* Stand Crossbar with neon light */}
          <mesh position={[0, -0.65, 0]}>
            <boxGeometry args={[6.4, 0.1, 0.1]} />
            <meshStandardMaterial color="#ff00ff" emissive="#ff00ff" emissiveIntensity={0.8} />
          </mesh>
        </group>
      </RigidBody>

      {/* Holographic interactive sign when inactive */}
      {!isPianoActive && (
        <group position={[0, 1.3, 0.8]}>
          <mesh onClick={enterPerformanceMode} onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = 'auto'; }}>
            <boxGeometry args={[3.2, 0.6, 0.1]} />
            <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={0.6} transparent opacity={0.2} />
          </mesh>
          <Text
            onClick={enterPerformanceMode}
            onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = 'auto'; }}
            fontSize={0.2}
            color="#00ffff"
            outlineWidth={0.005}
            outlineColor="black"
            position={[0, 0, 0.06]}
          >
            CLICK PIANO TO PERFORM
          </Text>
        </group>
      )}

      {/* Title and HUD text above Piano */}
      <Text position={[0, 1.8, -1.6]} fontSize={0.4} color="#ff00aa" outlineWidth={0.01} outlineColor="black">
        NEON LYRIA PIANO
      </Text>
      <Text position={[0, 1.5, -1.6]} fontSize={0.15} color="#00ffff" outlineWidth={0.005} outlineColor="black">
        {isPianoActive ? "Keyboard mapping: [A S D F G H J K L ;] & [W E T Y U O P]" : "Enter performance session to lock movement & play notes"}
      </Text>

      {/* Render Playable Piano Keys */}
      <group position={[0, 0.7, 0.1]}>
        {TRACK_KEYS.map((key) => {
          const isActive = !!activeKeys[key.note];
          
          if (key.isBlack) {
            // Render Black keys (slightly thinner, raised, and offset backward)
            return (
              <mesh
                key={key.note}
                geometry={BLACK_KEY_GEOMETRY}
                position={[key.xOffset, isActive ? 0.08 : 0.15, -0.5]}
                onPointerDown={() => {
                  if (!isPianoActive) enterPerformanceMode();
                  handleNoteOn(key.note, key.xOffset, key.color);
                }}
                onPointerUp={() => handleNoteOff(key.note)}
                onPointerOut={() => handleNoteOff(key.note)}
                onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
                onPointerLeave={() => { document.body.style.cursor = 'auto'; }}
              >
                <meshStandardMaterial
                  color={isActive ? key.color : '#020202'}
                  emissive={isActive ? key.color : '#ff0055'}
                  emissiveIntensity={isActive ? 2.5 : 0.15}
                  roughness={0.05}
                  metalness={0.9}
                />
              </mesh>
            );
          } else {
            // Render White keys (full size, flat layout)
            return (
              <mesh
                key={key.note}
                geometry={WHITE_KEY_GEOMETRY}
                position={[key.xOffset, isActive ? 0.0 : 0.05, 0]}
                onPointerDown={() => {
                  if (!isPianoActive) enterPerformanceMode();
                  handleNoteOn(key.note, key.xOffset, key.color);
                }}
                onPointerUp={() => handleNoteOff(key.note)}
                onPointerOut={() => handleNoteOff(key.note)}
                onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
                onPointerLeave={() => { document.body.style.cursor = 'auto'; }}
              >
                <meshStandardMaterial
                  color={isActive ? key.color : '#f8fafc'}
                  emissive={isActive ? key.color : '#00ffff'}
                  emissiveIntensity={isActive ? 2.0 : 0.05}
                  roughness={0.1}
                  metalness={0.3}
                />
              </mesh>
            );
          }
        })}
      </group>

      {/* Particle Note Spawners utilizing high performance InstancedMesh */}
      <instancedMesh
        ref={instancedMeshRef}
        args={[PARTICLE_GEOMETRY, null as any, MAX_PARTICLES]}
        position={[0, 0.4, 0]}
      >
        <meshBasicMaterial transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </instancedMesh>

      {/* Lyria Music Terminal / HUD (Only fully interactive when in performance session) */}
      <Html position={[0, 1.25, 1.8]} rotation={[-0.4, 0, 0]} transform distanceFactor={5} zIndexRange={[10, 100]}>
        <div id="lyria-piano-terminal-wrapper" className="w-[380px] bg-black/92 backdrop-blur-lg border-2 border-pink-500 rounded-xl p-4 font-mono text-xs text-white shadow-[0_0_20px_rgba(236,72,153,0.25)] select-none pointer-events-auto">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-pink-500/30 pb-2 mb-3">
            <span className="text-fuchsia-400 font-bold tracking-wider text-[11px] flex items-center gap-1.5 animate-pulse">
              ● LYRIA AI JAM ENGINE
            </span>
            <span className="text-[10px] text-zinc-500">v3.0-CLIP</span>
          </div>

          {/* Description */}
          <p className="text-[10px] text-zinc-400 mb-3 leading-relaxed">
            Harness Google's Lyria music generation model server-side to compose a tailored 30s audio track!
          </p>

          {/* Interactive Toggle for Session */}
          <div className="mb-3">
            {isPianoActive ? (
              <button
                onClick={leavePerformanceMode}
                className="w-full bg-red-600 hover:bg-red-500 text-white font-bold tracking-wider text-[10px] py-1.5 rounded transition duration-200 cursor-pointer text-center hover:shadow-[0_0_10px_rgba(239,68,68,0.5)]"
              >
                LEAVE PERFORMANCE SESSION (RESUME WALKING)
              </button>
            ) : (
              <button
                onClick={enterPerformanceMode}
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold tracking-wider text-[10px] py-1.5 rounded transition duration-200 cursor-pointer text-center hover:shadow-[0_0_10px_rgba(6,182,212,0.5)]"
              >
                START PERFORMANCE SESSION (LOCKS WASD)
              </button>
            )}
          </div>

          {/* Prompt input */}
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="E.g., A slow synthwave piano arpeggio..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isGenerating || !isPianoActive}
              className={`flex-1 bg-zinc-950 border border-zinc-700 hover:border-pink-500 focus:border-pink-500 focus:outline-none rounded px-2.5 py-1.5 text-zinc-200 text-xs transition duration-200 ${
                !isPianoActive ? 'opacity-40 cursor-not-allowed' : ''
              }`}
            />
            <button
              onClick={generateLyriaMusic}
              disabled={isGenerating || !prompt.trim() || !isPianoActive}
              className={`px-3 py-1.5 rounded text-black font-bold tracking-wider transition duration-200 text-[10px] ${
                isGenerating || !prompt.trim() || !isPianoActive
                  ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                  : 'bg-pink-500 hover:bg-pink-400 hover:shadow-[0_0_12px_rgba(236,72,153,0.6)] cursor-pointer'
              }`}
            >
              {isGenerating ? 'GENERATING...' : 'COMPOSE'}
            </button>
          </div>

          {/* Generation Logs Area */}
          {generationLogs.length > 0 && (
            <div className="bg-zinc-950 border border-zinc-800 rounded p-2 h-[80px] overflow-y-auto mb-3 text-[9px] text-zinc-400 leading-normal scrollbar-thin">
              {generationLogs.map((log, idx) => (
                <div key={idx} className={log.startsWith('❌') ? 'text-red-400 font-semibold' : log.startsWith('✅') ? 'text-cyan-400 font-semibold' : ''}>
                  {log}
                </div>
              ))}
            </div>
          )}

          {/* Audio Controls */}
          {generatedAudioUrl && (
            <div className="flex items-center justify-between bg-zinc-900/60 border border-zinc-800 rounded p-2.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-cyan-400 font-bold">AI JAM COMPOSITION READY</span>
                {generatedLyrics ? (
                  <span className="text-[8px] text-zinc-500 italic max-w-[200px] truncate">"{generatedLyrics}"</span>
                ) : (
                  <span className="text-[8px] text-zinc-500">Pure Instrumental Clip</span>
                )}
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setAutoplayKeys(!autoplayKeys)}
                  disabled={!isPianoActive}
                  className={`px-2 py-1 rounded text-[9px] font-bold transition duration-150 ${
                    !isPianoActive ? 'opacity-30 cursor-not-allowed' : ''
                  } ${
                    autoplayKeys ? 'bg-cyan-500 text-black hover:bg-cyan-400' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {autoplayKeys ? 'AUTOPLAY: ON' : 'AUTOPLAY: OFF'}
                </button>
                {isAiTrackPlaying ? (
                  <button
                    onClick={stopAiTrack}
                    className="bg-red-600 hover:bg-red-500 text-white font-bold text-[9px] px-2 py-1 rounded transition duration-150"
                  >
                    STOP
                  </button>
                ) : (
                  <button
                    onClick={() => playAiTrack(generatedAudioUrl)}
                    className="bg-pink-500 hover:bg-pink-400 text-black font-bold text-[9px] px-2.5 py-1 rounded transition duration-150"
                  >
                    PLAY
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </Html>
    </group>
  );
};
