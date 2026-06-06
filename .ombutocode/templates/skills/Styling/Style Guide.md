---
system: true
---

# Style Guide

## Overview

This skill generates a comprehensive project-specific style guide that standardises how UI mockups and frontend code are produced by AI agents and developers.

It translates architectural decisions, design preferences, and domain constraints into a consistent set of rules covering layout, components, naming conventions, styling, and interaction patterns.

The output ensures that all generated mockups and frontend implementations are visually consistent, technically aligned, and production-ready.

## Guidelines

- **Base the style guide on the supplied architecture file:**
  - Frontend framework (e.g. Vue, React)
  - UI library (e.g. Vuetify, Bootstrap, Tailwind)
  - State management and routing approach
- **Ensure alignment between design and implementation:**
  - Every visual component should map to a real framework/component equivalent
  - Avoid designs that cannot be easily implemented in the chosen stack
- **Optimise for AI agent usability:**
  - Be explicit and unambiguous
  - Prefer rules over suggestions
  - Provide examples wherever possible
- **Enforce consistency across the application:**
  - Layout grids and spacing
  - Typography and colour usage
  - Component structure and reuse
- **Support enterprise / data-heavy applications:**
  - Tables, filters, dashboards, forms
  - Clear handling of empty/loading/error states
  - Real-time and status-driven UI patterns
- **Consider operational environments where relevant:**
  - Dark mode / control room visibility
  - High contrast for alerts and alarms
  - Accessibility considerations

## Output Structure

The skill should produce the following sections:

1. Project Overview
2. Technology Stack Alignment
3. Design Principles
4. Layout & Grid System
5. Typography
6. Colour System
7. Component Standards
8. Interaction Patterns
9. Data Display Standards
10. State Handling (Loading, Empty, Error)
11. Naming Conventions
12. Code Conventions
13. Do / Don't Guidelines
14. Examples

## Section Details

### 1. Project Overview
- Purpose of the application
- Target users
- Key UI characteristics (e.g. dashboard-heavy, form-driven)

### 2. Technology Stack Alignment
- Frontend framework (from architecture)
- UI component library
- Styling approach (CSS, SCSS, Tailwind, etc.)
- State management
- Routing

### 3. Design Principles

Define 4–6 guiding principles, e.g.:
- Clarity over cleverness
- Data-first design
- Minimal cognitive load
- Consistency across views
- Fast operator decision-making

### 4. Layout & Grid System
- Grid system (e.g. 12-column)
- Spacing scale (e.g. 4px / 8px system)
- Standard layouts:
  - Dashboard
  - Form page
  - Detail page
  - Table view

### 5. Typography
- Font family
- Heading hierarchy (H1–H5)
- Body text sizes
- Emphasis rules

### 6. Colour System
- Primary, secondary colours
- Status colours:
  - Success (green)
  - Warning (amber)
  - Error (red)
- Backgrounds (light/dark)
- Accessibility contrast rules

### 7. Component Standards

Define how common components must be used:
- Buttons
- Forms (inputs, selects, validation)
- Tables (sorting, filtering, pagination)
- Cards / panels
- Modals / dialogs
- Navigation (top bar, sidebar)

### 8. Interaction Patterns
- Click vs double-click behaviour
- Navigation patterns
- Filtering and search UX
- Inline vs modal editing
- Confirmation patterns

### 9. Data Display Standards
- **Tables:**
  - Default sorting rules
  - Column alignment (numbers right-aligned, etc.)
- **Charts:**
  - When to use line vs bar vs KPI tiles
- **Units and formatting:**
  - Dates, numbers, engineering units

### 10. State Handling

Define required states for all components:
- Loading (spinners, skeletons)
- Empty (no data messaging)
- Error (clear, actionable messages)

### 11. Naming Conventions
- Component naming (e.g. PumpTable, SiteSelector)
- File naming conventions
- CSS class naming (BEM, utility-first, etc.)
- Variable naming (camelCase, PascalCase)

### 12. Code Conventions
- Component structure (example for Vue/React)
- Separation of concerns:
  - UI vs logic
  - Reusable components vs page-specific components
- API interaction patterns

### 13. Do / Don't Guidelines

**Do:**
- Use consistent spacing
- Reuse existing components
- Show system status clearly

**Don't:**
- Introduce new styles without justification
- Overload screens with data
- Use inconsistent naming

### 14. Examples

#### Component: Data Table

**Standard Behaviour:**
- Default sort: descending by timestamp
- Pagination: required if > 20 rows
- Columns:
  - Text: left-aligned
  - Numbers: right-aligned
  - Status: badge with colour coding

**Vue Example (Vuetify):**
```vue
<v-data-table
  :headers="headers"
  :items="items"
  :items-per-page="20"
  class="elevation-1"
/>
```

#### Component: KPI Card

**Structure:**
- Title (small, muted)
- Value (large, bold)
- Unit (subtle)
- Optional trend indicator

**Usage:**
- Always placed at top of dashboard
- Max 4–6 per row

## References

- Material Design
- Apple Human Interface Guidelines
- Nielsen UX heuristics
- Enterprise dashboard design best practices
