// index.js (VERSÃO FINAL COMPLETA - ORDEM CORRIGIDA + DEBUG)

// --- Importações ---
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const verificarArquivoAtualizado = require('./src/services/checkDateReports.js');
const { lerJson, registrarUso, ETAPAS_PATH, ATENDIDOS_PATH, STAFFS_PATH } = require('./src/utils/dataHandler.js');

// 🚨 CAMINHO FORÇADO PARA O JSON (PASTA DATA)
const CAMINHO_JSON_REAL = path.join(__dirname, 'data', 'representantes.json');

// IMPORTANTE: Estes caminhos devem ser acessíveis (leitura) pelo servidor
const CAMINHO_CHECK_PDF = '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2025\\11 - NOVEMBRO\\_GERADOR PDF\\ACOMPS\\410\\410_MKTPTT.pdf';
const CAMINHO_CHECK_IMAGEM = '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2025\\11 - NOVEMBRO\\_GERADOR PDF\\IMAGENS\\GV4\\MATINAL_GV4_page_3.jpg'

const MENU_TEXT = require('./src/config/menuOptions');

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

// 1. INICIALIZAÇÃO DO CLIENTE (Obrigatório vir antes dos listeners)
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: '.session' }),
    webCacheType: 'remote', 
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));

client.on('ready', () => {
    console.log('✅ Bot conectado!');
    
    // Verifica se o arquivo existe no caminho forçado
    if (fs.existsSync(CAMINHO_JSON_REAL)) {
        console.log(`📂 JSON de Representantes carregado de: ${CAMINHO_JSON_REAL}`);
    } else {
        console.error(`❌ ERRO CRÍTICO: Arquivo não encontrado em: ${CAMINHO_JSON_REAL}`);
    }

    // === AGENDAMENTOS (CRON) ===
    const TIMEZONE = "America/Sao_Paulo";
    console.log('[AGENDADOR]: Configurando lembretes de ponto...');

    cron.schedule('55 7 * * 1-5', () => { lembretePonto(client, '7:55'); }, { timezone: TIMEZONE });
    cron.schedule('0 12 * * 1-5', () => { lembretePonto(client, '12:00'); }, { timezone: TIMEZONE });
    cron.schedule('45 17 * * 1-5', () => { lembretePonto(client, '17:45'); }, { timezone: TIMEZONE });
    
    console.log('[AGENDADOR]: Agendamentos configurados.');

    // === VERIFICADOR DE ARQUIVOS ===
    const INTERVALO_VERIFICACAO = 3 * 60 * 1000; 
    setInterval(async () => {
        if (Object.keys(usuariosAguardandoRelatorio).length === 0) return;

        console.log(`[VERIFICADOR]: Checando para ${Object.keys(usuariosAguardandoRelatorio).length} usuários...`);

        try {
            const pdfPronto = await verificarArquivoAtualizado(CAMINHO_CHECK_PDF);
            const imagemPronta = await verificarArquivoAtualizado(CAMINHO_CHECK_IMAGEM);

            if (!pdfPronto && !imagemPronta) {
                console.log('[VERIFICADOR]: Nada ainda.');
                return;
            }

            const notificados = [];
            for (const userNumero in usuariosAguardandoRelatorio) {
                const tipoEsperado = usuariosAguardandoRelatorio[userNumero];

                if (tipoEsperado === 'pdf' && pdfPronto) {
                    const mediaPdf = MessageMedia.fromFilePath(CAMINHO_CHECK_PDF); 
                    await client.sendMessage(userNumero, mediaPdf, { caption: "🎉 Seu relatório PDF chegou!" });
                    notificados.push(userNumero);
                } else if (tipoEsperado === 'imagem' && imagemPronta) {
                    const mediaImagem = MessageMedia.fromFilePath(CAMINHO_CHECK_IMAGEM);
                    await client.sendMessage(userNumero, mediaImagem, { caption: "🎉 Seu relatório Imagem chegou!" });
                    notificados.push(userNumero);
                }
            }

            if (notificados.length > 0) {
                for (const user of notificados) delete usuariosAguardandoRelatorio[user];
            }
        } catch (error) {
            console.error('[VERIFICADOR]: Erro:', error);
        }
    }, INTERVALO_VERIFICACAO);
});

