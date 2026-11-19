/* Radar da semana por e-mail (isca 2 do portal, 19/11).

   Toda sexta de manhã o GitHub Actions roda isto: pega as 5 notícias mais
   fortes dos últimos 7 dias (com imagem, uma por assunto) e 1 skill, monta o
   e-mail no visual do portal e manda pela Resend para quem se inscreveu.
   Cada e-mail leva o link de descadastro da própria pessoa (LGPD).

   node src/newsletter.mjs --previa   só gera newsletter-previa.html (não envia)
   node src/newsletter.mjs --teste    envia só para NEWSLETTER_TESTE
   node src/newsletter.mjs            envia para a lista */

import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

try {
  process.loadEnvFile();
} catch {
  /* no GitHub as variáveis vêm dos Secrets */
}

const SITE = (process.env.SITE_URL || "https://edmarcastro.com.br").replace(/\/$/, "");
const PREVIA = process.argv.includes("--previa");
const TESTE = process.argv.includes("--teste");
const UTM = "utm_source=radar-email&utm_medium=email&utm_campaign=radar-semanal";
const CATEGORIA = { ia: "Inteligência Artificial", tecnologia: "Tecnologia", games: "Games", internet: "Internet" };

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const primeiraFrase = (t) => {
  const s = String(t ?? "").trim();
  const m = s.match(/^.{40,240}?[.!?](\s|$)/);
  return (m ? m[0] : s.slice(0, 200)).trim();
};

