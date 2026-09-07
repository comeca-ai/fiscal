// index.js — Worker: Calculadora de Valor do Crédito + Passaporte Fiscal assinado.
import {
  RULESET, rulesetHash, desagio, buildPassaporte, signPassaporte, verifyPassaporte,
  generateKeypair, exportJwk, importPrivateJwk, importPublicJwk,
} from "./lib.js";

let keyCache = null; // { priv, pub, pubJwk, ephemeral }

// Aceita o JWK cru, ou uma string JSON duplamente encodada / com aspas em volta (comum em secrets e .dev.vars).
function parseJwk(raw) {
  let v = String(raw).trim();
  for (let i = 0; i < 3; i++) {
    try {
      const parsed = JSON.parse(v);
      if (typeof parsed === "string") { v = parsed; continue; }
      return parsed;
    } catch {
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) { v = v.slice(1, -1).replace(/\\"/g, '"'); continue; }
      throw new Error("SIGNING_KEY_JWK não é um JWK JSON válido");
    }
  }
  throw new Error("SIGNING_KEY_JWK não é um JWK JSON válido");
}

async function getKeys(env) {
  if (keyCache) return keyCache;
  if (env.SIGNING_KEY_JWK) {
    const jwk = parseJwk(env.SIGNING_KEY_JWK);
    const priv = await importPrivateJwk(jwk);
    const pub = await importPublicJwk(jwk);
    const pubJwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x };
    keyCache = { priv, pub, pubJwk, ephemeral: false };
  } else {
    const kp = await generateKeypair();
    const pubJwk = await exportJwk(kp.publicKey);
    keyCache = { priv: kp.privateKey, pub: kp.publicKey, pubJwk: { kty: pubJwk.kty, crv: pubJwk.crv, x: pubJwk.x }, ephemeral: true };
  }
  return keyCache;
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
  });

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (err) {
      // Nunca 1101 opaco: devolve o erro como JSON (sem vazar segredo).
      return json({ error: "internal", message: String(err && err.message || err) }, 500);
    }
  },
};

async function handle(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (request.method === "OPTIONS")
      return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" } });

    if (p === "/" && request.method === "GET")
      return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8" } });

    if (p === "/api/health") return json({ ok: true, service: "passaporte-fiscal", ruleset: RULESET.rule_id + "@" + RULESET.version });

    if (p === "/api/ruleset") return json({ ruleset: RULESET, ruleset_hash: await rulesetHash() });

    if (p === "/api/pubkey") {
      const k = await getKeys(env);
      return json({ alg: "Ed25519", public_jwk: k.pubJwk, ephemeral: k.ephemeral,
        note: k.ephemeral ? "Chave efêmera (sem SIGNING_KEY_JWK). Configure o secret para assinaturas estáveis." : "Chave estável (secret configurado)." });
    }

    if (p === "/api/desagio" && request.method === "GET") {
      const q = url.searchParams;
      const amount_cents = Math.round(Number(q.get("vn") || 0) * 100);
      const grade = (q.get("rating") || "B").toUpperCase();
      const i = q.has("i") ? Number(q.get("i")) : 0.015;
      const T = q.has("T") ? Number(q.get("T")) : 12;
      return json(desagio({ amount_cents, grade, i, T }));
    }

    if (p === "/api/passaporte" && request.method === "POST") {
      let input;
      try { input = await request.json(); } catch { return json({ error: "JSON inválido" }, 400); }
      const { passaporte } = await buildPassaporte(input);
      const k = await getKeys(env);
      const signed = await signPassaporte(passaporte, k.priv);
      return json({ passaporte: signed, pricing: desagio({ amount_cents: signed.amount_cents, grade: signed.rating.grade }) });
    }

    if (p === "/api/verify" && request.method === "POST") {
      let signed;
      try { signed = await request.json(); } catch { return json({ error: "JSON inválido" }, 400); }
      const k = await getKeys(env);
      const valid = await verifyPassaporte(signed.passaporte || signed, k.pub);
      return json({ valid, verified_with: "Ed25519 / " + (k.ephemeral ? "ephemeral" : "stable") });
    }

    return json({ error: "not found", routes: ["/", "/api/health", "/api/ruleset", "/api/pubkey", "GET /api/desagio?vn=&rating=&i=&T=", "POST /api/passaporte", "POST /api/verify"] }, 404);
}

