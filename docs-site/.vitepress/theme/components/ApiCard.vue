<script setup lang="ts">
// Styles live in style.css (`.api-card` / `.api-card-label`).
defineProps<{ label: string }>();
</script>

<template>
  <div class="api-card">
    <div class="api-card-label">{{ label }}</div>
    <slot />
  </div>
</template>
