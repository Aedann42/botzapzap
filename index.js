// --- Importações Originais ---
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const verificarArquivoAtualizado = require('./src/services/checkDateReports.js');
const { lerJson, registrarUso, REPRESENTANTES_PATH, ETAPAS_PATH, ATENDIDOS_PATH, STAFFS_PATH } = require('./src/utils/dataHandler.js');
const CAMINHO_CHECK_PDF = '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2025\\10 - OUTUBRO\\_GERADOR PDF\\ACOMPS\\410\\410_MKTPTT.pdf';
const CAMINHO_CHECK_IMAGEM = '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2025\\10 - OUTUBRO\\_GERADOR PDF\\IMAGENS\\GV4\\MATINAL_GV4_page_3.jpg'

// Importação do texto do menu
const MENU_TEXT = require('./src/config/menuOptions');

// Importações dos módulos de funcionalidade
const enviarRelatoriosImagem = require('./src/handlers/enviarRelatoriosImagem');
const enviarRelatoriosPdf = require('./src/handlers/enviarRelatoriosPdf');
const enviarRemuneracao = require('./src/handlers/enviarRemuneracao');
const enviarResumoPDV = require('./src/handlers/enviarResumoPDV');
const enviarListaContatos = require('./src/handlers/enviarListaContatos');
const enviarMenuAtivacao = require('./src/handlers/AtivacaoRepresentantes.js');
const enviarColetaTtcPdv = require('./src/handlers/enviarColetaTtcPdv');
const enviarCts = require('./src/handlers/enviarCts');

let atendidos = lerJson(ATENDIDOS_PATH, []);
const staffs = lerJson(STAFFS_PATH, []);
const usuariosAguardandoRelatorio = {};

// Inicialização do cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: '.session'
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));

client.on('ready', () => {
    console.log('✅ Bot conectado!');
    
    const INTERVALO_VERIFICACAO = 3 * 60 * 1000;

setInterval(async () => {
    // Agora verificamos o tamanho do objeto com Object.keys
    if (Object.keys(usuariosAguardandoRelatorio).length === 0) {
        return;
    }

    console.log(`[VERIFICADOR]: Checando relatórios para ${Object.keys(usuariosAguardandoRelatorio).length} usuários em espera...`);

    try {
        // 1. Checa o status de AMBOS os tipos de relatório
        const pdfPronto = await verificarArquivoAtualizado(CAMINHO_CHECK_PDF);
        const imagemPronta = await verificarArquivoAtualizado(CAMINHO_CHECK_IMAGEM);

        // Se nenhum relatório estiver pronto, não faz nada
        if (!pdfPronto && !imagemPronta) {
            console.log('[VERIFICADOR]: Nenhum relatório disponível ainda.');
            return;
        }

        const notificados = []; // Lista para armazenar quem foi notificado

        // 2. Itera sobre o objeto de usuários em espera
        for (const userNumero in usuariosAguardandoRelatorio) {
            const tipoEsperado = usuariosAguardandoRelatorio[userNumero];

            // 3. Verifica se o relatório esperado pelo usuário está pronto
            if (tipoEsperado === 'pdf' && pdfPronto) {
                console.log(`[VERIFICADOR]: PDF pronto para ${userNumero}. Notificando...`);
                await client.sendMessage(userNumero, "🎉 Boa notícia! Seu relatório em PDF já está disponível.");
                notificados.push(userNumero); // Adiciona à lista para remoção
            } else if (tipoEsperado === 'imagem' && imagemPronta) {
                console.log(`[VERIFICADOR]: Imagem pronta para ${userNumero}. Notificando...`);
                await client.sendMessage(userNumero, "🎉 Boa notícia! Seu relatório em Imagem já está disponível.");
                notificados.push(userNumero); // Adiciona à lista para remoção
            }
        }

        // 4. Remove APENAS os usuários que foram notificados da lista de espera
        if (notificados.length > 0) {
            for (const userNumero of notificados) {
                delete usuariosAguardandoRelatorio[userNumero];
            }
            console.log(`[VERIFICADOR]: ${notificados.length} usuários notificados e removidos da lista.`);
        }

    } catch (error) {
        console.error('[VERIFICADOR]: Erro ao checar arquivos:', error);
    }

}, INTERVALO_VERIFICACAO);
});

// ============================================================================================
// === LISTENER PARA COMANDOS DO OPERADOR (VIA WHATSAPP WEB) ===
// ============================================================================================
client.on('message_create', async (message) => {
    if (!message.fromMe) {
        return;
    }

    if (message.body.trim() === '/ativar') {
        console.log('[OPERADOR]: Comando /ativar recebido.');
        
        await client.sendMessage(message.to, '🤖 Iniciando campanha de ativação para novos representantes... Este processo pode levar alguns minutos. Avisarei quando terminar.');

        const resultado = await enviarMenuAtivacao(client);

        await client.sendMessage(message.to, `✅ ${resultado}`);
        
        return;
    }

    const commandPrefix = '/representante ';
    if (message.body.startsWith(commandPrefix)) {
        console.log(`[OPERADOR]: Comando detectado no chat ${message.to}`);

        const commandForUser = message.body.substring(commandPrefix.length);
        const targetUser = message.to;
        
        console.log(`[OPERADOR]: Executando comando '${commandForUser}' para o usuário ${targetUser}`);

        const mockMessage = {
            from: targetUser,
            body: commandForUser,
            _operator_triggered: true
        };

        await processUserMessage(mockMessage);
    }
});


