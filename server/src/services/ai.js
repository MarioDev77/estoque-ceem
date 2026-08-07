import { query, get, run, today } from '../db.js';
import {
  addDays, monthKey, yearKey, formatCurrency, formatNumber, startOfMonth, endOfMonth,
} from '../utils.js';

// ============================================================
// Assistente de IA - motor baseado em regras sobre dados reais
// (somente leitura; nunca altera dados sem confirmacao)
// ============================================================

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function pct(a, b) {
  if (!b) return 0;
  return Math.round((a / b) * 100);
}

function formatQty(q, unit) {
  return `${Number(q).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${unit || 'un'}`;
}

function getStockStatus() {
  return query(`
    SELECT f.id, f.name, f.unit, f.min_stock, f.ideal_stock, f.avg_price, s.quantity
    FROM stock s JOIN foods f ON f.id = s.food_id
    ORDER BY (CASE WHEN s.quantity <= 0 THEN 0 WHEN s.quantity <= f.min_stock THEN 1 ELSE 2 END), (s.quantity / f.min_stock) ASC
  `);
}

function getLowStock() {
  return getStockStatus().filter((f) => f.quantity <= f.min_stock);
}

function getExpiringBatches() {
  const t = today();
  const in7 = addDays(t, 7);
  const in30 = addDays(t, 30);
  return query(`
    SELECT fb.id, fb.batch_number, fb.expiry_date, fb.quantity, f.name, f.unit
    FROM food_batches fb JOIN foods f ON f.id = fb.food_id
    WHERE fb.quantity > 0 AND (fb.expiry_date < ? OR fb.expiry_date <= ?)
    ORDER BY fb.expiry_date ASC
  `, [in7, in30]);
}

function getMonthSpending(monthPrefix) {
  const row = get(`
    SELECT COALESCE(SUM(amount),0) AS total FROM expenses
    WHERE substr(expense_date,1,7) = ?
  `, [monthPrefix]);
  return row ? row.total : 0;
}

function getYearConsumptionByFood() {
  const year = today().slice(0, 4);
  return query(`
    SELECT f.name, f.unit, SUM(mc.quantity) AS qty, f.avg_price
    FROM meal_consumption mc JOIN foods f ON f.id = mc.food_id
    JOIN meals m ON m.id = mc.meal_id
    WHERE substr(m.date,1,4) = ?
    GROUP BY f.id ORDER BY qty DESC
  `, [year]);
}

function getAvgCostPerMeal() {
  const t = today();
  const start = startOfMonth(t);
  const end = endOfMonth(t);
  const exp = get(`SELECT COALESCE(SUM(amount),0) AS amount FROM expenses WHERE expense_date BETWEEN ? AND ?`, [start, end]).amount;
  const meals = get(`SELECT COALESCE(SUM(served_students),0) AS students FROM meals WHERE date BETWEEN ? AND ? AND status='realizado'`, [start, end]).students;
  if (!meals) return null;
  return { month: monthKey(t), expense: exp, students: meals, costPerMeal: exp / meals };
}

function menuForNextDays(days = 7) {
  const start = today();
  const end = addDays(start, days);
  return query(`
    SELECT m.id, m.date, m.expected_students, mt.name AS meal_name,
           mi.food_id, f.name AS food_name, mi.total_quantity, f.unit, f.avg_price
    FROM menus m
    JOIN meal_types mt ON mt.id = m.meal_type_id
    JOIN menu_items mi ON mi.menu_id = m.id
    JOIN foods f ON f.id = mi.food_id
    WHERE m.date BETWEEN ? AND ? AND m.status = 'planejado'
    ORDER BY m.date, m.id
  `, [start, end]);
}

function shoppingRecommendation(days = 15) {
  const stock = getStockStatus();
  const stockMap = {};
  for (const s of stock) stockMap[s.id] = s;
  const items = menuForNextDays(days);
  const need = {};
  for (const it of items) {
    if (!need[it.food_id]) need[it.food_id] = { name: it.food_name, qty: 0, unit: it.unit, price: it.avg_price };
    need[it.food_id].qty += it.total_quantity;
  }
  const result = [];
  for (const [fid, req] of Object.entries(need)) {
    const s = stockMap[fid];
    const have = s ? s.quantity : 0;
    const toBuy = Math.max(0, req.qty - have);
    result.push({ food_id: Number(fid), name: req.name, need: req.qty, stock: have, toBuy, unit: req.unit, price: req.price });
  }
  return result.sort((a, b) => b.toBuy - a.toBuy);
}

