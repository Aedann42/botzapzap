const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const verificarAtualizacaoDiaria = require('./src/services/checkDateReports.js');

// Importação do texto do menu
const MENU_TEXT = require('./src/config/menuOptions');

// Importações dos módulos de funcionalidade
const enviarRelatoriosImagem = require('./src/handlers/enviarRelatoriosImagem');
const enviarRelatoriosPdf = require('./src/handlers/enviarRelatoriosPdf');
const enviarRemuneracao = require('./src/handlers/enviarRemuneracao');
const enviarResumoPDV = require('./src/handlers/enviarResumoPDV');
const enviarListaContatos = require('./src/handlers/enviarListaContatos');

// Caminhos dos arquivos
const ATENDIDOS_PATH = path.join(__dirname, 'data', 'atendidos.json');
const REPRESENTANTES_PATH = path.join(__dirname, 'data', 'representantes.json'); 
const ETAPAS_PATH = path.join(__dirname, 'data', 'etapas.json'); 
const LOG_USO_PATH = path.join(__dirname, 'logs', 'log_uso.json');

// Função auxiliar para leitura de JSON
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

// Função para registrar o uso das funcionalidades
async function registrarUso(numero, nomeFuncao) {
    try {
        const representantes = lerJson(REPRESENTANTES_PATH, []);
        const logUso = lerJson(LOG_USO_PATH, []);

        const numeroLimpo = numero.replace('@c.us', '');
        const representante = representantes.find(rep => rep.telefone === numeroLimpo);
        
        const setor = representante.setor;

        const timestamp = new Date();
        const novoRegistro = {
            timestamp: timestamp.toISOString(),
            data: timestamp.toISOString().split('T')[0], // Formato YYYY-MM-DD
            setor: setor,
            funcao: nomeFuncao
        };

        logUso.push(novoRegistro);
        fs.writeFileSync(LOG_USO_PATH, JSON.stringify(logUso, null, 2));
        console.log(`[LOG] Ação registrada: Setor ${setor} | ${nomeFuncao}`);
    } catch (error) {
        console.error('Erro ao registrar o uso:', error);
    }
}

let atendidos = lerJson(ATENDIDOS_PATH, []);

// Inicialização do cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: '.session' // <-- NOVO: Especifica a pasta para os dados da sessão
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅ Bot conectado!'));

// Marcar mensagens de grupos como lidas (sem menção)
client.on('message', async msg => {
    if (!msg.from.endsWith('@g.us')) return;
    const chat = await msg.getChat();
    const isMention = msg.mentionedIds && msg.mentionedIds.includes(client.info.wid._serialized);
    if (!isMention) {
        await chat.sendSeen();
    }
});

// Mensagens privadas
client.on('message', async message => {
    const numero = message.from;

    if (numero.endsWith('@g.us')) return;

    const representantes = lerJson(REPRESENTANTES_PATH, []);
    const autorizado = representantes.some(rep => rep.telefone === numero.replace('@c.us', ''));

    if (!autorizado) {
        console.log(`Número não autorizado: ${numero}`);
        return;
    }

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
            `${saudacaoBase}! ${saudacaoAleatoria}\n${MENU_TEXT}`
        );

        atendidos.push(numero);
        fs.writeFileSync(ATENDIDOS_PATH, JSON.stringify(atendidos, null, 2));
        return;
    }

    const opcao = message.body.trim();
    let etapas = lerJson(ETAPAS_PATH, {});

    if (etapas[numero] && etapas[numero].etapa) {
        const etapaAtual = etapas[numero].etapa;

        try {
            if (etapaAtual === 'pdv') {
                await enviarResumoPDV(client, message);
                await registrarUso(numero, 'Consulta de Tarefas PDV');
                delete etapas[numero];
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
                return;
            }

            if (etapaAtual === 'remuneracao') {
                await enviarRemuneracao(client, message);
                await registrarUso(numero, 'Consulta de Remuneração');
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

    const MENSAGEM_RELATORIOS_INDISPONIVEIS = '⚠️ Relatórios ainda não gerados por problemas técnicos. Por favor, aguarde que será avisado no grupo da sua equipe quando tiver disponível. 🤖';

   switch (opcao.toLowerCase()) {
        case '1': { // Adicionamos chaves para criar um bloco de código
            // NOVO: Chamamos a função de verificação primeiro
            const relatoriosProntos = await verificarAtualizacaoDiaria();

            // NOVO: Verificamos a resposta da função
            if (relatoriosProntos) {
                // Se a resposta for TRUE, fazemos o que já era feito antes
                await enviarRelatoriosPdf(client, message);
                await registrarUso(numero, 'Relatórios em PDF');
                if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
                await client.sendSeen(numero);
            } else {
                // Se a resposta for FALSE, enviamos a mensagem de aviso
                await client.sendMessage(message.from, MENSAGEM_RELATORIOS_INDISPONIVEIS);
                await client.sendSeen(numero);
            }
            break;
        }

        case '2': { // Adicionamos chaves aqui também
            // NOVO: Chamamos a função de verificação novamente
            const relatoriosProntos = await verificarAtualizacaoDiaria();

            // NOVO: Verificamos a resposta
            if (relatoriosProntos) {
                // Se TRUE, executa o código original
                await enviarRelatoriosImagem(client, message);
                await registrarUso(numero, 'Relatórios em Imagem');
                if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
                await client.sendSeen(numero);
            } else {
                // Se FALSE, envia o aviso
                await client.sendMessage(message.from, MENSAGEM_RELATORIOS_INDISPONIVEIS);
                await client.sendSeen(numero);
            }
            break;
        }

        case '3':
            await client.sendMessage(
                message.from,
                'Certo, por favor descreva a sua demanda sem se esquecer do NB e caso necessário encaminhe prints para maior agilidade no atendimento.'
            );
            await registrarUso(numero, 'Suporte (Demanda Manual)');
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
            // Não marca como lida
            break;
        case '4':
            etapas[numero] = { etapa: 'remuneracao' };
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await client.sendMessage(message.from, 'Por favor, informe sua *matrícula* para continuar, lembrando que só pode ter os números na próxima mensagem!');
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
            await client.sendSeen(numero);
            break;
        case '5':
            await client.sendMessage(message.from, 'Por favor, envie o código do PDV que deseja consultar as tarefas!');
            etapas[numero] = { etapa: 'pdv' };
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
            await client.sendSeen(numero);
            break;
        case '6':
            await enviarListaContatos(client, message);
            await registrarUso(numero, 'Lista de Contatos');
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
            await client.sendSeen(numero);
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
                `${saudacaoBase}! ${saudacaoAleatoria}\n${MENU_TEXT}`
            );
            await client.sendSeen(numero);
            if (etapas[numero]) {
                delete etapas[numero].tentativasInvalidas;
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            }
            await registrarUso(numero, 'Exibição do Menu');
            break;
    }
});

// Inicializa o cliente
client.initialize();

// Eventos adicionais
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
