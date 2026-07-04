# Relatório de Segurança — ACURA BRASIL (acurabrasil-site)

**Data da auditoria:** 4 de julho de 2026  
**Escopo:** código-fonte completo do repositório (backend Node.js/Express, frontend estático, SQLite, integrações Resend/PayPal/Doctor8)  
**Metodologia:** revisão manual de código, análise de configuração e `npm audit`

---

## 1. Sumário Executivo

### Nota geral de segurança: **6,0 / 10**

O projeto demonstra **consciência de segurança acima da média** para um site institucional: headers HTTP de proteção, consultas SQL parametrizadas, honeypot anti-spam, rate limiting básico, cookies de sessão admin com `HttpOnly`/`SameSite`, consentimento LGPD nos formulários e política de privacidade. Porém, por tratar **dados pessoais e dados sensíveis de saúde** (formulário SOS Venezuela), as lacunas em **proteção do painel admin**, **entropia do protocolo de atendimento**, **endpoint público de mutação de intake** e **limitações estruturais do rate limiting** elevam o risco real em produção.

### Contagem de achados

| Severidade   | Quantidade |
|-------------|------------|
| Crítico     | 2          |
| Alto        | 6          |
| Médio       | 8          |
| Baixo       | 5          |
| Informativo | 12         |

---

## 2. Inventário Técnico

### Stack, frameworks e versões detectadas

| Componente        | Versão detectada | Fonte |
|------------------|------------------|-------|
| Node.js          | ≥ 18 (engines)   | `package.json:14` |
| Express          | ^4.21.2 → **4.22.2** (lock) | `package.json`, `package-lock.json:1545` |
| better-sqlite3   | **12.11.1**      | `package-lock.json:1090` |
| compression      | ^1.8.1           | `package.json:19` |
| nodemailer       | **9.0.1**        | `package-lock.json:1972` |
| qrcode           | ^1.5.4           | `package.json:22` |
| @fontsource/inter| ^5.2.5           | `package.json:17` |
| esbuild (dev)    | ^0.25.5 → **0.25.12** | `package-lock.json` |
| sharp (dev)      | ^0.34.2          | `package.json:26` |
| Frontend         | HTML/CSS/JS estático (sem framework SPA) | `public/` |
| Banco de dados   | SQLite (WAL, FK ON) | `lib/db.js:98-100` |
| Deploy           | Railway (Nixpacks) | `railway.json` |

### Dependências e CVEs

Execução de `npm audit` (produção e completo): **0 vulnerabilidades conhecidas** reportadas pelo npm advisory database na data da auditoria.

**Observação:** o lockfile resolve Express 4.22.2 (patch acima do mínimo declarado em `package.json`). Recomenda-se manter `npm audit` no CI mesmo com resultado zerado.

---

## 3. Achados de Vulnerabilidade

### ACH-001 — Painel admin acessível na internet sem allowlist obrigatória

| Campo | Detalhe |
|-------|---------|
| **Severidade** | **Crítico** |
| **Arquivo / linha** | `lib/admin-ip-guard.js:12-14`, `server.js:136-137` |
| **Descrição** | A proteção por IP (`ADMIN_IP_ALLOWLIST`) é **opcional**. Quando não configurada, `adminIpGuard` chama `next()` sem restrição, expondo `/admin/`, `/admin/login.html` e `/api/admin/*` à internet. |
| **Cenário de exploração** | Atacante descobre `/admin/login.html`, executa brute force distribuído contra `/api/admin/login` (5 tentativas/IP/15 min, resetável com IPs rotativos) e, se credenciais fracas, obtém acesso a **todos os intakes** (nome, e-mail, telefone, sintomas, observações clínicas). |
| **Correção recomendada** | Tornar allowlist ou Cloudflare Access **obrigatório em produção**; falhar o startup se ausente. |
| **OWASP** | A01:2021 — Broken Access Control |

```javascript
// lib/admin-ip-guard.js — rejeitar em produção sem allowlist
function adminIpGuard(req, res, next) {
  const allowlist = parseAdminAllowlist();
  if (!allowlist) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).send('Admin unavailable');
    }
    return next();
  }
  // ... restante inalterado
}
```

