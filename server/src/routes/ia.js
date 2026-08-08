import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requirePermission } from '../auth.js';
import { str } from './helpers.js';
import { askAI, analyzeNextMonth } from '../services/ai.js';

const router = Router();
router.use(requireAuth);

// Pergunta ao assistente de IA
router.post('/ia/ask', requirePermission('ia'), async (req, res, next) => {
  try {
    const { question } = req.body || {};
    if (!question || !String(question).trim()) {
      return res.status(400).json({ error: 'Digite uma pergunta.' });
    }
    const result = await askAI(String(question).trim().slice(0, 500), req.user.id);
    res.json(result);
  } catch (err) { next(err); }
});

// Histórico de conversas
router.get('/ia/historico', requirePermission('ia'), async (req, res, next) => {
  try {
    res.json(await query(`
      SELECT ac.*, u.name AS user_name FROM ai_conversations ac
      LEFT JOIN users u ON u.id = ac.user_id
      ORDER BY ac.id DESC LIMIT 100
    `));
  } catch (err) { next(err); }
});

// Análise do próximo mês
router.get('/ia/analisar-proximo-mes', requirePermission('ia'), async (req, res, next) => {
  try {
    res.json(await analyzeNextMonth());
  } catch (err) { next(err); }
});

export default router;
