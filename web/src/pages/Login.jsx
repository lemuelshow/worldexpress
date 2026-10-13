import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Truck } from 'lucide-react';
import { api, sessao } from '../api.js';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@worldexpress.com');
  const [senha, setSenha] = useState('admin123');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  if (sessao.token) return <Navigate to="/" replace />;

  const entrar = async e => {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      const { token, usuario } = await api('/auth/login', { method: 'POST', body: { email, senha } });
      sessao.salvar(token, usuario);
      navigate('/');
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={entrar}>
        <div className="login-brand">
          <span className="brand-logo big"><Truck size={28} /></span>
          <h1>World<b>Express</b></h1>
          <p className="muted">Controle de produção e pagamento de entregadores</p>
        </div>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label htmlFor="senha">Senha</label>
          <input id="senha" type="password" value={senha} onChange={e => setSenha(e.target.value)} required />
        </div>
        {erro && <div className="form-error">{erro}</div>}
        <button className="btn btn-primary btn-block" disabled={carregando}>{carregando ? 'Entrando…' : 'Entrar'}</button>
        <p className="muted small center">Demonstração: admin@worldexpress.com / admin123</p>
      </form>
    </div>
  );
}
