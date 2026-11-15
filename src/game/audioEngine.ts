import { computeAcousticOcclusion, type Point3D } from './acoustics';
import type { WallBox, WeaponId } from './types';

/**
 * Procedural Web Audio API Tactical Sound Engine:
 * - Zero external MP3/WAV dependencies
 * - Real-time raycasted acoustic occlusion (BiquadFilterNode low-pass + dB gain attenuation)
 * - Stereo azimuth panning based on listener yaw
 * - Proximity-based Comms + Encrypted Tactical Radio Walkie-Talkie DSP
 */
export class TacticalAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;

  public unlock(fromUserGesture = false): void {
    if (typeof window === 'undefined') return;
    const userActive =
      fromUserGesture ||
      Boolean((navigator as unknown as { userActivation?: { hasBeenActive?: boolean } }).userActivation?.hasBeenActive);
    if (!userActive) return;

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 18;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.85;
      comp.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.noiseBuffer = this.buildNoiseBuffer(this.ctx);
      this.masterCompressor = comp;
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private masterCompressor: DynamicsCompressorNode | null = null;

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.85, this.ctx.currentTime, 0.02);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private buildNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private getOutputNode(): AudioNode | null {
    return this.masterCompressor ?? this.masterGain;
  }

  /**
   * Player gunfire: suppressed tactical 5.56 / 9mm crack + mechanical bolt + concrete room tail.
   */
  public playPlayerShot(weapon: WeaponId): void {
    if (!this.ctx || !this.noiseBuffer || this.muted) return;
    const out = this.getOutputNode();
    if (!out) return;

    const now = this.ctx.currentTime;
    const pitchJitter = 0.94 + Math.random() * 0.12;

    // 1. Sharp suppressed snap transient
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime((weapon === 'carbine' ? 1750 : 2100) * pitchJitter, now);
    bp.Q.value = 0.9;

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(weapon === 'carbine' ? 0.58 : 0.45, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + (weapon === 'carbine' ? 0.22 : 0.16));

    noise.connect(bp);
    bp.connect(nGain);
    nGain.connect(out);
    noise.start(now);
    noise.stop(now + 0.25);

    // 2. Low-end chest punch
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime((weapon === 'carbine' ? 165 : 195) * pitchJitter, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.085);

    const oGain = this.ctx.createGain();
    oGain.gain.setValueAtTime(0.45, now);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(oGain);
    oGain.connect(out);
    osc.start(now);
    osc.stop(now + 0.1);

    // 3. Concrete room tail
    const tail = this.ctx.createBufferSource();
    tail.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1100, now);
    const tGain = this.ctx.createGain();
    tGain.gain.setValueAtTime(0.11, now + 0.03);
    tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    tail.connect(lp);
    lp.connect(tGain);
    tGain.connect(out);
    tail.start(now + 0.02);
    tail.stop(now + 0.48);
  }

  /**
   * Spatialized enemy gunfire processed through real-time raycasted acoustic occlusion!
   */
  public playSpatialGunshot(
    listener: Point3D,
    listenerYaw: number,
    source: Point3D,
    walls: readonly WallBox[],
  ): void {
    if (!this.ctx || !this.noiseBuffer || this.muted) return;
    const out = this.getOutputNode();
    if (!out) return;

    const acc = computeAcousticOcclusion(listener, listenerYaw, source, walls);
    if (acc.gain <= 0.025) return;

    const now = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(acc.cutoffHz, now);
    lp.Q.value = acc.isOccluded ? 1.4 : 0.7;

    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(acc.pan, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.65 * acc.gain, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    noise.connect(lp);
    lp.connect(panner);
    panner.connect(gain);
    gain.connect(out);
    noise.start(now);
    noise.stop(now + 0.3);

    // Occluded sub-bass thump penetrates concrete walls
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(125, now);
    sub.frequency.exponentialRampToValueAtTime(40, now + 0.11);
    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.32 * Math.min(1, acc.gain * 1.4), now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    sub.connect(panner);
    sub.connect(subGain);
    subGain.connect(out);
    sub.start(now);
    sub.stop(now + 0.13);
  }

  /**
   * Proximity Comms + Radio Squelch Synthesis:
   * - Direct acoustic voice branch filtered through wall occlusion (cutoffHz + gain + stereo pan)
   * - Tactical encrypted walkie-talkie branch (bandpass 650-2400Hz + squelch chirp + carrier)
   *   blended smoothly by `radioMix` from `computeAcousticOcclusion`.
   */
  public playProximityComms(
    listener: Point3D,
    listenerYaw: number,
    source: Point3D,
    walls: readonly WallBox[],
    isAlly: boolean,
  ): ReturnType<typeof computeAcousticOcclusion> {
    const acc = computeAcousticOcclusion(listener, listenerYaw, source, walls);
    if (!this.ctx || !this.noiseBuffer || this.muted) return acc;
    const out = this.getOutputNode();
    if (!out) return acc;

    const now = this.ctx.currentTime;

    // 1. Tactical radio squelch chirp (start & end of transmission when radioMix > 0.2)
    if (acc.radioMix > 0.2 || isAlly) {
      const sq = this.ctx.createOscillator();
      sq.type = 'sine';
      sq.frequency.setValueAtTime(isAlly ? 1850 : 1120, now);
      sq.frequency.setValueAtTime(isAlly ? 2350 : 940, now + 0.035);
      const sqGain = this.ctx.createGain();
      sqGain.gain.setValueAtTime(0.065 * acc.radioMix, now);
      sqGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
      sq.connect(sqGain);
      sqGain.connect(out);
      sq.start(now);
      sq.stop(now + 0.08);
    }

    // 2. Synthesized tactical voice cadence (3 modulated formant syllables)
    const syllables = isAlly ? 3 : 2;
    for (let i = 0; i < syllables; i++) {
      const t0 = now + 0.06 + i * 0.11;
      const carrier = this.ctx.createOscillator();
      carrier.type = 'sawtooth';
      const baseFreq = isAlly ? 132 : 108;
      carrier.frequency.setValueAtTime(baseFreq + (i % 2) * 18, t0);
      carrier.frequency.linearRampToValueAtTime(baseFreq - 12, t0 + 0.08);

      // Direct acoustic occlusion filter
      const occlFilter = this.ctx.createBiquadFilter();
      occlFilter.type = 'lowpass';
      occlFilter.frequency.setValueAtTime(acc.cutoffHz, t0);

      // Radio bandpass filter (walkie-talkie clarity even behind thick walls)
      const radioFilter = this.ctx.createBiquadFilter();
      radioFilter.type = 'bandpass';
      radioFilter.frequency.setValueAtTime(1350, t0);
      radioFilter.Q.value = 1.8;

      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(acc.pan, t0);

      const directGain = this.ctx.createGain();
      directGain.gain.setValueAtTime(0.09 * acc.gain * (1 - acc.radioMix * 0.5), t0);
      directGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);

      const radioGain = this.ctx.createGain();
      radioGain.gain.setValueAtTime((isAlly ? 0.06 : 0.028) * acc.radioMix, t0);
      radioGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);

      carrier.connect(occlFilter);
      occlFilter.connect(panner);
      panner.connect(directGain);
      directGain.connect(out);

      carrier.connect(radioFilter);
      radioFilter.connect(radioGain);
      radioGain.connect(out);

      carrier.start(t0);
      carrier.stop(t0 + 0.095);
    }

    // 3. Subtle static tail
    const st = this.ctx.createBufferSource();
    st.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2200, now);
    bp.Q.value = 1.4;
    const stGain = this.ctx.createGain();
    stGain.gain.setValueAtTime(0.03 * acc.radioMix, now + 0.04);
    stGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    st.connect(bp);
    bp.connect(stGain);
    stGain.connect(out);
    st.start(now + 0.03);
    st.stop(now + 0.38);

    return acc;
  }

  public playFootstep(sprinting: boolean): void {
    if (!this.ctx || !this.noiseBuffer || this.muted) return;
    const out = this.getOutputNode();
    if (!out) return;
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(sprinting ? 640 : 420, now);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(sprinting ? 0.14 : 0.08, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    src.connect(lp);
    lp.connect(g);
    g.connect(out);
    src.start(now);
    src.stop(now + 0.08);
  }

  public playHitConfirm(headshot: boolean, killed: boolean): void {
    if (!this.ctx || this.muted) return;
    const out = this.getOutputNode();
    if (!out) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = headshot ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(headshot ? 1480 : 620, now);
    osc.frequency.exponentialRampToValueAtTime(killed ? 280 : 420, now + 0.07);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(headshot ? 0.22 : 0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(g);
    g.connect(out);
    osc.start(now);
    osc.stop(now + 0.085);
  }

  public playClick(freq = 920): void {
    if (!this.ctx || this.muted) return;
    const out = this.getOutputNode();
    if (!out) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
    osc.connect(g);
    g.connect(out);
    osc.start(now);
    osc.stop(now + 0.03);
  }

  public playReload(): void {
    if (!this.ctx || this.muted) return;
    this.playClick(540);
    setTimeout(() => this.playClick(780), 450);
    setTimeout(() => this.playClick(1080), 950);
  }

  public playPlayerHit(): void {
    if (!this.ctx || !this.noiseBuffer || this.muted) return;
    const out = this.getOutputNode();
    if (!out) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.16);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.32, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(g);
    g.connect(out);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
