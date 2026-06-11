// check-node.cjs
const electronBin = require('electron');
const { spawn } = require('child_process');
const proc = spawn(electronBin, ['--version'], { stdio: 'inherit' });
proc.on('close', () => {
  // Check node:sqlite availability via a simple test script
  const checkScript = `
    try {
      const { DatabaseSync } = require('node:sqlite');
      console.log('[OK] node:sqlite IS available. Node version inside Electron:', process.versions.node);
    } catch(e) {
      console.log('[FAIL] node:sqlite not available. Node version inside Electron:', process.versions.node, 'Error:', e.message);
    }
  `;
  const proc2 = spawn(electronBin, ['-e', checkScript], { stdio: 'inherit' });
  proc2.on('close', process.exit);
});
