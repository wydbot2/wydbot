<script setup lang="ts">
// Dense field lanes (132px name · 168px badge · description), with nested
// objects as railed sub-rows. Top-level methods render as full ApiMethod
// blocks; methods inside sub-objects collapse to a compact row.
import type {
  MemberMeta,
  TypeMeta,
} from '../../../../tools/vite-plugins/script-ctx-codegen-types';
import ApiTypeBadge from './ApiTypeBadge.vue';
import ApiMethod from './ApiMethod.vue';
import ApiExample from './ApiExample.vue';

defineProps<{ fields: readonly MemberMeta[]; prefix?: string }>();

/** Members inlined under a railed sub-block: object members, or the element members of an array-of-object. */
const nestedMembers = (type: TypeMeta): readonly MemberMeta[] | null => {
  if (type.kind === 'object') return type.members;
  if (type.kind === 'array' && type.element.kind === 'object') return type.element.members;
  return null;
};

const methodRowLabel = (member: MemberMeta): string => {
  if (member.kind !== 'method') return member.name;
  const params = member.params.map((p) => p.name).join(', ');
  return `${member.name}(${params})`;
};

const examples = (member: MemberMeta): readonly { html: string }[] => {
  if (!member.jsDoc) return [];
  return member.jsDoc.tags
    .filter((t) => t.tag === 'example' && t.textHtml)
    .map((t) => ({ html: t.textHtml as string }));
};
</script>

<template>
  <div class="api-fields">
    <template v-for="field in fields" :key="field.name">
      <ApiMethod v-if="field.kind === 'method'" :member="field" :prefix="prefix" />

      <div v-else class="api-field">
        <code>{{ field.name }}</code>
        <span><ApiTypeBadge :type="field.type" /></span>
        <span v-if="field.jsDoc?.descriptionHtml" class="vp-doc api-desc" v-html="field.jsDoc.descriptionHtml" />
        <span v-else />

        <div v-if="nestedMembers(field.type)" class="api-subfields">
          <template v-for="leaf in nestedMembers(field.type)" :key="leaf.name">
            <div class="api-row">
              <code>{{ leaf.kind === 'method' ? methodRowLabel(leaf) : leaf.name }}</code>
              <span>
                <ApiTypeBadge
                  v-if="leaf.kind === 'property'"
                  :type="leaf.type"
                />
                <ApiTypeBadge
                  v-else-if="leaf.returns.kind === 'primitive' && leaf.returns.name === 'void'"
                  :type="leaf.returns"
                  text="ação"
                  family="action"
                />
                <ApiTypeBadge v-else :type="leaf.returns" />
              </span>
              <span v-if="leaf.jsDoc?.descriptionHtml" class="vp-doc api-desc" v-html="leaf.jsDoc.descriptionHtml" />
              <span v-else />
            </div>
            <ApiExample
              v-for="(ex, i) in examples(leaf)"
              :key="i"
              :html="ex.html"
              :title="examples(leaf).length > 1 ? `Exemplo ${i + 1}` : 'Exemplo'"
            />
          </template>
        </div>

        <ApiExample
          v-for="(ex, i) in examples(field)"
          :key="i"
          :html="ex.html"
          :title="examples(field).length > 1 ? `Exemplo ${i + 1}` : 'Exemplo'"
          style="grid-column: 1 / -1"
        />
      </div>
    </template>
  </div>
</template>
