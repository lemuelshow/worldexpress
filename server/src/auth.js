import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { get } from './db.js';
import { HttpError } from './crud.js';

const SECRET = process.env.JWT_SECRET || 'worldexpress-dev-secret';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { email, senha } = req.body || {};
  const u = get('SELECT * FROM usuarios WHERE email = ? AND ativo = 1', String(email || '').toLowerCase().trim());
  if (!u || !bcrypt.compareSync(String(senha || ''), u.senha_hash)) {
    throw new HttpError(401, 'E-mail ou senha inválidos');
  }
  const usuario = { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil };
  const token = jwt.sign(usuario, SECRET, { expiresIn: '12h' });
  res.json({ token, usuario });
});

export function autenticar(req, res, next) {
  const [, token] = (req.headers.authorization || '').split(' ');
  try {
    req.usuario = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
  }
}

export function somenteAdmin(req, res, next) {
  if (req.usuario?.perfil !== 'admin') return res.status(403).json({ erro: 'Acesso restrito a administradores' });
  next();
}

authRouter.get('/me', autenticar, (req, res) => res.json(req.usuario));
