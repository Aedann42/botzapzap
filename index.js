// --- Importações ---
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const transcricaoService = require('./src/services/transcricaoService');
const { lerJson, registrarUso, ETAPAS_PATH, ATENDIDOS_PATH, STAFFS_PATH } = require('./src/utils/dataHandler.js');
const verificarArquivoAtualizado = require('./src/services/checkDateReports');
const { processarTroca, aprovarTroca } = require('./src/handlers/mudancaSetor');
const chalk = require('chalk');
const { logAcao, iniciarPainel, logMatrix } = require('./src/utils/logger');

// 🚨 CAMINHO FORÇADO PARA O JSON (PASTA DATA)
const CAMINHO_JSON_REAL = path.join(__dirname, 'data', 'representantes.json');
const LOG_USO_PATH = path.join(__dirname, 'logs', 'log_uso.json');
const FORA_BASE_PATH = path.join(__dirname, 'data', 'atendidosForaDaBase.json');

// Caminhos de CHECAGEM (Usados apenas para saber se o processo do servidor terminou)
const CAMINHO_CHECK_PDF = '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2026\\3 - MARÇO\\_GERADOR PDF\\ACOMPS\\410\\410_Volume.pdf';
const CAMINHO_CHECK_IMAGEM = '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2026\\3 - MARÇO\\_GERADOR PDF\\IMAGENS\\GV4\\MATINAL_GV4_page_1.jpg';
const MENU_TEXT = require('./src/config/menuOptions');
const MENSAGEM_PDV = require('./src/config/mensagemPDV'); 

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
//const lembretePonto = require('./src/handlers/lembretePonto'); 
const clientesNaoCompradores = require('./src/handlers/clientesNaoCompradores');

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
            '--disable-gpu',
            '--js-flags="--max-old-space-size=4096"'
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
    if (body.toLowerCase().startsWith('/aprovar')) {
        const telefoneAlvo = body.split(' ')[1];
        if (!telefoneAlvo) return await client.sendMessage(message.from, "❌ Use: /aprovar numerodotelefone");
        
        await aprovarTroca(client, message, telefoneAlvo);
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
    const texto = message.body.trim(); // Pegando o texto da mensagem

    // 🚨 GATILHO DE ADMINISTRAÇÃO
    if (texto.toLowerCase().startsWith('/aprovar')) {
        const telefoneAlvo = texto.split(' ')[1];
        if (!telefoneAlvo) return await client.sendMessage(message.from, "❌ Use: /aprovar numerodotelefone");
        
        await aprovarTroca(client, message, telefoneAlvo);
        return; // Retorna para o bot não tentar mostrar o menu normal
    }

    let numeroTelefoneLimpo = numero.split('@')[0];


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
    let etapas = lerJson(ETAPAS_PATH, {}); // Carrega as etapas aqui em cima
    const textoComando = texto.toUpperCase();
    const PALAVRA_CHAVE_APR = 'ALTERAR'; // Ou a palavra que você escolheu

    // Se NÃO é representante, verificamos se ele sabe a senha ou se já está no meio da troca
    if (!representante) {
        const iniciouAgora = textoComando === '10' || textoComando === PALAVRA_CHAVE_APR;
        const jaEstaEmTroca = etapas[numero] && (etapas[numero].etapa?.startsWith('troca_setor'));

        if (iniciouAgora || jaEstaEmTroca) {
            // Se iniciou agora, manda a primeira mensagem e seta a etapa
            if (iniciouAgora) {
                await client.sendMessage(numero, '🔄 *VINCULAR NOVO SETOR*\n\nPor favor, digite apenas o *NÚMERO DO SETOR* que você vai assumir:');
                etapas[numero] = { etapa: 'troca_setor_passo1' }; 
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
                return;
            }
            // Se já estava no meio, processa o passo
            await processarTroca(client, message, { nome: 'Novo Representante' });
            return;
        }

        // Se não for nada disso, aí sim manda o informativo de PDV e bloqueia
        if (message._operator_triggered) return;
        
        let foraDaBase = lerJson(FORA_BASE_PATH, []);
        const hoje = new Date().toISOString().split('T')[0];
        const jaAtendidoHoje = foraDaBase.some(at => at.id === numero && at.data === hoje);

        if (!jaAtendidoHoje) {
            console.log(`🚫 [FORA DA BASE] Enviando informativo para: ${numeroTelefoneLimpo}`);
            await client.sendMessage(numero, MENSAGEM_PDV);
            foraDaBase.push({ id: numero, telefone: numeroTelefoneLimpo, data: hoje, hora: new Date().toLocaleTimeString('pt-BR') });
            fs.writeFileSync(FORA_BASE_PATH, JSON.stringify(foraDaBase, null, 2));
        }
        return; 
    }

// --- 2. Início do Fluxo (Se for Representante Válido) ---
    // Pega a data de hoje no formato do seu log (DD/MM/YYYY)
    const dataObj = new Date();
    const dia = String(dataObj.getDate()).padStart(2, '0');
    const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
    const dataDeHoje = `${dia}/${mes}/${dataObj.getFullYear()}`;

    // Lemos o log de uso direto do arquivo
    const historicoDeUso = lerJson(LOG_USO_PATH, []);

    // Verifica se esse telefone já tem ALGUMA linha de registro gravada com a data de hoje
    const jaFoiAtendidoHoje = historicoDeUso.some(log => log.telefone === numeroTelefoneLimpo && log.data === dataDeHoje);

    // Se ele NÃO foi atendido hoje e NÃO for do staff
    if (!jaFoiAtendidoHoje && !staffs.some(staff => String(staff.telefone) === numeroTelefoneLimpo)) {
        
        // Log bonitão no terminal
        logAcao('SISTEMA', `Primeiro atendimento do dia para: ${repNome}`);
        
        const hora = new Date().getHours();
        const saudacaoBase = hora <= 12 ? 'Bom dia' : (hora <= 18 ? 'Boa tarde' : 'Boa noite');
        
        await client.sendMessage(message.from, `${saudacaoBase}! Sou o assistente virtual.\n${MENU_TEXT}`);

        // O PULO DO GATO ESTÁ AQUI 👇
        // Em vez de salvar num JSON de "atendidos", a gente simplesmente registra a ação "Menu".
        // Como o registrarUso salva no log_uso.json, na próxima vez que ele mandar mensagem, 
        // o "jaFoiAtendidoHoje" lá em cima vai dar Verdadeiro!
        await registrarUso(numeroTelefoneLimpo, 'Menu', representante.setor);
        
        return; // Para a execução aqui para ele não tentar abrir o switch
    }

    // --- 3. Processamento de Etapas/Menus ---
    const opcao = message.body.trim();

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
                return;
            }
            
            if (etapaAtual === 'clientes_nao_compradores') {
                await clientesNaoCompradores(client, message, representante);
                await registrarUso(numeroTelefoneLimpo, 'Consulta Nao Compradores', representante.setor);
                delete etapas[numero];
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
                return;
            } 
            
            if (etapaAtual === 'troca_setor_passo1' || etapaAtual === 'troca_setor_passo2') {
                await processarTroca(client, message, representante);
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
                // Chama o logger que faz tudo: soma o stats, pinta de verde e atualiza o painel
                logAcao('PDF', `Enviando PDF para: ${representante.nome} (Cod: ${representante.setor})`);
                
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
                logAcao('IMAGEM', `Enviando Imagem para:${representante.setor}`);
                
                await enviarRelatoriosImagem(client, message, representante);
                await registrarUso(numeroTelefoneLimpo, 'Relatório Imagem', representante.setor);
                if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
                delete usuariosAguardandoRelatorio[numero];
            } else {
                await client.sendMessage(message.from, MSG_INDISPONIVEL);
                usuariosAguardandoRelatorio[numero] = 'imagem';
            }
            break;
        }
        case '3': {
            logAcao('DUVIDA', `RN:${representante.nome} COM DÚVIDAS`);
            await client.sendMessage(message.from, 'Envie mensagem para o Yuri APR 3299982517 com nb e print do problema');
            await registrarUso(numeroTelefoneLimpo, 'Suporte Manual', representante.setor);
            break;
        }
        case '4': {
            logAcao('REMUNERACAO',`Consulta Remuneração solicitada por ${representante.setor}`);
            await enviarRemuneracao(client, message);
            await registrarUso(numeroTelefoneLimpo, 'Remuneração', representante.setor);
            break;
        }
        case '5': {
            logAcao('PDV', `Análise PDV: Aguardando código. Setor ${representante.setor}`);
            await client.sendMessage(message.from, 'Envie o código do PDV (apenas números):');
            etapas[numero] = { etapa: 'pdv' };
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await registrarUso(numeroTelefoneLimpo, 'Início PDV', representante.setor);
            break;
        }
        case '6': {
            logAcao('TELEFONES', `Abriu a lista de contatos. Setor ${representante.setor}`);
            await enviarListaContatos(client, message);
            await registrarUso(numeroTelefoneLimpo, 'Lista Contatos', representante.setor);
            break;
        }
        case '7': {
            logAcao('COLETA', `Coleta TTC: Aguardando código. Setor ${representante.setor}`);
            await client.sendMessage(message.from, 'Envie o código do PDV para Coleta TTC:');
            etapas[numero] = { etapa: 'coleta_ttc' };
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await registrarUso(numeroTelefoneLimpo, 'Início TTC', representante.setor);
            break;
        }
        case '8': {
            logAcao('BONIFICACAO', `Consulta CT e Bonificação. Setor ${representante.setor}`);
            await enviarCts(client, message, representante); 
            await registrarUso(numeroTelefoneLimpo, 'Consulta CT', representante.setor);
            break;
        }
        case '9': {
            logAcao('GIRO', `Consulta Giro: Aguardando código. Setor ${representante.setor}`);
            await client.sendMessage(message.from, 'Envie o código do PDV para Giro 🤑:');
            etapas[numero] = { etapa: 'giro_equipamentos' }; 
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            // Sintaxe arrumada aqui 👇
            await registrarUso(numeroTelefoneLimpo, 'Início Giro', representante.setor);
            break;
        }
        case '10': 
        case 'alterar': {
            logAcao('ALTERAR_SETOR', `Arrumando setor (Início da troca). Setor ${representante.setor}`);
            await client.sendMessage(message.from, '🔄 *CORRIGIR SETOR E MATRÍCULA*\n\nPor favor, digite apenas o *NÚMERO DO SETOR* que você vai assumir:');
            etapas[numero] = { etapa: 'troca_setor_passo1' }; 
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await registrarUso(numeroTelefoneLimpo, 'Início Troca Setor', representante.setor);
            break;
        }
        case '11': {
            logAcao('NAO_COMPRADORES', `Olhando não compradores. Setor ${representante.setor}`);
            const menuIndicadores = `📉 *CLIENTES NÃO COMPRADORES*\n\n` +
                                    `Qual indicador você deseja analisar? (Digite apenas o número)\n\n` +
                                    `*1* - AMBEV\n` +
                                    `*2* - MKTP\n` +
                                    `*3* - CERV\n` +
                                    `*4* - MATCH\n` +
                                    `*5* - CERV RGB\n` +
                                    `*6* - CERV 1/1\n` +
                                    `*7* - CERV 300\n` +
                                    `*8* - MEGABRANDS\n` +
                                    `*9* - NAB\n` +
                                    `*10* - RED BULL\n` +
                                    `*11* - R$ MKTP`;
            
            await client.sendMessage(message.from, menuIndicadores);
            
            etapas[numero] = { etapa: 'clientes_nao_compradores' };
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await registrarUso(numeroTelefoneLimpo, 'Início Clientes Nao Compradores', representante.setor);
            break;
        }
        case 'menu': {
            const hora = new Date().getHours();
            const saudacao = hora < 12 ? 'Bom dia' : (hora < 18 ? 'Boa tarde' : 'Boa noite');
            await client.sendMessage(message.from, `${saudacao}!\n${MENU_TEXT}`);
            if (etapas[numero]) {
                delete etapas[numero].tentativasInvalidas;
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            }
            await registrarUso(numeroTelefoneLimpo, 'Menu', representante.setor);
            
            // Um pequeno log Matrix opcional para você ver quando pedem o menu
            logMatrix(`[SISTEMA] Menu inicial solicitado por: ${representante.nome}`);
            break;
        }
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
iniciarPainel();
client.initialize();

client.on('disconnected', reason => { console.error('⚠️ Desconectado:', reason); process.exit(1); });
client.on('auth_failure', msg => { console.error('❌ Falha Auth:', msg); process.exit(1); });
client.on('loading_screen', (pct, msg) => { console.log(`⏳ ${pct}% - ${msg}`); });