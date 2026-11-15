// מריץ את כל בדיקות ה-Node: node tests/all.js
const { spawnSync } = require('child_process'), path = require('path');
let bad = 0;
['run.js', 'coach.js', 'import.js'].forEach((f) => {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  const last = r.stdout.trim().split('\n').pop();
  console.log(f.padEnd(10), r.status === 0 ? 'OK  ' : 'FAIL', last);
  if (r.status !== 0) { bad++; console.log(r.stdout.split('\n').filter((l) => /FAIL/.test(l)).join('\n')); }
});
process.exit(bad ? 1 : 0);
