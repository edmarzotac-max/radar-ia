/* Completa imagem e vídeo das notícias que já estão no portal.
   npm run midia            mostra o que faria, sem gravar
   npm run midia -- --gravar grava */

import { imagemAbre, imagemDaWikipedia, lerMidia } from "./midia.mjs";

try {
  process.loadEnvFile();
} catch {
  /* no GitHub as variáveis vêm dos Secrets */
}

const GRAVAR = process.argv.includes("--gravar");
const URL_BASE = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_CHAVE_PUBLICA;
const cab = { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "Content-Type": "application/json" };

const r = await fetch(`${URL_BASE}/rest/v1/news?select=id,title,source_url,image_url,video_url,topic_key,tags&order=created_at.desc&limit=500`, { headers: cab });
const noticias = await r.json();
console.log(`${noticias.length} notícias no portal · ${noticias.filter((n) => !n.image_url).length} sem imagem`);

let imagens = 0;
let videos = 0;
const faltando = [];
for (const n of noticias) {
  const m = await lerMidia(n.source_url);
  // imagem que não abre fora do site de origem conta como "sem imagem"
  if (n.image_url && !(await imagemAbre(n.image_url))) {
    console.log(`  #${n.id} imagem bloqueada: ${n.image_url.slice(0, 70)}`);
    n.image_url = null;
  }
  let imagem = n.image_url ? null : m.imagem && (await imagemAbre(m.imagem)) ? m.imagem : null;
  if (!n.image_url && !imagem && n.topic_key) {
    imagem = noticias.find((o) => o.id !== n.id && o.topic_key === n.topic_key && o.image_url && o.image_url !== n.image_url)?.image_url ?? null;
  }
  if (!n.image_url && !imagem) {
    for (const t of n.tags ?? []) {
      const w = await imagemDaWikipedia(t);
      if (w && (await imagemAbre(w))) {
        imagem = w;
        break;
      }
    }
  }
  const video = !n.video_url && m.video ? m.video : null;
  if (!n.image_url && !imagem) faltando.push(n.title);
  if (!imagem && !video) continue;
  console.log(`  #${n.id} ${n.title.slice(0, 60)}${imagem ? " · +imagem" : ""}${video ? ` · +vídeo ${video}` : ""}`);
  if (imagem) imagens++;
  if (video) videos++;
  if (GRAVAR) {
    const g = await fetch(`${URL_BASE}/rest/v1/rpc/radar_set_media`, {
      method: "POST",
      headers: cab,
      body: JSON.stringify({ p_token: process.env.RADAR_TOKEN, p_id: n.id, p_image: imagem ?? "", p_video: video ?? "" }),
    });
    if (!g.ok) console.warn(`  ! não gravou #${n.id}: ${g.status}`);
  }
}
console.log(`\n${GRAVAR ? "Gravado" : "Faria"}: ${imagens} imagem(ns) e ${videos} vídeo(s).`);
if (faltando.length) console.log(`Continuam sem imagem (${faltando.length}):\n  ${faltando.join("\n  ")}`);
