/* Imagem e vídeo de cada notícia (pedido do Edmar em 19/11: toda notícia sobe
   com imagem, e vídeo quando houver, porque as pessoas preferem ver a ler).

   Ordem para achar a imagem:
   1. a imagem de destaque da própria matéria (og:image / twitter:image), que é
      a mesma que o Google mostra na busca e no Discover;
   2. a imagem de outra matéria sobre o mesmo fato (mesmo assunto);
   3. a foto ou o logo da empresa/produto principal na Wikipédia.
   Sem nenhuma das três, a notícia não é publicada.

   Vídeo: og:video, player do YouTube/Vimeo embutido na matéria ou <video> mp4. */

const AGENTE = "Mozilla/5.0 (compatible; RadarIA/1.0; +https://edmarcastro.com.br/noticias)";

const decodificar = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

function absoluto(u, base) {
  try {
    const url = new URL(decodificar(u), base);
    if (url.protocol === "http:") url.protocol = "https:";
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/* Valor de <meta property|name="X" content="..."> em qualquer ordem de atributos. */
function meta(html, nomes) {
  for (const nome of nomes) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${nome}["'][^>]*>`, "i");
    const tag = html.match(re)?.[0];
    const valor = tag?.match(/content=["']([^"']+)["']/i)?.[1];
    if (valor) return valor;
  }
  return null;
}

/* Imagens que não servem de capa: logo genérico, pixel, avatar, ícone. */
const NAO_E_CAPA = /favicon|sprite|pixel|spacer|1x1|blank\.(gif|png)|gravatar|avatar|apple-touch-icon|\/icons?\//i;

export function normalizarVideo(u) {
  if (!u) return null;
  const yt = u.match(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/|v\/)|youtu\.be\/)([\w-]{11})/i);
  if (yt) return `https://www.youtube.com/watch?v=${yt[1]}`;
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d{6,})/i);
  // vídeo não listado do Vimeo só abre com o código h= junto
  const h = u.match(/[?&]h=([0-9a-f]{6,})/i)?.[1];
  if (vm) return `https://player.vimeo.com/video/${vm[1]}${h ? `?h=${h}` : ""}`;
  if (/^https:\/\/[^\s"']+\.(mp4|webm)(\?[^\s"']*)?$/i.test(u)) return u;
  return null;
}

/* Abre a matéria e devolve { imagem, video } (cada um pode vir null). */
export async function lerMidia(url) {
  let html;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": AGENTE, Accept: "text/html" },
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
    });
    if (!r.ok) return { imagem: null, video: null };
    html = (await r.text()).slice(0, 600_000);
  } catch {
    return { imagem: null, video: null };
  }

  let imagem = meta(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]);
  if (!imagem) imagem = html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? null;
  imagem = imagem ? absoluto(imagem, url) : null;
  if (imagem && (NAO_E_CAPA.test(imagem) || imagem.length > 600)) imagem = null;

  const candidatos = [
    meta(html, ["og:video:secure_url", "og:video:url", "og:video", "twitter:player"]),
    ...[...html.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]),
    ...[...html.matchAll(/<video[^>]*>[\s\S]*?<\/video>|<video[^>]+src=["'][^"']+["']/gi)].map(
      (m) => m[0].match(/src=["']([^"']+\.(?:mp4|webm)[^"']*)["']/i)?.[1],
    ),
  ];
  let video = null;
  for (const c of candidatos) {
    if (!c) continue;
    const abs = absoluto(c, url);
    video = normalizarVideo(abs);
    if (video) break;
  }
  return { imagem, video: video && video.length <= 600 ? video : null };
}

