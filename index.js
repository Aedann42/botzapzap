// --- Importações ---
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
//const cron = require('node-cron');
const transcricaoService = require('./src/services/transcricaoService');
const { lerJson, registrarUso, ETAPAS_PATH, ATENDIDOS_PATH, STAFFS_PATH } = require('./src/utils/dataHandler.js');

const verificarArquivoAtualizado = require('./src/services/checkDateReports');

// 🚨 CAMINHO FORÇADO PARA O JSON (PASTA DATA)
const CAMINHO_JSON_REAL = path.join(__dirname, 'data', 'representantes.json');
const FORA_BASE_PATH = path.join(__dirname, 'data', 'atendidosForaDaBase.json');

// VOZ EXTRA & HANDLER DE PEDIDOS
const pedidoHandler = require('./src/handlers/pedidoHandler');

// Caminhos de CHECAGEM (Usados apenas para saber se o processo do servidor terminou)
const CAMINHO_CHECK_PDF = '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2026\\2 - FEVEREIRO\\_GERADOR PDF\\ACOMPS\\410\\410_MKTPTT.pdf';
const CAMINHO_CHECK_IMAGEM = '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2026\\2 - FEVEREIRO\\_GERADOR PDF\\IMAGENS\\GV4\\MATINAL_GV4_page_3.jpg';

const MENU_TEXT = require('./src/config/menuOptions');
const MENSAGEM_PDV = require('./src/config/mensagemPDV'); // <--- NOVA IMPORTAÇÃO

// Handlers
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

// Variáveis de Estado
let atendidos = lerJson(ATENDIDOS_PATH, []);
const staffs = lerJson(STAFFS_PATH, []);
const usuariosAguardandoRelatorio = {};

// ============================================================================================
// === 1. INICIALIZAÇÃO (SESSÃO FIXA + BLINDAGEM) ===
// ============================================================================================

// 🚨 MUDANÇA: Nome fixo para não pedir QR Code toda hora
const idSessao = 'sessao-principal-v1'; 
console.log(`🚀 [BOOT] Iniciando bot na sessão fixa: ${idSessao}`);

const client = new Client({
    authStrategy: new LocalAuth({ clientId: idSessao }),
    puppeteer: {
        headless: true, // Mude para true quando quiser esconder o navegador
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu' 
        ]
    }
});

