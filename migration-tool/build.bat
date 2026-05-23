@echo off
REM Build migrate-ombutocode.exe.
REM Tries MSVC (cl.exe) first via vcvars64.bat, falls back to MinGW g++.
REM
REM Output: migrate-ombutocode.exe in this folder.

setlocal
set OUT=migrate-ombutocode.exe

REM ── MSVC path (preferred) ──
where cl >nul 2>nul
if %ERRORLEVEL%==0 (
    echo Building with MSVC cl.exe...
    cl /nologo /EHsc /std:c++17 /W3 /O2 /MT ^
       /Fe:%OUT% main.cpp ^
       /link /SUBSYSTEM:WINDOWS user32.lib shell32.lib comctl32.lib ole32.lib gdi32.lib
    if %ERRORLEVEL%==0 (
        del main.obj 2>nul
        echo.
        echo Built %OUT%
        goto :eof
    )
    echo MSVC build failed, falling back to MinGW...
)

REM ── MinGW fallback ──
where g++ >nul 2>nul
if %ERRORLEVEL%==0 (
    echo Building with MinGW g++...
    g++ -std=c++17 -O2 -municode -mwindows -static -static-libgcc -static-libstdc++ ^
        -o %OUT% main.cpp -lshell32 -lcomctl32 -lole32 -luser32 -lgdi32
    if %ERRORLEVEL%==0 (
        echo.
        echo Built %OUT%
        goto :eof
    )
    echo MinGW build failed.
    exit /b 1
)

echo Error: neither cl.exe (MSVC) nor g++ (MinGW) found in PATH.
echo Install one of:
echo   - Visual Studio Build Tools (then run from a Developer Command Prompt)
echo   - MSYS2 + mingw-w64 (then ensure g++ is in PATH)
exit /b 1
