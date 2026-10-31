import { hasMetrics, type CutoffKey, type Insights, type Loadable, type Meta } from '../../api';
import { gw, pct } from '../../format';
import { Card, Status } from '../ui';
import { signedGw } from './helpers';

export function PilotNotes({ state, cutoff, meta }: { state: Loadable<Insights>; cutoff: CutoffKey; meta: Meta }) {
  const selected = meta.cutoffs.find((item) => item.key === cutoff)!;
  const epex = meta.cutoffs.find((item) => item.key === 'epex')!;
  const n2ex = meta.cutoffs.find((item) => item.key === 'n2ex')!;
  const pilot = state.status === 'ok' ? state.data.cutoffs[cutoff] : null;
  const metrics = pilot?.metrics;
  const comparison = state.status === 'ok' ? state.data.cutoffs : null;
  const gain = comparison && hasMetrics(comparison.epex.metrics) && hasMetrics(comparison.n2ex.metrics) && comparison.epex.metrics.mae > 0
    ? 1 - comparison.n2ex.metrics.mae / comparison.epex.metrics.mae : null;
  const coverage = pilot?.band_coverage;

  return (
    <Card title={`January pilot · all deliveries · ${selected.local_time} ${cutoff === 'epex' ? 'EPEX' : 'N2EX'}`}>
      {state.status !== 'ok' ? <Status state={state} label="Loading pilot notes…" what="pilot notes" minHeight={110} />
        : !metrics || !hasMetrics(metrics) ? <p className="footnote">No scored hours for this gate closure.</p> : (
          <ul className="notes accuracy-notes">
            <li>Mean absolute error at gate closure: {gw(metrics.mae)} ({pct(metrics.nmae)} of mean output). The 90th-percentile absolute error was {gw(metrics.p90_abs)}.</li>
            <li>Mean error: {signedGw(metrics.bias)}{metrics.bias === 0 ? '.' : `; the forecast ran ${metrics.bias > 0 ? 'high' : 'low'} on average.`} Curtailment is an unconfirmed hypothesis; wind data alone cannot establish the cause.</li>
            <li>{coverage && coverage.n > 0
              ? <>P10–P90 band held {pct(coverage.inside)} of outturns, each day calibrated without itself (target 80%): {coverage.inside < 0.8 ? 'slightly narrow' : 'at or above target'}.</>
              : 'No outturns available to score band coverage.'}</li>
            {gain != null && <li>Waiting from {epex.local_time} EPEX to {n2ex.local_time} N2EX {gain >= 0 ? 'reduces' : 'increases'} mean absolute error by {pct(Math.abs(gain), 1)}.</li>}
          </ul>
        )}
    </Card>
  );
}
