import type { Accuracy } from '../../api';
import { gwh, mw, ukDay } from '../../format';
import { Card } from '../ui';
import { errorTone, signedGw, type DayNavigation } from './helpers';

export function WorstDaysTable({ daily, linkToDay, onOpenDay }: { daily: Accuracy['daily'] } & DayNavigation) {
  const worst = [...daily].sort((a, b) => b.mae - a.mae).slice(0, 8);
  return (
    <Card flush title="Worst days">
      {!worst.length ? <p className="status">No scored deliveries in this range.</p> : (
        <div className="table-wrap accuracy-worst">
          <table>
            <thead><tr><th>Delivery</th><th>Forecast</th><th>Outturn ≈</th><th>MAE</th><th>Bias</th></tr></thead>
            <tbody>{worst.map((day) => <tr key={day.date}>
              <td><a href={linkToDay(day.date)} onClick={(event) => {
                if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
                event.preventDefault();
                onOpenDay(day.date);
              }}>{ukDay(day.date)}</a></td>
              <td>{gwh(day.forecast_mwh, 0)}</td><td>{gwh(day.actual_mwh, 0)}</td><td>{mw(day.mae)}</td>
              <td className={errorTone(day.bias)}>{signedGw(day.bias)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
