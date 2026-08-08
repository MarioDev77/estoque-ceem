import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
import { run, initSchema } from './db.js';
import { generateAll } from './services/notifications.js';

// Rotas
import authRoutes from './routes/auth.js';
import cadastrosRoutes from './routes/cadastros.js';
import estoqueRoutes from './routes/estoque.js';
import cardapioRoutes from './routes/cardapio.js';
import consumoRoutes from './routes/consumo.js';
import desperdicioRoutes from './routes/desperdicio.js';
import comprasRoutes from './routes/compras.js';
import financeiroRoutes from './routes/financeiro.js';
import dashboardRoutes from './routes/dashboard.js';
import relatoriosRoutes from './routes/relatorios.js';
import iaRoutes from './routes/ia.js';
import sistemaRoutes from './routes/sistema.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Railway (e a maioria dos PaaS) rodam a aplicação atrás de um proxy reverso,
// que injeta o header X-Forwarded-For com o IP real do cliente.
// Isso é necessário para o express-rate-limit identificar corretamente cada usuário.
app.set('trust proxy', 1);

// ---------- Segurança ----------
// Remove banner de tecnologia (X-Powered-By) para não revelar o stack a scanners
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
  referrerPolicy: { policy: 'no-referrer' },
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 15552000, includeSubDomains: true } : false,
  xContentTypeOptions: true,
  xFrameOptions: 'DENY',
  crossOriginEmbedderPolicy: false,
}));

// Headers adicionais de segurança
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

// Rate limiting global
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente mais tarde.' },
});
app.use('/api', limiter);

// Rate limit mais rígido para login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Aguarde 15 minutos.' },
});

// ---------- Rotas ----------
// Saúde: resposta genérica e discreta (não expõe versão/stack). Pentest tools
// não conseguem extrair informações úteis além de um status "ok".
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Autenticação global nas rotas /api (exceto auth e health).
// Habilita o controle de rotas administrativas antes dos roteadores.
function globalAuth(req, res, next) {
  if (req.path.startsWith('/auth') || req.path === '/health') return next();
  return import('./auth.js').then(({ requireAuth }) => requireAuth(req, res, next));
}

// Esconde rotas administrativas: para não-admin retorna 404 (como se não existisse),
// evitando que ferramentas de pentest enumerem rotas de admin.
// Aplica-se APÓS a autenticação global (req.user já preenchido).
const ADMIN_PATHS = [/^\/usuarios(\/|$)/, /^\/auditoria(\/|$)/, /^\/config(\/|$)/];
function hideAdminRoutes(req, res, next) {
  if (ADMIN_PATHS.some((re) => re.test(req.path))) {
    // Não autenticado ou não admin → 404 genérico (esconde existência da rota)
    if (!req.user || req.user.role_name !== 'Administrador') {
      return res.status(404).json({ error: 'Rota não encontrada.' });
    }
  }
  next();
}

app.use('/api', globalAuth);
app.use('/api', hideAdminRoutes);

app.use('/api/auth', loginLimiter, authRoutes);
app.use('/api', cadastrosRoutes);
app.use('/api', estoqueRoutes);
app.use('/api', cardapioRoutes);
app.use('/api', consumoRoutes);
app.use('/api', desperdicioRoutes);
app.use('/api', comprasRoutes);
app.use('/api', financeiroRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', relatoriosRoutes);
app.use('/api', iaRoutes);
app.use('/api', sistemaRoutes);

// 404
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// ---------- Tratamento de erros ----------
app.use((err, req, res, next) => {
  console.error('Erro na API:', err.message || err);
  // Erros MySQL (duplicado, violação de FK, etc.)
  if (err && typeof err.code === 'string' && err.code.startsWith('ER_DUP_ENTRY')) {
    return res.status(400).json({ error: 'Registro duplicado.', detail: err.message });
  }
  if (err && typeof err.code === 'string' && err.code.startsWith('ER_')) {
    return res.status(400).json({ error: 'Erro no banco de dados.', detail: err.message });
  }
  res.status(err.status || 500).json({ error: err.message || 'Erro interno do servidor.', detail: err.detail || '' });
});

// ---------- Inicialização (schema + alertas) ----------
async function start() {
  // Cria as tabelas caso não existam no MySQL
  try {
    await initSchema();
    console.log('🗄️  Schema MySQL verificado/criado.');
  } catch (e) {
    console.error('Erro ao inicializar schema MySQL:', e.message);
    process.exit(1);
  }

  // Regenera alertas na inicialização (baseados na data atual)
  try {
    await run('DELETE FROM notifications');
    await generateAll();
    console.log('✅ Alertas de estoque e validade atualizados.');
  } catch (e) {
    console.error('Erro ao gerar alertas:', e.message);
  }

  app.listen(PORT, () => {
    console.log(`🚀 API da Alimentação Escolar rodando em http://localhost:${PORT}`);
    console.log(`   Banco de dados: MySQL (Railway)`);
  });
}

start();

