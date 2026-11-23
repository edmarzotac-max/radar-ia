/* Publica no Threads e no LinkedIn os posts que o Edmar APROVOU no /admin/posts
   e cujo horário já chegou (23/11/2026). Roda a cada 30 min no GitHub Actions.
   Só pega status 'aprovado': rascunho, recusado e publicado nunca saem daqui.

   Credenciais (GitHub Secrets):
   - THREADS_TOKEN: token de longa duração do Threads (60 dias). O script renova
     sozinho a cada 7 dias e guarda o novo no Supabase (private.app_secrets).
   - LINKEDIN_TOKEN: token do LinkedIn (60 dias, renovado à mão pelo Edmar; o
     script avisa por e-mail quando vencer).
   Uso: node src/publicar-redes.mjs [--teste]  (--teste só mostra o que faria) */

const TESTE = process.argv.includes("--teste");
const TH = "https://graph.threads.net/v1.0";
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

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

/* ---------------- Threads ---------------- */

async function tokenThreads() {
  const [salvo] = (await rpc("radar_secret_get", { p_key: "threads_token" })) ?? [];
  let token = salvo?.value || process.env.THREADS_TOKEN;
  if (!token) return null;
  // primeiro uso: o token do gerador da Meta é curto (1 h); troca pelo de 60 dias
  if (!salvo && process.env.THREADS_APP_SECRET) {
    const q = new URLSearchParams({ grant_type: "th_exchange_token", client_secret: process.env.THREADS_APP_SECRET, access_token: token });
    const r = await fetch(`https://graph.threads.net/access_token?${q}`);
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.access_token) {
      token = j.access_token;
      if (!TESTE) await rpc("radar_secret_set", { p_key: "threads_token", p_value: token });
      console.log("Threads: token trocado pelo de 60 dias.");
      return token;
    }
  }
  const idade = salvo ? Date.now() - Date.parse(salvo.updated_at) : Infinity;
  if (idade > 7 * 86400_000) {
    // renova (o token precisa ter mais de 24 h); se falhar, segue com o atual
    const r = await fetch(`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(token)}`);
    if (r.ok) {
      const j = await r.json();
      if (j.access_token) {
        token = j.access_token;
        if (!TESTE) await rpc("radar_secret_set", { p_key: "threads_token", p_value: token });
        console.log("Threads: token renovado.");
      }
    } else if (!salvo) {
      // primeiro uso: guarda o do GitHub para começar a contar a idade
      if (!TESTE) await rpc("radar_secret_set", { p_key: "threads_token", p_value: token });
    } else {
      console.warn(`Threads: renovação falhou (${r.status}).`);
    }
  }
  return token;
}

