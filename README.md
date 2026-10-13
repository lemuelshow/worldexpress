# WorldExpress

Controle de produção e pagamento de entregadores (entregas porta a porta) — Node.js (Express + SQLite nativo do Node 22) e React (Vite).

## Como rodar

Requisito: **Node.js 22.13+**.

```bash
npm run setup     # instala dependências
npm run dev       # API em http://localhost:3334 + web em http://localhost:5174
```

Produção (um único processo): `npm run build` e `npm start` → http://localhost:3334

Login de demonstração: `admin@worldexpress.com` / `admin123` (também `operador@worldexpress.com` / `operador123`).
O banco (`server/data/worldexpress.db`) é criado com ~5 meses de dados fictícios. Para recriar: `npm run seed`.

## Fluxo

1. **Tabela de preços** — valor repassado por item e por veículo (Encomenda carro R$ 4,00 / moto R$ 3,50; Cards carro R$ 2,00; Revistas/LPT carro R$ 2,00 / moto R$ 1,50; Diária R$ 150,00).
2. **Lançar produção** — planilha do dia: quantidade de cada serviço por entregador; o valor é calculado na hora (Enter pula para o próximo).
3. **Vales e ajustes** — adiantamentos e descontos (subtraem), bônus e reembolsos (somam).
4. **Fechamentos** — escolhe o período (semana, quinzena, mês), confere a prévia e gera o valor líquido de cada entregador. A produção do período fica bloqueada.
5. **Pagamento** — registra o pagamento (Pix, transferência, dinheiro) individual ou de todos, com **recibo** para impressão e assinatura.
6. **Relatórios** — produção por entregador, por serviço/veículo, diária, extrato do entregador, vales/ajustes, pagamentos e resumo mensal (CSV e impressão).

O valor unitário é gravado em cada lançamento: mudar a tabela de preços não altera o histórico.
