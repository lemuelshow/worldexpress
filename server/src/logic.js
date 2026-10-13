import { all, get, run, transaction } from './db.js';
import { HttpError } from './crud.js';

export const TIPOS_AJUSTE = {
  adiantamento: { label: 'Adiantamento / vale', sinal: -1 },
  desconto: { label: 'Desconto', sinal: -1 },
  bonus: { label: 'Bônus', sinal: 1 },
  reembolso: { label: 'Reembolso (combustível, pedágio…)', sinal: 1 },
};
const DEBITOS = "('adiantamento','desconto')";
const CREDITOS = "('bonus','reembolso')";

/** Serviços (colunas da planilha de lançamento) com o preço de cada veículo. */
export function tabelaServicos() {
  const precos = all('SELECT * FROM tabela_precos WHERE ativo = 1 ORDER BY ordem, servico');
  const mapa = new Map();
  for (const p of precos) {
    if (!mapa.has(p.servico)) mapa.set(p.servico, { servico: p.servico, unidade: p.unidade, ordem: p.ordem, precos: {} });
    mapa.get(p.servico).precos[p.veiculo] = p.valor;
  }
  return [...mapa.values()];
}

export function precoDe(servicos, servico, veiculo) {
  const s = servicos.find(x => x.servico === servico);
  if (!s) return null;
  return s.precos[veiculo] ?? s.precos.todos ?? null;
}

/** Grava (cria/substitui) a produção de um entregador em um dia. Retorna o total. */
export function salvarLancamento({ entregador_id, data, veiculo, quantidades = {}, observacoes }, servicos = tabelaServicos()) {
  const existente = get('SELECT * FROM lancamentos WHERE entregador_id = ? AND data = ?', entregador_id, data);
  if (existente?.fechamento_id) throw new HttpError(409, `Produção de ${data} já está em um fechamento e não pode ser alterada.`);

  const itens = [];
  for (const [servico, q] of Object.entries(quantidades)) {
    const quantidade = Number(q) || 0;
    if (quantidade <= 0) continue;
    const valor = precoDe(servicos, servico, veiculo);
    if (valor == null) throw new HttpError(400, `Não há preço de "${servico}" para ${veiculo}.`);
    const s = servicos.find(x => x.servico === servico);
    itens.push({ servico, unidade: s.unidade, quantidade, valor_unit: valor, subtotal: Math.round(quantidade * valor * 100) / 100 });
  }

  if (!itens.length) {
    if (existente) run('DELETE FROM lancamentos WHERE id = ?', existente.id);
    return 0;
  }
  const total = Math.round(itens.reduce((a, i) => a + i.subtotal, 0) * 100) / 100;
  let id = existente?.id;
  if (id) {
    run('UPDATE lancamentos SET veiculo = ?, total = ?, observacoes = ? WHERE id = ?', veiculo, total, observacoes || null, id);
    run('DELETE FROM lancamento_itens WHERE lancamento_id = ?', id);
  } else {
    id = Number(run('INSERT INTO lancamentos (entregador_id, data, veiculo, total, observacoes) VALUES (?, ?, ?, ?, ?)',
      entregador_id, data, veiculo, total, observacoes || null).lastInsertRowid);
  }
  for (const i of itens) {
    run('INSERT INTO lancamento_itens (lancamento_id, servico, unidade, quantidade, valor_unit, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
      id, i.servico, i.unidade, i.quantidade, i.valor_unit, i.subtotal);
  }
  return total;
}

/**
 * Resumo a pagar por entregador no período.
 * abertos = true considera só o que ainda não entrou em fechamento.
 */
