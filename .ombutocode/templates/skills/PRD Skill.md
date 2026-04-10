# PRD Skill

## Overview

This skill generates high-quality Product Requirements Documents (PRDs) by simulating a cross-functional product team. It integrates perspectives from Product Management, Customer Research, Solutions Architecture, Engineering, Analytics, and Risk/Compliance into a single, structured output.

The purpose of this skill is to:
- Produce clear, actionable, and technically feasible PRDs
- Ensure user-centric design grounded in real pain points
- Prevent over-engineering and vague requirements
- Embed measurable success criteria
- Address technical, security, and operational considerations upfront

This skill is suitable for:
- Complex software systems
- Enterprise applications
- Cloud and hybrid architectures
- Data platforms and integration-heavy solutions
- Consumer utilities and prosumer tools

---

## Guidelines

- Always clarify the problem before proposing solutions
- Ask targeted clarifying questions if inputs are incomplete
- Avoid vague, generic, or buzzword-heavy language
- Prefer specific, testable, and measurable statements
- Be concise but complete enough for engineering execution
- Explicitly state assumptions and unknowns

### Role-Based Thinking (Critical)

Each section must reflect the perspective of the relevant role:

**Product Manager**
- Define the problem clearly
- Identify target users and value proposition
- Prioritise features based on impact

**Customer Research Analyst**
- Identify personas and real pain points
- Highlight current alternatives and their limitations
- Capture functional and emotional needs

**Solutions Architect**
- Ensure technical feasibility
- Define high-level architecture and integration points
- Consider scalability, security, and constraints

**Engineering Lead**
- Break features into implementable scope
- Define MVP vs future phases
- Identify hidden complexity

**Product Analytics Expert**
- Define measurable KPIs
- Avoid vanity metrics
- Link metrics to business outcomes

**Risk & Compliance Specialist**
- Identify technical, operational, and regulatory risks
- Consider data governance and access control
- Highlight failure modes and mitigations

---

## Output Structure (Mandatory)

The PRD must follow this structure. Sections marked **(core)** are required; sections marked **(recommended)** should be included unless the product is trivial or clearly doesn't warrant them.

### 1. Executive Summary *(core)*
A one-page snapshot covering:
- The problem in one or two sentences
- Who it's for
- The proposed solution
- Why it matters now

### 2. Vision *(core)*
- Aspirational future state (1–3 years out)
- What the product becomes when it's mature
- The change it creates in the user's life or workflow

### 3. Objectives *(core)*
- 3–6 specific, outcome-oriented goals
- Should be measurable where possible
- Distinguish business objectives from user objectives

### 4. Key Principles *(core)*
- The non-negotiable design and product values
- Trade-off heuristics ("we always prefer X over Y")
- What the product will never do

### 5. Target Users and Personas *(core)*
- Primary persona: detailed profile, goals, frustrations, context of use
- Secondary personas: brief profiles
- Anti-personas: who this is **not** for
- Top user pain points (at least 5)

### 6. Key Features *(core)*
- Prioritised list (High / Medium / Low or MoSCoW)
- Each feature with: name, description, user value, acceptance criteria
- Group by theme or user journey where helpful

### 7. MVP Scope *(recommended — added)*
- Must-have features for first release
- Explicitly deferred features
- Out-of-scope items
- Complexity assessment (Low / Medium / High)

> *Why added:* "Key Features" alone tends to produce a wishlist. An explicit MVP boundary forces the team to commit to a shippable first version.

### 8. Technical Approach *(recommended — added)*
- High-level architecture
- Key components and services
- Data flow
- Integration points (APIs, third-party services)
- Security, privacy, and scalability considerations

> *Why added:* Without this, PRDs ship to engineering and immediately get bounced back with feasibility questions. A lightweight technical sketch upfront saves rounds.

### 9. Success Metrics *(recommended — added)*
- North star metric
- Supporting KPIs (leading and lagging)
- Measurement approach
- Definition of success for the MVP and for the mature product

> *Why added:* "Objectives" describe intent; "Success Metrics" describe how you'll know you got there. Both matter.

### 10. Risks and Mitigations *(recommended — added)*
- Top technical, operational, security, and regulatory risks
- Mitigation strategy for each
- Failure modes worth designing for

> *Why added:* Forces the team to surface unknowns before they become incidents.

### 11. Open Questions *(core)*
- Unresolved decisions
- Items requiring user research, legal review, or technical spike
- Each question should have an owner and a target resolution date where possible

### 12. Product Roadmap *(core)*
- Phased delivery (e.g. MVP → V1 → V2)
- Approximate timeframes
- Dependencies between phases
- Themes per phase, not granular task lists

---

## Quality Bar

A good PRD must:
- Be understandable by both business and engineering teams
- Be implementable without major reinterpretation
- Contain clear priorities and scope boundaries
- Include realistic technical considerations
- Define how success will be measured
- Distinguish what's known from what's assumed

---

## Worked Example

The following is a complete PRD generated using this skill for a hypothetical product.

---

# PRD: PhotoNest — Duplicate Photo Finder for Dropbox

## 1. Executive Summary

