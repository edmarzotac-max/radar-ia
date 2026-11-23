/* Posts do dia para o Threads e o LinkedIn (23/11/2026).
   Roda todo dia às 7h (Brasília) no GitHub Actions:
   1. escolhe até 2 notícias das últimas 36 h nos temas do Edmar;
   2. a IA escreve o post de cada rede; um fiscal (outra chamada) dá nota e
      devolve uma vez se precisar;
   3. grava como RASCUNHO no Supabase e manda um e-mail para o Edmar com o
      link do painel /admin/posts, onde ele aprova com 1 toque.
   Nada é publicado aqui: quem publica é o publicar-redes.mjs, só o que foi aprovado.

   Uso: node src/redes.mjs [--previa]   (--previa só mostra, não grava nem envia) */

import { pedirJSON, iaLigada } from "./ia.mjs";

const SITE = process.env.SITE_URL || "https://edmarcastro.com.br";
const PREVIA = process.argv.includes("--previa");

async function rpc(funcao, corpo) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${funcao}`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_CHAVE_PUBLICA,
      Authorization: `Bearer ${process.env.SUPABASE_CHAVE_PUBLICA}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_token: process.env.RADAR_TOKEN, ...corpo }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`Supabase ${funcao} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

async function noticiasRecentes() {
  const desde = new Date(Date.now() - 36 * 3600_000).toISOString();
  const campos = "id,slug,title,summary,why,source_name,image_url,category,kind,importance,tags,created_at";
  const r = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/news?select=${campos}&created_at=gte.${desde}&order=importance.desc,created_at.desc&limit=60`,
    { headers: { apikey: process.env.SUPABASE_CHAVE_PUBLICA, Authorization: `Bearer ${process.env.SUPABASE_CHAVE_PUBLICA}` } },
  );
  if (!r.ok) throw new Error(`notícias: ${r.status}`);
  return r.json();
}

/* Temas em que o Edmar tem autoridade (decisão de 20/11). */
const TEMAS = /claude|anthropic|skill|mcp|agente|agent|automa|n8n|whatsapp|atendimento|pequena|crm|codex|chatgpt|openai/i;

/* Fora: cripto/apostas e nota de versão pequena (não rendem conversa). */
const FORA = /airdrop|cripto|crypto|web3|carteira|wallet|token de|nft|blockchain|aposta|bet\b/i;

function escolher(noticias, usados) {
  const boas = noticias
    .filter((n) => !usados.has(n.slug))
    .filter((n) => n.category !== "games")
    .filter((n) => !FORA.test(`${n.title} ${n.summary}`))
    .filter((n) => TEMAS.test(`${n.title} ${n.summary} ${(n.tags || []).join(" ")}`))
    // nota de versão de software não rende conversa nas redes; o resto precisa de nota 3+
    .filter((n) => n.kind !== "lancamento" && n.importance >= 3);
  // notícia de verdade primeiro, depois repositório e versão
  const peso = (n) => n.importance + (n.kind === "noticia" ? 1 : 0);
  return boas.sort((a, b) => peso(b) - peso(a)).slice(0, 2);
}

const NOTA_MINIMA = 7; // abaixo disso nem vai para o Edmar

/* Horários (Brasília = UTC-3): Threads 12h15 e 19h15; LinkedIn só ter e qui, 8h30. */
function horario(hora, minuto) {
  const agora = new Date();
  const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate(), hora + 3, minuto));
  return d.toISOString();
}
const diaDaSemanaBR = () => new Date(Date.now() - 3 * 3600_000).getUTCDay(); // 0 = domingo

