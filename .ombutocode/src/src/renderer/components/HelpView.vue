<template>
  <div class="help-view">
    <div class="help-header">
      <h1>Help</h1>
      <p class="help-subtitle">Learn how to use Ombuto Code</p>
    </div>

    <div class="help-content">

      <section class="help-section">
        <h2><span class="mdi mdi-information-outline"></span> What is Ombuto Code?</h2>
        <p>
          Ombuto Code is an Agentic Software Engineering Workbench that supports the full
          development lifecycle — from requirements definition and solution architecture
          to automated development and validation.
        </p>
        <p>
          The application is split into two modes: <strong>Plan</strong> for requirements
          engineering, and <strong>Build</strong> for automated development workflows.
        </p>
      </section>

      <section class="help-section">
        <h2><span class="mdi mdi-map-outline"></span> Plan Mode</h2>
        <p>
          The Plan tab provides tools for structured requirements management. All documents
          live in the <code>docs/</code> directory at the project root, versioned alongside your code.
        </p>
        <div class="help-features">
          <div class="help-feature">
            <span class="mdi mdi-sitemap"></span>
            <div>
              <strong>Structure</strong>
              <p>Define your project's system decomposition — systems, subsystems, and components.</p>
            </div>
          </div>
          <div class="help-feature">
            <span class="mdi mdi-file-document-outline"></span>
            <div>
              <strong>PRD</strong>
              <p>Write your Product Requirements Document with goals, personas, and success metrics.</p>
            </div>
          </div>
          <div class="help-feature">
            <span class="mdi mdi-text-box-multiple-outline"></span>
            <div>
              <strong>Use Cases</strong>
              <p>Create use case documents with actors, flows, preconditions, and postconditions.</p>
            </div>
          </div>
          <div class="help-feature">
            <span class="mdi mdi-vector-polygon"></span>
            <div>
              <strong>Use Case Diagrams</strong>
              <p>Visual editor for UML use case diagrams with actors, use cases, and relationships.</p>
            </div>
          </div>
          <div class="help-feature">
            <span class="mdi mdi-shape-outline"></span>
            <div>
              <strong>Class Diagrams</strong>
              <p>Visual editor for UML class diagrams with attributes, operations, and associations.</p>
            </div>
          </div>
          <div class="help-feature">
            <span class="mdi mdi-format-list-checks"></span>
            <div>
              <strong>Requirements</strong>
              <p>Manage functional and non-functional requirements in tabular format. Export/import via Excel.</p>
            </div>
          </div>
          <div class="help-feature">
            <span class="mdi mdi-image-multiple"></span>
            <div>
              <strong>Mockups</strong>
              <p>View mockup images from <code>docs/Mockups/</code> in a lightbox gallery.</p>
            </div>
          </div>
          <div class="help-feature">
            <span class="mdi mdi-note-text"></span>
            <div>
              <strong>Scratch Pad</strong>
              <p>Quick notes and ideas stored as text files.</p>
            </div>
          </div>
        </div>
        <div class="help-tip">
          <span class="mdi mdi-lightbulb-outline"></span>
          <p>
            <strong>Tip:</strong> Click any file in the sidebar tree to preview and edit it.
            Right-click folders to create sub-folders. Drag files between folders to reorganise.
          </p>
        </div>
      </section>

      <section class="help-section">
        <h2><span class="mdi mdi-hammer-wrench"></span> Build Mode</h2>
        <p>
          The Build tab provides tools for managing the automated development workflow.
        </p>
        <div class="help-features">
          <div class="help-feature">
            <span class="mdi mdi-view-dashboard-outline"></span>
            <div>
              <strong>Workspace</strong>
              <p>Git status overview, commit graph, and integrated terminal.</p>
            </div>
          </div>
          <div class="help-feature">
            <span class="mdi mdi-view-column"></span>
            <div>
              <strong>Board</strong>
              <p>Kanban board showing tickets across workflow stages (backlog, todo, in-progress, review, done).</p>
            </div>
          </div>
          <div class="help-feature">
            <span class="mdi mdi-robot-outline"></span>
            <div>
              <strong>Coding Agents</strong>
              <p>Configure AI coding agents with models, providers, and tool settings.</p>
            </div>
          </div>
          <div class="help-feature">
            <span class="mdi mdi-lightning-bolt-outline"></span>
            <div>
              <strong>Automation</strong>
              <p>Monitor the scheduler, active agent runs, and evaluation queue.</p>
            </div>
          </div>
          <div class="help-feature">
            <span class="mdi mdi-text-box-outline"></span>
            <div>
              <strong>Logs</strong>
              <p>View event logs from agent runs, scheduler actions, and system events.</p>
            </div>
          </div>
        </div>
        <div class="help-tip">
          <span class="mdi mdi-lightbulb-outline"></span>
          <p>
            <strong>Tip:</strong> Use the <strong>Auto</strong> toggle at the bottom of the sidebar
            to start/stop the scheduler, which automatically assigns agents to todo tickets.
          </p>
        </div>
      </section>

      <section class="help-section">
        <h2><span class="mdi mdi-rocket-launch-outline"></span> Getting Started</h2>
        <ol class="help-steps">
          <li>
            <strong>Initialise starter data</strong> — Run <code>.ombutocode/initombuto.bat</code>
            to reset the workspace and populate <code>docs/</code> with sample content.
          </li>
          <li>
            <strong>Configure a coding agent</strong> — Go to <strong>Settings > Coding Agents</strong>,
            install a CLI (e.g. Claude), and click <strong>Test</strong> to verify connectivity.
          </li>
          <li>
            <strong>Create your PRD</strong> — Switch to <strong>Plan > PRD</strong> and click
            <strong>Create PRD</strong>. The AI agent guides you through defining your product
            requirements interactively. <em>See "Start with the PRD" below.</em>
          </li>
          <li>
            <strong>Define your architecture</strong> — Go to <strong>Plan > Architecture</strong>
            and click <strong>Create Architecture</strong>. The AI reads your PRD for context and
            guides you through technology choices, components, and design decisions.
            <em>See "Define your Architecture" below.</em>
          </li>
          <li>
            <strong>Create epics</strong> — Go to <strong>Plan > Epic Creation</strong> and click
            <strong>Create Initial Epics</strong>. The AI breaks your PRD into deliverable milestones.
            <em>See "Create Epics" below.</em>
          </li>
          <li>
            <strong>Generate tickets</strong> — Go to <strong>Plan > Ticket Generation</strong>,
            select an epic, and generate implementation tickets for the backlog.
          </li>
          <li>
            <strong>Switch to Build mode</strong> — Assign agents to tickets on the Board,
            and enable <strong>Auto</strong> to let the scheduler drive automated development.
          </li>
        </ol>
      </section>

      <section class="help-section">
        <h2><span class="mdi mdi-file-document-outline"></span> Start with the PRD</h2>
        <p>
          The Product Requirements Document is the foundation of every project in Ombuto Code.
          It captures your product's vision, goals, users, features, and success criteria —
          everything the AI coding agents need to build the right thing.
        </p>

        <h3>Why start here?</h3>
        <p>
          A well-written PRD serves as the single source of truth. When agents pick up tickets
          in Build mode, they reference the PRD to understand context and make better decisions.
          The more complete your PRD, the better the automated output.
        </p>

        <h3>Creating a PRD with AI assistance</h3>
        <ol class="help-steps">
          <li>
            <strong>Go to Plan > PRD</strong> — click the PRD icon in the Plan sidebar nav bar.
          </li>
          <li>
            <strong>Choose a skill</strong> — the left panel shows a dropdown of available skills.
            The <em>PRD Guide</em> skill is auto-selected and provides structured instructions
            to the AI agent on how to walk you through each section.
          </li>
          <li>
            <strong>Click "Create PRD"</strong> — this launches your default coding agent
            (configured in Settings > Coding Agents) in an interactive terminal on the right panel.
          </li>
          <li>
            <strong>Answer the agent's questions</strong> — the AI will guide you through each
            section one at a time: overview, goals, users, features, metrics, and constraints.
          </li>
          <li>
            <strong>Review the result</strong> — the agent saves the PRD to
            <code>docs/Product Requirements Document/PRD.md</code>. Click "View" to see the
            rendered Markdown, or "Edit" to make manual adjustments.
          </li>
        </ol>

        <h3>Refining an existing PRD</h3>
        <p>
          If you already have a PRD, click <strong>"Refine with AI"</strong> instead. The agent
          reads your existing document, identifies gaps or weak areas, and suggests improvements
          section by section — waiting for your approval before making changes.
        </p>

        <h3>Skills as system prompts</h3>
        <p>
          Skills are reusable Markdown documents in <code>docs/Skills/</code> that act as system
          prompts for AI agents. The PRD page lets you select a skill before starting a session —
          its content is prepended to the agent's instructions. You can create custom skills
          (e.g. "Healthcare PRD Template" or "Mobile App PRD Guide") to tailor the AI's approach
          for different project types.
        </p>

        <div class="help-tip">
          <span class="mdi mdi-lightbulb-outline"></span>
          <p>
            <strong>Tip:</strong> You can also access "Create PRD" and "Refine with AI" buttons
            directly from the file preview when viewing a PRD document.
          </p>
        </div>
      </section>

      <section class="help-section">
        <h2><span class="mdi mdi-layers-outline"></span> Define your Architecture</h2>
        <p>
          Once your PRD is in place, the next step is to define how the system will be built.
          The Architecture document captures your technology choices, system components,
          data design, security model, and deployment strategy.
        </p>

        <h3>Why architecture matters</h3>
        <p>
          A clear architecture document ensures that everyone — including AI coding agents —
          understands the technical boundaries and conventions of the project. When agents
          generate code, they reference the architecture to choose the right patterns, frameworks,
          and integration approaches.
        </p>

        <h3>Creating an Architecture document with AI</h3>
        <ol class="help-steps">
          <li>
            <strong>Go to Plan > Architecture</strong> — click the Architecture icon
            (<span class="mdi mdi-layers-outline" style="font-size: 1em;"></span>) in the Plan sidebar nav bar.
          </li>
          <li>
            <strong>Select a skill</strong> — the <em>Architecture Guide</em> skill is auto-selected,
            providing structured guidance on system overview, tech stack, components, APIs,
            security, infrastructure, and scalability.
          </li>
          <li>
            <strong>Click "Create Architecture"</strong> — this launches your default coding agent.
            The agent automatically reads your PRD for context, so it can tailor architectural
            recommendations to your product's requirements.
          </li>
          <li>
            <strong>Walk through the sections</strong> — the AI guides you through architecture
            style, technology stack, component design, data architecture, security, deployment,
            and more. Answer its questions and it builds the document incrementally.
          </li>
          <li>
            <strong>Review and refine</strong> — the document is saved to
            <code>docs/Architecture/Architecture.md</code>. Use "Refine with AI" later to
            revisit and improve specific sections as your understanding evolves.
          </li>
        </ol>

        <h3>PRD as context</h3>
        <p>
          The Architecture page automatically passes your PRD as a context file to the AI agent.
          This means the agent understands your product goals, features, and constraints before
          making any architectural recommendations — resulting in a design that is aligned with
          what you are actually building.
        </p>

        <div class="help-tip">
          <span class="mdi mdi-lightbulb-outline"></span>
          <p>
            <strong>Tip:</strong> Create your PRD first, then Architecture. Each subsequent
            document builds on the previous ones. The AI reads related documents automatically,
            so your architecture will be grounded in your product requirements.
          </p>
        </div>
      </section>

      <section class="help-section">
        <h2><span class="mdi mdi-flag-outline"></span> Create Epics</h2>
        <p>
          With your PRD and Architecture in place, the next step is to break the requirements
          down into <strong>epics</strong> — deliverable milestones that can each be independently
          developed and verified.
        </p>

        <h3>What is an epic?</h3>
        <p>
          An epic represents a significant piece of functionality that typically maps to a
          milestone or a feature area. Each epic contains its own scope, acceptance criteria,
          functional requirements, and implementation notes. Epics follow the lifecycle:
          <strong>NEW → TICKETS → BUILDING → DONE</strong>.
        </p>

        <h3>Creating epics with AI</h3>
        <ol class="help-steps">
          <li>
            <strong>Go to Plan > Epic Creation</strong> — click "Epic Creation" in the Plan sidebar.
          </li>
          <li>
            <strong>Select context documents</strong> — choose your PRD, Architecture, Data Model,
            and Style Guide. The AI agent reads all of these to understand the full project scope.
          </li>
          <li>
            <strong>Click "Create Initial Epics"</strong> — the agent analyses your PRD and proposes
            a breakdown into epics, each with a one-line summary. You confirm before the files are created.
          </li>
          <li>
            <strong>Review the epics</strong> — each epic is saved as a Markdown file in
            <code>docs/Epics/</code> with a 13-section structure (Purpose, User Story, Scope,
            Functional Requirements, NFRs, UI/UX Notes, Data Model Impact, etc.).
          </li>
          <li>
            <strong>Functional requirements are cross-referenced</strong> — when an epic contains
            FRs or NFRs, they are automatically added to the requirements tables in
            <code>docs/Functional Requirements/</code> and <code>docs/Non-Functional Requirements/</code>
            with a link back to the epic.
          </li>
        </ol>

        <h3>After creating epics</h3>
        <p>
          Once epics are created, you can:
        </p>
        <div class="help-features">
          <div class="help-feature">
            <span class="mdi mdi-ticket-outline"></span>
            <div>
              <strong>Generate tickets</strong>
              <p>Go to <strong>Plan > Ticket Generation</strong> to break each epic into concrete
              implementation tickets that agents can pick up in Build mode.</p>
            </div>
          </div>
          <div class="help-feature">
            <span class="mdi mdi-pencil-outline"></span>
            <div>
              <strong>Refine with AI</strong>
              <p>Click on an epic in the file tree and use "Refine with AI" to improve specific sections.</p>
            </div>
          </div>
          <div class="help-feature">
            <span class="mdi mdi-plus"></span>
            <div>
              <strong>Create manually</strong>
              <p>Use "New Epic (manual)" on the Epic Creation page to create a blank epic from the template.</p>
            </div>
          </div>
        </div>

        <div class="help-tip">
          <span class="mdi mdi-lightbulb-outline"></span>
          <p>
            <strong>Coming soon:</strong> Epics can be extended with linked UI mockups from the
            Mockups page. When mockups are linked to an epic, they are automatically included as
            references in the generated tickets so coding agents can see the target visual design.
          </p>
        </div>
      </section>

      <section class="help-section">
        <h2><span class="mdi mdi-robot-outline"></span> Coding Agents</h2>
        <p>
          Ombuto Code can launch AI coding agents (Claude, Codex, Kimi) to automatically
          implement backlog tickets. Go to <strong>Settings > Coding Agents</strong> to test
          connectivity and see the full setup guide.
        </p>
      </section>

      <section class="help-section">
        <h2><span class="mdi mdi-keyboard"></span> Keyboard Shortcuts</h2>
        <div class="help-shortcuts">
          <div class="help-shortcut">
            <kbd>Ctrl</kbd> + <kbd>S</kbd>
            <span>Save current document</span>
          </div>
          <div class="help-shortcut">
            <kbd>Escape</kbd>
            <span>Cancel editing / close modal</span>
          </div>
        </div>
      </section>

    </div>
  </div>
