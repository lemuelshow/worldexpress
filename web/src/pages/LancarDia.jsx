import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Lock, Save } from 'lucide-react';
import { api } from '../api.js';
import { Card, Loading, PageHeader, useToast } from '../components/ui.jsx';
import { addDias, brl, dataBR, DIAS_SEMANA, hojeISO, num } from '../format.js';
import { IconeVeiculo } from './Entregadores.jsx';

const precoDe = (s, veiculo) => s.precos[veiculo] ?? s.precos.todos ?? null;

export default function LancarDia() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(params.get('data') || hojeISO());
  const [dados, setDados] = useState(null);
  const [linhas, setLinhas] = useState([]);
  const [alterado, setAlterado] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setDados(null);
    try {
      const d = await api(`/lancamentos/dia?data=${data}`);
      setDados(d);
      setLinhas(d.linhas.map(l => ({ ...l, quantidades: { ...l.quantidades } })));
      setAlterado(false);
    } catch (e) {
      toast(e.message, 'erro');
    }
  }, [data, toast]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { setParams({ data }, { replace: true }); }, [data, setParams]);

  useEffect(() => {
    const aviso = e => { if (alterado) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [alterado]);

  const servicos = dados?.servicos || [];

  const totalLinha = useCallback(l => servicos.reduce((a, s) => {
    const p = precoDe(s, l.veiculo);
    return a + (p != null ? (Number(l.quantidades[s.servico]) || 0) * p : 0);
  }, 0), [servicos]);

  const totais = useMemo(() => {
    const t = { valor: 0, entregadores: 0 };
    servicos.forEach(s => { t[s.servico] = 0; });
    linhas.forEach(l => {
      const v = totalLinha(l);
      t.valor += v;
      if (v > 0) t.entregadores++;
      servicos.forEach(s => { t[s.servico] += Number(l.quantidades[s.servico]) || 0; });
    });
    return t;
  }, [linhas, servicos, totalLinha]);

  const mudar = (idx, patch) => {
    setLinhas(ls => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
    setAlterado(true);
  };

  const mudarQtd = (idx, servico, valor) => {
    const l = linhas[idx];
    mudar(idx, { quantidades: { ...l.quantidades, [servico]: valor === '' ? '' : Math.max(0, Number(valor)) } });
  };

  const mudarVeiculo = (idx, veiculo) => {
    const l = linhas[idx];
    const q = { ...l.quantidades };
    servicos.forEach(s => { if (precoDe(s, veiculo) == null) delete q[s.servico]; });
    mudar(idx, { veiculo, quantidades: q });
  };

  const trocarData = nova => {
    if (alterado && !window.confirm('Há alterações não salvas. Deseja descartá-las?')) return;
    setData(nova);
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await api('/lancamentos/dia', {
        method: 'POST',
        body: { data, linhas: linhas.filter(l => !l.fechado).map(l => ({ entregador_id: l.entregador_id, veiculo: l.veiculo, quantidades: l.quantidades, observacoes: l.observacoes })) },
      });
      toast(`Produção de ${dataBR(data)} salva: ${r.gravados} entregador(es), ${brl(r.total)}`);
      carregar();
    } catch (e) {
      toast(e.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  // Enter desce para a mesma coluna da próxima linha (digitação rápida)
  const navegar = (e, linha, coluna) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const prox = document.querySelector(`[data-cel="${linha + 1}-${coluna}"]`) || document.querySelector(`[data-cel="0-${coluna + 1}"]`);
    prox?.focus();
    prox?.select?.();
  };

  const ds = new Date(`${data}T12:00`).getDay();
  const fechadoDia = linhas.some(l => l.fechado);

  return (
    <>
      <PageHeader title="Lançar produção" subtitle="Quantidades entregues por entregador no dia — o valor é calculado pela tabela de preços">
        <div className="toolbar-group">
          <button className="icon-btn" onClick={() => trocarData(addDias(data, -1))} aria-label="Dia anterior"><ChevronLeft size={18} /></button>
          <input type="date" value={data} onChange={e => e.target.value && trocarData(e.target.value)} aria-label="Data" />
          <button className="icon-btn" onClick={() => trocarData(addDias(data, 1))} aria-label="Próximo dia"><ChevronRight size={18} /></button>
          {data !== hojeISO() && <button className="btn btn-ghost btn-sm" onClick={() => trocarData(hojeISO())}>Hoje</button>}
        </div>
        <button className="btn btn-success" onClick={salvar} disabled={salvando || !alterado}>
          <Save size={17} /> {salvando ? 'Salvando…' : alterado ? 'Salvar produção' : 'Salvo'}
        </button>
      </PageHeader>

      <div className="kpi-row">
        <div className="kpi"><span className="kpi-value c-purple">{DIAS_SEMANA[ds]}</span><span>{dataBR(data)}</span></div>
        <div className="kpi"><span className="kpi-value c-green">{brl(totais.valor)}</span><span>Produção do dia</span></div>
        <div className="kpi"><span className="kpi-value c-cyan">{totais.entregadores}</span><span>Entregadores com produção</span></div>
        <div className="kpi"><span className="kpi-value c-orange">{num(servicos.filter(s => s.unidade === 'un').reduce((a, s) => a + (totais[s.servico] || 0), 0), 0)}</span><span>Itens entregues</span></div>
      </div>

      <Card pad={false}>
        <div className="price-legend">
          {servicos.map(s => (
            <span key={s.servico}>
              <b>{s.servico}</b>
              {Object.entries(s.precos).map(([v, p]) => <em key={v}>{v === 'todos' ? '' : `${v} `}{brl(p)}{s.unidade === 'dia' ? '/dia' : ''}</em>)}
            </span>
          ))}
          {fechadoDia && <span className="locked"><Lock size={13} /> Linhas com cadeado já estão em fechamento</span>}
        </div>
        {!dados ? <Loading /> : (
          <div className="table-wrap">
            <table className="table entry">
              <thead>
                <tr>
                  <th>Entregador</th>
                  <th>Veículo</th>
                  {servicos.map(s => <th key={s.servico} className="center">{s.servico}{s.unidade === 'dia' ? ' (dias)' : ''}</th>)}
                  <th className="r">Total</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => {
                  const total = totalLinha(l);
                  return (
                    <tr key={l.entregador_id} className={`${l.fechado ? 'locked-row' : ''} ${total > 0 ? 'has-value' : ''}`}>
                      <td data-label="Entregador">
                        <b className="strong">{l.nome}</b>
                        {l.status === 'inativo' && <div className="muted small">inativo</div>}
                        {l.fechado && <div className="muted small"><Lock size={11} /> fechado</div>}
                      </td>
                      <td data-label="Veículo">
                        <div className="veh-select">
                          <IconeVeiculo veiculo={l.veiculo} />
                          <select value={l.veiculo} disabled={l.fechado} onChange={e => mudarVeiculo(i, e.target.value)} aria-label={`Veículo de ${l.nome}`}>
                            <option value="carro">Carro</option>
                            <option value="moto">Moto</option>
                          </select>
                        </div>
                      </td>
                      {servicos.map((s, j) => {
                        const p = precoDe(s, l.veiculo);
                        return (
                          <td key={s.servico} data-label={s.servico} className="center">
                            {p == null ? <span className="muted small">—</span> : (
                              <input type="number" min="0" step="1" className="qty" data-cel={`${i}-${j}`}
                                disabled={l.fechado} value={l.quantidades[s.servico] ?? ''} placeholder="–"
                                onChange={e => mudarQtd(i, s.servico, e.target.value)} onKeyDown={e => navegar(e, i, j)}
                                onFocus={e => e.target.select()} aria-label={`${s.servico} - ${l.nome}`} />
                            )}
                          </td>
                        );
                      })}
                      <td data-label="Total" className="r"><b className={total > 0 ? 'c-green' : 'muted'}>{brl(total)}</b></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total do dia</td>
                  <td>{totais.entregadores} ent.</td>
                  {servicos.map(s => <td key={s.servico} className="center">{num(totais[s.servico], 0)}</td>)}
                  <td className="r">{brl(totais.valor)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
      <p className="muted small">Dica: digite a quantidade e pressione <b>Enter</b> para ir ao próximo entregador. Deixe em branco quem não trabalhou.</p>
    </>
  );
}
