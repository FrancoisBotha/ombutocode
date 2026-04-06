@echo off
REM Build and run Ombuto Code.
REM Usage: buildandrun.bat

REM Clear ELECTRON_RUN_AS_NODE so Electron runs as a full app, not plain Node.js
set ELECTRON_RUN_AS_NODE=

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