Casual photographers and families who use Dropbox as long-term photo storage accumulate thousands of duplicate and near-duplicate images over years of uploads from multiple devices. These duplicates waste storage, clutter libraries, and make it harder to find specific memories. **PhotoNest** is a desktop application that scans a user's Dropbox photo folders, identifies exact and visually similar duplicates, and lets the user safely review and delete them — without ever moving photos out of Dropbox.

**Why now:** Dropbox storage costs are rising, AI-based image similarity detection is now cheap and accurate enough to run locally, and consumers are increasingly storage-conscious as phone cameras produce larger files.

## 2. Vision

Within three years, PhotoNest is the trusted tool people reach for whenever their cloud photo library feels out of control. It expands beyond Dropbox to Google Drive, OneDrive, and iCloud, and grows from a duplicate finder into a lightweight library health tool — surfacing not just duplicates, but blurry shots, screenshots, and forgotten albums worth revisiting.

## 3. Objectives

**User objectives**
- Reclaim at least 20% of photo storage on a typical cluttered library
- Complete a full review-and-clean session in under 30 minutes
- Trust that no irreplaceable photo will be lost in the process

**Business objectives**
- Reach 10,000 active users within 12 months of launch
- Achieve a 4.5+ rating on relevant app stores and review sites
- Establish PhotoNest as the reference duplicate finder for Dropbox users

## 4. Key Principles

- **Safety first.** No destructive action happens without explicit user confirmation and a recoverable trash window.
- **Local processing.** Image analysis happens on the user's device. Photos are never uploaded to PhotoNest servers.
- **Progressive disclosure.** Default UI is simple; power features are available but never in the way.
- **Honest results.** When confidence is low, say so. Never silently merge or delete uncertain matches.
- **Respect the user's library.** PhotoNest reads and deletes; it never reorganises, renames, or restructures.

## 5. Target Users and Personas

### Primary Persona — "The Family Archivist"
- **Name:** Sarah, 38
- **Context:** Parent of two, uses Dropbox to store ~15 years of family photos across multiple phones and cameras. Has roughly 60,000 photos and is paying for the 2TB plan.
- **Goals:** Stop paying for the next storage tier, find specific photos faster, eventually organise the library.
- **Frustrations:** Doesn't trust automated tools after a bad iCloud experience. Worried about losing irreplaceable shots.
- **Tech comfort:** Medium. Comfortable with desktop apps, not the command line.

### Secondary Persona — "The Prosumer Photographer"
- **Name:** Marcus, 29
- **Context:** Hobbyist photographer who shoots in RAW + JPEG and uploads everything to Dropbox before culling.
- **Goals:** Quickly remove obvious duplicates before importing into Lightroom.
- **Frustrations:** Existing tools don't handle RAW files or treat RAW + JPEG pairs intelligently.

### Anti-Persona
- Professional studios with dedicated DAM (digital asset management) systems. PhotoNest is not a Lightroom or Photo Mechanic replacement.

### Top Pain Points
1. **Storage anxiety.** Constantly approaching plan limits with no clear way to free space.
2. **Multi-device duplication.** The same photo uploaded from phone, tablet, and laptop appears as three separate files.
3. **Near-duplicates from burst mode.** Ten nearly-identical shots of the same moment, none deleted.
4. **Fear of loss.** Existing tools delete without confidence, and users have been burned before.
5. **Folder chaos.** Photos scattered across `Camera Uploads`, `Photos`, manual folders, and shared folders — duplicates often live in different places.

### Current Alternatives and Gaps
- **Manual review:** accurate but unbearably slow.
- **Generic duplicate finders (e.g. Gemini, dupeGuru):** work on local files, don't integrate with Dropbox, force the user to download everything first.
- **Dropbox's own tools:** none for duplicate detection.
- **Cloud-based services:** require uploading photos elsewhere — privacy-prohibitive for most users.

## 6. Key Features

### High Priority
- **Dropbox OAuth integration** — Connect once, scan any folder.
- **Exact duplicate detection** — Hash-based, near-instant for identical files.
- **Visual similarity detection** — Perceptual hashing (pHash) plus optional ML-based similarity for near-duplicates.
- **Side-by-side review UI** — Compare matched groups visually with metadata (date, size, dimensions, location).
- **Smart selection** — Auto-suggest "keep the largest / newest / highest resolution" with one click.
- **Safe delete** — Move to a 30-day trash folder inside Dropbox, never permanent immediately.
- **Scan progress and resumability** — Large libraries take time; users should be able to pause and resume.

### Medium Priority
- **Burst-mode grouping** — Detect and group sequential shots taken within seconds.
- **RAW + JPEG pair handling** — Recognise pairs and treat them as a single asset.
- **Folder filtering** — Exclude shared folders, specific paths, or file types.
- **Scan history** — Remember what's been reviewed so re-scans only show new finds.

### Low Priority
- **Blurry photo detection**
- **Screenshot detection and bulk delete**
- **Storage savings dashboard** with before/after charts
- **Scheduled background scans**

## 7. MVP Scope

