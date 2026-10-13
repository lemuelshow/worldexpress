import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRouter, autenticar } from './auth.js';
import { api } from './routes.js';
import { seedSeVazio } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3334);

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api', autenticar, api);
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));

// Em produção, o backend também serve o build do React
const web = path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(web)) {
  app.use(express.static(web));
  app.get('*', (req, res) => res.sendFile(path.join(web, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ erro: err.message });
  if (/FOREIGN KEY/i.test(err.message)) return res.status(409).json({ erro: 'Registro vinculado a outros dados e não pode ser excluído.' });
  if (/UNIQUE/i.test(err.message)) return res.status(409).json({ erro: 'Já existe um registro com esses dados.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido' });
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
});

if (seedSeVazio()) console.log('Banco criado com dados de demonstração (admin@worldexpress.com / admin123).');
app.listen(PORT, () => console.log(`WorldExpress API em http://localhost:${PORT}`));
