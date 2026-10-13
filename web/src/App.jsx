import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { sessao } from './api.js';
import { ToastProvider } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import LancarDia from './pages/LancarDia.jsx';
import Lancamentos from './pages/Lancamentos.jsx';
import Ajustes from './pages/Ajustes.jsx';
import Fechamentos from './pages/Fechamentos.jsx';
import FechamentoDetalhe from './pages/FechamentoDetalhe.jsx';
import Entregadores from './pages/Entregadores.jsx';
import Precos from './pages/Precos.jsx';
import Usuarios from './pages/Usuarios.jsx';
import Relatorios from './pages/Relatorios.jsx';

function Protegido({ children }) {
  return sessao.token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protegido><Layout /></Protegido>}>
            <Route index element={<Dashboard />} />
            <Route path="lancar" element={<LancarDia />} />
            <Route path="lancamentos" element={<Lancamentos />} />
            <Route path="ajustes" element={<Ajustes />} />
            <Route path="fechamentos" element={<Fechamentos />} />
            <Route path="fechamentos/:id" element={<FechamentoDetalhe />} />
            <Route path="entregadores" element={<Entregadores />} />
            <Route path="precos" element={<Precos />} />
            <Route path="usuarios" element={<Usuarios />} />
            <Route path="relatorios" element={<Relatorios />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
