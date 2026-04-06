@echo off
REM Reset Ombuto Code project data to a clean state.
REM Clears archives, logs, features, requests, and run output.
REM Preserves backlog.yml, templates, codingagents config, and engineering guide.
REM
REM Usage: initombuto.bat [C:\path\to\project]
REM   If no path given, resets data in the current project (script's directory).

setlocal enabledelayedexpansion

if not "%~1"=="" (
    if exist "%~1\" (
        set "PROJECT_ROOT=%~f1"
    ) else (
        set "PROJECT_ROOT=%~dp0.."
    )
) else (
    set "PROJECT_ROOT=%~dp0.."
)

REM Resolve to absolute path and remove trailing backslash
pushd "%PROJECT_ROOT%" 2>nul && (set "PROJECT_ROOT=!CD!" & popd)
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"

set "OMBUTOCODE_DIR=%PROJECT_ROOT%\.ombutocode"

if not exist "%OMBUTOCODE_DIR%" (
    echo Error: No .ombutocode\ directory found at %PROJECT_ROOT% >&2
    exit /b 1
)

echo Resetting Ombuto Code data in: %PROJECT_ROOT%
echo.

REM 1. Delete database files
for %%f in ("%OMBUTOCODE_DIR%\data\*.db") do (
    echo   Removing %%~nxf
    del "%%f"
)
if exist "%OMBUTOCODE_DIR%\planning\archive.db" (
    echo   Removing archive.db
    del "%OMBUTOCODE_DIR%\planning\archive.db"
)

REM 2. Delete migration artifacts
for %%f in ("%OMBUTOCODE_DIR%\planning\*.migrated") do (
    echo   Removing %%~nxf
    del "%%f"
)

REM 3. Clear logs
if exist "%OMBUTOCODE_DIR%\logs" (
    echo   Clearing logs\
    del /q "%OMBUTOCODE_DIR%\logs\*" 2>nul
)

REM 4. Clear run output
if exist "%OMBUTOCODE_DIR%\run-output" (
    echo   Clearing run-output\
    del /q "%OMBUTOCODE_DIR%\run-output\*" 2>nul
)

REM 5. Delete feature specs
if exist "%OMBUTOCODE_DIR%\features" (
    echo   Clearing features\
    del /q "%OMBUTOCODE_DIR%\features\*.md" 2>nul
)

REM 6. Delete agent state
if exist "%OMBUTOCODE_DIR%\codingagent-state.json" (
    echo   Removing codingagent-state.json
    del "%OMBUTOCODE_DIR%\codingagent-state.json"
)

REM 7. Reset backlog to empty
set "BACKLOG=%OMBUTOCODE_DIR%\planning\backlog.yml"
set "TEMPLATE=%OMBUTOCODE_DIR%\templates\backlog.yml"
if exist "%TEMPLATE%" (
    echo   Resetting backlog.yml from template
    copy /y "%TEMPLATE%" "%BACKLOG%" >nul
) else (
    echo   Resetting backlog.yml to empty
    (
        echo version: 1
        echo updated_at: ""
        echo tickets: []
    ) > "%BACKLOG%"
)

REM 8. Install dependencies
set "APP_DIR=%OMBUTOCODE_DIR%\src"
if exist "%APP_DIR%\package.json" (
    echo   Installing dependencies ^(npm install^)...
    pushd "%APP_DIR%"
    npm install --no-audit --no-fund
    popd
)

echo.
echo Done. Project data has been reset.
endlocal
