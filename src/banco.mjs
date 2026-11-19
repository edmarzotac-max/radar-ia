/* Conversa com o Supabase do site pelas funções radar_* (chave pública +
   RADAR_TOKEN). A chave pública é a mesma que o site usa no navegador. */

const URL_BASE = () => process.env.SUPABASE_URL;
const CHAVE = () => process.env.SUPABASE_CHAVE_PUBLICA;

export const bancoLigado = () => !!(URL_BASE() && CHAVE() && process.env.RADAR_TOKEN);

async function rpc(funcao, corpo) {
  const r = await fetch(`${URL_BASE()}/rest/v1/rpc/${funcao}`, {
    method: "POST",
    headers: {
      apikey: CHAVE(),
      Authorization: `Bearer ${CHAVE()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_token: process.env.RADAR_TOKEN, ...corpo }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`Supabase ${funcao} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

/* Devolve só os links que ainda não foram vistos. */
export async function naoVistos(urls) {
  if (!urls.length) return [];
  const saida = [];
  for (let i = 0; i < urls.length; i += 200) {
    const r = await rpc("radar_unseen", { p_urls: urls.slice(i, i + 200) });
    saida.push(...r.map((x) => (typeof x === "string" ? x : x.radar_unseen)));
  }
  return saida;
}

export const gravar = (itens, vistos) => rpc("radar_ingest", { p_items: itens, p_seen: vistos });

export const recentes = (horas) => rpc("radar_recent", { p_hours: horas });

export const marcar = (ids, { superNoticia = false, telegram = false }) =>
  ids.length ? rpc("radar_mark", { p_ids: ids, p_breaking: superNoticia, p_telegram: telegram }) : null;

/* Skills novas para a fila do painel /admin/skills (e links marcados como vistos). */
export const enfileirarSkills = (itens, vistos) => rpc("radar_skill_queue", { p_items: itens, p_seen: vistos });

/* Produtos de afiliado de uma notícia já publicada (até 3). */
export const definirProdutos = (id, produtos) => rpc("radar_set_products", { p_id: id, p_products: produtos });
