; ACM Docs (by ACM Code SRL) — installer for Windows 10 / 11 (64 bit)
; Installs for the current user only: no administrator password needed.
; Replaces the older "PDF Editor" (same entry in Control Panel, data is kept).
Unicode true
SetCompressor /SOLID lzma
SetCompressorDictSize 64

!define APP "ACM Docs"
!define EXE "ACM Docs.exe"
!define OLDAPP "PDF Editor"
!define OLDEXE "PDF Editor.exe"
!ifndef VERSION
  !define VERSION "2.0.0"
!endif
!define COMPANY "ACM Code SRL"
!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ACMandrut.PDFEditor"
!define PROGID "ACMCode.ACMDocs.document"
!define OLDPROGID "ACMandrut.PDFEditor.pdf"
!ifndef SRC
  !define SRC "../dist/win-unpacked"
!endif
!ifndef OUT
  !define OUT "../dist/ACM-Docs-Setup.exe"
!endif

Name "${APP}"
OutFile "${OUT}"
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
!define MUI_ABORTWARNING
!define MUI_WELCOMEFINISHPAGE_BITMAP "sidebar.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "sidebar.bmp"

!define MUI_WELCOMEPAGE_TITLE "Instalare ${APP}"
!define MUI_WELCOMEPAGE_TEXT "PDF-uri, documente, tabele, prezentări și facturi pentru orice firmă, de la ${COMPANY}.$\r$\n$\r$\nDacă aveai „${OLDAPP}”, este înlocuit automat; fișierele, facturile și datele firmei rămân.$\r$\n$\r$\nApasă Instalează. Durează câteva secunde, iar la final găsești iconița pe Desktop."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_TITLE "Gata!"
!define MUI_FINISHPAGE_TEXT "${APP} este instalat. Iconița este pe Desktop și în meniul Start."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Pornește ${APP} acum"
!define MUI_FINISHPAGE_SHOWREADME ""
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Deschide PDF-urile cu ${APP}"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION MakeDefault
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Romanian"

; Refuse to install where the app cannot run.
Function .onInit
  ${IfNot} ${AtLeastBuild} 10240
  ${OrIfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "${APP} are nevoie de Windows 10 sau 11, pe 64 de biți.$\r$\n${APP} needs 64-bit Windows 10 or 11."
    Abort
  ${EndIf}
FunctionEnd

!macro FileType EXT
  WriteRegStr HKCU "Software\Classes\.${EXT}\OpenWithProgids" "${PROGID}" ""
  WriteRegStr HKCU "Software\Classes\Applications\${EXE}\SupportedTypes" ".${EXT}" ""
!macroend

Section "Install"
  ; Close running copies (new and old name) so files can be replaced.
  nsExec::Exec 'taskkill /F /IM "${EXE}"'
  nsExec::Exec 'taskkill /F /IM "${OLDEXE}"'
  Sleep 500

  ; The old "PDF Editor": remove its program files and shortcuts (its data stays).
  SetShellVarContext current
  Delete "$DESKTOP\${OLDAPP}.lnk"
  RMDir /r "$SMPROGRAMS\${OLDAPP}"
  RMDir /r "$LOCALAPPDATA\Programs\${OLDAPP}"
  DeleteRegValue HKCU "Software\Classes\.pdf\OpenWithProgids" "${OLDPROGID}"
  DeleteRegKey HKCU "Software\Classes\${OLDPROGID}"
  DeleteRegKey HKCU "Software\Classes\Applications\${OLDEXE}"
  ReadRegStr $0 HKCU "Software\Classes\.pdf" ""
  ${If} $0 == "${OLDPROGID}"
    WriteRegStr HKCU "Software\Classes\.pdf" "" "${PROGID}"
  ${EndIf}

  SetOutPath "$INSTDIR"
  File /r "${SRC}/*.*"
  File "icon.ico"

  WriteUninstaller "$INSTDIR\Dezinstalare.exe"

  ; Shortcuts: Desktop + Start menu
  CreateShortCut "$DESKTOP\${APP}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0 SW_SHOWNORMAL "" "PDF-uri, documente și facturi — ${COMPANY}"
  CreateDirectory "$SMPROGRAMS\${APP}"
  CreateShortCut "$SMPROGRAMS\${APP}\${APP}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0
  CreateShortCut "$SMPROGRAMS\${APP}\Dezinstalare ${APP}.lnk" "$INSTDIR\Dezinstalare.exe"

  ; "Open with" for documents (does not change the default program by itself)
  WriteRegStr HKCU "Software\Classes\${PROGID}" "" "Document ${APP}"
  WriteRegStr HKCU "Software\Classes\${PROGID}\DefaultIcon" "" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "Software\Classes\${PROGID}\shell\open\command" "" '"$INSTDIR\${EXE}" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\${EXE}\shell\open\command" "" '"$INSTDIR\${EXE}" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\${EXE}" "FriendlyAppName" "${APP}"
  !insertmacro FileType "pdf"
  !insertmacro FileType "docx"
  !insertmacro FileType "doc"
  !insertmacro FileType "xlsx"
  !insertmacro FileType "xls"
  !insertmacro FileType "csv"
  !insertmacro FileType "pptx"
  !insertmacro FileType "txt"
  ; .acm (encrypted ACM Docs documents) belongs to ACM Docs: open them with a double click
  !insertmacro FileType "acm"
  WriteRegStr HKCU "Software\Classes\.acm" "" "${PROGID}"
  WriteRegStr HKCU "Software\Classes\.acm" "Content Type" "application/x-acm"

  ; Entry in Control Panel > Programs (same entry as the old "PDF Editor")
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

  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SectionEnd

; Finish-page checkbox: PDFs open with this app on double-click.
Function MakeDefault
  WriteRegStr HKCU "Software\Classes\.pdf" "" "${PROGID}"
  ; Windows remembers a previous "Open with" choice here; clear it so ours wins.
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.pdf\UserChoice"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
FunctionEnd

!macro UnFileTypes
  !insertmacro UnFileType "pdf"
  !insertmacro UnFileType "docx"
  !insertmacro UnFileType "doc"
  !insertmacro UnFileType "xlsx"
  !insertmacro UnFileType "xls"
  !insertmacro UnFileType "csv"
  !insertmacro UnFileType "pptx"
  !insertmacro UnFileType "txt"
  !insertmacro UnFileType "acm"
  DeleteRegValue HKCU "Software\Classes\.acm" ""
!macroend
!macro UnFileType EXT
  DeleteRegValue HKCU "Software\Classes\.${EXT}\OpenWithProgids" "${PROGID}"
!macroend

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "${EXE}"'
  Sleep 400
  SetShellVarContext current
  Delete "$DESKTOP\${APP}.lnk"
  RMDir /r "$SMPROGRAMS\${APP}"

  ReadRegStr $0 HKCU "Software\Classes\.pdf" ""
  ${If} $0 == "${PROGID}"
    DeleteRegValue HKCU "Software\Classes\.pdf" ""
  ${EndIf}
  !insertmacro UnFileTypes
  DeleteRegKey HKCU "Software\Classes\${PROGID}"
  DeleteRegKey HKCU "Software\Classes\Applications\${EXE}"
  DeleteRegKey HKCU "${UNKEY}"

  RMDir /r "$INSTDIR"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SectionEnd
