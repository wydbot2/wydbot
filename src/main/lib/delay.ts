/** Resolve after `ms` milliseconds. Shared so update/asset-update don't each redeclare it. */
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
