@echo off
REM Initialise Ombuto Code — reset project data and create starter content.
REM Delegates to the bash script via Git Bash.
REM
REM Usage: initombuto.bat [--keep-docs] [C:\path\to\project]
REM   By default, docs/ is wiped and re-seeded so the project is genuinely
REM   ready for a new project.
REM   --keep-docs   Preserve existing docs/ content (only reset DB / runtime)
REM   --clear       Backwards-compatible alias for the default wipe behaviour

setlocal

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

REM cd into the script directory and invoke bash with a relative path.
REM Avoids a known Git-Bash quirk where Windows-style paths containing a
REM leading-dot folder (e.g. .ombutocode) aren't always auto-translated,
REM producing a misleading "No such file or directory" against a file
REM that's actually there.
pushd "%SCRIPT_DIR%"

REM Try Git Bash on PATH
where bash >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    bash ./initombuto %*
    set "RC=%ERRORLEVEL%"
    popd
    exit /b %RC%
)

REM Try Git for Windows default location
if exist "C:\Program Files\Git\bin\bash.exe" (
    "C:\Program Files\Git\bin\bash.exe" ./initombuto %*
    set "RC=%ERRORLEVEL%"
    popd
    exit /b %RC%
)

popd
echo Error: bash not found. Please install Git for Windows.
exit /b 1
