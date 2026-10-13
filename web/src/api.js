const TOKEN_KEY = 'wx_token';
const USER_KEY = 'wx_usuario';

export const sessao = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  get usuario() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
  },
  salvar(token, usuario) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(usuario));
  },
  limpar() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

export async function api(path, { method = 'GET', body } = {}) {
  const token = sessao.token;
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && token) {
    sessao.limpar();
    window.location.href = '/login';
    throw new Error('Sessão expirada');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.erro || `Erro ${res.status}`);
  return data;
}

export const qs = obj => {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => v !== '' && v != null && p.append(k, v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

// Cache simples para listas usadas em selects
const cache = new Map();
export function carregarOpcoes(endpoint) {
  if (!cache.has(endpoint)) {
    cache.set(endpoint, api(endpoint).catch(e => { cache.delete(endpoint); throw e; }));
  }
  return cache.get(endpoint);
}
export function invalidarOpcoes(prefixo) {
  for (const k of cache.keys()) if (k.startsWith(prefixo)) cache.delete(k);
}
