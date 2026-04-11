---
system: true
---

# Mockup Generator

## Overview

This skill guides AI coding agents in generating UI mockup images from feature descriptions. It provides a structured approach to specifying what a mockup should contain, ensuring the generated images are useful for development and stakeholder review.

**Important:** This skill does not prescribe visual styles, colours, typography, or component designs. If a Style Guide exists for the project, always defer to it for all design decisions. This skill focuses only on *what* to include in a mockup and *how* to describe it.

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
- **Top area**: navigation, selectors, breadcrumbs
- **Left area**: sidebar, filters, lists
- **Main area**: primary content
- **Right area**: detail panes, properties
- **Bottom area**: status bars, pagination, actions

### 4. Key Components
List the UI components needed, without specifying their visual style:
- Dropdowns, inputs, buttons
- Tables with column definitions
- Charts with data types
- Cards, tiles, badges
- Modals, drawers, tooltips

### 5. Interaction Behaviour
Describe key interactions:
- Click and selection actions
- Hover effects
- Filtering behaviour
- Real-time updates
- Navigation flows

### 6. Data & Content
Describe what data is shown:
- What fields appear in tables/lists
- What values appear in charts/KPIs
- Use realistic placeholder content
- Specify units, formats, and labels

### 7. Image Generation Prompt
Provide a concise, descriptive prompt optimised for image generation. Focus on layout and content, not specific colours or fonts — those should come from the Style Guide.

## Example: Personal Finance Dashboard

### Feature Summary
A dashboard for users to track personal finances — income, expenses, savings goals, and budget categories.

### User Context
- Individual managing personal finances
- Wants a quick snapshot of financial health
- Primarily desktop use

### UI Layout Description
- Top: month/year selector + account switcher
- Left: navigation sidebar
- Main area:
  - Top: KPI cards (Net Worth, Monthly Income, Monthly Expenses, Savings Rate)
  - Middle: spending breakdown chart + income vs expenses trend
  - Bottom: recent transactions table

### Key Components
- Account selector dropdown
- Date picker
- KPI cards with trend indicators
- Category breakdown chart
- Comparison bar chart (6 months)
- Transactions table (Date, Description, Category, Amount, Account)
- Category badges
- Savings goal progress indicators

### Interaction Behaviour
- Clicking a category filters the transactions table
- Hovering on chart segments shows amount and percentage
- Clicking a transaction opens a detail view
- Month selector updates all widgets

### Data & Content
- KPI values: Net Worth ($45,230), Monthly Income ($8,500), Monthly Expenses ($5,120), Savings Rate (39.8%)
- Categories: Housing, Food, Transport, Entertainment, Utilities, Health
- Transactions: 10-15 recent entries with realistic descriptions

### Image Generation Prompt
"A personal finance dashboard web app, left sidebar navigation, top KPI cards with trend indicators, spending category chart, income vs expenses comparison over 6 months, recent transactions table with category badges, clean professional layout"

## Guidelines for AI Agents

When generating mockups:
- If a **Style Guide** is provided as context, follow it for all visual decisions (colours, fonts, spacing, component styles)
- If no Style Guide is provided, use sensible defaults but keep the design neutral and professional
- Ask the user to fill in the template sections if not provided
- Use the Image Generation Prompt as the primary input for image creation
- Save images to `docs/Mockups/` with descriptive filenames
- Confirm the save path with the user before writing
- Generate images suitable for review and iteration
- If an **epic** or **functional requirements** document is provided, extract UI requirements from it to inform the mockup content
- Focus on layout accuracy and realistic content over artistic style
- Do not invent design conventions — use what is documented or ask
