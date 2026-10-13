import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { all, get, run, scalar, transaction, hoje, addMeses } from './db.js';
import { crud, HttpError } from './crud.js';
import { somenteAdmin } from './auth.js';
import { TIPOS_AJUSTE, tabelaServicos, salvarLancamento, resumoPorEntregador, criarFechamento, recibo } from './logic.js';

export const api = Router();
const mesValido = m => /^\d{4}-\d{2}$/.test(m || '');
const dataValida = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const r2 = v => Math.round((v || 0) * 100) / 100;

/* ------------------------------------------------------------- Cadastros */

api.use('/entregadores', crud({
  table: 'entregadores',
  fields: ['nome', 'cpf', 'telefone', 'email', 'veiculo', 'modelo_veiculo', 'placa', 'pix_tipo', 'pix_chave', 'admissao', 'status', 'observacoes'],
  required: ['nome', 'veiculo'],
  view: `SELECT e.*,
      (SELECT COALESCE(SUM(total),0) FROM lancamentos WHERE entregador_id = e.id AND substr(data,1,7) = strftime('%Y-%m','now','localtime')) AS producao_mes,
      (SELECT COUNT(*) FROM lancamentos WHERE entregador_id = e.id AND substr(data,1,7) = strftime('%Y-%m','now','localtime')) AS dias_mes,
      (SELECT COALESCE(SUM(total),0) FROM lancamentos WHERE entregador_id = e.id AND fechamento_id IS NULL)
        + (SELECT COALESCE(SUM(CASE WHEN tipo IN ('bonus','reembolso') THEN valor ELSE -valor END),0) FROM ajustes WHERE entregador_id = e.id AND fechamento_id IS NULL) AS em_aberto,
      (SELECT COALESCE(SUM(liquido),0) FROM fechamento_entregadores WHERE entregador_id = e.id AND status = 'pendente') AS a_pagar
    FROM entregadores e`,
  search: ['nome', 'cpf', 'telefone', 'placa'],
  filters: ['status', 'veiculo'],
  orderBy: 'nome',
  beforeDelete: e => {
    if (get('SELECT 1 FROM lancamentos WHERE entregador_id = ? LIMIT 1', e.id) || get('SELECT 1 FROM ajustes WHERE entregador_id = ? LIMIT 1', e.id)) {
      throw new HttpError(409, 'Entregador possui lançamentos. Altere o status para "inativo".');
    }
  },
}));

api.use('/precos', crud({
  table: 'tabela_precos',
  fields: ['servico', 'veiculo', 'unidade', 'valor', 'ordem', 'ativo'],
  required: ['servico', 'veiculo', 'valor'],
  search: ['servico'],
  filters: ['veiculo', 'ativo'],
  orderBy: 'ordem, servico, veiculo',
}));

api.use('/usuarios', somenteAdmin, crud({
  table: 'usuarios',
  fields: ['nome', 'email', 'perfil', 'ativo', 'senha_hash'],
  required: ['nome', 'email'],
  view: 'SELECT id, nome, email, perfil, ativo, criado_em FROM usuarios',
  search: ['nome', 'email'],
  orderBy: 'nome',
  beforeSave: (data, body, atual) => {
    if (data.email) data.email = data.email.toLowerCase().trim();
    if (body.senha) data.senha_hash = bcrypt.hashSync(String(body.senha), 10);
    else if (!atual) throw new HttpError(400, 'Informe a senha do novo usuário');
    else delete data.senha_hash;
  },
}));

/* ------------------------------------------------------------ Lançamentos */

const lancamentos = Router();

lancamentos.get('/servicos', (req, res) => res.json(tabelaServicos()));

