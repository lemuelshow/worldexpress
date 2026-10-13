import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, CalendarRange, Download, FileText, HandCoins, Layers, Printer, ReceiptText, Users } from 'lucide-react';
import { api, carregarOpcoes, qs } from '../api.js';
import { Badge, Card, Empty, Loading, PageHeader, useToast } from '../components/ui.jsx';
import { baixarCSV, brl, dataBR, hojeISO, num } from '../format.js';

const ICONES = {
  producao_entregador: Users, producao_servico: Layers, producao_diaria: CalendarRange, extrato: FileText,
  ajustes: HandCoins, pagamentos: ReceiptText, mensal: BarChart3,
};
const NUMERICOS = ['moeda', 'numero'];

const formatar = (v, tipo) => {
  if (v == null || v === '') return '—';
  if (tipo === 'moeda') return brl(v);
  if (tipo === 'numero') return Number.isInteger(v) ? num(v, 0) : num(v, 1);
  if (tipo === 'data') return dataBR(v);
  if (tipo === 'status') return <Badge status={v} />;
  return v;
};

export default function Relatorios() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [tipos, setTipos] = useState([]);
  const [tipo, setTipo] = useState(params.get('tipo') || 'producao_entregador');
  const [filtro, setFiltro] = useState({ de: `${hojeISO().slice(0, 7)}-01`, ate: hojeISO(), entregador_id: params.get('entregador_id') || '' });
  const [entregadores, setEntregadores] = useState([]);
  const [rel, setRel] = useState(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    api('/relatorios').then(setTipos).catch(() => {});
    carregarOpcoes('/entregadores').then(setEntregadores).catch(() => {});
  }, []);

  useEffect(() => {
    setCarregando(true);
    api(`/relatorios/${tipo}${qs(filtro)}`)
      .then(setRel)
      .catch(e => toast(e.message, 'erro'))
      .finally(() => setCarregando(false));
  }, [tipo, filtro, toast]);

  const nomeEntregador = entregadores.find(e => String(e.id) === String(filtro.entregador_id))?.nome;
  const exportar = () => rel && baixarCSV(`worldexpress-${tipo}-${filtro.de}-${filtro.ate}`, rel.colunas, rel.linhas);

  return (
    <>
      <PageHeader title="Relatórios" subtitle="Produção, repasses e pagamentos dos entregadores">
        <button className="btn btn-ghost" onClick={() => window.print()}><Printer size={16} /> Imprimir</button>
        <button className="btn btn-primary" onClick={exportar} disabled={!rel?.linhas?.length}><Download size={16} /> Exportar CSV</button>
      </PageHeader>

      <div className="report-types no-print">
        {tipos.map(t => {
          const Icon = ICONES[t.id] || BarChart3;
          return (
            <button key={t.id} className={`report-type ${tipo === t.id ? 'on' : ''}`} onClick={() => setTipo(t.id)}>
              <Icon size={20} /><span>{t.titulo}</span>
            </button>
          );
        })}
      </div>

      <Card pad={false}>
        <div className="filters no-print">
          <label className="filter-date"><span>De</span><input type="date" value={filtro.de} onChange={e => setFiltro({ ...filtro, de: e.target.value })} /></label>
          <label className="filter-date"><span>Até</span><input type="date" value={filtro.ate} onChange={e => setFiltro({ ...filtro, ate: e.target.value })} /></label>
          <select value={filtro.entregador_id} onChange={e => setFiltro({ ...filtro, entregador_id: e.target.value })} aria-label="Entregador">
            <option value="">{tipo === 'extrato' ? 'Selecione o entregador…' : 'Entregador: todos'}</option>
            {entregadores.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </div>

        <div className="report-title">
          <h2>{rel?.titulo}{nomeEntregador ? ` · ${nomeEntregador}` : ''}</h2>
          {rel && <span className="muted">Período: {dataBR(rel.filtros.de)} a {dataBR(rel.filtros.ate)}</span>}
        </div>

        {carregando && !rel ? <Loading /> : rel?.aviso ? <Empty>{rel.aviso}</Empty> : !rel?.linhas?.length ? <Empty>Nenhum dado para os filtros selecionados.</Empty> : (
          <div className="table-wrap">
            <table className="table report">
              <thead>
                <tr>{rel.colunas.map(c => <th key={c.key} className={NUMERICOS.includes(c.tipo) ? 'r' : ''}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {rel.linhas.map((l, i) => (
                  <tr key={i}>
                    {rel.colunas.map(c => (
                      <td key={c.key} data-label={c.label} className={`${NUMERICOS.includes(c.tipo) ? 'r' : ''} ${c.tipo === 'moeda' && l[c.key] < 0 ? 'c-red' : ''}`}>
                        {formatar(l[c.key], c.tipo)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {rel.totais && (
                <tfoot>
                  <tr>{rel.colunas.map(c => <td key={c.key} className={NUMERICOS.includes(c.tipo) ? 'r' : ''}>{rel.totais[c.key] != null ? formatar(rel.totais[c.key], c.tipo === 'status' || c.tipo === 'data' ? 'texto' : c.tipo) : ''}</td>)}</tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
