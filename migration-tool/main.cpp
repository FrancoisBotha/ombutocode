// migrate-ombutocode.exe — small Win32 GUI to apply Ombuto Code workbench
// updates from a source repo (the "latest") to a target project (yours).
//
// Picks two folders, previews what will change, then performs the migration:
//   - Backs up target's .ombutocode/src/ to .ombutocode/src.backup-<ts>/
//   - Overwrites .ombutocode/src/ (skipping node_modules + dist)
//   - Overwrites buildandrun.bat / buildandrun / codingagents.yml /
//     codingagent-templates.json
//   - Migrates skills to the v0.2.4 category layout: moves flat files in
//     docs/Skills/ and .ombutocode/templates/skills/ into their category
//     sub-folder (PRD, Architecture, Styling, ...), and adds any skills the
//     target is missing
//   - Removes target's node_modules + dist so next launch does a clean
//     npm install + vite build
//
// What is NOT touched: target's .ombutocode/data/ (the SQLite DBs), logs/,
// run-output/, planning/, and the existing docs/ tree (other than the skill
// moves/additions above).
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

// Canonical skills and their category sub-folders under docs/Skills/.
// v0.2.4 introduced skill categories as a one-level folder structure
// (PRD, Architecture, Styling, Epics, BDD, Ticket Generation, Diagnostics,
// Bootstrapping, Other). The migration moves a target's existing flat
// skill files into their category folder and additively copies any skills
// the target is missing. Keep in sync with docs/Skills/ in the repo.
struct SkillEntry { const wchar_t* category; const wchar_t* file; };
static const std::vector<SkillEntry> kSkills = {
    { L"PRD",               L"PRD Skill.md" },
    { L"PRD",               L"PRD-BASIC Skill.md" },
    { L"Architecture",      L"Architecture_Guide.md" },
    { L"Architecture",      L"Architecture-BASIC Skill.md" },
    { L"Styling",           L"Style Guide.md" },
    { L"Styling",           L"Style Guide - Simple.md" },
    { L"Styling",           L"Mockup Generator.md" },
    { L"Epics",             L"Epic Generation.md" },
    { L"Epics",             L"Epic Refinement.md" },
    { L"BDD",               L"Simple BDD Use Case.md" },
    { L"BDD",               L"BDD Ticket Generation.md" },
    { L"Ticket Generation", L"Ticket Generation.md" },
    { L"Diagnostics",       L"Fix Ticket.md" },
    { L"Bootstrapping",     L"Initiate Stack.md" },
    { L"Other",             L"Coding_Standards.md" },
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

// Migrate one skill within a root folder (docs/Skills or templates/skills):
// move a flat pre-0.2.4 copy into its category sub-folder, otherwise copy
// the file from the source when missing entirely. With apply=false this is
// a dry run that only reports what would happen.
static std::wstring migrateSkillAt(const fs::path& srcFile, const fs::path& root,
                                   const SkillEntry& sk, bool apply) {
    auto categorized = root / sk.category / sk.file;
    auto flat        = root / sk.file;

    if (fs::exists(categorized)) {
        // Never delete a flat duplicate — it may carry user edits.
        return fs::exists(flat) ? L"keep (flat duplicate left in place)" : L"keep";
    }
    if (fs::exists(flat)) {
        if (apply) {
            fs::create_directories(categorized.parent_path());
            fs::rename(flat, categorized);
        }
        return L"move into category";
    }
    if (fs::exists(srcFile)) {
        if (apply) {
            fs::create_directories(categorized.parent_path());
            fs::copy_file(srcFile, categorized);
        }
        return L"add";
    }
    return L"missing in source";
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
    appendLog(L"Skills (moved into category folders / added if missing):");
    for (auto& sk : kSkills) {
        auto from = src / L"docs" / L"Skills" / sk.category / sk.file;
        auto docsRoot = tgt / L"docs" / L"Skills";
        auto tplRoot  = tgt / L".ombutocode" / L"templates" / L"skills";
        std::wstring docsState = migrateSkillAt(from, docsRoot, sk, /*apply=*/false);
        std::wstring tplState  = migrateSkillAt(from, tplRoot,  sk, /*apply=*/false);
        appendLog(L"  [docs:" + docsState + L" / tpl:" + tplState + L"] "
                  + std::wstring(sk.category) + L"\\" + sk.file);
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

        // 4. Skills: move flat copies into category folders, add missing ones
        for (auto& sk : kSkills) {
            auto from = src / L"docs" / L"Skills" / sk.category / sk.file;
            auto docsRoot = tgt / L"docs" / L"Skills";
            auto tplRoot  = tgt / L".ombutocode" / L"templates" / L"skills";
            std::wstring docsState = migrateSkillAt(from, docsRoot, sk, /*apply=*/true);
            std::wstring tplState  = migrateSkillAt(from, tplRoot,  sk, /*apply=*/true);
            if (docsState != L"keep" || tplState != L"keep") {
                appendLog(L"Skill " + std::wstring(sk.category) + L"\\" + sk.file
                          + L"  [docs:" + docsState + L" / tpl:" + tplState + L"]");
            }
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
        appendLog(L"  2. Skills now live in category sub-folders under docs\\Skills\\ — your existing");
        appendLog(L"     skill files were moved automatically; custom skills stay where they are and");
        appendLog(L"     appear under the 'Other' category until you move them into a folder.");
        appendLog(L"  3. The requests database migrates itself on first launch (feature_ref -> epic_ref).");
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
