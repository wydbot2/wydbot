/**
 * Parser for `Missionhelp.dat` (Lang/PT, latin1) — compose-menu node labels.
 * Each header line is `**Name** <rowid> <code>` (a `<colorhex> <description>` line
 * follows). Returns `rowid → label` (the first int is the rowid). `_` → space; the
 * `**` markers are kept (the game shows them). Both `**_Name_**` and
 * `**Name**` spellings occur, so the regex accepts either.
 */

const ENTRY_RE = /(\*\*.+?\*\*)[ \t]+(\d+)[ \t]+\d+/g;

/** Build a `rowid → display name` map from `Missionhelp.dat`. */
export const parseMissionhelpDat = (buffer: Buffer): Map<number, string> => {
  const text = buffer.toString('latin1');
  const map = new Map<number, string>();
  let m: RegExpExecArray | null;
  while ((m = ENTRY_RE.exec(text)) !== null) {
    const name = m[1].replace(/_/g, ' ').trim();
    const rowid = Number.parseInt(m[2], 10);
    if (name && Number.isFinite(rowid)) map.set(rowid, name);
  }
  ENTRY_RE.lastIndex = 0;
  return map;
};
