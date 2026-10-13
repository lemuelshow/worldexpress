import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Menu, Plus, Truck, UserCircle2 } from 'lucide-react';
import { sessao } from '../api.js';
import { PERFIS } from '../format.js';

const MENU = [
  { label: 'Dashboard', to: '/' },
  { label: 'Lançar produção', to: '/lancar' },
  { label: 'Lançamentos', to: '/lancamentos' },
  { label: 'Vales e ajustes', to: '/ajustes' },
  { label: 'Fechamentos', to: '/fechamentos' },
  {
    label: 'Cadastros',
    itens: [
      { label: 'Entregadores', to: '/entregadores' },
      { label: 'Tabela de preços', to: '/precos' },
      { label: 'Usuários', to: '/usuarios', admin: true },
    ],
  },
  { label: 'Relatórios', to: '/relatorios' },
];

export default function Layout() {
  const [aberto, setAberto] = useState(null);
  const [mobile, setMobile] = useState(false);
  const navRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const usuario = sessao.usuario;

  useEffect(() => { setAberto(null); setMobile(false); }, [location.pathname]);
  useEffect(() => {
    const fora = e => navRef.current && !navRef.current.contains(e.target) && setAberto(null);
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  const sair = () => {
    sessao.limpar();
    navigate('/login');
  };

  return (
    <div className="app">
      <header className="topbar" ref={navRef}>
        <NavLink to="/" className="brand" aria-label="WorldExpress - início">
          <span className="brand-logo"><Truck size={19} /></span>
          <span className="brand-name">World<b>Express</b></span>
        </NavLink>

        <button className="burger" onClick={() => setMobile(!mobile)} aria-label="Abrir menu"><Menu size={22} /></button>

        <nav className={`nav ${mobile ? 'open' : ''}`}>
          {MENU.map(item => {
            if (!item.itens) {
              return <NavLink key={item.label} to={item.to} end={item.to === '/'} className="nav-item">{item.label}</NavLink>;
            }
            const itens = item.itens.filter(i => !i.admin || usuario?.perfil === 'admin');
            const ativo = itens.some(i => location.pathname.startsWith(i.to));
            return (
              <div key={item.label} className={`nav-group ${aberto === item.label ? 'open' : ''}`}>
                <button className={`nav-item ${ativo ? 'active' : ''}`} onClick={() => setAberto(aberto === item.label ? null : item.label)}>
                  {item.label} <ChevronDown size={14} />
                </button>
                <div className="dropdown">
                  {itens.map(i => <NavLink key={i.to} to={i.to} className="dropdown-item">{i.label}</NavLink>)}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="topbar-right">
          <button className="btn btn-success btn-sm" onClick={() => navigate('/lancar')}>
            <Plus size={16} /> Lançar dia
          </button>
          <button className="icon-btn light" title="Pagamentos pendentes" onClick={() => navigate('/fechamentos')}>
            <Bell size={18} />
          </button>
          <div className={`nav-group user ${aberto === 'user' ? 'open' : ''}`}>
            <button className="user-btn" onClick={() => setAberto(aberto === 'user' ? null : 'user')}>
              <UserCircle2 size={22} /> <span className="user-name">{usuario?.nome?.split(' ')[0]}</span> <ChevronDown size={14} />
            </button>
            <div className="dropdown right">
              <div className="dropdown-info">
                <strong>{usuario?.nome}</strong>
                <small>{usuario?.email}</small>
                <small>{PERFIS[usuario?.perfil]}</small>
              </div>
              <button className="dropdown-item" onClick={sair}><LogOut size={15} /> Sair</button>
            </div>
          </div>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
