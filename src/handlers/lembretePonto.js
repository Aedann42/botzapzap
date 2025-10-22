// lembretePonto.js
const dataHandler = require('../utils/dataHandler'); // Caminho para o seu Data Handler
const path = require('path');

// --- Configurações ---
const SETOR_INICIAL = 100;
const SETOR_FINAL = 199;

// Array com frases bem-humoradas para cada horário
const FRASES_LEMBRETE = {
    '7:55': [
        "Café na mão, crachá no sensor! ☕ Não deixe o ponto te esquecer logo no início da jornada. #PontoBatidoÉPazGarantida",
        "O despertador tocou, a coragem veio, mas o ponto... já lembrou dele? ⏰ Início da jornada, bora registrar!",
        "7:55! Sua missão, caso aceite: carimbar o ponto e começar a vender. 🚀 Não estrague o dia por 5 segundos.",
        "Acelera, RN! A jornada de trabalho está oficialmente começando. Bate o ponto antes que ele te denuncie. 😉",
        "Seu dedo indicador tem um compromisso importantíssimo agora: o leitor de ponto! 👈 Bom dia e bom registro!",
        "O ponto é o seu melhor amigo. Lembre-se dele antes de abrir o primeiro e-mail. 7:55!",
        "Antes que a loucura do dia comece, marque a chegada! Seu futuro RH agradece. 😜",
        "O tempo voa! Mas o ponto deve ser batido a pé, não voando. Início da jornada!",
        "Se o sistema te perguntar, diga: 'Sim, estou aqui e pronto pra batalha!' Bate o ponto!",
        "7:55, a hora mágica de provar que você não é um fantasma. Registre sua presença!",
    ],
    '12:00': [
        "A fome é real, o descanso é merecido, mas o ponto é *obrigatório*! 🍔 Saída para o almoço, bora marcar!",
        "Pode ir buscar o prato, mas só depois de ouvir o 'BIP' do ponto. 12h: Saída pro almoço!",
        "Seu estômago te avisa, o ponto te cobra. Prioridade: registrar a saída para o almoço!",
        "Alerta de pausa! Antes do arroz e feijão, lembre do seu papel e do ponto. 😉",
        "Mãos livres para o garfo, mas antes, uma última missão: bater o ponto de saída!",
        "O cronômetro para o almoço zerou. Saída! Ponto no 12, pra não ter dor de cabeça no 13.",
    ],
    '13:00': [
        "Hora de voltar à batalha! 💪 O café já fez efeito, agora registre o retorno do almoço. 13h!",
        "O ponto está piscando, esperando o seu retorno triunfal do mundo do almoço. Não o decepcione. 😉",
        "Seu retorno é importante (e deve ser registrado)! 13h em ponto: Retorno do Almoço!",
        "Esqueceu o que ia fazer? Comece batendo o ponto de retorno. Prioridade máxima!",
        "Recarregado e pronto! O ponto é o primeiro a saber do seu retorno. 🚀",
    ],
    '17:45': [
        "Quase lá! Mas antes da liberdade, a formalidade. 🔑 Encerramento da jornada, bata o ponto!",
        "Luzes se apagando, mas o ponto está aceso! 17:45: Registro de encerramento, bora lá!",
        "Seu descanso começa depois que o ponto registra o fim da sua jornada. Não vá embora sem dar 'tchau' pro sistema!",
        "Missão cumprida! Agora, o último 'BIP' do dia. 🏁 Bate o ponto de encerramento.",
        "Resistência final: não se esqueça do ponto de saída! Ele é a prova do seu esforço. 😉",
        "Parabéns pelo dia! Seu dedo sabe o caminho. Bater o ponto e ir curtir o merecido descanso.",
    ]
};

/**
 * Seleciona uma frase aleatória para o horário especificado.
 * @param {string} horario - '7:55', '12:00', '13:00', '17:45'.
 * @returns {string} Mensagem de lembrete formatada.
 */
function escolherMensagem(horario) {
    const frases = FRASES_LEMBRETE[horario];
    if (!frases || frases.length === 0) {
        return `Atenção! Lembrete de ponto para ${horario}.`;
    }
    const fraseAleatoria = frases[Math.floor(Math.random() * frases.length)];
    
    // Formatação da ação principal
    let acao = '';
    switch (horario) {
        case '7:55':
            acao = 'Bater início da jornada de trabalho';
            break;
        case '12:00':
            acao = 'Saída para o almoço';
            break;
        case '13:00':
            acao = 'Retorno do Almoço';
            break;
        case '17:45':
            acao = 'Bater ponto de encerramento da jornada de trabalho';
            break;
    }
    
    return `*Lembrete de Ponto - ${horario}*\n\n👉 *Ação:* ${acao}\n\n💬 _"${fraseAleatoria}"_`;
}

/**
 * Função principal para disparar os lembretes do ponto para os setores definidos.
 * Esta função deve ser chamada por um agendador externo (como node-cron).
 * * @param {object} client - O cliente do WhatsApp (para enviar a mensagem).
 * @param {string} horario - O horário que está sendo lembrado ('7:55', '12:00', etc.).
 */
module.exports = async (client, horario) => {
    console.log(`[AGENDADOR] Iniciando lembrete de ponto para o horário: ${horario}`);
    
    // Carrega o arquivo de representantes
    const representantes = dataHandler.lerJson(dataHandler.REPRESENTANTES_PATH, []);
    
    if (!Array.isArray(representantes) || representantes.length === 0) {
        console.error('[AGENDADOR] Não foi possível carregar representantes.json ou ele está vazio.');
        return;
    }

    // 1. Filtra os representantes pelos setores 100 a 199
    const representantesFiltrados = representantes.filter(rep => {
        const setor = parseInt(rep.setor, 10);
        return setor >= SETOR_INICIAL && setor <= SETOR_FINAL;
    });

    if (representantesFiltrados.length === 0) {
        console.log(`[AGENDADOR] Nenhum representante encontrado na faixa de setores ${SETOR_INICIAL}-${SETOR_FINAL}.`);
        return;
    }

    // 2. Monta a mensagem final
    const mensagemFinal = escolherMensagem(horario);
    
    console.log(`[AGENDADOR] Enviando lembrete para ${representantesFiltrados.length} RNs.`);

    // 3. Dispara as mensagens
    for (const rep of representantesFiltrados) {
        const telefone = rep.telefone.replace(/\D/g, '') + "@c.us"; // Garante o formato correto
        
        try {
            await client.sendMessage(telefone, mensagemFinal);
            console.log(`[AGENDADOR] ✅ Lembrete enviado para: ${rep.telefone}`);
            
            // Adicione um pequeno atraso para evitar ser bloqueado pelo WhatsApp
            await new Promise(resolve => setTimeout(resolve, 500)); 
            
        } catch (error) {
            console.error(`[AGENDADOR] ❌ Erro ao enviar para ${rep.telefone}:`, error.message);
        }
    }

    console.log(`[AGENDADOR] Finalizado disparo de lembretes para ${horario}.`);
};