const REGRAS_COMUNS = `Você escreve como o Edmar Castro, brasileiro que trabalha com IA (Claude Code, skills, automação) e ajuda pequenas empresas a vender e atender melhor.
Voz: primeira pessoa, conversa, frases curtas, português do Brasil do jeito que se fala ("pedi pro Claude", "olha isso"). Sem jargão de marketing.
Proibido: a palavra "site" (use "portal" ou o nome da coisa); tom de alarme (hackeado, golpe, perigo, cuidado, medo); "você está perdendo"; promessa de dinheiro; mais de 1 emoji; inventar fato. Todo fato vem da notícia abaixo, com os mesmos números e nomes.`;

const PEDIDO = (n, link) => `${REGRAS_COMUNS}

NOTÍCIA
Título: ${n.title}
Resumo: ${n.summary}
Por que importa: ${n.why || "-"}
Fonte: ${n.source_name}
Link da matéria no portal: ${link}

Escreva DOIS posts:

THREADS (público: quem trabalha ou quer trabalhar com IA e aprender Claude; tom de quem mostra uma novidade curiosa para um amigo):
- até 450 caracteres; gancho na 1ª frase com o fato mais interessante (nunca comece com "Olha o que a IA está fazendo" nem com "Tem novidade"); termine com uma pergunta concreta que puxe conversa (não "o que você acha?");
- SEM link no post (o link vai no 1º comentário).

LINKEDIN (público: dono e gerente de pequena e média empresa; ângulo: o que a novidade muda em atendimento, vendas ou rotina; o valor é entender o negócio e trazer resultado, nunca "a IA faz rápido"):
- as 2 primeiras linhas são o gancho; de 700 a 1.300 caracteres; parágrafos de 1 a 2 linhas; "você/sua";
- termine com uma pergunta e 3 hashtags; SEM link no post.

Responda só com JSON: {"threads":{"post":"..."},"linkedin":{"post":"..."}}`;

const FISCAL = `Você é o fiscal dos posts do Edmar Castro. Você não reescreve nada: só dá nota e aponta o que corrigir.
Confira em cada post: (1) fatos SOBRE O PRODUTO OU A EMPRESA iguais aos da notícia, nada inventado (números, nomes, recursos). Sugestão de uso e opinião do Edmar ("dá para usar em…", "eu usaria para…", "isso ajuda quem…") NÃO é fato inventado: é permitido e desejado, desde que não afirme um recurso que a notícia não cita; (2) sem link no corpo; (3) regras da rede (tamanho, gancho, pergunta no fim, hashtags só no LinkedIn); (4) proibidos: "site", tom de alarme, promessa de dinheiro, jargão, mais de 1 emoji; (5) soa como uma pessoa falando, não anúncio.
Responda só com JSON: {"threads":{"nota":0-10,"problemas":["..."]},"linkedin":{"nota":0-10,"problemas":["..."]}}. Nota 8 ou mais só sem problema dos itens 1, 2 e 4.`;

async function escreverPosts(n, link) {
  let posts = await pedirJSON(PEDIDO(n, link), "Responda só com JSON válido.");
  let notas = await pedirJSON(`NOTÍCIA: ${n.title}\n${n.summary}\n\nPOSTS:\n${JSON.stringify(posts)}`, FISCAL);
  for (const rede of ["threads", "linkedin"]) {
    if ((notas?.[rede]?.nota ?? 0) >= 8) continue;
    // devolve uma vez, só a rede reprovada
    const corrigido = await pedirJSON(
      `${PEDIDO(n, link)}\n\nO fiscal devolveu o post de ${rede.toUpperCase()} por: ${(notas?.[rede]?.problemas || []).join("; ")}.
Reescreva só esse post e responda com o JSON completo das duas redes (repita o outro igual): ${JSON.stringify(posts)}`,
      "Responda só com JSON válido.",
    );
    posts = { ...posts, [rede]: corrigido?.[rede] ?? posts[rede] };
    const nova = await pedirJSON(`NOTÍCIA: ${n.title}\n${n.summary}\n\nPOSTS:\n${JSON.stringify(posts)}`, FISCAL);
    notas = { ...notas, [rede]: nova?.[rede] ?? notas[rede] };
  }
  return { posts, notas };
}

