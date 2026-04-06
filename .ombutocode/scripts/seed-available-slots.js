const initSqlJs = require('../src/node_modules/sql.js');
const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'ombutocode.db');

const tickets = [
  {
    id: 'AS-001',
    sort_order: 69,
    data: {
      title: 'Backend: AvailableSlot entity, enum, DTO, mapper, repository, and migration',
      description: 'This ticket is part of feature AVAILABLE_SLOTS. Create the AvailableSlot JPA entity with date, startTime, endTime, status (enum OPEN/BOOKED/BLOCKED), isTelehealth, sourceAvailabilityId, practitioner, and practice. Include Liquibase migration with unique index on (practitioner_id, date, start_time). Generate standard JHipster-style CRUD resource.',
      feature_ref: '.ombutocode/features/feature_AVAILABLE_SLOTS.md',
      status: 'backlog',
      last_updated: '2026-03-24',
      dependencies: [],
      acceptance_criteria: [
        'AvailableSlot entity exists with fields: id, date (LocalDate), startTime (LocalTime), endTime (LocalTime), status (AvailableSlotStatus enum), isTelehealth (Boolean), sourceAvailabilityId (Long nullable), practitioner (ManyToOne required), practice (ManyToOne required)',
        'AvailableSlotStatus enum exists with values: OPEN, BOOKED, BLOCKED',
        'Liquibase changelog creates available_slot table with all columns and a unique index on (practitioner_id, date, start_time)',
        'The changelog is registered in master.xml',
        'AvailableSlotDTO, AvailableSlotMapper, AvailableSlotRepository, AvailableSlotService, and AvailableSlotResource exist following the project patterns',
        'Standard CRUD endpoints are available: GET, GET/:id, POST, PUT, PATCH, DELETE'
      ],
      eval_summary: null,
      files_touched: [],
      notes: [
        'DESIGN SPECIFICATION:',
        'Create AvailableSlotStatus enum in mymed/src/main/java/com/mymed/backend/domain/enumeration/AvailableSlotStatus.java with OPEN, BOOKED, BLOCKED.',
        'Create AvailableSlot entity in mymed/src/main/java/com/mymed/backend/domain/AvailableSlot.java following the pattern of BlockoutPeriod.java.',
        'Fields: id (Long, sequence), date (LocalDate, not null), startTime (LocalTime, not null), endTime (LocalTime, not null), status (AvailableSlotStatus, not null, default OPEN), isTelehealth (Boolean, not null, default false), sourceAvailabilityId (Long, nullable), practitioner (ManyToOne to Practitioner, not null), practice (ManyToOne to Practice, not null).',
        'Create Liquibase changelog with addColumn for all fields. Add unique constraint on (practitioner_id, date, start_time).',
        'Create DTO (no mapstruct — follow direct DTO pattern if that is the project convention, otherwise use mapstruct).',
        'Create repository extending JpaRepository and JpaSpecificationExecutor.',
        'Create service with standard CRUD methods.',
        'Create REST resource at /api/available-slots with standard CRUD endpoints.',
        'Files to create: AvailableSlotStatus.java, AvailableSlot.java, AvailableSlotDTO.java, AvailableSlotMapper.java, AvailableSlotRepository.java, AvailableSlotService.java, AvailableSlotResource.java, Liquibase changelog XML'
      ].join('\n'),
      assignee: null,
      fail_count: 0,
      eval_fail_count: 0
    }
  },
  {
    id: 'AS-002',
    sort_order: 70,
    data: {
      title: 'Backend: Apply slots endpoint to expand templates into date-specific slots',
      description: 'This ticket is part of feature AVAILABLE_SLOTS. Implement POST /api/available-slots/apply that accepts a practitioner ID and date range, reads PractitionerAvailability templates, expands them into AvailableSlot rows for each day, checks BlockoutPeriods for overlap (marking those as BLOCKED), and upserts to avoid duplicates.',
      feature_ref: '.ombutocode/features/feature_AVAILABLE_SLOTS.md',
      status: 'backlog',
      last_updated: '2026-03-24',
      dependencies: ['AS-001'],
      acceptance_criteria: [
        'POST /api/available-slots/apply accepts JSON body with practitionerId (Long), startDate (LocalDate), endDate (LocalDate)',
        'For each day in the range, PractitionerAvailability rows matching that day of week and practitioner are looked up',
        'Template validFrom/validTo bounds are respected — templates outside their valid range are skipped',
        'Each matching template generates an AvailableSlot with status OPEN, the correct date, start/end times, isTelehealth, and sourceAvailabilityId referencing the template',
        'BlockoutPeriods that overlap a generated slot cause that slot to be created with status BLOCKED instead of OPEN',
        'If an AvailableSlot already exists for the same practitioner + date + startTime, it is not duplicated (upsert logic)',
        'The endpoint returns the list of created/updated AvailableSlot DTOs',
        'The practice is derived from the practitioner relationship'
      ],
      eval_summary: null,
      files_touched: [],
      notes: [
        'DESIGN SPECIFICATION:',
        'Add a new method to AvailableSlotService: applySlots(Long practitionerId, LocalDate startDate, LocalDate endDate) -> List<AvailableSlotDTO>.',
        'Add a new endpoint to AvailableSlotResource: POST /api/available-slots/apply.',
        'Implementation steps:',
        '1. Load practitioner (with practice) by ID.',
        '2. Load all PractitionerAvailability for this practitioner.',
        '3. Load all BlockoutPeriods for this practitioner in the date range.',
        '4. For each day from startDate to endDate:',
        '   a. Determine the DayOfWeek.',
        '   b. Filter templates matching that day, within validFrom/validTo bounds.',
        '   c. For each matching template, check if an AvailableSlot already exists (by practitioner + date + startTime).',
        '   d. If not exists, create one. Set status to BLOCKED if any blockout overlaps, else OPEN.',
        '   e. If exists, optionally update status if blockout situation changed.',
        '5. Return all slots for the range.',
        'Use repository method: findByPractitionerIdAndDateAndStartTime for duplicate check.',
        'Files to modify: AvailableSlotService.java, AvailableSlotResource.java',
        'Files to create: ApplySlotsRequest.java (request body DTO)'
      ].join('\n'),
      assignee: null,
      fail_count: 0,
      eval_fail_count: 0
    }
  },
  {
    id: 'AS-003',
    sort_order: 71,
    data: {
      title: 'Backend: Filter available slots by practitioner, date range, and status',
      description: 'This ticket is part of feature AVAILABLE_SLOTS. Ensure GET /api/available-slots supports query parameter filtering by practitionerId, date range (fromDate, toDate), and status using JPA Specifications.',
      feature_ref: '.ombutocode/features/feature_AVAILABLE_SLOTS.md',
      status: 'backlog',
      last_updated: '2026-03-24',
      dependencies: ['AS-001'],
      acceptance_criteria: [
        'GET /api/available-slots accepts optional query params: practitionerId (Long), fromDate (LocalDate), toDate (LocalDate), status (AvailableSlotStatus)',
        'When practitionerId is provided, only slots for that practitioner are returned',
        'When fromDate/toDate are provided, only slots with date >= fromDate and date <= toDate are returned',
        'When status is provided, only slots with that status are returned',
        'Filters can be combined',
        'Results include eager-loaded practitioner and practice relationships',
        'Pagination is supported via standard Spring Pageable'
      ],
      eval_summary: null,
      files_touched: [],
      notes: [
        'DESIGN SPECIFICATION:',
        'Create AvailableSlotSpecification.java following the pattern of BlockoutPeriodSpecification.java.',
        'Specifications: hasPractitioner(Long), dateFrom(LocalDate), dateTo(LocalDate), hasStatus(AvailableSlotStatus).',
        'Modify AvailableSlotResource GET endpoint to accept the filter params and call a filtered findAll on the service.',
        'Modify AvailableSlotService to add a findAll method that takes the specification + pageable.',
        'Files to create: AvailableSlotSpecification.java',
        'Files to modify: AvailableSlotResource.java, AvailableSlotService.java'
      ].join('\n'),
      assignee: null,
      fail_count: 0,
      eval_fail_count: 0
    }
  },
  {
    id: 'AS-004',
    sort_order: 72,
    data: {
      title: 'Frontend: Apply Slots button and calendar display of generated slots',
      description: 'This ticket is part of feature AVAILABLE_SLOTS. Add an "Apply Slots" button to the availability calendar week navigation bar. When clicked, call POST /api/available-slots/apply for the current week, then fetch and display the generated slots on the DayPilot calendar alongside the template preview.',
      feature_ref: '.ombutocode/features/feature_AVAILABLE_SLOTS.md',
      status: 'backlog',
      last_updated: '2026-03-24',
      dependencies: ['AS-002', 'AS-003'],
      acceptance_criteria: [
        'An "Apply Slots" button appears in the availability calendar tab navigation bar',
        'Clicking the button calls POST /api/available-slots/apply with the selected practitioner and the currently viewed week (Monday to Sunday)',
        'A loading indicator shows while the request is in progress',
        'After success, the calendar fetches applied slots via GET /api/available-slots and displays them',
        'Applied slots are visually distinct from the template preview slots (e.g., solid fill vs semi-transparent)',
        'Error state is handled (toast or inline message if the apply fails)',
        'The button is disabled when no practitioner is selected'
      ],
      eval_summary: null,
      files_touched: [],
      notes: [
        'DESIGN SPECIFICATION:',
        'Create or extend an available-slots API composable in frontend-practice/src/api/availableSlots.ts.',
        'Methods: applySlots({ practitionerId, startDate, endDate }), getAvailableSlots({ practitionerId, fromDate, toDate }).',
        'Add the "Apply Slots" button next to the "Today" button in AvailabilityWeekCalendar.vue nav bar.',
        'Style: use the .act-btn style from the design spec (teal primary button).',
        'After apply, fetch slots for the viewed week and render as DayPilot events with a solid teal background (vs the current semi-transparent template preview).',
        'Pass applied slots as a new prop or fetch them within the calendar component.',
        'Files to create: frontend-practice/src/api/availableSlots.ts',
        'Files to modify: AvailabilityWeekCalendar.vue, possibly AvailabilityView.vue'
      ].join('\n'),
      assignee: null,
      fail_count: 0,
      eval_fail_count: 0
    }
  }
];

initSqlJs().then(SQL => {
  const buf = fs.readFileSync(dbPath);
  const db = new SQL.Database(buf);

  const stmt = db.prepare('INSERT INTO backlog_tickets (id, sort_order, data) VALUES (?, ?, ?)');
  tickets.forEach(t => {
    stmt.run([t.id, t.sort_order, JSON.stringify(t.data)]);
    console.log('Inserted:', t.id, '-', t.data.title);
  });
  stmt.free();

  const outBuf = db.export();
  fs.writeFileSync(dbPath, Buffer.from(outBuf));
  console.log('Database saved successfully.');
  db.close();
});
