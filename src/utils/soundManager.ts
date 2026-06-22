/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Custom web audio synthesizer for cyber effects
class CyberSoundManager {
  private ctx: AudioContext | null = null;
  private activeLasersCount = 0;

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    // Resume context if suspended (browser security policy)
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
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
      noiseGain.connect(this.ctx.destination);

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
          gain.connect(this.ctx.destination);

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
        gain.connect(this.ctx.destination);

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
}

export const soundManager = new CyberSoundManager();
