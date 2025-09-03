// src/services/lembreteAgua.js

// --- MÓDULOS NATIVOS PARA MANIPULAR ARQUIVOS E CAMINHOS ---
const fs = require('fs');
const path = require('path');

// --- CAMINHO ABSOLUTO E SEGURO PARA O ARQUIVO DE LOG ---
// Não importa de onde este script seja chamado, o caminho sempre estará correto.
const LOG_USO_PATH = path.join(__dirname, '..', '..', 'logs', 'log_uso.json');

// --- FUNÇÕES LOCAIS PARA LER E ESCREVER NO LOG (Substituindo dataHandler) ---
function lerLogUso() {
    try {
        if (fs.existsSync(LOG_USO_PATH)) {
            const data = fs.readFileSync(LOG_USO_PATH, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('[LEMBRETE DE ÁGUA] Erro ao ler ou parsear o arquivo de log:', error);
    }
    return []; // Retorna um array vazio se o arquivo não existir ou der erro
}

function registrarNoLog(acao) {
    const logCompleto = lerLogUso();
    logCompleto.push({
        // Adicionamos um identificador claro de quem gerou o log
        numero: 'BOT_AGUA', 
        nome: 'Sistema de Lembretes',
        setor: 'N/A',
        acao: acao,
        timestamp: new Date().toISOString()
    });
    try {
        fs.writeFileSync(LOG_USO_PATH, JSON.stringify(logCompleto, null, 2));
    } catch (error) {
        console.error('[LEMBRETE DE ÁGUA] Erro ao escrever no arquivo de log:', error);
    }
}


// --- CONFIGURAÇÕES DO LEMBRETE ---
const NUMEROS_DESTINO_AGUA = [
    '553288556411@c.us',
    '553299447900@c.us',
    //'553298374229@@c.us'
    ];

    const TOTAL_LEMBRETES_POR_DIA = 10;
const HORA_INICIO = 8;
const HORA_FIM = 22;
const MINUTOS_INTERVALO_MINIMO = 30;

// --- MENSAGENS CARINHOSAS ---
const MENSAGENS_AGUA = [
    "Ei! Uma pausa para se hidratar. Seu corpo agradece! 😊💧",
    "Só passando pra lembrar de uma coisa importante: beber água! ✨ Cuide-se bem.",
    "Hora do lembrete mais saudável do dia! Um copo d'água agora vai te fazer um bem danado. 💪",
    "Psiu... já bebeu água? Não se esqueça de você! ❤️💧",
    "Que tal dar um gole d'água? Manter-se hidratado(a) melhora tudo! 😉",
    "Lembrete carinhoso: a água é sua melhor amiga. Beba um pouco! 💧😊",
    "Seu futuro eu vai agradecer por este copo d'água que você vai beber agora. ✨"
];

function getMensagemAleatoriaAgua() {
    const indice = Math.floor(Math.random() * MENSAGENS_AGUA.length);
    return MENSAGENS_AGUA[indice];
}

function iniciarLembretesDeAgua(client) {
    console.log('💧 Iniciando o agendador de lembretes de hidratação...');

    const verificarEAgendarLembrete = async () => {
        const agora = new Date();
        const horaAtual = agora.getHours();

        if (horaAtual < HORA_INICIO || horaAtual >= HORA_FIM) {
            console.log(`[LEMBRETE DE ÁGUA] Fora do horário. Próxima verificação em 30 min.`);
            setTimeout(verificarEAgendarLembrete, 30 * 60 * 1000);
            return;
        }

        // Usando a nova função local para ler o log
        const logUso = lerLogUso();
        const logLembretesAgua = logUso.filter(log => log.acao === 'Lembrete de Água Enviado');
        const hojeString = agora.toISOString().slice(0, 10);
        const lembretesEnviadosHoje = logLembretesAgua.filter(log => log.timestamp.startsWith(hojeString)).length;

        if (lembretesEnviadosHoje >= TOTAL_LEMBRETES_POR_DIA) {
            console.log(`[LEMBRETE DE ÁGUA] Meta diária atingida. Aguardando próximo dia.`);
            const amanha = new Date();
            amanha.setDate(amanha.getDate() + 1);
            amanha.setHours(HORA_INICIO, 0, 0, 0);
            const tempoAteAmanha = amanha.getTime() - agora.getTime();
            setTimeout(verificarEAgendarLembrete, tempoAteAmanha > 0 ? tempoAteAmanha : 30 * 60 * 1000);
            return;
        }

        let minutosDesdeUltimo = Infinity;
        if (logLembretesAgua.length > 0) {
            const ultimoLembrete = logLembretesAgua[logLembretesAgua.length - 1];
            const timestampUltimo = new Date(ultimoLembrete.timestamp);
            minutosDesdeUltimo = (agora.getTime() - timestampUltimo.getTime()) / (1000 * 60);
        }

        if (minutosDesdeUltimo < MINUTOS_INTERVALO_MINIMO) {
            const tempoRestanteMs = (MINUTOS_INTERVALO_MINIMO - minutosDesdeUltimo) * 60 * 1000;
            console.log(`[LEMBRETE DE ÁGUA] Último envio foi há ${minutosDesdeUltimo.toFixed(1)} min. Próxima verificação em ${(tempoRestanteMs / 60000).toFixed(1)} min.`);
            setTimeout(verificarEAgendarLembrete, tempoRestanteMs > 0 ? tempoRestanteMs + 1000 : 1000);
            return;
        }

        try {
            const mensagem = getMensagemAleatoriaAgua();
            console.log(`\n[LEMBRETE DE ÁGUA] Disparando lembrete ${lembretesEnviadosHoje + 1}/${TOTAL_LEMBRETES_POR_DIA}...`);
            for (const numero of NUMEROS_DESTINO_AGUA) {
                try {
                    await client.sendMessage(numero, mensagem);
                    console.log(`[LEMBRETE DE ÁGUA] 🚀 Mensagem enviada com sucesso para ${numero}`);
                } catch (error) {
                    console.error(`[LEMBRETE DE ÁGUA] ❌ Erro ao enviar para ${numero}: ${error.message}`);
                }
            }
            
            // Usando a nova função local para registrar no log
            registrarNoLog('Lembrete de Água Enviado');
            console.log('[LOG] Ação de lembrete de água registrada com sucesso.');
        } catch (error) {
            console.error(`[LEMBRETE DE ÁGUA] ❌ Erro no processo de envio: ${error.message}`);
        } finally {
            const proximoDelayMs = (MINUTOS_INTERVALO_MINIMO * 60 * 1000) + (Math.random() * MINUTOS_INTERVALO_MINIMO * 60 * 1000);
            const proximaData = new Date(Date.now() + proximoDelayMs);
            console.log(`[LEMBRETE DE ÁGUA] Envio concluído. Próxima verificação agendada para ${proximaData.toLocaleTimeString('pt-BR')}`);
            setTimeout(verificarEAgendarLembrete, proximoDelayMs);
        }
    };

    setTimeout(verificarEAgendarLembrete, 2000);
}

module.exports = iniciarLembretesDeAgua;