/* Foto ou logo da empresa/produto na Wikipédia (sem chave, grátis). */
export async function imagemDaWikipedia(termo) {
  if (!termo || termo.length > 60) return null;
  for (const lingua of ["en", "pt"]) {
    try {
      const q = new URLSearchParams({
        action: "query",
        prop: "pageimages",
        piprop: "thumbnail",
        pithumbsize: "1200",
        titles: termo,
        redirects: "1",
        format: "json",
        origin: "*",
      });
      const r = await fetch(`https://${lingua}.wikipedia.org/w/api.php?${q}`, {
        headers: { "User-Agent": AGENTE },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) continue;
      const j = await r.json();
      const pagina = Object.values(j.query?.pages ?? {})[0];
      const src = pagina?.thumbnail?.source;
      if (src && src.length <= 600) return src;
    } catch {
      /* tenta a próxima língua */
    }
  }
  return null;
}

/* A imagem abre fora do site de origem? (alguns jornais bloqueiam: erro 403) */
export async function imagemAbre(url) {
  if (!url || !/^https:\/\//.test(url)) return false;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36", Range: "bytes=0-2047" },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    const tipo = r.headers.get("content-type") ?? "";
    await r.body?.cancel().catch(() => {});
    if (r.status === 429) return true; // limite de pedidos do servidor, não bloqueio: não dá para saber, aceita
    return (r.status === 200 || r.status === 206) && tipo.startsWith("image/");
  } catch {
    return false;
  }
}

/* Capa automática do GitHub (fundo branco com o nome do repositório escrito)
   não chama atenção nem deixa ler o título por cima. Para projetos do GitHub,
   a capa vira a primeira imagem do README (print ou GIF de demonstração). */
export const capaAutomaticaGitHub = (u) => !!u && u.includes("opengraph.githubassets.com");

export async function imagemDoGitHub(url) {
  const m = url?.match(/^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/i);
  if (!m) return null;
  const repo = `${m[1]}/${m[2]}`;
  const { imagensDoReadme } = await import("./skills.mjs");
  const cab = { Accept: "application/vnd.github.raw+json", "User-Agent": AGENTE };
  if (process.env.GITHUB_TOKEN) cab.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/readme`, { headers: cab, signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return null;
    const md = await r.text();
    const branch = (await fetch(`https://api.github.com/repos/${repo}`, { headers: { ...cab, Accept: "application/vnd.github+json" } })
      .then((x) => (x.ok ? x.json() : {}))
      .catch(() => ({}))).default_branch || "main";
    for (const img of imagensDoReadme(md, repo, branch)) {
      if (/logo|icon|banner-small|avatar/i.test(img)) continue;
      if (await imagemAbre(img)) return img;
    }
  } catch {
    /* sem README legível: fica sem */
  }
  return null;
}

/* ------------------------ matéria longa (nota 4 e 5) ------------------------
   Pedido do Edmar em 25/11, a partir da matéria do Images 2.6 da OpenAI: a
   matéria grande vira uma sequência para ver, com imagem ou vídeo a cada seção.
   lerMateria abre a página da fonte e devolve o texto corrido e as mídias que
   estão dentro da matéria (na ordem em que aparecem). */

const tirarTags = (h) =>
  decodificar(
    h
      .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|figure)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|h[1-6]|li|blockquote|div|section)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

/* O trecho da página que é a matéria: <article>, senão <main>, senão o <body>. */
function trechoDaMateria(html) {
  const art = [...html.matchAll(/<article[\s>][\s\S]*?<\/article>/gi)].map((m) => m[0]).sort((a, b) => b.length - a.length)[0];
  if (art && art.length > 1500) return art;
  const main = html.match(/<main[\s>][\s\S]*<\/main>/i)?.[0];
  if (main && main.length > 1500) return main;
  return html.match(/<body[\s>][\s\S]*<\/body>/i)?.[0] ?? html;
}

/* Maior imagem de um srcset (o último item costuma ser o maior). */
function doSrcset(s) {
  const itens = s.split(",").map((x) => x.trim().split(/\s+/));
  let melhor = null;
  let maior = 0;
  for (const [u, w] of itens) {
    const n = parseInt(w) || 1;
    if (u && n >= maior) {
      maior = n;
      melhor = u;
    }
  }
  return melhor;
}