---

### ACH-002 — Endpoint público permite alterar metadados de intakes médicos sem autenticação

| Campo | Detalhe |
|-------|---------|
| **Severidade** | **Crítico** |
| **Arquivo / linha** | `server.js:79`, `lib/intake-events.js:10-23`, `lib/intake-events.js:63-74` |
| **Descrição** | `POST /api/sos-venezuela/intake/:protocolo/event` não exige autenticação. Qualquer pessoa que conheça (ou adivinhe) um protocolo pode registrar eventos (`doctor8_register`, `doctor8_login`, `whatsapp_help`). |
| **Cenário de exploração** | Atacante enumera protocolos (`SOS-VE-YYYYMMDD-XXXX`, ver ACH-003) e envia POSTs falsos, corrompendo métricas de triagem e timestamps usados pela equipe operacional. |
| **Correção recomendada** | Exigir token de intake retornado no submit, assinado com HMAC, ou mover tracking para endpoint autenticado admin. |
| **OWASP** | A01:2021 — Broken Access Control |

```javascript
// lib/intake-events.js — validar token emitido no intake
function recordIntakeEvent(protocolo, event, intakeToken) {
  const column = VALID_EVENTS[event];
  if (!column) return { ok: false, error: 'invalid_event' };
  const db = getDb();
  const row = db.prepare(
    'SELECT id, intake_token FROM sos_intakes WHERE protocolo = ?'
  ).get(protocolo);
  if (!row || !verifyIntakeToken(protocolo, intakeToken, row.intake_token)) {
    return { ok: false, error: 'unauthorized' };
  }
  // ... UPDATE
}
```

---

### ACH-003 — Protocolo de intake com entropia baixa (enumerável)

| Campo | Detalhe |
|-------|---------|
| **Severidade** | **Alto** |
| **Arquivo / linha** | `lib/sos-venezuela-intake.js:140-151` |
| **Descrição** | Protocolo `SOS-VE-YYYYMMDD-` + **4 caracteres** de alfabeto de 32 símbolos ≈ **1.048.576 combinações/dia**. Prefixo data é previsível. |
| **Cenário de exploração** | Script automatizado testa combinações do dia contra ACH-002 ou inferência de existência via respostas 404/200. |
| **Correção recomendada** | Usar sufixo criptograficamente aleatório (≥ 128 bits), ex.: `crypto.randomBytes(16).toString('hex')`. |
| **OWASP** | A02:2021 — Cryptographic Failures |

```javascript
function generateProtocol() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const suffix = crypto.randomBytes(16).toString('hex');
  return `SOS-VE-${y}${m}${d}-${suffix}`;
}
```

---

### ACH-004 — Segredo de sessão admin com fallback inseguro

| Campo | Detalhe |
|-------|---------|
| **Severidade** | **Alto** |
| **Arquivo / linha** | `lib/admin-auth.js:11-18` |
| **Descrição** | Se `ADMIN_SESSION_SECRET` estiver ausente ou &lt; 32 chars, o código usa `'dev-insecure-secret-change-in-production-32chars'` (público no repositório). |
| **Cenário de exploração** | Em produção mal configurada, atacante forja cookie `acura_admin_session` HMAC-SHA256 e obtém sessão admin sem login. |
| **Correção recomendada** | Em `NODE_ENV=production`, **abortar startup** se segredo inválido; nunca usar fallback hardcoded. |
| **OWASP** | A02:2021 — Cryptographic Failures |

```javascript
function getSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ADMIN_SESSION_SECRET must be set (32+ chars) in production');
    }
    return secret || crypto.randomBytes(32).toString('hex'); // apenas dev local
  }
  return secret;
}
```

---

### ACH-005 — Cookie de sessão admin sem flag `Secure` se `NODE_ENV` não for `production`

