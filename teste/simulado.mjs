/* Teste da rodada inteira sem chave nenhuma: as fontes são reais, mas o
   Gemini, o Supabase e o Telegram são de mentira (ficam na memória).

   node teste/simulado.mjs

   Confere: coleta → filtra vistos → IA → grava → super notícia → canal.
   Roda duas vezes seguidas para provar que a 2ª rodada não repete nada. */

process.env.SUPABASE_URL = "https://falso.supabase.co";
process.env.SUPABASE_CHAVE_PUBLICA = "chave-falsa";
process.env.RADAR_TOKEN = "token-falso";
process.env.GEMINI_CHAVE = "gemini-falso";
process.env.TELEGRAM_BOT_TOKEN = "bot-falso";
process.env.TELEGRAM_CANAL = "@canal_falso";
process.env.TELEGRAM_MEU_CHAT = "123";

const fetchReal = globalThis.fetch;
const banco = { news: [], seen: new Set(), id: 0 };
const telegram = [];
let pedidosIA = 0;
const repetidos = []; // links analisados duas vezes (não pode acontecer)

const resposta = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes("generativelanguage.googleapis.com")) {
    pedidosIA++;
    const corpo = JSON.parse(opts.body);
    const conteudo = corpo.messages[1].content;
    const itens = JSON.parse(conteudo.slice(conteudo.indexOf("Itens:\n") + 7));
    return resposta({
      choices: [{
        message: {
          content: JSON.stringify({
            itens: itens.map((it) => ({
              id: it.id,
              relevante: !/customer|stories|maps/i.test(it.titulo_original),
              titulo: `PT: ${it.titulo_original}`.slice(0, 90),
              resumo: `Resumo de teste de ${it.fonte}.`,
              porque: "Porque é um teste.",
              // tudo que fala de OpenAI vira o mesmo assunto, para forçar uma super notícia
              importancia: it.tipo === "lancamento" ? 4 : 3,
              assunto: /openai/i.test(it.titulo_original + it.fonte) ? "assunto-openai-teste" : `item-${it.id}-${it.fonte}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
              tags: ["teste"],
              categoria: it.editoria_provavel,
            })),
          }),
        },
      }],
    });
  }
  if (u.includes("falso.supabase.co")) {
    const fn = u.split("/rpc/")[1];
    const b = JSON.parse(opts.body);
    if (b.p_token !== "token-falso") return resposta({ message: "unauthorized" }, 401);
    if (fn === "radar_unseen") return resposta(b.p_urls.filter((x) => !banco.seen.has(x)));
    if (fn === "radar_ingest") {
      for (const x of b.p_seen) {
        if (banco.seen.has(x)) repetidos.push(x);
        banco.seen.add(x);
      }
      const ins = [];
      for (const i of b.p_items) {
        if (banco.news.some((n) => n.source_url === i.source_url || n.slug === i.slug)) continue;
        const n = {
          ...i, id: ++banco.id, created_at: new Date().toISOString(), is_breaking: false, telegram_at: null,
          // simula fontes diferentes falando do mesmo assunto
          source_name: i.topic_key === "assunto-openai-teste" ? `${i.source_name} #${banco.id % 4}` : i.source_name,
        };
        banco.news.push(n);
        ins.push({ id: n.id, slug: n.slug, source_url: n.source_url });
      }
      return resposta(ins);
    }
    if (fn === "radar_recent") return resposta([...banco.news].reverse());
    if (fn === "radar_mark") {
      for (const n of banco.news) {
        if (!b.p_ids.includes(n.id)) continue;
        if (b.p_breaking) n.is_breaking = true;
        if (b.p_telegram) n.telegram_at ??= new Date().toISOString();
      }
      return new Response("", { status: 200 });
    }
    return resposta({ message: "função desconhecida" }, 404);
  }
  if (u.includes("api.telegram.org")) {
    const b = JSON.parse(opts.body);
    telegram.push(b);
    return resposta({ ok: true, result: { message_id: telegram.length } });
  }
  return fetchReal(url, opts);
};

const { principal } = await import("../src/rodar.mjs");

console.log("=== 1ª rodada ===");
await principal();
const r1 = { news: banco.news.length, seen: banco.seen.size, tg: telegram.length, ia: pedidosIA };
console.log("=== 2ª rodada ===");
await principal();
const falhas = [];
if (r1.news === 0) falhas.push("1ª rodada não publicou nada");
if (repetidos.length) falhas.push(`${repetidos.length} link(s) analisados de novo`);
if (new Set(banco.news.map((n) => n.source_url)).size !== banco.news.length) falhas.push("notícia repetida no portal");
if (!banco.news.some((n) => n.is_breaking)) falhas.push("nenhuma super notícia detectada");
const canal = telegram.filter((t) => t.chat_id === "@canal_falso");
const alerta = telegram.filter((t) => t.chat_id === "123");
if (!alerta.length) falhas.push("alerta no privado não saiu");
if (canal.length > 4) falhas.push("canal recebeu mais de 4 posts numa rodada");
if (banco.news.some((n) => n.title.includes("customer"))) falhas.push("item irrelevante foi publicado");

console.log(`\nResultado: ${r1.news} no portal · ${banco.seen.size} vistos · ${pedidosIA} pedidos à IA · ` +
  `${canal.length} no canal · ${alerta.length} alertas · super: ${banco.news.filter((n) => n.is_breaking).map((n) => n.title).join(" | ")}`);
console.log("\nExemplo de post do canal:\n" + (canal[0]?.text ?? "(nenhum)"));
console.log(falhas.length ? `\nFALHOU:\n- ${falhas.join("\n- ")}` : "\nTUDO CERTO");
process.exit(falhas.length ? 1 : 0);
