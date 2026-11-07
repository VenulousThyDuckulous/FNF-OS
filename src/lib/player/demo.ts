import { parseChart, type ParsedChart } from './chart';

/**
 * A built-in test song.
 *
 * The audio is synthesised in the browser instead of shipped, for two reasons:
 * every asset in this repository has to be one we may redistribute, and a demo
 * that depends on no downloads proves the runtime rather than a CDN. It is a
 * Psych-format chart with generated tones, not a mod, and the UI labels it that
 * way.
 */

export const DEMO_TITLE = 'FNF OS test chart';

export function createDemoChart(): ParsedChart {
  const sectionNotes: number[][] = [];

  // 120 BPM: one note every half beat, opponent answers on the off-beat.
  for (let index = 0; index < 26; index += 1) {
    const time = 2000 + index * 480;
    const lane = index % 4;
    sectionNotes.push([time, lane + 4, index % 7 === 0 ? 240 : 0]);
    if (index % 2 === 0) sectionNotes.push([time + 240, lane, 0]);
  }

  return parseChart({
    song: {
      song: DEMO_TITLE,
      bpm: 120,
      speed: 2,
      player1: 'bf',
      player2: 'dad',
      stage: 'stage',
      needsVoices: false,
      notes: [
        { sectionNotes: sectionNotes.slice(0, 14), mustHitSection: false, lengthInSteps: 16 },
        { sectionNotes: sectionNotes.slice(14), mustHitSection: false, lengthInSteps: 16 },
      ],
      events: [],
    },
  });
}

/** Synthesise the instrumental for the demo chart. */
export function createDemoAudio(ctx: BaseAudioContext): AudioBuffer {
  const chart = createDemoChart();
  const rate = ctx.sampleRate;
  const durationSeconds = chart.length / 1000 + 1;
  const buffer = ctx.createBuffer(1, Math.ceil(durationSeconds * rate), rate);
  const data = buffer.getChannelData(0);

  const laneHz = [523.25, 587.33, 659.25, 783.99];

  const tone = (startMs: number, frequency: number, lengthMs: number, gain: number): void => {
    const start = Math.floor((startMs / 1000) * rate);
    const length = Math.floor((lengthMs / 1000) * rate);
    for (let i = 0; i < length; i += 1) {
      const index = start + i;
      if (index < 0 || index >= data.length) continue;
      const t = i / rate;
      const envelope = Math.min(1, i / (rate * 0.01)) * Math.max(0, 1 - i / length);
      data[index] += Math.sin(2 * Math.PI * frequency * t) * envelope * gain;
    }
  };

  // Beat click.
  for (let beat = 0; beat * 500 < durationSeconds * 1000; beat += 1) {
    tone(beat * 500, beat % 4 === 0 ? 110 : 82.4, 120, 0.22);
  }

  for (const note of chart.notes) {
    if (!note.player) continue;
    tone(note.time, laneHz[note.lane] ?? 523.25, 220, 0.16);
  }

  // Soft clipping so summed tones stay audible without distortion.
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.max(-0.9, Math.min(0.9, data[i] ?? 0));
  }

  return buffer;
}
