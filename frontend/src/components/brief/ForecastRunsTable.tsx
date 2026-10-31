import type { Brief } from '../../api';
import { ukStamp } from '../../format';
import { Card } from '../ui';
import { forecastRunRows, gwhValue, signedValue } from './helpers';

export function ForecastRunsTable({ brief }: { brief: Brief }) {
  const runs = forecastRunRows(brief);
  return (
    <div className="brief-runs">
      <Card flush title={<>Forecast runs <span className="muted">published before delivery</span></>}>
        <div className="table-wrap" role="region" aria-label="Forecast runs" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">Published</th>
                <th scope="col">Lead to 00:00</th>
                <th scope="col">Day total</th>
                <th scope="col">Change, GWh</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.published} className={run.used ? 'is-used' : run.late ? 'is-late' : ''}>
                  <td>
                    {ukStamp(run.published)}
                    {run.used ? <span className="tag tag--used">used</span>
                      : run.late ? <span className="tag">after GC</span> : null}
                  </td>
                  <td>{run.lead.toFixed(1)} h</td>
                  <td title={run.full ? undefined : 'This run does not cover the full delivery day, so no day total'}>
                    {run.full ? `${gwhValue(run.total)} GWh` : <span className="muted">partial ({run.covered} of {brief.hours.length} h)</span>}
                  </td>
                  <td>{run.delta == null ? '–' : signedValue(run.delta / 1000, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!runs.length && <p className="footnote">No runs published before delivery cover this day.</p>}
      </Card>
    </div>
  );
}
