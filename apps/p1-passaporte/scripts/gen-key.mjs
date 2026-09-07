// Gera um par Ed25519. Guarde o JWK PRIVADO como secret do Worker:
//   node scripts/gen-key.mjs > key.json   (não versionar!)
//   npx wrangler secret put SIGNING_KEY_JWK < private.json
import { generateKeypair, exportJwk } from "../src/lib.js";
const kp = await generateKeypair();
const priv = await exportJwk(kp.privateKey);
const pub = await exportJwk(kp.publicKey);
process.stdout.write(JSON.stringify({ private_jwk: priv, public_jwk: { kty: pub.kty, crv: pub.crv, x: pub.x } }, null, 2) + "\n");
