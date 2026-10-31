// Génère ./Ressources/midi-song.wav — petit morceau "façon MIDI song" :
// lead en onde carrée (timbre MIDI), basse en triangle, 16 kHz 16-bit mono.
// Mélodie : "Au clair de la lune" (domaine public), 2 phrases.
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SR = 16000;
const NOTE = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88, C5: 523.25, G3: 196.0, A3: 220.0, F3: 174.61, E3: 164.81, D3: 146.83 };
// [note, durée en noires] — Au clair de la lune
const MELODY = [
  ['C4', 1], ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 2], ['D4', 2],
  ['C4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['C4', 4],
  ['C4', 1], ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 2], ['D4', 2],
  ['C4', 1], ['E4', 1], ['G4', 1], ['G4', 1], ['C5', 4],
];
const BASS = [['C4', 4], ['G3', 4], ['A3', 4], ['F3', 4], ['C4', 4], ['G3', 4], ['F3', 4], ['G3', 4]]; // une par mesure (4 noires)

const BEAT = 0.22; // s par noire (~136 bpm)
const totalBeats = MELODY.reduce((a, [, d]) => a + d, 0);
const n = Math.floor(totalBeats * BEAT * SR);
const pcm = new Int16Array(n);

function square(freq, t) { return ((t * freq) % 1) < 0.5 ? 1 : -1; }
function triangle(freq, t) { const p = (t * freq) % 1; return p < 0.5 ? (p * 4 - 1) : (3 - p * 4); }

function addNote(freq, startBeat, durBeats, wave, vol) {
  const s0 = Math.floor(startBeat * BEAT * SR);
  const s1 = Math.min(n, Math.floor((startBeat + durBeats) * BEAT * SR));
  for (let i = s0; i < s1; i++) {
    const t = i / SR;
    const local = (i - s0) / SR;
    const env = Math.min(1, local / 0.01) * Math.max(0, 1 - local / (durBeats * BEAT)); // attaque 10ms, release
    pcm[i] += wave(freq, t) * env * vol;
  }
}

let b = 0;
for (const [note, d] of MELODY) { addNote(NOTE[note], b, d, square, 0.25); b += d; }
b = 0;
for (const [note, d] of BASS) { addNote(NOTE[note] / 2, b, d, triangle, 0.35); b += d; }

// normalise + écrit le WAV
const peak = Math.max(1, ...pcm.map(Math.abs));
const buf = new ArrayBuffer(44 + n * 2);
const v = new DataView(buf);
const wstr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
wstr(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); wstr(8, 'WAVE'); wstr(12, 'fmt ');
v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
wstr(36, 'data'); v.setUint32(40, n * 2, true);
for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round((pcm[i] / peak) * 32000), true);

const dir = join(ROOT, 'Ressources');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'midi-song.wav'), Buffer.from(buf));
console.log('écrit:', join(dir, 'midi-song.wav'), (44 + n * 2), 'octets,', (n / SR).toFixed(1) + 's');
