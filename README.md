# MediarPrev — Sistema Unificado de Atendimento

Sistema único que junta os dois sistemas que você tinha (ficha digital de
atendimento + painel de clientes/kanban), agora:

- **interligados**: ao salvar uma ficha, o card do cliente no painel é
  criado/atualizado automaticamente (e vice-versa: pelo card do cliente
  você abre/cria a ficha dele com um clique);
- **em nuvem**, usando **Firebase** (Authentication + Firestore), para que
  só as pessoas autorizadas por você acessem, de qualquer computador;
- com **exportação de fichas em PDF**;
- com uma lista de **"Fichas salvas"** para buscar, reabrir, exportar ou
  excluir qualquer ficha já preenchida.

Nenhum dado sai do seu próprio projeto Firebase — os dados dos clientes só
ficam no banco de dados que você criar e controlar.

---

## 1. Estrutura de arquivos

```
mediarprev/
├── index.html          → a aplicação inteira (abrir este arquivo/publicar este site)
├── css/styles.css       → visual do sistema
├── js/
│   ├── firebase-config.js  → ⚠️ AQUI você cola as chaves do SEU projeto Firebase
│   ├── auth.js              → login e controle de quem pode entrar
│   ├── kanban.js            → painel de clientes
│   ├── ficha.js              → ficha digital de atendimento
│   └── app.js                 → liga tudo
├── firestore.rules      → regras de segurança do banco de dados (copiar no Firebase)
└── README.md             → este arquivo
```

## 2. Criar o projeto no Firebase (gratuito no plano Spark, suficiente para poucos usuários)

1. Acesse **console.firebase.google.com** e crie um projeto novo (ex.: `mediarprev`).
2. No menu lateral, vá em **Build > Authentication** → aba **Sign-in method** →
   ative o provedor **E-mail/senha**.
3. Ainda em Authentication, aba **Users**, clique em **Add user** e crie um
   login (e-mail + senha) para cada pessoa que vai usar o sistema.
4. No menu lateral, vá em **Build > Firestore Database** → **Criar banco de
   dados** → escolha o modo **produção** e a região mais próxima (ex.:
   `southamerica-east1`).
5. Na aba **Regras** do Firestore, apague o conteúdo padrão e cole o
   conteúdo do arquivo `firestore.rules` deste projeto. Clique em **Publicar**.
6. Volte em **Configurações do projeto** (ícone de engrenagem) → role até
   **Seus apps** → clique no ícone **</>** (Web) → dê um nome (ex.: "painel")
   → **não** marque Firebase Hosting agora → **Registrar app**.
7. Copie o objeto `firebaseConfig` mostrado na tela e cole em
   `js/firebase-config.js`, substituindo os valores de exemplo.

## 3. Autorizar as pessoas que podem usar o sistema

Criar o login (passo 2.3) não é suficiente — é preciso também liberar o
acesso na coleção `allowed_users`, que é o que as regras de segurança
checam:

1. Em **Authentication > Users**, copie o **User UID** de cada pessoa que
   você criou.
2. Em **Firestore Database > Dados**, crie a coleção `allowed_users`.
3. Para cada pessoa, crie um documento cujo **ID do documento seja o
   próprio UID** copiado, com os campos:
   - `email` (string) — o e-mail da pessoa
   - `active` (boolean) — `true`
4. Pronto: só quem tiver um documento em `allowed_users` com `active: true`
   consegue entrar no sistema, mesmo que tenha o link.

Para revogar o acesso de alguém, basta mudar `active` para `false` (ou
apagar o documento) — não precisa mexer no código.

## 4. Publicar o site (hospedagem)

Você pode hospedar de qualquer forma que sirva arquivos estáticos. As duas
mais simples:

### Opção A — Firebase Hosting (recomendada, mesmo projeto)
```bash
npm install -g firebase-tools
firebase login
cd mediarprev
firebase init hosting     # escolha o projeto que você criou; pasta pública = "." (a pasta atual)
firebase deploy
```
Você receberá uma URL do tipo `https://mediarprev.web.app`.

### Opção B — Netlify / Vercel
Basta arrastar a pasta `mediarprev` no painel do Netlify (ou conectar um
repositório Git) — nenhuma configuração adicional é necessária, pois o
site é 100% estático (HTML/CSS/JS).

> **Importante:** o sistema precisa ser acessado via `http://` ou `https://`
> (um servidor, mesmo local) — abrir o `index.html` direto pelo
> "Arquivo > Abrir" do navegador pode não funcionar por causa das
> restrições de módulos JavaScript. Para testar localmente:
> `python3 -m http.server 8080` dentro da pasta `mediarprev` e acessar
> `http://localhost:8080`.

## 5. Como o vínculo entre a ficha e o painel funciona

