import { Lock } from 'lucide-react';
import CrudPage from '../components/CrudPage.jsx';
import { Badge } from '../components/ui.jsx';
import { brl, dataBR, hojeISO, mesAtual, TIPOS_AJUSTE } from '../format.js';

const tipos = Object.entries(TIPOS_AJUSTE).map(([value, t]) => ({ value, label: t.label }));

const fields = [
  { name: 'entregador_id', label: 'Entregador', type: 'select', required: true, source: { endpoint: '/entregadores?status=ativo' } },
  { name: 'data', label: 'Data', type: 'date', required: true },
  { name: 'tipo', label: 'Tipo', type: 'select', required: true, options: tipos, help: f => (TIPOS_AJUSTE[f.tipo]?.sinal < 0 ? 'Será descontado do valor a pagar.' : 'Será somado ao valor a pagar.') },
  { name: 'valor', label: 'Valor (R$)', type: 'money', required: true },
  { name: 'descricao', label: 'Descrição', full: true, placeholder: 'Ex.: Vale, Reembolso de combustível, Avaria em encomenda' },
];

const columns = [
  { key: 'data', label: 'Data', render: a => dataBR(a.data) },
  { key: 'entregador_nome', label: 'Entregador', render: a => <b className="strong">{a.entregador_nome}</b> },
  { key: 'tipo', label: 'Tipo', render: a => <span className={`badge badge-${TIPOS_AJUSTE[a.tipo]?.cor}`}>{TIPOS_AJUSTE[a.tipo]?.label}</span> },
  { key: 'descricao', label: 'Descrição' },
  { key: 'valor_sinal', label: 'Valor', align: 'right', render: a => <b className={a.valor_sinal < 0 ? 'c-red' : 'c-green'}>{a.valor_sinal < 0 ? '− ' : '+ '}{brl(Math.abs(a.valor_sinal))}</b> },
  { key: 'situacao', label: 'Situação', render: a => <span className="with-icon"><Badge status={a.situacao} />{a.situacao === 'fechado' && <Lock size={13} className="muted" />}</span> },
];

const filters = [
  { name: 'entregador_id', label: 'Entregador', source: { endpoint: '/entregadores' } },
  { name: 'tipo', label: 'Tipo', options: tipos },
  { name: 'situacao', label: 'Situação', options: [{ value: 'aberto', label: 'Em aberto' }, { value: 'fechado', label: 'Fechado' }] },
  { name: 'de', label: 'De', type: 'date' },
  { name: 'ate', label: 'Até', type: 'date' },
];

function Resumo({ rows }) {
  const soma = tipo => rows.filter(r => r.tipo === tipo).reduce((a, r) => a + r.valor, 0);
  return (
    <div className="kpi-row">
      <div className="kpi"><span className="kpi-value c-orange">{brl(soma('adiantamento'))}</span><span>Adiantamentos / vales</span></div>
      <div className="kpi"><span className="kpi-value c-red">{brl(soma('desconto'))}</span><span>Descontos</span></div>
      <div className="kpi"><span className="kpi-value c-green">{brl(soma('bonus'))}</span><span>Bônus</span></div>
      <div className="kpi"><span className="kpi-value c-cyan">{brl(soma('reembolso'))}</span><span>Reembolsos</span></div>
    </div>
  );
}

export default function Ajustes() {
  return (
    <CrudPage title="Vales e ajustes" subtitle="Adiantamentos, descontos, bônus e reembolsos — entram automaticamente no próximo fechamento"
      endpoint="/ajustes" newLabel="Novo lançamento" formTitle="Ajuste" columns={columns} fields={fields} filters={filters}
      initialFilters={{ de: `${mesAtual()}-01` }} defaults={{ data: hojeISO(), tipo: 'adiantamento', descricao: 'Vale' }}
      summary={rows => <Resumo rows={rows} />} />
  );
}
