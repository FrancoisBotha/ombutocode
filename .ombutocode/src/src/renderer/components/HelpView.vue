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
            <strong>Switch to Plan mode</strong> — Click the <strong>Plan</strong> tab to see the
            file tree and start editing requirements.
          </li>
          <li>
            <strong>Define your structure</strong> — Open <code>Structure/ProjectStructure.md</code>
            to outline your system components.
          </li>
          <li>
            <strong>Write requirements</strong> — Add use cases, functional requirements, and
            non-functional requirements.
          </li>
          <li>
            <strong>Switch to Build mode</strong> — Use the backlog, board, and coding agents to
            turn requirements into working code.
          </li>
        </ol>
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
