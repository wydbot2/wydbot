<script setup lang="ts">
import { computed } from 'vue';
import { withBase } from 'vitepress';
import type { TypeMeta } from '../../../../tools/vite-plugins/script-ctx-codegen-types';
import {
  Bars3BottomLeftIcon,
  BoltIcon,
  CubeIcon,
  HashtagIcon,
  PowerIcon,
  QueueListIcon,
  TagIcon,
} from '@heroicons/vue/20/solid';
import type { FunctionalComponent } from 'vue';
import { LINKABLE, typeLabel, type TypeFamily } from '../lib/type-label';

const props = defineProps<{ type: TypeMeta; text?: string; family?: TypeFamily }>();

const label = computed(() => typeLabel(props.type));
const family = computed(() => props.family ?? label.value.family);
const href = computed(() =>
  label.value.linkTo ? withBase(LINKABLE[label.value.linkTo] ?? '') : null,
);

const ICONS: Record<TypeFamily, FunctionalComponent> = {
  number: HashtagIcon,
  string: Bars3BottomLeftIcon,
  boolean: PowerIcon,
  list: QueueListIcon,
  ref: CubeIcon,
  action: BoltIcon,
  obj: CubeIcon,
  enum: TagIcon,
};
const icon = computed(() => ICONS[family.value]);
</script>

<template>
  <span class="inline-flex items-baseline">
    <component :is="href ? 'a' : 'span'" :href="href ?? undefined" class="api-type" :class="`api-type--${family}`">
      <component :is="icon" aria-hidden="true" />
      {{ text ?? label.text }}
    </component>
    <span v-if="label.suffix" class="api-type-suffix">{{ label.suffix }}</span>
  </span>
</template>
