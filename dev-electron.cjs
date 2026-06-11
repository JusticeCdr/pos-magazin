// dev-electron.cjs
// This script waits for Vite dev server to be ready, then launches Electron.
// Using a JS script is more reliable than shell && chains on Windows.

const { spawn } = require('child_process');
const http = require('http');

const VITE_URL = 'http://localhost:5173';
const MAX_TRIES = 30;   // 30 × 500ms = 15 seconds max wait
const INTERVAL  = 500;  // ms between each check

function checkServer(url, tries) {
  http.get(url, (res) => {
    if (res.statusCode < 500) {
      console.log('[ELECTRON] Vite server is ready — launching Electron...');
      launchElectron();
    } else {
      retry(url, tries);
    }
  }).on('error', () => retry(url, tries));
}

function retry(url, tries) {
  if (tries <= 0) {
    console.error('[ELECTRON] Timed out waiting for Vite server at', url);
    process.exit(1);
  }
  setTimeout(() => checkServer(url, tries - 1), INTERVAL);
}

function launchElectron() {
  // Use the electron binary from node_modules — works on all platforms
  const electronBin = require('electron');

  const proc = spawn(electronBin, ['.'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      VITE_DEV_SERVER_URL: VITE_URL + '/',
    },
  });

  proc.on('close', (code) => {
    console.log('[ELECTRON] Process exited with code', code);
    process.exit(code);
  });
}

console.log('[ELECTRON] Waiting for Vite dev server at', VITE_URL, '...');
checkServer(VITE_URL, MAX_TRIES);
