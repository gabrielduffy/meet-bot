const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs').promises;
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');

puppeteer.use(StealthPlugin());

class MeetBot {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isRecording = false;
    this.recordingPath = null;
    this.meetingInfo = {};
  }

  async initialize() {
    console.log('Inicializando navegador...');
    
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required'
      ]
    });

    this.page = await this.browser.newPage();
    
    // Configurar viewport
    await this.page.setViewport({ width: 1280, height: 720 });
    
    // Dar permissões de microfone e câmera
    const context = this.browser.defaultBrowserContext();
    await context.overridePermissions('https://meet.google.com', [
      'microphone',
      'camera',
      'notifications'
    ]);

    console.log('Navegador inicializado');
  }

  async login(email, password) {
    console.log('Fazendo login no Google...');
    
    try {
      await this.page.goto('https://accounts.google.com/signin', {
        waitUntil: 'networkidle2'
      });

      // Inserir email
      await this.page.waitForSelector('input[type="email"]', { timeout: 10000 });
      await this.page.type('input[type="email"]', email, { delay: 100 });
      await this.page.keyboard.press('Enter');

      // Aguardar página de senha
      await this.page.waitForSelector('input[type="password"]', { 
        visible: true, 
        timeout: 15000 
      });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Inserir senha
      await this.page.type('input[type="password"]', password, { delay: 100 });
      await this.page.keyboard.press('Enter');

      // Aguardar navegação
      await this.page.waitForNavigation({ 
        waitUntil: 'networkidle2',
        timeout: 30000 
      }).catch(() => console.log('Timeout na navegação, continuando...'));

      console.log('Login realizado com sucesso');
      return true;

    } catch (error) {
      console.error('Erro ao fazer login:', error.message);
      throw new Error('Falha no login: ' + error.message);
    }
  }

  async joinMeeting(meetingUrl, meetingTitle = 'Reunião') {
    console.log('Entrando na reunião:', meetingUrl);
    
    this.meetingInfo = {
      title: meetingTitle,
      url: meetingUrl,
      startTime: new Date()
    };

    try {
      await this.page.goto(meetingUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Aguardar página carregar
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Desligar câmera e microfone antes de entrar
      await this.disableVideoAndAudio();

      // Clicar em "Participar agora" ou "Join now"
      await this.clickJoinButton();

      // Aguardar entrar na reunião
      await this.page.waitForSelector('[data-meeting-title]', {
        timeout: 30000
      }).catch(() => console.log('Aguardando interface da reunião...'));

      console.log('Entrou na reunião com sucesso');

      // Iniciar gravação
      await this.startRecording();

      return true;

    } catch (error) {
      console.error('Erro ao entrar na reunião:', error.message);
      throw new Error('Falha ao entrar: ' + error.message);
    }
  }

  async disableVideoAndAudio() {
    console.log('Desligando câmera e microfone...');

    try {
      // Procurar botões de câmera e microfone
      const buttons = await this.page.$$('button');
      
      for (const button of buttons) {
        const ariaLabel = await button.evaluate(el => el.getAttribute('aria-label'));
        
        // Desligar câmera
        if (ariaLabel && ariaLabel.includes('camera') || ariaLabel && ariaLabel.includes('câmera')) {
          await button.click();
          console.log('Câmera desligada');
        }
        
        // Desligar microfone
        if (ariaLabel && ariaLabel.includes('microphone') || ariaLabel && ariaLabel.includes('microfone')) {
          await button.click();
          console.log('Microfone desligado');
        }
      }
    } catch (error) {
      console.log('Erro ao desligar câmera/mic, continuando...', error.message);
    }
  }

  async clickJoinButton() {
    console.log('Clicando em "Participar"...');

    try {
      // Tentar diferentes seletores de botão "Join"
      const selectors = [
        'button[jsname="Qx7Oae"]', // Botão principal do Meet
        'button:has-text("Participar agora")',
        'button:has-text("Join now")',
        'button:has-text("Entrar")'
      ];

      for (const selector of selectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 3000 });
          await this.page.click(selector);
          console.log('Botão clicado:', selector);
          return;
        } catch (e) {
          continue;
        }
      }

      // Se não encontrou, tentar por texto
      const buttons = await this.page.$$('button');
      for (const button of buttons) {
        const text = await button.evaluate(el => el.textContent);
        if (text.includes('Participar') || text.includes('Join') || text.includes('Entrar')) {
          await button.click();
          console.log('Botão encontrado por texto');
          return;
        }
      }

      throw new Error('Botão de participar não encontrado');

    } catch (error) {
      console.error('Erro ao clicar no botão:', error.message);
      // Tentar pressionar Enter como fallback
      await this.page.keyboard.press('Enter');
    }
  }

  async startRecording() {
    console.log('Iniciando gravação de áudio...');

    try {
      this.isRecording = true;
      const timestamp = Date.now();
      this.recordingPath = path.join('/app/recordings', `meeting_${timestamp}.webm`);

      // Iniciar gravação de áudio da página
      await this.page.evaluateHandle(() => {
        return new Promise((resolve) => {
          navigator.mediaDevices.getUserMedia({ audio: true, video: false })
            .then(stream => {
              window.mediaRecorder = new MediaRecorder(stream);
              window.recordedChunks = [];

              window.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                  window.recordedChunks.push(event.data);
                }
              };

              window.mediaRecorder.start(5000); // Chunks a cada 5s
              resolve();
            });
        });
      });

      console.log('Gravação iniciada');

    } catch (error) {
      console.error('Erro ao iniciar gravação:', error);
      throw error;
    }
  }

  async stopRecording() {
    console.log('Parando gravação...');

    try {
      // Parar MediaRecorder no navegador
      const audioData = await this.page.evaluate(() => {
        return new Promise((resolve) => {
          if (window.mediaRecorder && window.mediaRecorder.state !== 'inactive') {
            window.mediaRecorder.onstop = () => {
              const blob = new Blob(window.recordedChunks, { type: 'audio/webm' });
              const reader = new FileReader();
              reader.onloadend = () => {
                resolve(reader.result.split(',')[1]); // Base64
              };
              reader.readAsDataURL(blob);
            };
            window.mediaRecorder.stop();
          } else {
            resolve(null);
          }
        });
      });

      if (audioData) {
        // Salvar arquivo
        const buffer = Buffer.from(audioData, 'base64');
        await fs.writeFile(this.recordingPath, buffer);
        console.log('Gravação salva:', this.recordingPath);
      }

      this.isRecording = false;

      // Calcular duração
      const duration = Math.round((new Date() - this.meetingInfo.startTime) / 60000);
      
      return {
        path: this.recordingPath,
        duration: duration,
        meetingInfo: this.meetingInfo
      };

    } catch (error) {
      console.error('Erro ao parar gravação:', error);
      throw error;
    }
  }

  async leaveMeeting() {
    console.log('Saindo da reunião...');

    try {
      // Tentar clicar no botão de sair
      const buttons = await this.page.$$('button');
      for (const button of buttons) {
        const ariaLabel = await button.evaluate(el => el.getAttribute('aria-label'));
        if (ariaLabel && (ariaLabel.includes('Sair') || ariaLabel.includes('Leave'))) {
          await button.click();
          break;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('Saiu da reunião');

    } catch (error) {
      console.log('Erro ao sair, fechando página...', error.message);
    }
  }

  async sendToN8n(recordingData) {
    console.log('Enviando para n8n...');

    const N8N_WEBHOOK = process.env.N8N_WEBHOOK_URL;

    try {
      const formData = new FormData();
      const fileStream = await fs.readFile(recordingData.path);
      
      formData.append('data', fileStream, {
        filename: path.basename(recordingData.path),
        contentType: 'audio/webm'
      });
      formData.append('meetingTitle', recordingData.meetingInfo.title);
      formData.append('meetingDate', recordingData.meetingInfo.startTime.toISOString());
      formData.append('duration', recordingData.duration.toString());
      formData.append('participantsCount', '2');
      formData.append('googleMeetId', recordingData.meetingInfo.url.split('/').pop());

      const response = await fetch(N8N_WEBHOOK, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`N8n retornou erro: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Enviado para n8n com sucesso:', result);

      // Deletar arquivo local após enviar
      await fs.unlink(recordingData.path);
      console.log('Arquivo local deletado');

      return result;

    } catch (error) {
      console.error('Erro ao enviar para n8n:', error);
      throw error;
    }
  }

  async close() {
    console.log('Fechando navegador...');
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

module.exports = MeetBot;