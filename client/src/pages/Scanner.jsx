import React, { useEffect, useRef, useState } from 'react';
import { ScanBarcode, Search, PackagePlus, Package, Apple, CheckCircle2, XCircle, Loader2, CalendarPlus, Barcode } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import api from '../api.js';
import { getErrMsg, formatDateBR, formatNumber, formatCurrency } from '../utils.js';
import { PageHeader, Modal, Badge } from '../components/ui.jsx';
import { useNavigate } from 'react-router-dom';

const BEEP_OK = 880;
const BEEP_ERR = 220;
const BEEP_DURATION = 120;

export default function Scanner() {
  const navigate = useNavigate();
  const [manualBarcode, setManualBarcode] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [searching, setSearching] = useState(false);
  const [flash, setFlash] = useState(null);          // 'ok' | 'err'
  const [openReg, setOpenReg] = useState(false);
  const [openEntry, setOpenEntry] = useState(false);
  const [regForm, setRegForm] = useState({ name: '', barcode: '', category_id: '', unit: 'kg', brand: '', storage_location: '', min_stock: '', ideal_stock: '' });
  const [entryForm, setEntryForm] = useState({ food_id: '', barcode: '', quantity: '1', batch_number: '', expiry_date: '', supplier_id: '', unit_cost: '', reason: 'compra', notes: '' });
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const scanFieldRef = useRef(null);
  const scannerRef = useRef(null);
  const keyBufRef = useRef('');
  const keyTimerRef = useRef(null);

  // ============================================================
  // Beep de confirmação (feedback sonoro como leitor de mercado)
  // ============================================================
  function beep(freq = BEEP_OK) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0.12;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => { osc.stop(); ctx.close(); }, BEEP_DURATION);
    } catch (_) { /* áudio bloqueado */ }
  }

  function flashFeedback(type) {
    setFlash(type);
    setTimeout(() => setFlash(null), 700);
  }

  // ============================================================
  // Busca alimento por código de barras (câmera, manual ou USB)
  // ============================================================
  async function lookupWithBatches(barcode, { silent = false } = {}) {
    const code = String(barcode || '').trim();
    if (!code) return;
    setSearching(true);
    setError('');
    setResult(null);
    try {
      const res = await api.get(`/barcode/${encodeURIComponent(code)}`);
      let batches = [];
      let lowStock = false;
      try {
        const batchesRes = await api.get(`/lotes?food_id=${res.data.id}`);
        batches = batchesRes.data;
        lowStock = Number(res.data.stock_quantity) <= Number(res.data.min_stock);
      } catch (_) { }
      setResult({ ...res.data, batches, lowStock });
      setManualBarcode(code);
      if (!silent) { beep(BEEP_OK); flashFeedback('ok'); }
    } catch (err) {
      const msg = getErrMsg(err, 'Alimento não cadastrado.');
      setError(msg);
      if (err.response && err.response.data?.cadastrar) {
        // Produto novo: abre cadastro com o código preenchido
        setRegForm((f) => ({ ...f, barcode: code }));
        setOpenReg(true);
      }
      if (!silent) { beep(BEEP_ERR); flashFeedback('err'); }
    } finally {
      setSearching(false);
    }
  }

  // ============================================================
  // Leitor de código de barras USB / teclado (como no mercado)
  // Acumula digitos rápidos e dispara no Enter
  // ============================================================
  useEffect(() => {
    function onKey(e) {
      // Ignora quando o foco está em campos de formulário (não scanner)
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.key === 'Enter') {
        const code = keyBufRef.current.trim();
        keyBufRef.current = '';
        if (code && code.length >= 4) {
          e.preventDefault();
          lookupWithBatches(code, { silent: true });
        }
        return;
      }

      // Aceita dígitos e hífens (códigos de barras comuns)
      if (/^[0-9\-]$/.test(e.key)) {
        keyBufRef.current += e.key;
        // Reset do buffer se o usuário digitar devagar (não é leitor)
        clearTimeout(keyTimerRef.current);
        keyTimerRef.current = setTimeout(() => { keyBufRef.current = ''; }, 120);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(keyTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================
  // Câmera (html5-qrcode)
  // ============================================================
  async function startScanner() {
    setScanning(true);
    setError('');
    try {
      const cats = await api.get('/categorias');
      setCategories(cats.data);
    } catch (_) { }
    const el = document.getElementById('qr-reader');
    if (!el) { setScanning(false); return; }
    el.innerHTML = '';
    const qr = new Html5Qrcode('qr-reader');
    scannerRef.current = qr;
    try {
      await qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          qr.stop().catch(() => { });
          setScanning(false);
          lookupWithBatches(decodedText);
        },
        () => {}
      );
    } catch (err) {
      setError('Não foi possível acessar a câmera. Digite o código manualmente ou use o leitor USB.');
      setScanning(false);
    }
  }

  function stopScanner() {
    if (scannerRef.current) { scannerRef.current.stop().catch(() => { }); }
    setScanning(false);
  }

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => { });
      }
    };
  }, []);

  // ============================================================
  // Cadastro de novo produto
  // ============================================================
  async function openRegister(barcode) {
    setRegForm((f) => ({ ...f, barcode: barcode || manualBarcode || result?.barcode || '' }));
    if (!categories.length) {
      try { const cats = await api.get('/categorias'); setCategories(cats.data); } catch (_) { }
    }
    setOpenReg(true);
  }

  async function saveRegister(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/alimentos', regForm);
      setOpenReg(false);
      beep(BEEP_OK);
      await lookupWithBatches(regForm.barcode, { silent: true });
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao cadastrar alimento.'));
    }
  }

  // ============================================================
  // Registrar entrada direto (produto escaneado)
  // ============================================================
