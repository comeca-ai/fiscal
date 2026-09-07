# fiscal — Passaporte Fiscal + Rede de Créditos

Monorepo do Projeto v2: **um repo, dois deploys, dois CNPJs.**

| App | Papel | Status |
|---|---|---|
| [`apps/p1-passaporte`](apps/p1-passaporte) | **P1 · Plataforma Fiscal** — calculadora de deságio + Passaporte assinado (Ed25519) com ruleset determinístico e rating A/B/C | **no ar** → https://passaporte-fiscal.jhonata-emerick.workers.dev |
| [`apps/p2-rede`](apps/p2-rede) | **P2 · Rede de Créditos** — rede privada que só consome passaportes do P1 | placeholder (liga com ≥3 passaportes A/B + Gate 0) |

## Tese em uma frase
O crédito de ICMS vira um **ativo padronizado** — o *Passaporte Fiscal*, um dossiê assinado, reproduzível e com rating — numa janela regulatória (EC 132 / LC 214) que torna a homologação urgente: crédito não homologado a tempo vira recebível de 20 anos.

## Documentos
- `docs/Especificacao-Final-v1.0.{pdf,docx}` — **a fonte única**: decisões travadas, gates, contrato do passaporte, sequência de 10 semanas
- `docs/Plano-Fase-0.pdf` — as duas trilhas em paralelo (descoberta P1 + Gate 0 P2)
- `docs/Arquitetura-Passaporte-Rede.pdf` — o diagrama (P1 → Passaporte → P2; SEFAZ fora)
- `docs/Sketch-Telas-P1-P2.pdf` — wireframes das telas principais
- `docs/archive/` — spec v0.1 original e a contraproposta v2 (superadas pela v1.0)

## Rodar o P1
```bash
cd apps/p1-passaporte
npm install
npm test          # 4 provas: determinismo, ruleset, pricing, assinatura
npm run dev       # http://127.0.0.1:8787
npm run deploy    # precisa de CLOUDFLARE_API_TOKEN + secret SIGNING_KEY_JWK (ver README do app)
```

## Arquitetura (resumo)
Cloudflare-first mínimo: Workers + D1 + R2 + Queues. Sem Durable Objects, sem Containers, sem multi-tenancy no MVP. O motor de regras é função pura; o **Passaporte assinado é o único contrato P1→P2** — o P2 nunca acessa os dados do P1. A homologação vive fora, na SEFAZ: a plataforma prepara e atesta, nunca homologa.

## Próximos passos
1. **Gate 0 jurídico** (papel da empresa, rota art. 73/84, parecer LC 214) — o único caminho crítico antes de escalar.
2. Plugar **D1** (índice de passaportes) e **R2** (documentos com hash) no P1.
3. P2 só liga com ≥3 passaportes rating A/B reais.
