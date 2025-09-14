# Windows installer script for Lahore Auto Traders
!include "MUI2.nsh"

# Check for and install Visual C++ Redistributable if needed
Section "Visual C++ Redistributable" VCRedist
  SetOutPath "$TEMP"

  # Check multiple possible registry locations for VC++ Redistributable
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64" "Version"
  StrCmp $0 "" 0 VCRedistInstalled

  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Version"
  StrCmp $0 "" 0 VCRedistInstalled

  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Version"
  StrCmp $0 "" 0 VCRedistInstalled

  # Not found, need to install
  DetailPrint "Visual C++ Redistributable not found, installing..."

  # Include VC++ Redistributable in installer instead of downloading
  File "${NSISDIR}\Plugins\vc_redist.x64.exe"
  ExecWait '"$TEMP\vc_redist.x64.exe" /quiet /norestart /logs "$TEMP\vcredist.log"' $1

  # Check exit code
  ${If} $1 == 0
    DetailPrint "Visual C++ Redistributable installed successfully"
  ${ElseIf} $1 == 1638
    DetailPrint "Visual C++ Redistributable already installed (newer version)"
  ${Else}
    DetailPrint "Visual C++ Redistributable installation returned code $1"
  ${EndIf}

  Delete "$TEMP\vc_redist.x64.exe"
  Goto VCRedistDone

  VCRedistInstalled:
    DetailPrint "Visual C++ Redistributable already installed"

  VCRedistDone:
SectionEnd

# Create firewall rules for the application
Section "Windows Firewall" Firewall
  # Add firewall rules for the server port
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Lahore Auto Traders Server" dir=in action=allow protocol=TCP localport=5000 program="$INSTDIR\${PRODUCT_FILENAME}.exe"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Lahore Auto Traders Server Out" dir=out action=allow protocol=TCP localport=5000 program="$INSTDIR\${PRODUCT_FILENAME}.exe"'
SectionEnd

# Custom uninstaller sections
Section "un.Cleanup"
  # Remove firewall rules
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Lahore Auto Traders Server"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Lahore Auto Traders Server Out"'

  # Clean up user data
  RMDir /r "$APPDATA\${PRODUCT_FILENAME}"
  RMDir /r "$LOCALAPPDATA\${PRODUCT_FILENAME}"
SectionEnd