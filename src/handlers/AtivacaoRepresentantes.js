// const fs = require('fs'); // <-- REMOVIDO: Não vamos mais escrever em arquivos aqui.

// ALTERADO: Adicionado LOG_USO_PATH e removido ATENDIDOS_PATH
const { lerJson, REPRESENTANTES_PATH, LOG_USO_PATH } = require('../utils/dataHandler.js'); 
const MENU_ATIVO = require('../config/menuOptionsAtivo.js');

/**
 * Envia uma mensagem de ativação para todos os representantes que não interagiram com o bot nos últimos 3 dias.
 * @param {import('whatsapp-web.js').Client} client O cliente do WhatsApp.
 * @returns {Promise<string>} Uma mensagem de resultado da operação.
 */
async function enviarMenuAtivacao(client) {
    console.log('[ATIVACAO]: Iniciando processo de ativação por inatividade...');

    try {
        const representantes = lerJson(REPRESENTANTES_PATH, []);
        // NOVO: Carrega a lista de logs de uso
        const logUso = lerJson(LOG_USO_PATH, []);

        // =======================================================================
        // === NOVA LÓGICA DE FILTRAGEM ==========================================
        // =======================================================================

        // 1. Define a data limite (7 dias atrás)
        const seteDiasAtras = new Date();
        seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
        seteDiasAtras.setHours(0, 0, 0, 0); // Zera o horário para comparar apenas a data

        // 2. Cria um conjunto com os setores que tiveram atividade recente
        const setoresAtivosRecentemente = new Set();
        for (const log of logUso) {
            const dataLog = new Date(log.timestamp);
            if (dataLog >= seteDiasAtras) {
                // Adiciona o setor do log ao conjunto de setores ativos
                setoresAtivosRecentemente.add(log.setor);
            }
        }
        
        console.log(`[ATIVACAO]: ${setoresAtivosRecentemente.size} setores estiveram ativos nos últimos 3 dias.`);

        // 3. Filtra os representantes que NÃO estão no conjunto de setores ativos
        const alvos = representantes.filter(rep => {
            // A condição agora é: o setor do representante NÃO PODE estar na lista de ativos
            // É FUNDAMENTAL que o objeto 'rep' tenha a propriedade 'setor'
            return !setoresAtivosRecentemente.has(rep.setor);
        });

        // =======================================================================

        if (alvos.length === 0) {
            console.log('[ATIVACAO]: Nenhum representante inativo para ativar.');
            return "Nenhum representante inativo para ativar. Todos interagiram nos últimos 3 dias!";
        }

        console.log(`[ATIVACAO]: ${alvos.length} representantes inativos serão notificados.`);

        let contadorEnvios = 0;
        for (const rep of alvos) {
            // Verifica se o representante tem um telefone válido antes de prosseguir
            if (!rep.telefone) {
                console.warn(`- Representante '${rep.nome}' (setor ${rep.setor}) sem número de telefone. Pulando.`);
                continue;
            }

            const numero = `${rep.telefone}@c.us`;
            
            try {
                await client.sendMessage(numero, MENU_ATIVO);
                console.log(`- Mensagem de ativação enviada para: ${rep.nome} (Setor: ${rep.setor}, Tel: ${numero})`);
                contadorEnvios++;

                // =======================================================================
                // === LÓGICA DE ESCRITA REMOVIDA ========================================
                // Não precisamos mais adicionar o usuário a uma lista de "atendidos",
                // pois a verificação é feita dinamicamente pelo log de uso.
                // =======================================================================

                const delay = Math.floor(Math.random() * 5000) + 5000; // Delay entre 5 e 10 segundos
                await new Promise(resolve => setTimeout(resolve, delay));

            } catch (error) {
                console.error(`- Falha ao enviar para ${rep.nome} (${numero}):`, error.message);
            }
        }
        
        return `Campanha de ativação concluída. ${contadorEnvios} de ${alvos.length} representantes inativos foram notificados.`;

    } catch (error) {
        console.error('[ATIVACAO]: Erro crítico durante a campanha de ativação:', error);
        return 'Ocorreu um erro grave ao executar a campanha. Verifique os logs do console.';
    }
}

module.exports = enviarMenuAtivacao;