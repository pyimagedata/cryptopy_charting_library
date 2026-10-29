/** WebAudio-synthesised alert sounds (no audio files). Every entry point is safe when audio is unavailable. */
import type { AlertSound } from './types';

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
    try {
        if (ctx && ctx.state !== 'closed') return ctx;
        const Ctor: typeof AudioContext | undefined = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
        if (!Ctor) return null;
        ctx = new Ctor();
        return ctx;
    } catch {
        return null;
    }
}

interface Tone { freq: number; start: number; dur: number; type: OscillatorType; gain: number; }

function schedule(ac: AudioContext, tones: Tone[]): void {
    const t0 = ac.currentTime + 0.02;
    for (const tone of tones) {
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = tone.type;
        osc.frequency.value = tone.freq;
        const a = t0 + tone.start;
        g.gain.setValueAtTime(0.0001, a);
        g.gain.exponentialRampToValueAtTime(tone.gain, a + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, a + tone.dur);
        osc.connect(g);
        g.connect(ac.destination);
        osc.start(a);
        osc.stop(a + tone.dur + 0.05);
    }
}

function tonesFor(name: AlertSound): Tone[] {
    switch (name) {
        case 'bell':
            return [
                { freq: 660, start: 0, dur: 1.4, type: 'sine', gain: 0.22 },
                { freq: 660 * 2.76, start: 0, dur: 0.9, type: 'sine', gain: 0.1 },
                { freq: 660 * 5.4, start: 0, dur: 0.5, type: 'sine', gain: 0.05 },
            ];
        case 'beep':
            return [0, 0.2, 0.4].map((s) => ({ freq: 1000, start: s, dur: 0.12, type: 'square' as OscillatorType, gain: 0.07 }));
        case 'alarm':
            return [0, 0.18, 0.36, 0.54, 0.72, 0.9].map((s, i) => ({
                freq: i % 2 === 0 ? 880 : 660, start: s, dur: 0.16, type: 'sawtooth' as OscillatorType, gain: 0.08,
            }));
        case 'chime':
        default:
            return [
                { freq: 880, start: 0, dur: 0.7, type: 'sine', gain: 0.2 },
                { freq: 1318.5, start: 0.18, dur: 0.9, type: 'sine', gain: 0.18 },
            ];
    }
}

/** Plays the named sound. Never throws; silently does nothing without WebAudio or while the context is blocked. */
export function playAlertSound(name: AlertSound): void {
    try {
        const ac = getContext();
        if (!ac) return;
        const run = () => { try { schedule(ac, tonesFor(name)); } catch { /* ignore */ } };
        if (ac.state === 'suspended') {
            const asked = Date.now();
            const r = ac.resume();
            // a sound that could only start after the context was finally unlocked is stale: drop it
            if (r && typeof r.then === 'function') r.then(() => { if (ac.state === 'running' && Date.now() - asked <= 500) run(); }, () => { /* autoplay blocked */ });
            return;
        }
        run();
    } catch {
        /* audio unavailable */
    }
}
