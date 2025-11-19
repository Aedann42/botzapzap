// index.js (VERSÃO FINAL - Padronizada e Corrigida para LIDs, Logs e Atendidos)

// --- Importações Originais ---
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const verificarArquivoAtualizado = require('./src/services/checkDateReports.js');
const { lerJson, registrarUso, REPRESENTANTES_PATH, ETAPAS_PATH, ATENDIDOS_PATH, STAFFS_PATH } = require('./src/utils/dataHandler.js');

// IMPORTANTE: Estes caminhos devem ser acessíveis (leitura) pelo servidor onde o bot está rodando.
const CAMINHO_CHECK_PDF = '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2025\\11 - NOVEMBRO\\_GERADOR PDF\\ACOMPS\\410\\410_MKTPTT.pdf';
const CAMINHO_CHECK_IMAGEM = '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2025\\11 - NOVEMBRO\\_GERADOR PDF\\IMAGENS\\GV4\\MATINAL_GV4_page_3.jpg'

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
const enviarGiroEquipamentosPdv = require('./src/handlers/enviarGiroEquipamentosPdv');
const lembretePonto = require('./src/handlers/lembretePonto'); 

let atendidos = lerJson(ATENDIDOS_PATH, []);
const staffs = lerJson(STAFFS_PATH, []);

// Objeto que armazena usuários em espera: { 'lid_do_usuario@lid': 'pdf' | 'imagem' }
const usuariosAguardandoRelatorio = {};

// Inicialização do cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: '.session'
    }),
    webCacheType: 'remote', 
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));

