const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// Importação do texto do menu
const MENU_TEXT = require('./menuOptions');

// Importações dos módulos de funcionalidade
const enviarRelatoriosImagem = require('./enviarRelatoriosImagem');
const enviarRelatoriosPdf = require('./enviarRelatoriosPdf');
const enviarRemuneracao = require('./enviarRemuneracao');
const enviarResumoPDV = require('./enviarResumoPDV');
const enviarListaContatos = require('./enviarListaContatos');

// --- Caminhos centralizados para facilitar a manutenção ---
const ATENDIDOS_PATH = path.join(__dirname, 'atendidos.json');
const REPRESENTANTES_PATH = path.join(__dirname, 'representantes.json');
const ETAPAS_PATH = path.join(__dirname, 'etapas.json');

// --- Função auxiliar para ler JSON de forma segura ---
function lerJson(filePath, defaultValue = {}) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (error) {
        console.error(`Erro ao ler o arquivo JSON ${filePath}:`, error);
        fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
    }
    return defaultValue;
}

let atendidos = lerJson(ATENDIDOS_PATH, []);

// --- Configuração do Cliente WhatsApp ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// --- Eventos do Cliente WhatsApp ---
client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅ Bot conectado!'));

client.on('message', async message => {
    const numero = message.from;

    // Ignora mensagens de grupos
    if (numero.endsWith('@g.us')) return;

    // --- Verificação de Autorização do Usuário ---
    const representantes = lerJson(REPRESENTANTES_PATH, []);
    const autorizado = representantes.some(rep => rep.telefone === numero.replace('@c.us', ''));

    if (!autorizado) {
        console.log(`Número não autorizado: ${numero}`);
        return;
    }

    // --- Lógica para enviar a mensagem de boas-vindas e opções apenas uma vez por usuário ---
    if (!atendidos.includes(numero)) {
        const hora = new Date().getHours();
        const saudacaoBase = hora <= 12 ? 'Bom dia' : 'Boa tarde';

        const saudacoesAlternativas = [
            'Tudo certo por aí?', 'Como vai você?', 'Tudo bem por aí?',
            'Espero que esteja tudo em ordem.', 'Como posso ajudar?',
            'Fico feliz em receber sua mensagem.', 'É um prazer falar com você.',
            'Estou à disposição para ajudar.', 'O que mandas?', 'Que bom receber seu contato.'
        ];
        const saudacaoAleatoria = saudacoesAlternativas[Math.floor(Math.random() * saudacoesAlternativas.length)];

        await client.sendMessage(
            message.from,
            `${saudacaoBase}! ${saudacaoAleatoria}\n${MENU_TEXT}` // Usa MENU_TEXT importado
        );

        atendidos.push(numero);
        fs.writeFileSync(ATENDIDOS_PATH, JSON.stringify(atendidos, null, 2));
        return;
    }

    const opcao = message.body.trim();

    let etapas = lerJson(ETAPAS_PATH, {});

    // --- Gerenciamento de Etapas Ativas (Fluxos de Conversação) ---
    if (etapas[numero] && etapas[numero].etapa) {
        const etapaAtual = etapas[numero].etapa;

        try {
            if (etapaAtual === 'pdv') {
                await enviarResumoPDV(client, message);
                delete etapas[numero];
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
                return;
            }

            if (etapaAtual === 'remuneracao') {
                await enviarRemuneracao(client, message);
                return;
            }

            if (etapaAtual === 'aguardandoEscolha') {
                await enviarListaContatos(client, message);
                return;
            }
        } catch (error) {
            console.error(`Erro ao processar etapa "${etapaAtual}" para ${numero}:`, error);
            await client.sendMessage(numero, '❌ Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.');
            delete etapas[numero];
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            return;
        }
    }

    // --- Gerenciamento das Opções do Menu Principal (quando não há etapa ativa) ---
    switch (opcao.toLowerCase()) {
        case '1':
            await enviarRelatoriosPdf(client, message);
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
            break;
        case '2':
            await enviarRelatoriosImagem(client, message);
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
            break;
        case '3':
            await client.sendMessage(
                message.from,
                'Certo, por favor descreva a sua demanda sem se esquecer do NB e caso necessário encaminhe prints para maior agilidade no atendimento.'
            );
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
            break;
        case '4':
            etapas[numero] = { etapa: 'remuneracao' };
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await client.sendMessage(message.from, 'Por favor, informe sua *matrícula* para continuar, lembrando que só pode ter os números na próxima mensagem!');
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
            break;
        case '5':
            await client.sendMessage(message.from, 'Por favor, envie o código do PDV que deseja consultar as tarefas!');
            etapas[numero] = { etapa: 'pdv' };
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
            break;
        case '6':
            await enviarListaContatos(client, message);
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
            break;
        case 'menu':
            const hora = new Date().getHours();
            const saudacaoBase = hora <= 12 ? 'Bom dia' : 'Boa tarde';
            const saudacoesAlternativas = [
                'Tudo certo por aí?', 'Como vai você?', 'Tudo bem por aí?',
                'Espero que esteja tudo em ordem.', 'Como posso ajudar?',
                'Fico feliz em receber sua mensagem.', 'É um prazer falar com você.',
                'Estou à disposição para ajudar.', 'O que mandas?', 'Que bom receber seu contato.'
            ];
            const saudacaoAleatoria = saudacoesAlternativas[Math.floor(Math.random() * saudacoesAlternativas.length)];

            await client.sendMessage(
                message.from,
                `${saudacaoBase}! ${saudacaoAleatoria}\n${MENU_TEXT}` // Usa MENU_TEXT importado
            );
            await client.sendSeen(numero); // <- MARCA COMO LIDA
            if (etapas[numero]) {
                delete etapas[numero].tentativasInvalidas;
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            }
            break;
    }
});

// --- Inicialização do Cliente WhatsApp ---
client.initialize();

// --- Eventos de Estado do Cliente (para monitoramento) ---
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