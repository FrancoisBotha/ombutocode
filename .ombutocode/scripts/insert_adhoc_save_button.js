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
    id: 'ADHOC-004',
    data: {
      title: 'Gateway: Fix save button not working on user edit screen',
      description: 'When editing a user on the Gateway admin user management screen, the save button does not seem to work. Investigate and fix the issue.',
      feature_ref: null,
      status: 'backlog',
      last_updated: '2026-03-28',
      dependencies: [],
      acceptance_criteria: [
        'Admin can edit a user on the Gateway user management screen',
        'Clicking save successfully updates the user',
        'Success message is shown after saving',
        'Error message is shown if save fails',
        'All user fields (email, roles, activated status) are saved correctly'
      ],
      eval_summary: null,
      files_touched: [],
      notes: 'DESIGN SPECIFICATION:\nInvestigate the user edit form in gateway/src/main/webapp/app/admin/user-management/. Check if the save method is calling the correct API endpoint. Check browser console for errors when clicking save. Common issues: validation errors preventing submission, API endpoint mismatch, or form submission not wired to the save handler.\nFiles to check: user-management-edit.component.ts, user-management-edit.vue, UserManagementService',
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
