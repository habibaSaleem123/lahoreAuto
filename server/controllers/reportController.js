// server/controllers/reportController.js
const dbx = require('../config/db'); // { db, get, all, run }
const { db } = dbx;

/**
 * GET /api/reports/stock/summary
 * Query:
 *   q                optional (search in description, hs_code, item_id, gd_number)
 *   only_in_stock=1  optional (filter rows where current_qty > 0)
 */
exports.getStockSummary = (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const onlyInStock = req.query.only_in_stock === '1';

    const like = `%${q}%`;

    // In SQLite: DISTINCT aggregates can have only one arg.
    // Use group_concat(DISTINCT x) (no custom sep) and pretty-print in JS.
    const sql = `
      SELECT
        gi.item_id,
        gi.description,
        gi.hs_code,
        gi.unit,

        inv.gd_entry_id                      AS gd_id,
        ge.gd_number                         AS gd_number,

        MIN(inv.stocked_at)                  AS first_stocked_at,
        group_concat(DISTINCT inv.stocked_by) AS stocked_by_raw,

        COALESCE(SUM(inv.quantity_remaining), 0)    AS current_qty,
        COALESCE(gi.cost, 0)                        AS unit_cost,
        COALESCE(gi.mrp, 0)                         AS mrp,

        (
          SELECT COALESCE(SUM(sii.quantity_sold), 0)
          FROM sales_invoice_items sii
          WHERE sii.item_id = gi.item_id AND sii.gd_entry_id = inv.gd_entry_id
        ) AS total_sold,

        (
          SELECT COALESCE(SUM(sr.quantity_returned), 0)
          FROM sales_returns sr
          JOIN sales_invoice_items sii2 ON sii2.id = sr.invoice_item_id
          WHERE sii2.item_id = gi.item_id
            AND sii2.gd_entry_id = inv.gd_entry_id
            AND sr.restock = 1
        ) AS total_returned_restock,

        (
          SELECT COALESCE(SUM(sr.quantity_returned), 0)
          FROM sales_returns sr
          JOIN sales_invoice_items sii3 ON sii3.id = sr.invoice_item_id
          WHERE sii3.item_id = gi.item_id
            AND sii3.gd_entry_id = inv.gd_entry_id
            AND sr.restock = 0
        ) AS total_returned_no_restock

      FROM inventory inv
      JOIN gd_entries ge
        ON ge.id = inv.gd_entry_id
      JOIN gd_items gi
        ON gi.item_id = inv.item_id
       AND gi.gd_entry_id = inv.gd_entry_id

      WHERE (@q = '' OR gi.description LIKE @like OR gi.hs_code LIKE @like OR gi.item_id LIKE @like OR ge.gd_number LIKE @like)

      GROUP BY
        gi.item_id, inv.gd_entry_id, ge.gd_number, gi.description, gi.hs_code, gi.unit, gi.cost, gi.mrp

      ${onlyInStock ? 'HAVING current_qty > 0' : ''}

      ORDER BY gi.description ASC, ge.gd_number ASC
    `;

    const rows = dbx.all(sql, { q, like }).map(r => ({
      ...r,
      // turn "a,b,c" into "a, b, c"
      stocked_by: r.stocked_by_raw ? r.stocked_by_raw.split(',').join(', ') : ''
    }));

    res.json(rows);
  } catch (err) {
    console.error('❌ Stock summary error:', err);
    res.status(500).json({ error: 'Failed to load stock summary' });
  }
};

/**
 * GET /api/reports/stock/ledger?item_id=...&gd_id=...
 * Chronological movement for a given (item_id × GD):
 *   - Stock-in (inventory)
 *   - Sales (sales_invoices + sales_invoice_items)
 *   - Returns (sales_returns) — split restock true/false
 */
