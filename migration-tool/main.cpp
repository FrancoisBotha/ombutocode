// migrate-ombutocode.exe — small Win32 GUI to apply Ombuto Code workbench
// updates from a source repo (the "latest") to a target project (yours).
//
// Picks two folders, previews what will change, then performs the migration:
//   - Backs up target's .ombutocode/src/ to .ombutocode/src.backup-<ts>/
//   - Overwrites .ombutocode/src/ (skipping node_modules + dist)
//   - Overwrites buildandrun.bat / buildandrun / codingagents.yml /
//     codingagent-templates.json
//   - Adds any new skills (e.g. Epic Generation, Fix Ticket, PRD-BASIC) to
//     both .ombutocode/templates/skills/ and docs/Skills/ if missing
//   - Removes target's node_modules + dist so next launch does a clean
//     npm install + vite build
//
// What is NOT touched: target's .ombutocode/data/ (the SQLite DBs), logs/,
// run-output/, planning/, and the existing docs/ tree (other than additive
// new-skill files).
//
// Build:  see build.bat in this folder.

#define WIN32_LEAN_AND_MEAN
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <commctrl.h>
#include <shlobj.h>
#include <filesystem>
#include <string>
#include <vector>
#include <sstream>
#include <chrono>
#include <ctime>
#include <iomanip>

#pragma comment(lib, "user32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "comctl32.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "gdi32.lib")
#pragma comment(linker, "/SUBSYSTEM:WINDOWS")

namespace fs = std::filesystem;

// ── Constants ──────────────────────────────────────────────────────────────

constexpr int IDC_SOURCE_PATH   = 101;
constexpr int IDC_TARGET_PATH   = 102;
constexpr int IDC_SOURCE_BROWSE = 103;
constexpr int IDC_TARGET_BROWSE = 104;
constexpr int IDC_PREVIEW_BTN   = 105;
constexpr int IDC_MIGRATE_BTN   = 106;
constexpr int IDC_LOG           = 107;
constexpr int IDC_CLEAR_BTN     = 108;

// New skills that the migration adds (additively — only if missing in
// target). Keep in sync with the actual files in docs/Skills/.
static const std::vector<std::wstring> kNewSkills = {
    L"Epic Generation.md",
    L"Epic Refinement.md",
    L"Fix Ticket.md",
    L"PRD-BASIC Skill.md",
    L"Architecture-BASIC Skill.md",
    L"Initiate Stack.md"
};

// Single-file overwrites (relative to project root).
static const std::vector<std::wstring> kOverwriteFiles = {
    L".ombutocode\\buildandrun.bat",
    L".ombutocode\\buildandrun",
    L".ombutocode\\initombuto",       // bash logic — the .bat is just a wrapper
    L".ombutocode\\initombuto.bat",
    L".ombutocode\\codingagents\\codingagents.yml",
    L".ombutocode\\codingagent-templates.json",
    L".ombutocode\\OMBUTOCODE_ENGINEERING_GUIDE.md"
};

// ── Globals (just window handles) ──────────────────────────────────────────

static HWND g_hSource = nullptr;
static HWND g_hTarget = nullptr;
static HWND g_hLog    = nullptr;

// ── Small helpers ──────────────────────────────────────────────────────────

static std::wstring getText(HWND h) {
    int len = GetWindowTextLengthW(h);
    if (len <= 0) return L"";
    std::wstring s(len, L'\0');
    GetWindowTextW(h, s.data(), len + 1);
    return s;
}

static void appendLog(const std::wstring& s) {
    // Move caret to end, insert text with CRLF (edit control needs CRLF).
    std::wstring out = s + L"\r\n";
    int len = GetWindowTextLengthW(g_hLog);
    SendMessageW(g_hLog, EM_SETSEL, (WPARAM)len, (LPARAM)len);
    SendMessageW(g_hLog, EM_REPLACESEL, FALSE, (LPARAM)out.c_str());
}

static void clearLog() { SetWindowTextW(g_hLog, L""); }

static std::wstring browseFolder(HWND owner, const std::wstring& title) {
    // Older but dependency-free folder picker. Modern IFileDialog would be
    // nicer but requires CoInitialize + more boilerplate.
    BROWSEINFOW bi{};
    bi.hwndOwner = owner;
    bi.lpszTitle = title.c_str();
    bi.ulFlags   = BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE;
    LPITEMIDLIST pidl = SHBrowseForFolderW(&bi);
    if (!pidl) return L"";
    wchar_t buf[MAX_PATH] = L"";
    SHGetPathFromIDListW(pidl, buf);
    CoTaskMemFree(pidl);
    return buf;
}

