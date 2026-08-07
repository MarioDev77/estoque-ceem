export function formatCurrency(value) {
  const n = Number(value || 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatNumber(value, decimals = 0) {
  const n = Number(value || 0);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatDateBR(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = String(dateStr).split('T')[0].split('-');
  if (!y || !m || !d) return String(dateStr);
  return `${d}/${m}/${y}`;
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function startOfMonth(dateStr = today()) {
  return dateStr.slice(0, 8) + '01';
}

export function endOfMonth(dateStr = today()) {
  const [y, m] = dateStr.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

export function monthLabel(monthStr) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-').map(Number);
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${names[(m || 1) - 1]}/${String(y).slice(2)}`;
}

export function initials(name) {
  if (!name) return '';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

export function getErrMsg(err, fallback = 'Erro ao processar a requisição.') {
  if (err.response && err.response.data) {
    return err.response.data.error || err.response.data.detail || fallback;
  }
  return err.message || fallback;
}