| Campo | Detalhe |
|-------|---------|
| **Severidade** | **Alto** |
| **Arquivo / linha** | `lib/admin-auth.js:71`, `lib/admin-auth.js:79` |
| **Descrição** | `Secure` só é adicionado quando `NODE_ENV === 'production'`. Railway pode rodar sem essa variável definida. |
| **Cenário de exploração** | Cookie de sessão transmitido em requisição HTTP downgrade ou mixed content, permitindo interceptação em rede hostil. |
| **Correção recomendada** | Detectar HTTPS via `req.secure` / `x-forwarded-proto` ou forçar `Secure` sempre atrás de proxy TLS. |
| **OWASP** | A05:2021 — Security Misconfiguration |

```javascript
function setSessionCookie(res, username, req) {
  const token = createSessionToken(username);
  const secure =
    process.env.NODE_ENV === 'production' ||
    req?.secure ||
    req?.headers?.['x-forwarded-proto'] === 'https'
      ? '; Secure'
      : '';
  // ...
}
```

---

### ACH-006 — Dados sensíveis de saúde em SQLite sem criptografia em repouso

| Campo | Detalhe |
|-------|---------|
| **Severidade** | **Alto** |
| **Arquivo / linha** | `lib/db.js:176-196`, `lib/sos-intake-store.js:13-22` |
| **Descrição** | Campos `sintomas`, `observaciones`, `nome_paciente`, `edad`, etc. são persistidos em texto claro em `acura-sos.db`. |
| **Cenário de exploração** | Comprometimento do volume Railway, backup exposto ou cópia local do arquivo `.db` revela prontuários simplificados de pacientes. |
| **Correção recomendada** | Criptografia em repouso (SQLCipher), controle de acesso ao volume, backups cifrados, política de retenção documentada. |
| **OWASP** | A02:2021 — Cryptographic Failures / LGPD Art. 46 |

---

### ACH-007 — Criação de planos PayPal sem autenticação (abuso de API)

| Campo | Detalhe |
|-------|---------|
| **Severidade** | **Alto** |
| **Arquivo / linha** | `server.js:82`, `lib/paypal.js:141-147`, `lib/paypal.js:153-177` |
| **Descrição** | `POST /api/paypal/subscription-plan` cria produtos e planos no catálogo PayPal com rate limit de apenas 30 s/IP em memória. |
| **Cenário de exploração** | Atacante dispara milhares de requisições (IPs rotativos) criando produtos/planos órfãos, poluindo conta merchant e consumindo quota da API. |
| **Correção recomendada** | CAPTCHA, rate limit persistente (Redis), limite diário global, ou pré-gerar planos fixos server-side. |
| **OWASP** | A04:2021 — Insecure Design |

---

### ACH-008 — CSP permissiva com `'unsafe-inline'` em scripts e estilos

| Campo | Detalhe |
|-------|---------|
| **Severidade** | **Alto** |
| **Arquivo / linha** | `server.js:48-61` (linhas 52-53) |
| **Descrição** | `script-src 'self' 'unsafe-inline'` e `style-src 'self' 'unsafe-inline'` anulam grande parte da proteção CSP contra XSS. |
| **Cenário de exploração** | Qualquer vetor XSS refletido/armazenado (ex.: futura regressão em `innerHTML`) executa JavaScript inline livremente. |
| **Correção recomendada** | Migrar scripts inline para arquivos externos; usar nonces/hashes CSP; remover `'unsafe-inline'`. |
| **OWASP** | A03:2021 — Injection (XSS) / A05:2021 — Security Misconfiguration |

---

### ACH-009 — Rate limiting apenas em memória (ineficaz em múltiplas instâncias)

| Campo | Detalhe |
|-------|---------|
| **Severidade** | **Médio** |
| **Arquivo / linha** | `lib/contact.js:19-32`, `lib/sos-venezuela-intake.js:29-58`, `lib/admin-auth.js:8-9`, `lib/paypal.js:3-4` |
| **Descrição** | Todos os limitadores usam `Map` in-process; reinício do processo zera contadores; N réplicas Railway multiplicam o limite efetivo. |
| **Cenário de exploração** | Spam massivo em formulários de contato/doação/intake; brute force admin distribuído. |
| **Correção recomendada** | Rate limit centralizado (Redis, Upstash, Cloudflare WAF). |
| **OWASP** | A04:2021 — Insecure Design |

---

### ACH-010 — Rate limit do intake SOS só após persistência bem-sucedida