static std::wstring nowStamp() {
    auto t = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());
    std::tm tm{};
    localtime_s(&tm, &t);
    std::wstringstream ss;
    ss << std::put_time(&tm, L"%Y%m%d-%H%M%S");
    return ss.str();
}

// ── Validation ─────────────────────────────────────────────────────────────

static bool validateSource(const fs::path& src, std::wstring& err) {
    if (!fs::exists(src) || !fs::is_directory(src)) {
        err = L"Source folder does not exist."; return false;
    }
    auto marker = src / ".ombutocode" / "src" / "main.js";
    if (!fs::exists(marker)) {
        err = L"Source is not an Ombuto Code repo (missing .ombutocode/src/main.js)."; return false;
    }
    return true;
}

static bool validateTarget(const fs::path& tgt, std::wstring& err) {
    if (!fs::exists(tgt) || !fs::is_directory(tgt)) {
        err = L"Target folder does not exist."; return false;
    }
    auto omb = tgt / ".ombutocode";
    if (!fs::exists(omb)) {
        err = L"Target is not an Ombuto Code project (missing .ombutocode/ folder)."; return false;
    }
    return true;
}

// ── File operations ────────────────────────────────────────────────────────

// Recursive copy that skips node_modules and dist subdirectories — these
// would bring platform-specific binaries from the source machine and also
// massively slow the copy. Overwrites existing files.
static void copyTreeSkipBuildArtifacts(const fs::path& from, const fs::path& to,
                                       size_t& filesCopied) {
    fs::create_directories(to);
    for (auto& entry : fs::recursive_directory_iterator(from)) {
        const fs::path rel = fs::relative(entry.path(), from);
        // Skip node_modules and dist anywhere in the tree.
        bool skip = false;
        for (auto& p : rel) {
            const auto s = p.wstring();
            if (s == L"node_modules" || s == L"dist") { skip = true; break; }
        }
        if (skip) continue;
        const fs::path dst = to / rel;
        if (entry.is_directory()) {
            fs::create_directories(dst);
        } else if (entry.is_regular_file()) {
            fs::create_directories(dst.parent_path());
            fs::copy_file(entry.path(), dst, fs::copy_options::overwrite_existing);
            ++filesCopied;
        }
    }
}

static void copyFileOver(const fs::path& from, const fs::path& to) {
    if (!fs::exists(from)) return;
    fs::create_directories(to.parent_path());
    fs::copy_file(from, to, fs::copy_options::overwrite_existing);
}

static bool copyIfMissing(const fs::path& from, const fs::path& to) {
    if (!fs::exists(from)) return false;
    if (fs::exists(to)) return false;
    fs::create_directories(to.parent_path());
    fs::copy_file(from, to);
    return true;
}

static size_t removeTree(const fs::path& p) {
    if (!fs::exists(p)) return 0;
    return fs::remove_all(p);
}

// ── Preview ────────────────────────────────────────────────────────────────

static void doPreview(const fs::path& src, const fs::path& tgt) {
    clearLog();
    std::wstring err;
    if (!validateSource(src, err)) { appendLog(L"[ERROR] " + err); return; }
    if (!validateTarget(tgt, err)) { appendLog(L"[ERROR] " + err); return; }

    appendLog(L"── Preview ──");
    appendLog(L"Source: " + src.wstring());
    appendLog(L"Target: " + tgt.wstring());
    appendLog(L"");

    appendLog(L"Would back up target's .ombutocode\\src\\ to .ombutocode\\src.backup-<timestamp>\\");
    appendLog(L"Would overwrite .ombutocode\\src\\ (excluding node_modules, dist)");
    for (auto& f : kOverwriteFiles) {
        auto from = src / f;
        if (fs::exists(from)) appendLog(L"Would overwrite " + f);
    }

    appendLog(L"");
    appendLog(L"New skills (copied additively if missing in target):");
    for (auto& sk : kNewSkills) {
        auto from = src / L"docs" / L"Skills" / sk;
        if (!fs::exists(from)) { appendLog(L"  (missing in source) " + sk); continue; }
        auto tgtDocs = tgt / L"docs" / L"Skills" / sk;
        auto tgtTpl  = tgt / L".ombutocode" / L"templates" / L"skills" / sk;
        std::wstring marks = (fs::exists(tgtDocs) ? L"docs:keep" : L"docs:add");
        marks += L" / ";
        marks += (fs::exists(tgtTpl)  ? L"tpl:keep"  : L"tpl:add");
        appendLog(L"  [" + marks + L"] " + sk);
    }

    appendLog(L"");
    appendLog(L"Would remove target's .ombutocode\\src\\node_modules\\ and dist\\");
    appendLog(L"(target's .ombutocode\\data\\, logs\\, run-output\\, planning\\, and docs\\ are NOT touched apart from new skills.)");
    appendLog(L"");
    appendLog(L"Click Migrate to apply these changes.");
}

