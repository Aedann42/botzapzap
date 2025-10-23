// lembretePonto.js
const dataHandler = require('../utils/dataHandler'); // Caminho para o seu Data Handler
const path = require('path');

// --- Configurações ---
// ARRAY DE SETORES A SEREM NOTIFICADOS (os números devem ser inteiros)
const SETORES_ALVO = [
    100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 
    200, 201, 202, 203, 204, 205, 2081
]; 

// --- Configurações de Grupos ---
// *ATENÇÃO*: Você deve preencher com os IDs de chat dos seus grupos.
const GRUPOS_LEMBRETE = [
    "553299420108-1631382900@g.us", // Sala 2 - SEGMENTADA
    "553299775821-1469118698@g.us", // 🍻*SALA 01 JF*🍻
];
// ... (FRASES_LEMBRETE e escolherMensagem)

/**
 * Função principal para disparar os lembretes do ponto.
 * * @param {object} client - O cliente do WhatsApp (para enviar a mensagem).
 * @param {string} horario - O horário que está sendo lembrado ('7:55', '12:00', etc.).
 */
module.exports = async (client, horario) => {
    console.log(`[AGENDADOR] Iniciando lembrete de ponto para o horário: ${horario}`);
    
    // 1. Carrega e prepara a mensagem
    const mensagemFinal = escolherMensagem(horario);
    
    // --- PARTE 1: Envio para Representantes Individuais (RNs) ---
    const representantes = dataHandler.lerJson(dataHandler.REPRESENTANTES_PATH, []);
    
    if (Array.isArray(representantes) && representantes.length > 0) {
        const representantesFiltrados = representantes.filter(rep => {
            const setor = parseInt(rep.setor, 10);
            return SETORES_ALVO.includes(setor);
        });

        console.log(`[AGENDADOR] Enviando lembrete individual para ${representantesFiltrados.length} RNs.`);

        for (const rep of representantesFiltrados) {
            const telefone = rep.telefone.replace(/\D/g, '') + "@c.us";
            
            try {
                await client.sendMessage(telefone, mensagemFinal);
                console.log(`[AGENDADOR] ✅ Lembrete enviado para: ${rep.telefone}`);
                await new Promise(resolve => setTimeout(resolve, 500)); 
            } catch (error) {
                console.error(`[AGENDADOR] ❌ Erro ao enviar para ${rep.telefone}:`, error.message);
            }
        }
    } else {
         console.warn('[AGENDADOR] Nenhum representante carregado ou array vazio. Pulando envio individual.');
    }
    
    // --- PARTE 2: Envio para Grupos de Aviso ---
    if (GRUPOS_LEMBRETE.length > 0) {
        console.log(`[AGENDADOR] Enviando lembrete para ${GRUPOS_LEMBRETE.length} grupos.`);

        for (const grupoId of GRUPOS_LEMBRETE) {
            try {
                // Adicionando um pequeno atraso antes de começar o envio para grupos, se necessário
                await new Promise(resolve => setTimeout(resolve, 1000)); 
                
                await client.sendMessage(grupoId, mensagemFinal);
                console.log(`[AGENDADOR] ✅ Lembrete enviado para o Grupo ID: ${grupoId}`);
            } catch (error) {
                console.error(`[AGENDADOR] ❌ Erro ao enviar para o Grupo ID ${grupoId}:`, error.message);
            }
        }
    } else {
        console.warn('[AGENDADOR] Nenhum ID de grupo configurado. Pulando envio para grupos.');
    }

    console.log(`[AGENDADOR] Finalizado disparo de lembretes para ${horario}.`);
};