async function handleOpenEntry(food) {
    setError('');
    if (!suppliers.length) {
      try { const sup = await api.get('/fornecedores'); setSuppliers(sup.data); } catch (_) { }
    }
    setEntryForm({
      food_id: food ? String(food.id) : '',
      barcode: food ? String(food.barcode || '') : '',
      quantity: '1',
      batch_number: '',
      expiry_date: '',
      supplier_id: '',
      unit_cost: food?.avg_price ? String(food.avg_price) : '',
      reason: 'compra',
      notes: '',
    });
    setOpenEntry(true);
  }

  async function saveEntry(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/estoque/entrada', entryForm);
      setOpenEntry(false);
      beep(BEEP_OK);
      await lookupWithBatches(entryForm.barcode || manualBarcode, { silent: true });
    } catch (err) {
      setError(getErrMsg(err, 'Erro ao registrar entrada.'));
    }
  }

  const f = result;

  return (
    <div>
      <PageHeader
        title="Leitor de Código de Barras"
        subtitle="Identifique alimentos, consulte estoque, validade e lote"
        actions={
          <button className="btn btn-outline" onClick={() => openRegister()}><PackagePlus size={16} /> Novo alimento</button>
        }
      />

      {error && <div className="alert alert-danger">{error}</div>}
      {flash === 'ok' && <div className="alert alert-success scan-flash"><CheckCircle2 size={18} /> Código lido com sucesso!</div>}
      {flash === 'err' && <div className="alert alert-danger scan-flash"><XCircle size={18} /> Código não encontrado.</div>}

      <div className="scanner-layout">
        <div className="card scanner-card">
          <div className="scanner-box">
            {!scanning ? (
              <button className="btn btn-primary btn-lg" onClick={startScanner}><ScanBarcode size={18} /> Abrir câmera</button>
            ) : (
              <>
                <div id="qr-reader" className="qr-reader" />
                <div className="scan-line" />
                <p className="scan-hint">Aponte a câmera para o código de barras…</p>
                <button className="btn btn-outline scan-stop" onClick={stopScanner}>Parar câmera</button>
              </>
            )}

            <div className="usb-hint">
              <Barcode size={16} />
              <span>Leitor USB/teclado: basta passar o código em qualquer lugar da página</span>
            </div>
          </div>

          <div className="manual-entry">
            <label>Ou digite o código manualmente</label>
            <div className="manual-row">
              <input
                className="input"
                ref={scanFieldRef}
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookupWithBatches(manualBarcode); } }}
                placeholder="7891000100103"
                autoComplete="off"
                inputMode="numeric"
              />
              <button className="btn btn-primary" onClick={() => lookupWithBatches(manualBarcode)} disabled={searching}>
                {searching ? <Loader2 size={16} className="spin" /> : <Search size={16} />} Buscar
              </button>
            </div>
          </div>
        </div>

        {f ? (
          <div className="card food-result">
            <div className="food-result-head">
              <span className="recipe-icon"><Apple size={22} /></span>
              <div>
                <h3>{f.name}</h3>
                <div className="result-badges">
                  <Badge tone="teal">{f.category_name}</Badge>
                  {f.brand && <Badge tone="blue">{f.brand}</Badge>}
                  <Badge tone={f.stock_quantity <= 0 ? 'danger' : (f.lowStock ? 'orange' : 'green')}>
                    {f.stock_quantity <= 0 ? 'Em falta' : f.lowStock ? 'Estoque baixo' : 'Estoque ok'}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="food-result-grid">
              <div className="result-item"><strong>{formatNumber(f.stock_quantity)} {f.unit}</strong><span>Estoque atual</span></div>
              <div className="result-item"><strong>{formatNumber(f.min_stock)} {f.unit}</strong><span>Estoque mínimo</span></div>
              <div className="result-item"><strong>{formatCurrency(f.avg_price)}</strong><span>Preço médio</span></div>
              <div className="result-item"><strong>{f.storage_location || '—'}</strong><span>Local</span></div>
            </div>

            {f.barcode && <div className="barcode-chip mono"><Barcode size={14} /> {f.barcode}</div>}
            {f.lowStock && <div className="alert alert-warning">⚠️ Estoque abaixo do mínimo.</div>}

            <div className="section-title"><h4>Lotes e validade</h4></div>
            {(f.batches || []).length > 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Lote</th><th>Quantidade</th><th>Entrada</th><th>Validade</th><th>Status</th></tr></thead>
                  <tbody>
                    {f.batches.map((b) => (
                      <tr key={b.batch_number || b.id}>
                        <td className="mono">{b.batch_number || '—'}</td>
                        <td>{formatNumber(b.quantity)} {f.unit}</td>
                        <td>{formatDateBR(b.entry_date)}</td>
                        <td>{formatDateBR(b.expiry_date)}</td>
                        <td>
                          <Badge tone={b.expired ? 'danger' : b.days_left <= 7 ? 'orange' : b.days_left <= 30 ? 'warning' : 'green'}>
                            {b.expired ? 'Vencido' : b.days_left <= 7 ? 'Vence em 7 dias' : b.days_left <= 30 ? 'Vence em 30 dias' : 'Válido'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">Nenhum lote ativo.</p>
            )}

            <div className="food-result-actions">
              <button className="btn btn-primary" onClick={() => handleOpenEntry(f)}><PackagePlus size={15} /> Registrar entrada</button>
              <button className="btn btn-outline" onClick={() => navigate(`/entradas`)}><CalendarPlus size={15} /> Ver entradas</button>
              <button className="btn btn-outline" onClick={() => navigate(`/estoque`)}><Package size={15} /> Ver estoque</button>
            </div>
          </div>
        ) : (
          <div className="card scanner-placeholder">
            <ScanBarcode size={48} />
            <h3>Nenhum produto identificado</h3>
            <p>Aponte a câmera para o código de barras, digite o código abaixo ou use o leitor USB.</p>
            <button className="btn btn-outline" onClick={() => openRegister()}><PackagePlus size={15} /> Cadastrar alimento</button>
          </div>
        )}
      </div>

      {/* Modal de cadastro */}
      <Modal open={openReg} onClose={() => setOpenReg(false)} title="Cadastrar alimento">
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={saveRegister} className="form-grid">
          <label className="full">Nome
            <input className="input" value={regForm.name} onChange={(e) => setRegForm({ ...regForm, name: e.target.value })} required />
          </label>
          <label className="full">Código de barras
            <input className="input" value={regForm.barcode} onChange={(e) => setRegForm({ ...regForm, barcode: e.target.value })} />
          </label>
          <label>Categoria
            <select className="input" value={regForm.category_id} onChange={(e) => setRegForm({ ...regForm, category_id: e.target.value })}>
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Unidade
            <select className="input" value={regForm.unit} onChange={(e) => setRegForm({ ...regForm, unit: e.target.value })}>
              {['kg', 'g', 'L', 'mL', 'un'].map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          <label>Marca
            <input className="input" value={regForm.brand} onChange={(e) => setRegForm({ ...regForm, brand: e.target.value })} />
          </label>
          <label>Local
            <input className="input" value={regForm.storage_location} onChange={(e) => setRegForm({ ...regForm, storage_location: e.target.value })} />
          </label>
          <label>Estoque mínimo
            <input className="input" type="number" step="0.1" value={regForm.min_stock} onChange={(e) => setRegForm({ ...regForm, min_stock: e.target.value })} />
          </label>
          <label>Estoque ideal
            <input className="input" type="number" step="0.1" value={regForm.ideal_stock} onChange={(e) => setRegForm({ ...regForm, ideal_stock: e.target.value })} />
          </label>
          <div className="form-actions full">
            <button type="button" className="btn" onClick={() => setOpenReg(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary">Cadastrar</button>
          </div>
        </form>
      </Modal>

      {/* Modal de entrada rápida */}
      <Modal open={openEntry} onClose={() => setOpenEntry(false)} title="Registrar entrada" size="md">
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={saveEntry} className="form-grid">
          <label className="full">Alimento
            <input className="input" value={result?.name || ''} disabled />
          </label>
          <label>Quantidade
            <input className="input" type="number" step="0.1" min="0.1" value={entryForm.quantity} onChange={(e) => setEntryForm({ ...entryForm, quantity: e.target.value })} required />
          </label>
          <label>Lote
            <input className="input" value={entryForm.batch_number} onChange={(e) => setEntryForm({ ...entryForm, batch_number: e.target.value })} placeholder="L2026-01" />
          </label>
          <label>Validade
            <input className="input" type="date" value={entryForm.expiry_date} onChange={(e) => setEntryForm({ ...entryForm, expiry_date: e.target.value })} />
          </label>
          <label>Fornecedor
            <select className="input" value={entryForm.supplier_id} onChange={(e) => setEntryForm({ ...entryForm, supplier_id: e.target.value })}>
              <option value="">—</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>Custo unitário (R$)
            <input className="input" type="number" step="0.01" value={entryForm.unit_cost} onChange={(e) => setEntryForm({ ...entryForm, unit_cost: e.target.value })} />
          </label>
          <label>Tipo de entrada
            <select className="input" value={entryForm.reason} onChange={(e) => setEntryForm({ ...entryForm, reason: e.target.value })}>
              {['compra', 'doacao', 'transferencia', 'reposicao', 'outro'].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="full">Observações
            <input className="input" value={entryForm.notes} onChange={(e) => setEntryForm({ ...entryForm, notes: e.target.value })} />
          </label>
          <div className="form-actions full">
            <button type="button" className="btn" onClick={() => setOpenEntry(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary"><PackagePlus size={16} /> Registrar entrada</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
