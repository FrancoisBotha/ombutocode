@echo off
REM Build migrate-ombutocode.exe.
REM Tries MSVC (cl.exe) first via vcvars64.bat, falls back to MinGW g++.
REM
REM Output: migrate-ombutocode.exe in this folder.

REM ── Bring MSVC onto PATH if it is installed but not in this shell ──
REM Build Tools installs cl.exe but does NOT add it to the system PATH; you
REM normally only get it inside a Developer Command Prompt. Source vcvars64.bat
REM from the usual install locations so a plain shell works too.
REM
REM This runs BEFORE our own setlocal on purpose: vcvars64.bat ends with its
REM own endlocal, which would pop our scope and wipe %OUT%.
where cl >nul 2>nul
if %ERRORLEVEL% NEQ 0 call :setup_msvc

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

echo Error: neither cl.exe (MSVC) nor g++ (MinGW) found in PATH,
echo and no Visual Studio install was found in the usual locations.
echo Install one of:
echo   - Visual Studio Build Tools (C++ workload)
echo   - MSYS2 + mingw-w64 (then ensure g++ is in PATH)
exit /b 1

REM ── Locate an installed MSVC and pull it onto PATH ──
REM Note: %ProgramFiles(x86)% is copied into a plain variable first — the
REM literal "(x86)" inside a parenthesised FOR block breaks cmd's parser.
:setup_msvc
set "VS_PF64=%ProgramFiles%"
set "VS_PF32=%ProgramFiles(x86)%"
for %%v in (2022 2019) do (
    for %%e in (BuildTools Community Professional Enterprise) do (
        if exist "%VS_PF32%\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvars64.bat" (
            echo Initialising MSVC from Visual Studio %%v %%e ...
            call "%VS_PF32%\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvars64.bat" >/dev/null 2>&1
            goto :eof
        )
        if exist "%VS_PF64%\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvars64.bat" (
            echo Initialising MSVC from Visual Studio %%v %%e ...
            call "%VS_PF64%\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvars64.bat" >/dev/null 2>&1
            goto :eof
        )
    )
)
goto :eof
