// Cross-platform recovery for broken installs (corrupted npm cache, half-deleted node_modules, Windows EPERM).
// Usage: npm run clean:install
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const run = (cmd, args) => {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error(`\nFailed: ${cmd} ${args.join(' ')}`); process.exit(r.status ?? 1); }
};

// fs.rmSync retries when Windows briefly locks files (antivirus / indexer / an editor holding a handle) -> the usual cause of EPERM.
console.log('Removing node_modules ...');
try { fs.rmSync('node_modules', { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); }
catch (e) {
  console.error(`Could not delete node_modules: ${e.message}\nClose VS Code terminals / dev servers, pause antivirus scanning for this folder, make sure the project is not inside OneDrive, then run this again.`);
  process.exit(1);
}
run('npm', ['cache', 'verify']);   // repairs the cache index without wiping it
run('npm', ['install']);
run('npx', ['expo', 'install', '--fix']);
run('npx', ['expo-doctor']);
run('npm', ['run', 'typecheck']);
console.log('\nAll done.');
