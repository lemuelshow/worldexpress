import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck, CalendarDays, Gauge, Package, Truck, Users, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, qs } from '../api.js';
import { Empty, Loading, useToast } from '../components/ui.jsx';
import { addMes, brl, dataBR, MESES_CURTOS, mesAtual, nomeMes, num, periodo, VEICULOS } from '../format.js';
import { IconeVeiculo } from './Entregadores.jsx';

const CORES = { producao: '#37467F', pago: '#2ECC87', adiantamentos: '#FFC90E' };
const LEGENDA = [['producao', 'Produção'], ['pago', 'Pago'], ['adiantamentos', 'Adiantamentos']];
const BLOCOS = ['bg-indigo', 'bg-orange', 'bg-cyan', 'bg-purple'];

function TooltipMoeda({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <b>{label}</b>
      {payload.map(p => <div key={p.dataKey}><i style={{ background: p.color }} />{p.name}: <b>{brl(p.value)}</b></div>)}
    </div>
  );
}

export default function Dashboard() {
  const toast = useToast();
  const [mes, setMes] = useState(mesAtual());
  const [ano, setAno] = useState(mesAtual().slice(0, 4));
  const [d, setD] = useState(null);

  useEffect(() => {
    api(`/dashboard${qs({ mes, ano })}`).then(setD).catch(e => toast(e.message, 'erro'));
  }, [mes, ano, toast]);

  const meses = useMemo(() => Array.from({ length: 13 }, (_, i) => addMes(mesAtual(), -i)), []);
  const anos = useMemo(() => { const a = Number(mesAtual().slice(0, 4)); return [a, a - 1]; }, []);

  if (!d) return <Loading />;
  const f = d.financeiro;
  const o = d.operacional;
  const maxRank = Math.max(1, ...d.ranking.map(r => r.valor));
  const anual = d.anual.map(a => ({ ...a, nome: MESES_CURTOS[Number(a.mes.slice(5)) - 1] }));
  const diario = d.diario.map(x => ({ ...x, nome: x.data.slice(8) }));

  return (
    <div className="dashboard">
      <h1 className="dash-title">Dashboard Financeiro</h1>

      <section className="card">
        <div className="card-header">
          <h2>Visão financeira mensal</h2>
          <select value={mes} onChange={e => setMes(e.target.value)} aria-label="Mês">
            {meses.map(m => <option key={m} value={m}>{nomeMes(m)}</option>)}
          </select>
        </div>
        <div className="card-body">
          <div className="box">
            <h3>Movimentações</h3>
            <div className="moves">
              <div><span className="big c-green">{num(f.producao_mes)}</span><span>Produção (R$)</span></div>
              <div><span className="big c-cyan">{num(f.pago_mes)}</span><span>Pago aos entregadores (R$)</span></div>
              <div><span className="big c-yellow">{num(f.adiantamentos_mes)}</span><span>Adiantamentos (R$)</span></div>
            </div>
          </div>

          <div className="dash-split">
            <div className="box">
              <h3>Produção por serviço</h3>
              <div className="block bg-green block-main">
                <strong>{num(f.producao_mes)}</strong><small>Produção do mês (R$) · hoje {brl(f.producao_hoje)}</small>
              </div>
              <div className="block-row">
                {d.porServico.slice(0, 4).map((s, i) => (
                  <div key={s.servico} className={`block ${BLOCOS[i]}`}>
                    <strong>{num(s.valor)}</strong>
                    <small>{s.servico} · {num(s.quantidade, 0)}{s.unidade === 'dia' ? ' dia(s)' : ' un.'}</small>
                  </div>
                ))}
              </div>
            </div>
            <div className="box">
              <h3>A repassar aos entregadores</h3>
              <div className="block-row tall">
                <div className="block bg-pink">
                  <strong>{num(f.em_aberto)}</strong><small>Produção + ajustes ainda sem fechamento (R$)</small>
                  <hr />
                  <Link to="/fechamentos" className="block-link">Fazer fechamento <ArrowRight size={13} /></Link>
                </div>
                <div className="block bg-red">
                  <strong>{num(f.pendente_pagamento)}</strong><small>Fechado e aguardando pagamento (R$)</small>
                  <hr />
                  <Link to="/fechamentos" className="block-link">Pagar entregadores <ArrowRight size={13} /></Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header"><h2>Visão operacional · {nomeMes(mes)}</h2></div>
        <div className="card-body">
          <div className="stat-grid">
            <Link to="/entregadores" className="stat"><Users className="c-purple" /><b>{o.entregadores_ativos}</b><span>Entregadores ativos</span></Link>
            <div className="stat"><Package className="c-cyan" /><b>{num(o.entregas, 0)}</b><span>Itens entregues</span></div>
            <div className="stat"><CalendarDays className="c-green" /><b>{o.dias_trabalhados}</b><span>Dias-entregador</span></div>
            <div className="stat"><Gauge className="c-orange" /><b>{brl(o.media_dia)}</b><span>Média por entregador/dia</span></div>
            <div className="stat"><Wallet className="c-pink" /><b>{num(o.diarias, 0)}</b><span>Diárias pagas</span></div>
            <Link to="/lancar" className="stat"><CalendarCheck className="c-green" /><b>{o.lancado_hoje}/{o.entregadores_ativos}</b><span>Lançados hoje</span></Link>
            {d.porVeiculo.map(v => (
              <div key={v.veiculo} className="stat"><Truck className="c-cyan" /><b>{brl(v.valor)}</b><span>{VEICULOS[v.veiculo]} · {num(v.quantidade, 0)} itens</span></div>
            ))}
          </div>

          <div className="dash-grid-3">
            <div className="box">
              <h3>Produção diária (R$)</h3>
              {diario.length === 0 ? <Empty>Sem lançamentos no mês.</Empty> : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={diario} margin={{ top: 6, right: 4, left: -8, bottom: 0 }}>
                    <CartesianGrid stroke="#E6ECF2" vertical={false} />
                    <XAxis dataKey="nome" tickLine={false} axisLine={false} tick={{ fill: '#8A94A6', fontSize: 11 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: '#8A94A6', fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(1)}k`} />
                    <Tooltip content={<TooltipMoeda />} cursor={{ fill: 'rgba(108,43,217,.06)' }} />
                    <Bar dataKey="valor" name="Produção" fill="#00295F" isAnimationActive={false} radius={[3, 3, 0, 0]} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="box">
              <h3>Ranking de entregadores</h3>
              {d.ranking.length === 0 ? <Empty>Sem produção no mês.</Empty> : d.ranking.map((r, i) => (
                <div key={r.id} className="hbar">
                  <div className="hbar-label">
                    <span className="with-icon small"><b className="rank-pos">{i + 1}</b><IconeVeiculo veiculo={r.veiculo} size={13} />{r.nome}</span>
                    <span className="small"><b>{brl(r.valor)}</b> <span className="muted">· {num(r.quantidade, 0)} itens · {r.dias}d</span></span>
                  </div>
                  <div className="hbar-track"><i style={{ width: `${(r.valor / maxRank) * 100}%`, background: r.veiculo === 'moto' ? '#F75C0A' : '#37467F' }} /></div>
                </div>
              ))}
            </div>

            <div className="box">
              <h3>Alertas</h3>
              <ul className="alerts">
                {d.pendentes.map(p => (
                  <li key={p.id} className="alert-red"><Link to={`/fechamentos/${p.id}`}>Fechamento {periodo(p.inicio, p.fim)}: {brl(p.valor)} a pagar para {p.entregadores} entregador(es)</Link></li>
                ))}
                {o.lancado_hoje < o.entregadores_ativos && (
                  <li className="alert-orange"><Link to="/lancar">{o.entregadores_ativos - o.lancado_hoje} entregador(es) sem produção lançada hoje</Link></li>
                )}
                <li className="alert-purple"><Link to="/fechamentos">Último fechamento até {d.ultimoFechamento ? dataBR(d.ultimoFechamento) : '—'}</Link></li>
                <li className="alert-cyan">Descontos no mês: <b>{brl(f.descontos_mes)}</b> · bônus/reembolsos: <b>{brl(f.creditos_mes)}</b></li>
                <li className="alert-green">Total a repassar hoje: <b>{brl(f.a_repassar)}</b></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Visão financeira anual</h2>
          <div className="card-actions">
            <div className="legend">
              {LEGENDA.map(([k, l]) => <span key={k} style={{ color: CORES[k] }}><i style={{ background: CORES[k] }} />{l}</span>)}
            </div>
            <select value={ano} onChange={e => setAno(e.target.value)} aria-label="Ano">{anos.map(a => <option key={a}>{a}</option>)}</select>
          </div>
        </div>
        <div className="card-body chart-box">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={anual} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid stroke="#E6ECF2" vertical={false} />
              <XAxis dataKey="nome" tickLine={false} axisLine={false} tick={{ fill: '#8A94A6', fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: '#8A94A6', fontSize: 12 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
              <Tooltip content={<TooltipMoeda />} cursor={{ fill: 'rgba(108,43,217,.06)' }} />
              {LEGENDA.map(([k, l]) => <Bar key={k} dataKey={k} name={l} fill={CORES[k]} isAnimationActive={false} radius={[3, 3, 0, 0]} maxBarSize={18} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
