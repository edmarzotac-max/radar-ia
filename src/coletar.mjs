/* Coleta: busca tudo nas fontes e devolve uma lista no mesmo formato.

   Cada item: { url, titulo, texto, fonte, tipo, publicado, imagem, oficial,
   comunidade, enriquecer? }. "enriquecer" existe quando falta abrir a página
   para pegar título e resumo (só é chamado se o link ainda não foi visto). */

import { XMLParser } from "fast-xml-parser";
import {
  ANTHROPIC, ESTRELAS_MINIMAS, FEEDS, HACKER_NEWS, PALAVRAS_IA, REPOS_VIGIADOS, TOPICOS_GITHUB,
} from "./fontes.mjs";

const AGENTE = "Mozilla/5.0 (compatible; RadarIA/1.0; +https://edmarcastro.com.br/noticias)";
const HORAS_FEED = 48;
const HORAS_RELEASE = 72;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  // entidades (&amp; &#8217; ...) são traduzidas em limparHtml; deixar o
  // parser fazer isso estoura o limite dele em feeds grandes
  processEntities: false,
  htmlEntities: false,
});

export async function buscar(url, { json = false, headers = {}, tempo = 20000 } = {}) {
  const r = await fetch(url, {
    headers: { "User-Agent": AGENTE, Accept: json ? "application/json" : "*/*", ...headers },
    signal: AbortSignal.timeout(tempo),
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`${r.status} em ${url}`);
  return json ? r.json() : r.text();
}

const texto = (v) => {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return texto(v[0]);
  return texto(v["#text"] ?? "");
};

function entidades(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function limparHtml(s, max = 900) {
  // duas passadas: feeds costumam mandar HTML escapado dentro do XML
  return entidades(entidades(String(s ?? "")))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const lista = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

function linkAtom(link) {
  const links = lista(link);
  const alt = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
  return typeof alt === "string" ? alt : alt?.["@_href"] ?? "";
}

function imagemDoItem(it) {
  const media = lista(it["media:content"]).concat(lista(it["media:thumbnail"]));
  for (const m of media) {
    const u = m?.["@_url"];
    if (u && !/\.(mp4|webm|mp3)(\?|$)/i.test(u)) return u;
  }
  const enc = lista(it.enclosure).find((e) => String(e?.["@_type"] ?? "").startsWith("image"));
  if (enc?.["@_url"]) return enc["@_url"];
  const html = texto(it["content:encoded"]) || texto(it.content) || texto(it.description);
  const m = html.match(/<img[^>]+src="([^"]+)"/i);
  return m?.[1] ?? "";
}

export function falaDeIA(s) {
  const t = ` ${String(s).toLowerCase().replace(/[.,:;!?()"'“”‘’]/g, " ")} `;
  return PALAVRAS_IA.some((p) => t.includes(p));
}

function recente(data, horas) {
  const t = Date.parse(data);
  if (Number.isNaN(t)) return true;
  return Date.now() - t < horas * 3600_000;
}

async function lerFeed(fonte) {
  const xml = await buscar(fonte.url);
  const doc = parser.parse(xml);
  const itens = doc.rss ? lista(doc.rss.channel?.item) : lista(doc.feed?.entry);
  const saida = [];
  for (const it of itens) {
    const url = (doc.rss ? texto(it.link) : linkAtom(it.link)).trim();
    const titulo = limparHtml(texto(it.title), 220);
    const corpo = texto(it.description) || texto(it.summary) || texto(it["content:encoded"]) || texto(it.content);
    const publicado = texto(it.pubDate) || texto(it.published) || texto(it.updated) || texto(it["dc:date"]);
    if (!url || !titulo) continue;
    if (!recente(publicado, HORAS_FEED)) continue;
    const resumo = limparHtml(corpo, 900);
    if (fonte.filtrar && !falaDeIA(`${titulo} ${resumo}`)) continue;
    saida.push({
      url,
      titulo,
      texto: resumo,
      fonte: fonte.nome,
      tipo: "noticia",
      publicado: Number.isNaN(Date.parse(publicado)) ? null : new Date(publicado).toISOString(),
      imagem: imagemDoItem(it),
      oficial: !!fonte.oficial,
      comunidade: !!fonte.comunidade,
      categoria: fonte.categoria ?? "ia",
    });
  }
  return saida.slice(0, 25);
}

const meta = (html, nome) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${nome}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0] ?? "";
  return tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "";
};

async function lerAnthropic() {
  const html = await buscar(ANTHROPIC.url);
  const categorias = new Set(["announcements", "features", "policy", "product", "research", "events"]);
  const slugs = [...new Set([...html.matchAll(/href="\/news\/([a-z0-9-]+)"/g)].map((m) => m[1]))]
    .filter((s) => !categorias.has(s));
  return slugs.map((slug) => {
    const url = `https://www.anthropic.com/news/${slug}`;
    return {
      url,
      titulo: slug.replace(/-/g, " "),
      texto: "",
      fonte: ANTHROPIC.nome,
      tipo: "noticia",
      publicado: null,
      imagem: "",
      oficial: true,
      comunidade: false,
      async enriquecer() {
        const pag = await buscar(url);
        this.titulo = limparHtml(meta(pag, "og:title") || this.titulo, 220).replace(/\s*\\?\|\s*Anthropic$/i, "");
        this.texto = limparHtml(meta(pag, "og:description") || meta(pag, "description"), 900);
        const corpo = limparHtml(pag.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? "", 1500);
        if (corpo) this.texto = `${this.texto} ${corpo}`.slice(0, 1500);
        this.imagem = meta(pag, "og:image");
        const data = pag.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1] || meta(pag, "article:published_time");
        if (data && !Number.isNaN(Date.parse(data))) {
          this.publicado = new Date(data).toISOString();
          if (!recente(data, 24 * 7)) this.antigo = true;
        } else {
          this.antigo = true; // sem data = página de categoria, não é notícia
        }
      },
    };
  });
}

