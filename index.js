const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// Importações
const { lerJson, registrarUso, ETAPAS_PATH, STAFFS_PATH } = require('./src/utils/dataHandler.js');
const { logAcao, iniciarPainel } = require('./src/utils/logger');
const simularHumano = require('./src/handlers/simularHumano');
const autoHealingNome = require('./src/handlers/autoHealingNome');
const handleMenu = require('./src/handlers/menuHandler');
const { processarTroca, aprovarTroca } = require('./src/handlers/mudancaSetor');
const monitorarArquivos = require('./src/services/verificadorLogs');
const enviarMenuAtivacao = require('./src/handlers/AtivacaoRepresentantes.js');
const transcricaoService = require('./src/services/transcricaoService');

// Configuração
const CAMINHO_JSON_REAL = path.join(__dirname, 'data', 'representantes.json');
const LOG_USO_PATH = path.join(__dirname, 'logs', 'log_uso.json');
const FORA_BASE_PATH = path.join(__dirname, 'data', 'atendidosForaDaBase.json');
const MENU_TEXT = require('./src/config/menuOptions');
const MENSAGEM_PDV = require('./src/config/mensagemPDV');
const CAMINHOS_SERVER = {
    pdf: '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2026\\3 - MARÇO\\_GERADOR PDF\\ACOMPS\\410\\410_Volume.pdf',
    imagem: '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2026\\3 - MARÇO\\_GERADOR PDF\\IMAGENS\\GV4\\MATINAL_GV4_page_1.jpg'
};

const usuariosAguardandoRelatorio = {};
const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'sessao-principal-v1' }),
    puppeteer: {
        headless: true,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-dev-shm-usage',
            '--js-flags="--max-old-space-size=4096"'
        ]
    }
});

