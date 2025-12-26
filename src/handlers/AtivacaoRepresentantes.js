// src/handlers/AtivacaoRepresentantes.js (VERSÃO FINAL - SUPORTE LID + PATH SEGURO)

const fs = require('fs');
const path = require('path');

// --- CONFIGURAÇÃO DE CAMINHOS SEGUROS ---
const REPRESENTANTES_PATH = path.join(process.cwd(), 'data', 'representantes.json');
const LOG_USO_PATH = path.join(process.cwd(), 'data', 'log_uso.json');
const STAFFS_PATH = path.join(process.cwd(), 'data', 'staffs.json');

// Tenta carregar o menu de ativação. Se não achar, usa um texto padrão.
let MENU_ATIVO = "Olá! Percebi que você não acessa o bot há alguns dias. Digite 'menu' para ver suas opções.";
try {
    const menuPath = path.join(process.cwd(), 'src', 'config', 'menuOptionsAtivo.js');
    if (fs.existsSync(menuPath)) {
        MENU_ATIVO = require(menuPath);
    }
} catch (e) {
    console.error('Erro ao carregar menuOptionsAtivo:', e);
}

// Função auxiliar para ler JSON
function lerJsonSeguro(caminho) {
    try {
        if (fs.existsSync(caminho)) {
            return JSON.parse(fs.readFileSync(caminho, 'utf-8'));
        }
    } catch (e) {
        console.error(`Erro ao ler JSON ${caminho}:`, e);
    }
    return [];
}

/**
 * Envia uma mensagem de ativação para representantes inativos.
 */
async function enviarMenuAtivacao(client) {
    console.log('[ATIVACAO]: Iniciando processo de ativação por inatividade...');

    try {
        const representantes = lerJsonSeguro(REPRESENTANTES_PATH);
        const logUso = lerJsonSeguro(LOG_USO_PATH);
        const staffs = lerJsonSeguro(STAFFS_PATH);

        // =======================================================================
        // === LÓGICA DE FILTRAGEM ===
        // =======================================================================

        // 1. Define a data limite (7 dias atrás)
        const seteDiasAtras = new Date();
        seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
        seteDiasAtras.setHours(0, 0, 0, 0);

        // 2. Mapeia setores ativos recentemente
        const setoresAtivosRecentemente = new Set();
        for (const log of logUso) {
            if (log.timestamp) {
                const dataLog = new Date(log.timestamp);
                if (dataLog >= seteDiasAtras) {
                    setoresAtivosRecentemente.add(String(log.setor));
                }
            }
        }
        
        console.log(`[ATIVACAO]: ${setoresAtivosRecentemente.size} setores estiveram ativos nos últimos 7 dias.`);

        // 3. Mapeia telefones da staff (para ignorar)
        // Removemos caracteres não numéricos para garantir a comparação
        const staffPhones = new Set(staffs.map(staff => String(staff.telefone).replace(/\D/g, '')));

        // 4. Filtra os alvos
        const alvos = representantes.filter(rep => {
            if (!rep.telefone) return false;

            const telefoneLimpo = String(rep.telefone).replace(/\D/g, '');
            
            // Condição 1: O setor do representante está inativo?
            // (Se o setor não está na lista de ativos, então está inativo)
            const isInactive = !setoresAtivosRecentemente.has(String(rep.setor));
            
            // Condição 2: O representante NÃO é staff?
            const isNotStaff = !staffPhones.has(telefoneLimpo);
            
            return isInactive && isNotStaff;
        });

        // =======================================================================

        if (alvos.length === 0) {
            console.log('[ATIVACAO]: Nenhum representante inativo encontrado.');
            return "Nenhum representante inativo para ativar. Todos interagiram recentemente ou são staff!";
        }

        console.log(`[ATIVACAO]: ${alvos.length} representantes inativos encontrados.`);

        let contadorEnvios = 0;

        for (const rep of alvos) {
            // --- LÓGICA HÍBRIDA DE DESTINO (A Correção Principal) ---
            // Se tiver LID salvo no JSON, usa o LID. Se não, usa o telefone@c.us
            let idDestino;
            
            if (rep.lid) {
                idDestino = rep.lid;
            } else {
                const telefoneLimpo = String(rep.telefone).replace(/\D/g, '');
                idDestino = `${telefoneLimpo}@c.us`;
            }
            
            try {
                console.log(`[ATIVACAO] Enviando para ${rep.nome || 'Sem Nome'} (Setor ${rep.setor}). ID: ${idDestino}`);
                
                await client.sendMessage(idDestino, MENU_ATIVO);
                contadorEnvios++;

                // Delay de segurança para evitar banimento (5 a 10 segundos)
                const delay = Math.floor(Math.random() * 1) + 1; 
                await new Promise(resolve => setTimeout(resolve, delay));

            } catch (error) {
                console.error(`[ATIVACAO] Falha ao enviar para ${idDestino}:`, error.message);
            }
        }
        
        return `Campanha concluída. Mensagens enviadas para ${contadorEnvios} de ${alvos.length} representantes.`;

    } catch (error) {
        console.error('[ATIVACAO]: Erro crítico:', error);
        return 'Ocorreu um erro grave ao executar a campanha.';
    }
}

module.exports = enviarMenuAtivacao;