const initSqlJs = require('../src/node_modules/sql.js');
const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'ombutocode.db');

const tickets = [
  {
    id: 'WR-001',
    sort_order: 63,
    data: {
      title: 'Add ARRIVED and IN_PROGRESS to AppointmentStatus enum',
      description: 'This ticket is part of feature WAITING_ROOM, which aims to provide a real-time waiting room view for practice staff. This ticket adds the missing ARRIVED and IN_PROGRESS values to the backend AppointmentStatus Java enum to align with the frontend enum that already has them.',
      feature_ref: '.ombutocode/features/feature_WAITING_ROOM.md',
      status: 'backlog',
      last_updated: '2026-03-22',
      dependencies: [],
      acceptance_criteria: [
        'AppointmentStatus.java contains ARRIVED and IN_PROGRESS enum values',
        'Existing enum values (PENDING, CONFIRMED, CANCELLED_BY_PATIENT, CANCELLED_BY_PRACTICE, COMPLETED, NO_SHOW) are unchanged',
        'Existing tests that reference AppointmentStatus still pass',
        'The gateway appointment-status.model.ts enum is updated to include ARRIVED and IN_PROGRESS if not already present'
      ],
      eval_summary: null,
      files_touched: [],
      notes: [
        'DESIGN SPECIFICATION:',
        'Modify mymed/src/main/java/com/mymed/backend/domain/enumeration/AppointmentStatus.java to add ARRIVED and IN_PROGRESS between CONFIRMED and CANCELLED_BY_PATIENT.',
        'Verify gateway/src/main/webapp/app/shared/model/enumerations/appointment-status.model.ts matches.',
        'Update any test sample classes that reference AppointmentStatus to include the new values if needed.',
        'Files to modify: mymed/src/main/java/com/mymed/backend/domain/enumeration/AppointmentStatus.java, gateway/src/main/webapp/app/shared/model/enumerations/appointment-status.model.ts'
      ].join('\n'),
      assignee: null,
      fail_count: 0,
      eval_fail_count: 0
    }
  },
  {
    id: 'WR-002',
    sort_order: 64,
    data: {
      title: 'Add checkedInAt field to Appointment entity with Liquibase migration',
      description: 'This ticket is part of feature WAITING_ROOM. It adds a nullable checkedInAt (Instant) field to the Appointment entity, DTO, and mapper, plus the Liquibase migration to add the checked_in_at column to the appointment table.',
      feature_ref: '.ombutocode/features/feature_WAITING_ROOM.md',
      status: 'backlog',
      last_updated: '2026-03-22',
      dependencies: ['WR-001'],
      acceptance_criteria: [
        'Appointment entity has a checkedInAt field of type Instant, nullable',
        'AppointmentDTO has a checkedInAt field',
        'AppointmentMapper maps the checkedInAt field between entity and DTO',
        'A Liquibase changelog adds the checked_in_at TIMESTAMP column (nullable) to the appointment table',
        'The new changelog is registered in the master changelog',
        'Existing appointment data is unaffected (null checkedInAt for existing rows)'
      ],
      eval_summary: null,
      files_touched: [],
      notes: [
        'DESIGN SPECIFICATION:',
        'Add field to Appointment.java: @Column(name = "checked_in_at") private Instant checkedInAt; with getter/setter/fluent-setter.',
        'Add field to AppointmentDTO.java: private Instant checkedInAt; with getter/setter.',
        'Update AppointmentMapper if it uses explicit @Mapping (check if it auto-maps or needs annotation).',
        'Create Liquibase changelog: addColumn to appointment table, column checked_in_at type TIMESTAMP.',
        'Register in master.xml.',
        'Files to modify: Appointment.java, AppointmentDTO.java, AppointmentMapper.java (if needed)',
        'Files to create: Liquibase changelog XML for the new column'
      ].join('\n'),
      assignee: null,
      fail_count: 0,
      eval_fail_count: 0
    }
  },
  {
    id: 'WR-003',
    sort_order: 65,
    data: {
      title: 'Backend: appointment status transition with checkedInAt support',
      description: 'This ticket is part of feature WAITING_ROOM. It ensures the existing PATCH endpoint for appointments correctly handles status transitions and automatically sets checkedInAt when transitioning to ARRIVED.',
      feature_ref: '.ombutocode/features/feature_WAITING_ROOM.md',
      status: 'backlog',
      last_updated: '2026-03-22',
      dependencies: ['WR-002'],
      acceptance_criteria: [
        'PATCH /api/appointments/:id accepts a status field update',
        'When status is changed to ARRIVED, checkedInAt is automatically set to the current timestamp if not already set',
        'When status is changed away from ARRIVED (e.g., back to CONFIRMED), checkedInAt is cleared',
        'GET /api/appointments supports filtering by practitionerId and date range (startDateTime between from/to) so the frontend can fetch todays appointments for a provider',
        'The endpoint returns appointments with eager-loaded practitioner and service relationships'
      ],
      eval_summary: null,
      files_touched: [],
      notes: [
        'DESIGN SPECIFICATION:',
        'Add logic in AppointmentService.partialUpdate() or a dedicated updateStatus() method.',
        'When the incoming DTO has status=ARRIVED and current entity status != ARRIVED, set checkedInAt = Instant.now().',
        'When status changes away from ARRIVED, clear checkedInAt.',
        'For filtering: add query params to the GET /api/appointments endpoint (practitionerId, from, to) similar to how BlockoutPeriodResource does it.',
        'Use JpaSpecificationExecutor with Specification classes.',
        'Files to modify: AppointmentResource.java, AppointmentService.java',
        'Files to create: AppointmentSpecification.java (if not existing)'
      ].join('\n'),
      assignee: null,
      fail_count: 0,
      eval_fail_count: 0
    }
  },
  {
    id: 'WR-004',
    sort_order: 66,
    data: {
      title: 'Frontend: Waiting Room page scaffold with provider selection',
      description: 'This ticket is part of feature WAITING_ROOM. It creates the WaitingRoomView page component, registers the /waiting-room route, adds it to the sidebar nav, and implements the provider dropdown that fetches todays appointments for the selected provider.',
      feature_ref: '.ombutocode/features/feature_WAITING_ROOM.md',
      status: 'backlog',
      last_updated: '2026-03-22',
      dependencies: ['WR-003'],
      acceptance_criteria: [
        'A WaitingRoomView.vue component exists at frontend-practice/src/views/WaitingRoomView.vue',
        'The /waiting-room route is registered in the practice portal router',
        'The page has a provider dropdown listing active practitioners from the practice store',
        'Selecting a provider fetches todays appointments for that provider from the API',
        'The page is accessible from the sidebar navigation',
        'An empty state message shows when no appointments exist for the selected provider'
      ],
      eval_summary: null,
      files_touched: [],
      notes: [
        'DESIGN SPECIFICATION:',
        'Create WaitingRoomView.vue following the pattern of BlockoutsView.vue (uses practiceStore for practitioners, API composable for data).',
        'Create or extend an appointments API composable (frontend-practice/src/api/appointments.ts) with a getAppointments(filters) method that calls GET /api/appointments?practitionerId=X&from=todayStart&to=todayEnd.',
        'Register route in frontend-practice/src/router/index.ts.',
        'Add nav item in App.vue sidebar.',
        'Files to create: WaitingRoomView.vue, api/appointments.ts (if not existing)',
        'Files to modify: router/index.ts, App.vue'
      ].join('\n'),
      assignee: null,
      fail_count: 0,
      eval_fail_count: 0
    }
  },
  {
    id: 'WR-005',
    sort_order: 67,
    data: {
      title: 'Frontend: appointment list with status grouping and quick actions',
      description: 'This ticket is part of feature WAITING_ROOM. It implements the grouped appointment list (Waiting, In Progress, Upcoming, Done sections) with status transition buttons (Check In, Start, Complete, No-Show).',
      feature_ref: '.ombutocode/features/feature_WAITING_ROOM.md',
      status: 'backlog',
      last_updated: '2026-03-22',
      dependencies: ['WR-004'],
      acceptance_criteria: [
        'Appointments are grouped into four sections: Waiting (ARRIVED), In Progress (IN_PROGRESS), Upcoming (PENDING/CONFIRMED), Done (COMPLETED/NO_SHOW/CANCELLED)',
        'Each appointment card shows patient name, time, service type, and a colour-coded status badge',
        'Waiting section is sorted by checkedInAt ascending (longest wait first)',
        'Upcoming section is sorted by startDateTime ascending',
        'Done section is collapsed by default with a count in the header',
        'Check In button appears for PENDING/CONFIRMED appointments and transitions to ARRIVED',
        'Start Consultation button appears for ARRIVED appointments and transitions to IN_PROGRESS',
        'Complete button appears for IN_PROGRESS appointments and transitions to COMPLETED',
        'No-Show button appears for PENDING/CONFIRMED appointments and transitions to NO_SHOW',
        'Status transitions call PATCH /api/appointments/:id and update the list'
      ],
      eval_summary: null,
      files_touched: [],
      notes: [
        'DESIGN SPECIFICATION:',
        'Build within WaitingRoomView.vue or extract an AppointmentQueue component.',
        'Use computed properties to group and sort the appointments array by status.',
        'Each status button calls the appointments API PATCH with the new status.',
        'On Check In, also send checkedInAt (or let the backend set it per WR-003).',
        'Use the status badge colours from the feature spec: PENDING=yellow, CONFIRMED=green, ARRIVED=blue, IN_PROGRESS=purple, COMPLETED=teal, NO_SHOW=red, CANCELLED=grey.',
        'Files to modify: WaitingRoomView.vue',
        'Files to create: (optional) components/waitingroom/AppointmentCard.vue if extraction is cleaner'
      ].join('\n'),
      assignee: null,
      fail_count: 0,
      eval_fail_count: 0
    }
  },
  {
    id: 'WR-006',
    sort_order: 68,
    data: {
      title: 'Frontend: wait time display and summary bar',
      description: 'This ticket is part of feature WAITING_ROOM. It adds live-updating wait time display for checked-in patients, a 30-minute warning highlight, and a summary bar showing counts by status group.',
      feature_ref: '.ombutocode/features/feature_WAITING_ROOM.md',
      status: 'backlog',
      last_updated: '2026-03-22',
      dependencies: ['WR-005'],
      acceptance_criteria: [
        'ARRIVED appointments display elapsed wait time in minutes since checkedInAt (e.g. "12m waiting")',
        'Wait time updates every 30 seconds via a client-side timer without server calls',
        'Appointments waiting longer than 30 minutes are visually highlighted with an amber/orange indicator',
        'A summary bar above the list shows: "X waiting | X in progress | X upcoming | X completed today"',
        'The timer is cleaned up when the component unmounts (no memory leak)',
        'Wait time is not shown for non-ARRIVED appointments'
      ],
      eval_summary: null,
      files_touched: [],
      notes: [
        'DESIGN SPECIFICATION:',
        'Use a setInterval (30s) in WaitingRoomView.vue to trigger reactivity updates. Store a reactive "now" ref that updates every 30s.',
        'Computed wait time = Math.floor((now - checkedInAt) / 60000) + "m".',
        'For the 30-min highlight: conditionally apply a CSS class (e.g. border-amber-500 or bg-amber-50) when wait > 30.',
        'Summary bar is a simple computed that counts appointments by status group.',
        'Clean up the interval in onUnmounted().',
        'Files to modify: WaitingRoomView.vue (or AppointmentCard.vue if extracted in WR-005)'
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