exports.getStockLedger = (req, res) => {
  const { item_id, gd_id } = req.query;
  if (!item_id || !gd_id) {
    return res.status(400).json({ error: 'item_id and gd_id are required' });
  }

  try {
    // Stock-in
    const ins = dbx.all(
      `
      SELECT
        'stock-in' AS type,
        inv.stocked_at AS ts,
        inv.stocked_by AS actor,
        inv.quantity   AS qty,
        inv.cost       AS unit_cost,
        inv.mrp        AS mrp,
        NULL           AS ref
      FROM inventory inv
      WHERE inv.item_id = @item_id AND inv.gd_entry_id = @gd_id
      ORDER BY inv.stocked_at ASC, inv.id ASC
      `,
      { item_id, gd_id: Number(gd_id) }
    );

    // Sales
    const sales = dbx.all(
      `
      SELECT
        'sale'                     AS type,
        si.created_at              AS ts,
        c.name                     AS actor,
        sii.quantity_sold          AS qty,
        sii.cost                   AS unit_cost,
        sii.mrp                    AS mrp,
        si.invoice_number          AS ref
      FROM sales_invoice_items sii
      JOIN sales_invoices si ON si.id = sii.invoice_id
      JOIN customers c       ON c.id = si.customer_id
      WHERE sii.item_id = @item_id AND sii.gd_entry_id = @gd_id
      ORDER BY si.created_at ASC, sii.id ASC
      `,
      { item_id, gd_id: Number(gd_id) }
    );

    // Returns
    const rets = dbx.all(
      `
      SELECT
        CASE WHEN sr.restock = 1 THEN 'return-restock' ELSE 'return-no-restock' END AS type,
        sr.created_at          AS ts,
        c.name                 AS actor,
        sr.quantity_returned   AS qty,
        sii.cost               AS unit_cost,
        sii.mrp                AS mrp,
        sr.return_number       AS ref
      FROM sales_returns sr
      JOIN sales_invoice_items sii ON sii.id = sr.invoice_item_id
      JOIN sales_invoices si       ON si.id = sii.invoice_id
      JOIN customers c             ON c.id = si.customer_id
      WHERE sii.item_id = @item_id AND sii.gd_entry_id = @gd_id
      ORDER BY sr.created_at ASC, sr.id ASC
      `,
      { item_id, gd_id: Number(gd_id) }
    );

    // Merge & compute running balance
    const events = [...ins, ...sales, ...rets].sort((a, b) => {
      const at = new Date(a.ts).getTime(); const bt = new Date(b.ts).getTime();
      if (at !== bt) return at - bt;
      const order = { 'stock-in': 0, 'sale': 1, 'return-restock': 2, 'return-no-restock': 3 };
      return (order[a.type] ?? 99) - (order[b.type] ?? 99);
    });

    let running = 0;
    const withBalance = events.map(e => {
      const delta =
        e.type === 'sale'             ? -Number(e.qty || 0) :
        e.type === 'stock-in'         ?  Number(e.qty || 0) :
        e.type === 'return-restock'   ?  Number(e.qty || 0) :
                                         0; // return-no-restock
      running += delta;
      return { ...e, delta, balance_after: running };
    });

    res.json({ events: withBalance });
  } catch (err) {
    console.error('❌ Stock ledger error:', err);
    res.status(500).json({ error: 'Failed to load stock ledger' });
  }
};

/**
 * GET /api/reports/profit/summary?from=&to=&group_by=day|week|month&tax_section=&filer_status=&q=
 * Computes totals, trends, top products/customers under filters.
 */
