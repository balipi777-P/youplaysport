/* Vérifie qu'aucun hook React n'est appelé après un `return` anticipé du composant
   (ex. app/club/page.js : écran de bienvenue puis console). Un hook déclaré plus bas
   fait planter la page au passage d'un rendu à l'autre (« Rendered more hooks… »).
   Usage : npm run check */
import { readFileSync } from 'node:fs';

const FILES = ['app/club/page.js'];
const EARLY = /^ {2}if \(.*\) \{\s*$/;
const HOOK = /^ {2}(const \[[^\]]+\] = |const \w+ = )?use(State|Effect|Memo|Callback|Ref|Reducer)\(/;
let bad = 0;

for (const f of FILES) {
  const lines = readFileSync(f, 'utf8').split('\n');
  let firstEarly = -1;
  lines.forEach((l, i) => {
    if (firstEarly < 0 && EARLY.test(l) && /^ {4}return /.test(lines[i + 1] || '')) firstEarly = i;
    if (firstEarly >= 0 && i > firstEarly && HOOK.test(l)) {
      console.error(`${f}:${i + 1}: hook après un return anticipé (ligne ${firstEarly + 1}) : ${l.trim()}`);
      bad += 1;
    }
  });
}
if (bad) process.exit(1);
console.log('check-hooks : OK');
