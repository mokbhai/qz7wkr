import { CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts';
import type { Accuracy } from '../../api';
import { gw, ukStamp } from '../../format';
import { axisTick, Card, ChartFrame, ChartTooltip, Legend, useMediaQuery } from '../ui';
import { errorTone, forecastSummary, leadHours, powerTicks, signedGw } from './helpers';

export function ForecastVsOutturnChart({ series }: { series: Accuracy['series'] }) {
  const narrow = useMediaQuery('(max-width: 640px)');
  const data = series.map((point) => ({ ...point, t: Date.parse(point.time), forecast: point.forecast / 1000, actual: point.actual / 1000 }));
  const ticks = powerTicks(data.flatMap((point) => [point.forecast, point.actual]), 5);
  return (
    <Card title="Forecast vs outturn · GW">
      <div className="chart chart--tall" role="img" aria-label={forecastSummary(series)}>
        <ChartFrame height={narrow ? 280 : 340}>
          {({ width, height }) => (
            <ComposedChart accessibilityLayer width={width} height={height} data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tick={axisTick} stroke="var(--axis)" tickLine={false}
                tickFormatter={(time: number) => ukStamp(new Date(time).toISOString()).split(',')[0]} minTickGap={36} />
              <YAxis tick={axisTick} stroke="var(--axis)" tickLine={false} axisLine={false} allowDecimals={false}
                domain={[ticks[0], ticks[ticks.length - 1]]} ticks={ticks} width={36} />
              <Tooltip content={({ active, payload }) => {
                const point = payload?.[0]?.payload as typeof data[number] | undefined;
                if (!active || !point) return null;
                const error = (point.forecast - point.actual) * 1000;
                return <ChartTooltip title={ukStamp(point.time)} rows={[
                  { label: 'Forecast', value: gw(point.forecast * 1000) },
                  { label: 'Outturn', value: gw(point.actual * 1000) },
                  { label: 'Error', value: signedGw(error), tone: errorTone(error) },
                ]} footer={`run ${ukStamp(point.published)} · ${leadHours(point).toFixed(1)} h ahead`} />;
              }} />
              <Line dataKey="forecast" name="Forecast" stroke="var(--c-forecast)" strokeWidth={1.25} dot={false} isAnimationActive={false} />
              <Line dataKey="actual" name="Outturn" stroke="var(--c-actual)" strokeWidth={1.25} dot={false} isAnimationActive={false} />
            </ComposedChart>
          )}
        </ChartFrame>
      </div>
      <Legend items={[{ label: 'Forecast', className: 'sw-forecast' }, { label: 'Outturn', className: 'sw-actual' }]} />
    </Card>
  );
}
