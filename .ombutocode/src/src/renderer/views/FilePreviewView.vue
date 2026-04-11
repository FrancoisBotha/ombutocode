<template>
  <div class="file-preview-view" :class="{ 'file-preview-view--edit': isEditMode }">
    <div v-if="loading" class="state-card">
      <p class="state-text">Loading file...</p>
    </div>

    <div v-else-if="notFound" class="state-card">
      <h1>File not found</h1>
      <p class="state-text">The requested Markdown file could not be loaded.</p>
    </div>

    <div v-else class="preview-layout">
      <header class="title-bar">
        <div class="title-copy">
          <p class="folder-path">{{ folderBreadcrumb }}</p>
          <h1 class="file-name">{{ fileName }}</h1>
        </div>
        <div v-if="!isImage" class="title-actions">
          <template v-if="isStyleGuide && !viewingHistorical && !isEditMode">
            <button class="back-btn" type="button" @click="backToStyleGuide">
              <span class="mdi mdi-arrow-left"></span> Style Guide
            </button>
            <button class="prd-ai-btn" type="button" @click="createStyleGuide">
              <span class="mdi mdi-robot-outline"></span> Create Style Guide
            </button>
            <button class="prd-ai-btn" type="button" @click="refineStyleGuideWithAi">
              <span class="mdi mdi-pencil-outline"></span> Refine with AI
            </button>
            <button class="preview-html-btn" type="button" @click="generateHtmlPreview" :disabled="generatingPreview">
              <span class="mdi mdi-language-html5"></span> Quick Preview
            </button>
            <button v-if="aiPreviewExists" class="preview-html-btn" type="button" @click="loadExistingAiPreview">
              <span class="mdi mdi-eye-outline"></span> View AI Preview
            </button>
            <button class="prd-ai-btn" type="button" @click="generateAiHtmlPreview" :disabled="generatingAiPreview">
              <span class="mdi mdi-language-html5"></span> {{ generatingAiPreview ? 'Generating...' : (aiPreviewExists ? 'Regenerate' : 'AI Enhanced Preview') }}
            </button>
          </template>
          <button v-if="isEpic && !viewingHistorical && !isEditMode" class="back-btn" type="button" @click="backToEpics">
            <span class="mdi mdi-arrow-left"></span> Epics
          </button>
          <template v-if="isEpic && !viewingHistorical && !isEditMode">
            <button class="prd-ai-btn" type="button" @click="refineEpicWithAi">
              <span class="mdi mdi-pencil-outline"></span> Refine with AI
            </button>
          </template>
          <button v-if="isSkill && !viewingHistorical && !isEditMode" class="back-btn" type="button" @click="backToSkills">
            <span class="mdi mdi-arrow-left"></span> Skills
          </button>
          <template v-if="isPrd && !viewingHistorical && !isEditMode">
            <button class="prd-ai-btn" type="button" @click="createNewPrd">
              <span class="mdi mdi-robot-outline"></span> Create PRD
            </button>
            <button class="prd-ai-btn" type="button" @click="refinePrdWithAi">
              <span class="mdi mdi-pencil-outline"></span> Refine with AI
            </button>
          </template>
          <template v-if="isArchitecture && !viewingHistorical && !isEditMode">
            <button class="prd-ai-btn" type="button" @click="createNewArch">
              <span class="mdi mdi-robot-outline"></span> Create Architecture
            </button>
            <button class="prd-ai-btn" type="button" @click="refineArchWithAi">
              <span class="mdi mdi-pencil-outline"></span> Refine with AI
            </button>
          </template>
          <template v-if="!viewingHistorical && !isEditMode">
            <button class="edit-btn" type="button" @click="onEdit">Edit</button>
          </template>
          <template v-if="isEditMode">
            <button class="cancel-btn" type="button" @click="onCancelEdit">Cancel</button>
            <button class="save-btn" type="button" @click="onSave" :disabled="saving">{{ saving ? 'Saving...' : 'Save' }}</button>
          </template>
          <button
            class="versions-btn"
            type="button"
            :disabled="versionsButtonDisabled"
            @click="toggleVersionsPanel"
          >
            {{ versionsButtonLabel }}
          </button>
        </div>
      </header>

      <div v-if="viewingHistorical" class="history-banner">
        <span class="history-banner__text">Viewing version from {{ historicalDate }} &mdash; {{ historicalMessage }}</span>
        <button class="history-banner__back" type="button" @click="backToCurrent">Back to current</button>
      </div>

      <div v-if="historicalError" class="state-card">
        <p class="state-text">{{ historicalError }}</p>
      </div>

      <div v-else-if="isEditMode && !viewingHistorical" class="editor-split">
        <div class="editor-pane">
          <div ref="editorContainer" class="codemirror-container"></div>
        </div>
        <div class="preview-pane">
          <article class="markdown-body" v-html="editPreviewHtml"></article>
        </div>
      </div>

      <div v-else-if="isImage" class="image-preview">
        <img v-if="imageDataUrl" :src="imageDataUrl" :alt="fileName" class="image-full" />
        <p v-else class="state-text">Loading image...</p>
      </div>

      <article v-else class="markdown-body" v-html="renderedHtml"></article>
    </div>

    <VersionsPanel
      :entries="versionEntries"
      :loading="versionsLoading"
      :open="isVersionsPanelOpen"
      @close="closeVersionsPanel"
      @select-version="handleVersionSelect"
    />

    <!-- AI Preview Session -->
    <Teleport to="body">
      <div v-if="showAiPreviewSession" class="html-preview-overlay">
        <div class="html-preview-modal">
          <div class="html-preview-header">
            <span class="mdi mdi-robot-outline"></span>
            <span>AI Enhanced Style Guide Preview</span>
            <div style="flex:1"></div>
            <button class="preview-html-btn" type="button" style="margin-right:0.5rem" @click="loadAiPreviewResult">
              <span class="mdi mdi-eye-outline"></span> View Result
            </button>
            <button class="html-preview-close" @click="stopAiPreview">
              <span class="mdi mdi-close"></span>
            </button>
          </div>
          <div ref="aiPreviewTermContainer" class="ai-preview-terminal"></div>
        </div>
      </div>
    </Teleport>

    <!-- HTML Preview Modal -->
    <Teleport to="body">
      <div v-if="showHtmlPreview" class="html-preview-overlay" @click.self="showHtmlPreview = false">
        <div class="html-preview-modal">
          <div class="html-preview-header">
            <span class="mdi mdi-language-html5"></span>
            <span>Style Guide HTML Preview</span>
            <div style="flex:1"></div>
            <button class="html-preview-close" @click="showHtmlPreview = false">
              <span class="mdi mdi-close"></span>
            </button>
          </div>
          <iframe class="html-preview-frame" :srcdoc="htmlPreviewContent"></iframe>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown as markdownLang } from '@codemirror/lang-markdown';