- No **Painel de clientes**, cada card tem um botão **"📄 Criar/Abrir
  ficha"**: se o cliente ainda não tem ficha, abre uma nova já com nome e
  telefone preenchidos; se já tem, abre a ficha existente.
- Na **Ficha de atendimento**, ao clicar em **"☁ Salvar na nuvem"**, o
  sistema cria (ou atualiza) automaticamente o card do cliente
  correspondente no painel — você não precisa cadastrar o cliente duas
  vezes.
- Uma ficha também pode ser criada avulsa (sem passar pelo painel) — ela
  vira um card novo automaticamente ao ser salva.

## 6. Exportar em PDF

Na aba **Ficha de atendimento** há dois botões:
- **Exportar PDF (ficha do tipo selecionado)** — gera a ficha geral +
  a ficha específica do benefício marcado em "Tipo de atendimento".
- **Exportar PDF (ficha completa)** — gera todas as abas.

Os dois abrem a janela de impressão do navegador: escolha o destino
**"Salvar como PDF"** e clique em salvar. Na lista de **Fichas salvas**
também há um atalho **"Exportar PDF"** em cada linha, que já abre a ficha
certa e dispara a exportação.

## 7. Segurança e proteção de dados sensíveis (LGPD)

Este sistema lida com dados pessoais sensíveis (CPF, informações de
saúde em fichas de BPC/incapacidade, renda, dados de família, etc.), o
que exige cuidado sob a **LGPD (Lei Geral de Proteção de Dados)**. O que
já está implementado, e o que fica sob sua responsabilidade como
administrador/controlador dos dados:

**Já implementado no sistema:**
- Login obrigatório (e-mail/senha) — ninguém acessa sem autenticação.
- Lista de autorização (`allowed_users`) — só quem você liberar
  manualmente entra, mesmo com login válido.
- Regras do Firestore bloqueando qualquer leitura/escrita de quem não
  estiver autenticado e autorizado (inclusive tentativas diretas à API,
  fora do site).
- A coleção de autorização não pode ser alterada pelo próprio app —
  só manualmente no console, evitando autopromoção de acesso.
- Sessão de login expira ao fechar o navegador (`browserSessionPersistence`),
  reduzindo risco em computadores compartilhados do posto de atendimento.
- Tráfego sempre criptografado (HTTPS), tanto no Firebase Hosting quanto
  no SDK do Firestore/Auth.
- O painel (kanban) guarda o mínimo necessário do cliente (nome,
  telefone, benefício, observações) — CPF e dados sensíveis completos
  ficam só dentro da ficha, reduzindo exposição desnecessária.

**Recomendações para você configurar/manter (fora do código):**
1. **Segundo fator de autenticação (2FA)** na sua própria conta Google
   que administra o Firebase, para proteger o console do projeto.
2. **Restringir a API Key** do Firebase por domínio (HTTP referrer) em
   Google Cloud Console > APIs e serviços > Credenciais — camada extra,
   já que as regras do Firestore são a proteção principal.
3. **Backups periódicos**: configure exportações automáticas do
   Firestore (Firebase Console > Firestore > Backups, ou Cloud
   Scheduler + `gcloud firestore export`).
4. **Política de senhas fortes e trocas periódicas** para os usuários
   cadastrados em Authentication.
5. **Revisar o acesso periodicamente**: remova/desative usuários
   (`active: false`) que saírem da equipe.
6. **Minimização e retenção de dados**: defina por quanto tempo os
   dados de clientes/fichas precisam ficar armazenados e apague (ou
   arquive fora do sistema) o que não for mais necessário.
7. **Nomear um responsável pelo tratamento de dados (controlador)** e,
   se aplicável ao seu porte, manter um registro simples das operações
   de tratamento — exigência formal da LGPD.
8. Ative, se quiser uma camada adicional, o **Firebase App Check**
   (Console > App Check) para dificultar o uso da API por fora do seu
   site.
9. Nunca publique o arquivo `firestore.rules` alterado sem revisar —
   é ele que garante que os dados fiquem restritos.

## 8. Dúvidas comuns

- **"Posso adicionar mais pessoas depois?"** Sim — repita o passo 3
  (criar usuário em Authentication + documento em `allowed_users`).
- **"Perco os dados se trocar de computador?"** Não — tudo fica no
  Firestore (nuvem), não no navegador. O rascunho automático local é
  só uma rede de segurança contra quedas de internet no meio do
  preenchimento.
- **"Dá para usar sem internet?"** Não nesta versão — como os dados
  agora ficam sincronizados entre as pessoas em tempo real, é preciso
  conexão. O rascunho local evita perder o que foi digitado numa queda
  breve de conexão, mas salvar definitivamente exige estar online.
