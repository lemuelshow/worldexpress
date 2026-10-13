import { useEffect, useMemo, useState } from 'react';
import { Modal } from './ui.jsx';
import { carregarOpcoes } from '../api.js';

/**
 * Formulário dinâmico em modal.
 * Campo: { name, label, type, required, options, source: { endpoint, label, filter(row, form) },
 *          full, help, show(form), placeholder, min, max, step }
 * type: text | email | tel | password | number | money | date | time | color | select | multiselect | textarea | checkbox
 */
export default function FormModal({ open, title, fields, initial, onClose, onSubmit, onFieldChange, size = 'lg', submitLabel = 'Salvar' }) {
  const [form, setForm] = useState({});
  const [sources, setSources] = useState({});
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ ...initial });
    setErro('');
    let ativo = true;
    const comFonte = fields.filter(f => f.source);
    Promise.all(comFonte.map(f => carregarOpcoes(f.source.endpoint).then(rows => [f.name, rows])))
      .then(pares => ativo && setSources(Object.fromEntries(pares)))
      .catch(e => ativo && setErro(e.message));
    return () => { ativo = false; };
  }, [open, initial, fields]);

  const set = (name, value) => {
    setForm(prev => {
      let next = { ...prev, [name]: value };
      const extra = onFieldChange?.(name, value, next, sources);
      if (extra) next = { ...next, ...extra };
      return next;
    });
  };

  const visiveis = useMemo(() => fields.filter(f => !f.show || f.show(form)), [fields, form]);

  const submit = async e => {
    e.preventDefault();
    setErro('');
    const payload = { ...form };
    for (const f of fields) {
      const v = payload[f.name];
      if (f.type === 'number' || f.type === 'money') payload[f.name] = v === '' || v == null ? null : Number(v);
      else if (f.type === 'select' && f.source) payload[f.name] = v === '' || v == null ? null : Number(v);
      else if (f.type === 'checkbox') payload[f.name] = !!v;
      else if (f.type === 'multiselect') payload[f.name] = (v || []).map(Number);
    }
    setSalvando(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  const opcoesDe = f => {
    if (f.source) {
      const rows = (sources[f.name] || []).filter(r => !f.source.filter || f.source.filter(r, form));
      const lbl = f.source.label || 'nome';
      return rows.map(r => ({ value: r.id, label: typeof lbl === 'function' ? lbl(r) : r[lbl] }));
    }
    const ops = typeof f.options === 'function' ? f.options(form) : f.options || [];
    return ops.map(o => (typeof o === 'object' ? o : { value: o, label: o }));
  };

  const renderCampo = f => {
    const v = form[f.name];
    const common = { id: `f-${f.name}`, name: f.name, required: f.required, disabled: f.disabled, placeholder: f.placeholder };
    switch (f.type) {
      case 'textarea':
        return <textarea {...common} rows={f.rows || 3} value={v ?? ''} onChange={e => set(f.name, e.target.value)} />;
      case 'select':
        return (
          <select {...common} value={v ?? ''} onChange={e => set(f.name, e.target.value)}>
            <option value="">{f.placeholder || 'Selecione…'}</option>
            {opcoesDe(f).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
      case 'multiselect': {
        const sel = (v || []).map(Number);
        const ops = opcoesDe(f);
        return (
          <div className="chips-select">
            {ops.length === 0 && <span className="muted">Nenhuma opção disponível</span>}
            {ops.map(o => {
              const on = sel.includes(Number(o.value));
              return (
                <button type="button" key={o.value} className={`chip ${on ? 'on' : ''}`}
                  onClick={() => set(f.name, on ? sel.filter(x => x !== Number(o.value)) : [...sel, Number(o.value)])}>
                  {o.label}
                </button>
              );
            })}
          </div>
        );
      }
      case 'checkbox':
        return (
          <label className="switch">
            <input type="checkbox" checked={!!v} onChange={e => set(f.name, e.target.checked)} />
            <span>{f.checkLabel || 'Sim'}</span>
          </label>
        );
      case 'money':
        return <input {...common} type="number" step="0.01" min="0" value={v ?? ''} onChange={e => set(f.name, e.target.value)} />;
      default:
        return <input {...common} type={f.type || 'text'} min={f.min} max={f.max} step={f.step}
          value={v ?? ''} onChange={e => set(f.name, e.target.value)} />;
    }
  };

  return (
    <Modal open={open} title={title} onClose={onClose} size={size}
      footer={(
        <>
          {erro && <span className="form-error">{erro}</span>}
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" form="crud-form" className="btn btn-primary" disabled={salvando}>
            {salvando ? 'Salvando…' : submitLabel}
          </button>
        </>
      )}>
      <form id="crud-form" className="form-grid" onSubmit={submit}>
        {visiveis.map(f => (
          <div key={f.name} className={`field ${f.full ? 'full' : ''} ${f.half ? 'half' : ''}`}>
            <label htmlFor={`f-${f.name}`}>{f.label}{f.required && <b className="req"> *</b>}</label>
            {renderCampo(f)}
            {f.help && <small className="muted">{typeof f.help === 'function' ? f.help(form) : f.help}</small>}
          </div>
        ))}
      </form>
    </Modal>
  );
}
