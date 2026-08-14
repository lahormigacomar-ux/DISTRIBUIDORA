Set WshShell = CreateObject("WScript.Shell")
' Ejecuta el archivo .bat en modo totalmente oculto
' El "0" al final indica que no se muestre la ventana negra
WshShell.Run chr(34) & "INICIAR_SISTEMA.bat" & chr(34), 0
Set WshShell = Nothing
