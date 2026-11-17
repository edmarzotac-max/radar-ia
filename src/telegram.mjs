/* Telegram: publica no canal público e avisa o Edmar no privado. */

const API = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export const telegramLigado = () => !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CANAL);
export const alertaLigado = () => !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_MEU_CHAT);

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function enviar(chat, html) {
  const r = await fetch(`${API()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chat,
      text: html,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: false, prefer_large_media: true },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram: ${j.description ?? r.status}`);
  return j.result;
}

const ROTULO = { noticia: "", lancamento: "🚀 Nova versão\n", github: "⭐ Em alta no GitHub\n" };

export function mensagem(n, linkPortal, { superNoticia = false, fontes = 1 } = {}) {
  const topo = superNoticia ? `🔴 <b>URGENTE</b>${fontes > 1 ? ` · ${fontes} fontes` : ""}\n\n` : ROTULO[n.kind] ?? "";
  const porque = n.why ? `\n\n💡 ${esc(n.why)}` : "";
  const tags = (n.tags ?? []).map((t) => `#${t.replace(/[^\p{L}\p{N}_]/gu, "")}`).filter((t) => t.length > 1).join(" ");
  return (
    `${topo}<b>${esc(n.title)}</b>\n\n${esc(n.summary)}${porque}\n\n` +
    `<a href="${esc(linkPortal)}">Ler a matéria</a> · <a href="${esc(n.source_url)}">Fonte: ${esc(n.source_name)}</a>` +
    (tags ? `\n\n${tags}` : "")
  );
}

export const postarNoCanal = (html) => enviar(process.env.TELEGRAM_CANAL, html);

export const avisarEdmar = (html) => enviar(process.env.TELEGRAM_MEU_CHAT, html);
