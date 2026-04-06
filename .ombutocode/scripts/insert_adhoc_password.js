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
    id: 'ADHOC-002',
    data: {
      title: 'Gateway: Add change password functionality for logged-in admin users',
      description: 'On the Gateway admin screen, logged-in users should be able to change their own password. JHipster generates a password change page by default at /account/password, but it may not be wired up or accessible from the admin sidebar. Ensure the change password page is functional and accessible from the admin UI.',
      feature_ref: null,
      status: 'backlog',
      last_updated: '2026-03-28',
      dependencies: [],
      acceptance_criteria: [
        'Logged-in admin user can navigate to a change password page from the admin UI',
        'Change password form requires current password, new password, and confirmation',
        'Password is updated via the existing JHipster /api/account/change-password endpoint',
        'Success message shown after password change',
        'Error message shown if current password is wrong or new passwords do not match',
        'Menu item or link is accessible from the admin sidebar or user menu'
      ],
      eval_summary: null,
      files_touched: [],
      notes: 'DESIGN SPECIFICATION:\nJHipster generates password change functionality by default. Check if /account/password route and component exist in the Gateway. If they exist, ensure they are accessible from the sidebar or top-right user menu. If the route/component is missing, create it following the existing JHipster account components pattern.\nFiles to check: gateway/src/main/webapp/app/account/change-password/, gateway/src/main/webapp/app/core/jhi-navbar/jhi-navbar.vue (user menu), gateway/src/main/webapp/app/router/account.ts',
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
