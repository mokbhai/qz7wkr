import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import type { Accuracy } from '../../api';
import { gw, ukHour } from '../../format';
import { axisTick, Card, ChartFrame, ChartTooltip, Legend } from '../ui';
import { byHourSummary, errorTone, niceTicks, powerTicks, signedGw } from './helpers';

export function ByHourChart({ points, deliveryDate }: { points: Accuracy['by_hour']; deliveryDate: string }) {
  const data = points.map((point) => ({ ...point, mae: point.mae / 1000, bias: point.bias / 1000 }));
  const values = data.flatMap((point) => [point.mae, point.bias]);
  const positiveTicks = niceTicks(Math.max(0, ...values));
  const ticks = powerTicks([...values, positiveTicks[positiveTicks.length - 1]], positiveTicks[1]);
  const hourLabel = (hour: number) => ukHour(`${deliveryDate}T${String(hour).padStart(2, '0')}:00:00Z`);
  return (
    <Card title="By hour of day · GW">
      {!points.length ? <p className="status">No errors by hour in this range.</p> : (
        <>
          <div className="chart" role="img" aria-label={byHourSummary(points, deliveryDate)}>
            <ChartFrame height={260}>
              {({ width, height }) => (
                <ComposedChart accessibilityLayer width={width} height={height} data={data} margin={{ top: 16, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="hour" tick={axisTick} stroke="var(--axis)" tickLine={false} tickFormatter={(hour: number) => hourLabel(hour).slice(0, 2)} interval={2} />
                  <YAxis tick={axisTick} stroke="var(--axis)" tickLine={false} axisLine={false} width={36}
                    domain={[ticks[0], ticks[ticks.length - 1]]} ticks={ticks} />
                  <ReferenceLine y={0} stroke="var(--axis)" />
                  <Tooltip content={({ active, payload }) => {
                    const point = payload?.[0]?.payload as typeof data[number] | undefined;
                    if (!active || !point) return null;
                    return <ChartTooltip title={`${hourLabel(point.hour)} UK`} rows={[
                      { label: 'Mean absolute error', value: gw(point.mae * 1000) },
                      { label: 'Mean error (bias)', value: signedGw(point.bias * 1000), tone: errorTone(point.bias) },
                    ]} />;
                  }} />
                  <Bar dataKey="mae" name="MAE" fill="var(--c-band-strong)" stroke="var(--c-forecast)" strokeWidth={0.5} isAnimationActive={false} />
                  <Line dataKey="bias" name="Bias" stroke="var(--accuracy-bias)" strokeWidth={1.25} strokeDasharray="2 3" dot={false} isAnimationActive={false} />
                </ComposedChart>
              )}
            </ChartFrame>
          </div>
          <Legend items={[{ label: 'MAE', className: 'accuracy-sw-hour-mae' }, { label: 'Bias', className: 'accuracy-sw-bias' }]} />
          <details className="accuracy-data">
            <summary>View data</summary>
            <div className="table-wrap table-wrap--scroll">
              <table>
                <caption className="accuracy-caption">Errors by UK delivery hour</caption>
                <thead><tr><th>Hour · UK</th><th>MAE · GW</th><th>Bias · GW</th></tr></thead>
                <tbody>{points.map((point) => <tr key={point.hour}>
                  <td>{hourLabel(point.hour)}</td><td>{(point.mae / 1000).toFixed(2)}</td><td>{signedGw(point.bias)}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </Card>
  );
}