async function lerHackerNews() {
  const r = await buscar("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=60", { json: true });
  return lista(r.hits)
    .filter((h) => (h.points ?? 0) >= HACKER_NEWS.pontosMinimos && falaDeIA(h.title))
    .map((h) => ({
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      titulo: limparHtml(h.title, 220),
      texto: `Em alta no Hacker News: ${h.points} pontos, ${h.num_comments ?? 0} comentários.`,
      fonte: HACKER_NEWS.nome,
      tipo: "noticia",
      publicado: h.created_at ?? null,
      imagem: "",
      oficial: false,
      comunidade: true,
    }));
}

function cabecalhoGitHub() {
  const h = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function lerReleases() {
  const saida = [];
  for (const repo of REPOS_VIGIADOS) {
    try {
      const rels = await buscar(`https://api.github.com/repos/${repo}/releases?per_page=3`, {
        json: true, headers: cabecalhoGitHub(),
      });
      for (const r of lista(rels)) {
        if (r.draft || r.prerelease || !recente(r.published_at, HORAS_RELEASE)) continue;
        saida.push({
          url: r.html_url,
          titulo: `${repo} ${r.name || r.tag_name}`.slice(0, 220),
          texto: limparHtml(r.body, 1800),
          fonte: "GitHub",
          tipo: "lancamento",
          publicado: r.published_at,
          imagem: `https://opengraph.githubassets.com/1/${repo}`,
          oficial: true,
          comunidade: false,
          repo,
        });
      }
    } catch (e) {
      console.warn(`  ! releases ${repo}: ${e.message}`);
    }
  }
  return saida;
}

async function lerEmAlta() {
  const desde = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const vistos = new Map();
  for (const topico of TOPICOS_GITHUB) {
    try {
      const q = encodeURIComponent(`topic:${topico} created:>${desde} stars:>=${ESTRELAS_MINIMAS}`);
      const r = await buscar(
        `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=10`,
        { json: true, headers: cabecalhoGitHub() },
      );
      for (const repo of lista(r.items)) {
        if (vistos.has(repo.html_url)) continue;
        vistos.set(repo.html_url, {
          url: repo.html_url,
          titulo: repo.full_name,
          texto: limparHtml(
            `${repo.description ?? ""}. Linguagem: ${repo.language ?? "não informada"}. ` +
              `${repo.stargazers_count} estrelas em ${Math.max(1, Math.round((Date.now() - Date.parse(repo.created_at)) / 86400_000))} dia(s). ` +
              `Tópicos: ${lista(repo.topics).join(", ")}.`,
            900,
          ),
          fonte: "GitHub",
          tipo: "github",
          publicado: repo.created_at,
          imagem: `https://opengraph.githubassets.com/1/${repo.full_name}`,
          oficial: false,
          comunidade: true,
          estrelas: repo.stargazers_count,
        });
      }
    } catch (e) {
      console.warn(`  ! em alta (${topico}): ${e.message}`);
    }
    // a busca do GitHub aceita poucos pedidos por minuto
    await new Promise((r) => setTimeout(r, process.env.GITHUB_TOKEN ? 2500 : 7000));
  }
  return [...vistos.values()];
}

/* Tira rastreadores do link para o mesmo artigo não entrar duas vezes. */
export function normalizarUrl(u) {
  try {
    const url = new URL(u);
    for (const p of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|ref_src|fbclid|gclid|mc_)/i.test(p)) url.searchParams.delete(p);
    }
    url.hash = "";
    return url.toString();
  } catch {
    return u;
  }
}

export async function coletarTudo() {
  const tarefas = [
    ...FEEDS.map((f) => ({ nome: f.nome, fn: () => lerFeed(f) })),
    { nome: "Anthropic", fn: lerAnthropic },
    { nome: "Hacker News", fn: lerHackerNews },
    { nome: "GitHub (versões)", fn: lerReleases },
    { nome: "GitHub (em alta)", fn: lerEmAlta },
  ];
  const resultados = await Promise.allSettled(tarefas.map((t) => t.fn()));
  const itens = [];
  const relatorio = [];
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") {
      relatorio.push(`${tarefas[i].nome}: ${r.value.length}`);
      itens.push(...r.value);
    } else {
      relatorio.push(`${tarefas[i].nome}: ERRO (${r.reason?.message ?? r.reason})`);
    }
  });
  const porUrl = new Map();
  for (const it of itens) {
    it.url = normalizarUrl(it.url);
    if (!porUrl.has(it.url)) porUrl.set(it.url, it);
  }
  return { itens: [...porUrl.values()], relatorio };
}
