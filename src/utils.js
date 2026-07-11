// formatCurrency(amount, lang) formats a number to a string with spaces and currency symbol.
// If lang is 'uz', it appends ' so'm'. Default (or 'ru') appends ' сум'.

export function formatCurrency(amount, lang = 'ru') {
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount)) return '';

  // Format with spaces using Intl.NumberFormat
  // 'ru-RU' naturally uses space as a thousands separator.
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(parsedAmount);

  const suffix = lang === 'uz' ? " so'm" : ' сум';
  return `${formatted}${suffix}`;
}

export function parseSQLiteDate(sqliteStr) {
  if (!sqliteStr) return new Date();
  if (sqliteStr.includes('Z') || sqliteStr.includes('T')) {
    return new Date(sqliteStr);
  }
  return new Date(sqliteStr.replace(' ', 'T'));
}

export function formatThousands(val) {
  if (val === undefined || val === null || val === '') return '';
  let str = String(val).replace(/\s/g, '');
  const parts = str.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return parts.join('.');
}

