@echo off
REM Build and run Ombuto Code.
REM Usage: buildandrun.bat [project-root]
REM   project-root: optional absolute path to the project to open.
REM                 Defaults to the parent of this script (i.e. the repo that
REM                 contains the .ombutocode/ directory you launched from).
REM
REM Each project gets its own userData directory (%APPDATA%\Ombuto Code\<folder>)
REM and its own .ombutocode\.instance.lock, so multiple projects can run side
REM by side. Launching the same project twice is still blocked by the lockfile.

REM Clear ELECTRON_RUN_AS_NODE so Electron runs as a full app, not plain Node.js
set ELECTRON_RUN_AS_NODE=

REM Resolve project root: argument wins, otherwise it's the parent of .ombutocode\
if "%~1"=="" (
    for %%I in ("%~dp0..") do set "OMBUTOCODE_PROJECT_ROOT=%%~fI"
) else (
    set "OMBUTOCODE_PROJECT_ROOT=%~f1"
)
echo Project root: %OMBUTOCODE_PROJECT_ROOT%

REM Navigate to the src directory relative to this script
cd /d "%~dp0src"

REM Install/update dependencies
echo Installing dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo npm install failed with error code %ERRORLEVEL%
    exit /b %ERRORLEVEL%
)

call npm run build
if %ERRORLEVEL% neq 0 (
    echo Build failed with error code %ERRORLEVEL%
    exit /b %ERRORLEVEL%
)

call npm run start
