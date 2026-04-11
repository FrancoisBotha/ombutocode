<template>
  <div id="dropsync-app" class="app-shell">
    <aside class="sidebar">
      <nav class="sidebar-nav">
        <router-link to="/jobs" class="nav-item">Backup Jobs</router-link>
        <router-link to="/logs" class="nav-item">Backup Logs</router-link>
      </nav>
    </aside>
    <main class="content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
}

.sidebar {
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  background-color: var(--color-surface);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  padding-top: var(--space-unit);
}

.nav-item {
  display: block;
  padding: var(--space-row-v) var(--space-row-h);
  font-size: var(--font-size-body);
  color: var(--color-text);
  text-decoration: none;
  border-left: 3px solid transparent;
  transition: background-color 0.15s ease;
}

.nav-item:hover {
  background-color: var(--color-surface-hover);
}

.nav-item.router-link-active {
  border-left-color: var(--color-primary);
  color: var(--color-primary);
}

.content {
  flex: 1;
  padding: var(--space-page);
  overflow-y: auto;
}
</style>