// ---------- UI: Calculadora de Valor do Crédito ----------
const HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Calculadora de Valor do Crédito</title>
<style>
:root{--paper:#eef1f0;--surface:#fff;--ink:#14202a;--muted:#586675;--line:#dde3e2;--p1:#0d7d6e;--p1i:#0a5b50;--p1s:#e2f2ef;--seal:#b26a00;--seals:#f8ecd6;--stop:#c0392b}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 -apple-system,"IBM Plex Sans",Segoe UI,Roboto,sans-serif}
.wrap{max-width:900px;margin:0 auto;padding:36px 20px 60px}
.eyebrow{font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#8493a1;margin:0 0 10px}
h1{font-size:2rem;letter-spacing:-.02em;margin:0 0 8px}.lede{color:var(--muted);max-width:60ch;margin:0 0 26px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}@media(max-width:720px){.grid{grid-template-columns:1fr}}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px 22px}
label{display:block;font-size:12px;font-weight:600;color:var(--muted);margin:12px 0 5px;text-transform:uppercase;letter-spacing:.06em}
input,select{width:100%;font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:#fbfcfb;color:var(--ink)}
.big{font-size:2.1rem;font-weight:700;letter-spacing:-.02em;color:var(--p1i);font-variant-numeric:tabular-nums}
.k{font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8493a1;margin:0 0 4px}
.row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--line);font-variant-numeric:tabular-nums}
.row:first-of-type{border-top:none}.row b{font-weight:600}
.warn{border-left:3px solid var(--stop);background:#fbe9e6;border-radius:0 10px 10px 0;padding:12px 14px;margin-top:16px;font-size:13.5px}
.warn b{color:var(--stop)}
.seal{border-left:3px solid var(--seal);background:var(--seals);border-radius:0 10px 10px 0;padding:11px 14px;margin-top:14px;font-size:12.5px;color:#5a4a2a}
.foot{margin-top:26px;font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#8493a1}
a{color:var(--p1i)}
</style></head><body><div class="wrap">
<p class="eyebrow">Passaporte Fiscal · Worker MVP</p>
<h1>Quanto vale seu crédito de ICMS — hoje e em 2033?</h1>
<p class="lede">Simule o deságio justo do seu crédito acumulado e veja o que acontece se ele <b>não for homologado</b> antes da transição da reforma (LC 214/2025: 240 parcelas).</p>
<div class="grid">
 <div class="card">
  <label>Valor nominal do crédito (R$)</label><input id="vn" type="number" value="2500000" min="0" step="1000">
  <label>Rating estimado do passaporte</label>
  <select id="rating"><option value="A">A — documentação completa, glosa ~1%</option><option value="B" selected>B — completa em parte, glosa ~5%</option><option value="C">C — lacunas críticas, glosa ~12%</option></select>
  <label>Custo de capital do comprador (% ao mês)</label><input id="i" type="number" value="1.5" step="0.1" min="0">
  <label>Tempo até absorção (meses)</label><input id="T" type="number" value="12" step="1" min="1">
  <div class="seal">Estimativa técnica sujeita a revisão. A plataforma <b>não homologa</b> crédito — prepara e atesta. Rating heurístico, não é parecer.</div>
 </div>
 <div class="card">
  <p class="k">Deságio justo (d*)</p><div class="big" id="d">—</div>
  <div class="row"><span>Valor justo hoje</span><b id="v">—</b></div>
  <div class="row"><span>Perda por glosa (g)</span><b id="g">—</b></div>
  <div class="row"><span>Se <u>não</u> homologar até a transição</span><b id="pv">—</b></div>
  <div class="row"><span>Perda de valor no cenário LC 214</span><b id="loss">—</b></div>
  <div class="warn" id="msg"><b>O relógio está correndo.</b> Sem homologação, o crédito vira recebível de 20 anos.</div>
 </div>
</div>
<p class="foot">API: <a href="/api/desagio?vn=2500000&rating=A">/api/desagio</a> · <a href="/api/ruleset">/api/ruleset</a> · <a href="/api/pubkey">/api/pubkey</a> · POST /api/passaporte · POST /api/verify</p>
</div>
<script>
const $=(id)=>document.getElementById(id);
const brl=(c)=>(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const pct=(x)=>(x*100).toFixed(1).replace('.',',')+'%';
async function calc(){
  const q=new URLSearchParams({vn:$('vn').value,rating:$('rating').value,i:(Number($('i').value)/100),T:$('T').value});
  const r=await fetch('/api/desagio?'+q); const d=await r.json();
  $('d').textContent=pct(d.desagio_justo); $('v').textContent=brl(d.fair_value_cents); $('g').textContent=pct(d.g);
  $('pv').textContent=brl(d.transicao_lc214.valor_presente_cents); $('loss').textContent=pct(d.transicao_lc214.perda);
  $('msg').innerHTML='<b>Rating '+d.inputs.grade+':</b> homologando agora, o crédito vale <b>'+brl(d.fair_value_cents)+'</b>. Sem homologar, cai para <b>'+brl(d.transicao_lc214.valor_presente_cents)+'</b> — perda de <b>'+pct(d.transicao_lc214.perda)+'</b>.';
}
['vn','rating','i','T'].forEach(id=>$(id).addEventListener('input',calc)); calc();
</script></body></html>`;