// ── Migrate ────────────────────────────────────────────────────────────────

static void doMigrate(const fs::path& src, const fs::path& tgt) {
    clearLog();
    std::wstring err;
    if (!validateSource(src, err)) { appendLog(L"[ERROR] " + err); return; }
    if (!validateTarget(tgt, err)) { appendLog(L"[ERROR] " + err); return; }

    int rc = MessageBoxW(nullptr,
        L"This will overwrite the .ombutocode/src/ folder, launchers, and agent\n"
        L"config in the target project. A timestamped backup of the existing\n"
        L"src/ folder will be made first.\n\nContinue?",
        L"Confirm migration", MB_OKCANCEL | MB_ICONWARNING);
    if (rc != IDOK) { appendLog(L"Cancelled."); return; }

    try {
        appendLog(L"── Migrating ──");
        appendLog(L"Source: " + src.wstring());
        appendLog(L"Target: " + tgt.wstring());
        appendLog(L"");

        // 1. Backup target's existing src/
        auto tgtSrc = tgt / L".ombutocode" / L"src";
        if (fs::exists(tgtSrc)) {
            auto backup = tgt / L".ombutocode" / (std::wstring(L"src.backup-") + nowStamp());
            appendLog(L"Backing up to " + backup.filename().wstring() + L"...");
            size_t copied = 0;
            copyTreeSkipBuildArtifacts(tgtSrc, backup, copied);
            appendLog(L"  backed up " + std::to_wstring(copied) + L" files (excluded node_modules + dist)");
        } else {
            appendLog(L"(no existing target src/ — nothing to back up)");
        }

        // 2. Overwrite src/
        auto srcSrc = src / L".ombutocode" / L"src";
        appendLog(L"Copying .ombutocode\\src\\ ...");
        size_t copied = 0;
        copyTreeSkipBuildArtifacts(srcSrc, tgtSrc, copied);
        appendLog(L"  copied " + std::to_wstring(copied) + L" files");

        // 3. Overwrite single files
        for (auto& f : kOverwriteFiles) {
            auto from = src / f;
            auto to   = tgt / f;
            if (fs::exists(from)) {
                copyFileOver(from, to);
                appendLog(L"Overwrote " + f);
            }
        }

        // 4. Additive: new skills
        for (auto& sk : kNewSkills) {
            auto from = src / L"docs" / L"Skills" / sk;
            if (!fs::exists(from)) continue;
            // Copy to templates/skills/ (for future inits)
            auto toTpl = tgt / L".ombutocode" / L"templates" / L"skills" / sk;
            if (copyIfMissing(from, toTpl)) appendLog(L"Added template skill: " + sk);
            // Copy to docs/Skills/ (active for this project right now)
            auto toDocs = tgt / L"docs" / L"Skills" / sk;
            if (copyIfMissing(from, toDocs)) appendLog(L"Added active skill:   " + sk);
        }

        // 5. Remove target's node_modules + dist so the next launch rebuilds cleanly
        auto nm = tgt / L".ombutocode" / L"src" / L"node_modules";
        auto dist = tgt / L".ombutocode" / L"src" / L"dist";
        size_t r1 = removeTree(nm);
        size_t r2 = removeTree(dist);
        appendLog(L"Removed " + std::to_wstring(r1) + L" node_modules entries, "
                              + std::to_wstring(r2) + L" dist entries");

        appendLog(L"");
        appendLog(L"── DONE ──");
        appendLog(L"Next steps in the target project:");
        appendLog(L"  1. Run .ombutocode\\buildandrun.bat (it will npm install + build + launch)");
        appendLog(L"  2. If your Opus model selection broke, re-pick it in Settings (id changed 4.6 -> 4.7)");
    } catch (const std::exception& e) {
        std::string what = e.what();
        std::wstring wwhat(what.begin(), what.end());
        appendLog(L"[ERROR] " + wwhat);
    }
}

// ── UI plumbing ────────────────────────────────────────────────────────────

static HWND mkLabel(HWND parent, const wchar_t* text, int x, int y, int w, int h, HFONT font) {
    HWND h_ = CreateWindowExW(0, L"STATIC", text, WS_CHILD | WS_VISIBLE,
                              x, y, w, h, parent, nullptr, nullptr, nullptr);
    SendMessageW(h_, WM_SETFONT, (WPARAM)font, TRUE);
    return h_;
}
static HWND mkEdit(HWND parent, int id, int x, int y, int w, int h, HFONT font, DWORD extra = 0) {
    HWND h_ = CreateWindowExW(WS_EX_CLIENTEDGE, L"EDIT", L"",
                              WS_CHILD | WS_VISIBLE | WS_TABSTOP | extra,
                              x, y, w, h, parent, (HMENU)(INT_PTR)id, nullptr, nullptr);
    SendMessageW(h_, WM_SETFONT, (WPARAM)font, TRUE);
    return h_;
}
static HWND mkButton(HWND parent, int id, const wchar_t* text, int x, int y, int w, int h, HFONT font) {
    HWND h_ = CreateWindowExW(0, L"BUTTON", text, WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_PUSHBUTTON,
                              x, y, w, h, parent, (HMENU)(INT_PTR)id, nullptr, nullptr);
    SendMessageW(h_, WM_SETFONT, (WPARAM)font, TRUE);
    return h_;
}

LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    static HFONT hFont = nullptr;
    switch (msg) {
    case WM_CREATE: {
        hFont = CreateFontW(-13, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
            OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Segoe UI");

        mkLabel(hwnd, L"Source folder (latest Ombuto Code repo):", 12, 10, 360, 20, hFont);
        g_hSource = mkEdit(hwnd, IDC_SOURCE_PATH, 12, 32, 540, 24, hFont);
        mkButton(hwnd, IDC_SOURCE_BROWSE, L"Browse...", 560, 32, 90, 24, hFont);

        mkLabel(hwnd, L"Target folder (your project to update):", 12, 66, 360, 20, hFont);
        g_hTarget = mkEdit(hwnd, IDC_TARGET_PATH, 12, 88, 540, 24, hFont);
        mkButton(hwnd, IDC_TARGET_BROWSE, L"Browse...", 560, 88, 90, 24, hFont);

        mkButton(hwnd, IDC_PREVIEW_BTN, L"Preview",  12, 124, 100, 28, hFont);
        mkButton(hwnd, IDC_MIGRATE_BTN, L"Migrate", 120, 124, 100, 28, hFont);
        mkButton(hwnd, IDC_CLEAR_BTN,   L"Clear log", 550, 124, 100, 28, hFont);

        g_hLog = mkEdit(hwnd, IDC_LOG, 12, 160, 638, 320, hFont,
            ES_MULTILINE | ES_AUTOVSCROLL | ES_READONLY | WS_VSCROLL);
        // Monospace for the log so the columns of path output line up.
        HFONT logFont = CreateFontW(-13, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
            OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, FIXED_PITCH, L"Consolas");
        SendMessageW(g_hLog, WM_SETFONT, (WPARAM)logFont, TRUE);

        appendLog(L"Pick a source (latest Ombuto Code repo) and target (your project), then Preview or Migrate.");
        return 0;
    }
    case WM_COMMAND: {
        switch (LOWORD(wParam)) {
        case IDC_SOURCE_BROWSE: {
            auto p = browseFolder(hwnd, L"Select the SOURCE Ombuto Code repo");
            if (!p.empty()) SetWindowTextW(g_hSource, p.c_str());
            return 0;
        }
        case IDC_TARGET_BROWSE: {
            auto p = browseFolder(hwnd, L"Select the TARGET project to update");
            if (!p.empty()) SetWindowTextW(g_hTarget, p.c_str());
            return 0;
        }
        case IDC_PREVIEW_BTN:
            doPreview(getText(g_hSource), getText(g_hTarget));
            return 0;
        case IDC_MIGRATE_BTN:
            doMigrate(getText(g_hSource), getText(g_hTarget));
            return 0;
        case IDC_CLEAR_BTN:
            clearLog();
            return 0;
        }
        break;
    }
    case WM_CLOSE:
        DestroyWindow(hwnd);
        return 0;
    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

int APIENTRY wWinMain(HINSTANCE hInstance, HINSTANCE, LPWSTR, int nCmdShow) {
    // CoInitialize for SHBrowseForFolder + CoTaskMemFree usage.
    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

    INITCOMMONCONTROLSEX icc{ sizeof(icc), ICC_STANDARD_CLASSES };
    InitCommonControlsEx(&icc);

    const wchar_t* cls = L"OmbutoMigrate";
    WNDCLASSEXW wc{};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInstance;
    wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)(COLOR_BTNFACE + 1);
    wc.lpszClassName = cls;
    RegisterClassExW(&wc);

    HWND hwnd = CreateWindowExW(0, cls, L"Ombuto Code — Migration Tool",
        WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX,
        CW_USEDEFAULT, CW_USEDEFAULT, 680, 530,
        nullptr, nullptr, hInstance, nullptr);
    if (!hwnd) return 1;

    ShowWindow(hwnd, nCmdShow);
    UpdateWindow(hwnd);

    MSG msg{};
    while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
        if (!IsDialogMessageW(hwnd, &msg)) {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }

    CoUninitialize();
    return (int)msg.wParam;
}
