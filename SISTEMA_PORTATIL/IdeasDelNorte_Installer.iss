; Script para Inno Setup
; Este script generará un instalador profesional que copiará todo el sistema a Archivos de Programa
; y creará accesos directos.

[Setup]
AppName=Ideas del Norte - Sistema de Gestión
AppVersion=2.0.0
DefaultDirName={autopf}\IdeasDelNorte
DefaultGroupName=Ideas del Norte
OutputDir=.
OutputBaseFilename=StockMaster_Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Copiar el motor de node
Source: "node.exe"; DestDir: "{app}"; Flags: ignoreversion
; Copiar el backend y node_modules
Source: "backend\*"; DestDir: "{app}\backend"; Flags: ignoreversion recursesubdirs createallsubdirs
; Copiar el frontend
Source: "frontend\*"; DestDir: "{app}\frontend"; Flags: ignoreversion recursesubdirs createallsubdirs
; Copiar los lanzadores
Source: "INICIAR_SISTEMA.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "Lanzador_Oculto.vbs"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Ideas del Norte"; Filename: "{app}\Lanzador_Oculto.vbs"; IconFilename: "{app}\frontend\dist\favicon.ico"
Name: "{autodesktop}\Ideas del Norte"; Filename: "{app}\Lanzador_Oculto.vbs"; IconFilename: "{app}\frontend\dist\favicon.ico"; Tasks: desktopicon

[Run]
Description: "{cm:LaunchProgram,Ideas del Norte}"; Filename: "{app}\Lanzador_Oculto.vbs"; Flags: postinstall shellexec skipifsilent
