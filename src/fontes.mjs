/* Onde o radar procura. Para incluir ou tirar uma fonte, mexa só aqui.

   Categorias do portal: ia, tecnologia, games, internet. "categoria" é só
   uma dica para a IA, que decide a categoria final de cada notícia.

   tipo "feed": RSS ou Atom.
   filtrar: true = a fonte fala de tudo; só entra o que tiver palavra de IA. */

export const FEEDS = [
  // Oficiais
  { nome: "OpenAI", url: "https://openai.com/news/rss.xml", oficial: true },
  { nome: "Google", url: "https://blog.google/technology/ai/rss/", oficial: true },
  { nome: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml", oficial: true },
  { nome: "Hugging Face", url: "https://huggingface.co/blog/feed.xml", oficial: true },

  // Imprensa internacional
  { nome: "The Verge", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { nome: "TechCrunch", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { nome: "Ars Technica", url: "https://arstechnica.com/ai/feed/" },
  { nome: "The Decoder", url: "https://the-decoder.com/feed/" },
  { nome: "Simon Willison", url: "https://simonwillison.net/atom/everything/", filtrar: true },
  { nome: "Reddit r/ClaudeAI", url: "https://www.reddit.com/r/ClaudeAI/top/.rss?t=day", comunidade: true },

  // Tecnologia, internet e games (a IA decide a categoria de cada notícia)
  { nome: "The Verge", url: "https://www.theverge.com/rss/tech/index.xml", categoria: "tecnologia" },
  { nome: "The Verge", url: "https://www.theverge.com/rss/games/index.xml", categoria: "games" },
  { nome: "g1 Tecnologia", url: "https://g1.globo.com/rss/g1/tecnologia/", categoria: "tecnologia" },
  { nome: "TechTudo", url: "https://www.techtudo.com.br/rss/techtudo/", categoria: "tecnologia" },
  { nome: "Tecnoblog", url: "https://tecnoblog.net/feed/", categoria: "tecnologia" },
  { nome: "Olhar Digital", url: "https://olhardigital.com.br/feed/", categoria: "tecnologia" },
  { nome: "Canaltech", url: "https://canaltech.com.br/rss/", categoria: "tecnologia" },
  { nome: "Tecmundo", url: "https://rss.tecmundo.com.br/feed", categoria: "tecnologia" },
  { nome: "Meio Bit", url: "https://meiobit.com/feed/", categoria: "tecnologia" },
  { nome: "Showmetech", url: "https://www.showmetech.com.br/feed/", categoria: "tecnologia" },
  { nome: "Adrenaline", url: "https://adrenaline.com.br/feed/", categoria: "games" },
  { nome: "IGN Brasil", url: "https://br.ign.com/feed.xml", categoria: "games" },
  { nome: "Eurogamer", url: "https://www.eurogamer.pt/feed", categoria: "games" },
];

/* A Anthropic não tem RSS: o radar lê a página de notícias. */
export const ANTHROPIC = { nome: "Anthropic", url: "https://www.anthropic.com/news", oficial: true };

/* Hacker News: só o que está na primeira página e fala de IA. */
export const HACKER_NEWS = { nome: "Hacker News", pontosMinimos: 120 };

/* GitHub: versões novas destes repositórios. */
export const REPOS_VIGIADOS = [
  "anthropics/claude-code",
  "anthropics/claude-agent-sdk-python",
  "openai/codex",
  "google-gemini/gemini-cli",
  "modelcontextprotocol/modelcontextprotocol",
  "ollama/ollama",
];

/* GitHub: repositórios novos (até 7 dias) que estão subindo rápido. */
export const TOPICOS_GITHUB = [
  "llm",
  "ai-agents",
  "mcp",
  "claude",
  "claude-code",
  "claude-skills",
  "generative-ai",
];
export const ESTRELAS_MINIMAS = 150;

/* Palavras que fazem uma notícia de tecnologia em geral contar como IA. */
export const PALAVRAS_IA = [
  "inteligência artificial", "inteligencia artificial", " ia ", "ia generativa", "artificial intelligence",
  " ai ", "a.i.", "llm", "chatgpt", "openai", "gpt-", "claude", "anthropic", "gemini", "deepmind",
  "copilot", "mistral", "llama", "deepseek", "qwen", "grok", "xai", "perplexity", "midjourney",
  "sora", "veo", "agente de ia", "agentes de ia", "ai agent", "machine learning", "aprendizado de máquina",
  "nvidia", "hugging face", "mcp", "cursor", "vibe coding", "modelo de linguagem", "chatbot",
];
