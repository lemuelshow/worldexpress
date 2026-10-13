import { Router } from 'express';
import { db, all, get } from './db.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const numerico = v => (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v);

/**
 * Gera um router REST (listar, obter, criar, alterar, excluir) para uma tabela.
 * - view: SELECT usado na leitura (permite joins e colunas calculadas)
 * - search: colunas usadas na busca textual (?q=)
 * - filters: colunas filtráveis por igualdade (?coluna=valor)
 * - dateField: coluna usada no filtro de período (?de=&ate=)
 */
export function crud({
  table, fields, json = [], view, search = [], filters = [], dateField,
  orderBy = 'id DESC', required = [], beforeSave, afterSave, beforeDelete,
}) {
  const r = Router();
  const base = view || `SELECT * FROM ${table}`;

  const parse = row => {
    if (!row) return row;
    for (const f of json) row[f] = row[f] ? JSON.parse(row[f]) : [];
    return row;
  };
  const obter = id => parse(get(`SELECT * FROM (${base}) t WHERE id = ?`, Number(id)));

  const pick = body => {
    const o = {};
    for (const f of fields) {
      if (!(f in body)) continue;
      let v = body[f];
      if (json.includes(f)) v = JSON.stringify(v ?? []);
      else if (v === undefined || v === '') v = null;
      else if (typeof v === 'boolean') v = v ? 1 : 0;
      o[f] = v;
    }
    return o;
  };

  r.get('/', (req, res) => {
    const where = [];
    const params = [];
    const q = req.query.q?.trim();
    if (q && search.length) {
      where.push(`(${search.map(s => `${s} LIKE ?`).join(' OR ')})`);
      search.forEach(() => params.push(`%${q}%`));
    }
    for (const f of filters) {
      const v = req.query[f];
      if (v != null && v !== '') {
        where.push(`${f} = ?`);
        params.push(numerico(v));
      }
    }
    if (dateField && req.query.de) { where.push(`${dateField} >= ?`); params.push(req.query.de); }
    if (dateField && req.query.ate) { where.push(`${dateField} <= ?`); params.push(req.query.ate); }
    const sql = `SELECT * FROM (${base}) t ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${orderBy}`;
    res.json(all(sql, ...params).map(parse));
  });

  r.get('/:id', (req, res) => {
    const row = obter(req.params.id);
    if (!row) throw new HttpError(404, 'Registro não encontrado');
    res.json(row);
  });

  r.post('/', (req, res) => {
    const faltando = required.filter(f => req.body[f] == null || req.body[f] === '');
    if (faltando.length) throw new HttpError(400, `Campos obrigatórios: ${faltando.join(', ')}`);
    const data = pick(req.body);
    beforeSave?.(data, req.body, null);
    const cols = Object.keys(data);
    const info = db
      .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
      .run(...cols.map(c => data[c]));
    const row = obter(info.lastInsertRowid);
    afterSave?.(row, req.body, null);
    res.status(201).json(obter(row.id));
  });

  r.put('/:id', (req, res) => {
    const atual = obter(req.params.id);
    if (!atual) throw new HttpError(404, 'Registro não encontrado');
    const data = pick(req.body);
    beforeSave?.(data, req.body, atual);
    const cols = Object.keys(data);
    if (cols.length) {
      db.prepare(`UPDATE ${table} SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`)
        .run(...cols.map(c => data[c]), atual.id);
    }
    const row = obter(atual.id);
    afterSave?.(row, req.body, atual);
    res.json(obter(atual.id));
  });

  r.delete('/:id', (req, res) => {
    const atual = obter(req.params.id);
    if (!atual) throw new HttpError(404, 'Registro não encontrado');
    beforeDelete?.(atual);
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(atual.id);
    res.status(204).end();
  });

  r.obter = obter;
  return r;
}