</template>

<script>
export default { name: 'HelpView' };
</script>

<style scoped>
.help-view {
  flex: 1;
  overflow-y: auto;
  background-color: var(--bg-color, #161a1f);
  color: var(--text-color, #d4d8dd);
  padding: 2rem;
}

.help-header {
  margin-bottom: 2rem;
}

.help-header h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
}

.help-subtitle {
  margin: 0.25rem 0 0;
  color: var(--text-muted, #8b929a);
  font-size: 0.9rem;
}

.help-content {
  max-width: 720px;
}

.help-section {
  margin-bottom: 2.5rem;
}

.help-section h2 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 0.75rem;
  color: var(--text-color, #d4d8dd);
}

.help-section h2 .mdi {
  font-size: 1.2rem;
  color: #6dd4a0;
}

.help-section > p {
  margin: 0 0 0.75rem;
  font-size: 0.88rem;
  line-height: 1.65;
  color: rgba(255, 255, 255, 0.6);
  font-weight: 300;
}

.help-section code {
  background: rgba(255, 255, 255, 0.06);
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  font-size: 0.82rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #6dd4a0;
}

/* Feature grid */
.help-features {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 0.75rem 0;
}

.help-feature {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.help-feature > .mdi {
  font-size: 1.25rem;
  color: rgba(255, 255, 255, 0.35);
  flex-shrink: 0;
  margin-top: 0.1rem;
}

.help-feature strong {
  display: block;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 0.15rem;
}

.help-feature p {
  margin: 0;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.5;
  font-weight: 300;
}

/* Tip box */
.help-tip {
  display: flex;
  gap: 0.6rem;
  padding: 0.75rem;
  border-radius: 6px;
  background: rgba(109, 212, 160, 0.06);
  border: 1px solid rgba(109, 212, 160, 0.12);
  margin-top: 0.75rem;
}

.help-tip > .mdi {
  font-size: 1.1rem;
  color: #6dd4a0;
  flex-shrink: 0;
}

.help-tip p {
  margin: 0;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.55);
  line-height: 1.5;
}

.help-tip strong {
  color: #6dd4a0;
}

/* Steps */
.help-steps {
  margin: 0;
  padding: 0 0 0 1.25rem;
  list-style: decimal;
}

.help-steps li {
  margin-bottom: 0.6rem;
  font-size: 0.85rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.55);
  font-weight: 300;
}

.help-steps li strong {
  color: rgba(255, 255, 255, 0.8);
  font-weight: 500;
}

/* Shortcuts */
.help-shortcuts {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.help-shortcut {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.5);
}

/* Agent table */
.help-agent-table {
  margin: 0.75rem 0;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.help-agent-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.help-agent-table th {
  text-align: left;
  padding: 0.5rem 0.65rem;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.5);
  font-weight: 600;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.help-agent-table td {
  padding: 0.45rem 0.65rem;
  color: rgba(255, 255, 255, 0.6);
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.help-section h3 {
  font-size: 0.92rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.75);
  margin: 1.5rem 0 0.6rem;
}

.help-list {
  margin: 0;
  padding: 0 0 0 1.25rem;
}

.help-list li {
  margin-bottom: 0.35rem;
  font-size: 0.85rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.55);
  font-weight: 300;
}

.help-list li strong {
  color: rgba(255, 255, 255, 0.8);
  font-weight: 500;
}

kbd {
  display: inline-block;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.7);
  min-width: 1.5rem;
  text-align: center;
}
</style>
