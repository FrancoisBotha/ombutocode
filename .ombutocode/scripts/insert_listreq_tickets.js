const initSqlJs = require(require('path').join(__dirname, '..', 'src', 'node_modules', 'sql.js'));
const fs = require('fs');
const path = require('path');

async function main() {
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, '..', 'data', 'ombutocode.db');
  const buf = fs.readFileSync(dbPath);
  const db = new SQL.Database(buf);

  // Get max sort_order
  const maxSort = db.exec('SELECT MAX(sort_order) FROM backlog_tickets');
  let sortOrder = (maxSort[0].values[0][0] || 0) + 1;

  const tickets = [
    {
      id: 'LISTREQ-001',
      data: {
        title: 'Backend: Add ListingRequest entity to mymed via JHipster JDL generation',
        description: 'This ticket is part of feature LISTING_REQUEST. Add the ListingRequest entity and ListingRequestStatus enum to the JDL file and run JHipster entity generation for the mymed microservice. This produces the domain class, DTO, mapper, repository, service, REST resource, Liquibase changelog, and integration tests. After generation, customise the POST endpoint to be publicly accessible (no auth) and auto-set status to NEW on creation.',
        feature_ref: '.ombutocode/features/feature_LISTING_REQUEST.md',
        status: 'backlog',
        last_updated: '2026-03-26',
        dependencies: [],
        acceptance_criteria: [
          'ListingRequest entity and ListingRequestStatus enum added to JDL file',
          'JHipster entity generation run successfully for mymed microservice',
          'listing_request table created via Liquibase changelog with columns: id, practice_name, contact_name, email, phone, message, status, created_date, last_modified_date',
          'ListingRequest domain class, DTO, mapper, repository, service, and resource exist following JHipster conventions',
          'POST /api/listing-requests is publicly accessible (no authentication required)',
          'POST auto-sets status to NEW regardless of client input',
          'POST auto-sets createdDate and lastModifiedDate',
          'GET, PUT, DELETE endpoints require ROLE_ADMIN authority',
          'JHipster-generated integration tests for ListingRequestResource pass',
          'All existing tests continue to pass'
        ],
        eval_summary: null,
        files_touched: [],
        notes: 'DESIGN SPECIFICATION:\n1. Add to JDL file (mymed.jdl or equivalent):\n   enum ListingRequestStatus { NEW, COMPLETE, CANCEL }\n   entity ListingRequest {\n     practiceName String required maxlength(120)\n     contactName String required maxlength(120)\n     email String required maxlength(120)\n     phone String required maxlength(30)\n     message String maxlength(2000)\n     status ListingRequestStatus required\n   }\n2. Run: jhipster import-jdl <file> --force (in mymed directory)\n3. Post-generation customisations:\n   - In ListingRequestResource.java: remove @PreAuthorize from createListingRequest (POST), keep it on all other methods\n   - In ListingRequestService.java or Resource: override status to NEW and set timestamps in the create method\n   - Add AbstractAuditingEntity or manual createdDate/lastModifiedDate if not generated\n4. Review Liquibase changelog for correctness\n5. Run tests: ./mvnw verify\nFiles created by generator: ListingRequest.java, ListingRequestDTO.java, ListingRequestMapper.java, ListingRequestRepository.java, ListingRequestService.java, ListingRequestResource.java, Liquibase changelog XML, ListingRequestResourceIT.java\nFiles to modify: JDL file, possibly SecurityConfiguration if needed for public POST',
        assignee: null,
        fail_count: 0,
        eval_fail_count: 0,
        agent: null
      }
    },
    {
      id: 'LISTREQ-002',
      data: {
        title: 'Backend: Add Pushover notification service triggered on new listing request',
        description: 'This ticket is part of feature LISTING_REQUEST. Add Pushover configuration properties to ApplicationProperties following the JHipster pattern. Create PushoverService that sends HTTP POST to Pushover API. Wire it into ListingRequestService to fire a notification asynchronously when a new listing request is created. Pushover must be disabled by default and failures must not block the request.',
        feature_ref: '.ombutocode/features/feature_LISTING_REQUEST.md',
        status: 'backlog',
        last_updated: '2026-03-26',
        dependencies: ['LISTREQ-001'],
        acceptance_criteria: [
          'ApplicationProperties has pushover section with enabled (boolean, default false), apiToken (String), userKey (String)',
          'application.yml has pushover config block with defaults (enabled: false, empty strings)',
          'PushoverService.sendNotification(title, message) sends HTTP POST to https://api.pushover.net/1/messages.json',
          'PushoverService is a no-op when enabled is false (logs debug message and returns)',
          'PushoverService errors are logged but do not propagate exceptions',
          'PushoverService HTTP call has a 5-second timeout',
          'Notification is sent asynchronously (does not block the listing request response)',
          'On new listing request creation, a notification is sent with title "New Listing Request: {practiceName}" and message containing contact details',
          'Existing tests continue to pass'
        ],
        eval_summary: null,
        files_touched: [],
        notes: 'DESIGN SPECIFICATION:\n1. In ApplicationProperties.java (the existing JHipster custom properties bean), add:\n   private final Pushover pushover = new Pushover();\n   public Pushover getPushover() { return pushover; }\n   public static class Pushover {\n     private boolean enabled = false;\n     private String apiToken = "";\n     private String userKey = "";\n     // getters and setters\n   }\n2. In application.yml add:\n   application:\n     pushover:\n       enabled: false\n       api-token: ""\n       user-key: ""\n3. Create PushoverService.java in com.mymed.backend.service:\n   - Inject ApplicationProperties\n   - Use RestTemplate with 5s connect/read timeout\n   - sendNotification(title, message): if not enabled, log and return. Otherwise POST form data (token, user, title, message) to Pushover API.\n   - Wrap in try/catch, log errors at WARN level\n4. Make the call async: annotate sendNotification with @Async or call it via CompletableFuture.runAsync() in the ListingRequestService\n5. In ListingRequestService (or Resource), after saving the new listing request, call pushoverService.sendNotification()\nFiles to create: PushoverService.java\nFiles to modify: ApplicationProperties.java, application.yml, ListingRequestService.java (or ListingRequestResource.java)',
        assignee: null,
        fail_count: 0,
        eval_fail_count: 0,
        agent: null
      }
    },
    {
      id: 'LISTREQ-003',
      data: {
        title: 'Gateway: Add ListingRequest CRUD screens via JHipster entity generation',
        description: 'This ticket is part of feature LISTING_REQUEST. Run JHipster entity generation for the Gateway to produce the standard Vue CRUD screens (list, detail, create/edit, delete), routes, sidebar menu item, i18n keys, and service layer for the ListingRequest entity.',
        feature_ref: '.ombutocode/features/feature_LISTING_REQUEST.md',
        status: 'backlog',
        last_updated: '2026-03-26',
        dependencies: ['LISTREQ-001'],
        acceptance_criteria: [
          'ListingRequest CRUD screens exist in Gateway (list, detail, create/edit)',
          'ListingRequest appears in the Gateway sidebar under Entities section',
          'List view shows all listing requests with status column',
          'Detail view shows all fields',
          'Create/Edit form allows setting all fields including status',
          'Delete confirmation dialog works',
          'Routes are registered in entities.ts',
          'i18n keys exist for all field labels and enum values',
          'Screens are accessible to ROLE_ADMIN users'
        ],
        eval_summary: null,
        files_touched: [],
        notes: 'DESIGN SPECIFICATION:\n1. Run JHipster entity generation for Gateway: jhipster entity ListingRequest --skip-server (or import-jdl with gateway flag)\n2. This generates:\n   - gateway/src/main/webapp/app/entities/mymed/listing-request/ (Vue components, service, model)\n   - Route entries in entities.ts\n   - Menu item in entities-menu.vue\n   - i18n keys in gateway/src/main/webapp/i18n/en/\n3. Also add to the sidebar menu in jhi-navbar.vue (under Entities section) following the existing pattern\n4. Verify screens work by navigating to /listing-request in the Gateway\nFiles created by generator: listing-request.vue, listing-request-details.vue, listing-request-update.vue, listing-request.component.ts, listing-request-details.component.ts, listing-request-update.component.ts, listing-request.service.ts, listing-request.model.ts, i18n JSON files\nFiles to modify: entities.ts (router), entities-menu.vue, jhi-navbar.vue, global.json (i18n)',
        assignee: null,
        fail_count: 0,
        eval_fail_count: 0,
        agent: null
      }
    },
    {
      id: 'LISTREQ-004',
      data: {
        title: 'Frontend: Wire list-practice.vue form to ListingRequest backend API',
        description: 'This ticket is part of feature LISTING_REQUEST. Update the patient-facing frontend list-practice.vue page to submit the form data to POST /services/mymed/api/listing-requests. Handle success (show existing thank-you state) and error (show error message). No authentication required.',
        feature_ref: '.ombutocode/features/feature_LISTING_REQUEST.md',
        status: 'backlog',
        last_updated: '2026-03-26',
        dependencies: ['LISTREQ-001'],
        acceptance_criteria: [
          'handleSubmit() in list-practice.vue calls POST to /services/mymed/api/listing-requests (or equivalent Nuxt proxy path)',
          'Request body includes practiceName, contactName, email, phone, message',
          'On 201 response: isSubmitted is set to true (existing success state)',
          'On error: an error message is displayed to the user',
          'Form validation still runs before API call',
          'No authentication token is sent (public endpoint)',
          'Loading state is shown while the API call is in progress'
        ],
        eval_summary: null,
        files_touched: [],
        notes: 'DESIGN SPECIFICATION:\n1. In list-practice.vue handleSubmit():\n   - After validation passes, set a loading ref to true\n   - Call $fetch or useFetch to POST /api/listing-requests (via Nuxt server proxy or direct to backend)\n   - Body: { practiceName: form.practiceName, contactName: form.contactName, email: form.email, phone: form.phone, message: form.message }\n   - On success: set isSubmitted.value = true\n   - On error: set an errorMessage ref and display it\n   - Finally: set loading to false\n2. Check Nuxt proxy config (nuxt.config.ts) to ensure /api/** is proxied to the mymed service via the gateway\n3. Add a loading indicator on the submit button (disable + spinner)\n4. Add an error alert div above or below the form\nFiles to modify: frontend/pages/list-practice.vue\nMay also modify: frontend/nuxt.config.ts (proxy config if needed), frontend/services/api.ts (if adding a typed API function)',
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

  const outBuf = db.export();
  fs.writeFileSync(dbPath, Buffer.from(outBuf));
  console.log('Database saved. Total sort_order used:', sortOrder - 1);
}
main().catch(console.error);
