/* Onde o radar procura. Para incluir ou tirar uma fonte, mexa só aqui.

   tipo "feed": RSS ou Atom.
   filtrar: true = o site fala de tudo (tecnologia em geral); só entra o que
   tiver palavra de IA no título ou no resumo. */

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

  // Imprensa brasileira (falam de tudo: filtrar)
  { nome: "Tecnoblog", url: "https://tecnoblog.net/feed/", filtrar: true },
  { nome: "Olhar Digital", url: "https://olhardigital.com.br/feed/", filtrar: true },
  { nome: "Canaltech", url: "https://canaltech.com.br/rss/", filtrar: true },
  { nome: "Tecmundo", url: "https://rss.tecmundo.com.br/feed", filtrar: true },
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
