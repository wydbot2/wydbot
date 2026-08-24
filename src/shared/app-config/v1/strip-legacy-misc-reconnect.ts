/** Drop early experimental `misc.reconnect` so strict parse still loads old files. */
export const stripLegacyMiscReconnect = (json: unknown): unknown => {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return json;
  const root = json as Record<string, unknown>;
  const misc = root.misc;
  if (!misc || typeof misc !== 'object' || Array.isArray(misc)) return json;
  if (!Object.prototype.hasOwnProperty.call(misc, 'reconnect')) return json;
  const { reconnect: _drop, ...miscRest } = misc as Record<string, unknown>;
  return { ...root, misc: miscRest };
};
