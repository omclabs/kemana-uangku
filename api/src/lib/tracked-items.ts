type RefillRow = {
  quantity_added: number;
  remaining_qty_before_refill: number | null;
  date: number;
};

function daysBetween(startUnix: number, endUnix: number): number {
  return (endUnix - startUnix) / 86_400;
}

function buildForecast(refills: RefillRow[], warningDays: number) {
  if (refills.length < 2) {
    return {
      forecast_ready: 0,
      avg_daily_usage: null,
      latest_quantity_added: null,
      estimated_run_out_at: null,
      next_reminder_at: null,
    };
  }

  const rates: number[] = [];

  for (let index = 1; index < refills.length; index += 1) {
    const previous = refills[index - 1];
    const current = refills[index];
    const intervalDays = daysBetween(previous.date, current.date);
    if (intervalDays <= 0) continue;

    const consumed = current.remaining_qty_before_refill !== null
      ? previous.quantity_added - current.remaining_qty_before_refill
      : previous.quantity_added;

    if (consumed <= 0 || consumed > previous.quantity_added) {
      continue;
    }

    rates.push(consumed / intervalDays);
  }

  if (rates.length === 0) {
    return {
      forecast_ready: 0,
      avg_daily_usage: null,
      latest_quantity_added: null,
      estimated_run_out_at: null,
      next_reminder_at: null,
    };
  }

  const avgDailyUsage = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  const latest = refills[refills.length - 1];
  const estimatedRunOutAt = Math.floor(latest.date + (latest.quantity_added / avgDailyUsage) * 86_400);
  const nextReminderAt = estimatedRunOutAt - warningDays * 86_400;

  return {
    forecast_ready: 1,
    avg_daily_usage: avgDailyUsage,
    latest_quantity_added: latest.quantity_added,
    estimated_run_out_at: estimatedRunOutAt,
    next_reminder_at: nextReminderAt,
  };
}

export async function rebuildTrackedItemForecast(
  db: D1Database,
  trackedItemId: string
): Promise<void> {
  const item = await db.prepare(
    'SELECT id, warning_days FROM tracked_items WHERE id = ?'
  )
    .bind(trackedItemId)
    .first<{ id: string; warning_days: number }>();

  if (!item) return;

  const { results } = await db.prepare(
    `SELECT r.quantity_added, r.remaining_qty_before_refill, r.date
     FROM tracked_item_refills r
     LEFT JOIN transactions t ON t.id = r.transaction_id
     WHERE r.tracked_item_id = ?
       AND (r.transaction_id IS NULL OR t.is_active = 1)
     ORDER BY r.date ASC, r.created_at ASC`
  )
    .bind(trackedItemId)
    .all<RefillRow>();

  const forecast = buildForecast(results ?? [], item.warning_days);

  await db.prepare(
    `UPDATE tracked_items
     SET forecast_ready = ?,
         avg_daily_usage = ?,
         latest_quantity_added = ?,
         estimated_run_out_at = ?,
         next_reminder_at = ?,
         last_forecasted_at = CASE WHEN ? = 1 THEN unixepoch() ELSE NULL END,
         updated_at = unixepoch()
     WHERE id = ?`
  )
    .bind(
      forecast.forecast_ready,
      forecast.avg_daily_usage,
      forecast.latest_quantity_added,
      forecast.estimated_run_out_at,
      forecast.next_reminder_at,
      forecast.forecast_ready,
      trackedItemId,
    )
    .run();
}

export function computeDaysRemaining(estimatedRunOutAt: number | null, nowUnix: number): number | null {
  if (estimatedRunOutAt === null) return null;
  return Math.max(0, Math.ceil((estimatedRunOutAt - nowUnix) / 86_400));
}
