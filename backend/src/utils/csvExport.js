function toCsv(expenses) {
  const headers = 'Date,Amount,Currency,ExchangeRate,Category,Subcategory,Description,Notes,Tags\n';
  const rows = expenses.map(e => [
    e.date,
    e.amount,
    e.currency,
    e.exchange_rate,
    e.category_name || '',
    e.subcategory_name || '',
    `"${(e.description || '').replace(/"/g, '""')}"`,
    `"${(e.notes || '').replace(/"/g, '""')}"`,
    e.tags || ''
  ].join(','));
  return headers + rows.join('\n');
}

module.exports = { toCsv };
