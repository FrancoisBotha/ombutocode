import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import loggerPlugin from './plugins/logger';
import './assets/main.css';

const app = createApp(App);

// Initialize Pinia
const pinia = createPinia();

// Initialize plugins and router
app.use(pinia);
app.use(router);
app.use(loggerPlugin, {
  // You can configure the default log level here
  // Options: 'NONE', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'
  level: import.meta.env.DEV ? 'DEBUG' : 'INFO'
});

// Wait for the app to be mounted
app.mount('#app');
