/**
 * GST helpers.
 *
 * Order totals are stored GST-inclusive (`orders.total_amount` is the grand
 * total the customer pays, typically a round figure). The taxable value and the
 * tax split are therefore derived, never stored:
 *
 *   taxable = total / (1 + rate/100)
 *   tax     = total - taxable
 *   CGST    = SGST = tax / 2          (intra-state supply)
 *
 * e.g. total 3100.00 @ 18% -> taxable 2627.12, CGST 236.44, SGST 236.44.
 */

export const DEFAULT_GST_RATE = 18;

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/** Normalises a GST rate; falls back to the default when absent or invalid. */
export function normalizeGstRate(value, fallback = DEFAULT_GST_RATE) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return fallback;
  return round2(parsed);
}

/**
 * Splits a GST-inclusive total into its taxable value and CGST/SGST halves.
 * The SGST half absorbs any rounding remainder so the parts always add back up
 * to the exact total.
 */
export function computeGst({ total, gstRate = DEFAULT_GST_RATE, quantity = 1 } = {}) {
  const grandTotal = round2(Number(total) || 0);
  const rate = normalizeGstRate(gstRate);
  const halfRate = round2(rate / 2);

  const taxable = round2(grandTotal / (1 + rate / 100));
  const totalTax = round2(grandTotal - taxable);
  const cgst = round2(totalTax / 2);
  const sgst = round2(totalTax - cgst);

  const qty = Number(quantity) > 0 ? Number(quantity) : 1;

  return {
    gstRate: rate,
    cgstRate: halfRate,
    sgstRate: halfRate,
    taxableValue: taxable,
    ratePerUnit: round2(taxable / qty),
    cgstAmount: cgst,
    sgstAmount: sgst,
    totalTax,
    grandTotal,
  };
}

/**
 * The same split, further broken into the product, delivery and cutting lines.
 * `orders.total_amount` already includes delivery and cutting, so their taxable
 * values are derived first and the product line absorbs the remainder — the
 * lines always add back up to `taxableValue`.
 */
export function computeGstBreakdown({
  total, gstRate = DEFAULT_GST_RATE, quantity = 1, deliveryCharge = 0, cuttingCharge = 0,
} = {}) {
  const gst = computeGst({ total, gstRate, quantity });
  const clamp = (value, cap) => Math.min(Math.max(round2(Number(value) || 0), 0), cap);
  const taxableOf = (value) => (value ? round2(value / (1 + gst.gstRate / 100)) : 0);

  const delivery = clamp(deliveryCharge, gst.grandTotal);
  const cutting = clamp(cuttingCharge, round2(gst.grandTotal - delivery));
  const deliveryTaxable = taxableOf(delivery);
  const cuttingTaxable = taxableOf(cutting);
  const itemTotal = round2(gst.grandTotal - delivery - cutting);
  const itemTaxable = round2(gst.taxableValue - deliveryTaxable - cuttingTaxable);
  const qty = Number(quantity) > 0 ? Number(quantity) : 1;

  return {
    ...gst,
    // The Rate column prices the goods only; delivery and cutting are their own lines.
    ratePerUnit: round2(itemTaxable / qty),
    itemTotal,
    itemTaxable,
    itemTax: round2(itemTotal - itemTaxable),
    deliveryTotal: delivery,
    deliveryTaxable,
    deliveryTax: round2(delivery - deliveryTaxable),
    cuttingTotal: cutting,
    cuttingTaxable,
    cuttingTax: round2(cutting - cuttingTaxable),
  };
}
