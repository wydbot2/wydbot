<script setup lang="ts">
// `html` is the pre-rendered (Shiki-highlighted) code block from the data
// loader — the example's ```js fence rendered through VitePress's markdown
// engine. Rendered inside `.vp-doc` so it inherits the code-block styling.
defineProps<{ html: string; title?: string | null }>();
</script>

<template>
  <div class="my-3">
    <div class="api-ex-label">{{ title ?? 'Exemplo' }}</div>
    <div class="vp-doc" v-html="html" />
  </div>
</template>