| Campo | Detalhe |
|-------|---------|
| **Severidade** | **Médio** |
| **Arquivo / linha** | `lib/sos-venezuela-intake.js:370-384` |
| **Descrição** | `recordRateLimit()` só é chamado após `persistIntake` com sucesso. Tentativas inválidas ou falhas de DB não consomem quota. |
| **Cenário de exploração** | Flood de POSTs com corpo inválido para CPU/IO ou e-mail de notificação (se configurado). |
| **Correção recomendada** | Aplicar rate limit por IP **antes** da validação, como em `lib/contact.js:265-268`. |
| **OWASP** | A04:2021 — Insecure Design |

---

### ACH-011 — Exposição de nomes de voluntários via API pública

| Campo | Detalhe |
|-------|---------|
| **Severidade** | **Médio** |
| **Arquivo / linha** | `lib/admin-api.js:85-92`, `lib/sos-schedule.js:78-94`, `lib/sos-schedule.js:104-120` |
| **Descrição** | `GET /api/sos-venezuela/public-info` retorna `volunteerDisplay` / `volunteer` com nomes reais da escala. |
| **Cenário de exploração** | Enumeração/OSINT de voluntários; targeted harassment ou phishing personalizado. |
| **Correção recomendada** | Exibir apenas papéis genéricos publicamente (“Voluntário de triagem”) ou pseudônimos. |
| **OWASP** | A01:2021 — Broken Access Control / LGPD minimização |

---

### ACH-012 — Bug: variável indefinida em envio SMTP/Resend do formulário de contato

| Campo | Detalhe |
|-------|---------|
| **Severidade** | **Médio** |
| **Arquivo / linha** | `lib/contact.js:222`, `lib/contact.js:249-253` |
| **Descrição** | `sendViaResend` usa `reply_to: email` (variável inexistente; deveria ser `data.email`). `sendViaSmtp` usa `nome` e `email` não definidos no escopo da função. |
| **Cenário de exploração** | Indisponibilidade do canal de contato (500), impedindo reporte de incidentes; não é bypass de autenticação, mas afeta resposta a incidentes de segurança. |
| **Correção recomendada** | Corrigir referências para `data.email` e `data.nome`. |
| **OWASP** | A04:2021 — Insecure Design (disponibilidade) |

```javascript
async function sendViaResend(data) {
  // ...
  body: JSON.stringify({
    from,
    to: [to],
    reply_to: data.email,
    subject,
    text,
  }),
}

async function sendViaSmtp(data) {
  const { nome, email, subject, text } = data;
  const safeName = sanitizeDisplayName(nome);
  // ...
}
```

---

### ACH-013 — Token de confirmação de newsletter via GET (vazamento em logs/histórico)

| Campo | Detalhe |
|-------|---------|
| **Severidade** | **Médio** |
| **Arquivo / linha** | `lib/newsletter.js:142`, `lib/newsletter.js:172-191` |
| **Descrição** | Link de confirmação inclui token de 64 hex chars na query string; confirmação é idempotente sem expiração visível. |
| **Cenário de exploração** | Token vaza via Referer, logs de proxy, histórico compartilhado; terceiro confirma inscrição alheia. |
| **Correção recomendada** | POST com token one-time + expiração (24–72 h); invalidar token após uso. |
| **OWASP** | A07:2021 — Identification and Authentication Failures |

---

### ACH-014 — Possível XSS via URLs em JSON de profissionais (protocolo `javascript:`)

| Campo | Detalhe |
|-------|---------|
| **Severidade** | **Médio** |
| **Arquivo / linha** | `public/js/consulta-profissionais.js:61-63`, `public/js/consulta-profissionais.js:78-80` |
| **Descrição** | `escapeHtml()` escapa caracteres HTML mas **não valida esquema de URL**. Se `prof.photo` ou `prof.agendamento` contiver `javascript:...`, pode executar script ao clicar/abrir. |
| **Cenário de exploração** | Comprometimento ou edição maliciosa de `public/data/profissionais-consulta.json` → XSS armazenado no catálogo público. |
| **Correção recomendada** | Validar URLs (`https:`/`http:` apenas) antes de renderizar. |
| **OWASP** | A03:2021 — Injection (XSS) |

