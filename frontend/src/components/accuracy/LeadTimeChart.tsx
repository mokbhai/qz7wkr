import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import type { Accuracy, HorizonPoint, Loadable } from '../../api';
import { gw } from '../../format';
import { axisTick, Card, ChartFrame, ChartTooltip, Legend, Status } from '../ui';
import { errorTone, leadRange, leadSummary, number, powerTicks, signedGw, type Mode } from './helpers';

export function LeadTimeChart({ state, series, mode, marker }: {
  state: Loadable<{ points: HorizonPoint[] }>;
  series: Accuracy['series'];
  mode: Mode;
  marker: number | null;
}) {
  const points = state.status === 'ok' ? state.data.points.filter((point) => point.n > 0) : [];
  const range = mode === 'decision' ? leadRange(series) : null;
  const data = points.map((point) => ({ ...point, mae: point.mae / 1000, p90_abs: point.p90_abs / 1000, bias: point.bias / 1000 }));
  const ticks = powerTicks(data.flatMap((point) => [point.mae, point.p90_abs, point.bias]), 1);
  const domain: [number, number] = [Math.min(0, ...points.map((point) => point.horizon_h), range?.[0] ?? 0),
    Math.max(0, ...points.map((point) => point.horizon_h), range?.[1] ?? 0, marker ?? 0)];

  return (
    <Card title="Error vs lead time · GW">
      {state.status !== 'ok' ? <Status state={state} label="Loading lead-time errors…" what="lead-time errors" minHeight={260} />
        : !points.length ? <p className="status">No lead-time errors in this range.</p> : (
          <>
            <div className="chart" role="img" aria-label={leadSummary(points)}>
              <ChartFrame height={260}>
                {({ width, height }) => (
                  <LineChart accessibilityLayer width={width} height={height} data={data} margin={{ top: 28, right: 14, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke="var(--grid)" vertical={false} />
                    <XAxis dataKey="horizon_h" type="number" domain={domain} tick={axisTick} stroke="var(--axis)" tickLine={false}
                      tickFormatter={(value: number) => `${value}h`} minTickGap={20} allowDecimals={false} />
                    <YAxis tick={axisTick} stroke="var(--axis)" tickLine={false} axisLine={false} width={36} domain={[ticks[0], ticks[ticks.length - 1]]} ticks={ticks} />
                    {range && <ReferenceArea x1={range[0]} x2={range[1]} fill="var(--ink)" fillOpacity={0.045} strokeOpacity={0} />}
                    {marker != null && <ReferenceLine x={marker} stroke="var(--axis)" strokeDasharray="2 3"
                      label={{ value: mode === 'decision' ? 'mean lead at decision' : `selected ${marker} h`, fontSize: 10,
                        position: 'insideTop', fill: 'var(--muted)' }} />}
                    <Tooltip content={({ active, payload }) => {
                      const point = payload?.[0]?.payload as typeof data[number] | undefined;
                      if (!active || !point) return null;
                      return <ChartTooltip title={`Latest forecast ≥ ${point.horizon_h} h before delivery`} rows={[
                        { label: 'Mean absolute error', value: gw(point.mae * 1000) },
                        { label: '90th-percentile absolute error', value: gw(point.p90_abs * 1000) },
                        { label: 'Mean error (bias)', value: signedGw(point.bias * 1000), tone: errorTone(point.bias) },
                        { label: 'Hours scored', value: `${number(point.n)} h` },
                      ]} />;
                    }} />
                    <Line dataKey="mae" name="MAE" stroke="var(--c-forecast)" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line dataKey="p90_abs" name="P90 absolute error" stroke="var(--ink)" strokeWidth={1.25} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
                    <Line dataKey="bias" name="Bias" stroke="var(--accuracy-bias)" strokeWidth={1.25} strokeDasharray="2 3" dot={false} isAnimationActive={false} />
                  </LineChart>
                )}
              </ChartFrame>
            </div>
            <Legend items={[
              { label: 'MAE', className: 'accuracy-sw-mae' },
              { label: 'P90 absolute error', className: 'accuracy-sw-p90' },
              { label: 'Bias', className: 'accuracy-sw-bias' },
            ]} />
            {range && <p className="footnote accuracy-chart-note">Shading: lead times held at gate closure.</p>}
            <details className="accuracy-data">
              <summary>View data</summary>
              <div className="table-wrap table-wrap--scroll">
                <table>
                  <caption className="accuracy-caption">Errors by minimum forecast lead time</caption>
                  <thead><tr><th>Lead ≥</th><th>MAE · GW</th><th>P90 abs · GW</th><th>Bias · GW</th><th>Hours</th></tr></thead>
                  <tbody>{points.map((point) => <tr key={point.horizon_h}>
                    <td>{point.horizon_h} h</td><td>{(point.mae / 1000).toFixed(2)}</td><td>{(point.p90_abs / 1000).toFixed(2)}</td>
                    <td>{signedGw(point.bias)}</td><td>{number(point.n)}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            </details>
          </>
        )}
    </Card>
  );
}