exports.profitSummary = (req, res) => {
  try {
    const { from, to, group_by = 'month', tax_section = 'all', filer_status = 'all', q = '' } = req.query;

    // WHERE + named params for SQLite
    const where = ['1=1'];
    const params = {};

    if (from) { where.push("date(si.created_at) >= date(@from)"); params.from = from; }
    if (to)   { where.push("date(si.created_at) <= date(@to)");   params.to   = to;   }

    if (tax_section !== 'all')   { where.push("si.tax_section = @tax_section");     params.tax_section = tax_section; }
    if (filer_status !== 'all')  { where.push("si.filer_status = @filer_status");   params.filer_status = filer_status; }

    if (q) {
      where.push(`(
        c.name LIKE @like OR c.business_name LIKE @like OR EXISTS (
          SELECT 1
          FROM sales_invoice_items sii
          JOIN gd_items gi ON gi.item_id = sii.item_id
          WHERE sii.invoice_id = si.id
            AND (gi.description LIKE @like OR gi.hs_code LIKE @like)
        )
      )`);
      params.like = `%${q}%`;
    }

    // Group key
    const grp =
      group_by === 'day'  ? `date(si.created_at)` :
      group_by === 'week' ? `strftime('%Y-%W', si.created_at)` :
                            `strftime('%Y-%m', si.created_at)`;

    // Totals
    const totals = dbx.get(
      `
      SELECT
        COUNT(DISTINCT si.id) AS invoices,
        COALESCE(SUM(si.gross_total),0)         AS revenue,
        COALESCE(SUM(si.sales_tax),0)           AS sales_tax,
        COALESCE(SUM(si.income_tax_paid),0)     AS income_tax_paid,
        COALESCE(SUM(si.withholding_tax),0)     AS withholding_tax,
        COALESCE(SUM(si.total_refund),0)        AS refunds
      FROM sales_invoices si
      JOIN customers c ON c.id = si.customer_id
      WHERE ${where.join(' AND ')}
      `,
      params
    ) || {};

    const cogsRow = dbx.get(
      `
      SELECT COALESCE(SUM(sii.quantity_sold * sii.cost), 0) AS cogs
      FROM sales_invoice_items sii
      JOIN sales_invoices si ON si.id = sii.invoice_id
      JOIN customers c ON c.id = si.customer_id
      WHERE ${where.join(' AND ')}
      `,
      params
    ) || { cogs: 0 };

    const itemsSoldRow = dbx.get(
      `
      SELECT COALESCE(SUM(sii.quantity_sold), 0) AS items_sold
      FROM sales_invoice_items sii
      JOIN sales_invoices si ON si.id = sii.invoice_id
      JOIN customers c ON c.id = si.customer_id
      WHERE ${where.join(' AND ')}
      `,
      params
    ) || { items_sold: 0 };

    const returnsRow = dbx.get(
      `
      SELECT COALESCE(SUM(sr.quantity_returned), 0) AS returns
      FROM sales_returns sr
      JOIN sales_invoices si ON si.id = sr.invoice_id
      JOIN customers c ON c.id = si.customer_id
      WHERE ${where.join(' AND ')}
      `,
      params
    ) || { returns: 0 };

    const totalsCombined = {
      ...totals,
      cogs: Number(cogsRow.cogs || 0),
      items_sold: Number(itemsSoldRow.items_sold || 0),
      returns: Number(returnsRow.returns || 0),
    };

    const net_revenue   = Number(totalsCombined.revenue || 0) - Number(totalsCombined.refunds || 0);
    const gross_profit  = net_revenue - Number(totalsCombined.cogs || 0);
    const gross_margin_pct = net_revenue > 0 ? (gross_profit / net_revenue) * 100 : 0;
    const net_profit    = gross_profit - Number(totalsCombined.income_tax_paid || 0);

    // Trend
    const trendRows = dbx.all(
      `
      SELECT
        ${grp} AS period,
        COALESCE(SUM(si.gross_total),0)     AS revenue,
        COALESCE(SUM(si.total_refund),0)    AS refunds,
        COALESCE(SUM(si.sales_tax),0)       AS sales_tax,
        COALESCE(SUM(si.income_tax_paid),0) AS income_tax_paid,
        MIN(si.created_at)                  AS period_start
      FROM sales_invoices si
      JOIN customers c ON c.id = si.customer_id
      WHERE ${where.join(' AND ')}
      GROUP BY period
      ORDER BY period_start
      `,
      params
    );

    const trend = trendRows.map(r => {
      const cogsRow = dbx.get(
        `
        SELECT COALESCE(SUM(sii.quantity_sold * sii.cost),0) AS cogs
        FROM sales_invoice_items sii
        JOIN sales_invoices si ON si.id = sii.invoice_id
        JOIN customers c ON c.id = si.customer_id
        WHERE ${where.join(' AND ')} AND ${grp} = @period
        `,
        { ...params, period: r.period }
      ) || { cogs: 0 };

      const netRev = Number(r.revenue || 0) - Number(r.refunds || 0);
      const gp = netRev - Number(cogsRow.cogs || 0);
      const np = gp - Number(r.income_tax_paid || 0);

      return {
        period: String(r.period),
        revenue: netRev,
        cogs: Number(cogsRow.cogs || 0),
        gross_profit: gp,
        net_profit: np
      };
    });

    // Top products
    const top_products = dbx.all(
      `
      SELECT
        gi.item_id,
        gi.description,
        COALESCE(SUM(sii.quantity_sold),0) AS qty,
        COALESCE(SUM(sii.quantity_sold * sii.sale_rate),0) AS revenue,
        COALESCE(SUM(sii.quantity_sold * (sii.sale_rate - sii.cost)),0) AS gp
      FROM sales_invoice_items sii
      JOIN sales_invoices si ON si.id = sii.invoice_id
      JOIN customers c ON c.id = si.customer_id
      JOIN gd_items gi ON gi.item_id = sii.item_id
      WHERE ${where.join(' AND ')}
      GROUP BY gi.item_id, gi.description
      ORDER BY revenue DESC
      LIMIT 10
      `,
      params
    );

    // Top customers
    const top_customers = dbx.all(
      `
      WITH base AS (
        SELECT
          si.id,
          si.customer_id,
          (si.gross_total - si.total_refund) AS net_rev
        FROM sales_invoices si
        JOIN customers c ON c.id = si.customer_id
        WHERE ${where.join(' AND ')}
      )
      SELECT
        c.id AS customer_id,
        c.name,
        COALESCE(SUM(b.net_rev),0) AS revenue,
        COALESCE(SUM(b.net_rev),0) -
          COALESCE((
            SELECT SUM(sii.quantity_sold * sii.cost)
            FROM sales_invoice_items sii
            JOIN sales_invoices si2 ON si2.id = sii.invoice_id
            WHERE si2.customer_id = c.id
              AND ${where.join(' AND ').replaceAll('si.', 'si2.')}
          ),0) AS gp
      FROM base b
      JOIN customers c ON c.id = b.customer_id
      GROUP BY c.id, c.name
      ORDER BY revenue DESC
      LIMIT 10
      `,
      params
    );

    res.json({
      totals: {
        ...totalsCombined,
        net_revenue,
        gross_profit,
        gross_margin_pct,
        net_profit
      },
      trend,
      top_products,
      top_customers
    });
  } catch (err) {
    console.error('profitSummary error:', err);
    res.status(500).json({ error: 'Failed to load profit summary' });
  }
};
