// 📄 index.js

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const enviarRelatoriosImagem = require('./enviarRelatoriosImagem');
const enviarRelatoriosPdf = require('./enviarRelatoriosPdf');
const enviarRemuneracao = require('./enviarRemuneracao');

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

  if (numero.endsWith('@g.us')) return; // Ignora grupos

  const representantes = JSON.parse(fs.readFileSync('./representantes.json', 'utf8'));
  const autorizado = representantes.some(rep => rep.telefone === numero.replace('@c.us', ''));

  if (!autorizado) {
    console.log(`Número não autorizado: ${numero}`);
    return;
  }

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
      `${saudacaoBase}! ${aleatoria}

Escolha uma opção:

1 - Sou RN e estou no Palm querendo relatórios em PDF
2 - Sou RN e estou no Palm querendo relatórios em imagens
3 - Preciso de ajuda do APR
4 - Desejo a planilha de remuneração, a senha será sua matrícula. Caso não lembre tem no crachá e na ultima planilha de remuneração que recebeu!`
    );

    atendidos.push(numero);
    fs.writeFileSync(atendidosPath, JSON.stringify(atendidos, null, 2));
    return;
  }

  const opcao = message.body.trim();

  // Etapas em andamento
  const etapasPath = path.join(__dirname, 'etapas.json');
  const etapas = fs.existsSync(etapasPath)
    ? JSON.parse(fs.readFileSync(etapasPath, 'utf8'))
    : {};
  
  if (etapas[numero]) {
    // Se o número já está numa etapa ativa, encaminha direto pro fluxo
    await enviarRemuneracao(client, message);
    return;
  }
  
  if (opcao === '1') {
    await enviarRelatoriosPdf(client, message);
  } else if (opcao === '2') {
    await enviarRelatoriosImagem(client, message);
  } else if (opcao === '3') {
    await client.sendMessage(
      message.from,
      'Certo, por favor descreva a sua demanda sem se esquecer do NB e caso necessário encaminhe prints para maior agilidade no atendimento.'
    );
  } else if (opcao === '4') {
    await enviarRemuneracao(client, message);
  }
  
});

client.initialize();

client.on('disconnected', reason => {
  console.error('⚠️ Cliente desconectado:', reason);
  process.exit(1);
});

client.on('auth_failure', msg => {
  console.error('❌ Falha na autenticação:', msg);
  process.exit(1);
});

client.on('change_state', state => {
  console.log('🔄 Estado do cliente mudou para:', state);
});

client.on('loading_screen', (percent, message) => {
  console.log(`⏳ Carregando... ${percent}% - ${message}`);
});
