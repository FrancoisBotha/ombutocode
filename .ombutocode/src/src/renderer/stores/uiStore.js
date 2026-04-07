import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUiStore = defineStore('ui', () => {
  const activeView = ref('Dashboard');
  const sidebarCollapsed = ref(false);
  const theme = ref('system');

  function setActiveView(view) {
    activeView.value = view;
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  function setTheme(value) {
    theme.value = value;
  }

  return {
    activeView,
    sidebarCollapsed,
    theme,
    setActiveView,
    toggleSidebar,
    setTheme,
  };
});
