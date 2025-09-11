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
        const atendidos = lerJson(ATENDIDOS_PATH, []);

        // Usar um Set para busca rápida (muito mais eficiente)
        const contatosAtendidos = new Set(atendidos);

        // Filtrar representantes que não estão na lista de atendidos
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

                // IMPORTANTE: Pausa aleatória para evitar bloqueio por spam.
                // Pausa entre 5 e 10 segundos.
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