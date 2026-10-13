import CrudPage from '../components/CrudPage.jsx';
import { Badge } from '../components/ui.jsx';
import { brl, VEICULOS } from '../format.js';
import { IconeVeiculo } from './Entregadores.jsx';

const fields = [
  { name: 'servico', label: 'Serviço', required: true, placeholder: 'Ex.: Encomenda, Cards, Revistas (LPT), Diária', help: 'Serviços com o mesmo nome viram uma coluna na tela de lançamento.' },
  {
    name: 'veiculo', label: 'Veículo', type: 'select', required: true,
    options: [{ value: 'carro', label: 'Carro' }, { value: 'moto', label: 'Moto' }, { value: 'todos', label: 'Todos os veículos' }],
  },
  { name: 'unidade', label: 'Cobrança', type: 'select', required: true, options: [{ value: 'un', label: 'Por unidade entregue' }, { value: 'dia', label: 'Por dia (diária)' }] },
  { name: 'valor', label: 'Valor repassado (R$)', type: 'money', required: true },
  { name: 'ordem', label: 'Ordem na tela', type: 'number', min: 0 },
  { name: 'ativo', label: 'Ativo', type: 'checkbox', checkLabel: 'Disponível para lançamento' },
];

const columns = [
  { key: 'servico', label: 'Serviço', render: p => <b className="strong">{p.servico}</b> },
  { key: 'veiculo', label: 'Veículo', render: p => <span className="with-icon">{p.veiculo !== 'todos' && <IconeVeiculo veiculo={p.veiculo} />}{VEICULOS[p.veiculo]}</span> },
  { key: 'unidade', label: 'Cobrança', render: p => (p.unidade === 'dia' ? 'Por dia' : 'Por unidade') },
  { key: 'valor', label: 'Valor', align: 'right', render: p => <b className="c-purple">{brl(p.valor)}{p.unidade === 'dia' ? ' / dia' : ' / un.'}</b> },
  { key: 'ativo', label: 'Situação', render: p => <Badge status={p.ativo ? 'ativo' : 'inativo'} /> },
];

export default function Precos() {
  return (
    <CrudPage title="Tabela de preços" subtitle="Quanto o entregador recebe por item entregue ou por diária. Alterações não mudam lançamentos já feitos."
      endpoint="/precos" newLabel="Novo preço" formTitle="Preço" columns={columns} fields={fields}
      defaults={{ veiculo: 'carro', unidade: 'un', ativo: true, ordem: 10 }} />
  );
}
