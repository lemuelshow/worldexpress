import { Bike, Car, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CrudPage from '../components/CrudPage.jsx';
import { Badge } from '../components/ui.jsx';
import { brl, VEICULOS } from '../format.js';

const fields = [
  { name: 'nome', label: 'Nome completo', required: true, full: true },
  { name: 'cpf', label: 'CPF' },
  { name: 'telefone', label: 'Telefone / WhatsApp', type: 'tel' },
  { name: 'veiculo', label: 'Veículo', type: 'select', required: true, options: [{ value: 'carro', label: 'Carro' }, { value: 'moto', label: 'Moto' }] },
  { name: 'modelo_veiculo', label: 'Modelo do veículo' },
  { name: 'placa', label: 'Placa' },
  { name: 'admissao', label: 'Início na empresa', type: 'date' },
  { name: 'pix_tipo', label: 'Tipo da chave Pix', type: 'select', options: ['CPF', 'Telefone', 'E-mail', 'Aleatória'] },
  { name: 'pix_chave', label: 'Chave Pix' },
  { name: 'email', label: 'E-mail', type: 'email' },
  { name: 'status', label: 'Status', type: 'select', options: [{ value: 'ativo', label: 'Ativo' }, { value: 'inativo', label: 'Inativo' }] },
  { name: 'observacoes', label: 'Observações', type: 'textarea', full: true },
];

export const IconeVeiculo = ({ veiculo, size = 15 }) => (veiculo === 'moto' ? <Bike size={size} /> : <Car size={size} />);

const columns = [
  { key: 'nome', label: 'Entregador', render: e => <div><b className="strong">{e.nome}</b><div className="muted small">{e.cpf || '—'}</div></div> },
  {
    key: 'veiculo', label: 'Veículo',
    render: e => (
      <div className="with-icon">
        <span className={`avatar ${e.veiculo === 'moto' ? 'pj' : ''}`}><IconeVeiculo veiculo={e.veiculo} /></span>
        <div>{VEICULOS[e.veiculo]}<div className="muted small">{[e.modelo_veiculo, e.placa].filter(Boolean).join(' · ')}</div></div>
      </div>
    ),
  },
  { key: 'telefone', label: 'Contato / Pix', render: e => <div>{e.telefone || '—'}<div className="muted small">{e.pix_chave ? `Pix ${e.pix_tipo}: ${e.pix_chave}` : 'Sem chave Pix'}</div></div> },
  { key: 'producao_mes', label: 'Produção no mês', align: 'right', render: e => <div><b>{brl(e.producao_mes)}</b><div className="muted small">{e.dias_mes} dia(s)</div></div> },
  { key: 'em_aberto', label: 'Em aberto', align: 'right', render: e => <span className={e.em_aberto < 0 ? 'c-red' : ''}>{brl(e.em_aberto)}</span> },
  { key: 'a_pagar', label: 'Fechado a pagar', align: 'right', render: e => (e.a_pagar ? <b className="c-orange">{brl(e.a_pagar)}</b> : '—') },
  { key: 'status', label: 'Status', render: e => <Badge status={e.status} /> },
];

const filters = [
  { name: 'veiculo', label: 'Veículo', options: [{ value: 'carro', label: 'Carro' }, { value: 'moto', label: 'Moto' }] },
  { name: 'status', label: 'Status', options: [{ value: 'ativo', label: 'Ativo' }, { value: 'inativo', label: 'Inativo' }] },
];

function Resumo({ rows }) {
  const ativos = rows.filter(r => r.status === 'ativo');
  return (
    <div className="kpi-row">
      <div className="kpi"><span className="kpi-value c-purple">{ativos.length}</span><span>Entregadores ativos</span></div>
      <div className="kpi"><span className="kpi-value c-cyan">{ativos.filter(r => r.veiculo === 'carro').length} / {ativos.filter(r => r.veiculo === 'moto').length}</span><span>Carro / Moto</span></div>
      <div className="kpi"><span className="kpi-value c-green">{brl(rows.reduce((a, r) => a + r.producao_mes, 0))}</span><span>Produção no mês</span></div>
      <div className="kpi"><span className="kpi-value c-orange">{brl(rows.reduce((a, r) => a + r.em_aberto + r.a_pagar, 0))}</span><span>Total a repassar</span></div>
    </div>
  );
}

export default function Entregadores() {
  const navigate = useNavigate();
  return (
    <CrudPage title="Entregadores" subtitle="Equipe de entrega, veículos e dados para pagamento" endpoint="/entregadores"
      newLabel="Novo entregador" formTitle="Entregador" columns={columns} fields={fields} filters={filters}
      initialFilters={{ status: 'ativo' }} defaults={{ veiculo: 'carro', status: 'ativo', pix_tipo: 'CPF' }}
      summary={rows => <Resumo rows={rows} />}
      rowActions={e => (
        <button className="icon-btn info" title="Extrato" onClick={() => navigate(`/relatorios?tipo=extrato&entregador_id=${e.id}`)}>
          <FileText size={16} />
        </button>
      )} />
  );
}
