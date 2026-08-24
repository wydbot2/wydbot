<script setup lang="ts">
// Renders one top-level `ctx.X` member inside an ApiCard:
// - object      → dense field lanes + method blocks (player, macro)
// - entity-list → thin page pointing to the element type's own page (npcs, …)
// - method      → single method block (log, alert)
import { computed } from 'vue';
import { withBase } from 'vitepress';
import type { MemberMeta } from '../../../../tools/vite-plugins/script-ctx-codegen-types';
import ApiCard from './ApiCard.vue';
import ApiFieldList from './ApiFieldList.vue';
import ApiMethod from './ApiMethod.vue';
import ApiExample from './ApiExample.vue';
import ApiNote from './ApiNote.vue';
import ApiTypeBadge from './ApiTypeBadge.vue';
import { LINKABLE } from '../lib/type-label';

const props = defineProps<{
  /** Top-level member of `ScriptCtx` (e.g. `player`, `npcs`, `macro`, `log`). */
  member: MemberMeta;
}>();

type Variant =
  | { kind: 'object'; members: readonly MemberMeta[] }
  | { kind: 'entity-list'; typeName: string }
  | { kind: 'method'; method: MemberMeta }
  | { kind: 'unknown' };

const variant = computed<Variant>(() => {
  const m = props.member;
  if (m.kind === 'method') return { kind: 'method', method: m };
  if (m.kind === 'property') {
    if (m.type.kind === 'object') return { kind: 'object', members: m.type.members };
    if (m.type.kind === 'array' && m.type.element.kind === 'reference') {
      return { kind: 'entity-list', typeName: m.type.element.name };
    }
  }
  return { kind: 'unknown' };
});

const elementHref = computed(() =>
  variant.value.kind === 'entity-list' ? withBase(LINKABLE[variant.value.typeName] ?? '') : '',
);

const examples = computed((): readonly { html: string }[] => {
  const jsDoc = props.member.jsDoc;
  if (!jsDoc) return [];
  return jsDoc.tags
    .filter((t) => t.tag === 'example' && t.textHtml)
    .map((t) => ({ html: t.textHtml as string }));
});
</script>

<template>
  <ApiCard :label="`ctx.${member.name}`">
    <ApiFieldList v-if="variant.kind === 'object'" :fields="variant.members" :prefix="`ctx.${member.name}.`" />

    <template v-else-if="variant.kind === 'entity-list'">
      <div class="api-fields">
        <div class="api-field">
          <code>{{ member.name }}</code>
          <span>
            <ApiTypeBadge :type="member.type" :text="`lista de ${variant.typeName}`" />
          </span>
          <span class="api-desc">
            Cada entrada segue o formato
            <strong class="text-[var(--vp-c-text-1)]">{{ variant.typeName }}</strong> — campos e
            métodos documentados na página do tipo.
          </span>
        </div>
      </div>
      <ApiExample v-for="(ex, i) in examples" :key="i" :html="ex.html" />
      <ApiNote>
        <span>
          Campos como <code>name</code>, <code>position</code> e o método <code>isWithin()</code>
          estão em <a :href="elementHref">{{ variant.typeName }}</a
          >.
        </span>
      </ApiNote>
    </template>

    <ApiMethod v-else-if="variant.kind === 'method'" :member="variant.method" />

    <slot name="after" />
  </ApiCard>
</template>
