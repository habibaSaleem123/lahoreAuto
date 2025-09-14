// Windows Server Diagnostics Script
// Run this to check if all dependencies are available

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== Windows Server Diagnostics ===\n');

// Check Node.js version
console.log('Node.js Info:');
console.log('- Version:', process.version);
console.log('- Platform:', process.platform);
console.log('- Architecture:', process.arch);
console.log('- Executable:', process.execPath);
console.log();

// Check if we're in development or production
const isDev = !process.execPath.includes('electron');
const serverRoot = isDev
  ? path.join(__dirname, 'server')
  : path.join(path.dirname(process.execPath), '..', 'resources', 'server');

console.log('Server Info:');
console.log('- Mode:', isDev ? 'Development' : 'Production');
console.log('- Server Root:', serverRoot);
console.log('- Server Root Exists:', fs.existsSync(serverRoot));
console.log();

// Check server files
const serverJs = path.join(serverRoot, 'server.js');
const packageJson = path.join(serverRoot, 'package.json');
const nodeModules = path.join(serverRoot, 'node_modules');

console.log('Server Files:');
console.log('- server.js exists:', fs.existsSync(serverJs));
console.log('- package.json exists:', fs.existsSync(packageJson));
console.log('- node_modules exists:', fs.existsSync(nodeModules));
console.log();

// Check SQLite binary
if (fs.existsSync(nodeModules)) {
  const sqlitePath = path.join(nodeModules, 'better-sqlite3');
  const sqliteBinary = path.join(sqlitePath, 'build', 'Release', 'better_sqlite3.node');
  const sqliteBinding = path.join(sqlitePath, 'lib', 'binding');

  console.log('SQLite Dependencies:');
  console.log('- better-sqlite3 folder:', fs.existsSync(sqlitePath));
  console.log('- Native binary (.node):', fs.existsSync(sqliteBinary));
  console.log('- Binding folder:', fs.existsSync(sqliteBinding));

  if (fs.existsSync(sqliteBinary)) {
    try {
      const stats = fs.statSync(sqliteBinary);
      console.log('- Binary size:', Math.round(stats.size / 1024), 'KB');
      console.log('- Binary modified:', stats.mtime.toISOString());
    } catch (e) {
      console.log('- Binary check error:', e.message);
    }
  }
  console.log();
}

// Check Visual C++ Redistributable (Windows only)
if (process.platform === 'win32') {
  console.log('Windows Dependencies:');
  try {
    // Check for VC++ Redistributable in registry
    const regQuery = 'reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\X64" /v Version';
    const result = execSync(regQuery, { encoding: 'utf8', stdio: 'pipe' });
    console.log('- Visual C++ Redistributable: INSTALLED');
  } catch (e) {
    console.log('- Visual C++ Redistributable: NOT FOUND or NOT ACCESSIBLE');
    console.log('  You may need to install: https://aka.ms/vs/17/release/vc_redist.x64.exe');
  }
  console.log();
}

// Test SQLite loading
console.log('SQLite Loading Test:');
try {
  process.chdir(serverRoot);
  const Database = require(path.join(nodeModules, 'better-sqlite3'));
  console.log('- better-sqlite3 module: LOADED SUCCESSFULLY');

  // Try creating in-memory database
  const db = new Database(':memory:');
  db.exec('CREATE TABLE test (id INTEGER)');
  db.close();
  console.log('- SQLite functionality: WORKING');
} catch (e) {
  console.error('- SQLite loading error:', e.message);
  console.error('- This is likely the cause of server startup failure');
}
console.log();

// Test server dependencies
console.log('Server Dependencies Test:');
const serverPackage = path.join(serverRoot, 'package.json');
if (fs.existsSync(serverPackage)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(serverPackage, 'utf8'));
    console.log('- Server package.json loaded');
    console.log('- Dependencies:', Object.keys(pkg.dependencies || {}).length);

    for (const dep of Object.keys(pkg.dependencies || {})) {
      const depPath = path.join(nodeModules, dep);
      console.log(`  - ${dep}:`, fs.existsSync(depPath) ? 'OK' : 'MISSING');
    }
  } catch (e) {
    console.error('- Error reading server package.json:', e.message);
  }
}

console.log('\n=== Diagnostics Complete ===');
console.log('If SQLite loading failed, try reinstalling Visual C++ Redistributable');
console.log('If modules are missing, try rebuilding with: npm run rebuild:server:electron:win');