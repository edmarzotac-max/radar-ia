/* Redação com o Gemini (API gratuita do Google, formato compatível com a OpenAI).

   Manda os itens em lotes de 8 e recebe, para cada um: se é relevante,
   título e resumo próprios em português, por que importa, importância de 1
   a 5, a chave do assunto (para juntar a mesma notícia vinda de vários
   lugares) e etiquetas. Nunca copia frases da fonte. */

// Trocar de IA (ex.: ChatGPT) sem mexer no código: IA_ENDERECO, IA_CHAVE e IA_MODELO.
// Para a OpenAI: IA_ENDERECO=https://api.openai.com/v1/chat/completions
const ENDERECO = process.env.IA_ENDERECO || "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const CHAVE = () => process.env.IA_CHAVE || process.env.GEMINI_CHAVE;
// Reservas: se o modelo mais novo estiver sobrecarregado (erro 503), tenta os anteriores.
const MODELOS = process.env.IA_MODELO ? [process.env.IA_MODELO] : [
  process.env.GEMINI_MODELO || "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
];
const LOTE = 12; // menos pedidos por dia: o plano grátis tem limite diário por modelo
const PAUSA_MS = 6500; // nível gratuito: poucos pedidos por minuto

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const INSTRUCOES = `Você é o editor do blog de notícias do Edmar Castro, um brasileiro que cria e vende projetos digitais usando IA. O blog tem quatro editorias (Inteligência Artificial, Tecnologia, Games e Internet), mas só publica o que está dentro dos temas que o Edmar acompanha de perto:
1. Claude e Claude Code, principalmente automação, agentes, skills, MCP e design feito com o Claude.
2. ChatGPT e OpenAI, principalmente pesquisa e design (imagem, interface, criação).
3. Figma e ferramentas de design (Adobe, Canva e similares), inclusive a disputa entre elas e a IA.
4. Motion design e edição de vídeo feitos com IA ou com código (Claude Code, Remotion, HyperFrames, geradores de vídeo).
5. Ferramentas novas de IA que estão chamando atenção (apps de agentes, repositórios em alta, código aberto) e casos de engenharia reversa que mexeram com empresas grandes.
6. IA nas placas de vídeo e nos games (DLSS, geração de quadros, GPUs para IA).
7. As plataformas que o Edmar usa no dia a dia: Vercel, Supabase e GitHub (recursos novos, preços, limites do plano grátis, integração com IA).
8. Skills (de Claude Code e de outros agentes) que fazem design, edição de vídeo ou motion. O Edmar adora achar essas skills: trate como destaque.
O público são brasileiros que criam com IA: designers, editores de vídeo, criadores de conteúdo e quem vende projetos digitais.

Para cada item recebido, devolva:
- "id": o mesmo id recebido.
- "relevante": true só se for notícia de verdade E estiver dentro de um dos 8 temas acima. Notícia de IA, tecnologia ou games que não toca nesses temas (ex.: política de IA, negócios de empresa sem produto novo, celular, jogo sem IA, saúde) = false. Seja exigente: na dúvida, false. Também são false: modelo novo adicionado a um gateway ou marketplace (AI Gateway, Bedrock, Copilot), chips e supercomputadores de data center, pesquisa científica, parcerias com governo, histórias de cliente ("como a empresa X usa"), recurso de segurança corporativa e ajuste pequeno de painel. Também false para: oferta, cupom, desconto, "melhores preços", lista de compras, guia de presente, horóscopo, fofoca, política ou esporte sem relação com tecnologia, item sem informação, post pessoal de fórum sem novidade, matéria patrocinada.
- "categoria": "ia" (temas 1, 2, 5 e 8: Claude, ChatGPT, agentes, ferramentas, skills e repositórios de IA), "tecnologia" (temas 3, 4 e 7: Figma, Adobe, design, motion e edição de vídeo, engenharia reversa, Vercel, Supabase e GitHub), "games" (tema 6: IA nas placas de vídeo e nos jogos) ou "internet" (redes sociais e criadores de conteúdo usando IA, plataformas de vídeo).
- "titulo": título jornalístico em português do Brasil, direto, até 90 caracteres, sem clickbait, sem emoji, sem ponto final.
- "resumo": 2 ou 3 frases em português do Brasil, com suas próprias palavras (NUNCA copie frases da fonte), dizendo o que aconteceu com os fatos concretos (quem, o quê, números). Até 380 caracteres.
- "porque": 1 frase dizendo o que isso muda para quem cria com IA (design, vídeo, automação). Até 200 caracteres.
- "importancia": 1 a 5, pensando em quem cria com IA. 5 = lançamento grande que todo mundo do nicho vai comentar (modelo novo do Claude ou do GPT, recurso novo forte no Figma ou na Adobe, ferramenta que muda o jeito de fazer design ou vídeo); 4 = novidade útil que dá para usar já (recurso novo do Claude Code, skill, MCP, plugin, ferramenta de motion); 3 = notícia boa dentro dos temas; 2 = detalhe técnico ou versão de manutenção; 1 = quase irrelevante. Repositório do GitHub em alta = 3, ou 4 se servir para automação, design ou vídeo com Claude. Skill de design, vídeo ou motion que funciona de verdade = 4 (5 se for muito boa ou muito comentada). Changelog pequeno da Vercel, do Supabase ou do GitHub = 2, a não ser que mude preço, plano grátis ou traga IA.
- "assunto": chave curta em inglês, minúsculas e hífens, até 6 palavras, que identifica o FATO (ex.: "openai-launches-gpt-6", "anthropic-claude-code-2-2-release"). Se o item for sobre o mesmo fato de uma das chaves existentes informadas, repita a chave existente exatamente igual.
- "tags": de 1 a 3 etiquetas curtas em português, minúsculas (ex.: "claude", "openai", "agentes", "github", "playstation", "whatsapp").

Para versões de software (tipo lancamento), o título deve dizer o nome da ferramenta e a versão, e o resumo deve dizer as mudanças mais úteis em linguagem simples.
Para repositórios do GitHub (tipo github), diga o que o projeto faz e para quem serve. Se for uma skill, comece o título com "Skill" (ex.: "Skill para Claude Code anima interfaces com Remotion") e diga no resumo como se usa. Skill que é só uma lista de links, um modelo vazio ou cópia de outra = relevante false.

Responda só com JSON no formato {"itens":[...]}.`;

async function chamar(modelo, conteudo) {
  const r = await fetch(ENDERECO, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CHAVE()}`,
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
        const r = await chamar(modelo, conteudo);
        console.log(`  IA: lote ok com ${modelo}`);
        return r;
      } catch (e) {
        console.log(`  IA: ${modelo} falhou (${e.status ?? e.message})`);
        ultimoErro = e;
        if (e.status === 404 || e.status === 400) break; // modelo não existe: tenta o próximo
        // 429 = limite por minuto; 503 = Google sobrecarregado (costuma passar em segundos)
        await espera(e.status === 429 ? 20_000 : 8000 * (tentativa + 1));
      }
    }
  }
  throw ultimoErro;
}

export const iaLigada = () => !!CHAVE();

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
