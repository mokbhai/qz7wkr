import type { FullMetrics } from '../../api';
import { mw, pct } from '../../format';
import { Stat } from '../ui';
import { number } from './helpers';

export function MetricsRow({ metrics: m }: { metrics: FullMetrics }) {
  return (
    <div className="stats">
      <Stat label="Mean absolute error" value={number(m.mae)} unit="MW" note={`${pct(m.nmae)} of mean output · RMSE ${mw(m.rmse)}`} />
      <Stat label="Mean error (bias)" value={`${m.bias > 0 ? '+' : ''}${number(m.bias)}`} unit="MW"
        note={m.bias > 0 ? 'forecast high → buyer short' : m.bias < 0 ? 'forecast low → buyer long' : 'no mean over- or under-forecast'} />
      <Stat label="90th-percentile absolute error" value={number(m.p90_abs)} unit="MW" note={`exceeded 1 hour in 10 · max ${mw(m.max_abs)}`} />
      <Stat label="Hours scored" value={number(m.n)} note={`mean lead ${m.mean_horizon_h.toFixed(1)} h`} />
    </div>
  );
}
