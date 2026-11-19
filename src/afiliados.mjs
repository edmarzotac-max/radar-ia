/* Vitrine de afiliados (pedido do Edmar em 19/11): até 3 produtos da Shopee
   relacionados à matéria, de um jeito discreto. Só entram produtos com foto
   em fundo branco (para a vitrine ficar padronizada e profissional), boa
   avaliação e vendas. O link já vem como link de afiliado da conta do Edmar.

   Precisa de SHOPEE_APP_ID e SHOPEE_SECRET (painel de afiliado da Shopee →
   Open API). Sem elas, a vitrine simplesmente não aparece. */

import { createHash } from "node:crypto";
import sharp from "sharp";

const ENDERECO = "https://open-api.affiliate.shopee.com.br/graphql";

export const afiliadosLigado = () => !!(process.env.SHOPEE_APP_ID && process.env.SHOPEE_SECRET);

async function graphql(query) {
  const corpo = JSON.stringify({ query });
  const ts = Math.floor(Date.now() / 1000);
  const assinatura = createHash("sha256")
    .update(`${process.env.SHOPEE_APP_ID}${ts}${corpo}${process.env.SHOPEE_SECRET}`)
    .digest("hex");
  const r = await fetch(ENDERECO, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `SHA256 Credential=${process.env.SHOPEE_APP_ID}, Timestamp=${ts}, Signature=${assinatura}`,
    },
    body: corpo,
    signal: AbortSignal.timeout(15_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.errors) throw new Error(`Shopee ${r.status}: ${JSON.stringify(j.errors ?? j).slice(0, 200)}`);
  return j.data;
}

/* Foto com fundo branco: os quatro cantos e as bordas quase brancos e lisos. */
export async function fundoBranco(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 RadarIA" }, signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return false;
    return await bordaBranca(Buffer.from(await r.arrayBuffer()));
  } catch {
    return false;
  }
}

export async function bordaBranca(buffer) {
  try {
    // transparente conta como branco: é assim que aparece na vitrine
    const { data, info } = await sharp(buffer)
      .flatten({ background: "#ffffff" })
      .resize(64, 64, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const px = (x, y) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]];
    };
    // anel de 3 px na borda da imagem
    let total = 0;
    let brancos = 0;
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        if (x > 2 && x < 61 && y > 2 && y < 61) continue;
        total++;
        const [rr, g, b] = px(x, y);
        if (rr > 238 && g > 238 && b > 238) brancos++;
      }
    }
    return brancos / total > 0.92;
  } catch {
    return false;
  }
}

/* Busca na Shopee e devolve até `quantos` produtos prontos para a vitrine. */
export async function produtosShopee(palavra, quantos = 3) {
  if (!afiliadosLigado() || !palavra) return [];
  const termo = JSON.stringify(String(palavra).slice(0, 60));
  const data = await graphql(
    `{ productOfferV2(keyword: ${termo}, sortType: 2, page: 1, limit: 20) { nodes { itemId productName imageUrl priceMin offerLink sales ratingStar } } }`,
  );
  const candidatos = (data?.productOfferV2?.nodes ?? [])
    .filter((p) => p.offerLink && p.imageUrl && Number(p.ratingStar ?? 0) >= 4.5)
    .sort((a, b) => Number(b.sales ?? 0) - Number(a.sales ?? 0));
  const escolhidos = [];
  for (const p of candidatos) {
    if (escolhidos.length >= quantos) break;
    if (!(await fundoBranco(p.imageUrl))) continue;
    escolhidos.push({
      title: String(p.productName).replace(/\s+/g, " ").trim().slice(0, 90),
      price: Number(p.priceMin) || null,
      image: p.imageUrl,
      link: p.offerLink,
      store: "shopee",
    });
  }
  return escolhidos;
}
