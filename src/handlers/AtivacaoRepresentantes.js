const fs = require('fs'); // <-- ADICIONADO: Módulo para escrever no arquivo
const { lerJson, REPRESENTANTES_PATH, ATENDIDOS_PATH } = require('../utils/dataHandler.js');
const MENU_ATIVO = require('../config/menuOptionsAtivo.js');

/**
 * Envia uma mensagem de ativação para todos os representantes que ainda não interagiram com o bot.
 * @param {import('whatsapp-web.js').Client} client O cliente do WhatsApp.
 * @returns {Promise<string>} Uma mensagem de resultado da operação.
 */
async function enviarMenuAtivacao(client) {
    console.log('[ATIVACAO]: Iniciando processo de ativação...');

    try {
        const representantes = lerJson(REPRESENTANTES_PATH, []);
        const atendidos = lerJson(ATENDIDOS_PATH, []); // Carrega a lista atual de atendidos

        const contatosAtendidos = new Set(atendidos);

        const alvos = representantes.filter(rep => {
            const numeroCompleto = `${rep.telefone}@c.us`;
            return !contatosAtendidos.has(numeroCompleto);
        });

        if (alvos.length === 0) {
            console.log('[ATIVACAO]: Nenhum representante novo para ativar.');
            return "Nenhum representante novo para ativar. Todos já interagiram com o bot!";
        }

        console.log(`[ATIVACAO]: ${alvos.length} representantes serão ativados.`);

        let contadorEnvios = 0;
        for (const rep of alvos) {
            const numero = `${rep.telefone}@c.us`;
            
            try {
                await client.sendMessage(numero, MENU_ATIVO);
                console.log(`- Mensagem de ativação enviada para: ${rep.nome} (${numero})`);
                contadorEnvios++;

                // =======================================================================
                // === CORREÇÃO ADICIONADA AQUI ===
                // Adiciona o número à lista de atendidos em memória
                atendidos.push(numero);
                // Salva a lista atualizada no arquivo JSON
                fs.writeFileSync(ATENDIDOS_PATH, JSON.stringify(atendidos, null, 2));
                console.log(`- Usuário ${numero} adicionado a atendidos.json.`);
                // =======================================================================

                const delay = Math.floor(Math.random() * 5000) + 5000;
                await new Promise(resolve => setTimeout(resolve, delay));

            } catch (error) {
                console.error(`- Falha ao enviar para ${rep.nome} (${numero}):`, error.message);
            }
        }
        
        return `Campanha de ativação concluída. ${contadorEnvios} de ${alvos.length} representantes foram notificados.`;

    } catch (error) {
        console.error('[ATIVACAO]: Erro crítico durante a campanha de ativação:', error);
        return 'Ocorreu um erro grave ao executar a campanha. Verifique os logs do console.';
    }
}

module.exports = enviarMenuAtivacao;