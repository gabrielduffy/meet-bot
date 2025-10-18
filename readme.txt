# 🤖 Benemax Meet Bot - Instruções Completas

## 📁 Arquivos Criados

1. **Dockerfile** - Container do bot
2. **package.json** - Dependências Node.js
3. **bot.js** - Lógica do Puppeteer
4. **server.js** - API REST
5. **.env.example** - Variáveis de ambiente

---

## 🚀 PASSO 1: Deploy no Easypanel

### 1.1 Acesse seu Easypanel

Vá para o projeto **meetbenemaxanalises**

### 1.2 Adicionar Novo Serviço

1. Clique em **"+ Add Service"**
2. Escolha: **"App"**
3. Tipo: **"Docker Image"** ou **"GitHub"** (se criar repo)

### 1.3 Configurar Serviço

**Nome:** `meet-bot`

**Source:** 
- Se usar Docker Hub: criar imagem primeiro
- **Recomendo:** Usar **"Build from Source"**

**Build Configuration:**
```
Build Method: Dockerfile
Dockerfile Path: Dockerfile
```

### 1.4 Environment Variables

Clique em **"Environment"** e adicione:

```
PORT=3000
GOOGLE_EMAIL=contato@benemax.com.br
GOOGLE_PASSWORD=SUA_SENHA_AQUI
N8N_WEBHOOK_URL=https://n8n-n8n.ax5glv.easypanel.host/webhook/05ac8449-7d9f-483b-bf5b-89865ca4e302
```

⚠️ **IMPORTANTE:** Use a senha da conta Google da Benemax

### 1.5 Configurar Porta

**Port Mapping:**
- Container Port: `3000`
- Protocol: `HTTP`
- Public: ✅ Sim

### 1.6 Recursos

**Recomendado:**
- Memory: `1GB` (mínimo)
- CPU: `0.5` cores

### 1.7 Deploy

Clique em **"Deploy"** e aguarde (vai demorar ~5min para baixar dependências)

---

## 🧪 PASSO 2: Testar a API

### 2.1 Health Check

```bash
curl https://meet-bot.SEU_DOMINIO/health
```

Deve retornar:
```json
{
  "status": "ok",
  "activeBots": 0,
  "bots": []
}
```

---

## 📞 PASSO 3: Usar o Bot

### 3.1 Iniciar Bot em uma Reunião

**Método:** `POST /api/join`

**Body:**
```json
{
  "meetingUrl": "https://meet.google.com/xxx-yyyy-zzz",
  "meetingTitle": "Reunião com Cliente XYZ",
  "botId": "reuniao_cliente_xyz"
}
```

**Exemplo cURL:**
```bash
curl -X POST https://meet-bot.SEU_DOMINIO/api/join \
  -H "Content-Type: application/json" \
  -d '{
    "meetingUrl": "https://meet.google.com/abc-defg-hij",
    "meetingTitle": "Reunião Teste",
    "botId": "teste1"
  }'
```

**Resposta:**
```json
{
  "success": true,
  "message": "Bot iniciado",
  "botId": "teste1",
  "info": "O bot está entrando na reunião em background"
}
```

### 3.2 Parar Bot e Processar Gravação

**Método:** `POST /api/leave/:botId`

**Exemplo:**
```bash
curl -X POST https://meet-bot.SEU_DOMINIO/api/leave/teste1
```

**Resposta:**
```json
{
  "success": true,
  "message": "Gravação enviada para processamento",
  "n8nResponse": {
    "transcription_id": "uuid..."
  }
}
```

### 3.3 Listar Bots Ativos

```bash
curl https://meet-bot.SEU_DOMINIO/api/bots
```

---

## 🔗 PASSO 4: Integrar com n8n

### 4.1 Criar Webhook de Controle no n8n

Crie um novo workflow no n8n:

```
Webhook (POST /start-meet-bot)
    ↓
HTTP Request (chama /api/join do bot)
    ↓
Aguardar X minutos ou receber sinal
    ↓
HTTP Request (chama /api/leave do bot)
```

