Set WshShell = CreateObject("WScript.Shell")
' Detectar la ruta actual de manera dinámica
strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
' Ejecuta el archivo .bat en modo oculto (0) usando la ruta detectada
WshShell.Run chr(34) & strPath & "\INICIAR_SISTEMA.bat" & chr(34), 0
Set WshShell = Nothing