// ============================================================================================
// === FUNÇÃO CENTRAL PARA PROCESSAR MENSAGENS DE USUÁRIOS ===
// ============================================================================================
async function processUserMessage(message) {
    const numero = message.from;

    const representantes = lerJson(REPRESENTANTES_PATH, []);
    const numeroLimpo = numero.replace('@c.us', '');
    const representante = representantes.find(rep => rep.telefone === numeroLimpo);

    if (!representante) {
        console.log(`Número não autorizado: ${numero}`);
        return;
    }

    if (!atendidos.includes(numero) && !staffs.some(staff => String(staff.telefone) === numeroLimpo)) {
        const hora = new Date().getHours();
        const saudacaoBase = hora <= 12 ? 'Bom dia' : (hora <= 18 ? 'Boa tarde' : 'Boa noite');
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

            if (etapaAtual === 'coleta_ttc') {
                await enviarColetaTtcPdv(client, message);
                await registrarUso(numero, 'Consulta de Coleta TTC PDV');
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

    const MENSAGEM_RELATORIOS_INDISPONIVEIS = '⚠️  Relatórios ainda não gerados. Vou te avisar assim que estiverem disponíveis! 🤖';

    switch (opcao.toLowerCase()) {
        case '1': { 
            await client.sendSeen(numero);
            const relatoriosProntos = await verificarArquivoAtualizado(CAMINHO_CHECK_PDF);
            if (relatoriosProntos) {
                await enviarRelatoriosPdf(client, message);
                await registrarUso(numero, 'Relatórios em PDF');
                if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
                delete usuariosAguardandoRelatorio[numero]; 
            } else {
                await client.sendMessage(message.from, MENSAGEM_RELATORIOS_INDISPONIVEIS);
                usuariosAguardandoRelatorio[numero] = 'pdf';
                console.log(`Usuário ${numero} adicionado à lista de espera para relatórios.`);
            }
            break;
        }
        case '2': {
            await client.sendSeen(numero);
            const relatoriosProntos = await verificarArquivoAtualizado(CAMINHO_CHECK_IMAGEM);
            if (relatoriosProntos) {
                await enviarRelatoriosImagem(client, message);
                await registrarUso(numero, 'Relatórios em Imagem');
                if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
                delete usuariosAguardandoRelatorio[numero];
            } else {
                await client.sendMessage(message.from, MENSAGEM_RELATORIOS_INDISPONIVEIS);
                usuariosAguardandoRelatorio[numero]= 'imagem';
                console.log(`Usuário ${numero} adicionado à lista de espera para relatórios.`);
            }
            break;
        }
        case '3':
            await client.sendMessage(message.from, 'Certo, por favor descreva a sua demanda sem se esquecer do NB e caso necessário encaminhe prints para maior agilidade no atendimento.');
            await registrarUso(numero, 'Suporte (Demanda Manual)');
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
            break;
        case '4':
            await enviarRemuneracao(client, message);
            break;
        case '5':
            await client.sendMessage(message.from, 'Por favor, envie o código do PDV que deseja consultar as tarefas! ENVIE APENAS OS NUMEROS');
            etapas[numero] = { etapa: 'pdv' };
            await client.sendSeen(numero);
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
            break;
        case '6':
            await client.sendSeen(numero);
            await enviarListaContatos(client, message);
            await registrarUso(numero, 'Lista de Contatos');
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
            break;
        case '7': {
            await client.sendMessage(message.from, 'Por favor, envie o código do PDV que deseja consultar a *Coleta TTC*! (Apenas números)');
            etapas[numero] = { etapa: 'coleta_ttc' };
            await client.sendSeen(numero);
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
            break;
        }
        case '8': {
            await enviarCts(client, message, representante);
            await registrarUso(numero, 'Consulta de Bonificação CT por Setor');
            break;
        }
        case 'menu':
            const hora = new Date().getHours();
            const saudacaoBase = hora < 12 ? 'Bom dia' : (hora < 18 ? 'Boa tarde' : 'Boa noite');
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
}


// ============================================================================================
// === LISTENER PRINCIPAL PARA MENSAGENS RECEBIDAS ===
// ============================================================================================
client.on('message', async message => {
    if (message.from.endsWith('@g.us')) {
        const chat = await message.getChat();
        const isMention = message.mentionedIds && message.mentionedIds.includes(client.info.wid._serialized);
        if (!isMention) {
            await chat.sendSeen();
        }
        return; 
    }

    await processUserMessage(message);
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