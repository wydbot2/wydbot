<script setup lang="ts">
// Glossed union-literal block: one `.api-lit` chip per line + gloss on the
// right. Contents are hand-maintained in the .md pages (the codegen meta has
// the literals but not their pt-BR glosses).
defineProps<{ items: readonly { value: string; desc: string }[]; label?: string }>();
</script>

<template>
  <div class="api-enum">
    <div class="api-enum-label">{{ label ?? 'Valores' }}</div>
    <div v-for="item in items" :key="item.value" class="api-enum-row">
      <span class="api-lit">{{ item.value }}</span>
      <span class="vp-doc api-desc" v-html="item.desc" />
    </div>
  </div>
</template>
