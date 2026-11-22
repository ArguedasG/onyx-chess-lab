; Migrate the Windows NSIS manufacturer registry key from the legacy upstream publisher
; ("Francisco Salgueiro") to "Gabriel Arguedas" before PageReinstall runs.
; Without this, upgrading an existing 0.28.x installation reads an empty path for
; `${MANUPRODUCTKEY}` and invokes `uninstall.exe _?=`, triggering NSIS "Error launching installer".
!define MUI_CUSTOMFUNCTION_GUIINIT OnyxMigrateLegacyPublisher

Function OnyxMigrateLegacyPublisher
  Push $0
  Push $1

  ReadRegStr $0 HKCU "Software\Gabriel Arguedas\Onyx Chess Lab" ""
  StrCmp $0 "" 0 onyx_migrate_done

  ReadRegStr $0 HKCU "Software\Francisco Salgueiro\Onyx Chess Lab" ""
  StrCmp $0 "" onyx_migrate_done

  WriteRegStr HKCU "Software\Gabriel Arguedas\Onyx Chess Lab" "" "$0"

  ; Preserve a custom install folder (e.g. another drive) when the user did not override /D=.
  StrCpy $1 "$LOCALAPPDATA\Onyx Chess Lab"
  StrCmp $INSTDIR $1 0 onyx_migrate_done
    StrCpy $INSTDIR "$0"

  onyx_migrate_done:
  Pop $1
  Pop $0
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ; Fallback for fully silent (/S) installs where .onGUIInit does not run.
  Push $0
  Push $1

  ReadRegStr $0 HKCU "Software\Gabriel Arguedas\Onyx Chess Lab" ""
  StrCmp $0 "" 0 onyx_preinstall_done

  ReadRegStr $0 HKCU "Software\Francisco Salgueiro\Onyx Chess Lab" ""
  StrCmp $0 "" onyx_preinstall_done

  WriteRegStr HKCU "Software\Gabriel Arguedas\Onyx Chess Lab" "" "$0"
  StrCpy $1 "$LOCALAPPDATA\Onyx Chess Lab"
  StrCmp $INSTDIR $1 0 onyx_preinstall_done
    StrCpy $INSTDIR "$0"

  onyx_preinstall_done:
  Pop $1
  Pop $0
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Remove the legacy Onyx publisher entry without touching other apps under the old key.
  DeleteRegKey HKCU "Software\Francisco Salgueiro\Onyx Chess Lab"
  DeleteRegKey /ifempty HKCU "Software\Francisco Salgueiro"
!macroend
