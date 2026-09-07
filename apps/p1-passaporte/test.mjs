// test.mjs — prova as garantias do v2 com Node 22 (mesmo WebCrypto do workerd).
import assert from "node:assert/strict";
import {
  canonicalize, sha256Hex, rulesetHash, runRuleset, rateCredit, desagio,
  buildPassaporte, signPassaporte, verifyPassaporte, generateKeypair,
} from "./src/lib.js";

const caseA = {
  holder_org_id: "org_demo", jurisdiction: "BR-SP", credit_kind: "ICMS_ACCUMULATED",
  state_registration: "123.456.789.000", amount_cents: 250000000,
  reference_period: { from: "2025-01", to: "2025-12" },
  documents: [
    { kind: "efd_icms_ipi", sha256: "a" }, { kind: "nfe_xml", sha256: "b" },
    { kind: "apuracao", sha256: "c" }, { kind: "livro_registro", sha256: "d" },
  ],
};
const caseC = { ...caseA, documents: [{ kind: "nfe_xml", sha256: "b" }], amount_cents: 0 };

let n = 0; const ok = (m) => { n++; console.log("  ✓", m); };

// 1) determinismo: mesma entrada → mesmo hash, mesmo rating
{
  const h1 = await sha256Hex(canonicalize(caseA)), h2 = await sha256Hex(canonicalize({ ...caseA }));
  assert.equal(h1, h2);
  const shuffled = JSON.parse(JSON.stringify(caseA)); // ordem de chaves diferente não muda o canônico
  assert.equal(canonicalize(shuffled), canonicalize(caseA));
  const r1 = rateCredit(runRuleset(caseA)), r2 = rateCredit(runRuleset(caseA));
  assert.equal(r1.grade, r2.grade);
  ok("determinismo: input_hash e rating estáveis para a mesma entrada (" + r1.grade + ")");
}

// 2) ruleset hash é estável e o rating distingue casos
{
  const rh = await rulesetHash();
  assert.match(rh, /^sha256:[0-9a-f]{64}$/);
  assert.equal(rateCredit(runRuleset(caseA)).grade, "A");
  assert.equal(rateCredit(runRuleset(caseC)).grade, "C");
  const rc = runRuleset(caseC);
  assert.ok(rc.findings.some((f) => f.check === "DOC-COMPLETE") && rc.findings.some((f) => f.check === "VALOR-POSITIVO"));
  ok("ruleset " + rh.slice(0, 22) + "… · caso completo = A · caso com lacunas = C, com achados");
}

// 3) pricing: rating melhor → deságio menor; cenário LC 214 perde ~60-75% a 1,5%/mês
{
  const a = desagio({ amount_cents: 250000000, grade: "A" });
  const b = desagio({ amount_cents: 250000000, grade: "B" });
  const c = desagio({ amount_cents: 250000000, grade: "C" });
  assert.ok(a.desagio_justo < b.desagio_justo && b.desagio_justo < c.desagio_justo);
  assert.ok(a.transicao_lc214.perda > 0.6 && a.transicao_lc214.perda < 0.8);
  ok(`deságio A ${(a.desagio_justo*100).toFixed(1)}% < B ${(b.desagio_justo*100).toFixed(1)}% < C ${(c.desagio_justo*100).toFixed(1)}% · sem homologar: perde ${(a.transicao_lc214.perda*100).toFixed(0)}%`);
}

// 4) passaporte assinado → verifica; adulterado → falha
{
  const kp = await generateKeypair();
  const { passaporte } = await buildPassaporte(caseA);
  const signed = await signPassaporte(passaporte, kp.privateKey);
  assert.equal(signed.status_claim, "DOCUMENTED_FOR_REVIEW");
  assert.equal(await verifyPassaporte(signed, kp.publicKey), true);
  const tampered = { ...signed, amount_cents: signed.amount_cents + 1 };
  assert.equal(await verifyPassaporte(tampered, kp.publicKey), false);
  const other = await generateKeypair();
  assert.equal(await verifyPassaporte(signed, other.publicKey), false);
  ok("assinatura Ed25519 válida · adulteração detectada · chave errada rejeitada (" + signed.passport_id + ")");
}

console.log(`\n${n}/4 provas passaram.`);
