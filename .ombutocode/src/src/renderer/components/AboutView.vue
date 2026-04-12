<template>
  <div class="about-view">
    <div class="about-hero">
      <img src="../assets/logo.svg" alt="Ombuto Code" class="about-hero-logo" />
      <h1 class="about-hero-name">Ombuto Code</h1>
      <p class="about-hero-tagline">Agentic Software Engineering Workbench</p>
      <p class="about-hero-version" v-if="buildVersion">
        Version {{ buildVersion }}
        <span class="about-hero-beta">BETA</span>
      </p>
      <p class="about-hero-beta-notice">
        This is a pre-release build. APIs, data formats, and features may change
        without notice until the 1.0.0 release.
      </p>
    </div>

    <div class="about-content">
      <section class="about-section">
        <h2>About</h2>
        <p>
          Ombuto Code is a desktop application for agentic software engineering,
          providing engineering support from requirements definition and solution
          architecture to automated development and validation.
        </p>
      </section>

      <section class="about-section">
        <h2>Copyright</h2>
        <p>&copy; {{ year }} Francois Botha. All rights reserved.</p>
      </section>

      <section class="about-section">
        <h2>Open Source Licenses</h2>
        <p class="about-oss-intro">
          This application is built with the following open source software:
        </p>
        <div class="about-oss-list">
          <div v-for="lib in libraries" :key="lib.name" class="about-oss-item">
            <div class="about-oss-name">{{ lib.name }}</div>
            <div class="about-oss-license">{{ lib.license }}</div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';

export default {
  name: 'AboutView',
  setup() {
    const buildVersion = ref('');
    const year = new Date().getFullYear();

    const libraries = [
      { name: 'Electron', license: 'MIT License' },
      { name: 'Vue.js 3', license: 'MIT License' },
      { name: 'Pinia', license: 'MIT License' },
      { name: 'Vue Router', license: 'MIT License' },
      { name: 'Vite', license: 'MIT License' },
      { name: 'sql.js', license: 'MIT License' },
      { name: 'electron-store', license: 'MIT License' },
      { name: 'electron-builder', license: 'MIT License' },
      { name: 'marked', license: 'MIT License' },
      { name: 'highlight.js', license: 'BSD 3-Clause License' },
      { name: 'CodeMirror 6', license: 'MIT License' },
      { name: 'gray-matter', license: 'MIT License' },
      { name: 'chokidar', license: 'MIT License' },
      { name: 'simple-git', license: 'MIT License' },
      { name: 'Tabulator', license: 'MIT License' },
      { name: 'xterm.js', license: 'MIT License' },
      { name: 'js-yaml', license: 'MIT License' },
      { name: 'xlsx-js-style', license: 'Apache 2.0 License' },
      { name: 'node-pty', license: 'MIT License' },
      { name: 'Material Design Icons', license: 'Apache 2.0 License' },
      { name: 'Roboto Font', license: 'Apache 2.0 License' },
    ];

    onMounted(async () => {
      try {
        if (window.electron?.ipcRenderer?.invoke) {
          const info = await window.electron.ipcRenderer.invoke('app:getBuildInfo');
          if (info) buildVersion.value = `${info.version} (${info.hash})`;
        }
      } catch (_) { /* ignore */ }
    });

    return { buildVersion, year, libraries };
  }
};
</script>

<style scoped>
.about-view {
  flex: 1;
  overflow-y: auto;
  background-color: var(--bg-color, #161a1f);
  color: var(--text-color, #d4d8dd);
}

.about-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3rem 2rem 2rem;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.about-hero-logo {
  width: 72px;
  height: 72px;
  margin-bottom: 1rem;
}

.about-hero-name {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-color, #d4d8dd);
}

.about-hero-tagline {
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
  color: var(--text-muted, #8b929a);
  font-weight: 300;
}

.about-hero-version {
  margin: 0.75rem 0 0;
  font-size: 0.78rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.04);
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.about-hero-beta {
  font-family: inherit;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #1a1d22;
  background: #e5a830;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
}

.about-hero-beta-notice {
  margin: 0.75rem auto 0;
  max-width: 420px;
  font-size: 0.72rem;
  line-height: 1.5;
  color: rgba(229, 168, 48, 0.85);
  font-weight: 300;
}

.about-content {
  max-width: 600px;
  margin: 0 auto;
  padding: 2rem;
}

.about-section {
  margin-bottom: 2rem;
}

.about-section h2 {
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted, #8b929a);
  margin: 0 0 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.about-section p {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.65);
  font-weight: 300;
}

.about-oss-intro {
  margin-bottom: 0.75rem !important;
}

.about-oss-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.about-oss-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: rgba(255, 255, 255, 0.02);
  font-size: 0.82rem;
}

.about-oss-item:nth-child(even) {
  background: rgba(255, 255, 255, 0.04);
}

.about-oss-name {
  color: rgba(255, 255, 255, 0.7);
  font-weight: 400;
}

.about-oss-license {
  color: rgba(255, 255, 255, 0.35);
  font-size: 0.75rem;
  font-weight: 300;
}
</style>
