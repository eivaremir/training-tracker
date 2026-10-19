// Small helpers shared by the SVG charts.

/** Axis date label: "OCT 5". */
export const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();

/** 1 / 2 / 2.5 / 5 × 10ⁿ: tick steps that read well (2.5 matches plate jumps). */
export const niceStep = (raw: number) => {
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].find((f) => raw / mag <= f)! * mag;
};
