import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CircleDollarSign, Printer, ReceiptText, Trash2, Undo2 } from 'lucide-react';
import { api } from '../api.js';
import { Badge, Card, Loading, Modal, PageHeader, useToast } from '../components/ui.jsx';
import { brl, dataBR, FORMAS_PAGAMENTO, hojeISO, num, periodo, TIPOS_AJUSTE, VEICULOS } from '../format.js';

function PagarModal({ alvo, onClose, onConfirm }) {
  const [pagoEm, setPagoEm] = useState(hojeISO());
  const [forma, setForma] = useState('Pix');
  if (!alvo) return null;
  return (
    <Modal open title={alvo.linhas.length > 1 ? `Pagar ${alvo.linhas.length} entregadores` : `Pagar ${alvo.linhas[0].nome}`} onClose={onClose} size="sm"
      footer={(
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-success" onClick={() => onConfirm({ pago_em: pagoEm, forma_pagamento: forma })}>
            <CircleDollarSign size={16} /> Confirmar {brl(alvo.linhas.reduce((a, l) => a + l.liquido, 0))}
          </button>
        </>
      )}>
      <div className="form-grid">
        <div className="field"><label htmlFor="pe">Data do pagamento</label><input id="pe" type="date" value={pagoEm} onChange={e => setPagoEm(e.target.value)} /></div>
        <div className="field"><label htmlFor="fp">Forma</label>
          <select id="fp" value={forma} onChange={e => setForma(e.target.value)}>{FORMAS_PAGAMENTO.map(f => <option key={f}>{f}</option>)}</select>
        </div>
      </div>
      {alvo.linhas.length === 1 && alvo.linhas[0].pix_chave && (
        <p className="info-box">Chave Pix ({alvo.linhas[0].pix_tipo}): <b>{alvo.linhas[0].pix_chave}</b></p>
      )}
    </Modal>
  );
}

