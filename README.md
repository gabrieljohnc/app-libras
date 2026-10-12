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

## Reconhecimento pela câmera

A página `/reconhecer` liga a webcam e tenta adivinhar o sinal ao vivo, tudo no navegador: o MediaPipe acha os pontos das mãos e do corpo, e um modelo ONNX de 2 MB (`public/libras/modelo.onnx`, 715 sinais) classifica o movimento. Nenhum vídeo sai do aparelho. Em `lib/reconhecimento/` ficam as features e a classe `ReconhecedorLibras`; o treino e a explicação de como refazer o modelo estão na pasta `reconhecimento/` do projeto.

Precisão medida em vídeos de pessoas que o modelo não viu: 19% de primeira e 31% entre os 5 palpites. Gravar 2 ou 3 exemplos seus de um sinal (botão "Gravar") melhora o reconhecimento para você.
