<template>
  <PlanDocCreator
    doc-title="Style Guide"
    doc-subtitle="Define the visual design system, component standards, and UI conventions"
    doc-folder="Style Guide"
    doc-file-name="StyleGuide.md"
    doc-short-name="Style Guide"
    skill-match="style guide"
    :context-files="['docs/Product Requirements Document/PRD.md', 'docs/Architecture/Architecture.md']"
    @change-view="$emit('change-view', $event)"
  />
</template>

<script>
import PlanDocCreator from './PlanPrdView.vue';

export default {
  name: 'PlanStyleGuideView',
  components: { PlanDocCreator },
  emits: ['change-view'],
};
</script>
