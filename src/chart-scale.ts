export type AxisScale = {
  domain: [number, number];
  ticks: number[];
};

/** Builds half-point ticks while keeping the upper domain boundary unlabeled. */
export function calculateAxisScale(values: number[], defaultMinimum?: number): AxisScale {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { domain: [defaultMinimum ?? 0, (defaultMinimum ?? 0) + 1], ticks: [defaultMinimum ?? 0, (defaultMinimum ?? 0) + 0.5] };

  const dataMinimum = Math.min(...finite);
  const dataMaximum = Math.max(...finite);
  const minimum = defaultMinimum == null ? dataMinimum : Math.min(defaultMinimum, dataMinimum);
  const paddedMaximum = dataMaximum > 0 ? dataMaximum * 1.05 : dataMaximum * 0.95;
  const maximum = Math.max(minimum + 0.5, paddedMaximum);
  const ticks: number[] = [];
  const firstTick = Math.ceil(minimum * 2) / 2;
  for (let value = firstTick; value < maximum - 1e-9; value += 0.5) ticks.push(Number(value.toFixed(1)));
  return { domain: [minimum, maximum], ticks };
}
