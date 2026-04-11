---
system: true
---

# Ticket Generation

## Overview

This skill guides AI coding agents in breaking down epics into well-structured implementation tickets. Each ticket should represent a single, clearly scoped unit of work that one agent can complete in one session.

The output is a set of tickets added to the project backlog, each linked back to the originating epic.

## Guidelines

- **Read the epic thoroughly** before proposing tickets — understand scope, acceptance criteria, and dependencies
- **Read the engineering guide** (`.ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md`) to understand ticket conventions
- **One ticket = one deliverable** — each ticket should produce a testable, reviewable change
- **Order matters** — infrastructure and setup tickets come before feature tickets
- **Do not create separate test tickets** — Ombuto Code has a built-in test and validation step that runs automatically for every ticket
- **Size tickets appropriately** — aim for 3-8 tickets per epic, each completable in one agent session
- **Always confirm** with the user before writing to the backlog

## Ticket Structure

Each ticket added to the backlog must include:

### Required Fields
- **id** — Sequential ID (e.g. OMBUTO-001, OMBUTO-002)
- **title** — Clear, actionable title in imperative form (e.g. "Create user authentication API endpoint")
- **status** — Always `backlog` for new tickets
- **assignee** — `null` (assigned later by the scheduler or user)
- **epic_ref** — Path to the epic file (e.g. `docs/Epics/epic_USER_AUTH.md`)
- **acceptance_criteria** — List of specific, testable criteria
- **dependencies** — List of ticket IDs this ticket depends on (empty if none)

### Required Context References
Each ticket must include a `references` section so the executing agent has full context:
- **prd** — Path to the PRD (e.g. `docs/Product Requirements Document/PRD.md`)
- **architecture** — Path to the architecture document (e.g. `docs/Architecture/Architecture.md`)
- **style_guide** — Path to the style guide, if it exists (e.g. `docs/Style Guide/StyleGuide.md`)
- **epic_ref** — Already included above — path to the parent epic

These references are passed to the coding agent when it picks up the ticket, giving it the full project context to make informed implementation decisions.

### Optional Fields
- **description** — Additional context if the title is not self-explanatory
- **notes** — Implementation hints, relevant file paths, or technical considerations

## Ticket Types

When breaking down an epic, consider these ticket types:

### 1. Setup / Infrastructure
- Database schema creation or migration
- Project scaffolding or configuration
- Dependency installation
- Environment setup

### 2. Core Implementation
- API endpoints or service methods
- Business logic implementation
- Data access layer
- Core algorithms

### 3. UI / Frontend
- Component creation
- Page layout and routing
- State management integration
- Form validation

**IMPORTANT:** When creating UI/Frontend tickets, check the epic's References section for any linked mockup images (lines starting with `- mockup:`). If mockup references exist, include them in the ticket's `references` section as `mockups` so the coding agent can see the target visual design when implementing the UI. Example:

```yaml
references:
  prd: docs/Product Requirements Document/PRD.md
  architecture: docs/Architecture/Architecture.md
  style_guide: docs/Style Guide/StyleGuide.md
  mockups:
    - docs/Mockups/AppScaffold.png
    - docs/Mockups/Dashboard.png
```

This ensures the agent implements the UI to match the approved mockup designs.

### 4. Integration
- Connecting frontend to backend
- Third-party API integration
- Inter-service communication

### 5. Documentation
- API documentation
- User-facing help content
- Architecture decision records

## Acceptance Criteria Guidelines

Good acceptance criteria are:
- **Specific** — "User can log in with email and password" not "Login works"
- **Testable** — Can be verified with a concrete test
- **Independent** — Each criterion can be checked on its own
- **Complete** — Together they fully define "done" for the ticket

Example:
```
- [ ] POST /api/auth/login accepts email and password
- [ ] Returns JWT token on valid credentials
- [ ] Returns 401 with error message on invalid credentials
- [ ] Token expires after 24 hours
- [ ] Rate-limited to 5 attempts per minute per IP
```

## Dependency Rules

- A ticket's dependencies must only reference other tickets in the same epic or already-completed tickets
- Setup tickets should have no dependencies (they come first)
- UI tickets typically depend on their corresponding API tickets

## Workflow

1. **Read** the epic specification completely
2. **Identify** the logical work units
3. **Order** them by dependency (setup → core → integration → UI)
4. **Detect** project documents for references (PRD, Architecture, Style Guide)
5. **Propose** a summary table with: ID, Title, Type, Dependencies
6. **Wait** for user confirmation
7. **Write** the tickets to `.ombutocode/planning/backlog.yml` with references included
8. **Update** the epic status from `NEW` to `TICKETS`

## Example Output

### Proposed Tickets for Epic: User Authentication

| # | ID | Title | Type | Depends On |
|---|-----|-------|------|------------|
| 1 | OMBUTO-010 | Create users and sessions database tables | Setup | — |
| 2 | OMBUTO-011 | Implement authentication service with JWT | Core | OMBUTO-010 |
| 3 | OMBUTO-012 | Create login and register API endpoints | Core | OMBUTO-011 |
| 4 | OMBUTO-013 | Add authentication middleware for protected routes | Core | OMBUTO-011 |
| 5 | OMBUTO-014 | Create login and registration UI components | UI | OMBUTO-012 |

### Example Ticket YAML

```yaml
- id: OMBUTO-011
  title: Implement authentication service with JWT
  status: backlog
  assignee: null
  epic_ref: docs/Epics/epic_USER_AUTH.md
  references:
    prd: docs/Product Requirements Document/PRD.md
    architecture: docs/Architecture/Architecture.md
    style_guide: docs/Style Guide/StyleGuide.md
  acceptance_criteria:
    - "[ ] Accepts email and password, returns signed JWT"
    - "[ ] Validates password against bcrypt hash"
    - "[ ] Token includes user ID and role in payload"
    - "[ ] Token expires after 24 hours"
  dependencies:
    - OMBUTO-010
  notes: "Use jsonwebtoken package. See Architecture §6 for auth approach."
```

## References

- `.ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md` — ticket workflow and conventions
- `.ombutocode/templates/backlog.yml` — backlog YAML format
- `.ombutocode/planning/backlog.yml` — current backlog (append new tickets here)
