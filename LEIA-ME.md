# Radar IA

Raspador de notícias de inteligência artificial, tecnologia, games e internet. A cada 15 minutos, no GitHub Actions (grátis em repositório público):

1. lê 23 feeds de notícias, a página da Anthropic, o Hacker News, as versões novas de 6 repositórios (Claude Code, Codex, Gemini CLI...) e os repositórios de IA novos que estão subindo em estrelas;
2. joga fora o que já viu;
3. o Gemini (API grátis) descarta oferta e fofoca, escolhe a editoria (IA, tecnologia, games ou internet) e escreve título, resumo e "por que importa" em português, com palavras próprias;
4. grava no Supabase do site → aparece em edmarcastro.com.br/noticias;
5. posta no canal do Telegram as de IA com nota 4 ou 5 e as das outras editorias só com nota 5 (no máximo 4 por rodada);
6. **super notícia**: 3 fontes diferentes sobre o mesmo fato em 6 horas, ou anúncio oficial nota 5 → vira "URGENTE" no portal e no canal, e o robô te avisa no privado.

Custo: zero. Fontes ficam em `src/fontes.mjs`.

## Ligar (uma vez só, uns 15 minutos)

As chaves você mesmo cola: eu não digito nem leio senhas e chaves.

### 1. Banco (Supabase)
Abrir supabase.com → projeto **edmar_supa** → SQL Editor → colar o arquivo
`edmarcastro-site/supabase/migrations/20261117120000_radar_noticias.sql` → Run.

### 2. Robô e canal do Telegram (DEIXADO PARA DEPOIS em 17/11)
Pule este passo por enquanto. Sem os Secrets do Telegram, o radar só alimenta o portal: não posta em canal nenhum e não manda alerta. Quando houver o que oferecer no canal, é só fazer os passos abaixo e cadastrar os 3 Secrets do Telegram.
1. No Telegram, falar com **@BotFather** → `/newbot` → dar um nome (ex.: Radar IA) e um usuário terminado em `bot`. Ele devolve o **token do robô**.
2. Criar um **canal público** (ex.: `@radaria_br`). Em Administradores, adicionar o robô com permissão de publicar.
3. Mandar um "oi" para o seu robô (para ele poder te escrever no privado).
4. Falar com **@userinfobot**: ele responde o seu **ID** (um número).

### 3. Chave do Gemini (grátis)
aistudio.google.com/apikey → Create API key.

### 4. GitHub
1. Criar um repositório **público** chamado `radar-ia` na conta edmarzotac-max e subir esta pasta (eu faço isso se você pedir).
2. No repositório: Settings → Secrets and variables → Actions → New repository secret. Criar:

| Nome | O que colar |
|---|---|
| `SUPABASE_URL` | `https://zzsnuprueyixzqndhyoz.supabase.co` |
| `SUPABASE_CHAVE_PUBLICA` | a chave publicável do Supabase (a mesma `SUPABASE_PUBLISHABLE_KEY` do `.env` do site) |
| `RADAR_TOKEN` | o código do arquivo `ACESSO-RADAR.txt` (nesta pasta, não vai para o GitHub) |
| `GEMINI_CHAVE` | a chave do passo 3 |
| `TELEGRAM_BOT_TOKEN` | o token do passo 2.1 |
| `TELEGRAM_CANAL` | o @ do canal, ex.: `@radaria_br` |
| `TELEGRAM_MEU_CHAT` | o seu ID do passo 2.4 |

### 5. Primeira rodada
Aba **Actions** → Radar IA → Run workflow → modo `semear`. Ela marca tudo o que já existe como visto e publica até 45 das mais recentes (até 3 por fonte) no portal, sem mandar nada para o Telegram. Depois disso o radar roda sozinho a cada 15 minutos.

### OpenBot (painel no seu computador)
O GitHub Actions é quem roda sozinho, 24 horas. No OpenBot fica um agente para você rodar na hora, testar e ver o que entrou.
1. Copie `.env.exemplo` para `.env` e preencha com as mesmas chaves dos Secrets.
2. No OpenBot, crie um agente (ex.: "Radar") e mande para ele:
   > Copie a pasta `C:\Users\EusouoEd\Desktop\PROJETOS\radar-ia\openbot\radar-ia` para o seu workspace e registre como skill com create_skill. Depois trabalhe na pasta `C:\Users\EusouoEd\Desktop\PROJETOS\radar-ia`.
3. Depois é só pedir: "roda o radar agora", "testa as fontes", "o que entrou hoje?".

Não crie agendamento no OpenBot para o radar: o GitHub já roda a cada 15 minutos, e os posts no Telegram sairiam em dobro.

### 6. Site
Colocar o link do canal em `edmarcastro-site/src/lib/news.ts` (`TELEGRAM_URL`) e publicar o site. Os botões "Receber no Telegram" só aparecem depois disso.

## Testar no computador
- `npm run teste`: coleta de verdade e mostra o que publicaria, sem gravar e sem postar.
- `node teste/simulado.mjs`: rodada completa duas vezes com Gemini, Supabase e Telegram de mentira; termina em "TUDO CERTO".

## Bom saber
- O GitHub às vezes atrasa o horário em 5 a 15 minutos.
- Se o repositório ficar 60 dias sem commit, o GitHub desliga o agendamento; o próprio radar faz um commit vazio a cada 45 dias para isso não acontecer.
- Esconder uma notícia: no Supabase, tabela `news`, marcar `hidden = true`.
