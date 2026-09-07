# Passaporte Fiscal — Worker MVP

Um único Cloudflare Worker com a fatia-assinatura do Projeto v2:

- **Calculadora de Valor do Crédito** (UI em `/`) — deságio justo `d* = 1 − V/VN`, com `V = VN·(1−g)·(1+i)^(−T)`, e o cenário "não homologou" da **LC 214/2025** (240 parcelas a valor presente).
- **Passaporte Fiscal assinado** — ruleset `BR-SP-CAT42@v2026.09` determinístico → achados → **rating A/B/C** → JSON canônico assinado com **Ed25519** (WebCrypto), verificável offline.

Sem D1/R2 de propósito: é compute puro. Persistência entra depois, no mesmo Worker.

## Endpoints

| Método | Rota | O que faz |
|---|---|---|
| GET | `/` | Calculadora (UI) |
| GET | `/api/health` | Status + versão do ruleset |
| GET | `/api/ruleset` | Ruleset e seu `ruleset_hash` (transparência) |
| GET | `/api/pubkey` | Chave pública Ed25519 (pra verificação por terceiros) |
| GET | `/api/desagio?vn=&rating=&i=&T=` | Motor de deságio (`vn` em R$, `i` decimal ao mês, `T` meses) |
| POST | `/api/passaporte` | Emite passaporte assinado + pricing a partir de um caso |
| POST | `/api/verify` | Verifica a assinatura de um passaporte |

### Exemplo

```bash
B=https://passaporte-fiscal.jhonata-emerick.workers.dev

curl "$B/api/desagio?vn=2500000&rating=A"

curl -X POST $B/api/passaporte -H 'content-type: application/json' -d '{
  "holder_org_id":"org_demo","jurisdiction":"BR-SP","credit_kind":"ICMS_ACCUMULATED",
  "state_registration":"123.456.789.000","amount_cents":250000000,
  "reference_period":{"from":"2025-01","to":"2025-12"},
  "documents":[{"kind":"efd_icms_ipi"},{"kind":"nfe_xml"},{"kind":"apuracao"},{"kind":"livro_registro"}]
}' > psp.json

curl -X POST $B/api/verify -H 'content-type: application/json' --data-binary @psp.json
# → {"valid":true}
```

## Garantias (provadas em `npm test`)

1. **Determinismo** — mesma entrada → mesmo `input_hash` e mesmo rating; `passport_id` deriva do `input_hash`.
2. **Ruleset versionado com hash** — `(input_hash, ruleset_hash) → saída` reproduzível por qualquer auditor.
3. **Pricing** — rating melhor ⇒ deságio menor; sem homologar, o crédito perde ~73% (a 1,5% a.m.).
4. **Assinatura** — Ed25519 válida; qualquer adulteração (até 1 centavo) invalida; chave errada é rejeitada.

## Rodar / publicar

```bash
npm install
npm test                      # 4 provas em Node 22 (mesmo WebCrypto do workerd)
npm run dev                   # http://127.0.0.1:8787

npm run gen-key > key.json    # NÃO versionar
node -e "process.stdout.write(JSON.stringify(require('./key.json').private_jwk))" \
  | npx wrangler secret put SIGNING_KEY_JWK
npm run deploy
```

Sem `SIGNING_KEY_JWK` o Worker usa uma chave **efêmera** (muda a cada isolate) — só pra demo. `/api/pubkey` avisa qual está em uso.

## Notas de produção

- **Este endpoint é público** (workers.dev). Pra restringir, coloque Cloudflare Access na frente ou adicione uma rota em domínio próprio.
- **Interop de chave**: o Node exporta JWK com `"alg":"Ed25519"`, que o workerd rejeita — por isso `importPrivateJwk` importa um JWK limpo (sem `alg`). Já tratado.
- **Erros nunca viram 1101 opaco**: toda exceção volta como JSON `{error, message}` (sem vazar segredo).
- **Rating é heurístico** e vem com disclaimer — não é parecer nem garantia. `status_claim` nunca é "homologado".
