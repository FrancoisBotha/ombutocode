/**
 * Notification Sound Utility
 * Uses Web Audio API to play a bell sound when tickets move to review
 */

let audioContext = null;

/**
 * Initialize the audio context (must be called after user interaction)
 */
export function initAudioContext() {
  if (!audioContext && typeof window !== 'undefined') {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

/**
 * Play a bell sound using Web Audio API
 * @param {Object} options
 * @param {number} options.frequency - Base frequency of the bell (default: 523.25 - C5)
 * @param {number} options.duration - Duration in seconds (default: 2)
 * @param {number} options.volume - Volume from 0 to 1 (default: 0.5)
 */
export function playBellSound(options = {}) {
  const ctx = initAudioContext();
  if (!ctx) return;

  const {
    frequency = 523.25, // C5 note
    duration = 2,
    volume = 0.5
  } = options;

  // Resume context if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const now = ctx.currentTime;

  // Create oscillator for the main bell tone
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  // Use sine wave for a bell-like sound
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, now);

  // Add harmonics for richer bell sound
  const harmonic2 = ctx.createOscillator();
  const harmonic2Gain = ctx.createGain();
  harmonic2.type = 'sine';
  harmonic2.frequency.setValueAtTime(frequency * 2, now); // Octave up
  harmonic2Gain.gain.setValueAtTime(volume * 0.3, now);

  const harmonic3 = ctx.createOscillator();
  const harmonic3Gain = ctx.createGain();
  harmonic3.type = 'sine';
  harmonic3.frequency.setValueAtTime(frequency * 3, now); // Fifth
  harmonic3Gain.gain.setValueAtTime(volume * 0.15, now);

  // Envelope for bell-like decay
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(volume, now + 0.01); // Quick attack
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration); // Long decay

  harmonic2Gain.gain.setValueAtTime(0, now);
  harmonic2Gain.gain.linearRampToValueAtTime(volume * 0.3, now + 0.01);
  harmonic2Gain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.8);

  harmonic3Gain.gain.setValueAtTime(0, now);
  harmonic3Gain.gain.linearRampToValueAtTime(volume * 0.15, now + 0.01);
  harmonic3Gain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.6);

  // Connect nodes
  oscillator.connect(gainNode);
  harmonic2.connect(harmonic2Gain);
  harmonic3.connect(harmonic3Gain);

  gainNode.connect(ctx.destination);
  harmonic2Gain.connect(ctx.destination);
  harmonic3Gain.connect(ctx.destination);

  // Start and stop
  oscillator.start(now);
  harmonic2.start(now);
  harmonic3.start(now);

  oscillator.stop(now + duration);
  harmonic2.stop(now + duration);
  harmonic3.stop(now + duration);
}

/**
 * Play review notification sound if enabled
 * @param {boolean} enabled - Whether the sound is enabled
 */
export function playReviewNotification(enabled = true) {
  if (!enabled) return;
  playBellSound({
    frequency: 523.25, // C5
    duration: 1.5,
    volume: 0.4
  });
}
