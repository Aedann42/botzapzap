// ALTERADO: Adicionado STAFFS_PATH
const { lerJson, REPRESENTANTES_PATH, LOG_USO_PATH, STAFFS_PATH } = require('../utils/dataHandler.js'); 
const MENU_ATIVO = require('../config/menuOptionsAtivo.js');

/**
 * Envia uma mensagem de ativação para todos os representantes que não interagiram com o bot nos últimos dias.
 * @param {import('whatsapp-web.js').Client} client O cliente do WhatsApp.
 * @returns {Promise<string>} Uma mensagem de resultado da operação.
 */
async function enviarMenuAtivacao(client) {
    console.log('[ATIVACAO]: Iniciando processo de ativação por inatividade...');

    try {
        const representantes = lerJson(REPRESENTANTES_PATH, []);
        const logUso = lerJson(LOG_USO_PATH, []);
        // NOVO: Carrega a lista de staffs
        const staffs = lerJson(STAFFS_PATH, []);

        // =======================================================================
        // === LÓGICA DE FILTRAGEM ATUALIZADA ====================================
        // =======================================================================

        // 1. Define a data limite (7 dias atrás, conforme seu código)
        // NOTA: Seus logs mencionam 3 dias, mas o código usa 7. Ajustei para 7.
        const seteDiasAtras = new Date();
        seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
        seteDiasAtras.setHours(0, 0, 0, 0);

        // 2. Cria um conjunto com os setores que tiveram atividade recente
        const setoresAtivosRecentemente = new Set();
        for (const log of logUso) {
            const dataLog = new Date(log.timestamp);
            if (dataLog >= seteDiasAtras) {
                setoresAtivosRecentemente.add(String(log.setor)); // Converte para String para garantir a comparação
            }
        }
        
        console.log(`[ATIVACAO]: ${setoresAtivosRecentemente.size} setores estiveram ativos nos últimos 7 dias.`);

        // NOVO: Cria um conjunto com os telefones da staff para uma verificação rápida e eficiente
        const staffPhones = new Set(staffs.map(staff => String(staff.telefone)));

        // 3. Filtra os representantes que estão inativos E NÃO são staffs
        const alvos = representantes.filter(rep => {
            // Condição 1: O setor do representante está inativo?
            const isInactive = !setoresAtivosRecentemente.has(String(rep.setor));
            
            // Condição 2: O representante NÃO é um membro da staff?
            const isNotStaff = !staffPhones.has(String(rep.telefone));
            
            // Ambas as condições precisam ser verdadeiras para ele ser um alvo
            return isInactive && isNotStaff;
        });

        // =======================================================================

        if (alvos.length === 0) {
            console.log('[ATIVACAO]: Nenhum representante inativo (que não seja staff) para ativar.');
            return "Nenhum representante inativo para ativar. Todos interagiram nos últimos 7 dias ou são membros da staff!";
        }

        console.log(`[ATIVACAO]: ${alvos.length} representantes inativos (não-staffs) serão notificados.`);

        let contadorEnvios = 0;
        for (const rep of alvos) {
            if (!rep.telefone) {
                console.warn(`- Representante '${rep.nome || 'Sem Nome'}' (setor ${rep.setor}) sem número de telefone. Pulando.`);
                continue;
            }

            const numero = `${rep.telefone}@c.us`;
            
            try {
                await client.sendMessage(numero, MENU_ATIVO);
                console.log(`- Mensagem de ativação enviada para: ${rep.nome} (Setor: ${rep.setor}, Tel: ${numero})`);
                contadorEnvios++;

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