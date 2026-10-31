import type { Brief } from '../../api';
import { mw, ukHour } from '../../format';
import { Card } from '../ui';
import { bandSpan } from './helpers';

const value = (power: number | null) => power == null ? '–' : mw(power).replace(' MW', '');

export function HourlyTable({ brief, showActual, onDownload }: {
  brief: Brief;
  showActual: boolean;
  onDownload: () => void;
}) {
  return (
    <div className="brief-hourly">
      <Card flush title="Hourly values · MW" tools={<button type="button" className="brief-download" onClick={onDownload}>Download CSV</button>}>
        <div className="table-wrap table-wrap--scroll" role="region" aria-label="Hourly values in MW" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">Hour</th>
                <th scope="col">Forecast</th>
                <th scope="col">P10</th>
                <th scope="col">P90</th>
                <th scope="col">Span</th>
                {showActual && <th scope="col">Outturn*</th>}
              </tr>
            </thead>
            <tbody>
              {brief.hours.map((hour) => (
                <tr key={hour.time}>
                  <td>{ukHour(hour.time)}</td>
                  <td>{value(hour.forecast)}</td>
                  <td>{value(hour.p10)}</td>
                  <td>{value(hour.p90)}</td>
                  <td>{value(bandSpan(hour))}</td>
                  {showActual && <td>{value(hour.actual)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