export function resumoPorEntregador(inicio, fim, { abertos = true, entregadorId = null } = {}) {
  const filtroF = abertos ? 'AND fechamento_id IS NULL' : '';
  const linhas = all(
    `SELECT e.id AS entregador_id, e.nome, e.veiculo, e.pix_chave,
       (SELECT COUNT(*) FROM lancamentos WHERE entregador_id = e.id AND data BETWEEN ? AND ? ${filtroF}) AS dias,
       (SELECT COALESCE(SUM(i.quantidade),0) FROM lancamento_itens i JOIN lancamentos l ON l.id = i.lancamento_id
          WHERE l.entregador_id = e.id AND l.data BETWEEN ? AND ? AND i.unidade = 'un' ${abertos ? 'AND l.fechamento_id IS NULL' : ''}) AS quantidade,
       (SELECT COALESCE(SUM(i.quantidade),0) FROM lancamento_itens i JOIN lancamentos l ON l.id = i.lancamento_id
          WHERE l.entregador_id = e.id AND l.data BETWEEN ? AND ? AND i.unidade = 'dia' ${abertos ? 'AND l.fechamento_id IS NULL' : ''}) AS diarias,
       (SELECT COALESCE(SUM(total),0) FROM lancamentos WHERE entregador_id = e.id AND data BETWEEN ? AND ? ${filtroF}) AS producao,
       (SELECT COALESCE(SUM(valor),0) FROM ajustes WHERE entregador_id = e.id AND tipo IN ${CREDITOS} AND data BETWEEN ? AND ? ${filtroF}) AS creditos,
       (SELECT COALESCE(SUM(valor),0) FROM ajustes WHERE entregador_id = e.id AND tipo IN ${DEBITOS} AND data BETWEEN ? AND ? ${filtroF}) AS debitos
     FROM entregadores e
     WHERE (? IS NULL OR e.id = ?)
     ORDER BY e.nome`,
    inicio, fim, inicio, fim, inicio, fim, inicio, fim, inicio, fim, inicio, fim, entregadorId, entregadorId,
  );
  return linhas
    .map(l => ({ ...l, liquido: Math.round((l.producao + l.creditos - l.debitos) * 100) / 100 }))
    .filter(l => l.dias > 0 || l.creditos > 0 || l.debitos > 0);
}

export function criarFechamento({ inicio, fim, descricao }, usuario) {
  if (!inicio || !fim || inicio > fim) throw new HttpError(400, 'Informe um período válido');
  const linhas = resumoPorEntregador(inicio, fim);
  if (!linhas.length) throw new HttpError(400, 'Não há produção ou ajustes em aberto nesse período.');
  return transaction(() => {
    const id = Number(run('INSERT INTO fechamentos (inicio, fim, descricao, criado_por) VALUES (?, ?, ?, ?)',
      inicio, fim, descricao || null, usuario?.nome || null).lastInsertRowid);
    for (const l of linhas) {
      run(`INSERT INTO fechamento_entregadores (fechamento_id, entregador_id, dias, quantidade, diarias, producao, creditos, debitos, liquido)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, l.entregador_id, l.dias, l.quantidade, l.diarias, l.producao, l.creditos, l.debitos, l.liquido);
    }
    run('UPDATE lancamentos SET fechamento_id = ? WHERE fechamento_id IS NULL AND data BETWEEN ? AND ?', id, inicio, fim);
    run('UPDATE ajustes SET fechamento_id = ? WHERE fechamento_id IS NULL AND data BETWEEN ? AND ?', id, inicio, fim);
    return id;
  });
}

/** Detalhe para o recibo do entregador em um fechamento. */
export function recibo(fechamentoId, entregadorId) {
  const f = get('SELECT * FROM fechamentos WHERE id = ?', fechamentoId);
  const linha = get(
    `SELECT fe.*, e.nome, e.cpf, e.veiculo, e.placa, e.pix_tipo, e.pix_chave
     FROM fechamento_entregadores fe JOIN entregadores e ON e.id = fe.entregador_id
     WHERE fe.fechamento_id = ? AND fe.entregador_id = ?`, fechamentoId, entregadorId);
  if (!f || !linha) throw new HttpError(404, 'Recibo não encontrado');
  const servicos = all(
    `SELECT i.servico, i.unidade, i.valor_unit, SUM(i.quantidade) AS quantidade, SUM(i.subtotal) AS subtotal
     FROM lancamento_itens i JOIN lancamentos l ON l.id = i.lancamento_id
     WHERE l.fechamento_id = ? AND l.entregador_id = ?
     GROUP BY i.servico, i.valor_unit ORDER BY subtotal DESC`, fechamentoId, entregadorId);
  const dias = all(
    `SELECT l.data, l.veiculo, l.total,
       (SELECT group_concat(CAST(quantidade AS INTEGER) || ' ' || servico, ' · ') FROM lancamento_itens WHERE lancamento_id = l.id) AS itens
     FROM lancamentos l WHERE l.fechamento_id = ? AND l.entregador_id = ? ORDER BY l.data`, fechamentoId, entregadorId);
  const ajustes = all('SELECT * FROM ajustes WHERE fechamento_id = ? AND entregador_id = ? ORDER BY data', fechamentoId, entregadorId);
  return { fechamento: f, entregador: linha, servicos, dias, ajustes };
}
