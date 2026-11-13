// Builds the three sample bundles the page ships with, plus a proof, by driving the real CLI.
// Nothing here is mocked: if the CLI is broken, the samples are broken.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, statSync } from 'node:fs';

mkdirSync('src/samples', { recursive: true });
mkdirSync('proof/samples', { recursive: true });

const run = (...args) => execFileSync(process.execPath, ['bin/tessera.mjs', ...args], { stdio: 'inherit' });

run('demo', '--out', 'src/samples/clean.tessera', '--twice');
run('tamper', 'src/samples/clean.tessera', '--step', '4', '--field', 'result', '--out', 'src/samples/tampered.tessera');
run('forge', 'src/samples/clean.tessera', '--out', 'src/samples/forged.tessera');
run('prove', 'src/samples/clean.tessera', '--step', '4', '--out', 'src/samples/proof.json');

for (const name of ['clean', 'tampered', 'forged']) {
  copyFileSync(`src/samples/${name}.tessera`, `proof/samples/${name}.tessera`);
  console.log(`${name}.tessera  ${statSync(`src/samples/${name}.tessera`).size} bytes`);
}