client.on('qr', qr => {
    console.log('📸 [QR CODE] Escaneie abaixo (Isso deve acontecer só uma vez):');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('[index.js] - ✅ Bot conectado e operacional!');
    
    if (fs.existsSync(CAMINHO_JSON_REAL)) {
        console.log(`[index.js] - 📂 JSON carregado: ${CAMINHO_JSON_REAL}`);
    } else {
        console.error(`❌ ERRO: JSON não encontrado em: ${CAMINHO_JSON_REAL}`);
    }

    // === AGENDAMENTOS (CRON) ===
    //const TIMEZONE = "America/Sao_Paulo";
    //cron.schedule('55 7 * * 1-5', () => { lembretePonto(client, '7:55'); }, { timezone: TIMEZONE });
   // cron.schedule('0 12 * * 1-5', () => { lembretePonto(client, '12:00'); }, { timezone: TIMEZONE });
    //cron.schedule('45 17 * * 1-5', () => { lembretePonto(client, '17:45'); }, { timezone: TIMEZONE });
    
    //const JANELAS_CRON = [
    //    { hora: '00 13', label: '13h00' }, { hora: '30 13', label: '13h30' },
    //    { hora: '00 14', label: '14h00' }, { hora: '30 14', label: '14h30' },
   //     { hora: '00 15', label: '15h00' }, { hora: '30 15', label: '15h30' },
    //    { hora: '00 16', label: '16h00' }, { hora: '30 16', label: '16h30' }
   // ];

//    JANELAS_CRON.forEach(j => {
//        cron.schedule(`${j.hora} * * 1-5`, async () => {
//            console.log(`[index.js] - 🕒 Janela ${j.label}`);
//            await transcricaoService.processarAudiosPendentes();
//            await pedidoHandler.executarConversaoLote(client, j.label);
//        }, { timezone: "America/Sao_Paulo" });
//    });
    
/// ========================================================================================
// === VERIFICADOR DE ARQUIVOS (LÓGICA CORRIGIDA DO 302) ===
// ========================================================================================
    const INTERVALO_VERIFICACAO = 3 * 60 * 1000; 
    setInterval(async () => {
        if (Object.keys(usuariosAguardandoRelatorio).length === 0) return;
        
        console.log(`[VERIFICADOR] Checando para ${Object.keys(usuariosAguardandoRelatorio).length} usuários...`);

        try {
            // 1. Verifica se os arquivos "mestre" existem (sinal que o servidor terminou)
            const pdfPronto = await verificarArquivoAtualizado(CAMINHO_CHECK_PDF);
            const imagemPronta = await verificarArquivoAtualizado(CAMINHO_CHECK_IMAGEM);

            if (!pdfPronto && !imagemPronta) return;

            // 2. Recarrega a lista para garantir
            let listaReps = [];
            try {
                listaReps = JSON.parse(fs.readFileSync(CAMINHO_JSON_REAL, 'utf-8'));
            } catch (e) { console.error('Erro ao ler JSON no verificador'); return; }

            const notificados = [];

            for (const userNumero in usuariosAguardandoRelatorio) {
                const tipoEsperado = usuariosAguardandoRelatorio[userNumero];
                
                // 🔥 CORREÇÃO: Busca Estrita (LID Prioritário também aqui)
                const rep = listaReps.find(r => {
                    const rTel = String(r.telefone || "").replace(/\D/g, '');
                    const uTel = String(userNumero).replace(/\D/g, '');
                    
                    // Validação por LID
                    if (r.lid) {
                        const lidLimpo = String(r.lid).split('@')[0];
                        const userLimpo = String(userNumero).split('@')[0];
                        if (lidLimpo === userLimpo) return true;
                    }

                    // Validação por Telefone
                    if (rTel.length < 10) return false;
                    return uTel.endsWith(rTel) || rTel.endsWith(uTel);
                });

                if (!rep) {
                    console.log(`⚠️ [VERIFICADOR] Rep não encontrado para o número: ${userNumero}`);
                    continue; 
                }

                // Cria mock msg para usar os handlers existentes
                const mockMsg = { from: userNumero };

                if (tipoEsperado === 'pdf' && pdfPronto) {
                    console.log(`✅ [AUTO-ENVIO] Enviando PDF de: ${rep.nome} (Cod: ${rep.codigo})`);
                    await enviarRelatoriosPdf(client, mockMsg, rep); 
                    await client.sendMessage(userNumero, "🎉 O relatório que você pediu chegou!");
                    notificados.push(userNumero);
                } 
                else if (tipoEsperado === 'imagem' && imagemPronta) {
                    console.log(`✅ [AUTO-ENVIO] Enviando Imagem de: ${rep.nome} (Cod: ${rep.codigo})`);
                    await enviarRelatoriosImagem(client, mockMsg, rep);
                    await client.sendMessage(userNumero, "🎉 O relatório que você pediu chegou!");
                    notificados.push(userNumero);
                }
            }

            if (notificados.length > 0) {
                for (const user of notificados) delete usuariosAguardandoRelatorio[user];
            }
        } catch (error) {
            console.error('[VERIFICADOR]: Erro crítico:', error);
        }
    }, INTERVALO_VERIFICACAO);
});

