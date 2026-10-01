const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

// Peso amounts are stored as plain numbers; this is the only place they
// get turned into "₱1,234.50" for display.
export function formatPeso(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  return pesoFormatter.format(amount);
}
