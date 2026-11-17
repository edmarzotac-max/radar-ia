/* Redação com o Gemini (API gratuita do Google, formato compatível com a OpenAI).

   Manda os itens em lotes de 8 e recebe, para cada um: se é relevante,
   título e resumo próprios em português, por que importa, importância de 1
   a 5, a chave do assunto (para juntar a mesma notícia vinda de vários
   lugares) e etiquetas. Nunca copia frases da fonte. */

const ENDERECO = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const MODELOS = [process.env.GEMINI_MODELO || "gemini-flash-latest", "gemini-flash-lite-latest"];
const LOTE = 8;
const PAUSA_MS = 6500; // nível gratuito: poucos pedidos por minuto

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const INSTRUCOES = `Você é o editor de um portal brasileiro de notícias de tecnologia com quatro editorias: Inteligência Artificial (a principal, com foco em Claude, Claude Code, agentes, ferramentas e lançamentos de modelos), Tecnologia, Games e Internet. O público são brasileiros que trabalham com tecnologia e negócios ou gostam de games e querem saber o que mudou.

Para cada item recebido, devolva:
- "id": o mesmo id recebido.
- "relevante": true se for notícia de verdade de uma das quatro editorias. false para: oferta, cupom, desconto, "melhores preços", lista de compras, guia de presente, horóscopo, fofoca, política ou esporte sem relação com tecnologia, item sem informação, post pessoal de fórum sem novidade, matéria patrocinada.
- "categoria": "ia" (inteligência artificial, modelos, agentes, ferramentas e empresas de IA, repositórios de IA), "tecnologia" (celulares, computadores, chips, carros elétricos, ciência e empresas de tecnologia), "games" (jogos, consoles, lançamentos, indústria de games) ou "internet" (redes sociais, aplicativos, streaming, golpes e segurança na internet, criadores de conteúdo, regulação da internet). Se a notícia é de games ou tecnologia mas o centro é IA, use "ia".
- "titulo": título jornalístico em português do Brasil, direto, até 90 caracteres, sem clickbait, sem emoji, sem ponto final.
- "resumo": 2 ou 3 frases em português do Brasil, com suas próprias palavras (NUNCA copie frases da fonte), dizendo o que aconteceu com os fatos concretos (quem, o quê, números). Até 380 caracteres.
- "porque": 1 frase dizendo por que isso importa para quem usa IA no trabalho. Até 200 caracteres.
- "importancia": 1 a 5, dentro da editoria. 5 = lançamento de modelo grande, console ou jogo muito esperado, mudança que afeta muita gente ou notícia que vai dominar o dia; 4 = novidade relevante de empresa grande ou ferramenta muito útil; 3 = notícia boa do setor; 2 = nicho; 1 = quase irrelevante. Versão de manutenção de software (correções pequenas) = 2. Repositório do GitHub em alta = 3, ou 4 se for muito útil para quem usa Claude/agentes.
- "assunto": chave curta em inglês, minúsculas e hífens, até 6 palavras, que identifica o FATO (ex.: "openai-launches-gpt-6", "anthropic-claude-code-2-2-release"). Se o item for sobre o mesmo fato de uma das chaves existentes informadas, repita a chave existente exatamente igual.
- "tags": de 1 a 3 etiquetas curtas em português, minúsculas (ex.: "claude", "openai", "agentes", "github", "playstation", "whatsapp").

Para versões de software (tipo lancamento), o título deve dizer o nome da ferramenta e a versão, e o resumo deve dizer as mudanças mais úteis em linguagem simples.
Para repositórios do GitHub (tipo github), diga o que o projeto faz e para quem serve.

Responda só com JSON no formato {"itens":[...]}.`;

async function chamar(modelo, conteudo) {
  const r = await fetch(ENDERECO, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GEMINI_CHAVE}`,
    },
    body: JSON.stringify({
      model: modelo,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: INSTRUCOES },
        { role: "user", content: conteudo },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    const erro = new Error(`Gemini ${r.status}: ${corpo.slice(0, 300)}`);
    erro.status = r.status;
    throw erro;
  }
  const j = await r.json();
  const txt = j.choices?.[0]?.message?.content ?? "";
  const limpo = txt.replace(/^```(?:json)?\s*|\s*```$/g, "");
  return JSON.parse(limpo).itens ?? [];
}

async function chamarComReserva(conteudo) {
  let ultimoErro;
  for (const modelo of MODELOS) {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        return await chamar(modelo, conteudo);
      } catch (e) {
        ultimoErro = e;
        if (e.status === 429) await espera(20_000);
        else if (e.status === 404 || e.status === 400) break; // modelo não existe: tenta o próximo
        else await espera(3000);
      }
    }
  }
  throw ultimoErro;
}

export const iaLigada = () => !!process.env.GEMINI_CHAVE;

/* itens: lista da coleta. assuntos: [{ chave, titulo }] das últimas horas. */
export async function redigir(itens, assuntos = []) {
  const saida = new Map();
  const listaAssuntos = assuntos.length
    ? `Chaves de assunto já existentes (últimas horas):\n${assuntos.map((a) => `- ${a.chave}: ${a.titulo}`).join("\n")}\n\n`
    : "";
  for (let i = 0; i < itens.length; i += LOTE) {
    const lote = itens.slice(i, i + LOTE);
    const conteudo =
      listaAssuntos +
      "Itens:\n" +
      JSON.stringify(
        lote.map((it, k) => ({
          id: i + k,
          tipo: it.tipo,
          editoria_provavel: it.categoria ?? "ia",
          fonte: it.fonte + (it.oficial ? " (fonte oficial)" : it.comunidade ? " (comunidade)" : ""),
          titulo_original: it.titulo,
          texto_original: it.texto.slice(0, 1500),
        })),
      );
    try {
      const resp = await chamarComReserva(conteudo);
      for (const r of resp) {
        if (typeof r?.id === "number") saida.set(r.id, r);
      }
    } catch (e) {
      console.warn(`  ! IA falhou no lote ${i / LOTE + 1}: ${e.message}`);
    }
    if (i + LOTE < itens.length) await espera(PAUSA_MS);
  }
  return itens.map((_, idx) => saida.get(idx) ?? null);
}
