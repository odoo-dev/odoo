; Script generated by the Inno Setup Script Wizard.
; SEE THE DOCUMENTATION FOR DETAILS ON CREATING INNO SETUP SCRIPT FILES!

#define OdooAppName "Odoo"
#define OdooVersion "16.0"
#define OdooPublisher "Odoo S.A."
#define OdooURL "https://odoo.com"
#define OdooExeName "python.exe"
#define BuildDir "c:\odoobuild"
#define ServiceName "odoo-server-" + OdooVersion
#define PythonVersion "3.8.10"
#define OdooLicense BuildDir + "\server\LICENSE"
#define OdooIcon BuildDir + "\server\setup\win32\static\pixmaps\odoo-icon.ico"
#define OdooLeftImage BuildDir + "\server\setup\win32\static\pixmaps\odoo-intro.bmp"
#define OdooHeaderImage BuildDir + "\server\setup\win32\static\pixmaps\odoo-slogan.bmp"
#define PostgreSqlUrl "https://get.enterprisedb.com/postgresql/postgresql-15.2-2-windows-x64.exe"
#define GhostScriptUrl "https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs10011/gs10011w64.exe"
#define NginxUrl "https://nginx.org/download/nginx-1.24.0.zip"
#define DefaultPostgresqlHostname "localhost"
#define DefaultPostgresqlPort "5432"
#define DefaultPostgresqlUser "openpg"
#define DefaultPostgresqlPassword "openpgpwd"
#define PostgresqlRegistryKey "SOFTWARE\PostgreSQL\Installations"


