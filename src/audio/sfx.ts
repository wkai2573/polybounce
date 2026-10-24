import type { SfxEvent } from './events.ts';

const MUTE_KEY = 'polybounce.muted';
/** 同時發聲的上限；多球時大量撞擊會被丟掉多餘的聲音，而不是疊成爆音。 */
const MAX_VOICES = 14;
const MASTER_GAIN = 0.3;
/** 同一種音效的最短間隔（秒），避免每一幀都重複觸發。 */
const MIN_GAP: Record<SfxEvent['kind'], number> = {
  hit: 0.04,
  launch: 0.05,
  pickup: 0.12,
  hurt: 0.25,
  death: 0.6,
  revive: 0.6,
  clear: 0.6,
  defeat: 0.6,
};

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // 本機儲存不可用時，靜音設定只在這次開啟期間有效。
  }
}

export interface Sfx {
  /** 瀏覽器要求使用者操作後才能發聲；在第一次點擊或按鍵時呼叫。 */
  unlock(): void;
  play(events: SfxEvent[]): void;
  readonly muted: boolean;
  setMuted(muted: boolean): void;
}

/** 全部音效都用 Web Audio 即時合成，不載入任何音檔。 */
export function createSfx(): Sfx {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let voices = 0;
  let muted = readMuted();
  const lastPlayed = new Map<string, number>();

  function unlock() {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_GAIN;
      // 壓縮器擋住大量聲音疊加時的破音。
      const limiter = ctx.createDynamicsCompressor();
      master.connect(limiter);
      limiter.connect(ctx.destination);

      noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
  }

  function tone(type: OscillatorType, from: number, to: number, delay: number, duration: number, gain: number) {
    if (!ctx || !master || voices >= MAX_VOICES) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(amp);
    amp.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
    voices++;
    osc.onended = () => {
      voices--;
      osc.disconnect();
      amp.disconnect();
    };
  }

  function noiseBurst(from: number, to: number, duration: number, gain: number) {
    if (!ctx || !master || !noise || voices >= MAX_VOICES) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    src.buffer = noise;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(to, t0 + duration);
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
    voices++;
    src.onended = () => {
      voices--;
      src.disconnect();
      filter.disconnect();
      amp.disconnect();
    };
  }

  function playOne(e: SfxEvent) {
    switch (e.kind) {
      case 'hit': {
        // 撞擊越多音量略增，但有上限；音高隨機一點，連續撞擊不會單調。
        const gain = Math.min(0.4, 0.14 + 0.05 * Math.sqrt(e.count));
        tone('square', 520 + Math.random() * 360, 300, 0, 0.06, gain);
        break;
      }
      case 'launch':
        tone('sine', 280, 640, 0, 0.09, 0.35);
        break;
      case 'pickup':
        tone('triangle', 520, 520, 0, 0.08, 0.35);
        tone('triangle', 660, 660, 0.07, 0.08, 0.35);
        tone('triangle', 880, 880, 0.14, 0.14, 0.35);
        break;
      case 'hurt':
        noiseBurst(2400, 200, 0.3, 0.5);
        tone('sine', 200, 70, 0, 0.25, 0.3);
        break;
      case 'death':
        tone('sawtooth', 440, 55, 0, 0.7, 0.3);
        noiseBurst(1800, 120, 0.6, 0.4);
        break;
      case 'revive':
        [262, 330, 392, 523].forEach((f, i) => tone('sine', f, f * 1.02, i * 0.07, 0.25, 0.35));
        break;
      case 'clear':
        [392, 494, 587, 784].forEach((f, i) => tone('triangle', f, f, i * 0.09, 0.2, 0.35));
        break;
      case 'defeat':
        tone('sawtooth', 330, 90, 0, 0.9, 0.3);
        tone('sawtooth', 247, 65, 0.05, 0.9, 0.22);
        break;
    }
  }

  return {
    unlock,
    play(events) {
      if (!ctx || muted || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      for (const e of events) {
        const last = lastPlayed.get(e.kind) ?? -Infinity;
        if (now - last < MIN_GAP[e.kind]) continue;
        lastPlayed.set(e.kind, now);
        playOne(e);
      }
    },
    get muted() {
      return muted;
    },
    setMuted(value) {
      muted = value;
      writeMuted(value);
      if (master && ctx) master.gain.setTargetAtTime(value ? 0 : MASTER_GAIN, ctx.currentTime, 0.01);
    },
  };
}