**Must-have**
- Dropbox OAuth and folder selection
- Exact + perceptual hash duplicate detection
- Side-by-side review UI
- Smart selection ("keep largest")
- Safe delete to a Dropbox-side trash folder
- Pause/resume scans
- macOS and Windows desktop builds

**Deferred to V1+**
- ML-based similarity (beyond pHash)
- Burst grouping, RAW pair handling
- Blurry/screenshot detection
- Storage dashboard

**Out of scope**
- Mobile apps
- Other cloud providers (Google Drive, OneDrive, iCloud)
- Photo organising, tagging, or editing features
- Cloud-based processing of any kind

**Complexity assessment:** Medium. Dropbox API integration and the review UI are straightforward; the trickiest pieces are reliable scan resumability over very large libraries and tuning perceptual hash thresholds to minimise false positives.

## 8. Technical Approach

**Architecture overview**
- Cross-platform desktop app (Electron or Tauri)
- Local SQLite database for scan state, hashes, and review history
- All image analysis runs on-device

**Key components**
- **Dropbox Connector** — OAuth, paginated file listing, streaming downloads, delete API
- **Hash Engine** — MD5 for exact match, pHash for perceptual similarity
- **Match Grouper** — Clusters images by hash distance
- **Review UI** — Electron/Tauri renderer with side-by-side image viewer
- **Trash Manager** — Manages the `_PhotoNest Trash` folder inside Dropbox

**Data flow**
1. User connects Dropbox account via OAuth
2. App lists image files in selected folders (metadata only)
3. Files are streamed locally in batches; thumbnails and hashes are computed and stored in SQLite
4. Match groups are surfaced to the user
5. On user confirmation, files are moved to the trash folder via Dropbox API

**Integration points**
- Dropbox API v2 (files list, download, move, delete)
- OS-level keychain for token storage

**Security and privacy**
- OAuth tokens stored in OS keychain
- No telemetry beyond opt-in crash reporting
- No image data ever leaves the user's machine
- Open-source the hash engine to build trust

**Scalability**
- Designed to handle libraries up to ~250,000 photos on consumer hardware
- Batched processing with backpressure to avoid Dropbox API rate limits

## 9. Success Metrics

**North star**
- **GB of storage reclaimed per active user per month**

**Supporting KPIs**
- *Activation:* % of installs that complete their first scan (target: 70%)
- *Engagement:* % of users who delete at least one duplicate (target: 60%)
- *Retention:* % of users who run a second scan within 30 days (target: 35%)
- *Trust:* support tickets per 1,000 users related to "lost photos" (target: <0.5)
- *Quality:* false-positive rate in match groups (target: <2%)

**Measurement approach**
- Anonymous, opt-in usage analytics (counts only, no file data)
- In-app NPS prompt after first successful clean
- App store reviews monitored weekly

## 10. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| User loses an irreplaceable photo | Brand-killing | 30-day Dropbox trash window; explicit confirmation; never bypass Dropbox's own deleted-files recovery |
| Dropbox API rate limits cause scans to fail mid-run | High | Resumable scans; exponential backoff; clear progress UI |
| Perceptual hash false positives | Medium-high | Conservative default thresholds; user can adjust sensitivity; always show side-by-side preview |
| Dropbox changes API or pricing terms | Medium | Architect connector as a swappable module to ease future provider additions |
| Large libraries crash low-RAM machines | Medium | Streaming processing; never load entire library into memory |
| Privacy concerns deter installs | Medium | Open-source the engine; clear privacy messaging; no telemetry by default |

## 11. Open Questions

- What's the right pricing model — one-time purchase, freemium with a free-tier file limit, or subscription? *(Owner: PM, target: before MVP launch)*
- Should the trash folder live inside the user's photo folder or in a top-level location? *(Owner: UX, target: design phase)*
- Is Tauri mature enough for production, or should we ship Electron first? *(Owner: Eng Lead, target: technical spike in week 2)*
- How do we handle photos in shared Dropbox folders, where the user may not have delete permission? *(Owner: PM + Eng, target: design phase)*
- Do we need a Linux build at launch, or is macOS + Windows sufficient? *(Owner: PM, target: before MVP launch)*

## 12. Product Roadmap

**Phase 0 — Foundations (Months 1–2)**
- Dropbox API integration spike
- pHash threshold tuning on test libraries
- UI prototype and user testing

**Phase 1 — MVP (Months 3–5)**
- All must-have features
- Closed beta with 50 users
- macOS + Windows builds

**Phase 2 — V1 Public Launch (Month 6)**
- Public release on a paid model
- Burst grouping and RAW pair handling
- Storage savings dashboard

**Phase 3 — V1.5 (Months 7–9)**
- Blurry and screenshot detection
- Scheduled background scans
- Linux build

**Phase 4 — V2: Multi-cloud (Months 10–12)**
- Google Drive connector
- OneDrive connector
- Unified library view across providers

**Dependencies**
- Phase 1 depends on Dropbox API stability and OAuth approval
- Phase 4 requires connector abstraction completed in Phase 1

---

## References

- Product management best practices (PRD structuring, JTBD frameworks)
- Systems architecture principles (scalability, integration design)
- Agile engineering practices (MVP scoping and delivery)
- Data product design (metrics and observability)