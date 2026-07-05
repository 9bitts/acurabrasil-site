# ACURABRASIL — Site Institucional

Site institucional da **ACURABRASIL** (Associação Brasil pela Cura), OSCIP certificada dedicada ao avanço da ciência, fomento à pesquisa e assistência humanitária.

## Páginas

| Página | Arquivo | Descrição |
|--------|---------|-----------|
| Início | `index.html` | Home com destaque ao projeto SOS Saúde RS |
| A Instituição | `instituicao.html` | Missão, visão, diretoria e sede |
| Pesquisas | `pesquisas.html` | Áreas de atuação e metodologia |
| SOS Saúde RS | `sos-saude-rs.html` | Projeto completo com conteúdo do documento oficial |
| Transparência | `transparencia.html` | Portal da transparência OSCIP |
| Contato | `contato.html` | Formulário e informações de contato |
| Doação | `doacao.html` | Pix, PayPal, selos de doador |
| Privacidade | `privacidade.html` | Política de Privacidade (LGPD) |

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

**Proteção recomendada:** configure [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) na rota `/admin/*` ou defina `ADMIN_IP_ALLOWLIST` com IPs autorizados (retorna 404 para demais). HSTS e redirect `acurabrasil.org` → `www.acurabrasil.org` estão ativos no servidor.

### Google Analytics 4

1. Crie uma propriedade GA4 em [analytics.google.com](https://analytics.google.com).
2. Defina `GA4_MEASUREMENT_ID=G-XXXXXXXXXX` no Railway (substitua pelo ID real).
3. O site usa **Consent Mode v2**: analytics só é ativado após aceite no banner de cookies.
4. Eventos customizados: `consulta_iniciada`, `doacao_pix_copiada`, `doacao_paypal_clicada`, `formulario_contato_enviado`, `intake_sos_enviado`, `voluntario_cta_clicado`, `whatsapp_clicado`.

### Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `ADMIN_USERNAME` | Usuário do login (padrão: `admin`) |
| `ADMIN_PASSWORD` | Senha em texto (dev) ou use `ADMIN_PASSWORD_HASH` (scrypt) em produção |
| `ADMIN_SESSION_SECRET` | Segredo HMAC para cookie de sessão (32+ caracteres aleatórios) |
| `ADMIN_IP_ALLOWLIST` | IPs permitidos para `/admin` e `/api/admin` (opcional; vírgula) |
| `GA4_MEASUREMENT_ID` | ID de medição Google Analytics 4 (ex.: `G-XXXXXXXXXX`) |
| `CANONICAL_HOST` | Host canônico para redirect (padrão: `www.acurabrasil.org`) |
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

### Cadastro nos hubs (divulgação)

Checklist itens 5–8: cadastro manual nos diretórios humanitários venezuelanos.

1. Acesse `/admin/` → aba **Divulgação**
2. Revise o **Kit de listagem** (textos em espanhol) — copie descripción corta/larga
3. Para cada hub, copie o **link UTM de solicitud** e cadastre no site externo
4. Atualize status: `pendente` → `em_cadastro` → `publicado`
5. Quando publicado, salve a **URL da listagem** no hub

Hubs seedados: [venezuela-ayuda.vercel.app](https://venezuela-ayuda.vercel.app) (item 5 — **não** usar venezuela-ayuda.org), reconstruyamosvenezuela.org, info-central-terremoto-venezuela.com, ayudaavenezuela.org

**Prioridade telemedicina:** cadastre primeiro em ayudaavenezuela.org (“Postula tu iniciativa”, categoria Salud).

Variável opcional `SITE_URL` gera links UTM absolutos (ex.: `https://www.acurabrasil.org/solicitud-sos-venezuela.html?utm_source=...`).

### Parcerias BR e métricas (checklist 9–14)

1. Acesse `/admin/` → aba **Parcerias**
2. Acompanhe ONGs, igrejas e associações (itens 9–14) com status e datas de contato
3. Copie **template de e-mail** ou link UTM `utm_source=acnur|caritas|...`
4. Subaba **Métricas semanais**: funil live, origem UTM, snapshots semanais
5. Dashboard mostra parcerias ativas e solicitudes da semana

Parcerias seedadas: ACNUR, Cáritas, AVSI, FSF, Associações venezuelanas, Igrejas (Norte e SP).

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
