---
system: true
---

# Mockup Generator

## Overview

This skill guides AI coding agents in generating UI mockup images from feature descriptions. It provides a structured approach to specifying what a mockup should contain, ensuring the generated images are useful for development and stakeholder review.

## How to Use

When creating a mockup, provide the following information to the agent. The more detail you give, the better the result.

## Mockup Specification Template

Use this structure to describe the mockup you want generated:

### 1. Feature Summary
A brief description of what the screen/page does and its purpose.

### 2. User Context
- Who is the primary user?
- What is their goal on this screen?
- What environment are they working in? (desktop, mobile, control room, etc.)

### 3. UI Layout Description
Describe the layout in spatial terms:
- **Top bar**: navigation, selectors, breadcrumbs
- **Left panel**: sidebar, filters, lists
- **Main panel**: primary content area
- **Right panel**: detail panes, properties
- **Bottom**: status bars, pagination, actions

### 4. Key Components
List the specific UI components needed:
- Dropdowns, inputs, buttons
- Tables with column definitions
- Charts with data types
- Cards, tiles, badges
- Modals, drawers, tooltips

### 5. Interaction Behaviour
Describe key interactions:
- Click actions
- Hover effects
- Filtering behaviour
- Real-time updates
- Navigation flows

### 6. Design Style Guidance
Specify visual requirements:
- Light or dark theme
- Color scheme or brand guidelines
- Typography preferences
- Industry-specific styling (e.g. SCADA, medical, financial)
- Accessibility requirements

### 7. Image Generation Prompt
Provide a concise, descriptive prompt optimised for image generation. This should be a single paragraph that captures the essence of the mockup.

## Example: Personal Finance Dashboard

### Feature Summary
A dashboard for users to track their personal finances — income, expenses, savings goals, and budget categories — with a monthly overview and spending trends.

### User Context
- Individual managing personal finances
- Wants a quick snapshot of financial health
- Accesses primarily on desktop, occasionally on tablet

### UI Layout Description
- Top bar: month/year selector + account switcher
- Left panel: navigation (Dashboard, Transactions, Budgets, Goals, Settings)
- Main panel:
  - Top: KPI cards (Net Worth, Monthly Income, Monthly Expenses, Savings Rate)
  - Middle: donut chart (spending by category) + bar chart (income vs expenses by month)
  - Bottom: recent transactions table with category tags

### Key Components
- Dropdown: Account selection (Checking, Savings, Credit Card)
- Date picker: Month/year range
- KPI cards: large number with trend arrow (up/down) and percentage change
- Donut chart: spending categories (Housing, Food, Transport, Entertainment, etc.)
- Bar chart: 6-month income vs expenses comparison
- Table: sortable columns (Date, Description, Category, Amount, Account)
- Category badges: color-coded pills (green for income, red for expense)
- Progress bars: savings goals with percentage complete

### Interaction Behaviour
- Clicking a category in the donut chart filters the transactions table
- Hovering on chart segments shows amount and percentage
- Clicking a transaction row opens a detail drawer on the right
- Month selector updates all widgets simultaneously

### Design Style Guidance
- Clean, modern fintech aesthetic
- Dark theme with accent colors for categories
- Green for positive amounts, red for negative
- Rounded corners, subtle shadows, generous whitespace
- Inter or SF Pro font family

### Image Generation Prompt
"A modern personal finance dashboard web app, dark theme, clean minimal design, left sidebar navigation, top KPI cards showing net worth and monthly totals with trend indicators, donut chart for spending categories, bar chart comparing income vs expenses over 6 months, recent transactions table with color-coded category badges, fintech aesthetic with green and red accent colors, professional and polished UI"

## Guidelines for AI Agents

When generating mockups:
- Ask the user to fill in the template sections if not provided
- Use the Image Generation Prompt as the primary input for image creation
- Save images to `docs/Mockups/` with descriptive filenames
- Confirm the save path with the user before writing
- Generate high-resolution images suitable for review
- Use consistent styling across related mockups
- If the user provides an epic or FR document, extract UI requirements from it to inform the mockup
