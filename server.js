require('dotenv').config();
const express = require('express');
const MeetBot = require('./bot');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const GOOGLE_EMAIL = process.env.GOOGLE_EMAIL;
const GOOGLE_PASSWORD = process.env.GOOGLE_PASSWORD;

// Armazenar instâncias de bots ativos
const activeBots = new Map();

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    activeBots: activeBots.size,
    bots: Array.from(activeBots.keys())
  });
});

// Iniciar bot e entrar na reunião
app.post('/api/join', async (req, res) => {
  const { meetingUrl, meetingTitle, botId } = req.body;

  if (!meetingUrl) {
    return res.status(400).json({ error: 'meetingUrl é obrigatório' });
  }

  const id = botId || `bot_${Date.now()}`;

  try {
    console.log(`\n📞 Iniciando bot ${id} para reunião: ${meetingTitle || meetingUrl}`);

    // Criar novo bot
    const bot = new MeetBot();
    activeBots.set(id, bot);

    // Processo assíncrono - não bloquear resposta
    (async () => {
      try {
        await bot.initialize();
        await bot.login(GOOGLE_EMAIL, GOOGLE_PASSWORD);
        await bot.joinMeeting(meetingUrl, meetingTitle || 'Reunião Benemax');
        console.log(`✅ Bot ${id} entrou na reunião com sucesso`);
      } catch (error) {
        console.error(`❌ Erro no bot ${id}:`, error.message);
        activeBots.delete(id);
        await bot.close();
      }
    })();

    res.json({
      success: true,
      message: 'Bot iniciado',
      botId: id,
      info: 'O bot está entrando na reunião em background'
    });

  } catch (error) {
    console.error('Erro ao iniciar bot:', error);
    activeBots.delete(id);
    res.status(500).json({
      error: 'Erro ao iniciar bot',
      details: error.message
    });
  }
});

// Parar gravação e processar
app.post('/api/leave/:botId', async (req, res) => {
  const { botId } = req.params;

  const bot = activeBots.get(botId);

  if (!bot) {
    return res.status(404).json({ error: 'Bot não encontrado' });
  }

  try {
    console.log(`\n⏹️ Parando bot ${botId}...`);

    // Parar gravação
    const recordingData = await bot.stopRecording();
    
    // Sair da reunião
    await bot.leaveMeeting();
    
    // Enviar para n8n
    const result = await bot.sendToN8n(recordingData);
    
    // Fechar navegador
    await bot.close();
    
    // Remover da lista
    activeBots.delete(botId);

    console.log(`✅ Bot ${botId} finalizado com sucesso`);

    res.json({
      success: true,
      message: 'Gravação enviada para processamento',
      n8nResponse: result
    });

  } catch (error) {
    console.error('Erro ao parar bot:', error);
    
    // Tentar fechar de qualquer forma
    await bot.close().catch(() => {});
    activeBots.delete(botId);

    res.status(500).json({
      error: 'Erro ao parar bot',
      details: error.message
    });
  }
});

// Listar bots ativos
app.get('/api/bots', (req, res) => {
  const bots = Array.from(activeBots.entries()).map(([id, bot]) => ({
    id,
    isRecording: bot.isRecording,
    meetingInfo: bot.meetingInfo
  }));

  res.json({
    count: bots.length,
    bots
  });
});

// Parar todos os bots (emergência)
app.post('/api/stop-all', async (req, res) => {
  console.log('\n🛑 Parando todos os bots...');

  const results = [];

  for (const [id, bot] of activeBots.entries()) {
    try {
      await bot.close();
      results.push({ id, status: 'stopped' });
    } catch (error) {
      results.push({ id, status: 'error', error: error.message });
    }
  }

  activeBots.clear();

  res.json({
    success: true,
    message: 'Todos os bots foram parados',
    results
  });
});

// Tratamento de erros global
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️  SIGTERM recebido, fechando bots...');
  for (const bot of activeBots.values()) {
    await bot.close().catch(() => {});
  }
  process.exit(0);
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`\n🤖 Benemax Meet Bot API rodando na porta ${PORT}`);
  console.log(`📧 Conta configurada: ${GOOGLE_EMAIL}`);
  console.log(`🔗 Webhook n8n: ${process.env.N8N_WEBHOOK_URL}`);
  console.log(`\n✅ Pronto para receber comandos!\n`);
});