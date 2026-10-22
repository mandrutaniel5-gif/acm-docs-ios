; ACM Docs Control (ACM Code SRL): the administration panel, for Windows 10 / 11 (64 bit).
; Installs for the current user only; no file types, no background services.
Unicode true
SetCompressor /SOLID lzma
!define APP "ACM Docs Control"
!define EXE "ACM Docs Control.exe"
!define COMPANY "ACM Code SRL"
!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ACMCode.ACMDocsControl"
!ifndef VERSION
  !define VERSION "1.0.0"
!endif
Name "${APP}"
OutFile "../../dist/ACM-Docs-Control-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\${APP}"
RequestExecutionLevel user
BrandingText "${APP} ${VERSION} · ${COMPANY}"
ShowInstDetails nevershow
ShowUninstDetails nevershow
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=0 "ProductName" "${APP}"
VIAddVersionKey /LANG=0 "CompanyName" "${COMPANY}"
VIAddVersionKey /LANG=0 "FileDescription" "Instalare ${APP}"
VIAddVersionKey /LANG=0 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=0 "LegalCopyright" "© 2026 ${COMPANY}"
!include "MUI2.nsh"
!include "WinVer.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "sidebar.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "sidebar.bmp"
!define MUI_WELCOMEPAGE_TITLE "Instalare ${APP}"
!define MUI_WELCOMEPAGE_TEXT "Panoul de administrare ACM Docs, într-o fereastră separată.$\r$\n$\r$\nConectarea cere parola contului de administrator și codul din aplicația de autentificare. Apasă Instalează."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "Gata!"
!define MUI_FINISHPAGE_TEXT "${APP} este instalat. Iconița este pe Desktop și în meniul Start."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Pornește ${APP} acum"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Romanian"
Function .onInit
  ${IfNot} ${AtLeastBuild} 10240
  ${OrIfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "${APP} are nevoie de Windows 10 sau 11, pe 64 de biți."
    Abort
  ${EndIf}
FunctionEnd
Section "Install"
  nsExec::Exec 'taskkill /F /IM "${EXE}"'
  Sleep 400
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "../../dist/control/win-unpacked/*.*"
  File "icon.ico"
  WriteUninstaller "$INSTDIR\Dezinstalare.exe"
  CreateShortCut "$DESKTOP\${APP}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0 SW_SHOWNORMAL "" "Panoul de administrare ACM Docs"
  CreateDirectory "$SMPROGRAMS\${APP}"
  CreateShortCut "$SMPROGRAMS\${APP}\${APP}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0
  CreateShortCut "$SMPROGRAMS\${APP}\Dezinstalare ${APP}.lnk" "$INSTDIR\Dezinstalare.exe"
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "${APP}"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "Publisher" "${COMPANY}"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\${EXE}"
  WriteRegStr HKCU "${UNKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\Dezinstalare.exe"'
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNKEY}" "EstimatedSize" "$0"
SectionEnd
Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "${EXE}"'
  Sleep 400
  SetShellVarContext current
  Delete "$DESKTOP\${APP}.lnk"
  RMDir /r "$SMPROGRAMS\${APP}"
  DeleteRegKey HKCU "${UNKEY}"
  RMDir /r "$INSTDIR"
SectionEnd