client.on('ready', () => {
    console.log('✅ Bot conectado!');
    
    // ============================================================================================
    // === AGENDAMENTO NODE-CRON PARA LEMBRETES DE PONTO ===
    // ============================================================================================
    const TIMEZONE = "America/Sao_Paulo"; // Defina o fuso horário correto
    
    console.log('[AGENDADOR]: Configurando lembretes de ponto...');

    // 1. 7:55 - Início da jornada
    cron.schedule('55 7 * * 1-5', () => { // De Segunda a Sexta
        lembretePonto(client, '7:55');
    }, {
        timezone: TIMEZONE
    });

    // 2. 12:00 - Saída para almoço
    cron.schedule('0 12 * * 1-5', () => { 
        lembretePonto(client, '12:00');
    }, {
        timezone: TIMEZONE
    });

    // 4. 17:45 - Encerramento da jornada
    cron.schedule('45 17 * * 1-5', () => {
        lembretePonto(client, '17:45');
    }, {
        timezone: TIMEZONE
    });
    
    console.log('[AGENDADOR]: Agendamentos de ponto configurados com sucesso.');
    // ============================================================================================
    
    
    // ============================================================================================
    // === VERIFICADOR DE ARQUIVOS (setInterval) ===
    // ============================================================================================
    const INTERVALO_VERIFICACAO = 3 * 60 * 1000; // 3 minutos

    setInterval(async () => {
        if (Object.keys(usuariosAguardandoRelatorio).length === 0) {
            return;
        }

        console.log(`[VERIFICADOR]: Checando relatórios para ${Object.keys(usuariosAguardandoRelatorio).length} usuários em espera...`);

        try {
            // 1. Checa o status de AMBOS os tipos de relatório
            const pdfPronto = await verificarArquivoAtualizado(CAMINHO_CHECK_PDF);
            const imagemPronta = await verificarArquivoAtualizado(CAMINHO_CHECK_IMAGEM);

            if (!pdfPronto && !imagemPronta) {
                console.log('[VERIFICADOR]: Nenhum relatório disponível ainda.');
                return;
            }

            const notificados = []; // Lista para armazenar quem foi notificado

            // 2. Itera sobre o objeto de usuários em espera
            for (const userNumero in usuariosAguardandoRelatorio) {
                const tipoEsperado = usuariosAguardandoRelatorio[userNumero];

                // 3. Verifica se o relatório esperado pelo usuário está pronto e ENVIA
                if (tipoEsperado === 'pdf' && pdfPronto) {
                    console.log(`[VERIFICADOR]: PDF pronto para ${userNumero}. Notificando e ENVIANDO...`);
                    
                    const mediaPdf = MessageMedia.fromFilePath(CAMINHO_CHECK_PDF); 
                    await client.sendMessage(userNumero, mediaPdf, { 
                        caption: "🎉 Boa notícia! Seu relatório em PDF solicitado já está disponível." 
                    });
                    
                    notificados.push(userNumero); // Adiciona à lista para remoção
                    
                } else if (tipoEsperado === 'imagem' && imagemPronta) {
                    console.log(`[VERIFICADOR]: Imagem pronta para ${userNumero}. Notificando e ENVIANDO...`);
                    
                    const mediaImagem = MessageMedia.fromFilePath(CAMINHO_CHECK_IMAGEM);
                    await client.sendMessage(userNumero, mediaImagem, { 
                        caption: "🎉 Boa notícia! Seu relatório em Imagem solicitado já está disponível." 
                    });
                    
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
            console.error('[VERIFICADOR]: Erro ao checar arquivos ou enviar:', error);
        }

    }, INTERVALO_VERIFICACAO);
    // ============================================================================================
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
        await client.sendMessage(message.to, '🤖 Iniciando campanha de ativação para novos representantes... Avisarei quando terminar.');
        const resultado = await enviarMenuAtivacao(client);
        await client.sendMessage(message.to, `✅ ${resultado}`);
        return;
    }

    const commandPrefix = '/representante ';
    if (message.body.startsWith(commandPrefix)) {
        console.log(`[OPERADOR]: Comando detectado no chat ${message.to}`);

        const commandForUser = message.body.substring(commandPrefix.length);
        const targetUser = message.to; // message.to será o ID correto (seja @c.us ou @lid)
        
        console.log(`[OPERADOR]: Executando comando '${commandForUser}' para o usuário ${targetUser}`);

        const mockMessage = {
            from: targetUser,
            body: commandForUser,
            _operator_triggered: true, 
            
            // Simula a função getContact() para que a lógica de autorização funcione
            getContact: async () => {
                try {
                    // Tenta obter o contato pelo ID
                    return await client.getContactById(targetUser);
                } catch (e) {
                    console.error("Erro ao simular getContact para comando de operador:", e);
                    // Retorna um objeto mínimo para evitar que quebre
                    // (Pode falhar se o 'targetUser' for um LID e o contato não for conhecido)
                    return { number: targetUser.split('@')[0] }; 
                }
            }
        };

        await processUserMessage(mockMessage);
    }
});


// ============================================================================================
// === FUNÇÃO CENTRAL PARA PROCESSAR MENSAGENS DE USUÁRIOS (ATUALIZADA) ===
// ============================================================================================
async function processUserMessage(message) {
    // 'numero' agora é o ID da conversa (pode ser o LID: "691..._@lid")
    // Usaremos este ID como a chave única para 'etapas' e para enviar respostas.
    const numero = message.from;

    // --- 🚀 INÍCIO DA CORREÇÃO (LID) ---
    // Para AUTORIZAÇÃO, precisamos do número de telefone real.
    // Usamos message.getContact() para "traduzir" o LID para o número.
    let contact;
    try {
        contact = await message.getContact();
    } catch (e) {
        console.error(`Falha crítica ao obter contato para o ID: ${numero}. Mensagem não será processada.`, e);
        return; // Sai da função se não conseguir obter o contato
    }

    // *** ESTA É A VARIÁVEL-CHAVE PARA A CORREÇÃO DO LOG ***
    const numeroTelefoneLimpo = contact.number; // Ex: "553299982517"

    // Se não conseguirmos o número (privacidade, bug, etc.), não podemos autorizar.
    if (!numeroTelefoneLimpo) {
        console.log(`Falha ao obter número de telefone do ID: ${numero}. (Pode ser config. de privacidade)`);
        return; 
    }
    // --- FIM DA CORREÇÃO (LID) ---


    const representantes = lerJson(REPRESENTANTES_PATH, []);
    
    // CORRIGIDO: Usamos o 'numeroTelefoneLimpo' que pegamos do 'contact'
    const representante = representantes.find(rep => rep.telefone === numeroTelefoneLimpo);

    if (!representante) {
        console.log(`Número não autorizado: ${numeroTelefoneLimpo} (ID: ${numero})`);
        return;
    }

    // ===============================================================================
    // *** ✅ INÍCIO DA CORREÇÃO PARA ATENDIDOS.JSON ***
    // ===============================================================================
    // 1. Pegue o ID permanente (@c.us) do contato.
    const idPermanente = contact.id._serialized; // Ex: "553299775821@c.us"

    // CORRIGIDO: O segundo check (de 'staffs') também precisa usar o numeroTelefoneLimpo
    // 2. Verifique se o ID PERMANENTE já foi atendido
    if (!atendidos.includes(idPermanente) && !staffs.some(staff => String(staff.telefone) === numeroTelefoneLimpo)) {
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
            message.from, // Usa o 'message.from' (o LID da conversa) para enviar
            `${saudacaoBase}! ${saudacaoAleatoria}\n${MENU_TEXT}`
        );

        // 3. Salve o ID PERMANENTE (@c.us) na lista de atendidos
        atendidos.push(idPermanente); // <-- MUDANÇA PRINCIPAL
        fs.writeFileSync(ATENDIDOS_PATH, JSON.stringify(atendidos, null, 2));
        return;
    }
    // ===============================================================================
    // *** ✅ FIM DA CORREÇÃO PARA ATENDIDOS.JSON ***
    // ===============================================================================


    const opcao = message.body.trim();
    let etapas = lerJson(ETAPAS_PATH, {});

    // *********************************************************************************
    // *** NOTA: O 'etapas[numero]' continua usando 'numero' (o LID). ISSO ESTÁ CORRETO!
    // *** 'etapas' controla a CONVERSA ATUAL, não o usuário.
    // *********************************************************************************
    if (etapas[numero] && etapas[numero].etapa) {
        const etapaAtual = etapas[numero].etapa;

        try {
            if (etapaAtual === 'pdv') {
                await enviarResumoPDV(client, message, representante); 
              // LOG CORRIGIDO (usa numeroTelefoneLimpo)
                await registrarUso(numeroTelefoneLimpo, 'Consulta de Tarefas PDV');
                delete etapas[numero];
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
                return;
            }

            if (etapaAtual === 'coleta_ttc') {
                await enviarColetaTtcPdv(client, message);
              // LOG CORRIGIDO (usa numeroTelefoneLimpo)
                await registrarUso(numeroTelefoneLimpo, 'Consulta de Coleta TTC PDV');
                delete etapas[numero];
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
                return;
            }
            
            if (etapaAtual === 'giro_equipamentos') {
                await enviarGiroEquipamentosPdv(client, message, representante);
              // LOG CORRIGIDO (usa numeroTelefoneLimpo)
                await registrarUso(numeroTelefoneLimpo, 'Consulta de Giro de Equipamentos PDV');
                delete etapas[numero];
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
                return;
            }

            if (etapaAtual === 'remuneracao') {
                await enviarRemuneracao(client, message);
              // LOG CORRIGIDO (usa numeroTelefoneLimpo)
              // (Nota: o log principal está no handler)
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
                await enviarRelatoriosPdf(client, message, representante);
              // LOG CORRIGIDO (usa numeroTelefoneLimpo)
                await registrarUso(numeroTelefoneLimpo, 'Relatórios em PDF');
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
                await enviarRelatoriosImagem(client, message, representante);
              // LOG CORRIGIDO (usa numeroTelefoneLimpo)
                await registrarUso(numeroTelefoneLimpo, 'Relatórios em Imagem');
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
          // LOG CORRIGIDO (usa numeroTelefoneLimpo)
            await registrarUso(numeroTelefoneLimpo, 'Suporte (Demanda Manual)');
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
            break;
        case '4':
            await enviarRemuneracao(client, message);
          // LOG CORRIGIDO (usa numeroTelefoneLimpo)
          await registrarUso(numeroTelefoneLimpo, 'Iniciou Consulta Remuneração');
            break;
        case '5':
            await client.sendMessage(message.from, 'Por favor, envie o código do PDV que deseja consultar as tarefas! ENVIE APENAS OS NUMEROS');
            etapas[numero] = { etapa: 'pdv' };
            await client.sendSeen(numero);
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
          // LOG CORRIGIDO (usa numeroTelefoneLimpo)
          await registrarUso(numeroTelefoneLimpo, 'Iniciou Consulta PDV');
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
            break;
        case '6':
            await client.sendSeen(numero);
            await enviarListaContatos(client, message);
          // LOG CORRIGIDO (usa numeroTelefoneLimpo)
            await registrarUso(numeroTelefoneLimpo, 'Lista de Contatos');
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
            break;
        case '7': {
            await client.sendMessage(message.from, 'Por favor, envie o código do PDV que deseja consultar a *Coleta TTC*! (Apenas números)');
            etapas[numero] = { etapa: 'coleta_ttc' };
            await client.sendSeen(numero);
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
          // LOG CORRIGIDO (usa numeroTelefoneLimpo)
          await registrarUso(numeroTelefoneLimpo, 'Iniciou Coleta TTC');
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
            break;
        }
        case '8': {
            await enviarCts(client, message, representante); 
          // LOG CORRIGIDO (usa numeroTelefoneLimpo)
            await registrarUso(numeroTelefoneLimpo, 'Consulta de Bonificação CT por Setor');
            break;
        }
        case '9': {
            await client.sendMessage(message.from, 'Por favor, envie o código do PDV que deseja consultar o *Giro de Equipamentos*! (Apenas números)');
            etapas[numero] = { etapa: 'giro_equipamentos' }; // Apenas define a etapa
            await client.sendSeen(numero);
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
          // LOG CORRIGIDO (usa numeroTelefoneLimpo)
          await registrarUso(numeroTelefoneLimpo, 'Iniciou Giro Equipamentos');
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
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
            await registrarUso(numeroTelefoneLimpo, 'Exibição do Menu');
            break;
    }
}

// ============================================================================================
// === LISTENER PRINCIPAL PARA MENSAGENS RECEBIDAS ===
// ============================================================================================
client.on('message', async message => {
    // Ignora mensagens de grupo
    if (message.from.endsWith('@g.us')) {
        const isMention = message.mentionedIds && message.mentionedIds.includes(client.info.wid._serialized);
        if (isMention) {
             // console.log(`[GRUPO]: Fui mencionado no grupo ${message.from}`);
        } else {
             const chat = await message.getChat();
             await chat.sendSeen();
        }
        return; 
    }

    // Processa todas as outras mensagens (chats privados)
    await processUserMessage(message);
});

// Inicializa o cliente
client.initialize();

// Eventos adicionais
client.on('disconnected', reason => {
    console.error('⚠️ Cliente desconectado:', reason);
    process.exit(1); // Força a reinicialização (se estiver usando PM2, ele vai reiniciar)
});

client.on('auth_failure', msg => {
    console.error('❌ Falha na autenticação:', msg);
    process.exit(1); // Força a reinicialização
});

client.on('change_state', state => {
    console.log('🔄 Estado do cliente mudou para:', state);
});

client.on('loading_screen', (percent, message) => {
    console.log(`⏳ Carregando... ${percent}% - ${message}`);
});