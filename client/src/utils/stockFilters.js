// Client-only filter & helpers that work with both "batch" and "grouped" rows
export const LOW_STOCK_THRESHOLD = 40;

export function getQty(row) {
  // Try batch shape first; then grouped shape
  if (row.quantity_remaining != null) return Number(row.quantity_remaining);
  if (row.quantity != null) return Number(row.quantity);
  return 0;
}

export function rowMatchesFilters(row, f) {
  const desc = (row.description || '').toLowerCase();
  const hs = (row.hs_code || row.hs_codes || '').toString().toLowerCase();
  const gd = (row.gd_number || '').toLowerCase();
  const unit = (row.unit || '').toLowerCase();
  const stockedBy = (row.stocked_by || '').toLowerCase();

  const searchHit = (f.search || '').trim().toLowerCase();
  if (searchHit) {
    const hay = [desc, hs, gd, unit, stockedBy].join(' ');
    if (!hay.includes(searchHit)) return false;
  }

  if (f.description && !desc.includes(f.description.toLowerCase())) return false;
  if (f.hs_code && !hs.includes(f.hs_code.toLowerCase())) return false;
  if (f.gd_number && !gd.includes(f.gd_number.toLowerCase())) return false;
  if (f.unit && !unit.includes(f.unit.toLowerCase())) return false;
  if (f.stocked_by && !stockedBy.includes(f.stocked_by.toLowerCase())) return false;

  if (f.date_from || f.date_to) {
    // accept either stocked_at or last_updated if present; if neither, treat as pass
    const ts = row.stocked_at || row.last_updated;
    if (ts) {
      const d = new Date(ts);
      if (f.date_from && d < new Date(f.date_from)) return false;
      if (f.date_to && d > new Date(f.date_to + 'T23:59:59')) return false;
    }
  }

  if (f.low_stock_only && getQty(row) >= LOW_STOCK_THRESHOLD) return false;

  return true;
}

export function applyFilters(rows, filters) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => rowMatchesFilters(r, filters));
}
