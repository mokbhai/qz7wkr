import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import type { Accuracy } from '../../api';
import { pct } from '../../format';
import { axisTick, Card, ChartFrame, ChartTooltip, Legend } from '../ui';
import { histogramBarWidth, histogramGeometry, histogramInterval, histogramSummary, number } from './helpers';

export function ErrorHistogram({ histogram }: { histogram: Accuracy['histogram'] }) {
  const { bins, domain, ticks } = histogramGeometry(histogram);
  const total = bins.reduce((sum, bin) => sum + bin.count, 0);
  return (
    <Card title="Error distribution">
      {!total ? <p className="status">No error distribution in this range.</p> : (
        <div className="chart" role="img" aria-label={histogramSummary(histogram)}>
          <ChartFrame height={260}>
            {({ width, height }) => {
              const plotWidth = width - 4 - 8 - 44;
              return (
                <BarChart accessibilityLayer width={width} height={height} data={bins} margin={{ top: 18, right: 8, bottom: 24, left: 4 }}
                  barSize={histogramBarWidth(bins[0].from, bins[0].to, plotWidth, domain)}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="midpoint" type="number" scale="linear" domain={domain} ticks={ticks} allowDataOverflow
                    tick={axisTick} stroke="var(--axis)" tickLine={false} label={{ value: 'Error · GW', position: 'insideBottom', offset: -16, ...axisTick }} />
                  <YAxis tick={axisTick} stroke="var(--axis)" tickLine={false} axisLine={false} allowDecimals={false} width={44}
                    label={{ value: 'Hours', angle: -90, position: 'insideLeft', offset: 0, ...axisTick }} />
                  <ReferenceLine x={0} stroke="var(--axis)" />
                  <Tooltip cursor={false} content={({ active, payload }) => {
                    const bin = payload?.[0]?.payload as typeof bins[number] | undefined;
                    if (!active || !bin) return null;
                    return <ChartTooltip title={histogramInterval(bin.from, bin.to)} rows={[
                      { label: 'Hours', value: `${number(bin.count)} h · ${pct(bin.count / total, 1)}` },
                    ]} />;
                  }} />
                  <Bar dataKey="count" name="Hours" isAnimationActive={false} shape={(props: unknown) => {
                    const { y, height: barHeight, fill, payload } = props as {
                      y: number; height: number; fill: string; payload: typeof bins[number];
                    };
                    const binWidth = histogramBarWidth(payload.from, payload.to, plotWidth, domain);
                    const midpoint = 4 + 44 + (payload.midpoint - domain[0]) / (domain[1] - domain[0]) * plotWidth;
                    return <rect x={midpoint - binWidth / 2} y={y} width={binWidth} height={Math.max(0, barHeight)} fill={fill} />;
                  }}>
                    {bins.map((bin) => <Cell key={bin.from} fill={bin.from >= 0 ? 'var(--c-short)' : 'var(--c-long)'} />)}
                  </Bar>
                </BarChart>
              );
            }}
          </ChartFrame>
        </div>
      )}
      <Legend items={[{ label: 'Forecast high (short)', className: 'sw-short' }, { label: 'Forecast low (long)', className: 'sw-long' }]} />
    </Card>
  );
}