async function lerPublico(tabela, params) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${tabela}?${params}`, {
    headers: { apikey: process.env.SUPABASE_CHAVE_PUBLICA, Authorization: `Bearer ${process.env.SUPABASE_CHAVE_PUBLICA}` },
  });
  if (!r.ok) throw new Error(`leitura de ${tabela}: ${r.status}`);
  return r.json();
}

/* As 5 da semana: maior nota primeiro, com imagem, uma por assunto. */
export async function escolherConteudo() {
  const desde = new Date(Date.now() - 7 * 86400_000).toISOString();
  const noticias = await lerPublico(
    "news",
    `select=slug,title,summary,why,category,kind,image_url,video_url,topic_key,importance,created_at&created_at=gte.${desde}&image_url=not.is.null&order=importance.desc,created_at.desc&limit=80`,
  );
  const assuntos = new Set();
  const escolhidas = [];
  for (const n of noticias) {
    if (n.kind !== "noticia" && escolhidas.length < 4) continue; // notícia primeiro; versão/repo só completa
    const chave = n.topic_key || n.slug;
    if (assuntos.has(chave)) continue;
    assuntos.add(chave);
    escolhidas.push(n);
    if (escolhidas.length === 5) break;
  }
  for (const n of noticias) {
    if (escolhidas.length === 5) break;
    if (!escolhidas.includes(n) && !assuntos.has(n.topic_key || n.slug)) escolhidas.push(n);
  }
  const [skill] = await lerPublico(
    "skills",
    "select=slug,title,summary,edmar_note,edmar_take,image_url,images&status=eq.publicada&order=published_at.desc&limit=1",
  ).catch(() => []);
  return { noticias: escolhidas, skill: skill ?? null };
}

export function montarEmail({ noticias, skill }, linkSair) {
  const [capa, ...resto] = noticias;
  const assunto = `Radar da semana: ${capa?.title ?? "IA, design e motion"}`.slice(0, 90);
  const linkDe = (slug) => `${SITE}/noticias/${slug}?${UTM}`;

  const kicker = (n) =>
    `<p style="margin:0 0 6px;font:600 11px/1.2 'IBM Plex Mono',Consolas,monospace;letter-spacing:1.6px;text-transform:uppercase;color:#ff5a1f">${esc(CATEGORIA[n.category] ?? "Notícia")}${n.video_url ? " · com vídeo" : ""}</p>`;

  /* manchete: imagem grande; as outras: miniatura ao lado do título */
  const bloco = (n, grande) =>
    grande
      ? `
    <tr><td style="padding:0 0 26px">
      <a href="${linkDe(n.slug)}" style="text-decoration:none;color:#141311;display:block">
        <img src="${esc(n.image_url)}" width="552" alt="" style="display:block;width:100%;max-width:552px;height:auto;border-radius:8px;border:0;background:#dcdad5">
        <div style="height:14px;line-height:14px">&nbsp;</div>
        ${kicker(n)}
        <p style="margin:0;font:800 26px/1.08 Archivo,Arial,sans-serif;letter-spacing:-0.5px;color:#141311">${esc(n.title)}</p>
        <p style="margin:8px 0 0;font:400 15px/1.5 Arial,sans-serif;color:#4a4741">${esc(primeiraFrase(n.summary))}</p>
        <p style="margin:10px 0 0;font:700 14px/1 Arial,sans-serif;color:#ff5a1f">${n.video_url ? "Ver o vídeo" : "Ler no portal"} &rarr;</p>
      </a>
    </td></tr>`
      : `
    <tr><td style="padding:20px 0;border-top:1px solid #e3e1dc">
      <a href="${linkDe(n.slug)}" style="text-decoration:none;color:#141311;display:block">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="150" valign="top" style="padding-right:16px"><img src="${esc(n.image_url)}" width="150" alt="" style="display:block;width:150px;height:auto;border-radius:6px;border:0;background:#dcdad5"></td>
          <td valign="top">
            ${kicker(n)}
            <p style="margin:0;font:800 17px/1.2 Archivo,Arial,sans-serif;letter-spacing:-0.3px;color:#141311">${esc(n.title)}</p>
            <p style="margin:8px 0 0;font:700 13px/1 Arial,sans-serif;color:#ff5a1f">${n.video_url ? "Ver o vídeo" : "Ler"} &rarr;</p>
          </td>
        </tr></table>
      </a>
    </td></tr>`;

  const blocoSkill = skill
    ? `
    <tr><td style="padding:8px 0 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#141311;border-radius:10px">
        <tr><td style="padding:24px">
          <p style="margin:0 0 6px;font:600 11px/1.2 'IBM Plex Mono',Consolas,monospace;letter-spacing:1.6px;text-transform:uppercase;color:#ffd2bf">Skill da semana · testada por mim${skill.edmar_note ? ` · nota ${skill.edmar_note}/5` : ""}</p>
          <p style="margin:0;font:800 20px/1.15 Archivo,Arial,sans-serif;color:#ffffff">${esc(skill.title)}</p>
          ${skill.edmar_take ? `<p style="margin:10px 0 0;font:400 15px/1.5 Arial,sans-serif;color:#d9d6cf">&ldquo;${esc(skill.edmar_take)}&rdquo;</p>` : ""}
          <p style="margin:14px 0 0"><a href="${SITE}/skills/${skill.slug}?${UTM}" style="font:700 14px/1 Arial,sans-serif;color:#ff5a1f;text-decoration:none">Ver como instalar &rarr;</a></p>
        </td></tr>
      </table>
    </td></tr>`
    : `
    <tr><td style="padding:8px 0 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#141311;border-radius:10px">
        <tr><td style="padding:24px">
          <p style="margin:0 0 6px;font:600 11px/1.2 'IBM Plex Mono',Consolas,monospace;letter-spacing:1.6px;text-transform:uppercase;color:#ffd2bf">Biblioteca de skills</p>
          <p style="margin:0;font:800 20px/1.15 Archivo,Arial,sans-serif;color:#ffffff">Skills de design, vídeo e motion testadas antes de indicar</p>
          <p style="margin:14px 0 0"><a href="${SITE}/skills?${UTM}" style="font:700 14px/1 Arial,sans-serif;color:#ff5a1f;text-decoration:none">Conhecer a biblioteca &rarr;</a></p>
        </td></tr>
      </table>
    </td></tr>`;

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(assunto)}</title></head>
<body style="margin:0;padding:0;background:#ecebe8">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(capa ? primeiraFrase(capa.summary) : "")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ecebe8"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
    <tr><td style="padding:0 4px 18px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td><a href="${SITE}/noticias?${UTM}"><img src="${SITE}/logo-escura.png" width="150" alt="Edmar Castro" style="display:block;height:auto;border:0"></a></td>
        <td align="right" style="font:600 11px/1.2 'IBM Plex Mono',Consolas,monospace;letter-spacing:1.6px;text-transform:uppercase;color:#6d6a64">Radar da semana</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#ffffff;border-radius:12px;padding:24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:0 0 20px;font:400 16px/1.5 Arial,sans-serif;color:#141311">Oi! Separei o que mais importou na semana em IA, design e motion. Leitura de 3 minutos.</td></tr>
        ${capa ? bloco(capa, true) : ""}
        ${resto.map((n) => bloco(n, false)).join("")}
        ${blocoSkill}
      </table>
    </td></tr>
    <tr><td style="padding:22px 8px 0;font:400 12px/1.6 Arial,sans-serif;color:#6d6a64;text-align:center">
      Você recebe este e-mail porque se inscreveu em edmarcastro.com.br para receber novidades.<br>
      <a href="${linkSair}" style="color:#6d6a64;text-decoration:underline">Não quero mais receber</a> &middot; <a href="${SITE}/noticias?${UTM}" style="color:#6d6a64;text-decoration:underline">Ver todas as notícias</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const texto = [
    "Radar da semana · Edmar Castro",
    "",
    ...noticias.map((n) => `${n.title}\n${primeiraFrase(n.summary)}\n${linkDe(n.slug)}\n`),
    skill ? `Skill da semana: ${skill.title}\n${SITE}/skills/${skill.slug}\n` : `Biblioteca de skills: ${SITE}/skills\n`,
    `Não quero mais receber: ${linkSair}`,
  ].join("\n");

  return { assunto, html, texto };
}

async function lista() {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/radar_newsletter_list`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_CHAVE_PUBLICA,
      Authorization: `Bearer ${process.env.SUPABASE_CHAVE_PUBLICA}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_token: process.env.RADAR_TOKEN }),
  });
  if (!r.ok) throw new Error(`lista do radar: ${r.status}`);
  return r.json();
}

/* Resend: até 100 e-mails por chamada. */
async function enviar(mensagens) {
  let ok = 0;
  for (let i = 0; i < mensagens.length; i += 100) {
    const lote = mensagens.slice(i, i + 100);
    const r = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_CHAVE}`, "Content-Type": "application/json" },
      body: JSON.stringify(lote),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
    ok += lote.length;
    await new Promise((s) => setTimeout(s, 600));
  }
  return ok;
}

