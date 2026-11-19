/* Uma rodada do Radar IA. O GitHub Actions chama isto a cada 15 minutos.

   node src/rodar.mjs           rodada normal
   node src/rodar.mjs --teste   só mostra o que faria (não grava, não posta)
   node src/rodar.mjs --semear  primeira vez: marca tudo como visto e publica
                                as mais recentes no portal, sem Telegram */

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { coletarTudo } from "./coletar.mjs";
import { iaLigada, redigir, usoReserva } from "./ia.mjs";
import { bancoLigado, enfileirarSkills, gravar, marcar, naoVistos, recentes } from "./banco.mjs";
import { prepararSkills } from "./skills.mjs";
import { avisarBuscadores } from "./indexnow.mjs";
import { capaAutomaticaGitHub, imagemAbre, imagemDaWikipedia, imagemDoGitHub, lerMidia } from "./midia.mjs";
import { alertaLigado, avisarEdmar, mensagem, postarNoCanal, telegramLigado } from "./telegram.mjs";

try {
  process.loadEnvFile();
} catch {
  /* sem .env local: no GitHub as variáveis vêm dos Secrets */
}

const TESTE = process.argv.includes("--teste");
const SEMEAR = process.argv.includes("--semear");
const SITE = (process.env.SITE_URL || "https://edmarcastro.com.br").replace(/\/$/, "");
const MAX_ANALISE = 40; // itens novos analisados por rodada
const MAX_SEMEAR = 45; // notícias publicadas no portal na primeira vez (até 3 por fonte)
const MAX_CANAL = 4; // posts no canal por rodada
const FONTES_SUPER = 3; // fontes diferentes no mesmo assunto = super notícia
const HORAS_ASSUNTO = 6;
const NOTA_MINIMA = 3; // abaixo disso a notícia não entra no portal
const MAX_SKILLS = 6; // skills novas preparadas por rodada (um pedido de IA cada)
const TEMPO_SKILLS_MS = 14 * 60_000; // depois disso não começa skill nova (a rodada tem 20 min)

const linkPortal = (slug) => `${SITE}/noticias/${slug}`;

function slugify(titulo, url) {
  const base = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  const h = createHash("sha256").update(url).digest("hex").slice(0, 6);
  return `${base || "noticia"}-${h}`;
}

/* Prioridade de análise: oficiais e versões primeiro, depois as mais novas. */
function prioridade(a, b) {
  const peso = (x) => (x.oficial ? 2 : 0) + (x.tipo === "lancamento" ? 1 : 0);
  return peso(b) - peso(a) || Date.parse(b.publicado ?? 0) - Date.parse(a.publicado ?? 0);
}