// ============================================================================================
// === LISTENER DO OPERADOR ===
// ============================================================================================
client.on('message_create', async (message) => {
    if (message.from === 'status@broadcast') return;
    if (!message.fromMe) return;

    const body = message.body.trim(); 

    if (body.toLowerCase() === '/ativar') {
        const res = await enviarMenuAtivacao(client);
        await client.sendMessage(message.to, `✅ ${res}`);
        return;
    }

    if (body.toLowerCase().startsWith('/processar')) {
        const janelaManual = body.split(' ')[1];
        if (!janelaManual) return await client.sendMessage(message.to, "❌ Use: /processar 15h30");
        await client.sendMessage(message.to, `⚙️ Processando janela ${janelaManual}...`);
        await transcricaoService.processarAudiosPendentes();
        await pedidoHandler.executarConversaoLote(client, janelaManual);
        return;
    }

    const prefixosAceitos = ['/representante', '/rep', '/admin'];
    const prefixoUsado = prefixosAceitos.find(p => body.toLowerCase().startsWith(p));

    if (prefixoUsado) {
        let args = body.substring(prefixoUsado.length).trim();
        if (!args) return;

        let targetUser = message.to; 
        let commandForUser = args;   

        const primeiroEspaco = args.indexOf(' ');
        let possivelNumero = '';
        let restoDoComando = '';

        if (primeiroEspaco > -1) {
            possivelNumero = args.substring(0, primeiroEspaco).replace(/\D/g, ''); 
            restoDoComando = args.substring(primeiroEspaco).trim();
        } else {
            possivelNumero = args.replace(/\D/g, ''); 
        }

        if (possivelNumero.length >= 10) {
            console.log(`[OPERADOR] Comando para: ${possivelNumero}`);
            targetUser = possivelNumero + '@c.us'; 
            commandForUser = restoDoComando;       
        }

        const mockMessage = {
            from: targetUser,
            body: commandForUser || 'menu',
            _operator_triggered: true
        };

        await processUserMessage(mockMessage);
    }
});