import VersionsPanel from '../components/VersionsPanel.vue';

let watcherRegistered = false;
const fileChangeSubscribers = new Set();
const markdownRenderer = new marked.Renderer();

markdownRenderer.code = function codeRenderer(codeToken, infostring) {
  const source = typeof codeToken === 'string' ? codeToken : codeToken.text || '';
  const rawLanguage = typeof codeToken === 'string' ? infostring : codeToken.lang;
  const language = rawLanguage && hljs.getLanguage(rawLanguage) ? rawLanguage : null;
  const highlighted = language
    ? hljs.highlight(source, { language }).value
    : hljs.highlightAuto(source).value;
  const className = language ? `language-${language}` : 'language-plaintext';
  return `<pre><code class="hljs ${className}">${highlighted}</code></pre>`;
};

function ensureFileWatcher() {
  if (watcherRegistered || typeof window === 'undefined') {
    return;
  }

  window.electron.ipcRenderer.on('watcher:fileChanged', (payload) => {
    fileChangeSubscribers.forEach((subscriber) => subscriber(payload));
  });
  watcherRegistered = true;
}

marked.setOptions({
  gfm: true,
  breaks: true,
  renderer: markdownRenderer,
});

export default {
  name: 'FilePreviewView',
  components: {
    VersionsPanel,
  },
  props: {
    filePath: { type: String, default: '' }
  },
  setup(props) {
    const route = useRoute();
    const router = useRouter();
    const loading = ref(false);
    const notFound = ref(false);
    const markdown = ref('');
    const activePath = ref('');
    const versionEntries = ref([]);
    const versionsLoading = ref(false);
    const isVersionsPanelOpen = ref(false);

    const isEditMode = computed(() => route.query.edit === '1');
    const editorContainer = ref(null);
    const editContent = ref('');
    const editPreviewHtml = ref('');
    const originalContent = ref('');
    const saving = ref(false);
    let editorView = null;
    let previewDebounce = null;
    const viewingHistorical = ref(false);
    const historicalHash = ref('');
    const historicalDate = ref('');
    const historicalMessage = ref('');
    const historicalError = ref('');

    const IMAGE_EXTS = /\.(png|jpg|jpeg|gif|bmp|webp|svg)$/i;
    const imageDataUrl = ref('');

    const isImage = computed(() => IMAGE_EXTS.test(activePath.value));
    const isPrd = computed(() => activePath.value.startsWith('Product Requirements Document/') && activePath.value.endsWith('.md'));
    const isSkill = computed(() => activePath.value.startsWith('Skills/') && activePath.value.endsWith('.md'));
    const isArchitecture = computed(() => activePath.value.startsWith('Architecture/') && activePath.value.endsWith('.md'));
    const isEpic = computed(() => activePath.value.startsWith('Epics/') && activePath.value.endsWith('.md'));
    const isStyleGuide = computed(() => activePath.value.startsWith('Style Guide/') && activePath.value.endsWith('.md'));
    const isDataModel = computed(() => activePath.value.startsWith('Data Model/'));

    function refinePrdWithAi() {
      if (window.__planNavigate) window.__planNavigate('plan-prd');
    }

    function createNewPrd() {
      if (window.__planNavigate) window.__planNavigate('plan-prd');
    }

    function refineArchWithAi() {
      if (window.__planNavigate) window.__planNavigate('plan-architecture');
    }

    function createNewArch() {
      if (window.__planNavigate) window.__planNavigate('plan-architecture');
    }

    function createStyleGuide() {
      if (window.__planNavigate) window.__planNavigate('plan-style-guide');
    }

    function refineStyleGuideWithAi() {
      if (window.__planNavigate) window.__planNavigate('plan-style-guide');
    }

    function backToStyleGuide() {
      if (window.__planNavigate) window.__planNavigate('plan-style-guide');
    }

    const generatingPreview = ref(false);
    const generatingAiPreview = ref(false);
    const showHtmlPreview = ref(false);
    const htmlPreviewContent = ref('');
    const showAiPreviewSession = ref(false);
    const aiPreviewShellId = ref('');
    const aiPreviewTermContainer = ref(null);
    const aiPreviewExists = ref(false);

    async function checkAiPreviewExists() {
      try {
        await window.electron.ipcRenderer.invoke('filetree:readFile', 'Style Guide/StyleGuide_Preview_AI.html');
        aiPreviewExists.value = true;
      } catch (_) {
        aiPreviewExists.value = false;
      }
    }

    async function loadExistingAiPreview() {
      try {
        const html = await window.electron.ipcRenderer.invoke('filetree:readFile', 'Style Guide/StyleGuide_Preview_AI.html');
        htmlPreviewContent.value = html;
        showHtmlPreview.value = true;
      } catch (_) {
        alert('AI preview file not found.');
      }
    }

    async function generateHtmlPreview() {
      generatingPreview.value = true;
      try {
        // Load the style guide content
        const content = await window.electron.ipcRenderer.invoke('filetree:readFile', activePath.value);

        // Get default agent
        const results = await window.electron.ipcRenderer.invoke('agent:getStartupResults');
        const settings = await window.electron.ipcRenderer.invoke('settings:read');
        let agentCmd = settings?.eval_default_agent;
        if (!agentCmd || !results?.[agentCmd]?.status === 'pass') {
          agentCmd = Object.keys(results || {}).find(id => results[id].status === 'pass');
        }

        if (!agentCmd) {
          // Fallback: use marked for basic rendering
          const body = marked.parse(content);
          htmlPreviewContent.value = buildBasicHtml(body, content);
          showHtmlPreview.value = true;
          return;
        }

        // Use the agent to generate a rich HTML preview
        const prompt = `Read the style guide at "docs/${activePath.value}". Generate a single self-contained HTML file that visually previews the style guide. The HTML should:

1. Render colour swatches as visible coloured boxes next to their hex values
2. Show typography examples with actual font sizes and weights
3. Display spacing/grid examples as visual boxes
4. Show component examples (buttons, cards, tables, badges) styled according to the guide
5. Include the full style guide content as rendered sections
6. Use the colours and fonts defined in the guide itself
7. Be a single self-contained HTML file with inline CSS (no external dependencies)

Save the generated HTML file to "docs/Style Guide/StyleGuide_Preview_AI.html". Then read it back and output its full contents.`;

        const args = agentCmd === 'claude'
          ? ['--print', '--verbose', '--dangerously-skip-permissions', '--output-format', 'text', prompt]
          : [prompt];

        // For now, fall back to basic marked rendering and open the agent session separately
        const body = marked.parse(content);
        htmlPreviewContent.value = buildBasicHtml(body, content);
        showHtmlPreview.value = true;
      } catch (e) {
        console.error('Failed to generate preview:', e);
      } finally {
        generatingPreview.value = false;
      }
    }

    function buildBasicHtml(body, rawContent) {
      // Extract hex colours from the raw markdown
      const colorMatches = [...(rawContent || '').matchAll(/([\w\s\/]+?)[\s:|\-–]+\s*(#[0-9A-Fa-f]{3,8})\b/g)];
      let colorSwatches = '';
      if (colorMatches.length > 0) {
        const swatches = colorMatches.map(m => {
          const label = m[1].replace(/[*`|]/g, '').trim();
          const hex = m[2];
          return `<div class="sg-swatch"><div class="sg-swatch-box" style="background:${hex}"></div><div class="sg-swatch-info"><span class="sg-swatch-label">${label}</span><code>${hex}</code></div></div>`;
        }).join('');
        colorSwatches = `<div class="sg-section"><h2>Colour Palette</h2><div class="sg-swatches">${swatches}</div></div><hr>`;
      }

      // Extract font family
      const fontMatch = (rawContent || '').match(/[Ff]ont(?:\s*family)?[\s:]+([A-Za-z\s,'-]+?)(?:\n|$)/);
      const fontFamily = fontMatch ? fontMatch[1].trim().replace(/[`*]/g, '') : 'Inter, system-ui, sans-serif';

      // Extract heading sizes
      const typoSamples = [];
      const h1Match = (rawContent || '').match(/H1[\s:]+([0-9.]+rem)/i);
      const h2Match = (rawContent || '').match(/H2[\s:]+([0-9.]+rem)/i);
      const h3Match = (rawContent || '').match(/H3[\s:]+([0-9.]+rem)/i);
      const bodyMatch = (rawContent || '').match(/[Bb]ody[\s:]+([0-9.]+rem)/i);

      if (h1Match || h2Match || h3Match || bodyMatch) {
        if (h1Match) typoSamples.push(`<div class="sg-typo-sample" style="font-size:${h1Match[1]};font-weight:700">Heading 1 — ${h1Match[1]}</div>`);
        if (h2Match) typoSamples.push(`<div class="sg-typo-sample" style="font-size:${h2Match[1]};font-weight:600">Heading 2 — ${h2Match[1]}</div>`);
        if (h3Match) typoSamples.push(`<div class="sg-typo-sample" style="font-size:${h3Match[1]};font-weight:600">Heading 3 — ${h3Match[1]}</div>`);
        if (bodyMatch) typoSamples.push(`<div class="sg-typo-sample" style="font-size:${bodyMatch[1]}">Body text — ${bodyMatch[1]} — The quick brown fox jumps over the lazy dog.</div>`);
      }

      let typoSection = '';
      if (typoSamples.length > 0) {
        typoSection = `<div class="sg-section"><h2>Typography Samples</h2><p class="sg-font-label">Font: ${fontFamily}</p>${typoSamples.join('')}</div><hr>`;
      }

      // Extract spacing/border-radius
      const radiusMatch = (rawContent || '').match(/[Bb]order[\s-]*radius[\s:]+([0-9]+px)/);
      const spacingMatch = (rawContent || '').match(/[Bb]ase[\s]*unit[\s:]+([0-9]+px)/i);
      let componentSection = '';
      const radius = radiusMatch ? radiusMatch[1] : '6px';
      const primaryColor = colorMatches.find(m => /primary/i.test(m[1]))?.[2] || '#4A90E2';
      const errorColor = colorMatches.find(m => /error|danger/i.test(m[1]))?.[2] || '#E06060';
      const successColor = colorMatches.find(m => /success/i.test(m[1]))?.[2] || '#6DD4A0';
      const bgColor = colorMatches.find(m => /background|bg/i.test(m[1]))?.[2] || '#161A1F';
      const surfaceColor = colorMatches.find(m => /surface|card/i.test(m[1]))?.[2] || '#1E2228';
      const textColor = colorMatches.find(m => /text(?!.*muted)/i.test(m[1]))?.[2] || '#D4D8DD';
      const mutedColor = colorMatches.find(m => /muted/i.test(m[1]))?.[2] || '#8B929A';

      componentSection = `<div class="sg-section"><h2>Component Samples</h2>
<div class="sg-component-row">
  <button class="sg-btn" style="background:${primaryColor};color:#fff;border-radius:${radius}">Primary Button</button>
  <button class="sg-btn sg-btn-outline" style="border:1px solid ${primaryColor};color:${primaryColor};border-radius:${radius}">Secondary Button</button>
  <button class="sg-btn" style="background:${errorColor};color:#fff;border-radius:${radius}">Danger Button</button>
  <button class="sg-btn" style="background:${successColor};color:#0a1220;border-radius:${radius}">Success Button</button>
</div>
<div class="sg-component-row" style="margin-top:1rem">
  <span class="sg-badge" style="background:${successColor}33;color:${successColor}">Active</span>
  <span class="sg-badge" style="background:#E5A83033;color:#E5A830">Warning</span>
  <span class="sg-badge" style="background:${errorColor}33;color:${errorColor}">Error</span>
  <span class="sg-badge" style="background:${primaryColor}33;color:${primaryColor}">Info</span>
</div>
<div class="sg-card" style="background:${surfaceColor};border-radius:${radius};margin-top:1rem">
  <h3 style="margin:0 0 0.5rem">Sample Card</h3>
  <p style="color:${mutedColor};margin:0">This card uses the surface colour, text colour, and border-radius from the style guide.</p>
</div>
<table class="sg-table" style="margin-top:1rem">
  <thead><tr><th>Name</th><th>Status</th><th style="text-align:right">Value</th></tr></thead>
  <tbody>
    <tr><td>Item Alpha</td><td><span class="sg-badge" style="background:${successColor}33;color:${successColor}">Active</span></td><td style="text-align:right">1,234</td></tr>
    <tr><td>Item Beta</td><td><span class="sg-badge" style="background:#E5A83033;color:#E5A830">Pending</span></td><td style="text-align:right">567</td></tr>
    <tr><td>Item Gamma</td><td><span class="sg-badge" style="background:${errorColor}33;color:${errorColor}">Error</span></td><td style="text-align:right">89</td></tr>
  </tbody>
</table>
</div><hr>`;

      return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Style Guide Preview</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: ${fontFamily.split(',').map(f => "'" + f.trim() + "'").join(',')}, sans-serif; line-height: 1.7; color: ${textColor}; background: ${bgColor}; padding: 2rem 3rem; max-width: 1000px; margin: 0 auto; }
  h1 { font-size: 2rem; font-weight: 700; margin: 0 0 0.5rem; border-bottom: 2px solid #2a3550; padding-bottom: 0.75rem; }
  h2 { font-size: 1.4rem; font-weight: 600; margin: 2rem 0 0.75rem; color: ${primaryColor}; }
  h3 { font-size: 1.1rem; font-weight: 600; margin: 1.5rem 0 0.5rem; }
  h4 { font-size: 0.95rem; font-weight: 600; margin: 1rem 0 0.4rem; color: ${mutedColor}; }
  p { margin: 0.5rem 0; }
  ul, ol { margin: 0.5rem 0; padding-left: 1.5rem; }
  li { margin: 0.25rem 0; }
  code { background: rgba(255,255,255,0.08); padding: 0.15rem 0.4rem; border-radius: 3px; font-size: 0.9em; color: ${successColor}; font-family: 'Consolas', 'Monaco', monospace; }
  pre { background: #111820; padding: 1rem; border-radius: 8px; overflow-x: auto; margin: 0.75rem 0; border: 1px solid #2a3550; }
  pre code { background: none; padding: 0; color: #d4d8dd; }
  table { border-collapse: collapse; width: 100%; margin: 0.75rem 0; }
  th { background: #111820; text-align: left; padding: 0.6rem 0.75rem; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: ${mutedColor}; border-bottom: 1px solid #2a3550; }
  td { padding: 0.5rem 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.06); }
  blockquote { border-left: 3px solid ${primaryColor}; padding-left: 1rem; margin: 0.75rem 0; color: ${mutedColor}; }
  strong { color: #fff; }
  hr { border: none; border-top: 1px solid #2a3550; margin: 2rem 0; }
  a { color: ${primaryColor}; }
  .sg-section { margin: 1.5rem 0; }
  .sg-swatches { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 0.75rem; }
  .sg-swatch { display: flex; align-items: center; gap: 0.6rem; background: ${surfaceColor}; padding: 0.5rem 0.75rem; border-radius: ${radius}; min-width: 180px; }
  .sg-swatch-box { width: 40px; height: 40px; border-radius: 6px; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.1); }
  .sg-swatch-info { display: flex; flex-direction: column; }
  .sg-swatch-label { font-size: 0.8rem; font-weight: 500; }
  .sg-swatch-info code { font-size: 0.75rem; }
  .sg-font-label { font-size: 0.85rem; color: ${mutedColor}; margin-bottom: 0.75rem; }
  .sg-typo-sample { margin: 0.5rem 0; padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
  .sg-component-row { display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; }
  .sg-btn { border: none; padding: 0.5rem 1.25rem; font-size: 0.88rem; font-weight: 500; cursor: pointer; }
  .sg-btn-outline { background: transparent !important; }
  .sg-badge { display: inline-block; padding: 0.15rem 0.6rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600; }
  .sg-card { padding: 1.25rem; border: 1px solid rgba(255,255,255,0.08); }
  .sg-table { font-size: 0.88rem; }
</style>
</head>
<body>
<h1>Style Guide Preview</h1>
<p style="color:${mutedColor}">Auto-generated visual preview from the project style guide</p>
<hr>
${colorSwatches}
${typoSection}
${componentSection}
<div class="sg-section"><h2>Full Style Guide</h2></div>
${body}
</body>
</html>`;
    }

    function backToSkills() {
      if (window.__planNavigate) window.__planNavigate('plan-skills');
    }

    function backToEpics() {
      if (window.__planNavigate) window.__planNavigate('plan-epics');
    }

    function refineEpicWithAi() {
      if (window.__planNavigate) window.__planNavigate('plan-epics');
    }

    let aiTermInstance = null;
    let aiFitAddon = null;
    let aiShellCleanup = null;
    let aiExitCleanup = null;
    let aiResizeObs = null;
    let aiSessionCount = 0;

    async function generateAiHtmlPreview() {
      generatingAiPreview.value = true;

      // Get default agent
      const results = await window.electron.ipcRenderer.invoke('agent:getStartupResults');
      const settings = await window.electron.ipcRenderer.invoke('settings:read');
      let agentCmd = settings?.eval_default_agent;
      if (!agentCmd || !results?.[agentCmd]?.status === 'pass') {
        agentCmd = Object.keys(results || {}).find(id => results[id].status === 'pass');
      }
      if (!agentCmd) {
        generatingAiPreview.value = false;
        alert('No coding agent connected. Go to Settings > Coding Agents to configure one.');
        return;
      }

      showAiPreviewSession.value = true;
      generatingAiPreview.value = false;

      await nextTick();

      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      await import('@xterm/xterm/css/xterm.css');

      const term = new Terminal({
        cursorBlink: true, fontSize: 13,
        fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
        theme: { background: '#0A1220', foreground: '#E8EDF3', cursor: '#4ADE80', selectionBackground: '#1F3A2E' },
      });

      aiFitAddon = new FitAddon();
      term.loadAddon(aiFitAddon);
      term.open(aiPreviewTermContainer.value);
      aiFitAddon.fit();
      aiTermInstance = term;

      const shellId = 'sg-preview-' + (++aiSessionCount);
      aiPreviewShellId.value = shellId;

      const prompt = `Read the style guide at "docs/${activePath.value}".

Generate a single self-contained HTML file that serves as a VISUAL PREVIEW of the style guide. Save it to "docs/Style Guide/StyleGuide_Preview_AI.html".

The HTML must include:
1. COLOUR SWATCHES — render every colour defined in the guide as a visible coloured box with its hex value and label
2. TYPOGRAPHY SAMPLES — show each heading level (H1-H4) and body text at the actual font sizes, weights, and font family specified
3. SPACING EXAMPLES — show the spacing scale as visual boxes if defined
4. COMPONENT EXAMPLES — render styled examples of buttons (primary, secondary, danger), badges/pills, a sample card, a sample table with headers and 3 rows, and form inputs — all using the exact colours, border-radius, and fonts from the guide
5. INTERACTIVE STATES — show hover states, disabled states where applicable
6. The full style guide content rendered below the samples

Use ONLY the colours, fonts, spacing, and conventions documented in the style guide. The HTML must be self-contained with all CSS inline (no external dependencies). Use a professional layout.`;

      const args = agentCmd === 'claude'
        ? ['--verbose', '--dangerously-skip-permissions', prompt]
        : [];

      await window.electron.ipcRenderer.invoke('agent:spawnInteractive', shellId, agentCmd, args);

      if (agentCmd !== 'claude') {
        setTimeout(() => {
          window.electron.ipcRenderer.invoke('workspace:writeShell', shellId, prompt + '\r');
        }, 3000);
      }

      setTimeout(() => { if (aiFitAddon) aiFitAddon.fit(); }, 300);

      term.onData((data) => {
        window.electron.ipcRenderer.invoke('workspace:writeShell', shellId, data);
      });

      aiShellCleanup = window.electron.ipcRenderer.on('workspace:shellData', ({ shellId: sid, data }) => {
        if (sid === shellId && aiTermInstance) aiTermInstance.write(data);
      });

      aiExitCleanup = window.electron.ipcRenderer.on('workspace:shellExit', ({ shellId: sid }) => {
        if (sid === shellId && aiTermInstance) {
          aiTermInstance.write('\r\n\x1b[32m✓ Session ended. Loading preview...\x1b[0m\r\n');
          // Try to load the generated file
          setTimeout(async () => {
            try {
              const html = await window.electron.ipcRenderer.invoke('filetree:readFile', 'Style Guide/StyleGuide_Preview_AI.html');
              htmlPreviewContent.value = html;
              showHtmlPreview.value = true;
            } catch (_) {}
          }, 1000);
        }
      });

      aiResizeObs = new ResizeObserver(() => {
        try {
          if (aiFitAddon) aiFitAddon.fit();
          if (aiTermInstance) window.electron.ipcRenderer.invoke('workspace:resizeShell', shellId, aiTermInstance.cols, aiTermInstance.rows);
        } catch {}
      });
      aiResizeObs.observe(aiPreviewTermContainer.value);
    }

    function stopAiPreview() {
      if (aiPreviewShellId.value) window.electron.ipcRenderer.invoke('workspace:killShell', aiPreviewShellId.value);
      if (aiResizeObs) { aiResizeObs.disconnect(); aiResizeObs = null; }
      if (aiShellCleanup) { aiShellCleanup(); aiShellCleanup = null; }
      if (aiExitCleanup) { aiExitCleanup(); aiExitCleanup = null; }
      if (aiTermInstance) { aiTermInstance.dispose(); aiTermInstance = null; }
      aiFitAddon = null;
      showAiPreviewSession.value = false;
      // Try to load the preview
      window.electron.ipcRenderer.invoke('filetree:readFile', 'Style Guide/StyleGuide_Preview_AI.html').then(html => {
        htmlPreviewContent.value = html;
        showHtmlPreview.value = true;
      }).catch(() => {});
    }

    const normalizedPath = computed(() => {
      const routePath = route.params.path;
      const joinedPath = Array.isArray(routePath) ? routePath.join('/') : routePath || '';
      const fromRoute = decodeURIComponent(joinedPath).replace(/^\/+/, '');
      return fromRoute || props.filePath || '';
    });

    const fileName = computed(() => {
      if (!activePath.value) {
        return '';
      }

      const parts = activePath.value.split('/').filter(Boolean);
      return parts[parts.length - 1] || '';
    });

    const folderBreadcrumb = computed(() => {
      if (!activePath.value) {
        return 'docs /';
      }

      const parts = activePath.value.split('/').filter(Boolean);
      const folders = parts.slice(0, -1);
      return folders.length ? `docs / ${folders.join(' / ')} /` : 'docs /';
    });

    const renderedHtml = computed(() => {
      if (!markdown.value) {
        return '<p class="empty-copy">This file is empty.</p>';
      }

      return marked.parse(markdown.value);
    });

    const versionsButtonDisabled = computed(() => loading.value || versionsLoading.value || !versionEntries.value.length);

    const versionsButtonLabel = computed(() => {
      const count = versionEntries.value.length;
      return count > 1 ? `Versions (${count})` : 'Versions';
    });

    async function loadFile() {
      const nextPath = normalizedPath.value;
      activePath.value = nextPath;
      isVersionsPanelOpen.value = false;
      versionEntries.value = [];
      viewingHistorical.value = false;
      historicalHash.value = '';
      historicalDate.value = '';
      historicalMessage.value = '';
      historicalError.value = '';

      if (!nextPath) {
        markdown.value = '';
        notFound.value = true;
        return;
      }

      loading.value = true;
      notFound.value = false;
      imageDataUrl.value = '';

      try {
        if (IMAGE_EXTS.test(nextPath)) {
          imageDataUrl.value = await window.electron.ipcRenderer.invoke('filetree:readImage', nextPath);
        } else {
          markdown.value = await window.electron.ipcRenderer.invoke('filetree:readFile', nextPath);
        }
      } catch (error) {
        markdown.value = '';
        notFound.value = true;
        if (!String(error && error.message ? error.message : error).includes('ENOENT')) {
          console.error('Failed to load file:', error);
        }
      } finally {
        loading.value = false;
      }

      if (!IMAGE_EXTS.test(nextPath)) {
        await loadVersionEntries();
      }
    }

    async function loadVersionEntries() {
      if (!activePath.value) {
        versionEntries.value = [];
        return;
      }

      versionsLoading.value = true;

      try {
        versionEntries.value = await window.electron.ipcRenderer.invoke('version:log', activePath.value, 500);
      } catch (error) {
        versionEntries.value = [];
        console.error('Failed to load version history:', error);
      } finally {
        versionsLoading.value = false;
      }
    }

    function onEdit() {
      originalContent.value = markdown.value;
      editContent.value = markdown.value;
      editPreviewHtml.value = marked.parse(markdown.value);
      router.replace({
        path: route.path,
        query: { ...route.query, edit: '1' },
      });
    }

    watch(isEditMode, (editing) => {
      if (editing) {
        nextTick(() => setupEditor());
      } else {
        destroyEditor();
      }
    });

    function setupEditor() {
      if (!editorContainer.value) return;
      if (editorView) { editorView.destroy(); editorView = null; }

      const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          editContent.value = update.state.doc.toString();
          if (previewDebounce) clearTimeout(previewDebounce);
          previewDebounce = setTimeout(() => {
            editPreviewHtml.value = marked.parse(editContent.value);
          }, 200);
        }
      });

      const state = EditorState.create({
        doc: editContent.value,
        extensions: [
          keymap.of([...defaultKeymap, ...historyKeymap]),
          history(),
          markdownLang(),
          updateListener,
          EditorView.lineWrapping,
        ],
      });

      editorView = new EditorView({ state, parent: editorContainer.value });
    }

    function destroyEditor() {
      if (editorView) { editorView.destroy(); editorView = null; }
      if (previewDebounce) { clearTimeout(previewDebounce); previewDebounce = null; }
    }

    function exitEditMode() {
      destroyEditor();
      const { edit, ...rest } = route.query;
      router.replace({ path: route.path, query: rest });
    }

    function onCancelEdit() {
      markdown.value = originalContent.value;
      exitEditMode();
    }

    async function onSave() {
      saving.value = true;
      try {
        await window.electron.ipcRenderer.invoke('filetree:writeFile', activePath.value, editContent.value);
        markdown.value = editContent.value;
        exitEditMode();
      } catch (error) {
        console.error('Failed to save file:', error);
        alert('Failed to save: ' + (error.message || error));
      } finally {
        saving.value = false;
      }
    }

    async function toggleVersionsPanel() {
      if (versionsButtonDisabled.value && !isVersionsPanelOpen.value) {
        return;
      }

      if (isVersionsPanelOpen.value) {
        isVersionsPanelOpen.value = false;
        return;
      }

      await loadVersionEntries();
      if (versionEntries.value.length) {
        isVersionsPanelOpen.value = true;
      }
    }

    function closeVersionsPanel() {
      isVersionsPanelOpen.value = false;
    }

    async function handleVersionSelect(hash) {
      const entry = versionEntries.value.find((e) => e.hash === hash);
      historicalError.value = '';

      try {
        const content = await window.electron.ipcRenderer.invoke('version:fileAtCommit', hash, activePath.value);
        if (content === null || content === undefined) {
          historicalError.value = 'This file did not exist at the selected version.';
          viewingHistorical.value = true;
          historicalHash.value = hash;
          historicalDate.value = entry ? formatEntryDate(entry.date) : hash;
          historicalMessage.value = entry ? entry.message : '';
          markdown.value = '';
          return;
        }
        markdown.value = content;
        viewingHistorical.value = true;
        historicalHash.value = hash;
        historicalDate.value = entry ? formatEntryDate(entry.date) : hash;
        historicalMessage.value = entry ? entry.message : '';
      } catch (error) {
        historicalError.value = `Failed to load file at this version: ${error.message || error}`;
        viewingHistorical.value = true;
        historicalHash.value = hash;
        historicalDate.value = entry ? formatEntryDate(entry.date) : hash;
        historicalMessage.value = entry ? entry.message : '';
        markdown.value = '';
      }
    }

    async function backToCurrent() {
      viewingHistorical.value = false;
      historicalHash.value = '';
      historicalDate.value = '';
      historicalMessage.value = '';
      historicalError.value = '';
      await loadFile();
    }

    function formatEntryDate(value) {
      if (!value) return 'Unknown date';
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return value;
      const formatter = new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
      const parts = formatter.formatToParts(parsed);
      const p = Object.fromEntries(parts.map((pt) => [pt.type, pt.value]));
      return `${p.month} ${p.day}, ${p.year} ${p.hour}:${p.minute} ${p.dayPeriod}`;
    }

    function handleEscapeKey(event) {
      if (event.key === 'Escape' && isVersionsPanelOpen.value) {
        closeVersionsPanel();
      }
    }

    const handleFileChange = () => {
      if (activePath.value) {
        loadFile();
      }
    };

    onMounted(() => {
      ensureFileWatcher();
      fileChangeSubscribers.add(handleFileChange);
      window.addEventListener('keydown', handleEscapeKey);
      loadFile();
    });

    onUnmounted(() => {
      destroyEditor();
      fileChangeSubscribers.delete(handleFileChange);
      window.removeEventListener('keydown', handleEscapeKey);
    });

    watch(() => normalizedPath.value, () => {
      loadFile();
    });

    return {
      backToCurrent,
      fileName,
      folderBreadcrumb,
      historicalDate,
      historicalError,
      historicalMessage,
      editorContainer,
      editPreviewHtml,
      imageDataUrl,
      isEditMode,
      isImage,
      isPrd,
      isArchitecture,
      isSkill,
      isEpic,
      isStyleGuide,
      createStyleGuide,
      refineStyleGuideWithAi,
      backToStyleGuide,
      generatingPreview,
      generatingAiPreview,
      showHtmlPreview,
      htmlPreviewContent,
      generateHtmlPreview,
      generateAiHtmlPreview,
      aiPreviewExists,
      loadExistingAiPreview,
      showAiPreviewSession,
      aiPreviewTermContainer,
      stopAiPreview,
      loadAiPreviewResult() {
        window.electron.ipcRenderer.invoke('filetree:readFile', 'Style Guide/StyleGuide_Preview_AI.html').then(html => {
          htmlPreviewContent.value = html;
          showHtmlPreview.value = true;
        }).catch(() => alert('Preview file not found yet. Wait for the agent to finish.'));
      },
      backToEpics,
      refineEpicWithAi,
      refinePrdWithAi,
      createNewPrd,
      refineArchWithAi,
      createNewArch,
      backToSkills,
      isVersionsPanelOpen,
      loading,
      notFound,
      onEdit,
      onCancelEdit,
      onSave,
      saving,
      closeVersionsPanel,
      handleVersionSelect,
      renderedHtml,
      toggleVersionsPanel,
      versionEntries,
      versionsButtonDisabled,
      versionsButtonLabel,
      versionsLoading,
      viewingHistorical,
    };
  },
};
</script>

<style scoped>
.file-preview-view {
  max-width: 100%;
}

.file-preview-view--edit {
  max-width: 100%;
}

.preview-layout {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.title-bar,
.state-card,
.markdown-body {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  box-shadow: var(--box-shadow);
}

.title-bar {
  align-items: center;
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
}

.title-actions {
  align-items: center;
  display: flex;
  gap: 0.75rem;
}

.title-copy {
  min-width: 0;
}

.folder-path {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0 0 0.35rem;
}

.file-name {
  color: var(--text-color);
  font-size: 1.75rem;
  margin: 0;
  overflow-wrap: anywhere;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
  border: none;
  border-radius: var(--border-radius);
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.5rem 1rem;
  transition: var(--transition);
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}

.preview-html-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
  border: none;
  border-radius: var(--border-radius);
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.5rem 1rem;
  transition: var(--transition);
}

.preview-html-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}

.preview-html-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.preview-html-btn .mdi {
  font-size: 1.1rem;
  color: #e44d26;
}

/* HTML Preview Modal */
.html-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.html-preview-modal {
  width: 90vw;
  height: 85vh;
  background: #0a1220;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
}

.html-preview-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  background: #0d1720;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.7);
  flex-shrink: 0;
}

.html-preview-header .mdi {
  color: #e44d26;
  font-size: 1.1rem;
}

.html-preview-close {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 4px;
  font-size: 1.1rem;
  display: flex;
  transition: all 0.15s;
}

.html-preview-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
}

.html-preview-frame {
  flex: 1;
  border: none;
  width: 100%;
}

.ai-preview-terminal {
  flex: 1;
  background: #0A1220;
  position: relative;
}

.ai-preview-terminal :deep(.xterm) {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  padding: 0.5rem;
}

.ai-preview-terminal :deep(.xterm-screen) {
  height: 100% !important;
}

.ai-preview-terminal :deep(.xterm-viewport) {
  overflow-y: auto !important;
}

.prd-ai-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #6dd4a0;
  color: #0A1220;
  border: none;
  border-radius: var(--border-radius);
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  padding: 0.5rem 1rem;
  transition: var(--transition);
}

.prd-ai-btn:hover {
  background: #86efac;
}

.prd-ai-btn .mdi {
  font-size: 1rem;
}

.edit-btn {
  background: var(--primary-color);
  border: none;
  border-radius: var(--border-radius);
  color: #fff;
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0.55rem 1.2rem;
  transition: var(--transition);
}

.edit-btn:hover {
  background: var(--primary-hover);
}

.versions-btn {
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  color: var(--text-color);
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0.55rem 1rem;
  transition: var(--transition);
}

.versions-btn:hover:not(:disabled) {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.versions-btn:disabled {
  color: var(--text-muted);
  cursor: not-allowed;
  opacity: 0.6;
}

.history-banner {
  align-items: center;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: var(--border-radius);
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
}

.history-banner__text {
  color: #92400e;
  font-size: 0.9rem;
  font-weight: 500;
}

.history-banner__back {
  background: #f59e0b;
  border: none;
  border-radius: var(--border-radius);
  color: #fff;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.45rem 1rem;
  transition: var(--transition);
  white-space: nowrap;
}

.history-banner__back:hover {
  background: #d97706;
}

.state-card {
  padding: 2rem;
}

.state-card h1,
.state-card h2 {
  color: var(--text-color);
  margin: 0 0 0.5rem;
}

.state-text {
  color: var(--text-muted);
  margin: 0;
}

.markdown-body {
  color: var(--text-color);
  line-height: 1.7;
  padding: 1.5rem;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  color: var(--text-color);
  margin: 1.5rem 0 0.6rem;
}

.markdown-body :deep(h1:first-child),
.markdown-body :deep(h2:first-child),
.markdown-body :deep(h3:first-child) {
  margin-top: 0;
}

.markdown-body :deep(p),
.markdown-body :deep(ul),
.markdown-body :deep(ol),
.markdown-body :deep(table),
.markdown-body :deep(blockquote) {
  margin: 0 0 1rem;
}

.markdown-body :deep(pre) {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  margin: 0 0 1rem;
  overflow-x: auto;
  padding: 1rem;
}

.markdown-body :deep(code) {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.875rem;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--border-color);
  padding: 0.55rem 0.7rem;
  text-align: left;
}

.markdown-body :deep(a) {
  color: var(--primary-color);
}

.markdown-body :deep(.empty-copy) {
  color: var(--text-muted);
  margin: 0;
}

/* Editor split-pane */
.editor-split {
  display: flex;
  gap: 1px;
  flex: 1;
  min-height: 400px;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  overflow: hidden;
}

.editor-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
}

.codemirror-container {
  flex: 1;
  overflow: auto;
}

.codemirror-container :deep(.cm-editor) {
  height: 100%;
}

.codemirror-container :deep(.cm-scroller) {
  overflow: auto;
}

.preview-pane {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
}

.preview-pane .markdown-body {
  border: none;
  box-shadow: none;
}

.save-btn {
  background: #16a34a;
  border: none;
  border-radius: var(--border-radius);
  color: #fff;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 0.55rem 1.2rem;
  transition: var(--transition);
}

.save-btn:hover:not(:disabled) {
  background: #15803d;
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.cancel-btn {
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  color: var(--text-color);
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0.55rem 1rem;
  transition: var(--transition);
}

.cancel-btn:hover {
  border-color: var(--text-muted);
}

/* Image preview */
.image-preview {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  box-shadow: var(--box-shadow);
  padding: 1rem;
  text-align: center;
}

.image-full {
  max-width: 100%;
  max-height: 80vh;
  object-fit: contain;
}
</style>