lancamentos.get('/dia', (req, res) => {
  const data = req.query.data;
  if (!dataValida(data)) throw new HttpError(400, 'Informe a data (AAAA-MM-DD)');
  const servicos = tabelaServicos();
  const entregadores = all(
    `SELECT * FROM entregadores e
     WHERE e.status = 'ativo' OR EXISTS (SELECT 1 FROM lancamentos WHERE entregador_id = e.id AND data = ?)
     ORDER BY e.nome`, data);
  const linhas = entregadores.map(e => {
    const l = get('SELECT * FROM lancamentos WHERE entregador_id = ? AND data = ?', e.id, data);
    const quantidades = {};
    if (l) all('SELECT servico, quantidade FROM lancamento_itens WHERE lancamento_id = ?', l.id).forEach(i => { quantidades[i.servico] = i.quantidade; });
    return {
      entregador_id: e.id, nome: e.nome, status: e.status, veiculo: l?.veiculo || e.veiculo,
      quantidades, total: l?.total || 0, observacoes: l?.observacoes || '', lancamento_id: l?.id || null, fechado: !!l?.fechamento_id,
    };
  });
  res.json({ data, servicos, linhas });
});

lancamentos.post('/dia', (req, res) => {
  const { data, linhas = [] } = req.body;
  if (!dataValida(data)) throw new HttpError(400, 'Informe a data (AAAA-MM-DD)');
  const servicos = tabelaServicos();
  const resultado = transaction(() => {
    let total = 0;
    let gravados = 0;
    for (const l of linhas) {
      if (l.fechado) continue;
      const t = salvarLancamento({ ...l, data }, servicos);
      total += t;
      if (t > 0) gravados++;
    }
    return { total: r2(total), gravados };
  });
  res.json(resultado);
});

lancamentos.get('/', (req, res) => {
  const { de, ate, entregador_id, situacao, veiculo } = req.query;
  const linhas = all(
    `SELECT l.*, e.nome AS entregador_nome,
       (SELECT group_concat(CAST(quantidade AS INTEGER) || ' ' || servico, ' · ') FROM lancamento_itens WHERE lancamento_id = l.id) AS itens,
       (SELECT COALESCE(SUM(quantidade),0) FROM lancamento_itens WHERE lancamento_id = l.id AND unidade = 'un') AS quantidade,
       CASE WHEN l.fechamento_id IS NULL THEN 'aberto' ELSE 'fechado' END AS situacao
     FROM lancamentos l JOIN entregadores e ON e.id = l.entregador_id
     WHERE (? IS NULL OR l.data >= ?) AND (? IS NULL OR l.data <= ?)
       AND (? IS NULL OR l.entregador_id = ?) AND (? IS NULL OR l.veiculo = ?)
       AND (? IS NULL OR (CASE WHEN l.fechamento_id IS NULL THEN 'aberto' ELSE 'fechado' END) = ?)
     ORDER BY l.data DESC, e.nome`,
    de || null, de || null, ate || null, ate || null,
    entregador_id ? Number(entregador_id) : null, entregador_id ? Number(entregador_id) : null,
    veiculo || null, veiculo || null, situacao || null, situacao || null,
  );
  res.json(linhas);
});

lancamentos.delete('/:id', (req, res) => {
  const l = get('SELECT * FROM lancamentos WHERE id = ?', Number(req.params.id));
  if (!l) throw new HttpError(404, 'Lançamento não encontrado');
  if (l.fechamento_id) throw new HttpError(409, 'Lançamento já está em um fechamento.');
  run('DELETE FROM lancamentos WHERE id = ?', l.id);
  res.status(204).end();
});
api.use('/lancamentos', lancamentos);

/* ---------------------------------------------------------------- Ajustes */

api.get('/ajustes/tipos', (req, res) => res.json(TIPOS_AJUSTE));
api.use('/ajustes', crud({
  table: 'ajustes',
  fields: ['entregador_id', 'data', 'tipo', 'descricao', 'valor'],
  required: ['entregador_id', 'data', 'tipo', 'valor'],
  view: `SELECT a.*, e.nome AS entregador_nome,
           CASE WHEN a.tipo IN ('adiantamento','desconto') THEN -a.valor ELSE a.valor END AS valor_sinal,
           CASE WHEN a.fechamento_id IS NULL THEN 'aberto' ELSE 'fechado' END AS situacao
         FROM ajustes a JOIN entregadores e ON e.id = a.entregador_id`,
  search: ['entregador_nome', 'descricao'],
  filters: ['entregador_id', 'tipo', 'situacao'],
  dateField: 'data',
  orderBy: 'data DESC, id DESC',
  beforeSave: (data, body, atual) => {
    if (atual?.fechamento_id) throw new HttpError(409, 'Ajuste já está em um fechamento e não pode ser alterado.');
    if (data.tipo && !TIPOS_AJUSTE[data.tipo]) throw new HttpError(400, 'Tipo de ajuste inválido');
    if (data.valor != null && !(Number(data.valor) > 0)) throw new HttpError(400, 'Informe um valor maior que zero');
  },
  beforeDelete: a => { if (a.fechamento_id) throw new HttpError(409, 'Ajuste já está em um fechamento.'); },
}));

