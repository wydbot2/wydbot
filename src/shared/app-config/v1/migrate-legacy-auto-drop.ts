/**
 * Migrate legacy auto-drop rules (`attrs` + `keepAttrs`, AND-only) to the
 * grouped model (`dropGroups` + `keepGroups`, OR of ANDs) so strict parse
 * still loads pre-groups files. Rules already in the new shape pass through.
 */
const migrateRule = (rule: unknown): unknown => {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return rule;
  const r = rule as Record<string, unknown>;
  const hasLegacyAttrs = Object.prototype.hasOwnProperty.call(r, 'attrs');
  const hasLegacyKeep = Object.prototype.hasOwnProperty.call(r, 'keepAttrs');
  if (!hasLegacyAttrs && !hasLegacyKeep) return rule;

  const { attrs, keepAttrs, ...rest } = r;
  const dropGroups = Array.isArray(attrs) && attrs.length > 0 ? [attrs] : [];
  const keepGroups = Array.isArray(keepAttrs) && keepAttrs.length > 0 ? [keepAttrs] : undefined;
  return { ...rest, dropGroups, ...(keepGroups ? { keepGroups } : {}) };
};

export const migrateLegacyAutoDropGroups = (json: unknown): unknown => {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return json;
  const root = json as Record<string, unknown>;
  const misc = root.misc;
  if (!misc || typeof misc !== 'object' || Array.isArray(misc)) return json;
  const autoDrop = (misc as Record<string, unknown>).autoDrop;
  if (!autoDrop || typeof autoDrop !== 'object' || Array.isArray(autoDrop)) return json;
  const rules = (autoDrop as Record<string, unknown>).rules;
  if (!Array.isArray(rules) || rules.length === 0) return json;

  return {
    ...root,
    misc: { ...misc, autoDrop: { ...autoDrop, rules: rules.map(migrateRule) } },
  };
};
