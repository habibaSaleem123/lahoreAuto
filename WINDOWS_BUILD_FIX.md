# Windows Build Code Signing Error Fix

## Problem

The Windows build was failing with this error:
```
⨯ Get "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z"
read tcp: connection reset by peer
```

## Root Cause

Electron Builder was trying to automatically code sign the Windows executable but:
1. **Network Issues**: Failed to download the Windows code signing tool
2. **Unnecessary Process**: Code signing requires certificates we don't have
3. **Auto-Detection**: Builder was auto-detecting potential signing scenarios

## ✅ Solution Applied

### 1. **Disabled Code Signing**
```json
"win": {
  "signAndEditExecutable": false,
  "signExts": null,
  "verifyUpdateCodeSignature": false
}
```

### 2. **Added Environment Variable**
```json
"dist:win": "cross-env CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --win"
```

### 3. **Build Optimizations**
```json
"compression": "maximum",
"removePackageScripts": true
```

## What This Fixes

- ✅ **Eliminates Code Signing**: No more attempts to download signing tools
- ✅ **Faster Builds**: Skips unnecessary signing processes
- ✅ **Network Independence**: No external dependencies for signing
- ✅ **Smaller Output**: Maximum compression and script removal

## Security Notes

**This is safe for development/internal distribution because:**
- Code signing is optional for internal apps
- Users will see a "Unknown Publisher" warning (normal for unsigned apps)
- Functionality is not affected
- Can add proper code signing later if needed

**For production distribution, you would need:**
- Windows Code Signing Certificate ($200-400/year)
- Certificate from trusted CA (DigiCert, Sectigo, etc.)
- Hardware Security Module (HSM) for EV certificates

## Build Commands

```bash
# For Windows (unsigned)
npm run dist:win

# For all platforms (unsigned)
npm run dist

# Development build
npm run pack
```

## Alternative Solutions

If you still encounter issues:

### Option 1: Skip Signing Globally
```bash
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm run dist:win
```

### Option 2: Use Portable Build
```json
"win": {
  "target": "portable"
}
```

### Option 3: Docker Build
```bash
docker run --rm -ti \
  --env CSC_IDENTITY_AUTO_DISCOVERY=false \
  --env ELECTRON_CACHE="/tmp/.cache/electron" \
  -v ${PWD}:/project \
  electronuserland/builder:wine \
  /bin/bash -c "npm run dist:win"
```

## GitHub Actions Fix

For CI/CD, add this to your workflow:
```yaml
env:
  CSC_IDENTITY_AUTO_DISCOVERY: false

- name: Build Windows
  run: npm run dist:win
```

The Windows build should now complete successfully without code signing errors! 🎉