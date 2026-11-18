/* IndexNow: avisa o Bing (e Yandex, Seznam, Naver) na hora que uma página nova
   vai ao ar, em vez de esperar o robô passar. A chave é pública por desenho:
   o arquivo /<chave>.txt no site prova que o site é nosso. O Google não usa
   IndexNow; para ele valem o sitemap e o Search Console. */

export const INDEXNOW_CHAVE = "379e97e38c312ae01b9cfaad69e5e6aa";

export async function avisarBuscadores(urls, site) {
  if (!urls.length) return;
  const host = new URL(site).host;
  if (host.includes("localhost")) return;
  try {
    const r = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key: INDEXNOW_CHAVE,
        keyLocation: `${site}/${INDEXNOW_CHAVE}.txt`,
        urlList: urls.slice(0, 10000),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    console.log(`  IndexNow: ${urls.length} link(s) avisados (${r.status})`);
  } catch (e) {
    console.warn(`  ! IndexNow: ${e.message}`);
  }
}
