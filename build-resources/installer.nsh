# Windows installer script for Lahore Auto Traders
# This handles additional setup for Windows installations

# Check for and install Visual C++ Redistributable if needed
Section "Visual C++ Redistributable" VCRedist
  # Check if already installed
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64" "Version"
  StrCmp $0 "" 0 VCRedistInstalled

  # Download and install VC++ Redistributable
  MessageBox MB_YESNO "This application requires Microsoft Visual C++ Redistributable. Download and install it now?" IDYES InstallVCRedist
  Goto VCRedistDone

  InstallVCRedist:
    inetc::get /CAPTION "Downloading Visual C++ Redistributable..." /CANCELTEXT "Skip" "https://aka.ms/vs/17/release/vc_redist.x64.exe" "$TEMP\vc_redist.x64.exe"
    Pop $0
    StrCmp $0 "OK" 0 VCRedistDone
    ExecWait "$TEMP\vc_redist.x64.exe /quiet /norestart"
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