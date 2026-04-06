const initSqlJs = require(require('path').join(__dirname, '..', 'src', 'node_modules', 'sql.js'));
const fs = require('fs');
const path = require('path');

async function main() {
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, '..', 'data', 'ombutocode.db');
  const buf = fs.readFileSync(dbPath);
  const db = new SQL.Database(buf);

  const tickets = [
    {
      id: 'EXPORT-001',
      sort_order: 73,
      data: {
        title: 'Backend: Excel export endpoint for practice and practitioner data',
        description: 'This ticket is part of feature DATA_EXPORT_IMPORT. Add Apache POI dependency to mymed pom.xml. Create DataExportService that queries all practices (with practitioners eagerly loaded), builds a flat Excel workbook with one sheet, one row per practitioner with practice columns repeated, and practices with no practitioners as a single row with blank practitioner columns. Create DataExportResource with GET /api/data-export that returns the .xlsx as a downloadable attachment. Practitioner photoUrl is excluded from the export.',
        feature_ref: '.ombutocode/features/feature_DATA_EXPORT_IMPORT.md',
        status: 'backlog',
        last_updated: '2026-03-26',
        dependencies: [],
        acceptance_criteria: [
          'Apache POI poi-ooxml 5.2.5 dependency added to mymed pom.xml',
          'GET /api/data-export returns a valid .xlsx file with Content-Disposition header',
          'The Excel sheet has correct column headers matching the feature spec column list',
          'Each practitioner appears as one row with their parent practice columns repeated',
          'Practices with no practitioners appear as one row with blank practitioner columns',
          'Practitioner photoUrl is not included in the export',
          'practitioner_types column contains comma-separated type names',
          'Endpoint requires ROLE_ADMIN authority'
        ],
        eval_summary: null,
        files_touched: [],
        notes: 'DESIGN SPECIFICATION:\nAdd poi-ooxml 5.2.5 to mymed/pom.xml.\nCreate DataExportService in com.mymed.backend.service package.\nUse XSSFWorkbook to create the workbook. Query practiceRepository.findAll() and practitionerRepository.findAllWithEagerRelationships().\nBuild a Map<Long, List<Practitioner>> grouped by practice ID.\nIterate practices: for each practice, if it has practitioners, write one row per practitioner with practice fields repeated. If no practitioners, write one row with blank practitioner fields.\nColumn order per feature spec Section 4.\nCreate DataExportResource in com.mymed.backend.web.rest with @GetMapping("/api/data-export") returning ResponseEntity<byte[]>.\nSecure with @PreAuthorize hasAuthority ROLE_ADMIN.\nFiles to create: DataExportService.java, DataExportResource.java\nFiles to modify: mymed/pom.xml',
        assignee: null,
        fail_count: 0,
        eval_fail_count: 0,
        agent: null
      }
    },
    {
      id: 'EXPORT-002',
      sort_order: 74,
      data: {
        title: 'Backend: Excel import endpoint with merge-first strategy',
        description: 'This ticket is part of feature DATA_EXPORT_IMPORT. Create DataImportService and DataImportResource that accept a multipart .xlsx file upload at POST /api/data-import. For each row: match practice by practice_slug (update if found, create if not), then match practitioner by practitioner_provider_number within that practice (update if found, create if not). Rows with all practitioner columns blank are practice-only. Return a JSON summary with counts and error details.',
        feature_ref: '.ombutocode/features/feature_DATA_EXPORT_IMPORT.md',
        status: 'backlog',
        last_updated: '2026-03-26',
        dependencies: ['EXPORT-001'],
        acceptance_criteria: [
          'POST /api/data-import accepts multipart .xlsx file upload',
          'Practice rows are merged by practice_slug: existing practices are updated, new ones are created',
          'If practice_slug is blank, it is auto-generated from practice_name',
          'Practitioner rows are merged by practitioner_provider_number within the matched practice',
          'New practitioners are created when no provider_number match is found',
          'Rows with blank practitioner columns only create/update the practice',
          'practitioner_types column is parsed and matched to existing PractitionerType records by name',
          'Response is JSON with practicesCreated, practicesUpdated, practitionersCreated, practitionersUpdated, errors[]',
          'Each error entry includes row number and error message',
          'One bad row does not roll back other rows',
          'Endpoint requires ROLE_ADMIN authority',
          'File size limit is 10 MB'
        ],
        eval_summary: null,
        files_touched: [],
        notes: 'DESIGN SPECIFICATION:\nCreate DataImportService in com.mymed.backend.service.\nAccept InputStream, parse with XSSFWorkbook, read header row to map column indices.\nIterate data rows. For each row:\n1. Read practice_slug. Query practiceRepository.findBySlug(). If found, update fields. If not, create new Practice (generate slug from name if blank).\n2. If practitioner columns are non-blank: read practitioner_provider_number. Query practitionerRepository by providerNumber + practice. If found, update. If not, create new Practitioner.\n3. Parse practitioner_types as comma-separated names, look up each via practitionerTypeRepository.findByName().\n4. Wrap each row in try/catch, collect errors with row number.\nCreate DataImportResource with @PostMapping("/api/data-import") accepting @RequestParam MultipartFile.\nReturn ImportResultDTO with counts and errors list.\nFiles to create: DataImportService.java, DataImportResource.java, ImportResultDTO.java\nFiles to modify: PracticeRepository.java (add findBySlug if missing), PractitionerRepository.java (add findByProviderNumberAndPracticeId if missing)',
        assignee: null,
        fail_count: 0,
        eval_fail_count: 0,
        agent: null
      }
    },
    {
      id: 'EXPORT-003',
      sort_order: 75,
      data: {
        title: 'Gateway frontend: Export Data and Import Data pages with menu items',
        description: 'This ticket is part of feature DATA_EXPORT_IMPORT. Add Export Data and Import Data menu items to the Gateway entities dropdown. Create two new pages: /data-export with a download button that calls GET /services/mymed/api/data-export, and /data-import with a file upload form that POSTs to /services/mymed/api/data-import and displays the result summary.',
        feature_ref: '.ombutocode/features/feature_DATA_EXPORT_IMPORT.md',
        status: 'backlog',
        last_updated: '2026-03-26',
        dependencies: ['EXPORT-001', 'EXPORT-002'],
        acceptance_criteria: [
          'Export Data menu item appears in the Gateway Entities dropdown and navigates to /data-export',
          'Import Data menu item appears in the Gateway Entities dropdown and navigates to /data-import',
          'Export page has a heading, description, and Download Excel button',
          'Clicking Download Excel triggers a file download of the .xlsx from the backend via the gateway proxy',
          'Import page has a file picker and Import button',
          'After upload, the page displays a summary table: practices created/updated, practitioners created/updated',
          'If errors occurred, they are shown in a table with row number and message',
          'Both pages require authenticated admin user',
          'Pages use existing JHipster Bootstrap styling'
        ],
        eval_summary: null,
        files_touched: [],
        notes: 'DESIGN SPECIFICATION:\nMenu items: Add two b-dropdown-item entries in gateway/src/main/webapp/app/entities/entities-menu.vue before the jhipster-needle comment. Use font-awesome-icon file-export and file-import.\nRoutes: Add /data-export and /data-import routes in gateway/src/main/webapp/app/router/entities.ts with lazy-loaded components.\nExport page: Create data-export.vue and data-export.component.ts. On button click, use axios to GET /services/mymed/api/data-export with responseType blob, then create a download link.\nImport page: Create data-import.vue and data-import.component.ts. File input + submit button. POST multipart/form-data to /services/mymed/api/data-import. Parse JSON response and display in a Bootstrap table.\nAdd i18n keys for menu items in gateway/src/main/webapp/i18n/en/global.json.\nFiles to create: data-export.vue, data-export.component.ts, data-import.vue, data-import.component.ts\nFiles to modify: entities-menu.vue, entities.ts (router), global.json (i18n)',
        assignee: null,
        fail_count: 0,
        eval_fail_count: 0,
        agent: null
      }
    }
  ];

  const stmt = db.prepare('INSERT INTO backlog_tickets (id, sort_order, data) VALUES (?, ?, ?)');
  for (const t of tickets) {
    stmt.run([t.id, t.sort_order, JSON.stringify(t.data)]);
    console.log('Inserted:', t.id);
  }
  stmt.free();

  const outBuf = db.export();
  fs.writeFileSync(dbPath, Buffer.from(outBuf));
  console.log('Database saved.');
}
main().catch(console.error);
