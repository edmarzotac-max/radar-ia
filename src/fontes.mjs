/* Onde o radar procura. Para incluir ou tirar uma fonte, mexa só aqui.

   Editorias do portal: ia, tecnologia, games, internet. "categoria" é só uma
   dica para a IA, que decide a categoria final de cada notícia.

   O foco é o que o Edmar acompanha (17/11/2026): Claude Code (automação e
   design), GPT (pesquisa e design), Figma, motion e edição de vídeo com IA e
   com código, ferramentas novas (tipo OpenBot), engenharia reversa e a
   briga das ferramentas de design (Adobe), e IA nas placas de vídeo e games.

   filtrar: "ia"    = a fonte fala de tudo; só entra o que tiver palavra de IA.
   filtrar: "nicho" = só entra o que bater com os temas do Edmar (PALAVRAS_NICHO).
   incluir / excluir: expressão que o título ou o resumo precisa ter / não pode ter. */

export const FEEDS = [
  // Oficiais de IA
  { nome: "OpenAI", url: "https://openai.com/news/rss.xml", oficial: true },
  { nome: "Google", url: "https://blog.google/technology/ai/rss/", oficial: true },
  { nome: "Hugging Face", url: "https://huggingface.co/blog/feed.xml", oficial: true, filtrar: "nicho" },

  // IA (imprensa e quem testa ferramenta de verdade)
  { nome: "The Verge", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { nome: "TechCrunch", url: "https://techcrunch.com/category/artificial-intelligence/feed/", filtrar: "nicho" },
  { nome: "The Decoder", url: "https://the-decoder.com/feed/", filtrar: "nicho" },
  { nome: "Simon Willison", url: "https://simonwillison.net/atom/everything/", filtrar: "ia" },

  // Design, Figma, Adobe e criadores
  { nome: "The Verge", url: "https://www.theverge.com/rss/figma/index.xml", categoria: "tecnologia" },
  { nome: "The Verge", url: "https://www.theverge.com/rss/adobe/index.xml", categoria: "tecnologia" },
  { nome: "The Verge", url: "https://www.theverge.com/rss/creators/index.xml", categoria: "internet", filtrar: "nicho" },
  { nome: "Creative Bloq", url: "https://www.creativebloq.com/feeds/all", categoria: "tecnologia", filtrar: "nicho" },

  // Plataformas que o Edmar usa: Vercel, Supabase e GitHub
  { nome: "Vercel", url: "https://vercel.com/atom", categoria: "tecnologia", oficial: true },
  // changelog: fora os avisos de "modelo X chegou ao AI Gateway", que saem todo dia
  { nome: "Vercel", url: "https://vercel.com/changelog/rss.xml", categoria: "tecnologia", oficial: true, excluir: /ai gateway|now available on/i },
  { nome: "Supabase", url: "https://supabase.com/rss.xml", categoria: "tecnologia", oficial: true },
  { nome: "Supabase", url: "https://supabase.com/changelog/rss.xml", categoria: "tecnologia", oficial: true },
  { nome: "GitHub", url: "https://github.blog/feed/", categoria: "tecnologia", oficial: true, filtrar: "nicho" },

  // Placas de vídeo e games com IA
  { nome: "The Verge", url: "https://www.theverge.com/rss/nvidia/index.xml", categoria: "games" },
  // só placa de vídeo de consumidor e games (nada de data center)
  { nome: "NVIDIA", url: "https://blogs.nvidia.com/feed/", categoria: "games", oficial: true, incluir: /geforce|rtx|dlss|gaming|game|jogo/i },
  { nome: "Tom's Hardware", url: "https://www.tomshardware.com/feeds/all", categoria: "games", incluir: /dlss|fsr|frame gen|geforce|radeon|rtx 5|rtx 6|ai upscal/i },

  // Imprensa brasileira: só o que bate com os temas
  { nome: "Tecnoblog", url: "https://tecnoblog.net/feed/", categoria: "tecnologia", filtrar: "nicho" },
  { nome: "Olhar Digital", url: "https://olhardigital.com.br/feed/", categoria: "tecnologia", filtrar: "nicho" },
  { nome: "Canaltech", url: "https://canaltech.com.br/rss/", categoria: "tecnologia", filtrar: "nicho" },
  { nome: "Tecmundo", url: "https://rss.tecmundo.com.br/feed", categoria: "tecnologia", filtrar: "nicho" },
  { nome: "Adrenaline", url: "https://adrenaline.com.br/feed/", categoria: "games", filtrar: "nicho" },
];

/* A Anthropic não tem RSS: o radar lê a página de notícias. */
export const ANTHROPIC = { nome: "Anthropic", url: "https://www.anthropic.com/news", oficial: true };

/* Hacker News: buscas pelos temas (o que a comunidade técnica está discutindo). */
export const HACKER_NEWS = {
  nome: "Hacker News",
  pontosMinimos: 40,
  buscas: [
    "claude code", "anthropic", "chatgpt", "openai", "figma", "adobe", "remotion",
    "motion graphics", "video editing", "reverse engineering", "mcp server", "dlss",
  ],
};

/* GitHub: versões novas destes repositórios. */
export const REPOS_VIGIADOS = [
  "anthropics/claude-code",
  "anthropics/claude-agent-sdk-python",
  "openai/codex",
  "modelcontextprotocol/modelcontextprotocol",
  "remotion-dev/remotion",
  "heygen-com/hyperframes",
];

/* GitHub: repositórios novos (até 7 dias) que estão subindo rápido. */
export const TOPICOS_GITHUB = [
  "claude-code",
  "claude-skills",
  "mcp",
  "ai-agents",
  "figma",
  "remotion",
  "motion-graphics",
  "video-editing",
];
export const ESTRELAS_MINIMAS = 100;

/* Caça-skills: repositórios novos (até 14 dias) com skills de design, vídeo e
   motion. O Edmar AMA achar essas skills: entram com estrelas a partir de 10. */
export const BUSCAS_SKILLS = [
  "skill design", "skills design", "skill motion", "skill video", "skill animation",
  "skill figma", "skill remotion", "skill ui", "claude design", "claude video", "claude motion",
];
export const ESTRELAS_MINIMAS_SKILLS = 10;

/* Palavras que fazem uma notícia de tecnologia em geral contar como IA. */
export const PALAVRAS_IA = [
  "inteligência artificial", "inteligencia artificial", " ia ", "ia generativa", "artificial intelligence",
  " ai ", "a.i.", "llm", "chatgpt", "openai", "gpt-", "claude", "anthropic", "gemini", "deepmind",
  "copilot", "mistral", "llama", "deepseek", "qwen", "grok", "xai", "perplexity", "midjourney",
  "sora", "veo", "agente de ia", "agentes de ia", "ai agent", "machine learning", "aprendizado de máquina",
  "nvidia", "hugging face", "mcp", "cursor", "vibe coding", "modelo de linguagem", "chatbot",
];

/* Os temas do Edmar: só passa o que tiver pelo menos uma destas. */
export const PALAVRAS_NICHO = [
  // Claude, GPT e ferramentas de IA
  "claude", "anthropic", "chatgpt", "openai", "gpt-", "codex", "agente", "agent", "mcp", "automação",
  "vercel", "supabase", "next.js", "nextjs", "v0", "skill",
  "automation", "vibe coding", "cursor", "skills", "openbot", "github",
  // design
  "figma", "adobe", "photoshop", "illustrator", "after effects", "premiere", "firefly", "canva",
  "design", "designer", "ui ", "ux ", "interface", "tipografia", "typography",
  // motion e vídeo
  "motion", "animação", "animation", "edição de vídeo", "editar vídeo", "video editing", "video editor",
  "remotion", "hyperframes", "davinci", "capcut", "gerador de vídeo", "video generation", "sora", "veo",
  "runway", "kling",
  // engenharia reversa e código aberto
  "engenharia reversa", "reverse engineer", "código aberto", "open source", "open-source",
  // placas de vídeo e games com IA
  "dlss", "fsr", "rtx", "geforce", "placa de vídeo", "placas de vídeo", "gpu", "ray tracing",
  "frame generation", "geração de quadros", "upscaling", "nvidia", "radeon",
];