/* ------------------------------------------------------------ Fechamentos */

const fechamentos = Router();
const SQL_FECHAMENTOS = `
  SELECT f.*, COUNT(fe.id) AS entregadores,
    COALESCE(SUM(fe.producao),0) AS producao, COALESCE(SUM(fe.creditos),0) AS creditos, COALESCE(SUM(fe.debitos),0) AS debitos,
    COALESCE(SUM(fe.liquido),0) AS liquido,
    COALESCE(SUM(CASE WHEN fe.status = 'pago' THEN fe.liquido END),0) AS pago,
    COALESCE(SUM(CASE WHEN fe.status = 'pendente' THEN fe.liquido END),0) AS pendente,
    CASE WHEN SUM(fe.status = 'pendente') = 0 THEN 'pago' WHEN SUM(fe.status = 'pago') = 0 THEN 'pendente' ELSE 'parcial' END AS status
  FROM fechamentos f LEFT JOIN fechamento_entregadores fe ON fe.fechamento_id = f.id`;

fechamentos.get('/', (req, res) => {
  res.json(all(`${SQL_FECHAMENTOS} GROUP BY f.id ORDER BY f.fim DESC, f.id DESC`));
});

fechamentos.get('/previa', (req, res) => {
  const { inicio, fim } = req.query;
  if (!dataValida(inicio) || !dataValida(fim)) throw new HttpError(400, 'Informe o período');
  const linhas = resumoPorEntregador(inicio, fim);
  const anteriores = scalar('SELECT COUNT(*) FROM lancamentos WHERE fechamento_id IS NULL AND data < ?', inicio);
  const ultimo = get('SELECT MAX(fim) AS fim FROM fechamentos')?.fim || null;
  res.json({ inicio, fim, linhas, anteriores, ultimo_fim: ultimo });
});

fechamentos.post('/', (req, res) => {
  const id = criarFechamento(req.body, req.usuario);
  res.status(201).json(get(`${SQL_FECHAMENTOS} WHERE f.id = ? GROUP BY f.id`, id));
});

fechamentos.get('/:id', (req, res) => {
  const f = get(`${SQL_FECHAMENTOS} WHERE f.id = ? GROUP BY f.id`, Number(req.params.id));
  if (!f) throw new HttpError(404, 'Fechamento não encontrado');
  const linhas = all(
    `SELECT fe.*, e.nome, e.veiculo, e.pix_tipo, e.pix_chave
     FROM fechamento_entregadores fe JOIN entregadores e ON e.id = fe.entregador_id
     WHERE fe.fechamento_id = ? ORDER BY e.nome`, f.id);
  res.json({ ...f, linhas });
});

fechamentos.post('/:id/pagar', (req, res) => {
  const { entregador_ids, pago_em, forma_pagamento } = req.body;
  const ids = Array.isArray(entregador_ids) ? entregador_ids.map(Number) : null;
  const pendentes = all("SELECT * FROM fechamento_entregadores WHERE fechamento_id = ? AND status = 'pendente'", Number(req.params.id))
    .filter(l => !ids || ids.includes(l.entregador_id));
  transaction(() => pendentes.forEach(l => run(
    "UPDATE fechamento_entregadores SET status = 'pago', pago_em = ?, forma_pagamento = ? WHERE id = ?",
    pago_em || hoje(), forma_pagamento || 'Pix', l.id,
  )));
  res.json({ pagos: pendentes.length });
});

fechamentos.post('/:id/estornar', (req, res) => {
  run(`UPDATE fechamento_entregadores SET status = 'pendente', pago_em = NULL, forma_pagamento = NULL
       WHERE fechamento_id = ? AND entregador_id = ?`, Number(req.params.id), Number(req.body.entregador_id));
  res.json({ ok: true });
});

