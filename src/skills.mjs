/* Fila de skills (fase 2): para cada skill nova achada no GitHub, lê o README,
   pega as imagens do repositório e pede para a IA o rascunho da página. O
   resultado vai para a fila do painel /admin/skills do site, onde o Edmar
   testa e decide se publica. Nada aqui aparece no site sem ele aprovar. */

import { createHash } from "node:crypto";
import { buscar, cabecalhoGitHub } from "./coletar.mjs";
import { redigirSkill } from "./ia.mjs";

const CATEGORIAS = ["design", "video", "motion", "automacao", "outros"];
const MAX_IMAGENS = 6;

const limitar = (s, n) => {
  s = String(s ?? "").trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
};

export function slugSkill(repo) {
  const base = repo
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  const h = createHash("sha256").update(repo).digest("hex").slice(0, 4);
  return `${base || "skill"}-${h}`;
}

/* Selos (badges), contadores e ícones minúsculos não servem de imagem da página. */
const NAO_E_FOTO = /shields\.io|badge|badgen|\/workflows\/|star-history|visitor|hits\.|komarev|contrib\.rocks|codecov|vercel\.com\/button|deploy-button|buymeacoffee|ko-fi|sponsor|\.svg(\?|$)/i;

export function imagensDoReadme(md, repo, branch) {
  const achadas = [];
  const re = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|<img[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(md))) {
    let src = (m[1] || m[2] || "").trim();
    if (!src || src.startsWith("data:")) continue;
    if (!/^https?:\/\//i.test(src)) {
      src = `https://raw.githubusercontent.com/${repo}/${branch}/${src.replace(/^\.?\//, "")}`;
    }
    src = src
      .replace(/^http:\/\//i, "https://")
      .replace(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/(?:blob|raw)\/(.+)$/i, "https://raw.githubusercontent.com/$1/$2");
    if (NAO_E_FOTO.test(src) || src.length > 600) continue;
    if (!achadas.includes(src)) achadas.push(src);
    if (achadas.length >= MAX_IMAGENS) break;
  }
  return achadas;
}

/* README em texto, sem HTML e sem selos, para a IA ler. */
function readmeLimpo(md) {
  return md
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[!\[[^\]]*\][^\]]*\]\([^)]*\)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function lerReadme(repo) {
  return buscar(`https://api.github.com/repos/${repo}/readme`, {
    headers: { ...cabecalhoGitHub(), Accept: "application/vnd.github.raw+json" },
  });
}

/* Monta os rascunhos. Devolve { fila, vistos }:
   fila  = registros para radar_skill_queue
   vistos = links já resolvidos (na fila ou descartados pela IA). Os que deram
            erro ficam de fora e são tentados de novo na próxima rodada. */
export async function prepararSkills(lista) {
  const fila = [];
  const vistos = [];
  for (const s of lista) {
    let md;
    try {
      md = await lerReadme(s.repo);
    } catch (e) {
      if (/^404/.test(e.message)) {
        vistos.push(s.url); // sem README: não dá para explicar a skill
        console.log(`  skill sem README: ${s.repo}`);
      } else {
        console.warn(`  ! README de ${s.repo}: ${e.message}`);
      }
      continue;
    }
    const r = await redigirSkill(s, readmeLimpo(md));
    await new Promise((ok) => setTimeout(ok, 6500)); // plano grátis: poucos pedidos por minuto
    if (!r) continue; // IA falhou: tenta de novo depois
    vistos.push(s.url);
    if (!r.relevante || !r.titulo || !r.resumo) {
      console.log(`  skill descartada pela IA: ${s.repo}`);
      continue;
    }
    fila.push({
      slug: slugSkill(s.repo),
      repo: s.repo,
      repo_url: s.url,
      name: limitar(r.nome || s.repo.split("/")[1], 110),
      title: limitar(r.titulo, 150),
      summary: limitar(r.resumo, 1100),
      audience: limitar(r.para_quem, 560),
      install: (Array.isArray(r.instalar) ? r.instalar : []).slice(0, 6).map((p) => limitar(p, 300)).filter(Boolean),
      usage: limitar(r.como_usar, 760),
      category: CATEGORIAS.includes(r.categoria) ? r.categoria : "outros",
      tags: (Array.isArray(r.tags) ? r.tags : []).slice(0, 4).map((t) => limitar(String(t).toLowerCase(), 30)),
      stars: Number(s.estrelas) || 0,
      language: limitar(s.linguagem, 58),
      license: limitar(s.licenca, 58),
      image_url: s.imagem,
      images: imagensDoReadme(md, s.repo, s.branch || "main"),
      repo_created_at: s.publicado ?? null,
    });
    console.log(`  skill na fila: ${s.repo} → ${r.titulo}`);
  }
  return { fila, vistos };
}
