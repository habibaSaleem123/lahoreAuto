# Windows Native Build Solution

## Problem
The SQLite native module (`better-sqlite3.node`) must be compiled for the target platform. Cross-compiling from macOS to Windows for native Node.js modules is complex and often fails.

## Solutions

### Option 1: Docker Build (Recommended)
Use the official electron-builder Docker image with Wine:

```bash
# Build Windows app using Docker
docker run --rm -ti \
  --env CSC_IDENTITY_AUTO_DISCOVERY=false \
  --env ELECTRON_CACHE="/tmp/.cache/electron" \
  --env npm_config_runtime=electron \
  --env npm_config_target=31.3.0 \
  -v ${PWD}:/project \
  -v ~/.cache/electron:/tmp/.cache/electron \
  electronuserland/builder:wine \
  /bin/bash -c "cd /project && npm run prep:root && npm run prep:client && npm run prep:server:electron && npm run build:react && electron-builder --win --publish=never"
```

### Option 2: Prebuild Binaries
Use prebuilt binaries instead of compiling:

```bash
# Install prebuild tool
npm install -g prebuild

# Download prebuilt binaries for Windows
cd server
prebuild-install --runtime=electron --target=31.3.0 --platform=win32 --arch=x64
```

### Option 3: Windows Machine Build
Build on actual Windows machine or Windows VM:

```batch
npm run prep:root
npm run prep:client
npm run prep:server:electron
npm run rebuild:server:electron
npm run build:react
npm run deps:electron
npm run dist:win
```

### Option 4: GitHub Actions CI/CD
Use GitHub Actions with Windows runner:

```yaml
name: Build Windows App
on: [push]
jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm run dist:win:full
        env:
          CSC_IDENTITY_AUTO_DISCOVERY: false
```

## Current Status

✅ **Windows Installer Created**: `Lahore Auto Traders-1.0.0-Setup.exe` (100MB) in `dist/` folder
❌ **SQLite Binary Issue**: Still contains macOS binary instead of Windows binary

## Immediate Solutions

### For Testing/Development
The current installer **will install but the server will fail** with "not a valid Win32 application" error.

### For Production Use

**Option A: Build on Windows Machine**
1. Copy project to Windows machine
2. Run: `npm run dist:win:full`
3. SQLite will be properly compiled for Windows

**Option B: Use GitHub Actions (Recommended)**
Create `.github/workflows/build-windows.yml`:

```yaml
name: Build Windows App
on: [push, pull_request]
jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - run: npm run dist:win:full
        env:
          CSC_IDENTITY_AUTO_DISCOVERY: false
      - uses: actions/upload-artifact@v4
        with:
          name: windows-installer
          path: dist/*.exe
```

**Option C: Manual Binary Replacement**
1. Download Windows SQLite binary from another source
2. Replace `dist/win-unpacked/resources/server/node_modules/better-sqlite3/build/Release/better_sqlite3.node`
3. Repackage installer

## Current Build Output

- ✅ **Installer Size**: 100.6 MB
- ✅ **Compression**: Maximum compression applied
- ✅ **Code Signing**: Disabled (no certificate required)
- ✅ **Architecture**: x64 Windows target
- ❌ **Native Modules**: SQLite compiled for macOS instead of Windows

The electron-builder packaging process works correctly, but cross-compilation of native modules from macOS to Windows is not supported without additional tools.