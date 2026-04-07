@echo off
REM Initialise Ombuto Code — reset project data and create starter content.
REM Delegates to the bash script via Git Bash.
REM
REM Usage: initombuto.bat [--clear] [C:\path\to\project]
REM   --clear   Delete all docs/ content before creating starter data

setlocal

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

REM Try Git Bash
where bash >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    bash "%SCRIPT_DIR%\initombuto" %*
    exit /b %ERRORLEVEL%
)

REM Try Git for Windows default location
if exist "C:\Program Files\Git\bin\bash.exe" (
    "C:\Program Files\Git\bin\bash.exe" "%SCRIPT_DIR%\initombuto" %*
    exit /b %ERRORLEVEL%
)

echo Error: bash not found. Please install Git for Windows.
exit /b 1