export async function principal() {
  const conteudo = await escolherConteudo();
  console.log(`Radar da semana: ${conteudo.noticias.length} notícias · skill: ${conteudo.skill ? conteudo.skill.title : "(biblioteca)"}`);
  for (const n of conteudo.noticias) console.log(`  [${n.importance}] ${n.title}`);
  if (conteudo.noticias.length < 3) {
    console.log("Menos de 3 notícias com imagem na semana: não envia.");
    return;
  }

  if (PREVIA) {
    const { assunto, html } = montarEmail(conteudo, `${SITE}/descadastrar?t=exemplo`);
    writeFileSync("newsletter-previa.html", html);
    console.log(`Prévia gravada em newsletter-previa.html · assunto: ${assunto}`);
    return;
  }

  if (!process.env.RESEND_CHAVE || !process.env.NEWSLETTER_DE) throw new Error("Faltam RESEND_CHAVE ou NEWSLETTER_DE.");
  const destinos = TESTE
    ? [{ email: process.env.NEWSLETTER_TESTE, unsub_token: "teste" }]
    : await lista();
  if (TESTE && !process.env.NEWSLETTER_TESTE) throw new Error("Falta NEWSLETTER_TESTE (o seu e-mail para o teste).");
  console.log(`Destinatários: ${destinos.length}${TESTE ? " (teste)" : ""}`);
  if (!destinos.length) return;

  const mensagens = destinos.map((d) => {
    const linkSair = `${SITE}/descadastrar?t=${d.unsub_token}`;
    const { assunto, html, texto } = montarEmail(conteudo, linkSair);
    return {
      from: process.env.NEWSLETTER_DE,
      to: [d.email],
      subject: TESTE ? `[TESTE] ${assunto}` : assunto,
      html,
      text: texto,
      headers: { "List-Unsubscribe": `<${linkSair}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    };
  });
  const n = await enviar(mensagens);
  console.log(`Enviados: ${n}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((e) => {
    console.error(`ERRO: ${e.message}`);
    process.exitCode = 1;
  });
}
