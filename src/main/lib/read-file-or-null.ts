import { readFile } from 'node:fs/promises';

/** Read a file, or `null` if it is missing/unreadable (never throws). */
export const readFileOrNull = async (path: string): Promise<Buffer | null> => {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
};