function normalize(q) {
  return String(q || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function hasAny(str, keywords) {
  return keywords.some((k) => str.includes(k));
}

// Gera a resposta para uma pergunta
export function askAI(question, userId = null) {
  const q = normalize(question);
  let answer = '';

  try {
    if (hasAny(q, ['acabando', 'estoque baixo', 'abaixo do minimo', 'faltando', 'falta'])) {
      const lows = getLowStock();
      if (!lows.length) {
        answer = 'Nenhum alimento esta abaixo do estoque minimo no momento. Todos os itens estao com quantidade adequada.';
      } else {
        answer = '**Alimentos com estoque baixo ou em falta:**\n\n';
        for (const f of lows) {
          const status = f.quantity <= 0 ? 'EM FALTA' : 'ABAIXO DO MINIMO';
          answer += `- ${status} - **${f.name}**: ${formatQty(f.quantity, f.unit)} (minimo recomendado: ${formatQty(f.min_stock, f.unit)})\n`;
        }
        answer += `\nCalculo: comparei a quantidade atual em estoque com o estoque minimo cadastrado para ${lows.length} alimento(s).`;
      }
    } else if (hasAny(q, ['comprar', 'compra', 'proxima semana', 'proximo mes', 'preciso']) && hasAny(q, ['semana', 'mes', 'comprar', 'compra', 'preciso'])) {
      const period = hasAny(q, ['mes']) ? 30 : 7;
      const items = shoppingRecommendation(period);
      const toBuy = items.filter((i) => i.toBuy > 0);
      if (!toBuy.length) {
        answer = `Com o estoque atual e possivel atender o cardapio dos proximos ${period} dias. Nenhuma compra urgente necessaria.`;
      } else {
        answer = `**Lista de compras sugerida para os proximos ${period} dias:**\n\n`;
        let total = 0;
        for (const i of toBuy) {
          const lineCost = i.toBuy * (i.price || 0);
          total += lineCost;
          answer += `- ${i.name}: comprar **${formatQty(i.toBuy, i.unit)}** (necessario ${formatQty(i.need, i.unit)} - estoque ${formatQty(i.stock, i.unit)})\n`;
        }
        answer += `\nCusto estimado: **${formatCurrency(total)}**\n`;
        answer += `\nCalculo: somei as quantidades do cardapio futuro e subtraiu o estoque disponivel atual.`;
      }
    } else if (hasAny(q, ['desperdic', 'desperdicio', 'desperdiciado']) && !hasAny(q, ['relatorio'])) {
      const t = today();
      const st = startOfMonth(t);
      const en = endOfMonth(t);
      const waste = query(`
        SELECT f.name, f.unit, SUM(w.quantity) AS qty, SUM(w.estimated_cost) AS cost
        FROM waste w JOIN foods f ON f.id = w.food_id
        WHERE w.date BETWEEN ? AND ?
        GROUP BY f.id HAVING qty > 0 ORDER BY qty DESC
      `, [st, en]);
      const total = waste.reduce((a, b) => a + b.qty, 0);
      const totalCost = waste.reduce((a, b) => a + (b.cost || 0), 0);
      if (!waste.length) {
        answer = `Nenhum desperdicio registrado neste mes.`;
      } else {
        answer = `**Desperdicio no mes atual:**\n\n`;
        answer += `- Total desperdicado: **${formatQty(total, 'kg')}**\n`;
        answer += `- Valor estimado perdido: **${formatCurrency(totalCost)}**\n\n`;
        answer += `**Alimento com maior desperdicio:** ${waste[0].name} (${formatQty(waste[0].qty, waste[0].unit)})\n\n`;
        for (const w of waste.slice(0, 5)) {
          answer += `- ${w.name}: ${formatQty(w.qty, w.unit)} (${formatCurrency(w.cost || 0)})\n`;
        }
        answer += `\nCalculo: totalizei os registros de desperdicio do mes por alimento.`;
      }
    } else if (hasAny(q, ['gast', 'gasto', 'gastamos', 'gastou', 'quanto gast']) && !hasAny(q, ['ano', 'anual', 'orcamento'])) {
      const t = today();
      const mp = monthKey(t);
      const spent = getMonthSpending(mp);
      const budget = get(`SELECT amount FROM budgets WHERE period='mes' AND period_value=?`, [mp]);
      let out = `**Gasto do mes de ${MONTHS_PT[Number(mp.slice(5)) - 1]}/${mp.slice(0, 4)}:** ${formatCurrency(spent)}.\n`;
      if (budget) {
        out += `\nO orcamento mensal e de **${formatCurrency(budget.amount)}**. Voce utilizou **${pct(spent, budget.amount)}%** do limite (${formatCurrency(budget.amount - spent)} disponiveis).`;
      }
      out += `\n\nCalculo: somei todas as despesas registradas com data neste mes.`;
      answer = out;
    } else if (hasAny(q, ['gast', 'ano', 'anual', 'orcamento', 'orçamento'])) {
      const y = yearKey(today());
      const spent = get(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE substr(expense_date,1,4)=?`, [y]).total;
      const budget = get(`SELECT amount FROM budgets WHERE period='ano' AND period_value=?`, [y]);
      let out = `**Gasto do ano ${y}:** ${formatCurrency(spent)}.\n`;
      if (budget) {
        const avail = budget.amount - spent;
        out += `\nOrcamento anual: **${formatCurrency(budget.amount)}**\n`;
        out += `- Utilizado: **${pct(spent, budget.amount)}%**\n`;
        out += `- Disponivel: **${formatCurrency(avail)}**\n`;
        if (spent > budget.amount) out += `\nATENCAO: o orcamento anual foi **ultrapassado**.`;
        else if (pct(spent, budget.amount) > 80) out += `\nAtencao: mais de 80% do orcamento anual ja foi utilizado.`;
      }
      out += `\n\nCalculo: somei todas as despesas do ano e comparei com o orcamento cadastrado.`;
      answer = out;
    } else if (hasAny(q, ['custo', 'refeicao', 'custo medio', 'custo estimado', 'custo medio por refeicao'])) {
      const info = getAvgCostPerMeal();
      if (!info) {
        answer = 'Nao ha refeicoes realizadas neste mes para calcular o custo medio.';
      } else {
        answer = `**Custo medio por refeicao (${MONTHS_PT[Number(info.month.slice(5)) - 1]}/${info.month.slice(0, 4)}):**\n\n`;
        answer += `- Gasto do mes: **${formatCurrency(info.expense)}**\n`;
        answer += `- Refeicoes servidas: **${formatNumber(info.students)}** alunos\n`;
        answer += `- Custo medio por refeicao: **${formatCurrency(info.costPerMeal)}**\n`;
        answer += `\nCalculo: dividi o gasto total do mes (${formatCurrency(info.expense)}) pela quantidade de refeicoes servidas (${formatNumber(info.students)}).`;
      }
    } else if (hasAny(q, ['vence', 'validade', 'vencimento', 'proximos do vencimento', 'vencendo', 'proximo do vencimento'])) {
      const exp = getExpiringBatches();
      if (!exp.length) {
        answer = 'Nenhum alimento vencido ou proximo do vencimento (ate 30 dias).';
      } else {
        answer = `**Alimentos por validade:**\n\n`;
        for (const b of exp.slice(0, 15)) {
          const diff = Math.round((new Date(b.expiry_date) - new Date(today())) / 86400000);
          let tag = 'AMARELO';
          if (diff < 0) tag = 'VERMELHO';
          else if (diff <= 7) tag = 'LARANJA';
          answer += `- [${tag}] **${b.name}** lote ${b.batch_number} - vence ${b.expiry_date} (${diff < 0 ? 'vencido' : `em ${diff} dia(s)`}) - ${formatQty(b.quantity, b.unit)}\n`;
        }
        answer += `\nCalculo: comparei as validades dos lotes com a data de hoje. Priorize o uso (FEFO) dos lotes que vencem antes.`;
      }
    } else if (hasAny(q, ['mes com maior', 'maior consumo', 'maior gasto', 'qual mes', 'mes com maior'])) {
      const y = yearKey(today());
      const rows = query(`
        SELECT substr(m.date,1,7) AS month, SUM(m.served_students) AS meals FROM meals m
        WHERE substr(m.date,1,4)=? GROUP BY month ORDER BY meals DESC
      `, [y]);
      if (!rows.length) {
        answer = 'Nao ha dados de consumo no ano para comparar.';
      } else {
        const top = rows[0];
        answer = `**Mes com maior consumo de refeicoes em ${y}:** ${top.month} - **${formatNumber(top.meals)}** refeicoes.`;
        if (rows.length > 1) answer += `\n\nSequencia mensal: ${rows.map((r) => `${r.month.split('-')[1]}/${r.month.split('-')[0]}: ${formatNumber(r.meals)}`).join(' | ')}`;
        answer += `\n\nCalculo: agrupei as refeicoes realizadas por mes e ordenei de forma decrescente.`;
      }
    } else if (hasAny(q, ['cardapio', 'proxima semana', 'estoque atual', 'realizar', 'consegue', 'viabil'])) {
      const items = menuForNextDays(7);
      if (!items.length) {
        answer = 'Nao ha cardapio planejado para os proximos 7 dias.';
      } else {
        const stock = getStockStatus();
        const stockMap = {};
        for (const s of stock) stockMap[s.id] = s;
        const need = {};
        for (const it of items) {
          if (!need[it.food_id]) need[it.food_id] = { name: it.food_name, need: 0, unit: it.unit };
          need[it.food_id].need += it.total_quantity;
        }
        const lack = [];
        for (const [fid, req] of Object.entries(need)) {
          const have = stockMap[fid] ? stockMap[fid].quantity : 0;
          if (have < req.need) lack.push({ name: req.name, have, need: req.need, unit: req.unit });
        }
        if (!lack.length) {
          answer = `SIM! O cardapio da proxima semana pode ser realizado com o estoque atual (${items.length} itens planejados).`;
        } else {
          answer = `ATENCAO: o cardapio da proxima semana NAO pode ser totalmente realizado com o estoque atual.\n\nFaltam:\n`;
          for (const l of lack) {
            answer += `- ${l.name}: falta ${formatQty(Math.max(0, l.need - l.have), l.unit)} (tem ${formatQty(l.have, l.unit)}, precisa ${formatQty(l.need, l.unit)})\n`;
          }
          answer += `\nCalculo: comparei as quantidades do cardapio planejado com o estoque disponivel.`;
        }
      }
    } else if (hasAny(q, ['planejar', 'plano', 'planejamento', 'analisar', 'proximo mes', 'previsao', 'previsão'])) {
      const recs = shoppingRecommendation(30);
      const toBuy = recs.filter((i) => i.toBuy > 0);
      let out = `**Analise do proximo mes (30 dias):**\n\n`;
      if (toBuy.length) {
        out += `**Compras recomendadas:**\n`;
        let total = 0;
        for (const i of toBuy) {
          total += i.toBuy * (i.price || 0);
          out += `- ${i.name}: **${formatQty(i.toBuy, i.unit)}**\n`;
        }
        out += `\nCusto estimado das compras: **${formatCurrency(total)}**\n`;
      } else {
        out += `Estoque suficiente para o proximo mes. Nenhuma compra urgente.\n`;
      }
      const exp = getExpiringBatches();
      const lows = getLowStock();
      if (exp.length) out += `\nATENCAO: ${exp.length} lote(s) vencendo ou proximos do vencimento. **Priorize o uso FEFO.**\n`;
      if (lows.length) out += `\nEstoque critico: ${lows.map((l) => l.name).join(', ')}.\n`;
      out += `\nPlanejamento gerado a partir do cardapio futuro, estoque, consumo historico, validades e orcamento.`;
      answer = out;
    } else if (hasAny(q, ['alimento mais', 'mais utilizad', 'mais consumid', 'quais alimentos mais'])) {
      const top = getYearConsumptionByFood();
      if (!top.length) {
        answer = 'Nao ha consumo registrado no ano.';
      } else {
        answer = `**Alimentos mais utilizados no ano ${today().slice(0, 4)}:**\n\n`;
        for (const t of top.slice(0, 5)) answer += `- ${t.name}: **${formatQty(t.qty, t.unit)}**\n`;
        answer += `\nCalculo: totalizei o consumo de cada alimento nas refeicoes realizadas.`;
      }
    } else if (hasAny(q, ['ola', 'oi', 'bom dia', 'boa tarde', 'boa noite', 'ajuda', 'help', 'o que', 'quem'])) {
      answer = `Ola! Sou o **assistente de IA da alimentacao escolar**. Analiso os dados reais do sistema para responder perguntas como:\n\n`;
      answer += `- "Quais alimentos estao acabando?"\n- "O que preciso comprar para a proxima semana?"\n- "Qual alimento esta sendo mais desperdicado?"\n- "Quanto gastamos este mes?"\n- "Qual foi o custo medio por refeicao?"\n- "Quais alimentos estao proximos do vencimento?"\n- "Qual foi o mes com maior consumo?"\n- "O cardapio da proxima semana pode ser realizado com o estoque atual?"\n- "Analisar proximo mes"\n\nDigite sua pergunta sobre estoque, cardapio, compras, gastos, desperdicio ou validade.`;
    } else {
      answer = `Ainda nao tenho uma resposta pronta para essa pergunta. Tente:\n\n- "Quais alimentos estao acabando?"\n- "O que preciso comprar para a proxima semana?"\n- "Quanto gastamos este mes?"\n- "Qual foi o custo medio por refeicao?"\n- "Quais alimentos estao proximos do vencimento?"\n- "Analisar proximo mes"`;
    }
  } catch (e) {
    answer = `Nao consegui analisar os dados agora: ${e.message}`;
  }

  // Registra a conversa
  run(
    `INSERT INTO ai_conversations (user_id, question, answer) VALUES (?,?,?)`,
    [userId, question, answer]
  );

  return { question, answer };
}

// Analise completa do proximo mes (relatorio estruturado)
export function analyzeNextMonth() {
  const t = today();
  const y = yearKey(t);
  const nextMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
  const nmKey = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
  const monthName = `${MONTHS_PT[nextMonth.getMonth()]}/${nextMonth.getFullYear()}`;

  const recs = shoppingRecommendation(30);
  const totalBuy = recs.filter((i) => i.toBuy > 0).reduce((a, b) => a + (b.toBuy || 0), 0);
  const totalCost = recs.filter((i) => i.toBuy > 0).reduce((a, b) => a + (b.toBuy * (b.price || 0)), 0);

  const expiring = getExpiringBatches();
  const lows = getLowStock();

  const menusCount = get(`SELECT COUNT(*) AS c FROM menus WHERE status='planejado' AND date >= ?`, [t]).c;

  const lastMonthStart = startOfMonth(addDays(t, -30));
  const lastMonthEnd = t;
  const dailyAvgConsumption = get(`
    SELECT AVG(cnt) AS avg FROM (
      SELECT date, COUNT(*) AS cnt FROM meals WHERE date BETWEEN ? AND ? GROUP BY date
    )
  `, [lastMonthStart, lastMonthEnd]).avg || 0;

  const budgetMonth = get(`SELECT amount FROM budgets WHERE period='mes' AND period_value=?`, [nmKey]);

  const costPerMeal = getAvgCostPerMeal();

  return {
    label: monthName,
    monthKey: nmKey,
    totalStudents: get(`SELECT COALESCE(SUM(total_students),0) AS total FROM students_summary WHERE school_year=?`, [y]).total,
    plannedMenus: menusCount,
    dailyAvgConsumption: Math.round(dailyAvgConsumption),
    shoppingList: recs.filter((i) => i.toBuy > 0),
    totalToBuy: totalBuy,
    estimatedCost: totalCost,
    budget: budgetMonth ? budgetMonth.amount : null,
    expiringBatches: expiring,
    expiringCount: expiring.length,
    lowStockCount: lows.length,
    lowStock: lows,
    costPerMeal: costPerMeal ? costPerMeal.costPerMeal : null,
    lastMonthSpent: getMonthSpending(monthKey(addDays(t, -30))),
  };
}

export default { askAI, analyzeNextMonth };