// ============================================================================================
// === LISTENER DO OPERADOR (COMPARADOR FLEXÍVEL) ===
// ============================================================================================
client.on('message_create', async (message) => {
    // 🚨 SEGURANÇA: Ignora status
    if (message.from === 'status@broadcast') return;
    if (!message.fromMe) return;

    const body = message.body.trim(); 

    if (body.toLowerCase() === '/ativar') {
        console.log('[OPERADOR]: /ativar');
        await client.sendMessage(message.to, '🤖 Iniciando ativação...');
        const res = await enviarMenuAtivacao(client);
        await client.sendMessage(message.to, `✅ ${res}`);
        return;
    }

    const prefixosAceitos = ['/representante', '/rep', '/admin'];
    const prefixoUsado = prefixosAceitos.find(p => body.toLowerCase().startsWith(p));

    if (prefixoUsado) {
        let args = body.substring(prefixoUsado.length).trim();
        if (!args) {
            console.log('[OPERADOR]: Use /rep [NUMERO] [COMANDO]');
            return;
        }

        let targetUser = message.to; 
        let commandForUser = args;   

        // Tenta extrair um número explicito no comando
        const primeiroEspaco = args.indexOf(' ');
        let possivelNumero = '';
        let restoDoComando = '';

        if (primeiroEspaco > -1) {
            possivelNumero = args.substring(0, primeiroEspaco).replace(/\D/g, ''); 
            restoDoComando = args.substring(primeiroEspaco).trim();
        } else {
            possivelNumero = args.replace(/\D/g, ''); 
        }

        // === AUTO-SAVE: FORÇA BRUTA ===
        if (possivelNumero.length >= 10) {
            console.log(`[OPERADOR]: Comando manual para telefone: ${possivelNumero}`);
            
            // Se o chat atual for LID
            if (targetUser.includes('@lid')) {
                console.log(`[AUTO-LEARN]: Tentando vincular LID ${targetUser} ao telefone ${possivelNumero}...`);
                
                try {
                    const rawData = fs.readFileSync(CAMINHO_JSON_REAL, 'utf-8');
                    const representantes = JSON.parse(rawData);

                    // COMPARADOR FLEXÍVEL (Converte tudo para string e tira espaços)
                    const index = representantes.findIndex(r => 
                        String(r.telefone).trim() === String(possivelNumero).trim()
                    );

                    if (index !== -1) {
                        // Só salva se for diferente
                        if (representantes[index].lid !== targetUser) {
                            representantes[index].lid = targetUser;
                            fs.writeFileSync(CAMINHO_JSON_REAL, JSON.stringify(representantes, null, 4));
                            console.log(`✅ [AUTO-LEARN]: SUCESSO! JSON Atualizado.`);
                            await client.sendMessage(message.to, `🤖 [SISTEMA] Vínculo salvo!`);
                        } else {
                            console.log(`ℹ️ [AUTO-LEARN]: Este LID já estava salvo corretamente.`);
                        }
                    } else {
                        console.log(`❌ [AUTO-LEARN]: Telefone ${possivelNumero} não encontrado no JSON.`);
                        
                        // LOG DE DIAGNÓSTICO
                        console.log("   -> Exemplo de telefone no JSON:", representantes[0]?.telefone);
                    }
                } catch (err) {
                    console.error(`❌ [AUTO-LEARN]: Erro ao gravar:`, err);
                }
            }

            // Redireciona o fluxo para o número limpo
            targetUser = possivelNumero + '@c.us'; 
            commandForUser = restoDoComando;       
        }

        console.log(`[OPERADOR]: Executando '${commandForUser}' como ${targetUser}`);

        const mockMessage = {
            from: targetUser,
            body: commandForUser || 'menu',
            _operator_triggered: true
        };

        await processUserMessage(mockMessage);
    }
});


