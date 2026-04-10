<template>
  <PlanDocCreator
    doc-title="Architecture"
    doc-subtitle="Define the system architecture, technology stack, and design decisions"
    doc-folder="Architecture"
    doc-file-name="Architecture.md"
    doc-short-name="Architecture"
    skill-match="architecture"
    :context-files="['docs/Product Requirements Document/PRD.md']"
    @change-view="$emit('change-view', $event)"
  />
</template>

<script>
import PlanDocCreator from './PlanPrdView.vue';

export default {
  name: 'PlanArchitectureView',
  components: { PlanDocCreator },
  emits: ['change-view'],
};
</script>
