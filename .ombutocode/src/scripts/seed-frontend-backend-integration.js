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

  const epic_ref = '.ombutocode/epics/feature_FRONTEND_BACKEND_INTEGRATION.md';
  const today = '2026-03-18';

  const tickets = [
    {
      id: 'ODFBI-001',
      title: 'Create Nuxt dev proxy and real API client with data transformation',
      description: 'Part of feature FRONTEND_BACKEND_INTEGRATION. Create the Nuxt dev server proxy config to forward /api/** to the gateway at localhost:9000. Create services/api.ts with the same function signatures as mockApi.ts (searchProviders, getProvider, getAvailability, getReviews, createBooking, submitPracticeInquiry). Implement the data transformation layer that maps backend entities (Practitioner, Practice, PractitionerType, PractitionerAvailability) to frontend types (Provider, Practice, Specialty, TimeSlot). Stub getReviews (returns empty array), createBooking, and submitPracticeInquiry.',
      dependencies: [],
      acceptance_criteria: [
        'Nuxt dev proxy forwards /api/** to http://localhost:9000/services/mymed/api/ without CORS errors',
        'services/api.ts exports searchProviders, getProvider, getAvailability, getReviews, createBooking, submitPracticeInquiry',
        'Data transformation maps Practitioner.displayName to Provider.name, Practice.address fields to Practice.address/suburb/city, PractitionerType to Specialty',
        'Fields without backend source use sensible defaults: photo=null, rating=0, reviewCount=0, qualifications=[]',
        'getReviews returns empty array, createBooking and submitPracticeInquiry return mock responses',
        'TypeScript compiles without errors'
      ],
      notes: 'DESIGN SPECIFICATION:\nCreate Nuxt proxy in nuxt.config.ts under nitro.devProxy or routeRules:\n  \'/api/**\': { target: \'http://localhost:9000/services/mymed/api/**\' }\n\nCreate services/api.ts that:\n- Uses $fetch (Nuxt built-in) or useFetch for SSR-compatible API calls\n- Maps backend pagination (X-Total-Count header, Spring Page format) to frontend PaginationMeta\n- Transforms Practitioner + Practice + PractitionerType into Provider type\n- Generates slug from practitioner id or displayName (url-friendly)\n- Transforms PractitionerAvailability (recurring day-of-week) into concrete TimeSlot[] for next 7 days\n\nAvailability expansion logic:\n- For each PractitionerAvailability record, find next 7 calendar days matching dayOfWeek\n- Generate slots from startTime to endTime using slotLengthMinutes\n- Each slot gets a computed id: `${practitionerId}-${date}-${slotIndex}`\n\nFiles to create:\n- frontend/services/api.ts\n\nFiles to modify:\n- frontend/nuxt.config.ts (add proxy config)'
    },
    {
      id: 'ODFBI-002',
      title: 'Wire composables to useMockData toggle and connect search page',
      description: 'Part of feature FRONTEND_BACKEND_INTEGRATION. Update composables (useSearch, useProvider, useBooking, useReviews) to conditionally import from services/api.ts or services/mockApi.ts based on the useMockData runtime config flag. Verify search page renders real practitioners from the backend when useMockData is false. Verify specialty filtering works.',
      dependencies: ['ODFBI-001'],
      acceptance_criteria: [
        'Setting useMockData: false in nuxt.config.ts switches all composables to use services/api.ts',
        'Setting useMockData: true reverts to mock data (rollback works)',
        'Search page shows real practitioners from the mymed database',
        'Filtering by specialty (e.g. selecting Dentist) returns only dentists',
        'Pagination works with real X-Total-Count header from backend',
        'Empty search results render correctly',
        'API errors show user-friendly messages'
      ],
      notes: 'DESIGN SPECIFICATION:\nUpdate each composable to conditionally import:\n  const api = useRuntimeConfig().public.useMockData\n    ? await import(\'~/services/mockApi\')\n    : await import(\'~/services/api\')\n\nOr use a provider pattern with a single apiService composable.\n\nSet useMockData: false in nuxt.config.ts for testing.\n\nSearch filtering: pass specialty slug as query param to GET /api/practitioners?practitionerType.slug=dentist (check backend filtering support).\nIf backend doesn\'t support filtering by specialty, fetch all and filter client-side initially.\n\nFiles to modify:\n- frontend/composables/useSearch.ts\n- frontend/composables/useProvider.ts\n- frontend/composables/useBooking.ts\n- frontend/composables/useReviews.ts\n- frontend/nuxt.config.ts (set useMockData: false)'
    },
    {
      id: 'ODFBI-003',
      title: 'Wire provider profile page with availability slot computation',
      description: 'Part of feature FRONTEND_BACKEND_INTEGRATION. Connect the provider profile page to fetch real practitioner data, practice details, practitioner types, and availability from the backend. Implement the availability slot expansion that converts recurring PractitionerAvailability records into concrete date-specific TimeSlot arrays for the next 7 days. Verify SSR works for provider profile pages.',
      dependencies: ['ODFBI-002'],
      acceptance_criteria: [
        'Provider profile page loads real practitioner data including name, bio, role',
        'Practice details (name, address, suburb, town/city, phone) display correctly',
        'Practitioner types/specialties display correctly',
        'Availability calendar shows time slots for the next 7 days derived from PractitionerAvailability',
        'Slots are correctly spaced by slotLengthMinutes (e.g. 15-min slots from 08:00 to 17:00)',
        'SSR works: view-source shows practitioner data in HTML',
        'Provider page with no availability shows appropriate empty state'
      ],
      notes: 'DESIGN SPECIFICATION:\nProvider profile fetches:\n1. GET /api/practitioners/{id} — practitioner details\n2. GET /api/practices/{practiceId} — practice with address\n3. GET /api/practitioner-availabilities?practitionerId={id} — recurring availability\n4. GET /api/practitioner-types (or from practitioner relation) — specialties\n\nAvailability expansion:\n- Get today\'s date\n- For next 7 days, check which PractitionerAvailability records match that day\'s dayOfWeek\n- For each match, generate slots: start at startTime, increment by slotLengthMinutes until endTime\n- Mark all as available: true (no appointment checking yet)\n\nSSR: use useAsyncData or useFetch (not onMounted) so data is fetched server-side.\n\nFiles to modify:\n- frontend/composables/useProvider.ts\n- frontend/pages/[provider-slug].vue (or equivalent provider profile page)\n- frontend/services/api.ts (if getAvailability needs updates)'
    },
    {
      id: 'ODFBI-004',
      title: 'End-to-end verification of search to profile to availability flow',
      description: 'Part of feature FRONTEND_BACKEND_INTEGRATION. Verify the complete patient flow works end-to-end with real data: homepage search → search results with real providers → click provider → profile page with real data and availability slots. Fix any remaining data mapping issues, edge cases, or rendering problems.',
      dependencies: ['ODFBI-003'],
      acceptance_criteria: [
        'Homepage search bar navigates to search results with real data',
        'Search results show provider cards with practice name, specialty, and next available slot',
        'Clicking a provider card navigates to the profile page',
        'Profile page shows all practitioner details, practice info, and availability',
        'Navigating back to search preserves previous results',
        'Page loads under 3 seconds on simulated 3G (Lighthouse or DevTools throttling)',
        'No console errors during the flow',
        'useMockData: true still works as fallback'
      ],
      notes: 'DESIGN SPECIFICATION:\nThis is a verification and polish ticket. Walk through the full flow:\n1. Go to homepage\n2. Search for a specialty (e.g. "Dentist")\n3. Verify search results show real Windhoek dentists\n4. Click on a provider\n5. Verify profile shows correct data\n6. Check availability slots render\n7. Test edge cases: empty search, provider with no availability, API timeout\n\nFix any issues found. Document any remaining gaps (e.g. booking not wired) in ticket notes.\n\nNo files to create — this is testing and bugfixing only.'
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