```javascript
function safeHttpUrl(url) {
  try {
    const u = new URL(url, window.location.origin);
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
  } catch { /* ignore */ }
  return '#';
}
// usar safeHttpUrl(prof.photo) e safeHttpUrl(prof.agendamento)
```

---

### ACH-015 — Senha admin em texto plano suportada via variável de ambiente

| Campo | Detalhe |
|-------|---------|
| **Severidade** | **Médio** |
| **Arquivo / linha** | `lib/admin-auth.js:126-140`, `.env.example:11-12` |
| **Descrição** | `ADMIN_PASSWORD` comparado diretamente (mesmo com `timingSafeEqual`). Hash scrypt (`ADMIN_PASSWORD_HASH`) é opcional. |
| **Cenário de exploração** | Vazamento de `.env` ou painel Railway expõe senha reversível; reuso em outros sistemas. |
| **Correção recomendada** | Exigir `ADMIN_PASSWORD_HASH` em produção; remover suporte a senha plain. |
| **OWASP** | A07:2021 — Identification and Authentication Failures |

---

### ACH-016 — ID GA4 hardcoded como fallback público

| Campo | Detalhe |
|-------|---------|
| **Severidade** | **Baixo** |
| **Arquivo / linha** | `server.js:69-72`, `.env.example:19` |
| **Descrição** | `GA4_MEASUREMENT_ID` default `G-ZXE5T1VCGS` exposto via `/api/site-config`. |
| **Cenário de exploração** | Poluição de analytics com eventos falsos (baixo impacto). |
| **Correção recomendada** | Sem fallback; retornar string vazia se env ausente. |
| **OWASP** | A05:2021 — Security Misconfiguration |

---

### ACH-017 — Chave Pix (CNPJ) hardcoded no cliente

| Campo | Detalhe |
|-------|---------|
| **Severidade** | **Baixo** (informativo de negócio) |
| **Arquivo / linha** | `public/js/doacao.js:4-8` |
| **Descrição** | CNPJ `30.350.850/0001-80` embutido para QR Pix — dado **público institucional**, não segredo bancário. |
| **Cenário de exploração** | N/A (uso legítimo); risco limitado a QR Pix fraudulento em sites clone (phishing externo). |
| **Correção recomendada** | Manter; opcionalmente servir via `/api/site-config` para centralizar. |
| **OWASP** | A05:2021 — Security Misconfiguration (exposição intencional) |

---

### ACH-018 — Scripts de terceiros carregados dinamicamente sem SRI

| Campo | Detalhe |
|-------|---------|
| **Severidade** | **Baixo** |
| **Arquivo / linha** | `public/js/doacao.js:403-418`, `public/js/analytics.js:26-29` |
| **Descrição** | PayPal SDK e gtag são injetados via `<script src=...>` sem atributo `integrity`. |
| **Cenário de exploração** | Comprometimento do CDN PayPal/Google → execução de JS malicioso (CSP mitiga parcialmente domínios). |
| **Correção recomendada** | Onde possível, SRI + fallback; para SDKs dinâmicos, monitorar CSP e subresource pinning corporativo. |
| **OWASP** | A08:2021 — Software and Data Integrity Failures |

---

### ACH-019 — HSTS sem diretiva `preload`

| Campo | Detalhe |
|-------|---------|
| **Severidade** | **Baixo** |
| **Arquivo / linha** | `server.js:41-43` |
| **Descrição** | HSTS presente (`max-age=31536000; includeSubDomains`) mas sem `preload`. |
| **Cenário de exploração** | Primeira visita HTTP antes do redirect (janela pequena). |
| **Correção recomendada** | Avaliar inclusão em preload list após garantir HTTPS em todos subdomínios. |
| **OWASP** | A05:2021 — Security Misconfiguration |

---

### ACH-020 — Conta admin única, sem MFA e sem RBAC granular

