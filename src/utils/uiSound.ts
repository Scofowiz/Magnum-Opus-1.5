let audioContextInstance: AudioContext | null = null;

type UiSound = 'tap' | 'success' | 'soft-alert';

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const AudioContextCtor = window.AudioContext || (window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext;

  if (!AudioContextCtor) return null;

  if (!audioContextInstance) {
    audioContextInstance = new AudioContextCtor();
  }

  return audioContextInstance;
}

export async function playUiSound(kind: UiSound): Promise<void> {
  const context = getAudioContext();
  if (!context) return;

  if (context.state === 'suspended') {
    await context.resume().catch(() => undefined);
  }

  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);

  filter.type = 'lowpass';

  if (kind === 'tap') {
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(720, now);
    oscillator.frequency.exponentialRampToValueAtTime(540, now + 0.08);
    filter.frequency.setValueAtTime(1800, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.028, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    oscillator.start(now);
    oscillator.stop(now + 0.12);
    return;
  }

  if (kind === 'success') {
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(680, now);
    oscillator.frequency.exponentialRampToValueAtTime(980, now + 0.12);
    filter.frequency.setValueAtTime(2400, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.03, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    oscillator.start(now);
    oscillator.stop(now + 0.18);
    return;
  }

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(460, now);
  oscillator.frequency.exponentialRampToValueAtTime(390, now + 0.18);
  filter.frequency.setValueAtTime(1400, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.022, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
  oscillator.start(now);
  oscillator.stop(now + 0.26);
}
