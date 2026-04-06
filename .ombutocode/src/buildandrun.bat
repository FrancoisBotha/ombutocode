@echo off
REM Build and run Ombuto Code.
REM Usage: buildandrun.bat

REM Clear ELECTRON_RUN_AS_NODE so Electron runs as a full app, not plain Node.js
set ELECTRON_RUN_AS_NODE=

call npm run build
if %ERRORLEVEL% neq 0 (
    echo Build failed with error code %ERRORLEVEL%
    exit /b %ERRORLEVEL%
)

call npm run start
