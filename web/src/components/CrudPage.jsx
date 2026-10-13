import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, carregarOpcoes, invalidarOpcoes, qs } from '../api.js';
import { Card, Empty, Loading, PageHeader, useToast } from './ui.jsx';
import FormModal from './FormModal.jsx';

function FiltroSelect({ filtro, value, onChange }) {
  const [ops, setOps] = useState(filtro.options || []);
  useEffect(() => {
    if (filtro.source) carregarOpcoes(filtro.source.endpoint)
      .then(rows => setOps(rows.map(r => ({ value: r.id, label: r[filtro.source.label || 'nome'] })))).catch(() => {});
  }, [filtro]);
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value)} aria-label={filtro.label}>
      <option value="">{filtro.label}: todos</option>
      {ops.map(o => (typeof o === 'object'
        ? <option key={o.value} value={o.value}>{o.label}</option>
        : <option key={o} value={o}>{o}</option>))}
    </select>
  );
}

const POR_PAGINA = 50;

/**
 * Página genérica de cadastro: busca, filtros, tabela (ou visualização própria) e formulário em modal.
 */
export default function CrudPage({
  title, subtitle, endpoint, columns, fields, defaults = {}, filters = [], rowActions, renderList,
  newLabel = 'Novo', formTitle = title, onFieldChange, toEdit, toolbar, summary, canDelete = true,
  canCreate = true, reloadKey, initialFilters = {}, emptyText,
}) {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [f, setF] = useState(() => {
    const base = { ...initialFilters };
    filters.forEach(fl => { if (params.get(fl.name)) base[fl.name] = params.get(fl.name); });
    return base;
  });
  const [editando, setEditando] = useState(null);
  const [limite, setLimite] = useState(POR_PAGINA);

  useEffect(() => setLimite(POR_PAGINA), [q, f]);

  const load = useCallback(async () => {
    try {
      setRows(await api(`${endpoint}${qs({ q, ...f })}`));
    } catch (e) {
      toast(e.message, 'erro');
      setRows([]);
    }
  }, [endpoint, q, f, toast]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, reloadKey]);

  useEffect(() => {
    if (params.get('nova') && canCreate) {
      setEditando({ ...defaults });
      params.delete('nova');
      setParams(params, { replace: true });
    }
  }, [params, setParams, defaults, canCreate]);

  const abrirEdicao = useCallback(row => setEditando(toEdit ? toEdit(row) : { ...row }), [toEdit]);

  const salvar = async payload => {
    const novo = !editando.id;
    await api(novo ? endpoint : `${endpoint}/${editando.id}`, { method: novo ? 'POST' : 'PUT', body: payload });
    invalidarOpcoes('/');
    setEditando(null);
    toast(novo ? 'Registro criado com sucesso' : 'Alterações salvas');
    load();
  };

  const excluir = async row => {
    if (!window.confirm('Confirma a exclusão deste registro?')) return;
    try {
      await api(`${endpoint}/${row.id}`, { method: 'DELETE' });
      invalidarOpcoes('/');
      toast('Registro excluído');
      load();
    } catch (e) {
      toast(e.message, 'erro');
    }
  };

  const ctx = useMemo(() => ({ reload: load, edit: abrirEdicao, remove: excluir, toast }), [load, abrirEdicao]); // eslint-disable-line

  const visiveis = rows ? rows.slice(0, limite) : [];

  const tabela = rows && (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map(c => <th key={c.key} style={{ textAlign: c.align, width: c.width }}>{c.label}</th>)}
            <th className="col-actions">Ações</th>
          </tr>
        </thead>
        <tbody>
          {visiveis.map(row => (
            <tr key={row.id}>
              {columns.map(c => (
                <td key={c.key} data-label={c.label} style={{ textAlign: c.align }}>
                  {c.render ? c.render(row) : row[c.key] ?? '—'}
                </td>
              ))}
              <td className="col-actions">
                <div className="row-actions">
                  {rowActions?.(row, ctx)}
                  <button className="icon-btn" title="Editar" onClick={() => abrirEdicao(row)}><Pencil size={16} /></button>
                  {canDelete && <button className="icon-btn danger" title="Excluir" onClick={() => excluir(row)}><Trash2 size={16} /></button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <PageHeader title={title} subtitle={subtitle}>
        {toolbar?.(ctx)}
        {canCreate && (
          <button className="btn btn-success" onClick={() => setEditando({ ...defaults })}>
            <Plus size={18} /> {newLabel}
          </button>
        )}
      </PageHeader>

      {rows && summary?.(rows)}

      <Card pad={false}>
        <div className="filters">
          <div className="search">
            <Search size={16} />
            <input placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar" />
          </div>
          {filters.map(fl => (
            fl.type === 'date'
              ? (
                <label key={fl.name} className="filter-date">
                  <span>{fl.label}</span>
                  <input type="date" value={f[fl.name] || ''} onChange={e => setF({ ...f, [fl.name]: e.target.value })} />
                </label>
              )
              : <FiltroSelect key={fl.name} filtro={fl} value={f[fl.name]} onChange={v => setF({ ...f, [fl.name]: v })} />
          ))}
          {rows && <span className="muted count">{rows.length} registro(s)</span>}
        </div>
        {!rows ? <Loading /> : rows.length === 0 ? <Empty>{emptyText}</Empty> : renderList ? renderList(visiveis, ctx) : tabela}
        {rows && rows.length > limite && (
          <div className="more">
            <button className="btn btn-ghost" onClick={() => setLimite(l => l + POR_PAGINA)}>
              Mostrar mais ({rows.length - limite} restantes)
            </button>
          </div>
        )}
      </Card>

      <FormModal
        open={!!editando}
        title={editando?.id ? `Editar ${formTitle.toLowerCase()}` : `${newLabel}`}
        fields={fields}
        initial={editando}
        onClose={() => setEditando(null)}
        onSubmit={salvar}
        onFieldChange={onFieldChange}
      />
    </>
  );
}
