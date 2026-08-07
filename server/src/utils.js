// ---------- Utilidades de datas e períodos ----------

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function parseDate(str) {
  if (!str) return null;
  const d = new Date(`${str}T00:00:00`);
  return isNaN(d) ? null : d;
}

export function addDays(dateStr, days) {
  const d = parseDate(dateStr);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function startOfWeek(dateStr = today()) {
  const d = parseDate(dateStr);
  if (!d) return null;
  const day = d.getDay(); // 0=domingo
  const diff = day === 0 ? -6 : 1 - day; // segunda-feira como início
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function endOfWeek(dateStr = today()) {
  return addDays(startOfWeek(dateStr), 6);
}

export function startOfMonth(dateStr = today()) {
  return dateStr.slice(0, 8) + '01';
}

export function endOfMonth(dateStr = today()) {
  const [y, m] = dateStr.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

export function startOfYear(year) {
  return `${year}-01-01`;
}

export function endOfYear(year) {
  return `${year}-12-31`;
}

export function monthKey(dateStr = today()) {
  return dateStr.slice(0, 7);
}

export function yearKey(dateStr = today()) {
  return dateStr.slice(0, 4);
}

export function formatDateBR(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${y}`;
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatCurrency(value) {
  const n = Number(value || 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatNumber(value, decimals = 0) {
  const n = Number(value || 0);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function daysBetween(dateA, dateB) {
  const a = parseDate(dateA);
  const b = parseDate(dateB);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000);
}

export function isWeekend(dateStr) {
  const d = parseDate(dateStr);
  return d ? d.getDay() === 0 || d.getDay() === 6 : false;
}

// Período para consultas — aceita semana|mes|bimestre|semestre|ano|personalizado
export function resolvePeriod(period, value, customStart, customEnd) {
  const now = today();
  const year = Number(value || now.slice(0, 4));

  switch (period) {
    case 'semana': {
      const start = startOfWeek(now);
      return { start, end: endOfWeek(now) };
    }
    case 'mes': {
      const base = value && value.length === 7 ? `${value}-01` : now;
      return { start: startOfMonth(base), end: endOfMonth(base) };
    }
    case 'bimestre': {
      const m = value && value.length === 7 ? Number(value.slice(5, 7)) : Number(now.slice(5, 7));
      const first = ((m - 1) - ((m - 1) % 2)) + 1;
      const last = first + 1;
      return {
        start: `${year}-${String(first).padStart(2, '0')}-01`,
        end: endOfMonth(`${year}-${String(last).padStart(2, '0')}-01`),
      };
    }
    case 'semestre': {
      const m = value && value.length === 7 ? Number(value.slice(5, 7)) : Number(now.slice(5, 7));
      const first = m <= 6 ? 1 : 7;
      const last = m <= 6 ? 6 : 12;
      return {
        start: `${year}-${String(first).padStart(2, '0')}-01`,
        end: endOfMonth(`${year}-${String(last).padStart(2, '0')}-01`),
      };
    }
    case 'ano':
      return { start: startOfYear(year), end: endOfYear(year) };
    case 'personalizado':
      return { start: customStart || startOfMonth(now), end: customEnd || endOfMonth(now) };
    default:
      return { start: startOfMonth(now), end: endOfMonth(now) };
  }
}

// Gera lista de datas entre start e end (inclusive)
export function eachDate(start, end) {
  const dates = [];
  let cur = start;
  let guard = 0;
  while (cur <= end && guard < 2000) {
    dates.push(cur);
    cur = addDays(cur, 1);
    guard++;
  }
  return dates;
}

// ---------- Cálculos de quantidade ----------
// Converte porção (ex.: 100g) para a unidade do alimento (ex.: kg) e multiplica por alunos
export function calcTotalQuantity(portionPerStudent, unit, students) {
  let factor = 1;
  const u = (unit || 'kg').toLowerCase();
  if (u === 'g') factor = 1 / 1000;
  else if (u === 'ml') factor = 1 / 1000;
  else if (u === 'l') factor = 1;
  else factor = 1; // kg, un
  return round2(Number(portionPerStudent || 0) * factor * Number(students || 0));
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function round4(n) {
  return Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;
}

// ---------- Sanitização ----------
export function cleanText(value, maxLen = 255) {
  if (value == null) return '';
  return String(value).replace(/[<>]/g, '').trim().slice(0, maxLen);
}

export function cleanNumber(value, fallback = 0) {
  const n = Number(String(value || '').replace(',', '.'));
  return isNaN(n) ? fallback : n;
}

export function isDateStr(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

// Gera datas letivas do ano baseado no calendário escolar
export function getSchoolDays(db, year) {
  const days = db.prepare(`
    SELECT date FROM school_calendar
    WHERE school_year = ? AND day_type = 'letivo'
    ORDER BY date
  `).all(year);
  return days.map((d) => d.date);
}

export default {
  today, parseDate, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfYear, endOfYear, monthKey, yearKey, formatDateBR, formatDateTime,
  formatCurrency, formatNumber, daysBetween, isWeekend, resolvePeriod, eachDate,
  calcTotalQuantity, round2, round4, cleanText, cleanNumber, isDateStr, getSchoolDays,
};