async function th(caminho, params, token, metodo = "POST") {
  const q = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(`${TH}/${caminho}?${q}`, { method: metodo, signal: AbortSignal.timeout(60_000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`Threads ${caminho} ${r.status}: ${j.error?.message ?? JSON.stringify(j).slice(0, 200)}`);
  return j;
}

async function esperarContainer(id, token) {
  for (let i = 0; i < 12; i++) {
    const j = await th(id, { fields: "status,error_message" }, token, "GET");
    if (j.status === "FINISHED") return;
    if (j.status === "ERROR" || j.status === "EXPIRED") throw new Error(`Threads: container ${j.status} ${j.error_message ?? ""}`);
    await espera(5000);
  }
}

async function publicarThreads(post, token) {
  const comImagem = !!post.image_url;
  const c = await th("me/threads", comImagem
    ? { media_type: "IMAGE", image_url: post.image_url, text: post.body }
    : { media_type: "TEXT", text: post.body }, token);
  await esperarContainer(c.id, token);
  const pub = await th("me/threads_publish", { creation_id: c.id }, token);
  // 1º comentário com o link (resposta ao próprio post)
  if (post.first_comment) {
    try {
      const r = await th("me/threads", { media_type: "TEXT", text: post.first_comment, reply_to_id: pub.id }, token);
      await esperarContainer(r.id, token);
      await th("me/threads_publish", { creation_id: r.id }, token);
    } catch (e) {
      console.warn(`  Threads: post saiu, mas o comentário com o link falhou: ${e.message}`);
    }
  }
  let url = null;
  try {
    url = (await th(pub.id, { fields: "permalink" }, token, "GET")).permalink ?? null;
  } catch { /* sem link, tudo bem */ }
  return { id: pub.id, url };
}

/* ---------------- LinkedIn ---------------- */

// versão da API no formato AAAAMM: 2 meses atrás (sempre já lançada e ainda aceita)
function versaoLinkedIn() {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 2);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// texto do LinkedIn ("little text"): caracteres reservados com barra; #tag vira hashtag
function textoLinkedIn(t) {
  const escapado = t.replace(/[|{}@[\]()<>#\\*_~]/g, (c) => `\\${c}`);
  return escapado.replace(/\\#([\p{L}\p{N}_]+)/gu, (_, tag) => `{hashtag|\\#|${tag}}`);
}

async function li(caminho, corpo, token) {
  const r = await fetch(`https://api.linkedin.com/rest/${caminho}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": versaoLinkedIn(),
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) {
    const erro = new Error(`LinkedIn ${caminho} ${r.status}: ${(await r.text()).slice(0, 300)}`);
    erro.status = r.status;
    throw erro;
  }
  return r;
}

async function autorLinkedIn(token) {
  if (process.env.LINKEDIN_AUTOR) return process.env.LINKEDIN_AUTOR;
  const r = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const e = new Error(`LinkedIn userinfo ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return `urn:li:person:${(await r.json()).sub}`;
}

async function publicarLinkedIn(post, token) {
  const autor = await autorLinkedIn(token);
  const r = await li("posts", {
    author: autor,
    commentary: textoLinkedIn(post.body),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  }, token);
  const urn = r.headers.get("x-restli-id") || r.headers.get("x-linkedin-id");
  if (post.first_comment && urn) {
    try {
      await li(`socialActions/${encodeURIComponent(urn)}/comments`, {
        actor: autor,
        object: urn,
        message: { text: post.first_comment },
      }, token);
    } catch (e) {
      console.warn(`  LinkedIn: post saiu, mas o comentário com o link falhou: ${e.message}`);
    }
  }
  return { id: urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}/` : null };
}

/* ---------------- aviso ---------------- */

async function avisar(assunto, texto) {
  if (!process.env.RESEND_CHAVE || !process.env.NEWSLETTER_DE || !process.env.NEWSLETTER_TESTE) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_CHAVE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.NEWSLETTER_DE, to: [process.env.NEWSLETTER_TESTE], subject: assunto, text: texto }),
  }).catch(() => {});
}

export async function principal() {
  const fila = (await rpc("radar_social_due", {})) ?? [];
  console.log(`Aprovados no horário: ${fila.length}`);
  if (!fila.length) return;

  let tokTh;
  const tokLi = process.env.LINKEDIN_TOKEN || null;
  for (const post of fila) {
    console.log(`- ${post.network} · ${post.news_title}`);
    if (TESTE) {
      console.log(post.network === "linkedin" ? textoLinkedIn(post.body) : post.body);
      continue;
    }
    try {
      let res;
      if (post.network === "threads") {
        tokTh ??= await tokenThreads();
        if (!tokTh) throw new Error("Threads ainda não conectado (falta THREADS_TOKEN).");
        res = await publicarThreads(post, tokTh);
      } else {
        if (!tokLi) throw new Error("LinkedIn ainda não conectado (falta LINKEDIN_TOKEN).");
        res = await publicarLinkedIn(post, tokLi);
      }
      await rpc("radar_social_mark", { p_id: post.id, p_status: "publicado", p_external_id: res.id, p_external_url: res.url });
      console.log(`  publicado: ${res.url ?? res.id}`);
    } catch (e) {
      console.error(`  erro: ${e.message}`);
      // tenta de novo na próxima rodada (até 3 vezes); depois fica como erro no painel
      const ultima = (post.attempts ?? 0) + 1 >= 3 || e.status === 401;
      await rpc("radar_social_mark", { p_id: post.id, p_status: ultima ? "erro" : "aprovado", p_error: e.message.slice(0, 500) });
      if (e.status === 401 && post.network === "linkedin") {
        await avisar("O token do LinkedIn venceu", "O post aprovado não saiu porque o token do LinkedIn venceu (dura 60 dias). Peça ao Claude para renovar.");
      }
    }
    await espera(3000);
  }
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
