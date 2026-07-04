# ACURA BRASIL — Site Institucional

Site institucional da **ACURA BRASIL** (Associação Brasil pela Cura), OSCIP certificada dedicada ao avanço da ciência, fomento à pesquisa e assistência humanitária.

## Páginas

| Página | Arquivo | Descrição |
|--------|---------|-----------|
| Início | `index.html` | Home com destaque ao projeto SOS Saúde RS |
| A Instituição | `instituicao.html` | Missão, visão, diretoria e sede |
| Pesquisas | `pesquisas.html` | Áreas de atuação e metodologia |
| SOS Saúde RS | `sos-saude-rs.html` | Projeto completo com conteúdo do documento oficial |
| Transparência | `transparencia.html` | Portal da transparência OSCIP |
| Contato | `contato.html` | Formulário e informações de contato |
| Associar-se | `associar.html` | Modalidades de ingresso |

## Desenvolvimento Local

```bash
npm install
cp .env.example .env   # configure o SMTP (ver abaixo)
npm start
```

Acesse: http://localhost:3000

## Formulário de Contato

O formulário envia via `POST /api/contact`. **Recomendado: [Resend](https://resend.com)** — o SMTP do GoDaddy costuma bloquear conexões do Railway.

### Resend (recomendado)

1. Crie conta em [resend.com](https://resend.com)
2. **Domains** → adicione `acurabrasil.org` → copie os registros DNS para o **Cloudflare**
3. No **Railway**, adicione:

| Variável | Valor |
|----------|-------|
| `RESEND_API_KEY` | chave da API (começa com `re_`) |
| `CONTACT_TO` | `contato@acurabrasil.org` |
| `CONTACT_FROM` | `ACURABRASIL <contato@acurabrasil.org>` |

### SMTP GoDaddy (alternativa — pode falhar na nuvem)

| Variável | Valor |
|----------|-------|
| `SMTP_HOST` | `smtpout.secureserver.net` |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `true` |
| `SMTP_USER` | e-mail completo da caixa |
| `SMTP_PASS` | senha da caixa |
| `CONTACT_TO` | `contato@acurabrasil.org` |
| `CONTACT_FROM` | igual ao `SMTP_USER` |

## Admin SOS Venezuela

Painel interno de operação (triagem, escala, voluntários) em **`/admin/`** — não linkado no site público.

### Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `ADMIN_USERNAME` | Usuário do login (padrão: `admin`) |
| `ADMIN_PASSWORD` | Senha em texto (dev) ou use `ADMIN_PASSWORD_HASH` (scrypt) em produção |
| `ADMIN_SESSION_SECRET` | Segredo HMAC para cookie de sessão (32+ caracteres aleatórios) |
| `DATA_PATH` | Caminho do SQLite (padrão: `./data/acura-sos.db`) |
| `SOS_VENEZUELA_TO` | E-mail que recebe novas solicitudes |

### Primeiro acesso

1. Defina `ADMIN_USERNAME`, `ADMIN_PASSWORD` e `ADMIN_SESSION_SECRET` no `.env` ou no Railway.
2. Acesse `/admin/login.html` e faça login.
3. Na primeira inicialização, o banco é criado com **dados de exemplo**: 4 turnos, 4 voluntários fictícios e escala dos próximos 7 dias.

### Persistência no Railway (Volume)

Para que solicitudes, escala e configurações sobrevivam a redeploys:

1. No projeto Railway, adicione um **Volume** montado em `/data`.
2. Configure `DATA_PATH=/data/acura-sos.db`.
3. Redeploy — o SQLite ficará no volume persistente.

### Fluxo operacional

1. Paciente preenche `solicitud-sos-venezuela.html` → `POST /api/sos-venezuela/intake`.
2. Solicitud é salva em SQLite (`sos_intakes`, status `nova`) e e-mail enviado à equipe.
3. Operador acessa `/admin/` → fila de solicitudes → triagem, notas, status.
4. Escala do dia indica quem está de plantão (turnos + voluntários).
5. Páginas públicas SOS consultam `GET /api/sos-venezuela/public-info` para horários e WhatsApp.

## Deploy no Railway

### Opção 1 — Via GitHub (recomendado)

1. Crie um repositório no GitHub e faça push deste projeto.
2. Acesse [railway.app](https://railway.app) e faça login.
3. Clique em **New Project** → **Deploy from GitHub repo**.
4. Selecione o repositório.
5. O Railway detectará automaticamente o Node.js e executará `npm start`.
6. Em **Settings** → **Networking** → **Generate Domain** para obter a URL pública.

### Opção 2 — Via Railway CLI

```bash
npm install -g @railway/cli
railway login
railway init
railway up
railway domain
```

## Documento SOS Saúde RS

O PDF oficial do projeto está em `public/docs/projeto-sos-saude-rs.pdf` e é referenciado na home e na página dedicada `sos-saude-rs.html`.
