<script setup lang="ts">
import { InformationCircleIcon } from '@heroicons/vue/20/solid';
</script>

<template>
  <div class="api-note">
    <InformationCircleIcon aria-hidden="true" />
    <slot />
  </div>
</template>
