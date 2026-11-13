/**
 * Sci-Fi Web Audio Synthesizer & Dual-Track Arena Music Engine
 * Includes: Realistic Crowd Applause & Cheering Synthesizer for 120 Perfect Score!
 * Track 1: SET UP Preparation Groove (Tactical, Focused, 112 BPM)
 * Track 2: MATCH Arena Battle Beat (High-Energy, Driving 128-138 BPM)
 * Zero external audio files required — 100% offline, instant, zero latency!
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.bgmEnabled = true;
    this.bgmPlaying = false;
    this.bgmInterval = null;
    this.currentTrack = null;
    this.beatStep = 0;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle(enabled) {
    this.enabled = enabled !== undefined ? enabled : !this.enabled;
    if (!this.enabled) {
      this.stopArenaBeat();
    }
    return this.enabled;
  }

  toggleBgm(enabled) {
    this.bgmEnabled = enabled !== undefined ? enabled : !this.bgmEnabled;
    if (!this.bgmEnabled) {
      this.stopArenaBeat();
    }
    return this.bgmEnabled;
  }

  // ================= MUSIC DISPATCHER =================
  startArenaBeat(phase = 'match', isUrgent = false) {
    if (!this.enabled || !this.bgmEnabled) return;
    this.init();

    if (this.bgmPlaying && this.currentTrack === phase && !isUrgent) return;
    this.stopArenaBeat();

    this.bgmPlaying = true;
    this.currentTrack = phase;
    this.beatStep = 0;

    if (phase === 'setup') {
      // TRACK 1: SET UP TACTICAL GROOVE (112 BPM)
      const tempo = 112;
      const intervalMs = (60 / tempo / 4) * 1000;
      this.bgmInterval = setInterval(() => {
        if (!this.bgmPlaying || !this.enabled || !this.bgmEnabled) {
          this.stopArenaBeat();
          return;
        }
        this.playSetupStep(this.beatStep);
        this.beatStep = (this.beatStep + 1) % 16;
      }, intervalMs);

    } else {
      // TRACK 2: MATCH HIGH-ENERGY BATTLE BEAT (128 - 138 BPM)
      const tempo = isUrgent ? 138 : 128;
      const intervalMs = (60 / tempo / 4) * 1000;
      this.bgmInterval = setInterval(() => {
        if (!this.bgmPlaying || !this.enabled || !this.bgmEnabled) {
          this.stopArenaBeat();
          return;
        }
        this.playMatchStep(this.beatStep, isUrgent);
        this.beatStep = (this.beatStep + 1) % 16;
      }, intervalMs);
    }
  }

  stopArenaBeat() {
    this.bgmPlaying = false;
    this.currentTrack = null;
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
  }

  // ================= TRACK 1: SET UP TACTICAL PREP MUSIC (112 BPM) =================
  playSetupStep(step) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (step === 0 || step === 8) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(85, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.2);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    }

    if (step % 2 === 0) {
      this.playTick(now, step % 4 === 2 ? 0.04 : 0.02);
    }

    const setupMelody = [
      329.63, 0, 392.00, 440.00, 
      0, 493.88, 0, 440.00, 
      392.00, 0, 440.00, 587.33, 
      493.88, 0, 392.00, 329.63
    ];

    const freq = setupMelody[step];
    if (freq > 0) {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, now);
      filter.frequency.exponentialRampToValueAtTime(600, now + 0.12);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.14);
    }
  }

  // ================= TRACK 2: MATCH BATTLE BEAT (128-138 BPM) =================
  playMatchStep(step, isUrgent) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (step % 4 === 0) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isUrgent ? 170 : 135, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.12);

      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    }

    if (step % 2 === 0 || (isUrgent && step % 1 === 0)) {
      this.playHiHat(now, step % 4 === 2 ? 0.09 : 0.04);
    }

    const bassNotes = isUrgent
      ? [55, 55, 69, 73, 55, 55, 82, 73, 55, 55, 69, 73, 92, 82, 73, 69]
      : [46, 46, 0, 46, 55, 46, 0, 61, 46, 46, 0, 46, 69, 61, 55, 46];

    const freq = bassNotes[step];
    if (freq > 0) {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq * 1.5, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(isUrgent ? 1700 : 950, now);
      filter.frequency.exponentialRampToValueAtTime(isUrgent ? 450 : 260, now + 0.09);

      gain.gain.setValueAtTime(0.13, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.1);
    }
  }

  playHiHat(time, vol) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(8000, time);

    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7000, time);

    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.035);
  }

  playTick(time, vol) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(3200, time);

    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.02);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.02);
  }

  // ================= CROWD CHEERING & APPLAUSE SYNTHESIZER =================
  // Synthesizes realistic arena crowd applause, joyous cheering swells and victory fanfare!
  cheerAndApplause() {
    if (!this.enabled) return;
    this.init();
    this.stopArenaBeat(); // Stop the battle beat immediately

    const now = this.ctx.currentTime;
    const duration = 4.2; // seconds of cheering & clapping

    // 1. Generate Realistic Crowd Applause Buffer (thousands of random claps)
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = sampleRate * duration;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const output = noiseBuffer.getChannelData(0);

    // Create stochastic density clusters (clapping hands)
    for (let i = 0; i < bufferSize; i++) {
      const t = i / sampleRate;
      // White noise with random spikes
      const rawNoise = (Math.random() * 2 - 1);
      // Density modulation to sound like distinct claps
      const density = Math.sin(t * 12) * 0.3 + 0.7;
      output[i] = rawNoise * Math.pow(Math.random(), 4) * 8 * density;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    // Filter to shape into natural acoustic hand-clap frequency band (800Hz - 2400Hz)
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.Q.setValueAtTime(1.2, now);

    const applauseGain = this.ctx.createGain();
    applauseGain.gain.setValueAtTime(0.01, now);
    applauseGain.gain.exponentialRampToValueAtTime(0.45, now + 0.4); // swell
    applauseGain.gain.setValueAtTime(0.45, now + 2.5);
    applauseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    whiteNoise.connect(filter);
    filter.connect(applauseGain);
    applauseGain.connect(this.ctx.destination);

    whiteNoise.start(now);
    whiteNoise.stop(now + duration);

    // 2. Crowd Cheering Swells ("Whooo! Yaaay!")
    const cheerVoices = [
      { startF: 350, endF: 620, startT: 0.1, len: 1.8, vol: 0.18 },
      { startF: 450, endF: 780, startT: 0.25, len: 2.0, vol: 0.16 },
      { startF: 280, endF: 520, startT: 0.15, len: 2.2, vol: 0.20 },
      { startF: 520, endF: 920, startT: 0.35, len: 1.6, vol: 0.14 },
      // Second wave of cheering
      { startF: 400, endF: 750, startT: 1.5, len: 2.2, vol: 0.20 },
      { startF: 320, endF: 600, startT: 1.7, len: 2.0, vol: 0.18 }
    ];

    cheerVoices.forEach(v => {
      const vOsc = this.ctx.createOscillator();
      const vFilter = this.ctx.createBiquadFilter();
      const vGain = this.ctx.createGain();

      vOsc.type = 'sawtooth';
      vOsc.frequency.setValueAtTime(v.startF, now + v.startT);
      vOsc.frequency.exponentialRampToValueAtTime(v.endF, now + v.startT + v.len * 0.6);
      vOsc.frequency.linearRampToValueAtTime(v.endF * 0.9, now + v.startT + v.len);

      // Formant vowel filter ("Aaaah/Ooooh")
      vFilter.type = 'bandpass';
      vFilter.frequency.setValueAtTime(v.startF * 1.8, now + v.startT);
      vFilter.Q.setValueAtTime(2.5, now + v.startT);

      vGain.gain.setValueAtTime(0.001, now + v.startT);
      vGain.gain.exponentialRampToValueAtTime(v.vol, now + v.startT + 0.3);
      vGain.gain.exponentialRampToValueAtTime(0.0001, now + v.startT + v.len);

      vOsc.connect(vFilter);
      vFilter.connect(vGain);
      vGain.connect(this.ctx.destination);

      vOsc.start(now + v.startT);
      vOsc.stop(now + v.startT + v.len);
    });

    // 3. Victorious Grand Trumpet Fanfare over the cheering!
    this.victoryFanfareChords(now);
  }

  // Victorious Grand Trumpet Fanfare
  victoryFanfareChords(now) {
    const fanfareNotes = [
      { f: 523.25, t: 0, d: 0.18 },   // C5
      { f: 659.25, t: 0.18, d: 0.18 }, // E5
      { f: 783.99, t: 0.36, d: 0.18 }, // G5
      { f: 1046.50, t: 0.54, d: 0.8 }, // High C6 (grand triumph!)
      // Harmonized chord
      { f: 783.99, t: 0.54, d: 0.8 },
      { f: 523.25, t: 0.54, d: 0.8 }
    ];

    fanfareNotes.forEach(n => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, now + n.t);

      gain.gain.setValueAtTime(0.35, now + n.t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + n.t);
      osc.stop(now + n.t + n.d);
    });
  }

  // ================= SOUND EFFECTS (SFX) =================

  // Soft high-tech click
  click() {
    if (!this.enabled) return;
    this.init();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  // Box slot latch sound (Mecha mech click)
  boxLatch(active = true) {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc2.type = 'square';

    if (active) {
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(640, now + 0.08);
      osc2.frequency.setValueAtTime(640, now);
      osc2.frequency.exponentialRampToValueAtTime(960, now + 0.08);
    } else {
      osc.frequency.setValueAtTime(500, now);
      osc.frequency.exponentialRampToValueAtTime(250, now + 0.08);
      osc2.frequency.setValueAtTime(700, now);
      osc2.frequency.exponentialRampToValueAtTime(350, now + 0.08);
    }

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc2.start();
    osc.stop(now + 0.09);
    osc2.stop(now + 0.09);
  }

  // Score points added chime
  scoreChime() {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.50];

    freqs.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);
      gain.gain.setValueAtTime(0.22, now + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.22);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.04);
      osc.stop(now + idx * 0.04 + 0.22);
    });
  }

  // Foul warning buzz
  foulAlert() {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.linearRampToValueAtTime(110, now + 0.25);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(now + 0.25);
  }

  // Countdown radar blip
  countdownBeep(isFinal = false) {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isFinal ? 1300 : 850, now);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isFinal ? 0.4 : 0.15));

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(now + (isFinal ? 0.4 : 0.15));
  }

  // Start Whistle / Match Horn
  startWhistle() {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.15);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(now + 0.35);
  }

  // Setup Start Chime
  startSetupChime() {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);
      gain.gain.setValueAtTime(0.2, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.3);
    });
  }

  // Arena Horn / Buzzer (End of match)
  buzzer() {
    this.stopArenaBeat();
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;
    
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';

    osc1.frequency.setValueAtTime(220, now);
    osc2.frequency.setValueAtTime(223, now);

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.setValueAtTime(0.5, now + 1.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(now + 1.8);
    osc2.stop(now + 1.8);
  }

  // Standard victory
  victory() {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;
    const notes = [
      { f: 523.25, t: 0, d: 0.12 },
      { f: 659.25, t: 0.12, d: 0.12 },
      { f: 783.99, t: 0.24, d: 0.12 },
      { f: 1046.50, t: 0.36, d: 0.5 }
    ];

    notes.forEach(note => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.f, now + note.t);
      gain.gain.setValueAtTime(0.3, now + note.t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.t + note.d);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + note.t);
      osc.stop(now + note.t + note.d);
    });
  }
}

// Global Sound Instance
const sound = new SoundEngine();
