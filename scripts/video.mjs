/**
 * Post-production: webm → mp4, optional voice-over, loudness normalised.
 *
 *   node scripts/video.mjs             # uses video/voice.wav when it exists
 *   node scripts/video.mjs --no-voice  # silent picture
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import ffmpegPath from 'ffmpeg-static';

const RAW = 'video/raw/take.webm';
const OUT = 'video/tessera-demo.mp4';
const VOICE = 'video/voice.wav';
mkdirSync('video', { recursive: true });

if (!existsSync(RAW)) {
  console.error(`no recording at ${RAW}; run node scripts/record.mjs first`);
  process.exit(1);
}

const ffmpeg = ffmpegPath ?? 'ffmpeg';
const run = (args) => execFileSync(ffmpeg, args, { stdio: 'inherit' });

const probe = (file) => {
  // ffmpeg -i without an output exits non-zero on purpose; the duration is on stderr.
  const res = spawnSync(ffmpeg, ['-i', file], { encoding: 'utf8' });
  const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(res.stderr ?? '');
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
};

const picture = probe(RAW);
const useVoice = !process.argv.includes('--no-voice') && existsSync(VOICE);

if (useVoice) {
  const voice = probe(VOICE);
  if (voice + 3 < picture) {
    console.error(`voice is ${voice.toFixed(1)}s, picture is ${picture.toFixed(1)}s — that is more than 3s short; re-record rather than stretch`);
    process.exit(2);
  }
  run([
    '-y',
    '-i', RAW,
    '-i', VOICE,
    '-filter_complex', '[1:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]',
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow',
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest',
    OUT,
  ]);
} else {
  run([
    '-y',
    '-i', RAW,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow',
    '-an',
    OUT,
  ]);
  console.log('no voice track: silent picture (captions are burned in)');
}

console.log(`wrote ${OUT} (${picture.toFixed(1)}s)`);
