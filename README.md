# Sinaliza: app para estudar Libras

Pesquise uma palavra em português e veja o sinal em Libras, com vídeos reunidos de cinco dicionários (INES, Rede Surdos UFC, Spread the Sign, Libras Acadêmica UFF e UFV). Projeto pessoal de estudo, sem fins comerciais.

## Stack

- Next.js 15 (App Router) hospedado na Vercel
- Supabase (Postgres) com as tabelas `sinais` e `fontes` e as funções `buscar_sinais` e `listar_por_letra`

## Rodar localmente

```bash
cp .env.example .env.local   # preencha a chave publicável do Supabase
npm install
npm run dev
```

## Dados

`public/dados/sinais.json` e `public/dados/fontes.json` têm o catálogo completo (13.410 vídeos, 8.830 termos). Os vídeos continuam nas fontes de origem; o banco guarda só os links. `scripts/` tem o esquema SQLite e o script que montou o catálogo.
