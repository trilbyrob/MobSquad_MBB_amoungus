@echo off
setlocal

echo =========================
echo MobSquad Bedrock Deployer
echo =========================
echo.

REM --------------------------------------------------
REM Project folder (this batch file should live here)
REM --------------------------------------------------
set "PROJECT_DIR=%~dp0"

REM Remove trailing backslash
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

REM --------------------------------------------------
REM Pack name / target folder name in Bedrock
REM --------------------------------------------------
set "PACK_FOLDER=MobSquad_MBB_amoungus"

REM --------------------------------------------------
REM Bedrock development behavior packs folder
REM --------------------------------------------------
set "BEDROCK_BP=%APPDATA%\Minecraft Bedrock\users\shared\games\com.mojang\development_behavior_packs\%PACK_FOLDER%"

echo Project folder:
echo %PROJECT_DIR%
echo.
echo Bedrock target folder:
echo %BEDROCK_BP%
echo.

REM --------------------------------------------------
REM Build TypeScript first
REM --------------------------------------------------
echo Running npm build...
call npm run build
if errorlevel 1 (
    echo.
    echo Build failed. Deployment cancelled.
    pause
    exit /b 1
)

echo.
echo Creating Bedrock target folder if needed...
if not exist "%BEDROCK_BP%" mkdir "%BEDROCK_BP%"

REM --------------------------------------------------
REM Copy root files Minecraft needs
REM --------------------------------------------------
echo Copying root files...
if exist "%PROJECT_DIR%\manifest.json" copy /Y "%PROJECT_DIR%\manifest.json" "%BEDROCK_BP%\manifest.json" >nul
if exist "%PROJECT_DIR%\pack_icon.png" copy /Y "%PROJECT_DIR%\pack_icon.png" "%BEDROCK_BP%\pack_icon.png" >nul

REM --------------------------------------------------
REM Copy folders Minecraft needs
REM --------------------------------------------------
echo Copying items folder...
if exist "%PROJECT_DIR%\items" robocopy "%PROJECT_DIR%\items" "%BEDROCK_BP%\items" /E /NFL /NDL /NJH /NJS /NC /NS >nul

echo Copying scripts folder...
if exist "%PROJECT_DIR%\scripts" robocopy "%PROJECT_DIR%\scripts" "%BEDROCK_BP%\scripts" /E /NFL /NDL /NJH /NJS /NC /NS >nul

echo Copying functions folder...
if exist "%PROJECT_DIR%\functions" robocopy "%PROJECT_DIR%\functions" "%BEDROCK_BP%\functions" /E /NFL /NDL /NJH /NJS /NC /NS >nul

echo Copying entities folder...
if exist "%PROJECT_DIR%\entities" robocopy "%PROJECT_DIR%\entities" "%BEDROCK_BP%\entities" /E /NFL /NDL /NJH /NJS /NC /NS >nul

echo Copying blocks folder...
if exist "%PROJECT_DIR%\blocks" robocopy "%PROJECT_DIR%\blocks" "%BEDROCK_BP%\blocks" /E /NFL /NDL /NJH /NJS /NC /NS >nul

echo Copying texts folder...
if exist "%PROJECT_DIR%\texts" robocopy "%PROJECT_DIR%\texts" "%BEDROCK_BP%\texts" /E /NFL /NDL /NJH /NJS /NC /NS >nul

echo.
echo Deployment complete.
echo.
pause
endlocal