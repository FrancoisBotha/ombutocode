const initSqlJs = require(require('path').join(__dirname, '..', 'src', 'node_modules', 'sql.js'));
const fs = require('fs');
const path = require('path');

async function main() {
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, '..', 'data', 'ombutocode.db');
  const buf = fs.readFileSync(dbPath);
  const db = new SQL.Database(buf);

  const maxSort = db.exec('SELECT MAX(sort_order) FROM backlog_tickets');
  let sortOrder = (maxSort[0].values[0][0] || 0) + 1;

  const tickets = [
    {
      id: 'FMSG-001',
      data: {
        title: 'Backend: Add FrontendMessage entity to mymed with Pushover notification',
        description: 'This ticket is part of feature FRONTEND_MESSAGE. Add the FrontendMessage entity and FrontendMessageStatus enum to the JDL file and run JHipster entity generation for mymed. This produces domain class, DTO, mapper, repository, service, resource, Liquibase changelog, and tests. After generation: make POST endpoint public (no auth), auto-set status to NEW on creation, wire PushoverService to send notification on new message.',
        feature_ref: '.ombutocode/features/feature_FRONTEND_MESSAGE.md',
        status: 'backlog',
        last_updated: '2026-03-26',
        dependencies: [],
        acceptance_criteria: [
          'FrontendMessage entity and FrontendMessageStatus enum added to JDL file',
          'JHipster entity generation run for mymed',
          'frontend_message table created via Liquibase with columns: id, sender_name, sender_email, subject, message, status, created_date',
          'POST /api/frontend-messages is publicly accessible (no auth required)',
          'POST auto-sets status to NEW regardless of client input',
          'POST auto-sets createdDate',
          'GET, PUT, DELETE endpoints require ROLE_ADMIN',
          'PushoverService.sendNotification called on new message with title "New Contact Message: {subject}"',
          'Pushover failure does not fail the message creation',
          'JHipster-generated integration tests pass',
          'All existing tests continue to pass'
        ],
        eval_summary: null,
        files_touched: [],
        notes: 'DESIGN SPECIFICATION:\n1. Add to JDL:\n   enum FrontendMessageStatus { NEW, READ, REPLIED, ARCHIVED }\n   entity FrontendMessage {\n     senderName String required maxlength(120)\n     senderEmail String required maxlength(120)\n     subject String required maxlength(255)\n     message String required maxlength(5000)\n     status FrontendMessageStatus required\n   }\n2. Run: jhipster import-jdl in mymed directory\n3. Post-generation:\n   - Remove @PreAuthorize from POST method in FrontendMessageResource\n   - In create method: override status to NEW, set createdDate\n   - Inject PushoverService, call sendNotification after save\n   - Make pushover call async (fire-and-forget)\n4. Run tests\nFiles created by generator: FrontendMessage.java, FrontendMessageDTO.java, FrontendMessageMapper.java, FrontendMessageRepository.java, FrontendMessageService.java, FrontendMessageResource.java, Liquibase changelog, tests\nFiles to modify: JDL file, FrontendMessageResource.java (public POST), FrontendMessageService.java (pushover call)',
        assignee: null,
        fail_count: 0,
        eval_fail_count: 0,
        agent: null
      }
    },
    {
      id: 'FMSG-002',
      data: {
        title: 'Gateway: Add FrontendMessage CRUD screens via JHipster entity generation',
        description: 'This ticket is part of feature FRONTEND_MESSAGE. Add FrontendMessage CRUD screens to the Gateway following JHipster patterns: list view, detail view, create/edit form, delete confirmation, routes, sidebar menu item, service provider registration.',
        feature_ref: '.ombutocode/features/feature_FRONTEND_MESSAGE.md',
        status: 'backlog',
        last_updated: '2026-03-26',
        dependencies: ['FMSG-001'],
        acceptance_criteria: [
          'FrontendMessage CRUD screens exist in Gateway (list, detail, create/edit)',
          'FrontendMessage appears in Gateway sidebar under Entities',
          'List view shows sender name, email, subject, status with sorting and pagination',
          'Detail view shows all fields including full message',
          'Create/Edit form allows setting all fields including status',
          'Delete confirmation works',
          'Routes registered in entities.ts',
          'Service provider registered in entities.component.ts',
          'Screens accessible to ROLE_ADMIN users'
        ],
        eval_summary: null,
        files_touched: [],
        notes: 'DESIGN SPECIFICATION:\nFollow the exact same pattern used for ListingRequest CRUD screens (LISTREQ-003).\nCreate:\n- frontend-message.model.ts (interface + class)\n- frontend-message-status.model.ts (enum)\n- frontend-message.service.ts (axios CRUD)\n- frontend-message.component.ts + .vue (list with pagination)\n- frontend-message-details.component.ts + .vue (detail view)\n- frontend-message-update.component.ts + .vue (create/edit form with Vuelidate)\nModify:\n- entities.ts (routes)\n- entities.component.ts (service provider)\n- entities-menu.vue (dropdown item)\n- jhi-navbar.vue (sidebar item)',
        assignee: null,
        fail_count: 0,
        eval_fail_count: 0,
        agent: null
      }
    },
    {
      id: 'FMSG-003',
      data: {
        title: 'Frontend: Create Contact Us page wired to FrontendMessage API',
        description: 'This ticket is part of feature FRONTEND_MESSAGE. Create the /contact page on the patient-facing Nuxt frontend with a form (name, email, subject, message). On submit, POST to /services/mymed/api/frontend-messages. Show success state on 201, error state on failure. No authentication required.',
        feature_ref: '.ombutocode/features/feature_FRONTEND_MESSAGE.md',
        status: 'backlog',
        last_updated: '2026-03-26',
        dependencies: ['FMSG-001'],
        acceptance_criteria: [
          '/contact page exists with form fields: name, email, subject, message',
          'Form validates required fields before submission',
          'On submit, POSTs to backend API (frontend-messages endpoint)',
          'On 201 response, shows thank-you/success message',
          'On error, shows error message to user',
          'Loading state shown during API call',
          'Page follows existing frontend design system',
          'Page is SSR-rendered for SEO',
          'Footer links to /contact page',
          'No authentication required'
        ],
        eval_summary: null,
        files_touched: [],
        notes: 'DESIGN SPECIFICATION:\n1. Create frontend/pages/contact.vue\n2. Form fields: senderName, senderEmail, subject, message (textarea)\n3. On submit: validate all required, then POST to API\n4. Check Nuxt proxy config for /api routing\n5. Success state: replace form with thank-you message\n6. Error state: show inline error alert\n7. Style using existing CSS variables and design patterns\n8. Ensure footer component links to /contact\nFiles to create: frontend/pages/contact.vue\nFiles to modify: footer component (add /contact link if not already present from ADHOC-001)',
        assignee: null,
        fail_count: 0,
        eval_fail_count: 0,
        agent: null
      }
    }
  ];

  const stmt = db.prepare('INSERT INTO backlog_tickets (id, sort_order, data) VALUES (?, ?, ?)');
  for (const t of tickets) {
    stmt.run([t.id, sortOrder++, JSON.stringify(t.data)]);
    console.log('Inserted:', t.id);
  }
  stmt.free();

  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  console.log('Database saved.');
}
main().catch(console.error);