### 4.2 Exemplo de Workflow

**Nó 1: Webhook**
- Method: POST
- Path: `start-meet-bot`
- Body esperado:
```json
{
  "meetingUrl": "URL_DO_MEET",
  "meetingTitle": "Título",
  "duration": 60
}
```

**Nó 2: HTTP Request - Iniciar Bot**
- URL: `https://meet-bot.SEU_DOMINIO/api/join`
- Method: POST
- Body: `{{ $json }}`

**Nó 3: Wait (Aguardar)**
- Duration: `{{ $json.duration }}` minutos

**Nó 4: HTTP Request - Parar Bot**
- URL: `https://meet-bot.SEU_DOMINIO/api/leave/{{ $('HTTP Request').item.json.botId }}`
- Method: POST

---

## 🎯 PASSO 5: Usar no Dia a Dia

### Cenário 1: Reunião Agendada

1. Vendedor agenda reunião e pega o link do Meet
2. Envia para seu sistema (pode ser via form, API, etc)
3. Sistema chama o webhook do n8n com o link
4. n8n inicia o bot
5. Bot entra na reunião
6. Após X minutos (ou comando manual), n8n para o bot
7. Bot processa e envia para Lovable

### Cenário 2: Reunião Instantânea

1. Vendedor clica em botão "Gravar Esta Reunião"
2. Frontend pega URL atual do Meet
3. Chama API do bot diretamente
4. Bot entra e grava
5. Vendedor clica em "Parar" quando terminar

---

## ⚠️ Observações Importantes

### Sobre o Bot na Reunião

- ✅ **Bot aparece como participante** "Benemax Bot" (ou nome da conta)
- ✅ Clientes **vão ver** o bot na lista de participantes
- ✅ Bot entra com **câmera e microfone desligados**
- ✅ **Totalmente automático** após iniciar

### Sobre Recursos

- 📊 **Cada bot ativo:** ~500MB RAM
- ⏱️ **Limite:** ~10 bots simultâneos com 1GB (ajustar conforme necessidade)
- 💾 **Storage:** Gravações temporárias (deletadas após enviar)

### Sobre Segurança

- 🔐 Credenciais Google em variáveis de ambiente
- 🔒 API sem autenticação (adicione se expor publicamente)
- 📝 Logs detalhados de todas as ações

### Troubleshooting

**Bot não entra na reunião:**
- Verificar se conta Google está ativa
- Verificar se link do Meet está correto
- Verificar logs: `docker logs meet-bot`

**Erro de login:**
- Se tiver 2FA, criar "Senha de App"
- Verificar se senha está correta no .env

**Gravação não processa:**
- Verificar se webhook n8n está ativo
- Verificar se Whisper API está rodando
- Checar logs do n8n

---

## 🆘 Comandos Úteis

### Ver Logs do Bot
```bash
docker logs -f meet-bot
```

### Restart do Bot
```bash
# No Easypanel, clique em "Restart" no serviço
```

### Parar Todos os Bots (Emergência)
```bash
curl -X POST https://meet-bot.SEU_DOMINIO/api/stop-all
```

---

## 📊 Fluxo Completo Final

```
Vendedor agenda reunião
    ↓
Sistema captura link do Meet
    ↓
Chama API do Bot (/api/join)
    ↓
Bot entra na reunião automaticamente
    ↓
Bot grava áudio
    ↓
Reunião termina → Chama /api/leave
    ↓
Bot para gravação
    ↓
Bot envia áudio para n8n
    ↓
n8n → Whisper API (transcrição)
    ↓
n8n → Lovable (salva no banco)
    ↓
✅ Transcrição disponível no sistema!
```

---

## ✨ Pronto!

Você agora tem um bot totalmente funcional que:
- ✅ Entra automaticamente nas reuniões
- ✅ Grava o áudio
- ✅ Processa e envia para seu sistema
- ✅ Funciona 24/7
- ✅ Escala para múltiplas reuniões simultâneas

**Qualquer dúvida, consulte os logs ou me avise!** 🚀