| Campo | Detalhe |
|-------|---------|
| **Severidade** | **Baixo** |
| **Arquivo / linha** | `lib/admin-auth.js:143-167`, `lib/admin-api.js:78-140` |
| **Descrição** | Um usuário (`ADMIN_USERNAME`); todos endpoints admin usam mesmo `requireAdmin` sem papéis. |
| **Cenário de exploração** | Credencial comprometida = acesso total (intakes, voluntários, parcerias, export CSV). |
| **Correção recomendada** | MFA (TOTP/WebAuthn), contas individuais, auditoria de ações. |
| **OWASP** | A07:2021 — Identification and Authentication Failures |

---

### Categorias verificadas sem achados adicionais

| Categoria | Resultado |
|-----------|-----------|
| **Segredos hardcoded (API keys, tokens reais)** | Verificado — nenhuma chave real no código; apenas placeholders em `.env.example`. Segredos via `process.env`. |
| **Injeção SQL** | Verificado, sem achados — queries parametrizadas (`better-sqlite3` `@param` / `?`). |
| **Command injection** | Verificado, sem achados — sem `exec`/`spawn` com input do usuário. |
| **Upload de arquivos** | Verificado, sem achados — nenhum endpoint de upload. |
| **CORS mal configurado** | Verificado, sem achados — headers CORS não definidos (same-origin default). |
| **Source maps em produção** | Verificado, sem achados — nenhum `.map` publicado em `public/`. |
| **Arquivo `.env` versionado** | Verificado, sem achados — `.env` em `.gitignore:2`. |
| **Stack traces ao cliente** | Verificado, sem achados — erros retornam `{ error: 'server_error' }` (`server.js:121-127`). |

### ACH-021 — XSS via `data-i18n-html` (risco residual baixo)

| Campo | Detalhe |
|-------|---------|
| **Severidade** | **Informativo** |
| **Arquivo / linha** | `public/js/i18n.js:30-31` |
| **Descrição** | Conteúdo i18n com HTML é inserido via `innerHTML`. Fonte atual: arquivos estáticos controlados (`i18n-*.js`). |
| **Cenário de exploração** | Apenas se pipeline i18n for comprometido. |
| **Correção recomendada** | Sanitizar HTML ou usar DOMPurify para chaves `data-i18n-html`. |
| **OWASP** | A03:2021 — Injection (XSS) |

---

## 4. Privacidade e LGPD

### Dados pessoais coletados

| Origem | Dados | Armazenamento | Transmissão |
|--------|-------|---------------|-------------|
| Formulário contato (`/api/contact`) | Nome, e-mail, telefone, mensagem | E-mail (Resend/SMTP); **não persiste em DB** | TLS (HTTPS em produção) |
| Formulário doação (`/api/contact`, assunto `doacao`) | Idem + valor/tipo doação | E-mail | TLS |
| SOS Venezuela intake (`/api/sos-venezuela/intake`) | Nome, e-mail, telefone, relação, **nome/idade do paciente**, localização, **sintomas**, observações | SQLite `sos_intakes` + e-mail | TLS |
| Newsletter (`/api/newsletter`) | Nome, e-mail, IP | SQLite `newsletter_subscribers` | TLS |
| Admin (operacional) | Dados de voluntários, parcerias, logs de triagem | SQLite | TLS + cookie sessão |

### Dados sensíveis (Art. 5º, II — saúde)

Campos `sintomas`, `tipo_atencion`, `prioridad`, `observaciones` e dados do paciente constituem **dados sensíveis sobre saúde**. São:

- Coletados **com consentimento** (`consentimiento`, `lgpd_privacidade`) — `lib/sos-venezuela-intake.js:214-218`
- Versionados (`PRIVACY_POLICY_VERSION = '2026-07'`) — linha 26
- Persistidos **sem criptografia em repouso** (ACH-006) — risco LGPD elevado

### Política de privacidade e consentimento

- Página dedicada: `public/privacidade.html` (seções 1–11, LGPD)
- Checkbox obrigatório nos formulários (`privacidade`, `lgpd_privacidade`)
- Banner de cookies com opt-in para analytics: `public/js/cookie-consent.js`
- GA4 só carrega após consentimento `all`: `public/js/analytics.js:13-18`, `45-47`

### Logs com dados pessoais