// ============================================================================================
// === PROCESSADOR DE MENSAGENS ===
// ============================================================================================
async function processUserMessage(message) {
    if (message.from === 'status@broadcast') return;

    const numero = message.from; 
    let numeroTelefoneLimpo = numero.includes('@') ? numero.split('@')[0] : numero;

    if (!numeroTelefoneLimpo) return; 

    // --- 1. Validação de Segurança ---
    let representantes = [];
    try {
        const rawData = fs.readFileSync(CAMINHO_JSON_REAL, 'utf-8');
        representantes = JSON.parse(rawData);
    } catch (e) { console.error('❌ Erro JSON:', e); return; }
    
    // 🔥 BUSCA OTIMIZADA (Telefone ou LID)
    const representante = representantes.find(rep => {
        // 1. Tenta comparar pelo LID (Prioritário)
        if (rep.lid) {
            const lidLimpo = String(rep.lid).split('@')[0];
            if (numeroTelefoneLimpo === lidLimpo || numero === rep.lid) return true;
        }

        // 2. Tenta comparar pelo Telefone (se o LID não bater)
        const repTel = String(rep.telefone || "").replace(/\D/g, ''); 
        const msgTel = String(numeroTelefoneLimpo).replace(/\D/g, '');
        
        if (repTel.length >= 10) {
            return msgTel.endsWith(repTel) || repTel.endsWith(msgTel);
        }

        return false;
    });

    // --- Tratamento para quem NÃO está na base ---
    if (!representante) {
        // Ignora se for o operador forçando comando, senão envia msg de erro
        if (message._operator_triggered) {
             console.log(`🚫 [OPERADOR] Alvo não encontrado no JSON: ${numeroTelefoneLimpo}`);
             return;
        }

        // Carrega lista de bloqueados/atendidos fora da base
        let foraDaBase = [];
        if (fs.existsSync(FORA_BASE_PATH)) {
            foraDaBase = lerJson(FORA_BASE_PATH, []);
        }

        const hoje = new Date().toISOString().split('T')[0]; // Data YYYY-MM-DD
        
        // Verifica se já foi atendido HOJE
        const jaAtendidoHoje = foraDaBase.some(at => at.id === numero && at.data === hoje);

        if (!jaAtendidoHoje) {
            console.log(`🚫 [FORA DA BASE] Enviando informativo para: ${numeroTelefoneLimpo}`);
            
            await client.sendMessage(numero, MENSAGEM_PDV);

            // Salva no log para não repetir hoje
            foraDaBase.push({ 
                id: numero, 
                telefone: numeroTelefoneLimpo, 
                data: hoje,
                hora: new Date().toLocaleTimeString('pt-BR')
            });
            fs.writeFileSync(FORA_BASE_PATH, JSON.stringify(foraDaBase, null, 2));
        } else {
            console.log(`⏳ [FORA DA BASE] ${numeroTelefoneLimpo} já recebeu o informativo hoje. Ignorando.`);
        }
        return; // ENCERRA AQUI, não mostra o menu
    }

    // --- 2. Início do Fluxo (Se for Representante Válido) ---
    const idPermanente = message.from; 

    if (!atendidos.includes(idPermanente) && !staffs.some(staff => String(staff.telefone) === numeroTelefoneLimpo)) {
        console.log(`✅ [NOVO] Atendimento para: ${representante.nome} (${representante.codigo})`);
        
        const hora = new Date().getHours();
        const saudacaoBase = hora <= 12 ? 'Bom dia' : (hora <= 18 ? 'Boa tarde' : 'Boa noite');
        
        await client.sendMessage(message.from, `${saudacaoBase}! Sou o assistente virtual.\n${MENU_TEXT}`);

        atendidos.push(idPermanente);
        fs.writeFileSync(ATENDIDOS_PATH, JSON.stringify(atendidos, null, 2));
        return;
    }

    // --- 3. Processamento de Etapas/Menus ---
    const opcao = message.body.trim();
    let etapas = lerJson(ETAPAS_PATH, {});

    if (etapas[numero] && etapas[numero].etapa) {
        const etapaAtual = etapas[numero].etapa;
        try {
            if (etapaAtual === 'pdv') {
                await enviarResumoPDV(client, message, representante); 
                await registrarUso(numeroTelefoneLimpo, 'Consulta PDV',representante.setor);
                delete etapas[numero];
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
                return;
            }
            if (etapaAtual === 'coleta_ttc') {
                await enviarColetaTtcPdv(client, message);
                await registrarUso(numeroTelefoneLimpo, 'Consulta TTC',representante.setor);
                delete etapas[numero];
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
                return;
            }
            if (etapaAtual === 'giro_equipamentos') {
                await enviarGiroEquipamentosPdv(client, message, representante);
                await registrarUso(numeroTelefoneLimpo, 'Consulta Giro',representante.setor);
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
            if (etapaAtual === 'wait') {
                const resultado = await pedidoHandler.processarMensagem(client, message);
                if (resultado === 'FINALIZAR') {
                    delete etapas[numero];
                    fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
                }
                return;
            }
        } catch (error) {
            console.error(`Erro etapa "${etapaAtual}" para ${numero}:`, error);
            await client.sendMessage(numero, '❌ Erro ao processar. Tente novamente.');
            delete etapas[numero];
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            return;
        }
    }

    const MSG_INDISPONIVEL = '⚠️ Relatórios ainda não gerados. Avisarei quando estiverem prontos! 🤖';

    switch (opcao.toLowerCase()) {
        case '1': { 
            const pronto = await verificarArquivoAtualizado(CAMINHO_CHECK_PDF);
            if (pronto) {
                // 👇 GARANTIA QUE VAI O ARQUIVO CERTO
                console.log(`[MANUAL] Enviando PDF para: ${representante.nome} (Cod: ${representante.codigo})`);
                await enviarRelatoriosPdf(client, message, representante);
                await registrarUso(numeroTelefoneLimpo, 'Relatório PDF', representante.setor);
                if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
                delete usuariosAguardandoRelatorio[numero]; 
            } else {
                await client.sendMessage(message.from, MSG_INDISPONIVEL);
                usuariosAguardandoRelatorio[numero] = 'pdf';
            }
            break;
        }
        case '2': {
            const pronto = await verificarArquivoAtualizado(CAMINHO_CHECK_IMAGEM);
            if (pronto) {
                console.log(`[MANUAL] Enviando Imagem para: ${representante.nome} (Cod: ${representante.codigo})`);
                await enviarRelatoriosImagem(client, message, representante);
                await registrarUso(numeroTelefoneLimpo, 'Relatório Imagem', representante.setor);
                if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
                delete usuariosAguardandoRelatorio[numero];
            } else {
                await client.sendMessage(message.from, MSG_INDISPONIVEL);
                usuariosAguardandoRelatorio[numero]= 'imagem';
            }
            break;
        }
        case '3':
            await client.sendMessage(message.from, 'Envie mensagem para o Yuri APR 3299982517 com nb e print do problema');
            await registrarUso(numeroTelefoneLimpo, 'Suporte Manual', representante.setor);
            break;
        case '4':
            await enviarRemuneracao(client, message);
            await registrarUso(numeroTelefoneLimpo, 'Remuneração', representante.setor);
            break;
        case '5':
            await client.sendMessage(message.from, 'Envie o código do PDV (apenas números):');
            etapas[numero] = { etapa: 'pdv' };
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await registrarUso(numeroTelefoneLimpo, 'Início PDV', representante.setor);
            break;
        case '6':
            await enviarListaContatos(client, message);
            await registrarUso(numeroTelefoneLimpo, 'Lista Contatos', representante.setor);
            break;
        case '7': {
            await client.sendMessage(message.from, 'Envie o código do PDV para Coleta TTC:');
            etapas[numero] = { etapa: 'coleta_ttc' };
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await registrarUso(numeroTelefoneLimpo, 'Início TTC',representante.setor);
            break;
        }
        case '8': {
            await enviarCts(client, message, representante); 
            await registrarUso(numeroTelefoneLimpo, 'Consulta CT',representante.setor);
            break;
        }
        case '9': {
            await client.sendMessage(message.from, 'Envie o código do PDV para Giro 🤑:');
            etapas[numero] = { etapa: 'giro_equipamentos' }; 
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await registrarUso(numeroTelefoneLimpo, 'Início Giro'), representante.setor;
            break;
        }
        case '10': {
            console.log(`[index.js] - Iniciando MODO PEDIDO para ${numeroTelefoneLimpo}`);
            await pedidoHandler.iniciarProcessamentoPedido(client, message);
            etapas[numero] = { etapa: 'wait' }; 
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await registrarUso(numeroTelefoneLimpo, 'Início Pedido', representante.setor);
            break;
        }
        case 'menu':
            const hora = new Date().getHours();
            const saudacao = hora < 12 ? 'Bom dia' : (hora < 18 ? 'Boa tarde' : 'Boa noite');
            await client.sendMessage(message.from, `${saudacao}!\n${MENU_TEXT}`);
            if (etapas[numero]) {
                delete etapas[numero].tentativasInvalidas;
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            }
            await registrarUso(numeroTelefoneLimpo, 'Menu', representante.setor);
            break;
    }
}

client.on('message', async message => {
    // LOG DE MONITORAMENTO
    const contactName = message._data.notifyName || message.from.split('@')[0];
    console.log(`🔔 [EVENTO] Msg de: ${contactName} | Texto: ${message.body}`);
    
    // Proteção para mensagens de STATUS (evita erro)
    if (message.from === 'status@broadcast') return;

    // Lógica para GRUPOS (Com proteção Anti-Crash)
    if (message.from.endsWith('@g.us')) {
        try {
            // Tenta marcar como lido, mas se falhar, apenas avisa no console e não derruba o bot
            const chat = await message.getChat();
            await chat.sendSeen();
        } catch (err) {
            console.log(`⚠️ [GRUPO] Não foi possível marcar como lido (Ignorando erro): ${err.message}`);
        }
        return; 
    }

    // Processa mensagens privadas normalmente
    await processUserMessage(message);
});
client.initialize();

client.on('disconnected', reason => { console.error('⚠️ Desconectado:', reason); process.exit(1); });
client.on('auth_failure', msg => { console.error('❌ Falha Auth:', msg); process.exit(1); });
client.on('loading_screen', (pct, msg) => { console.log(`⏳ ${pct}% - ${msg}`); });