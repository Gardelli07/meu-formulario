import React, { useEffect, useState } from 'react';

/**
 * OrderForm.jsx
 * Componente React (Web) estilizado com TailwindCSS.
 * - Labels e textos em pt-BR, seguindo o padrão do seu site.
 * - Recebe `products` (array ou objeto) via props; se não informado, usa um fallback.
 * - Busca preço mínimo por item no endpoint `/api/precomin?produto=...` (fallback local `precomin` para testes).
 * - Desabilita o botão de envio quando existir algum preço informado abaixo do preço mínimo.
 * - Gera preview formatado (texto) pronto para enviar via WhatsApp (wa.me).
 *
 * Como usar:
 * <OrderForm products={PRODUCTS} phone="5515991782865" />
 *
 * PRODUCTS pode ser um array de objetos: [{ name: 'MILHO 48 KG' }, ...]
 * ou um objeto chave->preco (compatível com o protótipo original).
 */

export default function OrderForm({ products = null, phone = '5515991782865' }) {
  // fallback PRODUCTS (objeto) — você pode passar o seu array/obj via props
  const FALLBACK_PRODUCTS = {
    'MILHO MOÍDO 24 KG': 47.5,
    'MILHO MOÍDO 40 KG': 76.0,
    'MILHO MOÍDO 48 KG': 87.0,
    'FUBAZAO 24 KG': 47.0,
    'FORMILIX 500ML': 19.9,
    'ISCA MIX FORMIGA PIKA-PAU 10X50GR': 9.9,
  };

  // normaliza products para array de nomes
  const productNames = React.useMemo(() => {
    if (!products) return Object.keys(FALLBACK_PRODUCTS).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (Array.isArray(products)) return products.map(p => (typeof p === 'string' ? p : p.name)).sort((a,b)=>a.localeCompare(b,'pt-BR'));
    return Object.keys(products).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [products]);

  // Preço mínimo global de fallback (apenas para testes) -- backend deve retornar preço mínimo calculado (média + 15%)
  const PRECO_MIN_FALLBACK = 15.0;

  // estado do formulário
  const [nome, setNome] = useState('');
  const [cep, setCep] = useState('');
  const [rua, setRua] = useState('');
  const [numero, setNumero] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [complemento, setComplemento] = useState('');
  const [pagamento, setPagamento] = useState('PIX');

  // linhas de itens: cada item { id, produto, quantidade, precoUnit, precoMin }
  const [rows, setRows] = useState([]);

  useEffect(() => {
    // inicializa com 1 linha vazia
    if (rows.length === 0) addRow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addRow(selected = '', qty = 1) {
    setRows(prev => {
      const next = [...prev, {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
        produto: selected || '',
        quantidade: qty,
        precoUnit: '',
        precoMin: PRECO_MIN_FALLBACK // valor inicial de teste; atualizamos ao selecionar
      }];
      return next;
    });
  }

  function removeRow(id) {
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function moveRowUp(index) {
    if (index <= 0) return;
    setRows(prev => {
      const copy = [...prev];
      const tmp = copy[index-1];
      copy[index-1] = copy[index];
      copy[index] = tmp;
      return copy;
    });
  }

  function moveRowDown(index) {
    setRows(prev => {
      if (index >= prev.length - 1) return prev;
      const copy = [...prev];
      const tmp = copy[index+1];
      copy[index+1] = copy[index];
      copy[index] = tmp;
      return copy;
    });
  }

  // ao selecionar produto, tentamos buscar precoMin do backend
  async function onProdutoChange(id, produtoNome) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, produto: produtoNome } : r));
    if (!produtoNome) return;

    try {
      // exemplo de integração: GET /api/precomin?produto=<nome codificado>
      // espera-se resposta JSON: { precoMin: number }
      const url = `/api/precomin?produto=${encodeURIComponent(produtoNome)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error('Erro na requisição');
      const data = await res.json();
      const precoMin = Number(data?.precoMin) || PRECO_MIN_FALLBACK;
      setRows(prev => prev.map(r => r.id === id ? { ...r, precoMin } : r));
    } catch (err) {
      // fallback local — usa o preço do PRODUCTS se disponível, senão PRECO_MIN_FALLBACK
      const fallback = (products && products[produtoNome]) || FALLBACK_PRODUCTS[produtoNome] || PRECO_MIN_FALLBACK;
      setRows(prev => prev.map(r => r.id === id ? { ...r, precoMin: Number(fallback) } : r));
    }
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

  // monta a mensagem de preview (sem marcar "ABAIXO DO PREÇO MÍNIMO")
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
        if (!r.produto) return;
        const q = Number(r.quantidade || 1);
        const precoUnit = parseFloat(r.precoUnit || 0);
        let line = `${idx}. ${r.produto} — ${q}x`;
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

  function enviarWhatsApp() {
    if (priceBelowMinExists()) {
      alert('Existe item com preço abaixo do mínimo. Corrija para habilitar o envio.');
      return;
    }
    const mensagem = montarMensagem();
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, '_blank');
  }

  // soma total opcional (soma apenas itens com preco informado)
  function calcularTotal() {
    return rows.reduce((acc, r) => {
      const preco = parseFloat(r.precoUnit || 0);
      const q = Number(r.quantidade || 1);
      if (preco > 0) return acc + preco * q;
      return acc;
    }, 0);
  }

  // UI
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
              // busca CEP simples
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
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Itens</label>
        <div className="space-y-3 mt-2">
          {rows.map((r, idx) => (
            <div key={r.id} className="flex flex-col md:flex-row items-start md:items-center gap-2">
              <div className="flex-1">
                <select value={r.produto} onChange={e=>onProdutoChange(r.id, e.target.value)} className="w-full rounded-md border-gray-200 p-2">
                  <option value="">-- selecione --</option>
                  {productNames.map(name => <option key={name} value={name}>{name}</option>)}
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
