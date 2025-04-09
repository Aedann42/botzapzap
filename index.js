const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const enviarRelatorios = require('./enviarRelatorios');

const atendidosPath = path.join(__dirname, 'atendidos.json');
let atendidos = fs.existsSync(atendidosPath)
  ? JSON.parse(fs.readFileSync(atendidosPath, 'utf8'))
  : [];

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));

client.on('ready', () => console.log('✅ Bot conectado!'));

client.on('message', async message => {
  const numero = message.from;

  if (numero.endsWith('@g.us')) return;

  if (!atendidos.includes(numero)) {
    const hora = new Date().getHours();
    const saudacaoBase = hora <= 12 ? 'Bom dia' : 'Boa tarde';

    const saudacoesAlternativas = [
      'Tudo certo por aí?',
      'Como vai você?',
      'Tudo bem por aí?',
      'Espero que esteja tudo em ordem.',
      'Como posso ajudar?',
      'Fico feliz em receber sua mensagem.',
      'É um prazer falar com você.',
      'Estou à disposição para ajudar.',
      'O que mandas?',
      'Que bom receber seu contato.'
    ];

    const aleatoria = saudacoesAlternativas[Math.floor(Math.random() * saudacoesAlternativas.length)];

    await client.sendMessage(
      message.from,
      `${saudacaoBase}! ${aleatoria}\n\nEscolha uma opção:\n1 - Sou RN e estou no Palm querendo relatórios (em caso de erro, só aguardar)\n2 - Preciso de ajuda do APR com outra coisa`
    );

    atendidos.push(numero);
    fs.writeFileSync(atendidosPath, JSON.stringify(atendidos, null, 2));
    return;
  }

  if (message.body.trim() === '1') {
    await enviarRelatorios(client, message);
  } else if (message.body.trim() === '2') {
    try {
      await client.sendMessage(
        message.from,
        'Certo, por favor aguarde um momento. Alguém da equipe APR irá te atender.'
      );
    } catch (err) {
      console.error('Erro ao enviar mensagem de ajuda APR:', err);
    }
  }
});

client.initialize();
