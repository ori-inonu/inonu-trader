; Inonu Trader: per-user installer (docs/sdd/inonu-desktop-v1, T1.9, WIN-1, WIN-2, WIN-7, WIN-11).
;
; build:   makensis /DVERSION=0.0.2 /DAPPDIR=<folder with InonuTrader.exe and web\> /DOUTFILE=<setup.exe> [/DICON=<.ico>] inonu.nsi
; install: no administrator, into %LOCALAPPDATA%\Programs\InonuTrader. Silent: Setup.exe /S /D=<dir> (the folder must be last).
;          /NOSHORTCUTS skips the Start Menu and Desktop shortcuts (tests).
; uninstall: removes the program, shortcuts and registry key. The data in %LOCALAPPDATA%\InonuTrader (settings, history) is
;          KEPT unless the user ticks the box, or Uninstall.exe /S /DELETEDATA is used.
;
; This script carries no secret and no data of any kind. Nothing here is shared with any other product installed on this
; machine: its own AppId (InonuTrader.App), folders, registry keys and shortcut names.
Unicode true
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef APPDIR
  !error "define APPDIR (the folder with InonuTrader.exe and web\)"
!endif
!ifndef OUTFILE
  !define OUTFILE "InonuTrader-Setup.exe"
!endif

!define APP_NAME "Inonu Trader"
!define APP_EXE "InonuTrader.exe"
!define APP_KEY "Software\InonuTrader.App"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\InonuTrader.App"

Name "${APP_NAME}"
OutFile "${OUTFILE}"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\InonuTrader"
InstallDirRegKey HKCU "${APP_KEY}" "InstallDir"
SetCompressor /SOLID lzma
BrandingText "${APP_NAME} ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "FileDescription" "${APP_NAME} setup"
VIAddVersionKey "CompanyName" "Inonu"
VIAddVersionKey "LegalCopyright" "Inonu"

!ifdef ICON
  !define MUI_ICON "${ICON}"
  !define MUI_UNICON "${ICON}"
!endif
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o ${APP_NAME}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
UninstPage custom un.DataPage un.DataPageLeave
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "PortugueseBR"

Var DeleteData
Var DataCheckbox

; Stops only OUR program (by image name) so its files can be replaced or removed. Nothing else is touched.
!macro StopApp
  nsExec::Exec 'taskkill /F /IM "${APP_EXE}"'
  Pop $0
!macroend

Function .onInit
  !insertmacro StopApp
FunctionEnd

Section "${APP_NAME}" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"
  File /r "${APPDIR}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  WriteRegStr HKCU "${APP_KEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "Inonu"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "EstimatedSize" "$0"

  ${GetParameters} $R0
  ${GetOptions} $R0 "/NOSHORTCUTS" $R1
  ${If} ${Errors}
    CreateDirectory "$SMPROGRAMS\${APP_NAME}"
    CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  ${EndIf}
SectionEnd

Section /o "Atalho na Area de Trabalho" SecDesktop
  ${GetParameters} $R0
  ${GetOptions} $R0 "/NOSHORTCUTS" $R1
  ${If} ${Errors}
    CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  ${EndIf}
SectionEnd

; ---- uninstall

Function un.onInit
  !insertmacro StopApp
  StrCpy $DeleteData 0
  ${GetParameters} $R0
  ${GetOptions} $R0 "/DELETEDATA" $R1
  ${IfNot} ${Errors}
    StrCpy $DeleteData 1
  ${EndIf}
FunctionEnd

Function un.DataPage
  ${If} ${Silent}
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Dados do ${APP_NAME}" "Escolha o que fazer com as suas configuracoes e o seu historico."
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 36u "Os seus dados ficam em $LOCALAPPDATA\InonuTrader. Por padrao eles sao mantidos, para que uma reinstalacao encontre tudo como estava."
  Pop $0
  ${NSD_CreateCheckbox} 0 44u 100% 12u "Remover tambem os meus dados (configuracoes e historico)"
  Pop $DataCheckbox
  nsDialogs::Show
FunctionEnd

Function un.DataPageLeave
  ${NSD_GetState} $DataCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $DeleteData 1
  ${EndIf}
FunctionEnd

Section "Uninstall"
  ; explicit files only: never a recursive delete of a folder the user picked
  Delete "$INSTDIR\${APP_EXE}"
  Delete "$INSTDIR\version.txt"
  RMDir /r "$INSTDIR\web"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"

  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"
  Delete "$DESKTOP\${APP_NAME}.lnk"

  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  DeleteRegKey HKCU "${APP_KEY}"

  ${If} $DeleteData == 1
    RMDir /r "$LOCALAPPDATA\InonuTrader"
  ${EndIf}
SectionEnd
