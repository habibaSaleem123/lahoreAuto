# Windows Server Fix Guide

## Problem: Server Not Loading on Windows

The server fails to start on Windows installations because native dependencies (especially SQLite) are missing or not properly compiled.

## Root Cause Analysis

1. **Missing Visual C++ Redistributable**: Required for native Node.js modules
2. **SQLite Native Binary Missing**: `better-sqlite3.node` not included or corrupted
3. **Architecture Mismatch**: 32-bit vs 64-bit binary conflicts
4. **Node.js Runtime Missing**: Electron's Node.js may not match compiled binaries

## 🔧 Solutions (In Order of Preference)

### Solution 1: Enhanced Windows Build (Recommended)

Use the new Windows-specific build command:

```bash
npm run dist:win
```

This includes:
- Proper Windows native module rebuilding
- Visual C++ Redistributable installer
- x64 architecture-specific builds
- Better error handling and diagnostics

### Solution 2: Manual Dependency Installation

If the installer doesn't work, install dependencies manually:

1. **Install Visual C++ Redistributable**:
   - Download: https://aka.ms/vs/17/release/vc_redist.x64.exe
   - Run as administrator
   - Restart after installation

2. **Run Diagnostics**:
   ```bash
   node windows-diagnostics.js
   ```

3. **Rebuild Native Modules** (if needed):
   ```bash
   npm run rebuild:server:electron:win
   ```

### Solution 3: Alternative Database Backend

If SQLite continues to cause issues, we can switch to a different database:

```javascript
// Replace better-sqlite3 with sqlite3 (slower but more compatible)
// Or use a file-based JSON database for simple storage
```

## 📋 Build Configuration Improvements

### New Windows-Specific Settings:
- **NSIS Installer**: Custom installer with dependency checking
- **Firewall Rules**: Automatic port 5000 allowlist
- **Better Unpacking**: All native modules unpacked from ASAR
- **Architecture Lock**: x64 only to avoid conflicts

### Enhanced Error Handling:
- Detailed logging of missing dependencies
- Path validation for all server components
- SQLite binary verification
- Visual C++ runtime detection

## 🧪 Testing the Fix

1. **Build Windows Installer**:
   ```bash
   npm run dist:win
   ```

2. **Test on Clean Windows Machine**:
   - Install the generated `.exe` file
   - Check if app starts without errors
   - Verify server responds at `http://localhost:5000/health`

3. **Check Logs**:
   - App logs: `%APPDATA%/Lahore Auto Traders/server.log`
   - Console logs: Developer Tools (F12)

## 🔍 Diagnostic Commands

```bash
# Run full diagnostics
node windows-diagnostics.js

# Test server directly
node server/server.js

# Check SQLite
node -e "console.log(require('better-sqlite3')(':memory:'))"

# Verify Electron rebuild
./node_modules/.bin/electron-rebuild --version
```

## 📦 What's Included in New Build

1. **Enhanced Package Configuration**:
   - Windows-specific rebuild scripts
   - Better ASAR unpacking rules
   - NSIS installer with dependency checking

2. **Runtime Dependency Detection**:
   - Automatic VC++ Redistributable installation
   - SQLite binary verification
   - Detailed error messages

3. **Improved Server Startup**:
   - Platform-specific path resolution
   - Native module validation
   - Better error recovery

## 🚀 Quick Fix Commands

```bash
# For development testing
npm run dev

# For Windows distribution
npm run predist:win && npm run dist:win

# For debugging
node windows-diagnostics.js
```

The enhanced Windows build should resolve all server startup issues on fresh Windows installations!