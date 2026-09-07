# Projeto v2 — Passaporte Fiscal + Rede de Créditos

*A quebra em dois, feita direito. Contraproposta ao plano em discussão (spec MVP v0.1 + POC v0.1 + ajustes sugeridos).*

---

## Tese em uma frase

O plano sugerido vende **validação**. O projeto certo vende **um ativo padronizado**: o crédito de ICMS transformado em *Passaporte Fiscal* — um dossiê assinado, reproduzível e **com rating** — numa janela regulatória que fecha em 2032 e que torna a homologação urgente para todo detentor de crédito no Brasil.

---

## 1. O que o plano sugerido acerta — e onde ainda erra

Acertos que mantenho: detentor como pagante (contador como canal), uma rota só no piloto, FR-037 como Must, concierge com 3–5 detentores, stack enxuta (Workers + D1 + R2 + Queues), CAT 42 e e-CredAc como fluxos distintos, tabela do Gate 0 comparando com a prática da BNICMS.

Quatro erros que permanecem no plano sugerido:

**1.1. Ignora a reforma tributária — o argumento de venda mais forte que existe.** Nenhum dos documentos menciona a EC 132/2023 e a LC 214/2025. É o elefante na sala: o ICMS acaba em 2033, e a LC 214 define que o saldo credor **homologado** ao fim da transição vira compensação com IBS em **240 parcelas mensais** (20 anos, corrigido) — ou pode ser **transferido a terceiros** e ressarcido, mas sempre condicionado à **homologação pelo estado**. Traduzindo em valor presente: um crédito não homologado até 2032 vira um recebível de 20 anos — a taxas de desconto empresariais, isso é perder 60–75% do valor. Consequências diretas:
- **O pitch do Produto 1 muda**: não é "encontre inconsistências", é *"seu crédito vale 100 hoje e vai valer 30 se você não homologar antes da transição — o relógio está correndo"*. Urgência dada por lei federal, não por marketing.
- **A homologação é o gargalo nacional** dos próximos 6 anos: todos os detentores do país vão correr para os mesmos fiscos ao mesmo tempo. Quem chega com dossiê estruturalmente impecável fura a fila (menos exigências, menos glosa). É exatamente o que o P1 produz.
- **O Produto 2 ganha um futuro sancionado por lei federal**: a própria LC 214 prevê transferência de saldo credor a terceiros na transição. A "bolsa" deixa de depender só de brechas estaduais (art. 73/84 RICMS-SP) e passa a surfar um mercado nacional que a reforma cria. O negócio não morre com o ICMS — ele tem um segundo ato em créditos de IBS/CBS (ressarcimento em até 30/60/75 dias, que criará sua própria indústria de conformidade).

**1.2. O produto do P1 está definido errado.** "Validar e gerar o arquivo do protocolo" é feature. O produto é o **Passaporte Fiscal com rating**: um artefato padronizado que atesta (a) completude documental, (b) aderência ao layout e às regras da rota, (c) risco estimado de glosa — resumido num **rating A/B/C do crédito**. É o que a agência de rating fez pelo mercado de dívida e a classificação fez pela CPR no agro: **padronizar o ativo é o que cria o mercado secundário**. A BNICMS não tem isso; ela tem trabalho manual e uma vitrine. O rating é o fosso, e é insumo direto do P2: a rede lista passaportes com rating, não alegações de crédito.

**1.3. A resposta à "tensão da bolsa" está incompleta.** O dilema colocado — book público valida demanda mas cria risco; data room privado é seguro mas não valida nada — tem uma terceira via que ninguém propôs: **vitrine anonimizada com rating e sem preço**. Mostrar publicamente "Lote #014 — CAT 42/SP — R$ 2,4M — Rating A — 3 interessados" valida demanda (cliques, manifestações de interesse) sem publicar deságio, sem book de ofertas e sem intermediar operação. Preço e negociação ficam no privado. Isso responde ao Gate 0 em vez de esperar por ele.

**1.4. Cobra no lugar errado do P2.** Comissão sobre a transferência é o que caracteriza intermediação — o risco que se quer evitar. Estrutura limpa: **o success fee inteiro fica no P1, sobre valor homologado** (evento incontestável, chancelado pelo estado); o P2 cobra **assinatura + data room + SLA de processo**, zero comissão sobre operação até o parecer do Gate 0 dizer o contrário. Dois CNPJs desde o dia 1 (custa quase nada e evita contaminar um SaaS fiscal limpo, vendável ou integrável ao ecossistema Datarisk).

---

## 2. A matemática do negócio

### 2.1. Preço justo do deságio (motor de pricing)

O deságio praticado no mercado é opaco. Ele tem três componentes racionais e todos são estimáveis:

```
V = VN · (1 − g) · (1 + i)^(−T)

VN = valor nominal do crédito
g  = perda esperada por glosa (função do rating do passaporte)
T  = tempo esperado até absorção total (meses)
i  = custo de capital mensal do comprador
d* = 1 − V/VN   (deságio mínimo racional)
```

Exemplo: T = 18 meses, i = 1,5% a.m., g = 5% → d* ≈ 27%. Com passaporte rating A (g ≈ 1%) e comprador com absorção rápida (T = 6), d* ≈ 13%. **O rating literalmente reduz o deságio — o P1 aumenta o preço de venda do crédito de forma mensurável**, o que fecha a conta do success fee sem discussão.

Uso tático: publicar a **Calculadora de Valor do Crédito** (valor nominal + rota + rating estimado → faixa de deságio justo + valor em 2033 se não homologar) como isca de leads. Cada simulação é um lead qualificado com o tamanho do crédito declarado — e a base de simulações vira o dado proprietário de pricing que a BNICMS não tem.

