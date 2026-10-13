import CrudPage from '../components/CrudPage.jsx';
import { Badge } from '../components/ui.jsx';
import { dataBR, PERFIS } from '../format.js';
import { sessao } from '../api.js';

const fields = [
  { name: 'nome', label: 'Nome', required: true },
  { name: 'email', label: 'E-mail', type: 'email', required: true },
  { name: 'perfil', label: 'Perfil', type: 'select', required: true, options: Object.entries(PERFIS).map(([value, label]) => ({ value, label })) },
  { name: 'senha', label: 'Senha', type: 'password', help: f => (f.id ? 'Deixe em branco para manter a senha atual.' : 'Obrigatória para novos usuários.') },
  { name: 'ativo', label: 'Ativo', type: 'checkbox', checkLabel: 'Pode acessar o sistema' },
];

const columns = [
  { key: 'nome', label: 'Nome', render: u => <b className="strong">{u.nome}</b> },
  { key: 'email', label: 'E-mail' },
  { key: 'perfil', label: 'Perfil', render: u => PERFIS[u.perfil] || u.perfil },
  { key: 'criado_em', label: 'Criado em', render: u => dataBR(u.criado_em) },
  { key: 'ativo', label: 'Situação', render: u => <Badge status={u.ativo ? 'ativo' : 'inativo'} /> },
];

export default function Usuarios() {
  if (sessao.usuario?.perfil !== 'admin') return <p className="empty">Acesso restrito a administradores.</p>;
  return (
    <CrudPage title="Usuários" subtitle="Acesso ao sistema e perfis" endpoint="/usuarios" newLabel="Novo usuário"
      formTitle="Usuário" columns={columns} fields={fields} defaults={{ perfil: 'operador', ativo: true }} />
  );
}
