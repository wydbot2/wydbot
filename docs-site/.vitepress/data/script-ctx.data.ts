// Build-time loader: reads the JSON emitted by the codegen Vite plugin and
// exposes `meta.interfaces` for the Vue components on the API pages.
//
// It also pre-renders every JSDoc `description` (and `@param` description)
// from markdown to HTML into a `descriptionHtml` field, using VitePress's own
// markdown engine (so ```ts blocks get Shiki highlighting). Components render
// that via `v-html`, so inline `code`, **bold** and code blocks show
// formatted instead of as literal markdown. The codegen JSON is never mutated
// — enrichment runs on a clone, at build time only.
import { createMarkdownRenderer } from 'vitepress';
import meta from '../../../src/renderer/lib/script-ctx-meta.generated.json' with { type: 'json' };
import type {
  JsDocMeta,
  MemberMeta,
  ScriptCtxMeta,
  TypeMeta,
} from '../../../tools/vite-plugins/script-ctx-codegen-types';

type Md = Awaited<ReturnType<typeof createMarkdownRenderer>>;

const raw = meta as unknown as ScriptCtxMeta;

const setHtml = (md: Md, jsDoc: JsDocMeta | null): void => {
  if (!jsDoc) return;
  if (jsDoc.description) {
    (jsDoc as { descriptionHtml?: string }).descriptionHtml = md.render(jsDoc.description);
  }
  // Pre-render `@example` code blocks (the `text` already carries a ```js fence).
  for (const tag of jsDoc.tags) {
    if (tag.tag === 'example' && tag.text) {
      (tag as { textHtml?: string }).textHtml = md.render(tag.text);
    }
  }
};

const enrichType = (md: Md, type: TypeMeta): void => {
  if (type.kind === 'object') type.members.forEach((m) => enrichMember(md, m));
  else if (type.kind === 'array') enrichType(md, type.element);
  else if (type.kind === 'promise') enrichType(md, type.resolved);
};

const enrichMember = (md: Md, member: MemberMeta): void => {
  setHtml(md, member.jsDoc);
  if (member.kind === 'property') {
    enrichType(md, member.type);
  } else {
    for (const p of member.params) {
      if (p.description) {
        (p as { descriptionHtml?: string }).descriptionHtml = md.render(p.description);
      }
    }
    enrichType(md, member.returns);
  }
};

const enrich = (md: Md, source: ScriptCtxMeta): ScriptCtxMeta => {
  const cloned = structuredClone(source);
  for (const iface of cloned.interfaces) {
    setHtml(md, iface.jsDoc);
    iface.members.forEach((m) => enrichMember(md, m));
  }
  return cloned;
};

export default {
  watch: ['../../src/renderer/lib/script-ctx-meta.generated.json'],
  async load(): Promise<ScriptCtxMeta> {
    const md = await createMarkdownRenderer(process.cwd());
    return enrich(md, raw);
  },
};

// VitePress injects the resolved `load()` result here at build time.
export declare const data: ScriptCtxMeta;
