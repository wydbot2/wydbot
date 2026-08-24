<script setup lang="ts">
// Dedicated page for a shared type (Item, Entidade, ItemShort): description
// + dense field lanes inside a single card.
import type { InterfaceMeta } from '../../../../tools/vite-plugins/script-ctx-codegen-types';
import ApiCard from './ApiCard.vue';
import ApiFieldList from './ApiFieldList.vue';

defineProps<{ iface: InterfaceMeta | undefined }>();
</script>

<template>
  <ApiCard v-if="iface" label="Campos">
    <div
      v-if="iface.jsDoc?.descriptionHtml"
      class="vp-doc api-desc"
      v-html="iface.jsDoc.descriptionHtml"
    />
    <ApiFieldList :fields="iface.members" :prefix="`${iface.name.toLowerCase()}.`" />
    <slot name="after" />
  </ApiCard>
</template>
