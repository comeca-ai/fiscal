// lib.js — lógica pura do Passaporte Fiscal.
// Roda igual em workerd (Cloudflare) e em Node 22 — usa só globalThis.crypto.subtle.

// ---------- utilidades determinísticas ----------
export function canonicalize(value) {
  // JSON canônico: chaves ordenadas recursivamente. Base da reprodutibilidade e da assinatura.
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(
      (k) => JSON.stringify(k) + ":" + canonicalize(value[k])
    ).join(",") + "}";
  }
  return JSON.stringify(value ?? null);
}

const enc = new TextEncoder();

export async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return "sha256:" + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bufToB64(buf) {
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64ToBuf(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

// ---------- ruleset CAT 42/SP (v1, ilustrativo e versionado) ----------
export const RULESET = {
  rule_id: "BR-SP-CAT42",
  version: "v2026.09",
  jurisdiction: "BR-SP",
  credit_kind: "ICMS_ACCUMULATED",
  required_docs: ["efd_icms_ipi", "nfe_xml", "apuracao", "livro_registro"],
  checks: [
    { id: "DOC-COMPLETE", desc: "Todos os documentos exigidos pela rota estão presentes" },
    { id: "PERIODO-COERENTE", desc: "Competência do EFD bate com o período de referência" },
    { id: "VALOR-POSITIVO", desc: "Valor do crédito é positivo e informado em centavos" },
    { id: "IE-PRESENTE", desc: "Inscrição estadual do estabelecimento informada" },
  ],
};

export async function rulesetHash() {
  return sha256Hex(canonicalize(RULESET));
}

// Executa o ruleset de forma determinística: mesma entrada + mesma versão → mesma saída.
export function runRuleset(input) {
  const findings = [];
  const docs = Array.isArray(input.documents) ? input.documents.map((d) => d.kind) : [];
  const present = RULESET.required_docs.filter((r) => docs.includes(r));
  const missing = RULESET.required_docs.filter((r) => !docs.includes(r));
  const completeness = present.length / RULESET.required_docs.length;

  if (missing.length) findings.push({ check: "DOC-COMPLETE", severity: "alta", evidence: { missing } });
  if (!(input.amount_cents > 0)) findings.push({ check: "VALOR-POSITIVO", severity: "critica", evidence: { amount_cents: input.amount_cents ?? null } });
  if (!input.state_registration) findings.push({ check: "IE-PRESENTE", severity: "media", evidence: {} });
  const rp = input.reference_period || {};
  if (!rp.from || !rp.to) findings.push({ check: "PERIODO-COERENTE", severity: "media", evidence: { reference_period: rp } });

  // proxy de risco de glosa: função das severidades encontradas
  const crit = findings.filter((f) => f.severity === "critica").length;
  const alta = findings.filter((f) => f.severity === "alta").length;
  const glosa_risk = crit > 0 ? "high" : alta > 0 ? "med" : completeness >= 0.99 ? "low" : "med";

  return { completeness, glosa_risk, findings, missing };
}

// Rating heurístico A/B/C (v1) — com disclaimer; não é parecer nem garantia.
export function rateCredit({ completeness, glosa_risk }) {
  let grade;
  if (completeness >= 0.99 && glosa_risk === "low") grade = "A";
  else if (completeness >= 0.75 && glosa_risk !== "high") grade = "B";
  else grade = "C";
  return {
    grade,
    factors: ["completude_documental", "aderencia_layout", "risco_glosa_estimado"],
    disclaimer: "Rating heurístico da plataforma. Não é parecer jurídico nem garantia de homologação.",
  };
}

// ---------- pricing: motor de deságio + valor na transição (LC 214) ----------
export function gForRating(grade) {
  return { A: 0.01, B: 0.05, C: 0.12 }[grade] ?? 0.05;
}

// V = VN·(1−g)·(1+i)^(−T) ; d* = 1 − V/VN
export function desagio({ amount_cents, grade, i = 0.015, T = 12 }) {
  const VN = Number(amount_cents) || 0;
  const g = gForRating(grade);
  const V = VN * (1 - g) * Math.pow(1 + i, -T);
  const dStar = VN > 0 ? 1 - V / VN : 0;

  // Cenário "não homologou": recebível em 240 parcelas mensais (LC 214/2025), a valor presente.
  const n = 240, parcela = VN / n;
  let pv = 0;
  for (let k = 1; k <= n; k++) pv += parcela / Math.pow(1 + i, k);
  const loss2033 = VN > 0 ? 1 - pv / VN : 0;

  return {
    inputs: { amount_cents: VN, grade, i, T },
    g,
    fair_value_cents: Math.round(V),
    desagio_justo: Number(dStar.toFixed(4)),
    transicao_lc214: { parcelas: n, valor_presente_cents: Math.round(pv), perda: Number(loss2033.toFixed(4)) },
  };
}

// ---------- chaves Ed25519 + assinatura ----------
export async function generateKeypair() {
  return crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
}
export async function exportJwk(key) {
  return crypto.subtle.exportKey("jwk", key);
}
export async function importPrivateJwk(jwk) {
  // JWK limpo: Node exporta "alg":"Ed25519", mas o workerd exige "EdDSA" ou ausência de alg.
  const clean = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, d: jwk.d, key_ops: ["sign"], ext: true };
  return crypto.subtle.importKey("jwk", clean, { name: "Ed25519" }, true, ["sign"]);
}
export async function importPublicJwk(jwk) {
  const pub = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, key_ops: ["verify"], ext: true };
  return crypto.subtle.importKey("jwk", pub, { name: "Ed25519" }, true, ["verify"]);
}

// ---------- montagem e assinatura do Passaporte ----------
export async function buildPassaporte(input) {
  const rr = runRuleset(input);
  const rating = rateCredit(rr);
  const input_hash = await sha256Hex(canonicalize(input));
  const ruleset_hash = await rulesetHash();
  const evidence_manifest_hash = await sha256Hex(canonicalize(input.documents || []));
  const now = new Date();
  const exp = new Date(now.getTime() + 30 * 24 * 3600 * 1000);

  const passaporte = {
    passport_id: "psp_" + (input_hash.slice(7, 19)),
    version: 1,
    issuer: "fiscal-platform",
    holder_org_id: input.holder_org_id || null,
    jurisdiction: input.jurisdiction || RULESET.jurisdiction,
    credit_kind: input.credit_kind || RULESET.credit_kind,
    route_candidates: input.route_candidates || ["SP_ART84_NONINTERDEPENDENT"],
    reference_period: input.reference_period || null,
    amount_cents: input.amount_cents || 0,
    rating: { grade: rating.grade, factors: rating.factors },
    status_claim: "DOCUMENTED_FOR_REVIEW",
    completeness: Number(rr.completeness.toFixed(4)),
    findings: rr.findings,
    evidence_manifest_hash,
    ruleset_hash,
    input_hash,
    consent_id: input.consent_id || null,
    issued_at: now.toISOString(),
    expires_at: exp.toISOString(),
  };
  return { passaporte, rating };
}

export async function signPassaporte(passaporte, privateKey) {
  const sig = await crypto.subtle.sign("Ed25519", privateKey, enc.encode(canonicalize(passaporte)));
  return { ...passaporte, signature: bufToB64(sig) };
}

export async function verifyPassaporte(signed, publicKey) {
  if (!signed || !signed.signature) return false;
  const { signature, ...body } = signed;
  try {
    return await crypto.subtle.verify("Ed25519", publicKey, b64ToBuf(signature), enc.encode(canonicalize(body)));
  } catch {
    return false;
  }
}
