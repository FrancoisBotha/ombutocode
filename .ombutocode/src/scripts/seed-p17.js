const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function main() {
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, '..', '..', 'data', 'ombutocode.db');
  const buf = fs.readFileSync(dbPath);
  const db = new SQL.Database(buf);

  const maxSort = db.exec('SELECT MAX(sort_order) FROM backlog_tickets');
  let sortOrder = (maxSort[0].values[0][0] || 0) + 1;

  const epic_ref = 'docs/Epics/epic_P17_MAC_PORT.md';
  const today = '2026-03-13';

  const tickets = [
    {
      id: 'JMAIL-300',
      title: 'Extend JeffAiMailViewModel with full IPC method coverage',
      description: 'This ticket is part of feature P17_MAC_PORT, which ports the Windows app to native macOS SwiftUI.\n\nExtend JeffAiMailViewModel.swift with async methods for all IPC capabilities used by the Windows app: accounts (list, add_oauth, add_manual, remove, test), sync (folders, headers), browse (list, list_by_account, list_by_category, get, groups), bulk (execute), search (query), analytics (compute), ai (classify, classify_status, reclassify), delete_queue (create, start, pause, cancel, list, status, items), subscriptions (list). Each method should use MessageHandler to send NDJSON calls and return typed results.',
      dependencies: [],
      acceptance_criteria: [
        'JeffAiMailViewModel exposes async methods for all IPC capabilities listed',
        'Methods use MessageHandler for NDJSON communication',
        'Return types are Swift structs matching the NDJSON response schemas',
        'Compiles without errors in Xcode'
      ],
      notes: 'DESIGN SPECIFICATION:\nExtend existing JeffAiMailViewModel.swift. Follow the pattern already established for demo calls.\nAdd Swift Codable structs for request params and response data for each capability.\nGroup methods logically (accounts, sync, browse, bulk, search, analytics, ai, deleteQueue, subscriptions).\nFiles to modify: mac/JeffAiMail/Views/JeffAiMailViewModel.swift\nFiles to create: mac/JeffAiMail/Models/IPCModels.swift (shared Codable structs)'
    },
    {
      id: 'JMAIL-301',
      title: 'Build macOS sidebar navigation with all menu items',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nReplace the existing SidebarView.swift with a full sidebar matching the Windows app menu structure: Inbox, Analytics, Bulk Cleanup, Trash, Delete Queue, Search, Subscriptions, History, Settings, Help, About. Use NavigationSplitView with sidebar, content, and detail columns.',
      dependencies: ['JMAIL-300'],
      acceptance_criteria: [
        'SidebarView shows all 11 menu items with appropriate SF Symbols icons',
        'Navigation selection routes to the correct view',
        'Active item is visually highlighted',
        'Sidebar supports collapse/expand',
        'App title shows "Oshili" in sidebar header'
      ],
      notes: 'DESIGN SPECIFICATION:\nRewrite SidebarView.swift and ContentView.swift. Use NavigationSplitView with a List in the sidebar column.\nUse an enum for navigation destinations. Each destination maps to a view in the content column.\nSF Symbol mappings: Inbox=tray, Analytics=chart.bar, Bulk Cleanup=paintbrush, Trash=trash, Delete Queue=list.bullet.clipboard, Search=magnifyingglass, Subscriptions=newspaper, History=clock, Settings=gear, Help=questionmark.circle, About=info.circle.\nFiles to modify: mac/JeffAiMail/Views/SidebarView.swift, mac/JeffAiMail/Views/ContentView.swift\nFiles to create: mac/JeffAiMail/Views/NavigationDestination.swift'
    },
    {
      id: 'JMAIL-302',
      title: 'Account list view with sync status and folder counts',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nCreate an AccountsListView showing all connected email accounts with display name, email, sync status, folder count, and message count. Include a toolbar button to add a new account.',
      dependencies: ['JMAIL-301'],
      acceptance_criteria: [
        'AccountsListView displays all accounts from accounts.list IPC call',
        'Each row shows display name, email, status badge, folder/message counts',
        'Add Account button is present in toolbar',
        'Loading and empty states handled'
      ],
      notes: 'DESIGN SPECIFICATION:\nCreate a new SwiftUI view. Use List with ForEach. Call viewModel.listAccounts() on .task modifier.\nFiles to create: mac/JeffAiMail/Views/Accounts/AccountsListView.swift'
    },
    {
      id: 'JMAIL-303',
      title: 'Account setup flow with OAuth2 and manual IMAP',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nImplement the account setup sheet with two paths: OAuth2 (Gmail, Outlook, Yahoo) which opens the system browser for authorization, and manual IMAP configuration with host, port, username, password, and self-signed certificate toggle.',
      dependencies: ['JMAIL-302'],
      acceptance_criteria: [
        'OAuth2 flow opens system browser via accounts.oauth_start and completes via accounts.add_oauth',
        'Manual IMAP form validates required fields before submission',
        'Self-signed certificate toggle available for manual IMAP',
        'Success dismisses sheet and refreshes account list',
        'Error states display with retry option'
      ],
      notes: 'DESIGN SPECIFICATION:\nUse .sheet modifier from AccountsListView. Present a Form with picker for provider type.\nOAuth: call accounts.oauth_start to get auth URL, open via NSWorkspace.shared.open(url), then poll or wait for callback.\nManual: form fields for host, port, username, password, use_ssl, accept_self_signed.\nFiles to create: mac/JeffAiMail/Views/Accounts/AccountSetupView.swift'
    },
    {
      id: 'JMAIL-304',
      title: 'Account detail view with sync and folder management',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nCreate an account detail view showing folders with message/unread counts, sync button with progress, edit credentials, and remove account with confirmation.',
      dependencies: ['JMAIL-303'],
      acceptance_criteria: [
        'Account detail shows folder list with message and unread counts',
        'Sync button triggers sync.folders then sync.headers with progress display',
        'Remove account shows confirmation dialog before calling accounts.remove',
        'Folder list refreshes after sync completes'
      ],
      notes: 'DESIGN SPECIFICATION:\nCreate AccountDetailView.swift. Use Form sections for account info, folders, and danger zone (remove).\nSync progress via stream events from sync.headers.\nFiles to create: mac/JeffAiMail/Views/Accounts/AccountDetailView.swift'
    },
    {
      id: 'JMAIL-305',
      title: 'Inbox message list with folder picker and pagination',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nCreate the inbox view with an account/folder picker in the toolbar, a scrollable message list with sender, subject, date, and unread indicators, and pagination controls. Subject should be bold only when unread.',
      dependencies: ['JMAIL-301'],
      acceptance_criteria: [
        'Account picker and folder picker in toolbar',
        'Message list shows sender (normal weight), subject (bold if unread, normal if read), date',
        'Unread messages have visual indicator',
        'Pagination with page size selector',
        'Selecting a message highlights it in the list',
        'Loading, error, and empty states handled'
      ],
      notes: 'DESIGN SPECIFICATION:\nUse NavigationSplitView content column. Toolbar with Picker for account and folder.\nList with ForEach for messages. Call browse.list with folder_id, limit, offset.\nFiles to create: mac/JeffAiMail/Views/Inbox/InboxView.swift, mac/JeffAiMail/Views/Inbox/MessageRowView.swift'
    },
    {
      id: 'JMAIL-306',
      title: 'Message detail view with HTML rendering',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nCreate the message detail panel showing headers (from, to, date, subject) and body content. HTML bodies rendered via WKWebView (NSViewRepresentable wrapper). Plain text fallback for non-HTML messages.',
      dependencies: ['JMAIL-305'],
      acceptance_criteria: [
        'Detail view shows from, to, date, subject headers',
        'HTML body renders correctly via WKWebView',
        'Plain text body displays in scrollable text view',
        'Loading state while fetching body via browse.get',
        'Empty state when no message selected'
      ],
      notes: 'DESIGN SPECIFICATION:\nUse detail column of NavigationSplitView or .inspector modifier.\nCreate WebView wrapper using NSViewRepresentable + WKWebView.\nFiles to create: mac/JeffAiMail/Views/Inbox/MessageDetailView.swift, mac/JeffAiMail/Views/Shared/WebView.swift'
    },
    {
      id: 'JMAIL-307',
      title: 'Classification trigger with progress modal',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nAdd a Classify button to the inbox toolbar that triggers ai.classify and shows a modal with staged progress (preparing, loading model, classifying with progress bar, completed).',
      dependencies: ['JMAIL-305'],
      acceptance_criteria: [
        'Classify button in inbox toolbar',
        'Modal sheet shows during classification with stage labels',
        'Progress bar updates during classifying stage via stream events',
        'Completion shows checkmark then auto-dismisses',
        'Toast/notification on completion'
      ],
      notes: 'DESIGN SPECIFICATION:\nAdd toolbar button. Use .sheet for progress modal. Subscribe to stream events from ai.classify for progress updates.\nStages: preparing -> counted -> loading_model -> model_ready -> classifying -> completed.\nFiles to create: mac/JeffAiMail/Views/Inbox/ClassificationProgressView.swift\nFiles to modify: mac/JeffAiMail/Views/Inbox/InboxView.swift'
    },
    {
      id: 'JMAIL-308',
      title: 'Category pills and suggestion pills with filtering',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nAdd category pill buttons below the inbox toolbar (newsletter, notification, transactional, etc.) that filter messages by classification. Add suggestion pills from ai.classify_status. Clicking a pill loads filtered messages via browse.list_by_category.',
      dependencies: ['JMAIL-307'],
      acceptance_criteria: [
        'Category pills shown with counts from ai.classify_status',
        'Clicking a pill filters the message list to that category',
        'Active pill is visually highlighted',
        'Clicking active pill clears filter',
        'Pill counts update after bulk delete operations'
      ],
      notes: 'DESIGN SPECIFICATION:\nHorizontal ScrollView with pill buttons. Use ai.classify_status to get category breakdown.\nCall browse.list_by_category when a pill is tapped.\nFiles to modify: mac/JeffAiMail/Views/Inbox/InboxView.swift\nFiles to create: mac/JeffAiMail/Views/Inbox/CategoryPillsView.swift'
    },
    {
      id: 'JMAIL-309',
      title: 'Inbox bulk selection and action bar',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nAdd multi-selection support to the inbox message list with select-all, and a bulk action bar (Trash, Move, Delete) with confirmation dialogs. When viewing a Trash folder, disable all actions and show a notice directing to the Trash view.',
      dependencies: ['JMAIL-306'],
      acceptance_criteria: [
        'Multi-selection via checkboxes or Shift/Cmd+click',
        'Select all checkbox in list header',
        'Bulk action bar appears when messages are selected: Trash, Move, Delete',
        'Trash action calls bulk.execute with operation trash',
        'Delete confirmation dialog for permanent delete',
        'Trash folder detection disables actions and shows notice',
        'Selection clears after successful action'
      ],
      notes: 'DESIGN SPECIFICATION:\nUse List selection binding with Set<String>. Show toolbar items conditionally when selection is non-empty.\nTrash folder detection: check folder_type == "trash" or name matches trash patterns.\nFiles to modify: mac/JeffAiMail/Views/Inbox/InboxView.swift\nFiles to create: mac/JeffAiMail/Views/Inbox/BulkActionBarView.swift'
    },
    {
      id: 'JMAIL-310',
      title: 'Inbox search with local and IMAP modes',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nAdd search functionality to the inbox using SwiftUI .searchable modifier. Support local search (FTS5 via search.query) and IMAP search modes with a toggle.',
      dependencies: ['JMAIL-305'],
      acceptance_criteria: [
        'Search bar appears via .searchable modifier',
        'Local search queries search.query with mode=local',
        'IMAP search queries search.query with mode=imap',
        'Search results replace message list with result count',
        'Clear search restores original folder view'
      ],
      notes: 'DESIGN SPECIFICATION:\nUse .searchable modifier on the NavigationSplitView content. Add a Picker for search mode (local/imap).\nDebounce search input (300ms) before calling search.query.\nFiles to modify: mac/JeffAiMail/Views/Inbox/InboxView.swift'
    },
    {
      id: 'JMAIL-311',
      title: 'Bulk Cleanup view with sender/domain grouping',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nCreate the Bulk Cleanup view showing email groups by sender or domain for the selected account. Groups display count, total size, and are sortable. Include a text filter for narrowing groups.',
      dependencies: ['JMAIL-301'],
      acceptance_criteria: [
        'View shows groups from browse.groups IPC call',
        'Toggle between sender and domain grouping',
        'Groups show sender/domain name, message count, total size',
        'Sort by count, size, or name',
        'Text filter narrows displayed groups',
        'Account picker in toolbar'
      ],
      notes: 'DESIGN SPECIFICATION:\nCreate BulkCleanupView. Use List with disclosure groups. Call browse.groups with group_by param.\nFiles to create: mac/JeffAiMail/Views/BulkCleanup/BulkCleanupView.swift, mac/JeffAiMail/Views/BulkCleanup/GroupRowView.swift'
    },
    {
      id: 'JMAIL-312',
      title: 'Bulk Cleanup group detail and bulk actions',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nExpand groups to show individual messages with selection. Add bulk action bar for trash/move/delete with progress tracking via bulk.execute.',
      dependencies: ['JMAIL-311'],
      acceptance_criteria: [
        'Expanding a group loads and displays its messages',
        'Per-message and select-all-in-group checkboxes',
        'Bulk action bar (Trash, Move, Delete) with confirmation',
        'Progress tracking during bulk operations',
        'Group refreshes after operation completes'
      ],
      notes: 'DESIGN SPECIFICATION:\nExpanded group calls browse.list_by_account with from_address filter.\nReuse BulkActionBarView from inbox. Progress via sheet with ProgressView.\nFiles to modify: mac/JeffAiMail/Views/BulkCleanup/BulkCleanupView.swift\nFiles to create: mac/JeffAiMail/Views/BulkCleanup/GroupDetailView.swift'
    },
    {
      id: 'JMAIL-313',
      title: 'Trash view with sync-on-navigate and message management',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nCreate the Trash view showing messages in the Trash folder with grouping (none/sender/domain), sorting, filtering, and pagination. Force re-sync of the Trash folder via sync.headers when navigating to this view.',
      dependencies: ['JMAIL-301'],
      acceptance_criteria: [
        'Trash folder synced from IMAP on view appear',
        'Messages displayed with sender, subject, date, size',
        'Group by none/sender/domain toggle',
        'Sort by date/size',
        'Subject text filter',
        'Older-than date filter',
        'Syncing indicator shown during sync'
      ],
      notes: 'DESIGN SPECIFICATION:\nCreate TrashView. On .task, call sync.headers for the trash folder, then load messages via browse.list.\nFind trash folder by folder_type == "trash" or name matching trash patterns.\nFiles to create: mac/JeffAiMail/Views/Trash/TrashView.swift'
    },
    {
      id: 'JMAIL-314',
      title: 'Trash permanent delete with delete queue routing',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nAdd permanent delete functionality to the Trash view. Selections > 1 message route through the delete queue (delete_queue.create + delete_queue.start). Include typed "delete" confirmation dialog for permanent deletes.',
      dependencies: ['JMAIL-313'],
      acceptance_criteria: [
        'Multi-selection with select-all support',
        'Permanent delete button with typed "delete" confirmation',
        'Batches > 1 message route to delete queue',
        'Single message uses direct bulk.execute with operation delete',
        'Success toast and list refresh after completion'
      ],
      notes: 'DESIGN SPECIFICATION:\nAdd selection binding to TrashView list. Permanent delete calls delete_queue.create then delete_queue.start.\nConfirmation dialog uses .alert with TextField for typing "delete".\nFiles to modify: mac/JeffAiMail/Views/Trash/TrashView.swift'
    },
    {
      id: 'JMAIL-315',
      title: 'Delete Queue view with job list and progress tracking',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nCreate the Delete Queue view showing all delete jobs with status badges, progress bars, and action buttons (pause/resume/cancel). Selecting a job shows its items with per-item status.',
      dependencies: ['JMAIL-301'],
      acceptance_criteria: [
        'Job list from delete_queue.list with status badges',
        'Progress bar showing verified/total for each job',
        'Pause/resume/cancel buttons per job',
        'Job detail shows items with status (pending/submitted/verified/failed)',
        'Filter tabs: All, Pending, Verified, Failed',
        'Auto-refresh via stream events'
      ],
      notes: 'DESIGN SPECIFICATION:\nCreate DeleteQueueView with NavigationSplitView: job list in content, item list in detail.\nCall delete_queue.list on appear. Subscribe to stream events for real-time progress.\nFiles to create: mac/JeffAiMail/Views/DeleteQueue/DeleteQueueView.swift, mac/JeffAiMail/Views/DeleteQueue/JobRowView.swift, mac/JeffAiMail/Views/DeleteQueue/JobDetailView.swift'
    },
    {
      id: 'JMAIL-316',
      title: 'Dashboard stat cards and account selector',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nCreate the Dashboard/Analytics view with stat cards (Total Emails, Storage Used, Unread Count) and an account picker. Data loaded via analytics.compute.',
      dependencies: ['JMAIL-301'],
      acceptance_criteria: [
        'Three stat cards displayed: total emails, storage used, unread count',
        'Account picker filters analytics to selected account',
        'All Accounts option aggregates across accounts',
        'Loading skeleton while computing'
      ],
      notes: 'DESIGN SPECIFICATION:\nCreate DashboardView. Use LazyVGrid with stat card views. Call analytics.compute on appear and on account change.\nFiles to create: mac/JeffAiMail/Views/Dashboard/DashboardView.swift, mac/JeffAiMail/Views/Dashboard/StatCardView.swift'
    },
    {
      id: 'JMAIL-317',
      title: 'Dashboard charts with Swift Charts',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nAdd charts to the dashboard: top senders bar chart (by count/size toggle), category breakdown pie/bar chart, activity heatmap, and folder size breakdown. Use Swift Charts framework.',
      dependencies: ['JMAIL-316'],
      acceptance_criteria: [
        'Top senders bar chart with count/size toggle',
        'Category breakdown chart',
        'Activity heatmap (custom Canvas or Grid if Swift Charts lacks heatmap)',
        'Folder size breakdown chart',
        'Charts update when account selection changes'
      ],
      notes: 'DESIGN SPECIFICATION:\nUse Swift Charts (import Charts) for bar and pie charts. Heatmap may need custom Canvas drawing.\nFiles to modify: mac/JeffAiMail/Views/Dashboard/DashboardView.swift\nFiles to create: mac/JeffAiMail/Views/Dashboard/TopSendersChart.swift, mac/JeffAiMail/Views/Dashboard/CategoryChart.swift, mac/JeffAiMail/Views/Dashboard/HeatmapView.swift, mac/JeffAiMail/Views/Dashboard/FolderSizeChart.swift'
    },
    {
      id: 'JMAIL-318',
      title: 'Dashboard Analyse button with classification integration',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nAdd an Analyse button to the dashboard toolbar that triggers ai.classify with a progress modal (same as inbox classification), then refreshes analytics data on completion.',
      dependencies: ['JMAIL-316', 'JMAIL-307'],
      acceptance_criteria: [
        'Analyse button in dashboard toolbar',
        'Triggers ai.classify with progress modal',
        'Analytics data refreshes after classification completes',
        'Success toast on completion'
      ],
      notes: 'DESIGN SPECIFICATION:\nReuse ClassificationProgressView from inbox. Add toolbar button to DashboardView.\nAfter classification completes, re-call analytics.compute to refresh charts.\nFiles to modify: mac/JeffAiMail/Views/Dashboard/DashboardView.swift'
    },
    {
      id: 'JMAIL-319',
      title: 'Dedicated Search view',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nCreate a dedicated Search view with query input, mode toggle (local/IMAP), account/folder scope, and paginated results with message detail on selection.',
      dependencies: ['JMAIL-301'],
      acceptance_criteria: [
        'Search input with submit action',
        'Local and IMAP mode toggle',
        'Account and folder scope pickers',
        'Results list with sender, subject, date, snippet',
        'Selecting a result shows message detail',
        'Result count displayed'
      ],
      notes: 'DESIGN SPECIFICATION:\nCreate SearchView. Use Form for search controls, List for results.\nCall search.query with mode, account_id, folder_id, query params.\nFiles to create: mac/JeffAiMail/Views/Search/SearchView.swift'
    },
    {
      id: 'JMAIL-320',
      title: 'Subscription Audit view',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nCreate the Subscription Audit view showing detected subscriptions with sender, message count, last opened, and open rate. Include Analyse Subscriptions button, inactive filter toggle, and actions.',
      dependencies: ['JMAIL-301'],
      acceptance_criteria: [
        'Subscription table with sortable columns: sender, count, last opened, open rate',
        'Analyse Subscriptions button triggers subscriptions.list',
        'Show only inactive toggle (not opened in 90+ days)',
        'Pagination for large lists',
        'Loading and empty states'
      ],
      notes: 'DESIGN SPECIFICATION:\nCreate SubscriptionAuditView. Use Table (macOS 13+) for sortable columns.\nCall subscriptions.list on button click.\nFiles to create: mac/JeffAiMail/Views/Subscriptions/SubscriptionAuditView.swift'
    },
    {
      id: 'JMAIL-321',
      title: 'Settings view with app preferences',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nCreate the Settings view using SwiftUI Form with sections for appearance (theme), notifications, and model management (ONNX/GGUF model status and download).',
      dependencies: ['JMAIL-301'],
      acceptance_criteria: [
        'Settings form with grouped sections',
        'Appearance section with dark/light/system theme picker',
        'Model management section showing model status',
        'Settings persisted via UserDefaults or AppStorage'
      ],
      notes: 'DESIGN SPECIFICATION:\nRewrite existing SettingsView.swift. Use Form with Section groups. Use @AppStorage for persistence.\nFiles to modify: mac/JeffAiMail/Views/SettingsView.swift'
    },
    {
      id: 'JMAIL-322',
      title: 'History, Help, and About views',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nCreate History view (past operations log), Help view (keyboard shortcuts and feature docs), and About view (version info, credits).',
      dependencies: ['JMAIL-301'],
      acceptance_criteria: [
        'History view shows past bulk operations with timestamps',
        'Help view lists keyboard shortcuts and feature descriptions',
        'About view shows app name (Oshili Mail Organiser), version, and credits',
        'All three views are accessible from sidebar navigation'
      ],
      notes: 'DESIGN SPECIFICATION:\nCreate HistoryView.swift, HelpView.swift. Rewrite existing AboutView.swift.\nFiles to create: mac/JeffAiMail/Views/History/HistoryView.swift, mac/JeffAiMail/Views/Help/HelpView.swift\nFiles to modify: mac/JeffAiMail/Views/AboutView.swift'
    },
    {
      id: 'JMAIL-323',
      title: 'App branding — Oshili icon, name, and theme',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nUpdate the macOS app branding: app name to "Oshili Mail Organiser", add app icon to Assets.xcassets, update Info.plist bundle display name, and ensure Theme.swift respects system dark/light mode.',
      dependencies: ['JMAIL-301'],
      acceptance_criteria: [
        'App icon set in Assets.xcassets (all required sizes)',
        'Bundle display name is "Oshili Mail Organiser"',
        'Sidebar header shows "Oshili"',
        'Theme adapts to system dark/light mode',
        'Window title shows "Oshili Mail Organiser"'
      ],
      notes: 'DESIGN SPECIFICATION:\nUpdate Info.plist CFBundleDisplayName and CFBundleName.\nAdd AppIcon to Assets.xcassets. Update Theme.swift to use @Environment(\\.colorScheme).\nFiles to modify: mac/JeffAiMail/Resources/Info.plist, mac/JeffAiMail/Views/Theme.swift, mac/JeffAiMail/Views/SidebarView.swift'
    },
    {
      id: 'JMAIL-324',
      title: 'Loading, error, and empty states audit across all views',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nAudit all macOS views for proper loading states (ProgressView), error states (with retry), and empty states (ContentUnavailableView). Ensure consistent UX.',
      dependencies: ['JMAIL-305', 'JMAIL-311', 'JMAIL-313', 'JMAIL-315', 'JMAIL-316', 'JMAIL-319', 'JMAIL-320'],
      acceptance_criteria: [
        'All list views show ProgressView while loading',
        'All IPC errors display error message with retry button',
        'All empty lists show ContentUnavailableView with appropriate icon and message',
        'Consistent styling across all views'
      ],
      notes: 'DESIGN SPECIFICATION:\nCreate shared components: LoadingView, ErrorView, EmptyStateView.\nAudit each view and replace ad-hoc states with shared components.\nFiles to create: mac/JeffAiMail/Views/Shared/LoadingView.swift, mac/JeffAiMail/Views/Shared/ErrorView.swift, mac/JeffAiMail/Views/Shared/EmptyStateView.swift'
    },
    {
      id: 'JMAIL-325',
      title: 'Code signing, notarization, and DMG packaging',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nConfigure Xcode project for code signing with Developer ID certificate, enable Hardened Runtime, set up notarization via notarytool, and create DMG packaging script.',
      dependencies: ['JMAIL-323'],
      acceptance_criteria: [
        'Xcode project configured for Developer ID code signing',
        'Hardened Runtime enabled',
        'App Sandbox entitlements include network (outgoing), file access (user-selected)',
        'Notarization script using notarytool succeeds',
        'DMG creation script produces installable disk image',
        'Codesign validation passes in CoreBridge'
      ],
      notes: 'DESIGN SPECIFICATION:\nUpdate Entitlements.plist with required sandbox permissions.\nCreate scripts/package-macos.sh for DMG creation using create-dmg or hdiutil.\nCreate scripts/notarize-macos.sh for notarytool submission.\nFiles to modify: mac/JeffAiMail/Resources/Entitlements.plist, mac/JeffAiMail.xcodeproj/project.pbxproj\nFiles to create: scripts/package-macos.sh, scripts/notarize-macos.sh'
    },
    {
      id: 'JMAIL-326',
      title: 'Universal binary build script and CI integration',
      description: 'This ticket is part of feature P17_MAC_PORT.\n\nUpdate the macOS build script to produce a universal binary (arm64 + x86_64) for the Rust core sidecar. Ensure the Xcode build phase copies the correct binary into the app bundle.',
      dependencies: ['JMAIL-325'],
      acceptance_criteria: [
        'scripts/build-core-macos.sh produces universal binary via lipo',
        'Xcode Run Script phase copies binary to Contents/Resources/',
        'App launches correctly on both Apple Silicon and Intel Macs',
        'Build process documented in README or CONTRIBUTING.md'
      ],
      notes: 'DESIGN SPECIFICATION:\nUpdate existing scripts/build-core-macos.sh. Build for aarch64-apple-darwin and x86_64-apple-darwin targets, combine with lipo.\nVerify Xcode project Run Script build phase references correct binary path.\nFiles to modify: scripts/build-core-macos.sh, mac/JeffAiMail.xcodeproj/project.pbxproj'
    }
  ];

  const stmt = db.prepare('INSERT INTO backlog_tickets (id, sort_order, data) VALUES (?, ?, ?)');

  for (const t of tickets) {
    const data = {
      title: t.title,
      description: t.description,
      epic_ref: epic_ref,
      status: 'backlog',
      last_updated: today,
      dependencies: t.dependencies,
      acceptance_criteria: t.acceptance_criteria,
      notes: t.notes,
      fail_count: 0,
      eval_fail_count: 0,
      files_touched: [],
      assignee: null,
      agent: null,
      eval_summary: null,
      test_summary: null
    };
    stmt.run([t.id, sortOrder++, JSON.stringify(data)]);
    console.log('Created:', t.id, '-', t.title);
  }
  stmt.free();

  const outBuf = db.export();
  fs.writeFileSync(dbPath, Buffer.from(outBuf));
  console.log('\nDone. Total tickets now:', db.exec('SELECT count(*) FROM backlog_tickets')[0].values[0][0]);
  db.close();
}
main().catch(console.error);
