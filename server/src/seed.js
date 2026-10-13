import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { db, all, run, scalar, transaction, hoje, addDias, addMeses, diaSemana } from './db.js';
import { salvarLancamento, tabelaServicos, criarFechamento } from './logic.js';

// PRNG determinístico para os dados de demonstração
let semente = 62818644;
const rnd = () => {
  semente |= 0; semente = (semente + 0x6d2b79f5) | 0;
  let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const entre = (a, b) => Math.floor(rnd() * (b - a + 1)) + a;
const escolha = arr => arr[Math.floor(rnd() * arr.length)];
const insert = (tabela, obj) => {
  const cols = Object.keys(obj);
  return Number(db.prepare(`INSERT INTO ${tabela} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(...cols.map(c => obj[c] ?? null)).lastInsertRowid);
};

function popular() {
  const hj = hoje();

  insert('usuarios', { nome: 'Administrador', email: 'admin@worldexpress.com', senha_hash: bcrypt.hashSync('admin123', 10), perfil: 'admin' });
  insert('usuarios', { nome: 'Operador', email: 'operador@worldexpress.com', senha_hash: bcrypt.hashSync('operador123', 10), perfil: 'operador' });

  // Tabela informada pelo cliente
  [
    ['Encomenda', 'carro', 'un', 4.0, 1],
    ['Encomenda', 'moto', 'un', 3.5, 1],
    ['Cards', 'carro', 'un', 2.0, 2],
    ['Revistas (LPT)', 'carro', 'un', 2.0, 3],
    ['Revistas (LPT)', 'moto', 'un', 1.5, 3],
    ['Diária', 'todos', 'dia', 150.0, 4],
  ].forEach(([servico, veiculo, unidade, valor, ordem]) => insert('tabela_precos', { servico, veiculo, unidade, valor, ordem }));

  const pessoas = [
    ['Adriano Pereira da Silva', 'carro', 'Fiat Fiorino', 'QWE-2A31'],
    ['Bruno Henrique Alves', 'carro', 'VW Saveiro', 'PRT-4B12'],
    ['Cláudio Roberto Lima', 'carro', 'Fiat Strada', 'OKM-7C55'],
    ['Daniel Souza Costa', 'carro', 'Renault Kangoo', 'QAZ-1D90'],
    ['Edson Marques', 'carro', 'Fiat Doblò', 'PLM-8E41'],
    ['Fábio Nunes Rocha', 'carro', 'Chevrolet Montana', 'RTY-3F27'],
    ['Gilmar Ferreira', 'moto', 'Honda CG 160', 'QWT-5G18'],
    ['Hugo Leonardo Dias', 'moto', 'Yamaha Factor 150', 'PXZ-6H44'],
    ['Igor Martins Ribeiro', 'moto', 'Honda Pop 110i', 'RKL-9I03'],
    ['Jefferson Araújo', 'moto', 'Honda CG 160', 'OPQ-2J76'],
  ];
  const entregadores = pessoas.map(([nome, veiculo, modelo_veiculo, placa], i) => ({
    id: insert('entregadores', {
      nome, veiculo, modelo_veiculo, placa,
      cpf: `${entre(100, 999)}.${entre(100, 999)}.${entre(100, 999)}-${entre(10, 99)}`,
      telefone: `(62) 9${entre(8100, 9999)}-${entre(1000, 9999)}`,
      pix_tipo: i % 2 ? 'CPF' : 'Telefone',
      pix_chave: i % 2 ? null : `(62) 9${entre(8100, 9999)}-${entre(1000, 9999)}`,
      admissao: addDias(hj, -entre(200, 900)),
      status: i === 9 ? 'inativo' : 'ativo',
      observacoes: i === 9 ? 'Desligado em agosto' : null,
    }),
    veiculo,
    ritmo: 0.85 + rnd() * 0.3,
    ativoAte: i === 9 ? `${addMeses(hj.slice(0, 7), -2)}-15` : null,
  }));
  run("UPDATE entregadores SET pix_chave = cpf WHERE pix_tipo = 'CPF'");

  const servicos = tabelaServicos();
  const inicio = `${addMeses(hj.slice(0, 7), -5)}-01`;

  // Produção diária (segunda a sábado)
  for (let d = inicio; d <= hj; d = addDias(d, 1)) {
    const ds = diaSemana(d);
    if (ds === 0) continue;
    const hojeParcial = d === hj;
    const diaristasSabado = ds === 6 ? [escolha(entregadores).id] : [];
    for (const e of entregadores) {
      if (e.ativoAte && d > e.ativoAte) continue;
      if (rnd() > (ds === 6 ? 0.7 : 0.93)) continue; // folgas / faltas
      if (hojeParcial && rnd() < 0.4) continue; // dia ainda sendo lançado
      const q = {};
      if (diaristasSabado.includes(e.id)) {
        q['Diária'] = 1;
      } else if (e.veiculo === 'carro') {
        q.Encomenda = Math.round(entre(45, 90) * e.ritmo);
        if (rnd() < 0.7) q.Cards = entre(5, 30);
        if (rnd() < 0.6) q['Revistas (LPT)'] = entre(10, 60);
      } else {
        q.Encomenda = Math.round(entre(40, 85) * e.ritmo);
        if (rnd() < 0.6) q['Revistas (LPT)'] = entre(15, 70);
      }
      salvarLancamento({ entregador_id: e.id, data: d, veiculo: e.veiculo, quantidades: q }, servicos);
    }
  }

  // Vales, descontos, bônus e reembolsos
  for (let m = inicio.slice(0, 7); m <= hj.slice(0, 7); m = addMeses(m, 1)) {
    for (const e of entregadores) {
      if (e.ativoAte && `${m}-01` > e.ativoAte) continue;
      const dia = () => `${m}-${String(entre(2, 27)).padStart(2, '0')}`;
      const insertAjuste = a => a.data <= hj && insert('ajustes', a);
      const vales = entre(0, 2);
      for (let i = 0; i < vales; i++) {
        insertAjuste({ entregador_id: e.id, data: dia(), tipo: 'adiantamento', descricao: 'Vale', valor: escolha([100, 150, 200, 250, 300, 400]) });
      }
      if (rnd() < 0.12) insertAjuste({ entregador_id: e.id, data: dia(), tipo: 'desconto', descricao: escolha(['Avaria em encomenda', 'Extravio de cartão', 'Multa de trânsito']), valor: escolha([35, 50, 80, 120]) });
      if (e.veiculo === 'moto' && rnd() < 0.5) insertAjuste({ entregador_id: e.id, data: dia(), tipo: 'reembolso', descricao: 'Reembolso de combustível', valor: escolha([60, 80, 100]) });
      if (rnd() < 0.15) insertAjuste({ entregador_id: e.id, data: dia(), tipo: 'bonus', descricao: 'Bônus por produtividade', valor: escolha([100, 150, 200]) });
    }
  }

  // Fechamentos semanais (segunda a domingo), pagos na terça seguinte
  let seg = inicio;
  while (diaSemana(seg) !== 1) seg = addDias(seg, -1);
  for (; addDias(seg, 6) < hj; seg = addDias(seg, 7)) {
    const dom = addDias(seg, 6);
    try {
      const id = criarFechamento({ inicio: seg, fim: dom, descricao: `Semana ${seg.slice(8)}/${seg.slice(5, 7)} a ${dom.slice(8)}/${dom.slice(5, 7)}` }, { nome: 'Administrador' });
      const pagamento = addDias(dom, 2);
      if (pagamento <= hj) {
        run("UPDATE fechamento_entregadores SET status = 'pago', pago_em = ?, forma_pagamento = 'Pix' WHERE fechamento_id = ?", pagamento, id);
      }
    } catch { /* semana sem movimento */ }
  }
}

export function seedSeVazio() {
  if (scalar('SELECT COUNT(*) FROM usuarios') > 0) return false;
  transaction(popular);
  return true;
}

export function resetar() {
  transaction(() => {
    for (const t of ['fechamento_entregadores', 'lancamento_itens', 'lancamentos', 'ajustes', 'fechamentos', 'tabela_precos', 'entregadores', 'usuarios']) {
      run(`DELETE FROM ${t}`);
    }
    run('DELETE FROM sqlite_sequence');
    popular();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--reset')) resetar();
  else seedSeVazio();
  console.log('Banco populado com dados de demonstração.');
}
