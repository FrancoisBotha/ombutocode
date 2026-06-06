---
system: true
---

# Style Guide - Simple

## Overview

A simplified style guide skill for beginner users and small projects. Covers the essential design decisions needed to ensure visual consistency without overwhelming detail.

Use this skill when you want a quick, practical style guide rather than a comprehensive enterprise-level document.

## Guidelines

- Keep it short and actionable — aim for a 1-2 page guide
- Focus on decisions that prevent inconsistency
- Use simple language, avoid design jargon
- Provide visual examples where possible
- Base recommendations on the chosen framework's defaults

## Output Structure

The skill should produce these sections:

1. Colours
2. Typography
3. Layout
4. Components
5. Do / Don't

## Section Details

### 1. Colours

Define the essential colours for the project:

- **Primary colour** — main brand/action colour (buttons, links)
- **Background** — page and card backgrounds
- **Text** — primary and secondary text colours
- **Status colours:**
  - Success (green)
  - Warning (amber/yellow)
  - Error (red)
  - Info (blue)

Provide hex codes for each. Example:

```
Primary:    #4A90E2
Background: #161A1F
Surface:    #1E2228
Text:       #D4D8DD
Muted text: #8B929A
Success:    #6DD4A0
Warning:    #E5A830
Error:      #E06060
```

### 2. Typography

Keep it simple:

- **Font family** — one font for the whole app
- **Headings** — sizes for H1, H2, H3
- **Body text** — default size and line height
- **Small text** — for labels and captions

Example:

```
Font:       Inter, system-ui, sans-serif
H1:         1.5rem, bold
H2:         1.2rem, semi-bold
H3:         1rem, semi-bold
Body:       0.875rem, regular, line-height 1.6
Small:      0.75rem
```

### 3. Layout

Define the basic spacing and structure:

- **Spacing unit** — base unit for margins and padding (e.g. 8px)
- **Page padding** — standard page margins
- **Card padding** — standard internal padding
- **Max width** — content area max width (if applicable)
- **Common layouts:**
  - Sidebar + content
  - Full width
  - Centered form

### 4. Components

Define the look and feel for the most common components:

- **Buttons** — primary, secondary, danger styles
- **Inputs** — text fields, dropdowns, checkboxes
- **Tables** — header style, row hover, borders
- **Cards** — border, shadow, border-radius
- **Badges/pills** — for status indicators
- **Navigation** — sidebar or top bar style

For each, specify:
- Border radius
- Border style
- Hover state

### 5. Do / Don't

**Do:**
- Use the defined colours consistently
- Keep spacing uniform using the spacing unit
- Use the same border-radius everywhere
- Left-align text by default
- Right-align numbers in tables

**Don't:**
- Introduce new colours without updating the guide
- Mix different border-radius values
- Use more than 2 font weights on a single screen
- Centre-align body text
- Use placeholder text as a substitute for labels

## Example Output

```markdown
# Project Style Guide

## Colours
| Role       | Hex     |
|------------|---------|
| Primary    | #4A90E2 |
| Background | #161A1F |
| Surface    | #1E2228 |
| Text       | #D4D8DD |
| Success    | #6DD4A0 |
| Warning    | #E5A830 |
| Error      | #E06060 |

## Typography
- Font: Inter
- H1: 1.5rem bold
- Body: 0.875rem regular

## Spacing
- Base unit: 8px
- Page padding: 24px
- Card padding: 16px
- Border radius: 6px

## Buttons
- Primary: filled, primary colour, white text, 6px radius
- Secondary: outlined, border only, 6px radius
- Danger: filled, error colour, white text
```

## References

- Keep it simple — this guide should fit on a single printed page
- Update it as the project evolves
- Use it as a checklist when reviewing mockups and UI code
