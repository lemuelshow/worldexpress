import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Lock, Printer, Trash2, Truck } from 'lucide-react';
import { api, carregarOpcoes, qs } from '../api.js';
import { Badge, Card, Empty, Loading, PageHeader, useToast } from '../components/ui.jsx';
import { brl, dataBR, DIAS_SEMANA, hojeISO, mesAtual, num, VEICULOS } from '../format.js';
import { IconeVeiculo } from './Entregadores.jsx';

const POR_PAGINA = 60;

/** Versão para impressão/PDF: todas as linhas do filtro, com cabeçalho e resumo por entregador. */
function Impressao({ rows, f, entregadores }) {
  const nome = entregadores.find(e => String(e.id) === String(f.entregador_id))?.nome;
  const filtros = [
    `Período: ${f.de ? dataBR(f.de) : 'início'} a ${f.ate ? dataBR(f.ate) : dataBR(hojeISO())}`,
    `Entregador: ${nome || 'todos'}`,
    `Veículo: ${f.veiculo ? VEICULOS[f.veiculo] : 'todos'}`,
    `Situação: ${f.situacao === 'aberto' ? 'em aberto' : f.situacao === 'fechado' ? 'fechado' : 'todas'}`,
  ];
  const total = rows.reduce((a, r) => a + r.total, 0);
  const itens = rows.reduce((a, r) => a + r.quantidade, 0);
  const porEntregador = Object.values(rows.reduce((acc, r) => {
    const k = r.entregador_id;
    acc[k] ||= { nome: r.entregador_nome, dias: 0, quantidade: 0, total: 0 };
    acc[k].dias++;
    acc[k].quantidade += r.quantidade;
    acc[k].total += r.total;
    return acc;
  }, {})).sort((a, b) => b.total - a.total);
  const ordenadas = [...rows].sort((a, b) => a.data.localeCompare(b.data) || a.entregador_nome.localeCompare(b.entregador_nome));
  const agora = new Date();

  return (
    <div className="print-only print-report">
      <header>
        <div className="recibo-brand"><span className="brand-logo"><Truck size={18} /></span><b>World<strong>Express</strong></b></div>
        <div className="r">
          <h3>Relatório de lançamentos</h3>
          <span className="muted small">Emitido em {dataBR(hojeISO())} às {agora.toTimeString().slice(0, 5)}</span>
        </div>
      </header>
      <p className="print-filtros">{filtros.join(' · ')}</p>
      <div className="print-kpis">
        <div><small>Produção</small><b>{brl(total)}</b></div>
        <div><small>Itens entregues</small><b>{num(itens, 0)}</b></div>
        <div><small>Dias-entregador</small><b>{rows.length}</b></div>
        <div><small>Em aberto</small><b>{brl(rows.filter(r => r.situacao === 'aberto').reduce((a, r) => a + r.total, 0))}</b></div>
      </div>

      <table className="table compact">
        <thead><tr><th>Data</th><th>Entregador</th><th>Veículo</th><th>Itens</th><th className="r">Qtd.</th><th className="r">Valor</th><th>Situação</th></tr></thead>
        <tbody>
          {ordenadas.map(l => (
            <tr key={l.id}>
              <td>{dataBR(l.data)}</td><td>{l.entregador_nome}</td><td>{VEICULOS[l.veiculo]}</td><td className="small">{l.itens}</td>
              <td className="r">{num(l.quantidade, 0)}</td><td className="r">{brl(l.total)}</td><td>{l.situacao === 'aberto' ? 'Em aberto' : 'Fechado'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={4}>Total · {rows.length} lançamento(s)</td><td className="r">{num(itens, 0)}</td><td className="r">{brl(total)}</td><td /></tr></tfoot>
      </table>

      {porEntregador.length > 1 && (
        <>
          <h4>Resumo por entregador</h4>
          <table className="table compact">
            <thead><tr><th>Entregador</th><th className="r">Dias</th><th className="r">Itens</th><th className="r">Produção</th></tr></thead>
            <tbody>
              {porEntregador.map(e => (
                <tr key={e.nome}><td>{e.nome}</td><td className="r">{e.dias}</td><td className="r">{num(e.quantidade, 0)}</td><td className="r">{brl(e.total)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export default function Lancamentos() {
  const toast = useToast();
  const navigate = useNavigate();
  const [f, setF] = useState({ de: `${mesAtual()}-01`, ate: '', entregador_id: '', veiculo: '', situacao: '' });
  const [rows, setRows] = useState(null);
  const [entregadores, setEntregadores] = useState([]);
  const [limite, setLimite] = useState(POR_PAGINA);

  const load = useCallback(() => {
    api(`/lancamentos${qs(f)}`).then(setRows).catch(e => toast(e.message, 'erro'));
  }, [f, toast]);
  useEffect(() => { load(); setLimite(POR_PAGINA); }, [load]);
  useEffect(() => { carregarOpcoes('/entregadores').then(setEntregadores).catch(() => {}); }, []);

  const excluir = async l => {
    if (!window.confirm(`Excluir a produção de ${l.entregador_nome} em ${dataBR(l.data)}?`)) return;
    try {
      await api(`/lancamentos/${l.id}`, { method: 'DELETE' });
      toast('Lançamento excluído');
      load();
    } catch (e) {
      toast(e.message, 'erro');
    }
  };

  const imprimir = () => {
    const titulo = document.title;
    const ini = f.de ? dataBR(f.de) : 'inicio';
    const fim = f.ate ? dataBR(f.ate) : dataBR(hojeISO());
    document.title = `Lancamentos WorldExpress ${ini} a ${fim}`.replace(/\//g, '-');
    document.body.classList.add('print-lancamentos');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('print-lancamentos');
      document.title = titulo;
    }, 300);
  };

  const total = rows?.reduce((a, r) => a + r.total, 0) || 0;
  const itens = rows?.reduce((a, r) => a + r.quantidade, 0) || 0;
  const aberto = rows?.filter(r => r.situacao === 'aberto').reduce((a, r) => a + r.total, 0) || 0;

  return (
    <>
      <PageHeader title="Lançamentos" subtitle="Histórico da produção diária de cada entregador">
        <button className="btn btn-ghost" onClick={imprimir} disabled={!rows?.length} title="Imprime ou salva em PDF com os filtros aplicados">
          <Printer size={17} /> Imprimir / PDF
        </button>
        <button className="btn btn-success" onClick={() => navigate('/lancar')}><CalendarDays size={17} /> Lançar produção</button>
      </PageHeader>

      {rows && (
        <div className="kpi-row">
          <div className="kpi"><span className="kpi-value c-green">{brl(total)}</span><span>Produção no filtro</span></div>
          <div className="kpi"><span className="kpi-value c-cyan">{num(itens, 0)}</span><span>Itens entregues</span></div>
          <div className="kpi"><span className="kpi-value c-purple">{rows.length}</span><span>Dias-entregador</span></div>
          <div className="kpi"><span className="kpi-value c-orange">{brl(aberto)}</span><span>Ainda não fechado</span></div>
        </div>
      )}

      <Card pad={false}>
        <div className="filters">
          <label className="filter-date"><span>De</span><input type="date" value={f.de} onChange={e => setF({ ...f, de: e.target.value })} /></label>
          <label className="filter-date"><span>Até</span><input type="date" value={f.ate} onChange={e => setF({ ...f, ate: e.target.value })} /></label>
          <select value={f.entregador_id} onChange={e => setF({ ...f, entregador_id: e.target.value })} aria-label="Entregador">
            <option value="">Entregador: todos</option>
            {entregadores.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          <select value={f.veiculo} onChange={e => setF({ ...f, veiculo: e.target.value })} aria-label="Veículo">
            <option value="">Veículo: todos</option><option value="carro">Carro</option><option value="moto">Moto</option>
          </select>
          <select value={f.situacao} onChange={e => setF({ ...f, situacao: e.target.value })} aria-label="Situação">
            <option value="">Situação: todas</option><option value="aberto">Em aberto</option><option value="fechado">Fechado</option>
          </select>
          {rows && <span className="muted count">{rows.length} registro(s)</span>}
        </div>
        {!rows ? <Loading /> : rows.length === 0 ? <Empty /> : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Data</th><th>Entregador</th><th>Veículo</th><th>Itens</th><th className="r">Qtd.</th><th className="r">Valor</th><th>Situação</th><th className="col-actions">Ações</th></tr>
                </thead>
                <tbody>
                  {rows.slice(0, limite).map(l => (
                    <tr key={l.id}>
                      <td data-label="Data">{dataBR(l.data)}<div className="muted small">{DIAS_SEMANA[new Date(`${l.data}T12:00`).getDay()]}</div></td>
                      <td data-label="Entregador"><b className="strong">{l.entregador_nome}</b></td>
                      <td data-label="Veículo"><span className="with-icon"><IconeVeiculo veiculo={l.veiculo} />{VEICULOS[l.veiculo]}</span></td>
                      <td data-label="Itens" className="small">{l.itens}</td>
                      <td data-label="Qtd." className="r">{num(l.quantidade, 0)}</td>
                      <td data-label="Valor" className="r"><b>{brl(l.total)}</b></td>
                      <td data-label="Situação"><span className="with-icon"><Badge status={l.situacao} />{l.situacao === 'fechado' && <Lock size={13} className="muted" />}</span></td>
                      <td className="col-actions">
                        <div className="row-actions">
                          <button className="icon-btn info" title="Abrir o dia" onClick={() => navigate(`/lancar?data=${l.data}`)}><CalendarDays size={16} /></button>
                          {l.situacao === 'aberto' && <button className="icon-btn danger" title="Excluir" onClick={() => excluir(l)}><Trash2 size={16} /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > limite && (
              <div className="more"><button className="btn btn-ghost" onClick={() => setLimite(l => l + POR_PAGINA)}>Mostrar mais ({rows.length - limite} restantes)</button></div>
            )}
          </>
        )}
      </Card>
      {rows?.length > 0 && <Impressao rows={rows} f={f} entregadores={entregadores} />}
    </>
  );
}
