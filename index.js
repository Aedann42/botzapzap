const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

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
        // Opcional: recriar arquivo com valor padrão se houver erro de parsing
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
        // Não envia mensagem para números não autorizados por segurança
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

        const menuOpcoes = `
🌟 Escolha uma opção abaixo para que eu possa te ajudar: 🌟

1️⃣ - Quero meus relatórios em PDF 📄✨
2️⃣ - Quero meus relatórios em imagens 🖼️🎨
3️⃣ - Preciso de ajuda do APR para demais assuntos 💬🤔
4️⃣ - Quero minha planilha de remuneração 💼💰
5️⃣ - Consultar tarefas do PDV 📋🔍
6️⃣ - Consultar a lista de telefones úteis Tarumã 😶‍🌫️
`;

        await client.sendMessage(
            message.from,
            `${saudacaoBase}! ${saudacaoAleatoria}\n${menuOpcoes}`
        );

        atendidos.push(numero);
        fs.writeFileSync(ATENDIDOS_PATH, JSON.stringify(atendidos, null, 2));
        return; // Sai da função para aguardar a próxima mensagem do usuário
    }

    const opcao = message.body.trim();

    let etapas = lerJson(ETAPAS_PATH, {});

    // --- Gerenciamento de Etapas Ativas (Fluxos de Conversação) ---
    // Verifica se o usuário está em um fluxo específico (ex: aguardando matrícula, código PDV)
    if (etapas[numero] && etapas[numero].etapa) {
        const etapaAtual = etapas[numero].etapa;

        try {
            if (etapaAtual === 'pdv') {
                await enviarResumoPDV(client, message);
                delete etapas[numero]; // Finaliza a etapa após o envio/processamento
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
                return;
            }

            if (etapaAtual === 'remuneracao') {
                // enviarRemuneracao lida com a lógica de pedir matrícula e enviar o PDF.
                // Ela mesma se encarrega de deletar a etapa após a conclusão ou erro.
                await enviarRemuneracao(client, message);
                return;
            }

            if (etapaAtual === 'aguardandoEscolha') { // Exemplo de outra etapa
                await enviarListaContatos(client, message);
                delete etapas[numero]; // Finaliza a etapa
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
                return;
            }
        } catch (error) {
            console.error(`Erro ao processar etapa "${etapaAtual}" para ${numero}:`, error);
            await client.sendMessage(numero, '❌ Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.');
            delete etapas[numero]; // Limpa a etapa em caso de erro para evitar travamento
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            return;
        }
    }

    // --- Gerenciamento das Opções do Menu Principal (quando não há etapa ativa) ---
    switch (opcao.toLowerCase()) { // Converte para minúsculas para aceitar "Menu", "menu", etc.
        case '1':
            await enviarRelatoriosPdf(client, message);
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas; // Reseta contador de erros
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
            // Define a etapa para 'remuneracao' e pede a matrícula
            etapas[numero] = { etapa: 'remuneracao' };
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await client.sendMessage(message.from, 'Por favor, informe sua *matrícula* para continuar, lembrando que só pode ter os números na próxima mensagem!');
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
            break;
        case '5':
            // Define a etapa para 'pdv' e pede o código
            await client.sendMessage(message.from, 'Por favor, envie o código do PDV que deseja consultar as tarefas!');
            etapas[numero] = { etapa: 'pdv' };
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
            break;
        case '6':
            await enviarListaContatos(client, message);
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas;
            break;
        case 'menu': // Permite ao usuário solicitar o menu novamente
            const hora = new Date().getHours();
            const saudacaoBase = hora <= 12 ? 'Bom dia' : 'Boa tarde';
            const saudacoesAlternativas = [
                'Tudo certo por aí?', 'Como vai você?', 'Tudo bem por aí?',
                'Espero que esteja tudo em ordem.', 'Como posso ajudar?',
                'Fico feliz em receber sua mensagem.', 'É um prazer falar com você.',
                'Estou à disposição para ajudar.', 'O que mandas?', 'Que bom receber seu contato.'
            ];
            const saudacaoAleatoria = saudacoesAlternativas[Math.floor(Math.random() * saudacoesAlternativas.length)];

            const menuOpcoes = `
🌟 Escolha uma opção abaixo para que eu possa te ajudar: 🌟

1️⃣ - Quero meus relatórios em PDF 📄✨
2️⃣ - Quero meus relatórios em imagens 🖼️🎨
3️⃣ - Preciso de ajuda do APR para demais assuntos 💬🤔
4️⃣ - Quero minha planilha de remuneração 💼💰
5️⃣ - Consultar tarefas do PDV 📋🔍
6️⃣ - Consultar a lista de telefones úteis Tarumã 😶‍🌫️

Digite MENU a qualquer momento para receber novamente essa mensagem`;
            await client.sendMessage(
                message.from,
                `${saudacaoBase}! ${saudacaoAleatoria}\n${menuOpcoes}`
            );
            if (etapas[numero]) delete etapas[numero].tentativasInvalidas; // Reseta após mostrar o menu
            break;
        default:
    // Garante que o objeto de etapas para o número exista
    if (!etapas[numero]) {
        etapas[numero] = {};
    }

    // Se o usuário está fora de uma etapa ativa, mandamos apenas UMA VEZ a mensagem de "menu"
    if (!etapas[numero].menuAvisado) {
        await client.sendMessage(message.from, '❓ Não entendi. Digite *menu* para ver as opções.');
        etapas[numero].menuAvisado = true;
        fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
    } else {
        console.log(`Ignorando repetição de aviso "menu" para ${numero}`);
    }
    break;

    }
});

// --- Inicialização do Cliente WhatsApp ---
client.initialize();

// --- Eventos de Estado do Cliente (para monitoramento) ---
client.on('disconnected', reason => {
    console.error('⚠️ Cliente desconectado:', reason);
    process.exit(1); // Encerra o processo em caso de desconexão grave
});

client.on('auth_failure', msg => {
    console.error('❌ Falha na autenticação:', msg);
    process.exit(1); // Encerra o processo em caso de falha de autenticação
});

client.on('change_state', state => {
    console.log('🔄 Estado do cliente mudou para:', state);
});

client.on('loading_screen', (percent, message) => {
    console.log(`⏳ Carregando... ${percent}% - ${message}`);
});