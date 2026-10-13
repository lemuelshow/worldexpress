export const num = (v, casas = 2) =>
  Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
export const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const dataBR = s => (s ? s.slice(0, 10).split('-').reverse().join('/') : '-');
export const dataHoraBR = s => (s ? `${dataBR(s)} ${s.slice(11, 16)}` : '-');

const pad = n => String(n).padStart(2, '0');
export const isoData = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hojeISO = () => isoData(new Date());
export const mesAtual = () => hojeISO().slice(0, 7);
export const addMes = (mes, n) => {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
export const ultimoDia = mes => {
  const [y, m] = mes.split('-').map(Number);
  return `${mes}-${pad(new Date(y, m, 0).getDate())}`;
};

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const nomeMes = mes => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export const STATUS = {
  ativo: ['Ativo', 'green'],
  inativo: ['Inativo', 'gray'],
  aberto: ['Em aberto', 'yellow'],
  fechado: ['Fechado', 'cyan'],
  pendente: ['A pagar', 'orange'],
  parcial: ['Pago parcial', 'yellow'],
  pago: ['Pago', 'green'],
};

export const VEICULOS = { carro: 'Carro', moto: 'Moto', todos: 'Todos' };
export const PERFIS = { admin: 'Administrador', operador: 'Operador', financeiro: 'Financeiro' };
export const FORMAS_PAGAMENTO = ['Pix', 'Transferência', 'Dinheiro'];
export const TIPOS_AJUSTE = {
  adiantamento: { label: 'Adiantamento / vale', cor: 'orange', sinal: -1 },
  desconto: { label: 'Desconto', cor: 'red', sinal: -1 },
  bonus: { label: 'Bônus', cor: 'green', sinal: 1 },
  reembolso: { label: 'Reembolso', cor: 'cyan', sinal: 1 },
};
export const periodo = (a, b) => `${dataBR(a)} a ${dataBR(b)}`;

export function baixarCSV(nome, colunas, linhas) {
  const esc = v => {
    const s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [colunas.map(c => esc(c.label)).join(';'), ...linhas.map(l => colunas.map(c => esc(l[c.key])).join(';'))].join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${nome}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

export const addDias = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return isoData(new Date(y, m - 1, d + n));
};