[Setup]
; NOTE: The value of AppId uniquely identifies this application. Do not use the same AppId value in installers for other applications.
; (To generate a new GUID, click Tools | Generate GUID inside the IDE.)
AppId={{272D41D7-B341-45A7-974A-0FF22B3693CC}
AppName={#OdooAppName}
AppVersion={#OdooVersion}
AppPublisher={#OdooPublisher}
AppPublisherURL={#OdooURL}
AppSupportURL={#OdooURL}
AppUpdatesURL={#OdooURL}
DefaultDirName={autopf}\{#OdooAppName}
DisableProgramGroupPage=yes
OutputDir="{#BuildDir}\release"
OutputBaseFilename=odoosetup
SolidCompression=yes
Compression=lzma/max
LZMAUseSeparateProcess=yes
LZMANumFastBytes=128
WizardStyle=modern
LicenseFile="{#OdooLicense}"
ArchitecturesInstallIn64BitMode=x64
WizardSizePercent=100
SetupIconFile={#OdooIcon}
WizardImageStretch=no
WizardImageFile={#OdooLeftImage}
RestartIfNeededByRun=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Types]
Name: "server"; Description: "Install the Odoo server with all the standard modules."
Name: "iot"; Description: "Odoo Iot"

[Components]
Name: "server"; Description: "Install the Odoo server"; Types: server;
Name: "iot"; Description: "Odoo iot"; Types: iot;


[Tasks]
Name: "install_postgresql"; Description: "Download and Install Postgresql server"; Check: ChecklInstallPostgres; Components: server;
Name: "install_nginx"; Description: "Download and Install Nginx web server"; GroupDescription: "Iot" ; Components: iot;
Name: "install_ghostscript"; Description: "Download and Install Ghostscript interpreter"; GroupDescription: "Iot" ; Components: iot;

[Dirs]
Name: "{app}"; Permissions: service-full
Name: "{app}\python"
Name: "{app}\nssm"
Name: "{app}\server"
Name: "{app}\vcredist"
Name: "{app}\thirdparty"
Name: "{app}\sessions"

[Files]
Source: "{#BuildDir}\WinPy64\python-{#PythonVersion}.amd64\*"; Excludes: "__pycache__" ; DestDir: "{app}\python"; Flags: recursesubdirs;
Source: "{#BuildDir}\nssm-2.24\*"; DestDir: "{app}\nssm"; Flags: recursesubdirs;
Source: "{#BuildDir}\server\*"; DestDir: "{app}\server"; Excludes: "wkhtmltopdf\*,enterprise\*"; Flags: recursesubdirs;
source: "{#BuildDir}\static\wkhtmltopdf\*.exe"; DestDir: "{app}\thirdparty"; Flags: skipifsourcedoesntexist;
Source: "{#BuildDir}\vcredist\*.exe"; DestDir: "{app}\vcredist"
Source: "{#OdooHeaderImage}"; Flags: dontcopy;

[INI]
Filename: "{app}\server\odoo.conf"; Section: "options"; Key: "addons_path"; String: "{app}\server\odoo\addons"; Flags: createkeyifdoesntexist
Filename: "{app}\server\odoo.conf"; Section: "options"; Key: "bin_path"; String: "{app}\thirdparty"; Flags: createkeyifdoesntexist
Filename: "{app}\server\odoo.conf"; Section: "options"; Key: "datadir"; String: "{app}\sessions"; Flags: createkeyifdoesntexist
Filename: "{app}\server\odoo.conf"; Section: "options"; Key: "default_productivity_apps"; String: "True"; Flags: createkeyifdoesntexist
Filename: "{app}\server\odoo.conf"; Section: "options"; Key: "db_host"; String: "{code:GetPgParam|host}"; Flags: createkeyifdoesntexist
Filename: "{app}\server\odoo.conf"; Section: "options"; Key: "db_user"; String: "{code:GetPgParam|user}"; Flags: createkeyifdoesntexist
Filename: "{app}\server\odoo.conf"; Section: "options"; Key: "db_password"; String: "{code:GetPgParam|pass}"; Flags: createkeyifdoesntexist
Filename: "{app}\server\odoo.conf"; Section: "options"; Key: "db_port"; String: "{code:GetPgParam|port}"; Flags: createkeyifdoesntexist
Filename: "{app}\server\odoo.conf"; Section: "options"; Key: "pg_path"; String: "{app}\PostgreSQL\bin"; Flags: createkeyifdoesntexist; Tasks: install_postgresql;
Filename: "{app}\server\odoo.conf"; Section: "options"; Key: "server_wide_modules"; String: "web,hw_posbox_homepage,hw_drivers"; Flags: createkeyifdoesntexist; Check: CheckInstallType('iot');
Filename: "{app}\server\odoo.conf"; Section: "options"; Key: "list_db"; String: "False"; Flags: createkeyifdoesntexist; Check: CheckInstallType('iot');
Filename: "{app}\server\odoo.conf"; Section: "options"; Key: "max_cron_threads"; String: "0"; Flags: createkeyifdoesntexist; Check: CheckInstallType('iot');

[Run]
Filename: "{app}\vcredist\vc_redist.x64.exe"; Parameters: "/q"; StatusMsg: "Installing Visual C++ redistributable files"
Filename: "{tmp}\postgresql.exe"; Parameters: "{code:GetPostgresqlInstallParams}"; StatusMsg: "Installing PostgreSQL"; Tasks: "install_postgresql";
Filename: "{app}\nssm\win64\nssm.exe"; Parameters: "install {#ServiceName} ""{app}\python\python.exe"""; StatusMsg: "Installing Odoo Windows service"; Flags: runhidden
Filename: "{app}\nssm\win64\nssm.exe"; Parameters: "set {#ServiceName} AppDirectory """"{app}\python"""""; StatusMsg: "Setting up Odoo Windows service"; Flags: runhidden
Filename: "{app}\nssm\win64\nssm.exe"; Parameters: "set {#ServiceName} AppParameters """"""{app}\server\odoo-bin"""""" -c """"""{app}\server\odoo.conf"""""""; StatusMsg: "Setting up Odoo Windows service"; Flags: runhidden
Filename: "{app}\nssm\win64\nssm.exe"; Parameters: "set {#ServiceName} ObjectName ""localservice"""; Flags: runhidden
Filename: "{app}\nssm\win64\nssm.exe"; Parameters: "start {#ServiceName}"; StatusMsg: "Starting Odoo Windows Service"; Flags: runhidden
Filename: "{app}\python\python.exe"; Parameters: "{app}\server\odoo-bin genproxytoken"; Check: CheckInstallType('iot');
Filename: "http://localhost:8069/"; Flags: shellexec runasoriginaluser postinstall; Description: "Start using Odoo."

[UninstallRun]
Filename: "{app}\nssm\win64\nssm.exe"; Parameters: "stop {#ServiceName}"; StatusMsg: "Stopping Odoo Windows service"
Filename: "{app}\nssm\win64\nssm.exe"; Parameters: "remove {#ServiceName} confirm"; StatusMsg: "Removing Odoo Windows service"

[Uninstalldelete]
Type: files; Name: "{app}\*.pyc"

[Code]
var
  DownloadPage: TDownloadWizardPage;
  PostgresInfosPage: TInputQueryWizardPage;
  ProxyAccessTokenPage: TOutputMsgWizardPage;
  PgHost, PgPort, PgUser, PgPass: String;
  ProxyAccessToken: String;
  PostgresqlInstalled: Boolean;

function CheckInstallType(InstallType: String): Boolean;
begin
  Result := False;
  if WizardSetupType(False) = InstallType then Result := True;
end;

function GetPgParam(Param: String): String;
begin
  Case Param of
    'host': Result:= PgHost;
    'user': Result:= PgUser;
    'port': Result:= PgPort;
    'pass': Result:= PgPass;
  end;
end;

function GetPostgresqlInstallParams(Param: String): String;
begin
  Result := '--mode unattended' \
    + ExpandConstant(' --prefix "{app}\PostgreSQL"') \
    + ExpandConstant(' --datadir "{app}\PostgreSQL\data"') \
    + ' --servicename "PostgreSQL_FOR_Odoo"' \
    + ' --serviceaccount "openpgsvc"' \
    + ' --servicepassword "0p3npgsvcPWD"' \
    + ' --superaccount "' + PgUser + '"' \
    + ' --superpassword "' +  PgPass +'"' \
    + ' --serverport ' + PgPort;
end;

function ChecklInstallPostgres(): Boolean;
begin
  Result:= not (PostgresqlInstalled);
end;

function OnDownloadProgress(const Url, FileName: String; const Progress, ProgressMax: Int64): Boolean;
begin
  if Progress = ProgressMax then
    Log(Format('Successfully downloaded file to {tmp}: %s', [FileName]));
  Result := True;
end;

procedure InitializeHeaderImage();
var
  HeaderImage: TBitmapImage;
begin
  ExtractTemporaryFile('odoo-slogan.bmp');
  HeaderImage := TBitmapImage.Create(WizardForm);
  HeaderImage.Parent := WizardForm.MainPanel;
  HeaderImage.Width := WizardForm.MainPanel.Width;
  HeaderImage.Height := WizardForm.MainPanel.Height;
  HeaderImage.Anchors := [akLeft, akTop, akRight, akBottom];
  HeaderImage.Stretch := True;
  HeaderImage.AutoSize := False;
  HeaderImage.Bitmap.LoadFromFile(ExpandConstant('{tmp}\odoo-slogan.bmp'));
  WizardForm.WizardSmallBitmapImage.Visible := False;
  WizardForm.PageDescriptionLabel.Visible := False;
  WizardForm.PageNameLabel.Visible := False;
end;

function InitializeSetup(): Boolean;
var
  PgInstallNames: TArrayOfString;
begin
  PgHost := '{#DefaultPostgresqlHostname}';
  PgPort := '{#DefaultPostgresqlPort}';
  PgUser := '{#DefaultPostgresqlUser}';
  PgPass := '{#DefaultPostgresqlPassword}';
  PostgresqlInstalled := RegGetSubkeyNames(HKLM64, '{#PostgresqlRegistryKey}', PgInstallNames);
  Result := True;
end;

procedure InitializeWizard(); 
begin
  InitializeHeaderImage();
  DownloadPage := CreateDownloadPage(SetupMessage(msgWizardPreparing), SetupMessage(msgPreparingDesc), @OnDownloadProgress);
  PostgresInfosPage := CreateInputQueryPage(wpSelectTasks, 'PostgreSQL Setup', 'PostgreSQL Setup', 'Postgresql Connection Setup.');
  PostgresInfosPage.Add('&Hostname', False);
  PostgresInfosPage.Add('&Port', False);
  PostgresInfosPage.Add('&Username', False);
  PostgresInfosPage.Add('&Password', False);
  ProxyAccessTokenPage := CreateOutputMsgPage(PostgresInfosPage.ID,
    'Information',
    'Here is your access token for the Odoo IOT, please write it down in a safe place, you will need it to configure the IOT',
    '...');
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  log('Checking to skip page: ' + IntToStr(PageID));
  log('proxy page ID: ' + IntToStr(ProxyAccessTokenPage.ID));
  if PageID = ProxyAccessTokenPage.ID then Result := not (WizardSetupType(False) = 'iot');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  ConfigPath: String;
begin
  Result := True;
  if CurPageID = wpSelectDir then begin
      ConfigPath := ExpandConstant('{app}\server\odoo.conf');
      if FileExists(configPath) then begin
        log('Reading previous Odoo Config file');
        PgHost := GetIniString('options', 'db_host', '{#DefaultPostgresqlHostname}', ConfigPath);
        PgPort := GetIniString('options', 'db_port', '{#DefaultPostgresqlPort}', ConfigPath);
        PgUser := GetIniString('options', 'db_user', '{#DefaultPostgresqlUser}', ConfigPath);
        PgPass := GetIniString('options', 'db_password', '{#DefaultPostgresqlPassword}', ConfigPath);
        ProxyAccessToken := GetIniString('options', 'proxy_access_token', 'shit', ConfigPath);
        ProxyAccessTokenPage.MsgLabel.Caption := ProxyAccessToken;
      end;
  end;
  if CurPageID = wpSelectComponents then begin
    PostgresInfosPage.Values[0] := PgHost;
    PostgresInfosPage.Values[1] := PgPort;
    PostgresInfosPage.Values[2] := PgUser;
    PostgresInfosPage.Values[3] := PgPass;
  end;
  if CurPageID = PostgresInfosPage.ID then begin
    PgHost := PostgresInfosPage.Values[0];
    PgPort := PostgresInfosPage.Values[1];
    PgUser := PostgresInfosPage.Values[2];
    PgPass := PostgresInfosPage.Values[3];
    log(WizardSetupType(False));
  end;
  if CurPageID = wpReady then begin
    DownloadPage.Clear;
    if WizardIsTaskSelected('install_postgresql') then
      DownloadPage.Add('{#PostgreSqlUrl}', 'postgresql.exe', '');
    if WizardIsTaskSelected('install_nginx') then
      DownloadPage.Add('{#NginxUrl}', 'nginx.zip', '');
    if WizardIsTaskSelected('install_ghostscript') then
      DownloadPage.Add('{#GhostScriptUrl}', 'ghostscript.exe', ''); 
    DownloadPage.Show;
    try
      try
        DownloadPage.Download;
        Result := True;
      except
        SuppressibleMsgBox(AddPeriod(GetExceptionMessage), mbCriticalError, MB_OK, IDOK);
        Result := False;
      end;
    finally
      DownloadPage.Hide;
    end;
  end;
end;
