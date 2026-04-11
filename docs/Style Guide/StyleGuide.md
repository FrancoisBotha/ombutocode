# DropSync — Style Guide

A simple, practical style guide for DropSync, a Windows desktop Dropbox backup utility. This guide defines the essential visual decisions needed to keep the UI consistent across every screen and every PR.

**Product context.** DropSync is an Electron + Vue 3 desktop app aimed at casual Windows users. The design goals are simplicity, reliability, and unobtrusiveness — the UI should feel native, trustworthy, and never surprising.

**Theme.** Light.

---

## 1. Colours

| Role               | Hex       | Used for                                   |
|--------------------|-----------|--------------------------------------------|
| Primary            | `#4A90E2` | Buttons, links, active states, info        |
| Primary (hover)    | `#3A7BC8` | Hover/pressed state on primary elements    |
| Background         | `#F7F8FA` | App background                             |
| Surface            | `#FFFFFF` | Cards, panels, list rows, inputs           |
| Surface (hover)    | `#F0F3F7` | Row/card hover state                       |
| Border             | `#E1E5EB` | Dividers, input borders, card borders      |
| Text               | `#1F2430` | Primary text                               |
| Muted text         | `#6B7280` | Secondary labels, timestamps, captions     |
| Success            | `#2FA96A` | Completed runs                             |
| Warning            | `#D98B1F` | Quota warnings, skipped files              |
| Error              | `#D14545` | Failed runs, auth errors                   |
| Info               | `#4A90E2` | In-progress state (reuses primary)         |

Status colours always carry the same meaning — a green badge anywhere in the app means "completed," a red badge means "failed."

---

## 2. Typography

**Font family:** `Inter, -apple-system, "Segoe UI", system-ui, sans-serif`

| Style | Size              | Weight         | Use                         |
|-------|-------------------|----------------|-----------------------------|
| H1    | 1.5rem (24px)     | 700 bold       | View titles                 |
| H2    | 1.2rem (19px)     | 600 semi-bold  | Section headings            |
| H3    | 1rem (16px)       | 600 semi-bold  | Card titles, job names      |
| Body  | 0.875rem (14px)   | 400 regular    | Default body text (line-height 1.6) |
| Small | 0.75rem (12px)    | 400 regular    | Timestamps, captions, labels |

Use only two weights per screen: regular (400) and semi-bold (600). Reserve bold (700) for H1.

---

## 3. Layout

### Spacing

| Token          | Value | Use                                      |
|----------------|-------|------------------------------------------|
| Base unit      | 8px   | All spacing is a multiple of this        |
| Page padding   | 24px  | Outer margin around main content         |
| Card padding   | 16px  | Internal padding on cards and panels     |
| Section gap    | 24px  | Between stacked sections                 |
| Row padding    | 12px vertical / 16px horizontal | List and table rows |
| Border radius  | 6px   | Cards, buttons, inputs (uniform)         |

### Primary layout — Sidebar + Content

```
┌───────────┬───────────────────────────────┐
│           │  Page title                   │
│  Sidebar  │                               │
│  (nav)    │  [ Card / List / Table ]      │
│   220px   │                               │
│           │  [ Another section ]          │
└───────────┴───────────────────────────────┘
```

- **Sidebar:** fixed 220px, white background, 1px right border
- **Content:** fills remaining width, 24px page padding

### Secondary layouts

- **Centered form** — max-width 560px, centered. Used for the Job Config screen.
- **Full-width list/table** — used for the Backup Logs view.

---

## 4. Components

### Buttons

| Variant    | Style                                              | Use                           |
|------------|----------------------------------------------------|-------------------------------|
| Primary    | Filled `#4A90E2`, white text, 6px radius, 8×16 padding. Hover `#3A7BC8`. | "Create Job", "Run Now", "Save" |
| Secondary  | Outlined, transparent bg, `#4A90E2` border + text, 6px radius. Hover surface `#F0F3F7`. | "Cancel", "Edit" |
| Danger     | Filled `#D14545`, white text, 6px radius. Hover darker red. | "Delete Job", "Disconnect" |
| Ghost      | No border, no bg, `#4A90E2` text. Hover `#F0F3F7`. | Inline row actions             |

### Inputs (text, dropdown, path picker)

- Background `#FFFFFF`, 1px border `#E1E5EB`, 6px radius, 8×12 padding
- Focus: border `#4A90E2`, subtle blue outline
- Label: 12px muted text above the input (never use placeholder as a substitute)

### Tables

- Header: `#F0F3F7` background, 12px semi-bold muted text
- Row: white background, 12px vertical / 16px horizontal padding, 1px bottom border `#E1E5EB`
- Row hover: `#F0F3F7`
- Numbers right-aligned; text left-aligned

### Cards

- Background `#FFFFFF`, 1px border `#E1E5EB`, 6px radius, 16px padding
- **No shadow** — DropSync is flat; borders do the separation

### Badges / Status pills

Pill-shaped (12px radius, 2×10 padding, 12px semi-bold text) — the single exception to the 6px radius rule.

| Status      | Background | Text  |
|-------------|------------|-------|
| Running     | `#4A90E2`  | white |
| Completed   | `#2FA96A`  | white |
| Failed      | `#D14545`  | white |
| Skipped     | `#D98B1F`  | white |
| Disabled    | `#6B7280`  | white |

### Sidebar Navigation

- Background `#FFFFFF`, 1px right border `#E1E5EB`
- Item: 12×16 padding, 14px text
- Item hover: `#F0F3F7` background
- Item active: `#4A90E2` text with a 3px `#4A90E2` left accent bar
- Icons: 16px, left of label, 12px gap

---

## 5. Do / Don't

### Do

- Use the defined palette colours — never introduce new hex values
- Keep all spacing as multiples of the 8px unit (8, 16, 24, 32)
- Use 6px border radius everywhere except status pills (12px)
- Left-align text by default
- Right-align numbers in tables (file counts, bytes, durations)
- Use semi-bold (600) for headings, regular (400) for body text
- Use muted text (`#6B7280`) for secondary info like timestamps
- Use status badges consistently — same colour always means the same thing
- Use the system tray icon to communicate state (idle, running, error) — don't rely solely on the app window
- Confirm destructive actions (delete job, disconnect Dropbox) before executing

### Don't

- Introduce new colours without updating this guide first
- Mix border-radius values on the same screen
- Use more than two font weights on a single screen (regular + semi-bold)
- Centre-align body text or form labels
- Use placeholder text as a substitute for a field label
- Rely on colour alone to convey status — pair it with text and/or an icon
- Use shadows for depth — DropSync is flat; use borders instead
- Add animation beyond simple hover transitions and progress indicators
- Hide important state changes (e.g. a failed backup) behind subtle visual cues — surface them clearly

---

*Use this guide as a checklist when reviewing mockups and UI code. Update it as the project evolves — but always update the guide first, then the code.*
