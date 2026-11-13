import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('bin', { recursive: true });

await build({
  entryPoints: ['src/cli.ts'],
  outfile: 'bin/tessera.mjs',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  logLevel: 'warning',
});
console.log('bin/tessera.mjs built');
