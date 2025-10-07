import React, { useEffect, useState, useRef } from 'react';
import api from "../api";


export default function OrderForm({ phone = '5515991782865' }) {
  const PRECO_MIN_FALLBACK = 15.0;

  const [nome, setNome] = useState('');
  const [cep, setCep] = useState('');
  const [rua, setRua] = useState('');
  const [numero, setNumero] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [complemento, setComplemento] = useState('');
  const [pagamento, setPagamento] = useState('PIX');

  const [produtosGlobais, setProdutosGlobais] = useState([]);
  const [rows, setRows] = useState([]);
  const [suggestions, setSuggestions] = useState({});
  const searchTimeouts = useRef({});

  // util: parse seguro de strings/nums (brasileiro e internacional)
  function parseToNumber(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    if (typeof raw === 'number') return Number(raw);
    const s = String(raw).trim();
    if (s === '') return null;
    const cleaned = s.replace(/[R$\s]/g, '');
    if (cleaned.indexOf(',') > -1 && cleaned.indexOf('.') > -1) {
      return Number(cleaned.replace(/\./g, '').replace(',', '.')) || null;
    }
    if (cleaned.indexOf(',') > -1 && cleaned.indexOf('.') === -1) {
      return Number(cleaned.replace(',', '.')) || null;
    }
    const n = Number(cleaned);
    return isNaN(n) ? null : n;
  }

  // Busca recursiva por campo de preço / valor dentro de obj/arrays
  function findPriceInObject(obj, seen = new Set()) {
    if (obj === null || obj === undefined) return null;
    if (typeof obj === 'number') return obj > 0 ? obj : null;
    if (typeof obj === 'string') {
      const p = parseToNumber(obj);
      return p && p > 0 ? p : null;
    }
    if (typeof obj !== 'object') return null;
    if (seen.has(obj)) return null;
    seen.add(obj);

    const priorityKeys = [
      'Preco_med_prod','Preco_ens','Preco_med_out','Preco_med','Preco','preco','preco_med','preco_ens',
      'valor','Valor','valor_unitario','price','Price','valor_unitario'
    ];

    for (const k of priorityKeys) {
      const lk = Object.keys(obj).find(x => x === k || x.toLowerCase() === k.toLowerCase());
      if (lk && obj[lk] !== undefined && obj[lk] !== null && obj[lk] !== '') {
        const parsed = parseToNumber(obj[lk]);
        if (parsed && parsed > 0) return parsed;
      }
    }

    for (const k of Object.keys(obj)) {
      if (/preco|valor|price/i.test(k)) {
        const parsed = parseToNumber(obj[k]);
        if (parsed && parsed > 0) return parsed;
      }
    }

    if (Array.isArray(obj)) {
      for (const el of obj) {
        const nested = findPriceInObject(el, seen);
        if (nested && nested > 0) return nested;
      }
    }

    for (const k of Object.keys(obj)) {
      const val = obj[k];
      if (val && typeof val === 'object') {
        const nested = findPriceInObject(val, seen);
        if (nested && nested > 0) return nested;
      } else {
        const parsed = parseToNumber(val);
        if (parsed && parsed > 0) return parsed;
      }
    }

    return null;
  }

  function calcPrecoMinFromBase(base) {
    const b = parseToNumber(base);
    if (!b || b <= 0) return PRECO_MIN_FALLBACK;
    return Math.round(b * 1.15 * 100) / 100;
  }

  useEffect(() => {
    if (rows.length === 0) addRow();

    (async function fetchInit() {
      try {
        const [resCereais, resOutros] = await Promise.all([
          api.get('/cereais'),
          api.get('/produtos')
        ].map(p => p.catch(e => ({ data: [] }))));

        const listC = (resCereais && resCereais.data) ? resCereais.data : [];
        const listO = (resOutros && resOutros.data) ? resOutros.data : [];

        const normalize = it => {
          const rawId = it.id || it._id || it.codigo || it.Codigo || it.Id_ens || it.Codigo_produto || it.Codigo_out || it.Id_prod || it.Id_out || '';
          const nomeVals = [it.nome, it.Nome, it.Descricao, it.Nome_produto, it.Nome_ens, it.Nome_out, it.Produto].filter(Boolean);
          const nome = nomeVals.length ? String(nomeVals[0]) : '';

          const precoBaseFound = findPriceInObject(it);
          const precoMin = (precoBaseFound && precoBaseFound > 0) ? calcPrecoMinFromBase(precoBaseFound) : PRECO_MIN_FALLBACK;

          return {
            id: String(rawId || ''),
            nome,
            peso: it.peso || it.Peso || it.Peso_ens || null,
            codigo: it.codigo || it.Codigo || it.Codigo_ens || it.Codigo_out || null,
            precoBase: precoBaseFound,
            precoMin,
            raw: it
          };
        };

        const merged = [...listC.map(normalize), ...listO.map(normalize)];
        setProdutosGlobais(merged);
        try { window._produtosGlobais = merged; } catch (e) {}
        console.debug('produtosGlobais carregados:', merged.length);
      } catch (err) {
        console.warn('Falha ao buscar produtos globais', err);
        setProdutosGlobais([]);
      }
    })();

    return () => {
      Object.values(searchTimeouts.current).forEach(t => clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addRow(selectedProduct = null, qty = 1) {
    setRows(prev => [...prev, {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
      produtoId: selectedProduct ? String(selectedProduct.id) : null,
      produtoNome: selectedProduct ? selectedProduct.nome : '',
      peso: selectedProduct ? selectedProduct.peso : null,
      codigo: selectedProduct ? selectedProduct.codigo : null,
      quantidade: qty,
      precoUnit: '',
      precoMin: selectedProduct ? (selectedProduct.precoMin ?? PRECO_MIN_FALLBACK) : PRECO_MIN_FALLBACK
    }]);
  }

  function removeRow(id) {
    setRows(prev => prev.filter(r => r.id !== id));
    setSuggestions(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
  }

  function moveRowUp(index) {
    if (index <= 0) return;
    setRows(prev => {
      const copy = [...prev];
      [copy[index-1], copy[index]] = [copy[index], copy[index-1]];
      return copy;
    });
  }

  function moveRowDown(index) {
    setRows(prev => {
      if (index >= prev.length - 1) return prev;
      const copy = [...prev];
      [copy[index+1], copy[index]] = [copy[index], copy[index+1]];
      return copy;
    });
  }

  function onQuantidadeChange(id, q) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, quantidade: q } : r));
  }

  function onPrecoUnitChange(id, preco) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, precoUnit: preco } : r));
  }

  function priceBelowMinExists() {
    return rows.some(r => {
      const val = parseFloat(r.precoUnit || 0);
      return val > 0 && val < (Number(r.precoMin) || PRECO_MIN_FALLBACK);
    });
  }

  function formatCurrency(n) {
    const num = Number(n) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function searchProdutos(rowId, q) {
    if (searchTimeouts.current[rowId]) clearTimeout(searchTimeouts.current[rowId]);
    if (!q || q.length < 2) {
      setSuggestions(prev => ({ ...prev, [rowId]: [] }));
      return;
    }

    searchTimeouts.current[rowId] = setTimeout(async () => {
      try {
        const res = await api.get(`/cereais?search=${encodeURIComponent(q)}`);
        const list = res.data || [];
        const normalized = list.map(it => {
          const match = produtosGlobais.find(p => {
            try {
              const a = String(p.raw && (p.raw.id || p.raw._id || p.raw.Codigo || p.raw.codigo) || '');
              const b = String(it.id || it._id || it.Codigo || it.codigo || '');
              return a === b && a !== '';
            } catch (e) { return false; }
          });
          if (match) return match;
          const precoBaseFound = findPriceInObject(it);
          const precoMin = (precoBaseFound && precoBaseFound > 0) ? calcPrecoMinFromBase(precoBaseFound) : PRECO_MIN_FALLBACK;
          return {
            id: String(it.id || it._id || it.codigo || it.Codigo || ''),
            nome: it.nome || it.Nome || it.Descricao || it.Nome_produto || it.Nome_ens || it.Nome_out || '',
            peso: it.peso || it.Peso || null,
            codigo: it.codigo || it.Codigo || null,
            precoBase: precoBaseFound,
            precoMin,
            raw: it
          };
        });
        setSuggestions(prev => ({ ...prev, [rowId]: normalized }));
      } catch (err) {
        console.warn('Erro na busca de produtos', err);
        setSuggestions(prev => ({ ...prev, [rowId]: [] }));
      }
    }, 300);
  }

  // Seleção do produto: detecta precoMin localmente; se não, consulta backend /precomin
  async function onSelectSuggestion(rowId, produto) {
    const produtoIdStr = String(produto.id || produto._id || produto.codigo || produto.Codigo || '');
    const nomeProduto = produto.nome || produto.Nome || produto.Descricao || produto.Nome_produto || produto.Nome_ens || produto.Nome_out || '';

    let precoMinCalc = PRECO_MIN_FALLBACK;

    if (produto.precoMin !== undefined && produto.precoMin !== null && Number(produto.precoMin) > 0) {
      precoMinCalc = Number(produto.precoMin);
    } else if (produto.precoBase && Number(produto.precoBase) > 0) {
      precoMinCalc = calcPrecoMinFromBase(produto.precoBase);
    } else {
      if (produto.raw) {
        const rawFound = findPriceInObject(produto.raw);
        if (rawFound && rawFound > 0) precoMinCalc = calcPrecoMinFromBase(rawFound);
      }
    }

    if ((!precoMinCalc || precoMinCalc === PRECO_MIN_FALLBACK) && produtoIdStr) {
      try {
        const res = await api.get(`/precomin?produtoId=${encodeURIComponent(produtoIdStr)}`);
        if (res && res.data) {
          const backendVal = res.data.precoMin ?? res.data.Preco_min ?? res.data.precomin ?? null;
          const n = parseToNumber(backendVal);
          if (n && n > 0) {
            precoMinCalc = Math.round(Number(n) * 100) / 100;
            console.debug('precoMin obtido do backend /precomin:', precoMinCalc, 'produtoId:', produtoIdStr);
          }
        }
      } catch (err) {
        console.warn('Erro ao consultar /precomin', err);
      }
    }

    console.debug('onSelectSuggestion -> produtoId:', produtoIdStr, 'nome:', nomeProduto, 'precoBase(normalized):', produto.precoBase, 'precoMinCalc:', precoMinCalc, 'rawKeys:', produto.raw ? Object.keys(produto.raw).slice(0,20) : null);

    setRows(prev => prev.map(r => r.id === rowId ? {
      ...r,
      produtoId: produtoIdStr,
      produtoNome: nomeProduto,
      peso: produto.peso || produto.Peso || null,
      codigo: produto.codigo || produto.Codigo || null,
      precoMin: precoMinCalc
    } : r));

    setSuggestions(prev => ({ ...prev, [rowId]: [] }));
  }

  function montarMensagem() {
    const enderecoParts = [];
    if (rua) enderecoParts.push(rua);
    if (numero) enderecoParts.push('nº ' + numero);
    if (complemento) enderecoParts.push('Compl: ' + complemento);
    if (bairro) enderecoParts.push(bairro);
    if (cidade) enderecoParts.push(cidade);
    const endereco = enderecoParts.length ? enderecoParts.join(' - ') : '[endereço não informado]';

    const lines = [];
    lines.push('*Novo pedido*');
    lines.push('Nome: ' + (nome || '[não informado]'));

    if (rows.length === 0) {
      lines.push('Item: [não informado]');
    } else {
      lines.push('Itens:');
      let idx = 1;
      rows.forEach(r => {
        if (!r.produtoNome) return;
        const q = Number(r.quantidade || 1);
        const precoUnit = parseFloat(r.precoUnit || 0);
        let line = `${idx}. ${r.produtoNome} — ${q}x`;
        if (precoUnit > 0) {
          const total = precoUnit * q;
          line += ` @ ${formatCurrency(precoUnit)} cada = ${formatCurrency(total)}`;
        } else {
          line += ` @ preço não informado (mínimo ${formatCurrency(r.precoMin)})`;
        }
        lines.push(line);
        idx++;
      });
    }

    lines.push('Endereço: ' + endereco);
    if (cep) lines.push('CEP: ' + cep);
    lines.push('Método de pagamento: ' + (pagamento || '[não informado]'));

    return lines.join('\n');
  }

  async function enviarWhatsApp() {
    if (priceBelowMinExists()) {
      alert('Existe item com preço abaixo do mínimo. Corrija para habilitar o envio.');
      return;
    }

    const mensagem = montarMensagem();

    const payload = {
      cliente: nome,
      endereco: { rua, numero, complemento, bairro, cidade, cep },
      pagamento,
      itens: rows.filter(r => r.produtoNome).map(r => ({
        produtoId: r.produtoId,
        produtoNome: r.produtoNome,
        quantidade: Number(r.quantidade || 1),
        precoUnitario: r.precoUnit ? Number(r.precoUnit) : null
      }))
    };

    try {
      await api.post('/pedido', payload);
    } catch (err) {
      console.warn('Falha ao enviar pedido para API (não bloqueia envio ao WhatsApp):', err);
    }

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, '_blank');
  }

  function calcularTotal() {
    return rows.reduce((acc, r) => {
      const preco = parseFloat(r.precoUnit || 0);
      const q = Number(r.quantidade || 1);
      if (preco > 0) return acc + preco * q;
      return acc;
    }, 0);
  }

  // --- RENDER (JSX completo) ---
  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-2xl shadow-md">
      <h2 className="text-2xl font-semibold mb-2">Formulário de Pedido</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Nome</label>
          <input value={nome} onChange={e=>setNome(e.target.value)} className="mt-1 block w-full rounded-md border-gray-200 shadow-sm focus:ring-2 focus:ring-indigo-300 p-2" placeholder="Ex: João da Silva" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">CEP</label>
          <div className="flex gap-2 mt-1">
            <input value={cep} onChange={e=>setCep(e.target.value)} className="flex-1 rounded-md border-gray-200 shadow-sm p-2" placeholder="00000-000" />
            <button type="button" onClick={async ()=>{
              const raw = (cep || '').replace(/\D/g,'');
              if (!raw) { alert('Digite o CEP antes de buscar.'); return; }
              if (raw.length !== 8) { alert('CEP inválido. Deve ter 8 dígitos.'); return; }
              try {
                const res = await fetch('https://viacep.com.br/ws/' + raw + '/json/');
                if (!res.ok) throw new Error('erro');
                const data = await res.json();
                if (data.erro) { alert('CEP não encontrado.'); return; }
                setRua(data.logradouro || '');
                setBairro(data.bairro || '');
                setCidade(data.localidade || '');
              } catch (err) { console.error(err); alert('Não foi possível buscar o CEP.'); }
            }} className="px-3 rounded-md bg-white border-gray-200 shadow-sm">Buscar</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <input value={rua} onChange={e=>setRua(e.target.value)} className="md:col-span-2 rounded-md border-gray-200 p-2" placeholder="Rua" />
        <input value={numero} onChange={e=>setNumero(e.target.value)} className="rounded-md border-gray-200 p-2" placeholder="Número" />
        <input value={bairro} onChange={e=>setBairro(e.target.value)} className="rounded-md border-gray-200 p-2" placeholder="Bairro" />
        <input value={cidade} onChange={e=>setCidade(e.target.value)} className="rounded-md border-gray-200 p-2" placeholder="Cidade" />
        <input value={complemento} onChange={e=>setComplemento(e.target.value)} className="rounded-md border-gray-200 p-2" placeholder="Complemento" />

        <div className="md:col-span-1">
          <label className="block text-sm font-medium text-gray-700">Método de pagamento</label>
          <select value={pagamento} onChange={e=>setPagamento(e.target.value)} className="mt-1 block w-full rounded-md border-gray-200 shadow-sm p-2">
            <option value="PIX">PIX</option>
            <option value="Dinheiro">Dinheiro</option>
            <option value="Cheque">Cheque</option>
            <option value="Boleto">Boleto</option>
            <option value="Depósito bancário">Depósito bancário</option>
          </select>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Itens</label>
        <div className="space-y-3 mt-2">
          {rows.map((r, idx) => (
            <div key={r.id} className="flex flex-col md:flex-row items-start md:items-center gap-2">
              <div className="flex-1 relative">
                <select value={r.produtoId || ''} onChange={e => {
                  const id = e.target.value;
                  if (!id) {
                    setRows(prev => prev.map(row => row.id === r.id ? { ...row, produtoId: null, produtoNome: '', precoMin: PRECO_MIN_FALLBACK } : row));
                    return;
                  }
                  const prod = produtosGlobais.find(p => String(p.id) === id);
                  if (prod) {
                    onSelectSuggestion(r.id, prod);
                  } else {
                    setRows(prev => prev.map(row => row.id === r.id ? { ...row, produtoId: String(id) } : row));
                  }
                }} className="w-full rounded-md border-gray-200 p-2">
                  <option value="">-- selecione --</option>
                  {produtosGlobais.map(p => (
                    <option key={p.id || p.codigo || p.nome} value={String(p.id)}>{p.nome}</option>
                  ))}
                </select>

                <div className="text-xs text-gray-500 mt-1">Preço mínimo: {formatCurrency(r.precoMin || PRECO_MIN_FALLBACK)}</div>
              </div>

              <input type="number" min={1} value={r.quantidade} onChange={e=>onQuantidadeChange(r.id, Number(e.target.value || 1))} className="w-28 rounded-md border-gray-200 p-2" />

              <div className="w-40">
                <input type="number" min={0} step="0.01" value={r.precoUnit} onChange={e=>onPrecoUnitChange(r.id, e.target.value)} className={`w-full rounded-md p-2 border ${ (r.precoUnit && parseFloat(r.precoUnit) > 0 && parseFloat(r.precoUnit) < (Number(r.precoMin)||PRECO_MIN_FALLBACK)) ? 'border-red-500 ring-1 ring-red-200':'' }`} placeholder="Preço unit." />
                {r.precoUnit && parseFloat(r.precoUnit) > 0 && parseFloat(r.precoUnit) < (Number(r.precoMin)||PRECO_MIN_FALLBACK) ? (
                  <div className="text-xs text-red-600 mt-1">Preço abaixo do mínimo</div>
                ) : null}
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={()=>removeRow(r.id)} className="px-3 py-1 rounded-md bg-red-50 text-red-700 border">Remover</button>
                <button type="button" onClick={()=>moveRowUp(idx)} className="px-3 py-1 rounded-md bg-gray-50 border">↑</button>
                <button type="button" onClick={()=>moveRowDown(idx)} className="px-3 py-1 rounded-md bg-gray-50 border">↓</button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3">
          <button type="button" onClick={()=>addRow()} className="px-4 py-2 rounded-md bg-green-600 text-white">+ Adicionar item</button>
        </div>
      </div>

      <div className="flex items-center justify-between border-t pt-4 mt-4">
        <div>
          <div className="text-sm text-gray-600">Total (itens com preço informado): <strong>{formatCurrency(calcularTotal())}</strong></div>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={enviarWhatsApp} disabled={priceBelowMinExists()} className={`px-4 py-2 rounded-md text-white ${priceBelowMinExists() ? 'bg-gray-400 cursor-not-allowed':'bg-indigo-600 hover:bg-indigo-700'}`}>
            Enviar para WhatsApp
          </button>
          <button type="button" onClick={()=>{/* força atualização preview local */}} className="px-4 py-2 rounded-md border">Atualizar preview</button>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-lg font-medium mb-2">Pré-visualização</h3>
        <pre className="whitespace-pre-wrap bg-gray-50 p-4 rounded-md text-sm border">{montarMensagem()}</pre>
      </div>
    </div>
  );
}