- Logs de erro evitam dump de corpo de requisição; exceção: Resend loga status + corpo de erro (`lib/contact.js:230`) que **pode** conter metadados — revisar em produção.
- Protocolo SOS logado em warn (`lib/sos-venezuela-intake.js:404`) — baixo risco isolado.

### Cookies e rastreadores

| Cookie / storage | Finalidade | Consentimento |
|------------------|------------|---------------|
| `acura_admin_session` | Sessão admin | N/A (operacional interno) |
| `acura.cookie.consent` (localStorage) | Preferência cookies | Próprio banner |
| `acura.lang` (localStorage) | Idioma | Essencial |
| GA4 (`_ga*`) | Analytics | Somente após aceite |

PayPal define cookies próprios no iframe — mencionar na política de privacidade (seção cookies).

### Transferência internacional

- Resend, PayPal, Doctor8, Google Analytics — possível transferência para EUA; política menciona compartilhamento (verificar textos i18n em `privacy.s4` / `privacy.s5`).

---

## 5. Plano de Ação Priorizado

| Prioridade | Ação | Severidade | Esforço | Arquivos afetados |
|:----------:|------|:----------:|:-------:|-------------------|
| 1 | Tornar `ADMIN_IP_ALLOWLIST` (ou Cloudflare Access) **obrigatório** em produção | Crítico | Baixo | `lib/admin-ip-guard.js`, `server.js` |
| 2 | Autenticar endpoint de eventos de intake (token HMAC por protocolo) | Crítico | Médio | `lib/intake-events.js`, `lib/sos-intake-store.js`, `lib/sos-venezuela-intake.js`, `public/js/sos-venezuela-intake.js` |
| 3 | Aumentar entropia do protocolo SOS (`randomBytes(16)`) | Alto | Baixo | `lib/sos-venezuela-intake.js` |
| 4 | Eliminar fallback de `ADMIN_SESSION_SECRET`; abortar startup se inválido | Alto | Baixo | `lib/admin-auth.js` |
| 5 | Forçar cookie `Secure` em ambiente HTTPS (Railway) | Alto | Baixo | `lib/admin-auth.js` |
| 6 | Criptografia em repouso / hardening do volume SQLite com dados de saúde | Alto | Alto | `lib/db.js`, infra Railway |
| 7 | Rate limiting centralizado (Redis/WAF) | Médio | Médio | `lib/contact.js`, `lib/sos-venezuela-intake.js`, `lib/admin-auth.js`, `lib/paypal.js` |
| 8 | Corrigir bug `email`/`nome` indefinidos em `lib/contact.js` | Médio | Baixo | `lib/contact.js` |
| 9 | Endurecer CSP (remover `'unsafe-inline'`) | Alto | Alto | `server.js`, HTML inline |
| 10 | Anonimizar nomes de voluntários na API pública | Médio | Baixo | `lib/sos-schedule.js` |
| 11 | Validar esquemas URL em `consulta-profissionais.js` | Médio | Baixo | `public/js/consulta-profissionais.js` |
| 12 | Exigir `ADMIN_PASSWORD_HASH` em produção | Médio | Baixo | `lib/admin-auth.js`, `.env.example` |
| 13 | Proteger `/api/paypal/subscription-plan` contra abuso | Alto | Médio | `lib/paypal.js` |
| 14 | Token newsletter com expiração + confirmação POST | Médio | Médio | `lib/newsletter.js` |

---

## 3 correções mais urgentes (resumo)

1. **Bloquear o painel `/admin` na internet** até que `ADMIN_IP_ALLOWLIST` ou Cloudflare Access esteja ativo em produção.  
2. **Exigir autenticação no endpoint `POST /api/sos-venezuela/intake/:protocolo/event`** e aumentar a entropia do protocolo para impedir enumeração.  
3. **Configurar `ADMIN_SESSION_SECRET` forte (32+ chars) sem fallback** e garantir flag `Secure` no cookie de sessão em HTTPS.

---

*Relatório gerado por auditoria estática de código. Recomenda-se complementar com teste de penetração autorizado em ambiente de staging e revisão de configuração Railway (variáveis de ambiente, volumes, backups).*