fechamentos.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (scalar("SELECT COUNT(*) FROM fechamento_entregadores WHERE fechamento_id = ? AND status = 'pago'", id)) {
    throw new HttpError(409, 'Há pagamentos registrados neste fechamento. Estorne-os antes de excluir.');
  }
  run('DELETE FROM fechamentos WHERE id = ?', id);
  res.status(204).end();
});

fechamentos.get('/:id/recibo/:entregador', (req, res) => {
  res.json(recibo(Number(req.params.id), Number(req.params.entregador)));
});
api.use('/fechamentos', fechamentos);

/* -------------------------------------------------------------- Dashboard */

api.get('/dashboard', (req, res) => {
  const hj = hoje();
  const mes = mesValido(req.query.mes) ? req.query.mes : hj.slice(0, 7);
  const ano = String(req.query.ano || mes.slice(0, 4));

  const emAbertoProducao = scalar('SELECT COALESCE(SUM(total),0) FROM lancamentos WHERE fechamento_id IS NULL');
  const emAbertoAjustes = scalar("SELECT COALESCE(SUM(CASE WHEN tipo IN ('bonus','reembolso') THEN valor ELSE -valor END),0) FROM ajustes WHERE fechamento_id IS NULL");
  const pendentePagamento = scalar("SELECT COALESCE(SUM(liquido),0) FROM fechamento_entregadores WHERE status = 'pendente'");

  const financeiro = {
    producao_mes: scalar('SELECT COALESCE(SUM(total),0) FROM lancamentos WHERE substr(data,1,7) = ?', mes),
    pago_mes: scalar("SELECT COALESCE(SUM(liquido),0) FROM fechamento_entregadores WHERE status = 'pago' AND substr(pago_em,1,7) = ?", mes),
    adiantamentos_mes: scalar("SELECT COALESCE(SUM(valor),0) FROM ajustes WHERE tipo = 'adiantamento' AND substr(data,1,7) = ?", mes),
    descontos_mes: scalar("SELECT COALESCE(SUM(valor),0) FROM ajustes WHERE tipo = 'desconto' AND substr(data,1,7) = ?", mes),
    creditos_mes: scalar("SELECT COALESCE(SUM(valor),0) FROM ajustes WHERE tipo IN ('bonus','reembolso') AND substr(data,1,7) = ?", mes),
    producao_hoje: scalar('SELECT COALESCE(SUM(total),0) FROM lancamentos WHERE data = ?', hj),
    em_aberto: r2(emAbertoProducao + emAbertoAjustes),
    pendente_pagamento: pendentePagamento,
    a_repassar: r2(emAbertoProducao + emAbertoAjustes + pendentePagamento),
  };

  const porServico = all(
    `SELECT i.servico, i.unidade, SUM(i.quantidade) AS quantidade, SUM(i.subtotal) AS valor
     FROM lancamento_itens i JOIN lancamentos l ON l.id = i.lancamento_id
     WHERE substr(l.data,1,7) = ? GROUP BY i.servico ORDER BY valor DESC`, mes);
  const porVeiculo = all(
    `SELECT l.veiculo, COUNT(*) AS dias, SUM(l.total) AS valor,
       (SELECT COALESCE(SUM(i.quantidade),0) FROM lancamento_itens i JOIN lancamentos l2 ON l2.id = i.lancamento_id
         WHERE l2.veiculo = l.veiculo AND substr(l2.data,1,7) = ? AND i.unidade = 'un') AS quantidade
     FROM lancamentos l WHERE substr(l.data,1,7) = ? GROUP BY l.veiculo`, mes, mes);

  const operacional = {
    entregadores_ativos: scalar("SELECT COUNT(*) FROM entregadores WHERE status = 'ativo'"),
    entregadores_mes: scalar('SELECT COUNT(DISTINCT entregador_id) FROM lancamentos WHERE substr(data,1,7) = ?', mes),
    dias_trabalhados: scalar('SELECT COUNT(*) FROM lancamentos WHERE substr(data,1,7) = ?', mes),
    entregas: scalar(`SELECT COALESCE(SUM(i.quantidade),0) FROM lancamento_itens i JOIN lancamentos l ON l.id = i.lancamento_id
                      WHERE substr(l.data,1,7) = ? AND i.unidade = 'un'`, mes),
    diarias: scalar(`SELECT COALESCE(SUM(i.quantidade),0) FROM lancamento_itens i JOIN lancamentos l ON l.id = i.lancamento_id
                     WHERE substr(l.data,1,7) = ? AND i.unidade = 'dia'`, mes),
    lancado_hoje: scalar('SELECT COUNT(*) FROM lancamentos WHERE data = ?', hj),
  };
  operacional.media_dia = operacional.dias_trabalhados ? r2(financeiro.producao_mes / operacional.dias_trabalhados) : 0;

  const ranking = all(
    `SELECT e.id, e.nome, e.veiculo, COUNT(l.id) AS dias, COALESCE(SUM(l.total),0) AS valor,
       (SELECT COALESCE(SUM(i.quantidade),0) FROM lancamento_itens i JOIN lancamentos l2 ON l2.id = i.lancamento_id
         WHERE l2.entregador_id = e.id AND substr(l2.data,1,7) = ? AND i.unidade = 'un') AS quantidade
     FROM entregadores e JOIN lancamentos l ON l.entregador_id = e.id AND substr(l.data,1,7) = ?
     GROUP BY e.id ORDER BY valor DESC`, mes, mes);

  const diario = all(
    `SELECT l.data, SUM(l.total) AS valor, COUNT(*) AS entregadores,
       (SELECT COALESCE(SUM(i.quantidade),0) FROM lancamento_itens i JOIN lancamentos l2 ON l2.id = i.lancamento_id
         WHERE l2.data = l.data AND i.unidade = 'un') AS quantidade
     FROM lancamentos l WHERE substr(l.data,1,7) = ? GROUP BY l.data ORDER BY l.data`, mes);

  const pendentes = all(
    `SELECT f.id, f.inicio, f.fim, COUNT(*) AS entregadores, SUM(fe.liquido) AS valor
     FROM fechamentos f JOIN fechamento_entregadores fe ON fe.fechamento_id = f.id AND fe.status = 'pendente'
     GROUP BY f.id ORDER BY f.fim`);
  const ultimoFechamento = get('SELECT MAX(fim) AS fim FROM fechamentos')?.fim || null;

  const anual = Array.from({ length: 12 }, (_, i) => {
    const m = `${ano}-${String(i + 1).padStart(2, '0')}`;
    return {
      mes: m,
      producao: scalar('SELECT COALESCE(SUM(total),0) FROM lancamentos WHERE substr(data,1,7) = ?', m),
      pago: scalar("SELECT COALESCE(SUM(liquido),0) FROM fechamento_entregadores WHERE status = 'pago' AND substr(pago_em,1,7) = ?", m),
      adiantamentos: scalar("SELECT COALESCE(SUM(valor),0) FROM ajustes WHERE tipo = 'adiantamento' AND substr(data,1,7) = ?", m),
    };
  });

  res.json({ mes, ano, hoje: hj, financeiro, operacional, porServico, porVeiculo, ranking, diario, pendentes, ultimoFechamento, anual });
});

