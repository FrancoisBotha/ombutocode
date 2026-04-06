const initSqlJs = require(require('path').join(__dirname, '..', 'src', 'node_modules', 'sql.js'));
const fs = require('fs');
const path = require('path');

async function main() {
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, '..', 'data', 'ombutocode.db');
  const buf = fs.readFileSync(dbPath);
  const db = new SQL.Database(buf);

  const maxSort = db.exec('SELECT MAX(sort_order) FROM backlog_tickets');
  const sortOrder = (maxSort[0].values[0][0] || 0) + 1;

  const ticket = {
    id: 'ADHOC-003',
    data: {
      title: 'Practice Portal: Add change password functionality for logged-in users',
      description: 'On the Practice Portal, logged-in practice users should be able to change their own password. Add a change password page or modal accessible from the portal UI (e.g. settings or user menu). Should call the Gateway /api/account/change-password endpoint.',
      feature_ref: null,
      status: 'backlog',
      last_updated: '2026-03-28',
      dependencies: [],
      acceptance_criteria: [
        'Logged-in practice user can navigate to a change password page or modal',
        'Change password form requires current password, new password, and confirmation',
        'Password is updated via the Gateway /api/account/change-password endpoint',
        'Success message shown after password change',
        'Error message shown if current password is wrong or new passwords do not match',
        'Accessible from the practice portal sidebar, settings page, or user menu'
      ],
      eval_summary: null,
      files_touched: [],
      notes: 'DESIGN SPECIFICATION:\nCreate a ChangePasswordView.vue in frontend-practice/src/views/ or a ChangePasswordModal component. Add a route /settings or /change-password. Add a menu item in the sidebar. Call POST /api/account/change-password with { currentPassword, newPassword } via the practice portal API client (which proxies through the gateway).\nFiles to create: frontend-practice/src/views/ChangePasswordView.vue (or modal component)\nFiles to modify: frontend-practice/src/router/index.ts, sidebar/nav component',
      assignee: null,
      fail_count: 0,
      eval_fail_count: 0,
      agent: null
    }
  };

  db.run('INSERT INTO backlog_tickets (id, sort_order, data) VALUES (?, ?, ?)',
    [ticket.id, sortOrder, JSON.stringify(ticket.data)]);
  console.log('Inserted:', ticket.id);

  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  console.log('Database saved.');
}
main().catch(console.error);
