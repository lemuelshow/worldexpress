import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Plus } from 'lucide-react';
import { api } from '../api.js';
import { Badge, Card, Empty, Loading, Modal, PageHeader, useToast } from '../components/ui.jsx';
import { addDias, brl, dataBR, hojeISO, num, periodo } from '../format.js';

const segunda = iso => {
  const d = new Date(`${iso}T12:00`).getDay();
  return addDias(iso, d === 0 ? -6 : 1 - d);
};

function NovoFechamento({ open, onClose, onCriado }) {
  const toast = useToast();
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [descricao, setDescricao] = useState('');
  const [previa, setPrevia] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const hj = hojeISO();
  const atalhos = [
    ['Semana passada', segunda(addDias(hj, -7)), addDias(segunda(addDias(hj, -7)), 6)],
    ['Esta semana', segunda(hj), hj],
    ['1ª quinzena', `${hj.slice(0, 7)}-01`, `${hj.slice(0, 7)}-15`],
    ['Mês atual', `${hj.slice(0, 7)}-01`, hj],
  ];

  useEffect(() => {
    if (!open) return;
    setPrevia(null);
    setDescricao('');
    api(`/fechamentos/previa?inicio=${hj}&fim=${hj}`).then(p => {
      const ini = p.ultimo_fim ? addDias(p.ultimo_fim, 1) : `${hj.slice(0, 7)}-01`;
      const fimSemana = addDias(segunda(ini), 6);
      setInicio(ini);
      setFim(fimSemana > hj ? hj : fimSemana);
    }).catch(() => { setInicio(atalhos[0][1]); setFim(atalhos[0][2]); });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !inicio || !fim) return;
    if (inicio > fim) { setPrevia(null); return; }
    api(`/fechamentos/previa?inicio=${inicio}&fim=${fim}`).then(setPrevia).catch(e => toast(e.message, 'erro'));
  }, [open, inicio, fim, toast]);

  const total = k => previa?.linhas.reduce((a, l) => a + l[k], 0) || 0;

  const criar = async () => {
    setSalvando(true);
    try {
      const f = await api('/fechamentos', { method: 'POST', body: { inicio, fim, descricao: descricao || `Período ${periodo(inicio, fim)}` } });
      toast('Fechamento criado');
      onCriado(f.id);
    } catch (e) {
      toast(e.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal open={open} title="Novo fechamento" onClose={onClose} size="lg"
      footer={(
        <>
          <span className="muted small" style={{ marginRight: 'auto' }}>A produção e os ajustes do período ficam bloqueados para edição após o fechamento.</span>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!previa?.linhas.length || salvando} onClick={criar}>
            {salvando ? 'Gerando…' : `Fechar ${brl(total('liquido'))}`}
          </button>
        </>
      )}>
      <div className="chips-select" style={{ marginBottom: 14 }}>
        {atalhos.map(([l, a, b]) => (
          <button key={l} type="button" className={`chip ${inicio === a && fim === b ? 'on' : ''}`} onClick={() => { setInicio(a); setFim(b); }}>{l}</button>
        ))}
      </div>
      <div className="form-grid">
        <div className="field half"><label htmlFor="ini">Início</label><input id="ini" type="date" value={inicio} onChange={e => setInicio(e.target.value)} /></div>
        <div className="field half"><label htmlFor="fim">Fim</label><input id="fim" type="date" value={fim} onChange={e => setFim(e.target.value)} /></div>
        <div className="field"><label htmlFor="desc">Descrição</label><input id="desc" value={descricao} placeholder={`Período ${periodo(inicio, fim)}`} onChange={e => setDescricao(e.target.value)} /></div>
      </div>
      {previa?.anteriores > 0 && (
        <p className="warn-box"><AlertTriangle size={16} /> Existem {previa.anteriores} lançamento(s) em aberto antes de {dataBR(inicio)} que não entrarão neste fechamento.</p>
      )}
      {!previa ? <Loading /> : previa.linhas.length === 0 ? <Empty>Nenhuma produção ou ajuste em aberto nesse período.</Empty> : (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="table compact">
            <thead><tr><th>Entregador</th><th className="r">Dias</th><th className="r">Itens</th><th className="r">Produção</th><th className="r">Créditos</th><th className="r">Vales/desc.</th><th className="r">A pagar</th></tr></thead>
            <tbody>
              {previa.linhas.map(l => (
                <tr key={l.entregador_id}>
                  <td data-label="Entregador"><b className="strong">{l.nome}</b></td>
                  <td data-label="Dias" className="r">{l.dias}</td>
                  <td data-label="Itens" className="r">{num(l.quantidade, 0)}{l.diarias ? ` + ${l.diarias} diária(s)` : ''}</td>
                  <td data-label="Produção" className="r">{brl(l.producao)}</td>
                  <td data-label="Créditos" className="r c-green">{l.creditos ? `+ ${brl(l.creditos)}` : '—'}</td>
                  <td data-label="Vales/desc." className="r c-red">{l.debitos ? `− ${brl(l.debitos)}` : '—'}</td>
                  <td data-label="A pagar" className={`r ${l.liquido < 0 ? 'c-red' : ''}`}><b>{brl(l.liquido)}</b></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>{previa.linhas.length} entregadores</td><td /><td className="r">{num(total('quantidade'), 0)}</td><td className="r">{brl(total('producao'))}</td>
                <td className="r">{brl(total('creditos'))}</td><td className="r">{brl(total('debitos'))}</td><td className="r">{brl(total('liquido'))}</td></tr>
            </tfoot>
          </table>
        </div>
      )}
    </Modal>
  );
}

export default function Fechamentos() {
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [novo, setNovo] = useState(false);
  const [limite, setLimite] = useState(20);

  const load = useCallback(() => { api('/fechamentos').then(setRows).catch(e => toast(e.message, 'erro')); }, [toast]);
  useEffect(() => { load(); }, [load]);

  const pendente = rows?.reduce((a, r) => a + r.pendente, 0) || 0;
  const ultimo = rows?.[0];

  return (
    <>
      <PageHeader title="Fechamentos" subtitle="Consolida a produção e os vales do período e controla o pagamento de cada entregador">
        <button className="btn btn-success" onClick={() => setNovo(true)}><Plus size={18} /> Novo fechamento</button>
      </PageHeader>

      {rows && (
        <div className="kpi-row">
          <div className="kpi"><span className="kpi-value c-orange">{brl(pendente)}</span><span>Fechado e ainda não pago</span></div>
          <div className="kpi"><span className="kpi-value c-purple">{ultimo ? periodo(ultimo.inicio, ultimo.fim) : '—'}</span><span>Último fechamento</span></div>
          <div className="kpi"><span className="kpi-value c-green">{brl(rows.reduce((a, r) => a + r.pago, 0))}</span><span>Total já pago</span></div>
          <div className="kpi"><span className="kpi-value c-cyan">{rows.length}</span><span>Fechamentos</span></div>
        </div>
      )}

      <Card pad={false}>
        {!rows ? <Loading /> : rows.length === 0 ? <Empty>Nenhum fechamento ainda. Clique em "Novo fechamento".</Empty> : (
          <>
            <div className="table-wrap">
              <table className="table clickable">
                <thead>
                  <tr><th>Período</th><th className="r">Entregadores</th><th className="r">Produção</th><th className="r">Créditos</th><th className="r">Vales/desc.</th><th className="r">Líquido</th><th className="r">Pendente</th><th>Status</th><th /></tr>
                </thead>
                <tbody>
                  {rows.slice(0, limite).map(f => (
                    <tr key={f.id} onClick={() => navigate(`/fechamentos/${f.id}`)}>
                      <td data-label="Período"><b className="strong">{periodo(f.inicio, f.fim)}</b><div className="muted small">{f.descricao}</div></td>
                      <td data-label="Entregadores" className="r">{f.entregadores}</td>
                      <td data-label="Produção" className="r">{brl(f.producao)}</td>
                      <td data-label="Créditos" className="r c-green">{brl(f.creditos)}</td>
                      <td data-label="Vales/desc." className="r c-red">{brl(f.debitos)}</td>
                      <td data-label="Líquido" className="r"><b>{brl(f.liquido)}</b></td>
                      <td data-label="Pendente" className="r">{f.pendente ? <b className="c-orange">{brl(f.pendente)}</b> : '—'}</td>
                      <td data-label="Status"><Badge status={f.status} /></td>
                      <td className="col-actions"><ChevronRight size={18} className="muted" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > limite && <div className="more"><button className="btn btn-ghost" onClick={() => setLimite(l => l + 20)}>Mostrar mais ({rows.length - limite} restantes)</button></div>}
          </>
        )}
      </Card>

      <NovoFechamento open={novo} onClose={() => setNovo(false)} onCriado={id => { setNovo(false); navigate(`/fechamentos/${id}`); }} />
    </>
  );
}