async function avisarEdmar(qtd) {
  const para = process.env.NEWSLETTER_TESTE;
  if (!process.env.RESEND_CHAVE || !process.env.NEWSLETTER_DE || !para) {
    console.log("Sem Resend ou sem e-mail do Edmar: não avisa.");
    return;
  }
  const link = `${SITE}/admin/posts`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_CHAVE}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.NEWSLETTER_DE,
      to: [para],
      subject: `${qtd} post${qtd > 1 ? "s" : ""} esperando o seu OK`,
      text: `Bom dia! Os posts de hoje estão prontos e esperando a sua aprovação:\n\n${link}\n\nNada é publicado sem o seu toque em "Aprovar".`,
      html: `<p>Bom dia! Os posts de hoje estão prontos e esperando a sua aprovação.</p><p><a href="${link}" style="display:inline-block;padding:12px 18px;background:#ff5a1f;color:#fff;border-radius:10px;text-decoration:none;font-weight:700">Ver e aprovar os posts</a></p><p style="color:#6d6a64">Nada é publicado sem o seu toque em "Aprovar".</p>`,
    }),
  });
  if (!r.ok) console.warn(`  ! aviso por e-mail falhou: ${r.status} ${(await r.text()).slice(0, 200)}`);
  else console.log(`Aviso enviado para o Edmar.`);
}

export async function principal() {
  if (!iaLigada()) throw new Error("Sem IA configurada (OPENAI_CHAVE).");
  const usados = new Set(PREVIA ? [] : await rpc("radar_social_used", { p_days: 30 }));
  const escolhidas = escolher(await noticiasRecentes(), usados);
  console.log(`Notícias escolhidas: ${escolhidas.length}`);
  if (!escolhidas.length) return;

  const linkedinHoje = [2, 4].includes(diaDaSemanaBR()); // terça e quinta
  const linhas = [];
  for (const [i, n] of escolhidas.entries()) {
    const link = `${SITE}/noticias/${n.slug}`;
    const { posts, notas } = await escreverPosts(n, link);
    console.log(`\n[${n.importance}] ${n.title}\n  Threads ${notas?.threads?.nota}/10 · LinkedIn ${notas?.linkedin?.nota}/10`);
    console.log(`  fiscal: ${JSON.stringify(notas)}`);
    if (PREVIA) console.log(`\n--- THREADS ---\n${posts.threads?.post}\n\n--- LINKEDIN ---\n${posts.linkedin?.post}\n`);
    const base = { news_id: n.id, news_slug: n.slug, news_title: n.title, image_url: n.image_url || "" };
    if (posts.threads?.post && (notas?.threads?.nota ?? 0) >= NOTA_MINIMA) {
      linhas.push({
        ...base,
        network: "threads",
        body: posts.threads.post.trim(),
        first_comment: `Resumo completo em português: ${link}`,
        score: notas?.threads?.nota ?? null,
        review: notas?.threads ?? null,
        scheduled_for: i === 0 ? horario(12, 15) : horario(19, 15),
      });
    }
    // LinkedIn: só notícia de verdade (versão e repositório não rendem para dono de empresa)
    if (i === 0 && linkedinHoje && n.kind === "noticia" && posts.linkedin?.post && (notas?.linkedin?.nota ?? 0) >= NOTA_MINIMA) {
      linhas.push({
        ...base,
        network: "linkedin",
        body: posts.linkedin.post.trim(),
        first_comment: `A notícia completa, resumida em português: ${link}`,
        score: notas?.linkedin?.nota ?? null,
        review: notas?.linkedin ?? null,
        scheduled_for: horario(8, 30),
      });
    }
  }
  if (PREVIA) return;
  const gravados = await rpc("radar_social_insert", { p_rows: linhas });
  console.log(`\nRascunhos gravados: ${gravados}`);
  if (gravados > 0) await avisarEdmar(gravados);
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
