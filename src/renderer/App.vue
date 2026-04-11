<template>
  <div id="dropsync-app">
    <p>{{ pingResult }}</p>
    <p>{{ appVersion }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const pingResult = ref(window.dropsync.ping())
const appVersion = ref('')

onMounted(async () => {
  appVersion.value = await window.dropsync.getAppVersion()
})
</script>