### 2.2. Matching não é marketplace aberto — é um grafo com predicados

A transferência de crédito acumulado não é livre: art. 73 RICMS-SP restringe a interdependentes e **fornecedores**; art. 84 exige autorização caso a caso. Modelagem correta: grafo bipartido detentor→comprador onde as **arestas só existem se um predicado legal é satisfeito**, e a capacidade de cada comprador é limitada pelo seu débito mensal de ICMS (T do pricing sai daí). Lotes grandes se dividem entre compradores — um problema clássico de transporte/atribuição, trivial de resolver bem e impossível de resolver no braço.

**A consequência mata o problema de cold start**: se as arestas preferenciais vão para fornecedores, *os primeiros compradores de cada detentor são a própria cadeia de suprimentos dele*. A rede não precisa de liquidez global no dia 1 — cada cliente do P1 traz o seu mini-mercado embutido (a lista de fornecedores está nas notas fiscais que o P1 já processa). O P2 nasce com matching quente, por construção.

### 2.3. Métricas que importam

R$ homologado (norte), R$ documentado em passaportes, taxa de aprovação no pré-validador em 1ª tentativa, tempo de ciclo (intake → arquivo pronto), nº de passaportes rating A, e no P2: manifestações de interesse por lote listado. Nunca "inconsistências encontradas" — ninguém paga por problema apontado.

---

## 3. A engenharia

Stack sugerida está certa e eu apertaria mais um furo:

- **Rules-as-code versionado e determinístico**: cada ruleset (CAT 42/SP v2026.09) é um artefato imutável com hash; toda validação registra `(input_hash, ruleset_version, output_hash)`. Resultado: **evidência reproduzível** — qualquer auditor reexecuta e chega ao mesmo dossiê. É a vantagem estrutural sobre as 8.000 checagens manuais da BNICMS e é barato de fazer desde o commit 1.
- **O Passaporte é um artefato assinado**: JSON canônico + manifesto de evidências (hashes dos documentos no R2) + assinatura da plataforma. Verificável offline por terceiros (comprador, advogado, fisco). Esse é o contrato de integração P1→P2 — o P2 **não acessa dados do P1**, só consome passaportes que o detentor autoriza compartilhar. A separação societária já nasce implementada na arquitetura.
- **MVP mínimo mesmo**: Workers + D1 + R2 + Queues, um repo, dois deploys (p1.app, p2.app). Sem Durable Objects, sem multi-tenancy de 100 escritórios, sem Containers. O motor de regras é uma função pura — o lugar onde a engenharia de verdade acontece é no ruleset, não na infra.

---

## 4. Sequência — 10 semanas

| Semanas | Entrega |
|---|---|
| 1–2 | Ruleset CAT 42/SP v1 (layout + pré-validações) como código versionado; intake de documentos |
| 3–4 | Gerador de dossiê + arquivo digital pronto para o e-Ressarcimento; formato do Passaporte assinado |
| 5–6 | Calculadora pública de valor do crédito (isca de leads) + rating v1 (heurístico, 3 faixas) |
| 5–8 | Piloto concierge: 3–5 detentores, success fee sobre homologado; medir tempo de ciclo e 1ª aprovação |
| 7–8 | Gate 0 jurídico com a tabela "prática BNICMS × nossa restrição × fundamento × decisão" **+ parecer LC 214 sobre transferência na transição** |
| 9–10 | P2 POC: vitrine anonimizada (rating, sem preço) com os passaportes reais do piloto; medir interesse |

Regra de ouro mantida: o P2 só liga quando existirem ≥3 passaportes rating A/B reais. Mas a vitrine pode ir ao ar com os lotes do próprio piloto — validação de demanda na semana 9, não no trimestre 3.

---

## 5. Delta contra o plano sugerido

| Dimensão | Plano sugerido | Este projeto |
|---|---|---|
| Pitch do P1 | "validamos e geramos o arquivo" | "homologue antes de 2032 ou perca 2/3 do valor" (LC 214) |
| Produto do P1 | dossiê + arquivo | **Passaporte Fiscal com rating** (padroniza o ativo) |
| Validação de demanda do P2 | data room privado, adiada ao Gate 0 | vitrine anonimizada com rating, sem preço — semana 9 |
| Monetização do P2 | indefinida (tensão com intermediação) | assinatura/data room; success fee fica todo no P1 sobre homologado |
| Cold start da rede | não endereçado | fornecedores do detentor (art. 73) = mercado embutido por cliente |
| Pricing | ausente | motor de deságio justo + calculadora pública como isca |
| Horizonte | morre com o ICMS | segundo ato em IBS/CBS (ressarcimento da reforma) |
| Societário | "provavelmente dois CNPJs depois" | dois CNPJs no dia 1; separação já implementada no formato do passaporte |

---

## 6. Riscos honestos

O rating v1 será heurístico e precisa de disclaimer jurídico (não é parecer, não é garantia). A vitrine anonimizada precisa passar pelo Gate 0 antes de exibir valores nominais (talvez faixas). A leitura da LC 214 sobre transferência a terceiros na transição depende de regulamentação em curso — o parecer do Gate 0 deve cobrir isso explicitamente. E o prazo de 10 semanas assume ruleset CAT 42 fechado na semana 2: se o layout do arquivo digital consumir mais tempo (é o risco real do projeto), corta-se a calculadora, nunca o piloto.

---

*Referências normativas a confirmar no Gate 0: Portaria CAT 42/2018 (e-Ressarcimento ICMS-ST/SP), Portaria CAT 26/2010 (e-CredAc), arts. 71–84 RICMS/SP, EC 132/2023, LC 214/2025 (tratamento do saldo credor de ICMS na transição).*
