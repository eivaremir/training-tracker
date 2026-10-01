// Cold (oldest / low) → hot (recent / high). t in [0, 1].
const STOPS: [number, [number, number, number]][] = [
  [0.0, [43, 79, 122]],
  [0.45, [120, 120, 130]],
  [0.75, [222, 138, 60]],
  [1.0, [242, 91, 42]]
];

export const heatColor = (t: number) => {
  const lerp = (a: number, b: number, k: number) => Math.round(a + (b - a) * k);
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [a, ca] = STOPS[i];
    const [b, cb] = STOPS[i + 1];
    if (t <= b) {
      const k = (t - a) / (b - a);
      return `rgb(${lerp(ca[0], cb[0], k)},${lerp(ca[1], cb[1], k)},${lerp(ca[2], cb[2], k)})`;
    }
  }
  return `rgb(${STOPS[STOPS.length - 1][1].join(',')})`;
};