// ============================================================================================
// === PROCESSAMENTO DE MENSAGENS (COM GATILHOS DE ADMIN) ===
// ============================================================================================
async function processUserMessage(message) {
    if (message.from === 'status@broadcast') return;

    const numeroOriginal = message.from;
    const texto = message.body.trim();
    const numeroTelefoneLimpo = numeroOriginal.split('@')[0];

    // 🕵️ DIAGNÓSTICO DE ID (Mostra o LID ou Número no Terminal)
    console.log(chalk.yellow(`\n🔍 [DIAGNÓSTICO] De: ${numeroTelefoneLimpo} | Texto: "${texto}"`));
    if (message._data?.id?.remote) console.log(chalk.gray(`   ID Remoto: ${message._data.id.remote}`));

    // 🚨 1. GATILHOS DE ADMINISTRAÇÃO (Intercepta comandos antes de qualquer lógica)
    if (texto.toLowerCase().startsWith('/aprovar')) {
        const tel = texto.split(' ')[1];
        if (tel) {
            console.log(chalk.magenta(`[ADMIN] Comando /aprovar detectado para: ${tel}`));
            await aprovarTroca(client, message, tel);
        } else {
            await client.sendMessage(numeroOriginal, '❌ Use: /aprovar numero_ou_lid');
        }
        return;
    }

    if (texto.toLowerCase().startsWith('/processar')) {
        const janela = texto.split(' ')[1];
        if (janela) {
            await client.sendMessage(numeroOriginal, `⚙️ Processando janela ${janela}...`);
            await transcricaoService.processarAudiosPendentes();
        }
        return;
    }

    // 2. Busca do Representante (LID + Telefone)
    let representantes = lerJson(CAMINHO_JSON_REAL, []);
    const representante = representantes.find(rep => {
        if (rep.lid && (numeroTelefoneLimpo === String(rep.lid).split('@')[0] || numeroOriginal === rep.lid)) return true;
        const repTel = String(rep.telefone || "").replace(/\D/g, '');
        return numeroTelefoneLimpo.endsWith(repTel) || repTel.endsWith(numeroTelefoneLimpo);
    });

    const dataObj = new Date();
    const dataHoje = `${String(dataObj.getDate()).padStart(2, '0')}/${String(dataObj.getMonth() + 1).padStart(2, '0')}/${dataObj.getFullYear()}`;
    const saudacao = dataObj.getHours() <= 12 ? 'Bom dia' : (dataObj.getHours() <= 18 ? 'Boa tarde' : 'Boa noite');

    // 3. Segurança e Fora da Base
    if (!representante) {
        const etapas = lerJson(ETAPAS_PATH, {});
        if (texto.toUpperCase() === '10' || (etapas[numeroOriginal]?.etapa?.startsWith('troca_setor'))) {
            await processarTroca(client, message, { nome: 'Novo Representante' });
            return;
        }
        let foraDaBase = lerJson(FORA_BASE_PATH, []);
        if (!foraDaBase.some(at => at.id === numeroOriginal && at.data === dataHoje)) {
            await client.sendMessage(numeroOriginal, MENSAGEM_PDV);
            foraDaBase.push({ id: numeroOriginal, telefone: numeroTelefoneLimpo, data: dataHoje });
            fs.writeFileSync(FORA_BASE_PATH, JSON.stringify(foraDaBase, null, 2));
        }
        return;
    }

    // 4. Fluxo de Atendimento
    autoHealingNome(message, representante, representantes, CAMINHO_JSON_REAL);
    const etapas = lerJson(ETAPAS_PATH, {});

    if (etapas[numeroOriginal]?.etapa && etapas[numeroOriginal].etapa !== 'wait') {
        await handleMenu(client, message, representante, numeroTelefoneLimpo, MENU_TEXT, usuariosAguardandoRelatorio);
        return;
    }

    const historicoDeUso = lerJson(LOG_USO_PATH, []);
    const jaAtendido = historicoDeUso.some(log => log.telefone === numeroTelefoneLimpo && log.data === dataHoje);
    if (!jaAtendido && !lerJson(STAFFS_PATH, []).some(s => String(s.telefone) === numeroTelefoneLimpo)) {
        logAcao('SISTEMA', `Iniciando atendimento: ${representante.nome}`);
        await simularHumano(message);
        await client.sendMessage(numeroOriginal, `${saudacao}! Sou o assistente virtual da Tarumã.\n${MENU_TEXT}`);
        await registrarUso(numeroTelefoneLimpo, 'Menu', representante.setor);
        return;
    }

    await handleMenu(client, message, representante, numeroTelefoneLimpo, MENU_TEXT, usuariosAguardandoRelatorio);
}

// ============================================================================================
// === LISTENER OPERADOR (Interações do Yuri via celular) ===
// ============================================================================================
client.on('message_create', async (msg) => {
    if (!msg.fromMe || msg.from === 'status@broadcast') return;
    const body = msg.body.trim().toLowerCase();

    if (body === '/ativar') {
        const res = await enviarMenuAtivacao(client);
        await client.sendMessage(msg.to, `✅ ${res}`);
    } else if (['/rep', '/admin'].some(p => body.startsWith(p))) {
        const args = body.split(' ');
        const num = args[1]?.replace(/\D/g, '');
        const target = (num && num.length >= 10) ? num + '@c.us' : msg.to;
        const cmd = (num && num.length >= 10) ? args.slice(2).join(' ') : args.slice(1).join(' ');
        await processUserMessage({ from: target, body: cmd || 'menu', _operator_triggered: true, getChat: () => msg.getChat() });
    }
    // Caso seja um /aprovar enviado do seu celular, ele cairá no processUserMessage normalmente
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => {
    console.log(chalk.green('✅ Bot conectado e operacional!'));
    iniciarPainel();
    monitorarArquivos(client, usuariosAguardandoRelatorio, CAMINHOS_SERVER, CAMINHO_JSON_REAL);
});

client.on('message', async msg => {
    if (msg.from === 'status@broadcast') return;
    try { await (await msg.getChat()).sendSeen(); } catch (e) {}
    if (!msg.from.endsWith('@g.us')) await processUserMessage(msg);
});

client.initialize();