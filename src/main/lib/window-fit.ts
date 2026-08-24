export interface WindowSize {
  width: number;
  height: number;
}

export interface WindowFitResult extends WindowSize {
  clamped: boolean;
}

/** Fits a fixed-size window into a display's work area; `clamped` marks a shrunk window. */
export const computeWindowFit = (
  workArea: WindowSize,
  target: WindowSize,
  min: WindowSize,
  margin = 16,
): WindowFitResult => {
  const fitAxis = (available: number, wanted: number, floor: number): number =>
    Math.max(floor, Math.min(wanted, available - margin));
  const width = fitAxis(workArea.width, target.width, min.width);
  const height = fitAxis(workArea.height, target.height, min.height);
  return { width, height, clamped: width < target.width || height < target.height };
};