function Recibo({ alvo, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    if (!alvo) return;
    setD(null);
    api(`/fechamentos/${alvo.fechamento_id}/recibo/${alvo.entregador_id}`).then(setD).catch(() => {});
  }, [alvo]);
  if (!alvo) return null;

  const imprimir = () => {
    document.body.classList.add('print-recibo');
    window.print();
    setTimeout(() => document.body.classList.remove('print-recibo'), 300);
  };

  const e = d?.entregador;
  return (
    <Modal open title="Recibo do entregador" onClose={onClose} size="lg"
      footer={<><button className="btn btn-ghost" onClick={onClose}>Fechar</button><button className="btn btn-primary" onClick={imprimir} disabled={!d}><Printer size={16} /> Imprimir</button></>}>
      {!d ? <Loading /> : (
        <div className="recibo">
          <header>
            <div className="recibo-brand"><img src="/logo.png" alt="WorldExpress Logística" /></div>
            <div className="r">
              <h3>Recibo de pagamento</h3>
              <span className="muted">Período {periodo(d.fechamento.inicio, d.fechamento.fim)}</span>
            </div>
          </header>
          <div className="recibo-grid">
            <div><small>Entregador</small><b>{e.nome}</b></div>
            <div><small>CPF</small><b>{e.cpf || '—'}</b></div>
            <div><small>Veículo</small><b>{VEICULOS[e.veiculo]} {e.placa ? `· ${e.placa}` : ''}</b></div>
            <div><small>Pix</small><b>{e.pix_chave ? `${e.pix_tipo}: ${e.pix_chave}` : '—'}</b></div>
          </div>

          <table className="table compact">
            <thead><tr><th>Serviço</th><th className="r">Quantidade</th><th className="r">Valor unit.</th><th className="r">Subtotal</th></tr></thead>
            <tbody>
              {d.servicos.map(s => (
                <tr key={`${s.servico}-${s.valor_unit}`}><td>{s.servico}</td><td className="r">{num(s.quantidade, 0)}{s.unidade === 'dia' ? ' dia(s)' : ''}</td><td className="r">{brl(s.valor_unit)}</td><td className="r">{brl(s.subtotal)}</td></tr>
              ))}
              <tr className="sub"><td colSpan={3}>Produção ({e.dias} dias trabalhados)</td><td className="r">{brl(e.producao)}</td></tr>
              {d.ajustes.map(a => {
                const sinal = TIPOS_AJUSTE[a.tipo]?.sinal ?? 1;
                return (
                  <tr key={a.id}><td colSpan={3}>{TIPOS_AJUSTE[a.tipo]?.label} · {dataBR(a.data)} {a.descricao ? `· ${a.descricao}` : ''}</td>
                    <td className={`r ${sinal < 0 ? 'c-red' : 'c-green'}`}>{sinal < 0 ? '− ' : '+ '}{brl(a.valor)}</td></tr>
                );
              })}
            </tbody>
            <tfoot><tr><td colSpan={3}>Valor líquido {e.status === 'pago' ? `pago em ${dataBR(e.pago_em)} (${e.forma_pagamento})` : 'a pagar'}</td><td className="r">{brl(e.liquido)}</td></tr></tfoot>
          </table>

          <details open className="recibo-dias">
            <summary>Produção dia a dia</summary>
            <ul>{d.dias.map(x => <li key={x.data}><span>{dataBR(x.data)}</span><span className="muted">{x.itens}</span><b>{brl(x.total)}</b></li>)}</ul>
          </details>

          <div className="assinatura">
            <div><span />Assinatura do entregador</div>
            <div><span />WorldExpress</div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function FechamentoDetalhe() {
  const { id } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const [f, setF] = useState(null);
  const [pagar, setPagar] = useState(null);
  const [recibo, setRecibo] = useState(null);

  const load = useCallback(() => { api(`/fechamentos/${id}`).then(setF).catch(e => toast(e.message, 'erro')); }, [id, toast]);
  useEffect(() => { load(); }, [load]);

  if (!f) return <Loading />;
  const pendentes = f.linhas.filter(l => l.status === 'pendente');

  const confirmarPagamento = async body => {
    try {
      const r = await api(`/fechamentos/${id}/pagar`, { method: 'POST', body: { ...body, entregador_ids: pagar.linhas.map(l => l.entregador_id) } });
      toast(`${r.pagos} pagamento(s) registrado(s)`);
      setPagar(null);
      load();
    } catch (e) {
      toast(e.message, 'erro');
    }
  };

  const estornar = async l => {
    if (!window.confirm(`Estornar o pagamento de ${l.nome}?`)) return;
    await api(`/fechamentos/${id}/estornar`, { method: 'POST', body: { entregador_id: l.entregador_id } });
    toast('Pagamento estornado');
    load();
  };

  const excluir = async () => {
    if (!window.confirm('Excluir este fechamento? A produção e os ajustes voltam a ficar em aberto.')) return;
    try {
      await api(`/fechamentos/${id}`, { method: 'DELETE' });
      toast('Fechamento excluído');
      navigate('/fechamentos');
    } catch (e) {
      toast(e.message, 'erro');
    }
  };

  return (
    <>
      <Link to="/fechamentos" className="back-link"><ArrowLeft size={16} /> Fechamentos</Link>
      <PageHeader title={`Fechamento ${periodo(f.inicio, f.fim)}`} subtitle={`${f.descricao || ''} · criado por ${f.criado_por || '—'} em ${dataBR(f.criado_em)}`}>
        <Badge status={f.status} />
        {f.pago === 0 && <button className="btn btn-ghost" onClick={excluir}><Trash2 size={16} /> Excluir</button>}
        {pendentes.length > 0 && (
          <button className="btn btn-success" onClick={() => setPagar({ linhas: pendentes })}><CircleDollarSign size={17} /> Pagar todos ({brl(f.pendente)})</button>
        )}
      </PageHeader>

      <div className="kpi-row">
        <div className="kpi"><span className="kpi-value c-cyan">{brl(f.producao)}</span><span>Produção</span></div>
        <div className="kpi"><span className="kpi-value c-green">+ {brl(f.creditos)}</span><span>Bônus e reembolsos</span></div>
        <div className="kpi"><span className="kpi-value c-red">− {brl(f.debitos)}</span><span>Vales e descontos</span></div>
        <div className="kpi"><span className="kpi-value c-purple">{brl(f.liquido)}</span><span>Líquido a repassar</span></div>
        <div className="kpi"><span className="kpi-value c-orange">{brl(f.pendente)}</span><span>Pendente</span></div>
      </div>

      <Card pad={false}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Entregador</th><th className="r">Dias</th><th className="r">Itens</th><th className="r">Produção</th><th className="r">Créditos</th><th className="r">Vales/desc.</th><th className="r">Líquido</th><th>Pagamento</th><th className="col-actions">Ações</th></tr>
            </thead>
            <tbody>
              {f.linhas.map(l => (
                <tr key={l.id}>
                  <td data-label="Entregador"><b className="strong">{l.nome}</b><div className="muted small">{l.pix_chave ? `Pix ${l.pix_tipo}: ${l.pix_chave}` : 'Sem chave Pix'}</div></td>
                  <td data-label="Dias" className="r">{l.dias}</td>
                  <td data-label="Itens" className="r">{num(l.quantidade, 0)}{l.diarias ? <div className="muted small">+ {l.diarias} diária(s)</div> : null}</td>
                  <td data-label="Produção" className="r">{brl(l.producao)}</td>
                  <td data-label="Créditos" className="r c-green">{l.creditos ? `+ ${brl(l.creditos)}` : '—'}</td>
                  <td data-label="Vales/desc." className="r c-red">{l.debitos ? `− ${brl(l.debitos)}` : '—'}</td>
                  <td data-label="Líquido" className={`r ${l.liquido < 0 ? 'c-red' : ''}`}><b>{brl(l.liquido)}</b></td>
                  <td data-label="Pagamento"><Badge status={l.status} />{l.pago_em && <div className="muted small">{dataBR(l.pago_em)} · {l.forma_pagamento}</div>}</td>
                  <td className="col-actions">
                    <div className="row-actions">
                      {l.status === 'pendente'
                        ? <button className="btn btn-sm btn-success" onClick={() => setPagar({ linhas: [l] })}><CircleDollarSign size={15} /> Pagar</button>
                        : <button className="icon-btn" title="Estornar" onClick={() => estornar(l)}><Undo2 size={16} /></button>}
                      <button className="icon-btn info" title="Recibo" onClick={() => setRecibo(l)}><ReceiptText size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <PagarModal alvo={pagar} onClose={() => setPagar(null)} onConfirm={confirmarPagamento} />
      <Recibo alvo={recibo} onClose={() => setRecibo(null)} />
    </>
  );
}
