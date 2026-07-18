/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Custom web audio synthesizer for cyber effects
class CyberSoundManager {
  private ctx: AudioContext | null = null;
  private activeLasersCount = 0;
  private ambientGain: GainNode | null = null;
  private isGemmaiSpeaking = false;
  private isLogDucked = false;
  private logDuckTimeout: any = null;
  public isMuted = typeof window !== 'undefined' ? localStorage.getItem('arena_sound_muted') === 'true' : false;

  setMuted(muted: boolean) {
    this.isMuted = muted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('arena_sound_muted', muted ? 'true' : 'false');
    }
    if (muted) {
      this.stopLyriaJungleStream();
      this.stopArenaAmbience();
      if (this.ctx) {
        try {
          this.ctx.suspend();
        } catch (e) {
          console.warn("Could not suspend audio context", e);
        }
      }
    } else {
      if (this.ctx) {
        try {
          this.ctx.resume();
        } catch (e) {
          console.warn("Could not resume audio context", e);
        }
      }
    }
  }

  private init() {
    if (this.isMuted) return;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.ambientGain = this.ctx.createGain();
        this.ambientGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
        this.ambientGain.connect(this.ctx.destination);
      }
    }
    // Resume context if suspended (browser security policy)
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setSpeechDucking(speaking: boolean) {
    this.isGemmaiSpeaking = speaking;
    this.updateDucking();
  }

  triggerLogDucking() {
    this.isLogDucked = true;
    this.updateDucking();

    if (this.logDuckTimeout) {
      clearTimeout(this.logDuckTimeout);
    }
    this.logDuckTimeout = setTimeout(() => {
      this.isLogDucked = false;
      this.updateDucking();
    }, 2000); // Duck for 2 seconds when log event appears
  }

  private updateDucking() {
    this.init();
    if (!this.ctx || !this.ambientGain) return;

    // Duck by 50% (value of 0.5) when ducking is active, otherwise 1.0
    const targetVolume = (this.isGemmaiSpeaking || this.isLogDucked) ? 0.5 : 1.0;
    const now = this.ctx.currentTime;
    
    this.ambientGain.gain.setValueAtTime(this.ambientGain.gain.value, now);
    this.ambientGain.gain.linearRampToValueAtTime(targetVolume, now + 0.2);
  }

  // Play a retro laser sound using FM sweep
  playLaser() {
    try {
      this.init();
      if (!this.ctx) return;

      // Restrict concurrent active laser sound nodes to avoid browser overload/freeze
      if (this.activeLasersCount > 5) {
        return;
      }
      this.activeLasersCount++;
      setTimeout(() => {
        this.activeLasersCount = Math.max(0, this.activeLasersCount - 1);
      }, 180);

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      
      // Sweep frequency down rapidly from 1200Hz to 150Hz
      osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.18);

      // Fade out gain
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.18);

      // Lowpass filter to make it sound punchier and sci-fi
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, this.ctx.currentTime);
      filter.Q.setValueAtTime(1, this.ctx.currentTime);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.18);
    } catch (e) {
      console.warn("Audio Context playback failed", e);
    }
  }

  // Play metallic impact clang when Sentinel takes damage
  playImpact() {
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      
      // Core boom
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(160, now);
      osc1.frequency.exponentialRampToValueAtTime(40, now + 0.25);
      gain1.gain.setValueAtTime(0.4, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start();
      osc1.stop(now + 0.25);

      // Metallic high frequency ring
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now);
      osc2.frequency.setValueAtTime(530, now + 0.05);
      gain2.gain.setValueAtTime(0.15, now);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start();
      osc2.stop(now + 0.4);
    } catch (e) {
      console.warn("Audio Context playback failed", e);
    }
  }

  // Play alarming alarm-like warning shield breakdown sound when player hits
  playPlayerHit() {
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const duration = 0.35;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      
      // Siren pitch modulation
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.linearRampToValueAtTime(650, now + 0.15);
      osc.frequency.linearRampToValueAtTime(250, now + 0.35);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(500, now);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(now + duration);
    } catch (e) {
      console.warn("Audio Context playback failed", e);
    }
  }

  // Play powerup/level up chord when winning or hitting boss
  playScoreBig() {
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      // Arpeggio chord in major key C -> E -> G -> C
      const notes = [261.63, 329.63, 392.00, 523.25];
      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.15, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.08 + 0.3);
        
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.3);
      });
    } catch (e) {
      console.warn("Audio Context playback failed", e);
    }
  }

  // Warning servo charge effect for v1.58 Juggernaut Charge
  playLaserCharge() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.linearRampToValueAtTime(1200, now + 1.2);
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 1.2);
    } catch (e) {
      console.warn("Audio Context playback failed", e);
    }
  }

  // Multi-step caution beep
  playAlarm() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      [0, 0.25, 0.5].forEach((delay) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now + delay);
        gain.gain.setValueAtTime(0.15, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.15);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.15);
      });
    } catch (e) {
      console.warn("Audio Context playback failed", e);
    }
  }

  // Camo dash high pitch sci-fi swoosh / light-bending distortion sound
  playCamoDash() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.exponentialRampToValueAtTime(3200, now + 0.35);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.005, now + 0.4);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.4);
    } catch (e) {
      console.warn("Audio Context playback failed", e);
    }
  }

  // Dual wrist energy daggers metallic slice/slashing sound
  playDaggerStrike() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(2200, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.22);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(now + 0.22);
    } catch (e) {
      console.warn("Audio Context playback failed", e);
    }
  }

  // Bombardier pneumatic recoil lock venting steam/heat
  playBombardierBrace() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.linearRampToValueAtTime(60, now + 0.8);
      
      // Add heavy high frequency sizzle
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2500, now);
      filter.frequency.exponentialRampToValueAtTime(800, now + 0.8);
      filter.Q.value = 3.0;

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.8);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start();
      osc.stop(now + 0.8);
    } catch (e) {
      console.warn("Audio Context playback failed", e);
    }
  }

  // Heavy multi-rocket motor launch ignition
  playBombardierLaunch() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      
      // Fire 3 quick successive rockets
      [0, 0.08, 0.16].forEach((delay) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now + delay);
        osc.frequency.exponentialRampToValueAtTime(40, now + delay + 0.25);
        
        gain.gain.setValueAtTime(0.24, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.005, now + delay + 0.28);
        
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.3);
      });
    } catch (e) {
      console.warn("Audio Context playback failed", e);
    }
  }

  // Bombardier extreme nuclear fusion containment core collapse / explosion
  playBombardierExplosion() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      
      // Bass drop boom
      const oscBoom = this.ctx.createOscillator();
      const gainBoom = this.ctx.createGain();
      oscBoom.type = 'sine';
      oscBoom.frequency.setValueAtTime(80, now);
      oscBoom.frequency.exponentialRampToValueAtTime(2, now + 1.2);
      
      gainBoom.gain.setValueAtTime(0.6, now);
      gainBoom.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      
      oscBoom.connect(gainBoom);
      gainBoom.connect(this.ctx.destination);
      oscBoom.start();
      oscBoom.stop(now + 1.25);

      // Crackling high-power high-pass noise burst
      const oscNois = this.ctx.createOscillator();
      const gainNois = this.ctx.createGain();
      oscNois.type = 'sawtooth';
      oscNois.frequency.setValueAtTime(320, now);
      oscNois.frequency.linearRampToValueAtTime(10, now + 0.85);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1600;
      filter.Q.value = 1.0;

      gainNois.gain.setValueAtTime(0.35, now);
      gainNois.gain.exponentialRampToValueAtTime(0.005, now + 0.9);

      oscNois.connect(filter);
      filter.connect(gainNois);
      gainNois.connect(this.ctx.destination);
      
      oscNois.start();
      oscNois.stop(now + 0.9);
    } catch (e) {
      console.warn("Audio Context playback failed", e);
    }
  }

  // Synthesized epic retro battle horns, klaxons & sirens for Leroy Jenkins Room
  playLeroyCharge() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // 1. Heavy bass drop announcement horn
      const bassOsc = this.ctx.createOscillator();
      const bassGain = this.ctx.createGain();
      bassOsc.type = 'sawtooth';
      bassOsc.frequency.setValueAtTime(90, now);
      bassOsc.frequency.linearRampToValueAtTime(180, now + 0.6);
      bassOsc.frequency.linearRampToValueAtTime(60, now + 1.2);
      bassGain.gain.setValueAtTime(0.3, now);
      bassGain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
      bassOsc.connect(bassGain);
      bassGain.connect(this.ctx.destination);
      bassOsc.start(now);
      bassOsc.stop(now + 1.2);

      // 2. High energy rising battle siren klaxon (rhythmically pulsed)
      const times = [0, 0.3, 0.6, 0.9];
      times.forEach((offset) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        const filter = this.ctx!.createBiquadFilter();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, now + offset);
        osc.frequency.exponentialRampToValueAtTime(880, now + offset + 0.25);
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1600, now + offset);
        
        gain.gain.setValueAtTime(0.18, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.25);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx!.destination);
        
        osc.start(now + offset);
        osc.stop(now + offset + 0.25);
      });

      // 3. Majestic major key triumph arpeggio of lasers synth
      const notes = [329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // E -> G -> C -> E -> G -> C
      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + 0.4 + idx * 0.1);
        gain.gain.setValueAtTime(0.15, now + 0.4 + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4 + idx * 0.1 + 0.4);
        
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + 0.4 + idx * 0.1);
        osc.stop(now + 0.4 + idx * 0.1 + 0.4);
      });
    } catch (e) {
      console.warn("Audio Context playback failed", e);
    }
  }

  // Snappy high-frequency sci-fi "dash-whiz" effect
  playDashWhiz() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const duration = 0.28;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      // High-pitch sci-fi wave sweep
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(2800, now);
      osc.frequency.exponentialRampToValueAtTime(7500, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(1200, now + duration);

      // Clean resonance
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(3500, now);
      filter.frequency.exponentialRampToValueAtTime(11000, now + 0.08);
      filter.frequency.exponentialRampToValueAtTime(1800, now + duration);
      filter.Q.setValueAtTime(4.0, now);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {
      console.warn("Audio Context playDashWhiz failed", e);
    }
  }

  // TTS announcer system for vocal combat feedback
  speakVoiceover(text: string) {
    try {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.3; // Speedy energetic pace
        utterance.pitch = 1.0; // Clear delivery
        
        const voices = window.speechSynthesis.getVoices();
        // Prefer en-US voices if available, particularly male/female expressive voices
        const enVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) || 
                        voices.find(v => v.lang.startsWith('en')) || 
                        voices[0];
        if (enVoice) {
          utterance.voice = enVoice;
        }
        
        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      console.warn("TTS speakVoiceover failed:", e);
    }
  }

  // Play announcer cues when combo milestones are reached
  playComboMilestone(comboCount: number) {
    let message = '';
    switch (comboCount) {
      case 2:
        message = 'Double Kill!';
        break;
      case 3:
        message = 'Triple Kill!';
        break;
      case 5:
        message = 'Mega Overheat!';
        break;
      case 8:
        message = 'Ultra Combo!';
        break;
      case 10:
        message = 'Monster Combo!';
        break;
      case 15:
        message = 'Rampage!';
        break;
      case 20:
        message = 'Legendary Overdrive!';
        break;
      case 30:
        message = 'Godlike!';
        break;
    }
    if (message) {
      this.speakVoiceover(message);
    }
  }

  // Deep rising sub-bass gravitational charging & warp-zoom sequence
  playWarpEntering() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Deep rumble charge
      const rumble = this.ctx.createOscillator();
      const rumbleGain = this.ctx.createGain();
      rumble.type = 'sawtooth';
      rumble.frequency.setValueAtTime(55, now);
      rumble.frequency.exponentialRampToValueAtTime(320, now + 1.2);
      rumbleGain.gain.setValueAtTime(0.3, now);
      rumbleGain.gain.linearRampToValueAtTime(0.4, now + 0.8);
      rumbleGain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(150, now);
      filter.frequency.exponentialRampToValueAtTime(1200, now + 1.2);

      rumble.connect(filter);
      filter.connect(rumbleGain);
      rumbleGain.connect(this.ctx.destination);
      rumble.start(now);
      rumble.stop(now + 1.2);

      // Shimmer frequency ring
      const chime = this.ctx.createOscillator();
      const chimeGain = this.ctx.createGain();
      chime.type = 'sine';
      chime.frequency.setValueAtTime(1500, now);
      chime.frequency.linearRampToValueAtTime(3800, now + 1.2);
      chimeGain.gain.setValueAtTime(0.02, now);
      chimeGain.gain.linearRampToValueAtTime(0.12, now + 1.0);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

      chime.connect(chimeGain);
      chimeGain.connect(this.ctx.destination);
      chime.start(now);
      chime.stop(now + 1.2);
    } catch (e) {
      console.warn("Audio Context playback failed", e);
    }
  }

  // Setting deceleration sweep
  playWarpExiting() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const rumble = this.ctx.createOscillator();
      const rumbleGain = this.ctx.createGain();
      rumble.type = 'triangle';
      rumble.frequency.setValueAtTime(320, now);
      rumble.frequency.exponentialRampToValueAtTime(75, now + 1.0);
      rumbleGain.gain.setValueAtTime(0.35, now);
      rumbleGain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);

      rumble.connect(rumbleGain);
      rumbleGain.connect(this.ctx.destination);
      rumble.start(now);
      rumble.stop(now + 1.0);
    } catch (e) {
      console.warn("Audio Context playback failed", e);
    }
  }

  private jungleStreamNodes: {
    noiseSource?: AudioBufferSourceNode;
    noiseFilter?: BiquadFilterNode;
    noiseGain?: GainNode;
    lfo?: OscillatorNode;
    intervals: any[];
  } | null = null;

  startLyriaJungleStream() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.jungleStreamNodes) return; // Already running

      const now = this.ctx.currentTime;
      const intervalsList: any[] = [];

      // 1. Procedural White Noise Generator for Wind / Leaf Rustle
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;

      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(550, now);
      noiseFilter.Q.setValueAtTime(1.2, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.035, now);

      // Low frequency oscillator (LFO) to modulate wind intensity slowly
      const lfo = this.ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.09, now); // Very slow breath (approx 11 seconds)
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(220, now); // Modulate by 220Hz

      lfo.connect(lfoGain);
      lfoGain.connect(noiseFilter.frequency);
      
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.ambientGain || this.ctx.destination);

      lfo.start(now);
      noiseSource.start(now);

      // 2. Chirping Crickets Synth Loop
      const playCricketChirp = () => {
        if (!this.ctx || !this.jungleStreamNodes) return;
        const time = this.ctx.currentTime;
        // Build 3 rapid chirps
        for (let burst = 0; burst < 3; burst++) {
          const chirpTime = time + burst * 0.12;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(3900 + Math.random() * 150, chirpTime);

          // Rhythmic high speed ring mod
          gain.gain.setValueAtTime(0.0, chirpTime);
          gain.gain.linearRampToValueAtTime(0.012, chirpTime + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, chirpTime + 0.09);

          const filter = this.ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(3900, chirpTime);
          filter.Q.setValueAtTime(5, chirpTime);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(this.ambientGain || this.ctx.destination);

          osc.start(chirpTime);
          osc.stop(chirpTime + 0.09);
        }
      };

      // Periodic crickets cadence
      const cricketInterval = setInterval(() => {
        playCricketChirp();
      }, 2500);
      intervalsList.push(cricketInterval);

      // 3. Exotic Lyria Bird Whistling Synth
      const playExoticBird = () => {
        if (!this.ctx || !this.jungleStreamNodes) return;
        const time = this.ctx.currentTime;
        const duration = 0.4 + Math.random() * 0.35;
        const baseFreq = 1900 + Math.random() * 500;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq, time);
        // Sweep up and down to sound bird-like
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.35, time + duration * 0.35);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.85, time + duration);

        gain.gain.setValueAtTime(0.0, time);
        gain.gain.linearRampToValueAtTime(0.01, time + 0.07);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

        osc.connect(gain);
        gain.connect(this.ambientGain || this.ctx.destination);

        osc.start(time);
        osc.stop(time + duration);
      };

      // Random bird calls every 5 to 10 seconds
      let birdTimeoutId: any = null;
      const runBirdTimer = () => {
        if (!this.jungleStreamNodes) return;
        playExoticBird();
        const nextDelay = 5000 + Math.random() * 6000;
        birdTimeoutId = setTimeout(runBirdTimer, nextDelay);
      };
      runBirdTimer();

      // Wrap bird timeout inside a clearable object
      intervalsList.push({
        clearInterval: () => {
          if (birdTimeoutId) {
            clearTimeout(birdTimeoutId);
          }
        }
      });

      this.jungleStreamNodes = {
        noiseSource,
        noiseFilter,
        noiseGain,
        lfo,
        intervals: intervalsList
      };
    } catch (e) {
      console.warn("Failed Lyria Jungle Audio Stream startup:", e);
    }
  }

  playHeartbeat() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      
      // First beat (lub) - rapid bass thump
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(65, now);
      osc1.frequency.linearRampToValueAtTime(30, now + 0.12);
      gain1.gain.setValueAtTime(0.35, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      
      const filter1 = this.ctx.createBiquadFilter();
      filter1.type = 'lowpass';
      filter1.frequency.setValueAtTime(100, now);
      
      osc1.connect(filter1);
      filter1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.13);
      
      // Second beat (dub) - slightly lower pitch & offset by 220ms
      const delay = 0.22;
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(55, now + delay);
      osc2.frequency.linearRampToValueAtTime(25, now + delay + 0.12);
      gain2.gain.setValueAtTime(0.28, now + delay);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.12);
      
      const filter2 = this.ctx.createBiquadFilter();
      filter2.type = 'lowpass';
      filter2.frequency.setValueAtTime(80, now + delay);
      
      osc2.connect(filter2);
      filter2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(now + delay);
      osc2.stop(now + delay + 0.13);
    } catch (e) {
      console.warn("Heartbeat playback failed", e);
    }
  }

  stopLyriaJungleStream() {
    try {
      if (!this.jungleStreamNodes) return;
      
      this.jungleStreamNodes.intervals.forEach((timer) => {
        if (timer && typeof timer.clearInterval === 'function') {
          timer.clearInterval();
        } else {
          clearInterval(timer);
        }
      });

      if (this.jungleStreamNodes.noiseSource) {
        this.jungleStreamNodes.noiseSource.stop();
      }
      if (this.jungleStreamNodes.lfo) {
        this.jungleStreamNodes.lfo.stop();
      }

      this.jungleStreamNodes = null;
    } catch (e) {
      console.warn("Failed to stop Lyria Jungle ambient streams cleanly:", e);
    }
  }

  private arenaAmbienceNodes: {
    humOsc?: OscillatorNode;
    humGain?: GainNode;
    intervals: any[];
  } | null = null;

  startArenaAmbience() {
    try {
      this.init();
      if (!this.ctx || this.isMuted) return;
      if (this.arenaAmbienceNodes) return; // Already running

      const now = this.ctx.currentTime;
      const intervalsList: any[] = [];

      // 1. Deep low-frequency background tech drone/hum
      const humOsc = this.ctx.createOscillator();
      const humGain = this.ctx.createGain();
      humOsc.type = 'triangle';
      humOsc.frequency.setValueAtTime(60, now); // 60Hz hum

      // Low frequency rumble filter
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(100, now);

      humGain.gain.setValueAtTime(0.04, now); // quiet hum

      humOsc.connect(filter);
      filter.connect(humGain);
      humGain.connect(this.ambientGain || this.ctx.destination);

      humOsc.start(now);

      // 2. Periodic distant mechanical explosions/thuds/clangs
      const playDistantExplosion = () => {
        if (!this.ctx || !this.arenaAmbienceNodes || this.isMuted) return;
        const time = this.ctx.currentTime;
        const duration = 1.0 + Math.random() * 1.5;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(45 + Math.random() * 15, time);
        osc.frequency.exponentialRampToValueAtTime(10, time + duration);

        const distFilter = this.ctx.createBiquadFilter();
        distFilter.type = 'lowpass';
        distFilter.frequency.setValueAtTime(80, time);

        gain.gain.setValueAtTime(0.0, time);
        gain.gain.linearRampToValueAtTime(0.12, time + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

        osc.connect(distFilter);
        distFilter.connect(gain);
        gain.connect(this.ambientGain || this.ctx.destination);

        osc.start(time);
        osc.stop(time + duration);
      };

      // Play a distant mechanical thud every 4-8 seconds
      let explosionTimeoutId: any = null;
      const runExplosionTimer = () => {
        if (!this.arenaAmbienceNodes) return;
        playDistantExplosion();
        const nextDelay = 4000 + Math.random() * 4000;
        explosionTimeoutId = setTimeout(runExplosionTimer, nextDelay);
      };
      runExplosionTimer();

      intervalsList.push({
        clearInterval: () => {
          if (explosionTimeoutId) clearTimeout(explosionTimeoutId);
        }
      });

      // 3. High pitch quiet electronic static sparks (battlefield interference)
      const playDistantZaps = () => {
        if (!this.ctx || !this.arenaAmbienceNodes || this.isMuted) return;
        const time = this.ctx.currentTime;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(4000 + Math.random() * 1000, time);
        osc.frequency.exponentialRampToValueAtTime(2000, time + 0.05);

        const zapFilter = this.ctx.createBiquadFilter();
        zapFilter.type = 'bandpass';
        zapFilter.frequency.setValueAtTime(3000, time);
        zapFilter.Q.setValueAtTime(8, time);

        gain.gain.setValueAtTime(0.0, time);
        gain.gain.linearRampToValueAtTime(0.003, time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);

        osc.connect(zapFilter);
        zapFilter.connect(gain);
        gain.connect(this.ambientGain || this.ctx.destination);

        osc.start(time);
        osc.stop(time + 0.05);
      };

      // Periodic ambient electric discharges
      const dischargeInterval = setInterval(() => {
        playDistantZaps();
      }, 3300);
      intervalsList.push(dischargeInterval);

      this.arenaAmbienceNodes = {
        humOsc,
        humGain,
        intervals: intervalsList
      };
    } catch (e) {
      console.warn("Failed Arena Ambience startup:", e);
    }
  }

  stopArenaAmbience() {
    try {
      if (!this.arenaAmbienceNodes) return;
      
      this.arenaAmbienceNodes.intervals.forEach((timer) => {
        if (timer && typeof timer.clearInterval === 'function') {
          timer.clearInterval();
        } else {
          clearInterval(timer);
        }
      });

      if (this.arenaAmbienceNodes.humOsc) {
        try {
          this.arenaAmbienceNodes.humOsc.stop();
        } catch (_) {}
      }

      this.arenaAmbienceNodes = null;
    } catch (e) {
      console.warn("Failed to stop Arena Ambience cleanly:", e);
    }
  }

  playSystemIntegrityWarning() {
    try {
      this.init();
      if (this.isMuted || !this.ctx) return;
      const now = this.ctx.currentTime;

      // Create wave-shaping distortion curve
      const makeDistortionCurve = (amount = 100) => {
        const k = typeof amount === 'number' ? amount : 100;
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        const deg = Math.PI / 180;
        for (let i = 0; i < n_samples; ++i) {
          const x = (i * 2) / n_samples - 1;
          curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
        }
        return curve;
      };

      const distortion = this.ctx.createWaveShaper();
      distortion.curve = makeDistortionCurve(120);
      distortion.oversample = '4x';

      // Gritty peaking filter centered around 500Hz for mechanical industrial alarm feel
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.setValueAtTime(500, now);
      filter.Q.setValueAtTime(6, now);

      // Create detuned dual warning oscillators
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(160, now);
      osc1.frequency.linearRampToValueAtTime(110, now + 0.35);
      osc1.frequency.setValueAtTime(160, now + 0.45);
      osc1.frequency.linearRampToValueAtTime(90, now + 0.9);

      osc2.type = 'square';
      osc2.frequency.setValueAtTime(165, now);
      osc2.frequency.linearRampToValueAtTime(115, now + 0.35);
      osc2.frequency.setValueAtTime(165, now + 0.45);
      osc2.frequency.linearRampToValueAtTime(95, now + 0.9);

      // LFO for a choppy "glitchy" warning modulation effect
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.setValueAtTime(12, now); // 12Hz stutter
      lfoGain.gain.setValueAtTime(0.7, now);

      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.005, now + 1.1);

      osc1.connect(distortion);
      osc2.connect(distortion);
      distortion.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      lfo.start(now);
      osc1.start(now);
      osc2.start(now);

      lfo.stop(now + 1.1);
      osc1.stop(now + 1.1);
      osc2.stop(now + 1.1);

      // Distorted Voice synthesis announcement
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance("Warning: System Integrity Compromised");
        utterance.rate = 0.95; // Slightly slower, deliberate
        utterance.pitch = 0.5; // Robotic lower register

        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural'))) || 
                      voices.find(v => v.lang.startsWith('en')) || 
                      voices[0];
        if (voice) {
          utterance.voice = voice;
        }
        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      console.warn("Distorted system integrity warning playback failed:", e);
    }
  }

  // Play a synthesized sci-fi water splash using upward pitch sweeps and bandpass filters
  playSplash() {
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      
      const playDrop = (delay: number, freq: number, q: number) => {
        if (!this.ctx) return;
        const time = now + delay;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        
        osc.type = 'sine';
        // Classic liquid bubble sound: sweep frequency rapidly upwards
        osc.frequency.setValueAtTime(freq, time);
        osc.frequency.exponentialRampToValueAtTime(freq * 2.2, time + 0.12);
        
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(freq * 1.5, time);
        filter.Q.setValueAtTime(q, time);
        
        gain.gain.setValueAtTime(0.0, time);
        gain.gain.linearRampToValueAtTime(0.08, time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start(time);
        osc.stop(time + 0.12);
      };

      // Play several overlapping liquid droplets to create a beautiful, rich splash
      playDrop(0, 280, 15);
      playDrop(0.03, 420, 12);
      playDrop(0.06, 320, 18);
      playDrop(0.10, 480, 10);
    } catch (e) {
      console.warn("Synthesized splash playback failed:", e);
    }
  }
}

export const soundManager = new CyberSoundManager();
