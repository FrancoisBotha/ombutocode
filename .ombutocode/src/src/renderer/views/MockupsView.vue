<template>
  <div class="view-container">
    <h1>Mockups</h1>
    <p class="text-muted">UI mockups from docs/Mockups/</p>

    <div v-if="loading" class="loading">Loading mockups…</div>
    <div v-else-if="mockups.length === 0" class="empty">No image files found in docs/Mockups/</div>

    <div v-else class="gallery">
      <div
        v-for="m in mockups"
        :key="m.path"
        class="mockup-card"
        @click="openLightbox(m)"
      >
        <img v-if="m.dataUrl" :src="m.dataUrl" :alt="m.name" class="thumb" />
        <div class="mockup-name">{{ m.name }}</div>
      </div>
    </div>

    <!-- Lightbox overlay -->
    <div v-if="lightbox" class="lightbox" @click="lightbox = null">
      <img :src="lightbox.dataUrl" :alt="lightbox.name" class="lightbox-img" />
      <div class="lightbox-caption">{{ lightbox.name }}</div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';

export default {
  name: 'MockupsView',
  setup() {
    const mockups = ref([]);
    const loading = ref(true);
    const lightbox = ref(null);

    async function loadMockups() {
      try {
        const list = await window.electron.ipcRenderer.invoke('filetree:scanMockups');
        const loaded = await Promise.all(
          list.map(async (item) => {
            const dataUrl = await window.electron.ipcRenderer.invoke('filetree:readImage', item.path);
            return { ...item, dataUrl };
          })
        );
        mockups.value = loaded;
      } catch (e) {
        console.error('Failed to load mockups:', e);
      } finally {
        loading.value = false;
      }
    }

    function openLightbox(m) {
      lightbox.value = m;
    }

    onMounted(loadMockups);

    return { mockups, loading, lightbox, openLightbox };
  },
};
</script>

<style scoped>
.view-container {
  max-width: 100%;
  padding: 1rem;
}

.view-container h1 {
  margin-bottom: 0.5rem;
  color: var(--text-color);
}

.loading, .empty {
  margin-top: 2rem;
  color: var(--text-muted);
}

.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;
}

.mockup-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  overflow: hidden;
  cursor: pointer;
  box-shadow: var(--box-shadow);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.mockup-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.thumb {
  width: 100%;
  display: block;
  object-fit: contain;
  background: #1a1a1a;
}

.mockup-name {
  padding: 0.5rem 0.75rem;
  font-size: 0.8rem;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Lightbox */
.lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  cursor: pointer;
}

.lightbox-img {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
}

.lightbox-caption {
  margin-top: 0.75rem;
  color: #ccc;
  font-size: 0.9rem;
}
</style>