function limitar(s, n) {
  s = String(s ?? "").trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

export async function principal() {
  const inicio = Date.now();
  console.log(`Radar IA · ${new Date().toISOString()}${TESTE ? " · TESTE" : ""}${SEMEAR ? " · SEMEAR" : ""}`);
  console.log(`  banco: ${bancoLigado() ? "ok" : "desligado"} · IA: ${iaLigada() ? "ok" : "desligada"} · canal: ${telegramLigado() ? "ok" : "desligado"} · alerta: ${alertaLigado() ? "ok" : "desligado"}`);

  if (!TESTE && !bancoLigado()) throw new Error("Faltam SUPABASE_URL, SUPABASE_CHAVE_PUBLICA ou RADAR_TOKEN.");
  if (!TESTE && !SEMEAR && !iaLigada()) throw new Error("Falta OPENAI_CHAVE (ou GEMINI_CHAVE): sem ela o radar não escreve em português.");

  // 1. Coleta
  const { itens, relatorio } = await coletarTudo();
  console.log(`  coletados: ${itens.length}\n    ${relatorio.join("\n    ")}`);

  // 2. Só o que é novo
  const novosUrls = new Set(bancoLigado() ? await naoVistos(itens.map((i) => i.url)) : itens.map((i) => i.url));
  let novos = itens.filter((i) => novosUrls.has(i.url)).sort(prioridade);
  // skills vão para a fila do painel (o Edmar testa antes), não para o portal
  const novasSkills = novos.filter((i) => i.skill).sort((a, b) => (b.estrelas ?? 0) - (a.estrelas ?? 0));
  novos = novos.filter((i) => !i.skill);
  console.log(`  novos: ${novos.length} · skills novas: ${novasSkills.length}`);

  if (SEMEAR) {
    // até 3 das mais recentes de cada fonte, para todas as editorias começarem cheias
    const porFonte = new Map();
    for (const i of [...novos].sort((a, b) => Date.parse(b.publicado ?? 0) - Date.parse(a.publicado ?? 0))) {
      if (i.enriquecer) continue;
      const k = `${i.fonte}|${i.categoria ?? ""}|${i.tipo}`;
      if (!porFonte.has(k)) porFonte.set(k, []);
      if (porFonte.get(k).length < 3) porFonte.get(k).push(i);
    }
    const publicar = iaLigada() ? [...porFonte.values()].flat().slice(0, MAX_SEMEAR) : [];
    const analisados = await processar(publicar);
    if (!TESTE) {
      // marca tudo como visto (inclusive o que não foi publicado), menos as
      // skills: essas as rodadas normais preparam para a fila do painel
      const todos = itens.filter((i) => !i.skill).map((i) => i.url);
      for (let k = 0; k < todos.length; k += 300) {
        await gravar(k === 0 ? analisados.registros : [], todos.slice(k, k + 300));
      }
    }
    console.log(`  semeado: ${itens.length} links marcados como vistos, ${analisados.registros.length} no portal.`);
    return;
  }

  const analisar = novos.slice(0, MAX_ANALISE);
  const { registros, vistos } = await processar(analisar);

  if (TESTE) {
    console.log("\n  O QUE SERIA PUBLICADO:");
    for (const r of registros) console.log(`   [${r.importance}] ${r.title}\n        ${r.source_name} · ${r.topic_key ?? "-"} · ${r.source_url}`);
    if (iaLigada() && novasSkills.length) {
      const { fila } = await prepararSkills(novasSkills.slice(0, 2));
      console.log("\n  SKILLS QUE IRIAM PARA A FILA (amostra de 2):");
      for (const f of fila) console.log(`   [${f.category}] ${f.title}\n        ${f.repo} · ${f.images.length} imagem(ns) · ${f.install.length} passo(s)`);
    }
    return;
  }

  // 3. Grava
  const inseridos = vistos.length || registros.length ? (await gravar(registros, vistos)) ?? [] : [];
  console.log(`  publicados no portal: ${inseridos.length}`);
  if (inseridos.length) await avisarBuscadores(inseridos.map((x) => linkPortal(x.slug)), SITE);

  // 4. Super notícia e Telegram
  await superNoticiaETelegram(inseridos);

  // 5. Skills novas → fila do painel /admin/skills
  // Uma por vez, gravando na hora: se a rodada for cortada, o que ficou pronto não se perde
  let naFila = 0;
  for (const s of novasSkills.slice(0, MAX_SKILLS)) {
    if (Date.now() - inicio > TEMPO_SKILLS_MS) {
      console.log("  skills: tempo da rodada acabando, o resto fica para a próxima");
      break;
    }
    try {
      const { fila, vistos: skillsVistas } = await prepararSkills([s]);
      if (fila.length || skillsVistas.length) naFila += ((await enfileirarSkills(fila, skillsVistas)) ?? []).length;
    } catch (e) {
      console.warn(`  ! fila de skills (${s.repo}): ${e.message}`);
    }
  }
  if (novasSkills.length) console.log(`  skills na fila do painel: ${naFila}`);
  if (usoReserva.pedidos) console.log(`  pedidos à IA paga nesta rodada: ${usoReserva.pedidos}`);
  console.log(`  fim em ${Math.round((Date.now() - inicio) / 1000)} s`);
}

/* Abre as páginas que faltam e manda para a IA. */
async function processar(lista) {
  const vistos = [];
  const prontos = [];
  for (const it of lista) {
    if (it.enriquecer) {
      try {
        await it.enriquecer();
      } catch (e) {
        console.warn(`  ! não abriu ${it.url}: ${e.message}`);
        continue; // tenta de novo na próxima rodada
      }
      if (it.antigo) {
        vistos.push(it.url);
        continue;
      }
    }
    prontos.push(it);
  }
  if (!prontos.length) return { registros: [], vistos };

  if (!iaLigada()) {
    if (TESTE) {
      console.log("\n  (IA desligada: mostrando o original)");
      for (const it of prontos) console.log(`   · ${it.fonte} [${it.tipo}] ${it.titulo}\n        ${it.url}`);
    }
    return { registros: [], vistos: [] };
  }

  let assuntos = [];
  if (bancoLigado()) {
    try {
      const rec = (await recentes(HORAS_ASSUNTO)) ?? [];
      const vistosChave = new Set();
      for (const n of rec) {
        if (n.topic_key && !vistosChave.has(n.topic_key)) {
          vistosChave.add(n.topic_key);
          assuntos.push({ chave: n.topic_key, titulo: n.title });
        }
      }
      assuntos = assuntos.slice(0, 60);
    } catch (e) {
      console.warn(`  ! não leu assuntos recentes: ${e.message}`);
    }
  }

  const respostas = await redigir(prontos, assuntos);
  const registros = [];
  prontos.forEach((it, i) => {
    const r = respostas[i];
    if (!r) return; // IA falhou: não marca como visto, tenta de novo depois
    vistos.push(it.url);
    if (!r.relevante || !r.titulo || !r.resumo) return;
    // o portal é curado: nota 1 ou 2 fica de fora (já conta como visto)
    if (Math.round(Number(r.importancia) || 3) < NOTA_MINIMA) return;
    const titulo = limitar(r.titulo, 200);
    registros.push({
      slug: slugify(titulo, it.url),
      kind: it.tipo,
      category: ["ia", "tecnologia", "games", "internet"].includes(r.categoria) ? r.categoria : (it.categoria ?? "ia"),
      title: titulo,
      summary: limitar(r.resumo, 1100),
      why: limitar(r.porque, 560),
      source_name: limitar(it.fonte, 80),
      source_url: it.url,
      image_url: it.imagem && it.imagem.length <= 600 && /^https:\/\//.test(it.imagem) ? it.imagem : "",
      importance: Math.min(5, Math.max(1, Math.round(Number(r.importancia) || 3))),
      topic_key: limitar(String(r.assunto ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "-"), 80) || null,
      tags: (Array.isArray(r.tags) ? r.tags : []).slice(0, 3).map((t) => limitar(String(t).toLowerCase(), 30)),
      published_at: it.publicado ?? new Date().toISOString(),
      oficial: it.oficial,
      entidade: limitar(r.entidade, 60),
    });
  });
  return { registros: await comMidia(registros), vistos };
}

/* Toda notícia sobe com imagem; vídeo quando a matéria tiver (ver midia.mjs). */
async function comMidia(registros) {
  for (let i = 0; i < registros.length; i += 6) {
    await Promise.all(
      registros.slice(i, i + 6).map(async (r) => {
        const m = await lerMidia(r.source_url);
        // só vale imagem que abre fora do site de origem (alguns jornais bloqueiam)
        if (r.image_url && !(await imagemAbre(r.image_url))) r.image_url = "";
        if (!r.image_url && m.imagem && (await imagemAbre(m.imagem))) r.image_url = m.imagem;
        // projeto do GitHub: a capa automática (branca, só texto) dá lugar à imagem do README
        if ((!r.image_url || capaAutomaticaGitHub(r.image_url)) && /^https:\/\/github\.com\//.test(r.source_url)) {
          r.image_url = (await imagemDoGitHub(r.source_url)) ?? r.image_url;
        }
        if (m.video) r.video_url = m.video;
      }),
    );
  }
  // sem imagem própria: a de outra matéria sobre o mesmo fato
  let rec = [];
  if (registros.some((r) => !r.image_url) && bancoLigado()) rec = (await recentes(HORAS_ASSUNTO).catch(() => [])) ?? [];
  for (const r of registros.filter((x) => !x.image_url && x.topic_key)) {
    const irma = [...registros, ...rec].find((o) => o !== r && o.topic_key === r.topic_key && o.image_url);
    if (irma) r.image_url = irma.image_url;
  }
  // por último, a foto ou o logo da empresa/produto na Wikipédia
  for (const r of registros.filter((x) => !x.image_url && x.entidade)) {
    const wiki = await imagemDaWikipedia(r.entidade);
    r.image_url = wiki && (await imagemAbre(wiki)) ? wiki : "";
  }
  const semImagem = registros.filter((r) => !r.image_url);
  for (const r of semImagem) console.log(`  sem imagem, não publicada: ${r.title}`);
  return registros.filter((r) => r.image_url);
}

async function superNoticiaETelegram(inseridos) {
  const rec = (await recentes(HORAS_ASSUNTO)) ?? [];
  const idsNovos = new Set(inseridos.map((x) => x.id));

  // Agrupa por assunto e conta fontes diferentes
  const grupos = new Map();
  for (const n of rec) {
    if (!n.topic_key) continue;
    if (!grupos.has(n.topic_key)) grupos.set(n.topic_key, []);
    grupos.get(n.topic_key).push(n);
  }

  const novasSuper = [];
  for (const [, lista] of grupos) {
    const fontes = new Set(lista.map((n) => n.source_name)).size;
    const jaEra = lista.some((n) => n.is_breaking);
    const temNovo = lista.some((n) => idsNovos.has(n.id));
    if (!jaEra && temNovo && fontes >= FONTES_SUPER) {
      // a "manchete" é a de maior importância; empate: a mais antiga
      const capa = [...lista].sort((a, b) => b.importance - a.importance || Date.parse(a.created_at) - Date.parse(b.created_at))[0];
      novasSuper.push({ capa, fontes });
    }
  }
  // Anúncio oficial nota 5 também é super notícia, mesmo com uma fonte só
  for (const n of rec) {
    if (idsNovos.has(n.id) && n.importance === 5 && !n.is_breaking && /OpenAI|Anthropic|Google/.test(n.source_name)
        && !novasSuper.some((s) => s.capa.topic_key && s.capa.topic_key === n.topic_key)) {
      novasSuper.push({ capa: n, fontes: grupos.get(n.topic_key)?.length ?? 1 });
    }
  }

  if (novasSuper.length) {
    await marcar(novasSuper.map((s) => s.capa.id), { superNoticia: true });
    console.log(`  SUPER NOTÍCIA: ${novasSuper.map((s) => s.capa.title).join(" | ")}`);
  }

  // Alerta no privado
  if (alertaLigado()) {
    for (const s of novasSuper) {
      try {
        await avisarEdmar(`🔴 <b>Super notícia no radar</b> (${s.fontes} fonte${s.fontes > 1 ? "s" : ""})\n\n` +
          mensagem(s.capa, linkPortal(s.capa.slug)));
      } catch (e) {
        console.warn(`  ! alerta: ${e.message}`);
      }
    }
  }

  if (!telegramLigado()) return;

  // Canal: super notícias primeiro, depois as novas de IA com nota 4 ou 5 e
  // as de tecnologia, games e internet só com nota 5 (o canal é de IA)
  const assuntosPostados = new Set(rec.filter((n) => n.telegram_at && n.topic_key).map((n) => n.topic_key));
  const fila = [];
  for (const s of novasSuper) {
    if (!s.capa.telegram_at) fila.push({ n: s.capa, superNoticia: true, fontes: s.fontes });
  }
  const novosRec = rec
    .filter((n) => idsNovos.has(n.id) && !n.telegram_at && n.importance >= (n.category === "ia" ? 4 : 5))
    .sort((a, b) => b.importance - a.importance);
  for (const n of novosRec) {
    if (fila.some((f) => f.n.id === n.id)) continue;
    if (n.topic_key && assuntosPostados.has(n.topic_key)) continue; // mesmo fato já foi pro canal
    fila.push({ n, superNoticia: false, fontes: 1 });
  }

  const enviados = [];
  for (const f of fila.slice(0, MAX_CANAL)) {
    if (f.n.topic_key && assuntosPostados.has(f.n.topic_key) && !f.superNoticia) continue;
    try {
      await postarNoCanal(mensagem(f.n, linkPortal(f.n.slug), { superNoticia: f.superNoticia, fontes: f.fontes }));
      enviados.push(f.n.id);
      if (f.n.topic_key) assuntosPostados.add(f.n.topic_key);
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      console.warn(`  ! canal: ${e.message}`);
    }
  }
  if (enviados.length) await marcar(enviados, { telegram: true });
  console.log(`  postados no canal: ${enviados.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((e) => {
    console.error(`ERRO: ${e.message}`);
    process.exitCode = 1;
  });
}