export async function lerMateria(url) {
  let html;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36", Accept: "text/html" },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });
    if (!r.ok) return { texto: "", midias: [] };
    html = (await r.text()).slice(0, 1_500_000);
  } catch {
    return { texto: "", midias: [] };
  }
  let trecho = trechoDaMateria(html);
  // corta o "continue lendo" / "leia também" do fim (capas de outras matérias)
  const fim = trecho.search(/>\s*(Continuar lendo|Continue lendo|Leia também|Leia mais|Veja também|Mais lidas|Related( articles| stories)?|Keep reading|Read more|More from)\s*</i);
  if (fim > 1500) trecho = trecho.slice(0, fim);
  const texto = tirarTags(trecho).slice(0, 9000);

  const midias = [];
  const vistos = new Set();
  const por = (tipo, bruto, legenda) => {
    if (!bruto || midias.length >= 14) return;
    const abs = absoluto(bruto, url);
    if (!abs || abs.length > 600 || vistos.has(abs)) return;
    if (tipo === "video") {
      const v = normalizarVideo(abs);
      if (!v || vistos.has(v)) return;
      vistos.add(v);
      midias.push({ tipo: "video", url: v, legenda });
      return;
    }
    if (NAO_E_CAPA.test(abs) || /\.svg(\?|$)|data:/i.test(abs)) return;
    vistos.add(abs);
    midias.push({ tipo: "imagem", url: abs, legenda });
  };

  // imagens, vídeos e players na ordem em que aparecem na matéria
  const re = /<img\b[^>]*>|<video\b[\s\S]*?<\/video>|<iframe\b[^>]*>|<figcaption[^>]*>[\s\S]*?<\/figcaption>/gi;
  for (const m of trecho.matchAll(re)) {
    const tag = m[0];
    if (/^<figcaption/i.test(tag)) {
      // legenda da figura: vale para a última mídia sem legenda
      const ult = midias.at(-1);
      if (ult && !ult.legenda) ult.legenda = tirarTags(tag).slice(0, 220);
      continue;
    }
    const alt = decodificar(tag.match(/\b(?:alt|aria-label|title)=["']([^"']*)["']/i)?.[1] ?? "").slice(0, 220);
    if (/^<img/i.test(tag)) {
      const larg = parseInt(tag.match(/\bwidth=["']?(\d+)/i)?.[1] ?? "0");
      if (larg && larg < 300) continue; // ícone, avatar, logo pequeno
      const srcset = tag.match(/\b(?:data-srcset|srcset)=["']([^"']+)["']/i)?.[1];
      const src = (srcset && doSrcset(srcset)) || tag.match(/\b(?:data-src|data-lazy-src|src)=["']([^"']+)["']/i)?.[1];
      por("imagem", src, alt);
    } else if (/^<video/i.test(tag)) {
      const src = tag.match(/\bsrc=["']([^"']+\.(?:mp4|webm)[^"']*)["']/i)?.[1];
      por("video", src, alt);
    } else {
      por("video", tag.match(/\bsrc=["']([^"']+)["']/i)?.[1], alt);
    }
  }

  // players que a página monta por script (ex.: OpenAI guarda o Vimeo no JSON da página)
  const BS = String.fromCharCode(92); // barra invertida do JSON escapado
  const sem = html.split(BS + "u0026").join("&").split(BS + "/").join("/").split(BS + String.fromCharCode(34)).join(String.fromCharCode(34));
  for (const m of sem.matchAll(/https:\/\/(?:player\.vimeo\.com\/video\/\d{6,}[^"'\s\<]*|www\.youtube(?:-nocookie)?\.com\/embed\/[\w-]{11})/g)) {
    const antes = sem.slice(Math.max(0, m.index - 400), m.index);
    const leg = [...antes.matchAll(/"(?:altText|alt|caption|title|videoEmbedTitle)"\s*:\s*"([^"]{4,220})/g)].at(-1)?.[1] ?? "";
    por("video", m[0], decodificar(leg));
  }

  // só fica imagem que abre fora do site de origem
  const ok = await Promise.all(midias.map((m) => (m.tipo === "imagem" ? imagemAbre(m.url) : true)));
  return { texto, midias: midias.filter((_, i) => ok[i]).slice(0, 10) };
}
