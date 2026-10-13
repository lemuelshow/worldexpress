import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(process.env.DB_FILE || path.join(dataDir, 'worldexpress.db'));
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  perfil TEXT NOT NULL DEFAULT 'operador',
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS entregadores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  cpf TEXT,
  telefone TEXT,
  email TEXT,
  veiculo TEXT NOT NULL DEFAULT 'carro',
  modelo_veiculo TEXT,
  placa TEXT,
  pix_tipo TEXT,
  pix_chave TEXT,
  admissao TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  observacoes TEXT
);

-- Valor repassado ao entregador por item (ou por dia, na diária), conforme o veículo
CREATE TABLE IF NOT EXISTS tabela_precos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  servico TEXT NOT NULL,
  veiculo TEXT NOT NULL DEFAULT 'todos',
  unidade TEXT NOT NULL DEFAULT 'un',
  valor REAL NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  UNIQUE (servico, veiculo)
);

CREATE TABLE IF NOT EXISTS fechamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inicio TEXT NOT NULL,
  fim TEXT NOT NULL,
  descricao TEXT,
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);

-- Produção de um entregador em um dia
CREATE TABLE IF NOT EXISTS lancamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entregador_id INTEGER NOT NULL REFERENCES entregadores(id),
  data TEXT NOT NULL,
  veiculo TEXT NOT NULL,
  total REAL NOT NULL DEFAULT 0,
  observacoes TEXT,
  fechamento_id INTEGER REFERENCES fechamentos(id) ON DELETE SET NULL,
  criado_em TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE (entregador_id, data)
);

-- Itens do lançamento: o valor unitário é gravado no momento (histórico preservado se a tabela mudar)
CREATE TABLE IF NOT EXISTS lancamento_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lancamento_id INTEGER NOT NULL REFERENCES lancamentos(id) ON DELETE CASCADE,
  servico TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT 'un',
  quantidade REAL NOT NULL,
  valor_unit REAL NOT NULL,
  subtotal REAL NOT NULL
);

-- Vales, descontos, bônus e reembolsos
CREATE TABLE IF NOT EXISTS ajustes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entregador_id INTEGER NOT NULL REFERENCES entregadores(id),
  data TEXT NOT NULL,
  tipo TEXT NOT NULL,
  descricao TEXT,
  valor REAL NOT NULL,
  fechamento_id INTEGER REFERENCES fechamentos(id) ON DELETE SET NULL,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS fechamento_entregadores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fechamento_id INTEGER NOT NULL REFERENCES fechamentos(id) ON DELETE CASCADE,
  entregador_id INTEGER NOT NULL REFERENCES entregadores(id),
  dias INTEGER NOT NULL DEFAULT 0,
  quantidade REAL NOT NULL DEFAULT 0,
  diarias REAL NOT NULL DEFAULT 0,
  producao REAL NOT NULL DEFAULT 0,
  creditos REAL NOT NULL DEFAULT 0,
  debitos REAL NOT NULL DEFAULT 0,
  liquido REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente',
  pago_em TEXT,
  forma_pagamento TEXT,
  UNIQUE (fechamento_id, entregador_id)
);

CREATE INDEX IF NOT EXISTS ix_lanc_data ON lancamentos(data);
CREATE INDEX IF NOT EXISTS ix_itens_lanc ON lancamento_itens(lancamento_id);
CREATE INDEX IF NOT EXISTS ix_ajustes_data ON ajustes(data);
`);

export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);
export const scalar = (sql, ...p) => {
  const row = get(sql, ...p);
  return row ? Object.values(row)[0] ?? 0 : 0;
};

// Transações aninhadas viram SAVEPOINTs (ex.: seed chamando criarFechamento)
let nivel = 0;
export function transaction(fn) {
  const sp = `sp${nivel}`;
  db.exec(nivel === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`);
  nivel++;
  try {
    const r = fn();
    nivel--;
    db.exec(nivel === 0 ? 'COMMIT' : `RELEASE ${sp}`);
    return r;
  } catch (e) {
    nivel--;
    db.exec(nivel === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
    throw e;
  }
}

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const hoje = () => iso(new Date());
export function addDias(data, n) {
  const [y, m, d] = data.split('-').map(Number);
  return iso(new Date(y, m - 1, d + n));
}
export function addMeses(mes, n) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export const diaSemana = data => {
  const [y, m, d] = data.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
};