// ============================================================================================
// === PROCESSADOR DE MENSAGENS (BLINDADO - LÊ DO PATH CORRETO) ===
// ============================================================================================
async function processUserMessage(message) {
    if (message.from === 'status@broadcast') return;

    const numero = message.from; 

    // Extração manual de segurança
    let numeroTelefoneLimpo;
    if (numero.includes('@')) {
        numeroTelefoneLimpo = numero.split('@')[0];
    } else {
        numeroTelefoneLimpo = numero;
    }

    if (!numeroTelefoneLimpo) return; 

    // Lê o JSON atualizado DIRETAMENTE DA FONTE
    let representantes = [];
    try {
        const rawData = fs.readFileSync(CAMINHO_JSON_REAL, 'utf-8');
        representantes = JSON.parse(rawData);
    } catch (e) {
        console.error('Erro ao ler representantes:', e);
    }
    
    // BUSCA HÍBRIDA: Telefone OU LID
    const representante = representantes.find(rep => 
        String(rep.telefone).trim() === String(numeroTelefoneLimpo).trim() || 
        (rep.lid && rep.lid === numero)
    );

    if (!representante) {
        console.log(`Número não autorizado: ${numeroTelefoneLimpo} (ID: ${numero})`);
        return;
    }

    // ===============================================================================
    // Verifica Atendidos / Staff
    const idPermanente = message.from; 

    if (!atendidos.includes(idPermanente) && !staffs.some(staff => String(staff.telefone) === numeroTelefoneLimpo)) {
        const hora = new Date().getHours();
        const saudacaoBase = hora <= 12 ? 'Bom dia' : (hora <= 18 ? 'Boa tarde' : 'Boa noite');
        const saudacoesAlternativas = [
            'Como posso ajudar?', 'Tudo bem por aí?', 'É um prazer falar com você.',
            'Estou à disposição.', 'O que mandas?', 'Que bom receber seu contato.'
        ];
        const saudacaoAleatoria = saudacoesAlternativas[Math.floor(Math.random() * saudacoesAlternativas.length)];

        await client.sendMessage(message.from, `${saudacaoBase}! ${saudacaoAleatoria}\n${MENU_TEXT}`);

        atendidos.push(idPermanente);
        fs.writeFileSync(ATENDIDOS_PATH, JSON.stringify(atendidos, null, 2));
        return;
    }
    // ===============================================================================

    const opcao = message.body.trim();
    let etapas = lerJson(ETAPAS_PATH, {});

    if (etapas[numero] && etapas[numero].etapa) {
        const etapaAtual = etapas[numero].etapa;

        try {
            if (etapaAtual === 'pdv') {
                await enviarResumoPDV(client, message, representante); 
                await registrarUso(numeroTelefoneLimpo, 'Consulta PDV');
                delete etapas[numero];
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
                return;
            }
            if (etapaAtual === 'coleta_ttc') {
                await enviarColetaTtcPdv(client, message);
                await registrarUso(numeroTelefoneLimpo, 'Consulta TTC');
                delete etapas[numero];
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
                return;
            }
            if (etapaAtual === 'giro_equipamentos') {
                await enviarGiroEquipamentosPdv(client, message, representante);
                await registrarUso(numeroTelefoneLimpo, 'Consulta Giro');
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
            await client.sendSeen(numero);
            const pronto = await verificarArquivoAtualizado(CAMINHO_CHECK_PDF);
            if (pronto) {
                await enviarRelatoriosPdf(client, message, representante);
                await registrarUso(numeroTelefoneLimpo, 'Relatório PDF');
                if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
                delete usuariosAguardandoRelatorio[numero]; 
            } else {
                await client.sendMessage(message.from, MSG_INDISPONIVEL);
                usuariosAguardandoRelatorio[numero] = 'pdf';
            }
            break;
        }
        case '2': {
            await client.sendSeen(numero);
            const pronto = await verificarArquivoAtualizado(CAMINHO_CHECK_IMAGEM);
            if (pronto) {
                await enviarRelatoriosImagem(client, message, representante);
                await registrarUso(numeroTelefoneLimpo, 'Relatório Imagem');
                if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
                delete usuariosAguardandoRelatorio[numero];
            } else {
                await client.sendMessage(message.from, MSG_INDISPONIVEL);
                usuariosAguardandoRelatorio[numero]= 'imagem';
            }
            break;
        }
        case '3':
            await client.sendMessage(message.from, 'Descreva sua demanda (com NB e prints se necessário).');
            await registrarUso(numeroTelefoneLimpo, 'Suporte Manual');
            break;
        case '4':
            await enviarRemuneracao(client, message);
            await registrarUso(numeroTelefoneLimpo, 'Remuneração');
            break;
        case '5':
            await client.sendMessage(message.from, 'Envie o código do PDV (apenas números):');
            etapas[numero] = { etapa: 'pdv' };
            await client.sendSeen(numero);
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await registrarUso(numeroTelefoneLimpo, 'Início PDV');
            break;
        case '6':
            await client.sendSeen(numero);
            await enviarListaContatos(client, message);
            await registrarUso(numeroTelefoneLimpo, 'Lista Contatos');
            break;
        case '7': {
            await client.sendMessage(message.from, 'Envie o código do PDV para Coleta TTC:');
            etapas[numero] = { etapa: 'coleta_ttc' };
            await client.sendSeen(numero);
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await registrarUso(numeroTelefoneLimpo, 'Início TTC');
            break;
        }
        case '8': {
            await enviarCts(client, message, representante); 
            await registrarUso(numeroTelefoneLimpo, 'Consulta CT');
            break;
        }
        case '9': {
            await client.sendMessage(message.from, 'Envie o código do PDV para Giro:');
            etapas[numero] = { etapa: 'giro_equipamentos' }; 
            await client.sendSeen(numero);
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await registrarUso(numeroTelefoneLimpo, 'Início Giro');
            break;
        }
        case 'menu':
            const hora = new Date().getHours();
            const saudacao = hora < 12 ? 'Bom dia' : (hora < 18 ? 'Boa tarde' : 'Boa noite');
            await client.sendMessage(message.from, `${saudacao}!\n${MENU_TEXT}`);
            await client.sendSeen(numero);
            if (etapas[numero]) {
                delete etapas[numero].tentativasInvalidas;
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            }
            await registrarUso(numeroTelefoneLimpo, 'Menu');
            break;
    }
}

client.on('message', async message => {
    if (message.from === 'status@broadcast') return;
    if (message.from.endsWith('@g.us')) {
        const chat = await message.getChat();
        await chat.sendSeen();
        return; 
    }
    await processUserMessage(message);
});

client.initialize();

client.on('disconnected', reason => { console.error('⚠️ Desconectado:', reason); process.exit(1); });
client.on('auth_failure', msg => { console.error('❌ Falha Auth:', msg); process.exit(1); });
client.on('loading_screen', (pct, msg) => { console.log(`⏳ ${pct}% - ${msg}`); });