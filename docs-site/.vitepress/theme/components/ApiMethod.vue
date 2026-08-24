<script setup lang="ts">
// Full method block: head (name + return chip), mono signature, description,
// params and examples. Used by ApiFieldList (top-level methods) and ApiSection
// (single-method pages like ctx.log / ctx.alert).
import { computed } from 'vue';
import type {
  MemberMeta,
  TypeMeta,
} from '../../../../tools/vite-plugins/script-ctx-codegen-types';
import ApiTypeBadge from './ApiTypeBadge.vue';
import ApiExample from './ApiExample.vue';
import { typeLabel } from '../lib/type-label';

const props = defineProps<{ member: MemberMeta; prefix?: string }>();

// Scripts são JS puro: assinatura sem tipagem nem retorno (`ctx.macro.pause(reason)`).
const signature = computed((): string => {
  const m = props.member;
  if (m.kind !== 'method') return '';
  const params = m.params.map((p) => p.name).join(', ');
  return `${props.prefix ?? 'ctx.'}${m.name}(${params})`;
});

// Return chip: `void` → ação; otherwise `retorna X` with X's family.
const returnChip = computed((): { type: TypeMeta; text: string; family?: 'action' } | null => {
  const m = props.member;
  if (m.kind !== 'method') return null;
  if (m.returns.kind === 'primitive' && m.returns.name === 'void') {
    return { type: m.returns, text: 'ação', family: 'action' };
  }
  const label = typeLabel(m.returns);
  if (label.family === 'action') return { type: m.returns, text: 'ação', family: 'action' };
  return { type: m.returns, text: `retorna ${label.text}` };
});

const examples = computed((): readonly { html: string }[] => {
  const jsDoc = props.member.jsDoc;
  if (!jsDoc) return [];
  return jsDoc.tags
    .filter((t) => t.tag === 'example' && t.textHtml)
    .map((t) => ({ html: t.textHtml as string }));
});
</script>

<template>
  <div v-if="member.kind === 'method'" class="api-method">
    <div class="api-method-head">
      <code>{{ member.name }}</code>
      <ApiTypeBadge v-if="returnChip" :type="returnChip.type" :text="returnChip.text" :family="returnChip.family" />
    </div>
    <pre class="api-sig"><code>{{ signature }}</code></pre>
    <div
      v-if="member.jsDoc?.descriptionHtml"
      class="vp-doc api-desc"
      v-html="member.jsDoc.descriptionHtml"
    />
    <template v-if="member.params.length > 0">
      <div class="api-params-label">Parâmetros</div>
      <div class="api-params">
        <div v-for="p in member.params" :key="p.name" class="api-param">
          <code>{{ p.name }}</code>
          <ApiTypeBadge :type="p.type" />
          <span v-if="p.optional" class="api-type-suffix">(opcional)</span>
          <span v-if="p.description" class="api-desc">— {{ p.description }}</span>
        </div>
      </div>
    </template>
    <ApiExample
      v-for="(ex, i) in examples"
      :key="i"
      :html="ex.html"
      :title="examples.length > 1 ? `Exemplo ${i + 1}` : 'Exemplo'"
    />
  </div>
</template>