/* ------------------------------------------------------------- Relatórios */

const col = (key, label, tipo = 'texto') => ({ key, label, tipo });
const soma = (linhas, k) => r2(linhas.reduce((a, l) => a + (l[k] || 0), 0));

const relatorios = {
  producao_entregador: {
    titulo: 'Produção e repasse por entregador',
    gerar: ({ de, ate, entregador_id }) => {
      const base = resumoPorEntregador(de, ate, { abertos: false, entregadorId: entregador_id });
      const servicos = all(
        `SELECT DISTINCT i.servico FROM lancamento_itens i JOIN lancamentos l ON l.id = i.lancamento_id
         WHERE l.data BETWEEN ? AND ? ORDER BY i.servico`, de, ate).map(s => s.servico);
      const qtd = all(
        `SELECT l.entregador_id, i.servico, SUM(i.quantidade) AS q FROM lancamento_itens i JOIN lancamentos l ON l.id = i.lancamento_id
         WHERE l.data BETWEEN ? AND ? GROUP BY l.entregador_id, i.servico`, de, ate);
      const linhas = base.map(b => {
        const l = { entregador: b.nome, veiculo: b.veiculo, dias: b.dias };
        servicos.forEach(s => { l[`s_${s}`] = qtd.find(x => x.entregador_id === b.entregador_id && x.servico === s)?.q || 0; });
        return { ...l, producao: b.producao, creditos: b.creditos, debitos: -b.debitos, liquido: b.liquido };
      });
      const colunas = [col('entregador', 'Entregador'), col('veiculo', 'Veículo'), col('dias', 'Dias', 'numero'),
        ...servicos.map(s => col(`s_${s}`, s, 'numero')),
        col('producao', 'Produção (R$)', 'moeda'), col('creditos', 'Créditos (R$)', 'moeda'), col('debitos', 'Vales/desc. (R$)', 'moeda'), col('liquido', 'Líquido (R$)', 'moeda')];
      const totais = { entregador: `${linhas.length} entregadores` };
      ['dias', ...servicos.map(s => `s_${s}`), 'producao', 'creditos', 'debitos', 'liquido'].forEach(k => { totais[k] = soma(linhas, k); });
      return { colunas, linhas, totais };
    },
  },
  producao_servico: {
    titulo: 'Produção por serviço e veículo',
    gerar: ({ de, ate, entregador_id }) => {
      const linhas = all(
        `SELECT i.servico, l.veiculo, i.valor_unit, SUM(i.quantidade) AS quantidade, SUM(i.subtotal) AS valor
         FROM lancamento_itens i JOIN lancamentos l ON l.id = i.lancamento_id
         WHERE l.data BETWEEN ? AND ? AND (? IS NULL OR l.entregador_id = ?)
         GROUP BY i.servico, l.veiculo, i.valor_unit ORDER BY valor DESC`, de, ate, entregador_id, entregador_id);
      return {
        colunas: [col('servico', 'Serviço'), col('veiculo', 'Veículo'), col('valor_unit', 'Valor unitário (R$)', 'moeda'),
          col('quantidade', 'Quantidade', 'numero'), col('valor', 'Total (R$)', 'moeda')],
        linhas,
        totais: { servico: 'Total', quantidade: soma(linhas, 'quantidade'), valor: soma(linhas, 'valor') },
      };
    },
  },
  producao_diaria: {
    titulo: 'Produção diária',
    gerar: ({ de, ate, entregador_id }) => {
      const linhas = all(
        `SELECT l.data, COUNT(*) AS entregadores,
           SUM((SELECT COALESCE(SUM(quantidade),0) FROM lancamento_itens WHERE lancamento_id = l.id AND unidade = 'un')) AS quantidade,
           SUM((SELECT COALESCE(SUM(quantidade),0) FROM lancamento_itens WHERE lancamento_id = l.id AND unidade = 'dia')) AS diarias,
           SUM(l.total) AS valor
         FROM lancamentos l WHERE l.data BETWEEN ? AND ? AND (? IS NULL OR l.entregador_id = ?)
         GROUP BY l.data ORDER BY l.data`, de, ate, entregador_id, entregador_id);
      return {
        colunas: [col('data', 'Data', 'data'), col('entregadores', 'Entregadores', 'numero'), col('quantidade', 'Itens entregues', 'numero'),
          col('diarias', 'Diárias', 'numero'), col('valor', 'Produção (R$)', 'moeda')],
        linhas,
        totais: { data: `${linhas.length} dias`, quantidade: soma(linhas, 'quantidade'), diarias: soma(linhas, 'diarias'), valor: soma(linhas, 'valor') },
      };
    },
  },
  extrato: {
    titulo: 'Extrato do entregador',
    precisaEntregador: true,
    gerar: ({ de, ate, entregador_id }) => {
      if (!entregador_id) return { colunas: [], linhas: [], aviso: 'Selecione um entregador para ver o extrato.' };
      const anterior = r2(
        scalar('SELECT COALESCE(SUM(total),0) FROM lancamentos WHERE entregador_id = ? AND data < ?', entregador_id, de)
        + scalar("SELECT COALESCE(SUM(CASE WHEN tipo IN ('bonus','reembolso') THEN valor ELSE -valor END),0) FROM ajustes WHERE entregador_id = ? AND data < ?", entregador_id, de)
        - scalar("SELECT COALESCE(SUM(liquido),0) FROM fechamento_entregadores WHERE entregador_id = ? AND status = 'pago' AND pago_em < ?", entregador_id, de),
      );
      const movs = [
        ...all(`SELECT l.data, 'Produção' AS tipo,
                  (SELECT group_concat(CAST(quantidade AS INTEGER) || ' ' || servico, ' · ') FROM lancamento_itens WHERE lancamento_id = l.id) AS descricao,
                  l.total AS valor FROM lancamentos l WHERE l.entregador_id = ? AND l.data BETWEEN ? AND ?`, entregador_id, de, ate),
        ...all(`SELECT data, tipo, descricao, CASE WHEN tipo IN ('bonus','reembolso') THEN valor ELSE -valor END AS valor
                FROM ajustes WHERE entregador_id = ? AND data BETWEEN ? AND ?`, entregador_id, de, ate)
          .map(a => ({ ...a, tipo: TIPOS_AJUSTE[a.tipo]?.label || a.tipo })),
        ...all(`SELECT fe.pago_em AS data, 'Pagamento' AS tipo,
                  'Fechamento ' || strftime('%d/%m', f.inicio) || ' a ' || strftime('%d/%m/%Y', f.fim) || ' (' || COALESCE(fe.forma_pagamento,'') || ')' AS descricao,
                  -fe.liquido AS valor
                FROM fechamento_entregadores fe JOIN fechamentos f ON f.id = fe.fechamento_id
                WHERE fe.entregador_id = ? AND fe.status = 'pago' AND fe.pago_em BETWEEN ? AND ?`, entregador_id, de, ate),
      ].sort((a, b) => a.data.localeCompare(b.data) || (a.tipo === 'Pagamento') - (b.tipo === 'Pagamento'));
      let saldo = anterior;
      const linhas = [{ data: de, tipo: 'Saldo anterior', descricao: 'Valores ainda não pagos antes do período', valor: null, saldo: anterior },
        ...movs.map(m => { saldo = r2(saldo + m.valor); return { ...m, saldo }; })];
      return {
        colunas: [col('data', 'Data', 'data'), col('tipo', 'Tipo'), col('descricao', 'Descrição'), col('valor', 'Valor (R$)', 'moeda'), col('saldo', 'Saldo a receber (R$)', 'moeda')],
        linhas,
        totais: { tipo: 'Saldo final', saldo },
      };
    },
  },
  ajustes: {
    titulo: 'Vales, descontos e bônus',
    gerar: ({ de, ate, entregador_id }) => {
      const linhas = all(
        `SELECT a.data, e.nome AS entregador, a.tipo, a.descricao,
           CASE WHEN a.tipo IN ('bonus','reembolso') THEN a.valor ELSE -a.valor END AS valor,
           CASE WHEN a.fechamento_id IS NULL THEN 'aberto' ELSE 'fechado' END AS situacao
         FROM ajustes a JOIN entregadores e ON e.id = a.entregador_id
         WHERE a.data BETWEEN ? AND ? AND (? IS NULL OR a.entregador_id = ?) ORDER BY a.data`, de, ate, entregador_id, entregador_id)
        .map(l => ({ ...l, tipo: TIPOS_AJUSTE[l.tipo]?.label || l.tipo }));
      return {
        colunas: [col('data', 'Data', 'data'), col('entregador', 'Entregador'), col('tipo', 'Tipo'), col('descricao', 'Descrição'),
          col('situacao', 'Situação', 'status'), col('valor', 'Valor (R$)', 'moeda')],
        linhas,
        totais: { data: `${linhas.length} lançamentos`, valor: soma(linhas, 'valor') },
      };
    },
  },
  pagamentos: {
    titulo: 'Pagamentos realizados',
    gerar: ({ de, ate, entregador_id }) => {
      const linhas = all(
        `SELECT fe.pago_em, e.nome AS entregador, f.inicio, f.fim, fe.forma_pagamento, e.pix_chave,
                fe.producao, fe.creditos, -fe.debitos AS debitos, fe.liquido
         FROM fechamento_entregadores fe JOIN fechamentos f ON f.id = fe.fechamento_id JOIN entregadores e ON e.id = fe.entregador_id
         WHERE fe.status = 'pago' AND fe.pago_em BETWEEN ? AND ? AND (? IS NULL OR fe.entregador_id = ?)
         ORDER BY fe.pago_em, e.nome`, de, ate, entregador_id, entregador_id);
      return {
        colunas: [col('pago_em', 'Pago em', 'data'), col('entregador', 'Entregador'), col('inicio', 'Período de', 'data'), col('fim', 'até', 'data'),
          col('forma_pagamento', 'Forma'), col('pix_chave', 'Chave Pix'), col('producao', 'Produção (R$)', 'moeda'),
          col('creditos', 'Créditos (R$)', 'moeda'), col('debitos', 'Vales/desc. (R$)', 'moeda'), col('liquido', 'Pago (R$)', 'moeda')],
        linhas,
        totais: { pago_em: `${linhas.length} pagamentos`, producao: soma(linhas, 'producao'), creditos: soma(linhas, 'creditos'), debitos: soma(linhas, 'debitos'), liquido: soma(linhas, 'liquido') },
      };
    },
  },
  mensal: {
    titulo: 'Resumo financeiro mensal',
    gerar: ({ de, ate }) => {
      const linhas = [];
      for (let m = de.slice(0, 7); m <= ate.slice(0, 7); m = addMeses(m, 1)) {
        const producao = scalar('SELECT COALESCE(SUM(total),0) FROM lancamentos WHERE substr(data,1,7) = ?', m);
        const creditos = scalar("SELECT COALESCE(SUM(valor),0) FROM ajustes WHERE tipo IN ('bonus','reembolso') AND substr(data,1,7) = ?", m);
        const debitos = scalar("SELECT COALESCE(SUM(valor),0) FROM ajustes WHERE tipo IN ('adiantamento','desconto') AND substr(data,1,7) = ?", m);
        const pago = scalar("SELECT COALESCE(SUM(liquido),0) FROM fechamento_entregadores WHERE status = 'pago' AND substr(pago_em,1,7) = ?", m);
        const entregas = scalar(`SELECT COALESCE(SUM(i.quantidade),0) FROM lancamento_itens i JOIN lancamentos l ON l.id = i.lancamento_id
                                 WHERE substr(l.data,1,7) = ? AND i.unidade = 'un'`, m);
        linhas.push({ mes: `${m.slice(5)}/${m.slice(0, 4)}`, entregas, producao, creditos, debitos: -debitos, custo: r2(producao + creditos), pago });
      }
      return {
        colunas: [col('mes', 'Mês'), col('entregas', 'Itens entregues', 'numero'), col('producao', 'Produção (R$)', 'moeda'),
          col('creditos', 'Bônus/reemb. (R$)', 'moeda'), col('debitos', 'Vales/desc. (R$)', 'moeda'),
          col('custo', 'Custo com entregadores (R$)', 'moeda'), col('pago', 'Pago no mês (R$)', 'moeda')],
        linhas,
        totais: { mes: 'Total', entregas: soma(linhas, 'entregas'), producao: soma(linhas, 'producao'), creditos: soma(linhas, 'creditos'),
          debitos: soma(linhas, 'debitos'), custo: soma(linhas, 'custo'), pago: soma(linhas, 'pago') },
      };
    },
  },
};

api.get('/relatorios', (req, res) => {
  res.json(Object.entries(relatorios).map(([id, r]) => ({ id, titulo: r.titulo, precisaEntregador: !!r.precisaEntregador })));
});

api.get('/relatorios/:tipo', (req, res) => {
  const rel = relatorios[req.params.tipo];
  if (!rel) throw new HttpError(404, 'Relatório não encontrado');
  const hj = hoje();
  const params = {
    de: dataValida(req.query.de) ? req.query.de : `${hj.slice(0, 7)}-01`,
    ate: dataValida(req.query.ate) ? req.query.ate : hj,
    entregador_id: req.query.entregador_id ? Number(req.query.entregador_id) : null,
  };
  res.json({ titulo: rel.titulo, filtros: params, ...rel.gerar(params) });
});
