// src/utils/dataHandler.js
const fs = require('fs');
const path = require('path');

// --- Caminhos dos Arquivos de Dados ---
// Ajuste de navegação: src > utils > (..) src > (..) root > data
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
// Se a pasta logs não existir, o node pode dar erro ao salvar, então vamos garantir o caminho
const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');

const REPRESENTANTES_PATH = path.join(DATA_DIR, 'representantes.json');
const ETAPAS_PATH = path.join(DATA_DIR, 'etapas.json');
const ATENDIDOS_PATH = path.join(DATA_DIR, 'atendidos.json');
const LOG_USO_PATH = path.join(LOGS_DIR, 'log_uso.json');
const STAFFS_PATH = path.join(DATA_DIR, 'staffs.json');

/**
 * Lê um arquivo JSON de forma segura.
 */
function lerJson(filePath, defaultValue = {}) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (error) {
        console.error(`Erro ao ler o arquivo JSON ${filePath}:`, error);
    }
    return defaultValue;
}

/**
 * Escreve dados em um arquivo JSON de forma segura.
 */
function escreverJson(filePath, data) {
    try {
        // Garante que a pasta existe antes de escrever (evita erro no LOGS_DIR)
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Erro ao salvar o arquivo JSON ${filePath}:`, error);
    }
}

/**
 * Registra o uso de uma funcionalidade no log.
 * @param {string} numero O número do usuário.
 * @param {string} nomeFuncao O nome da função utilizada.
 * @param {string} [setorParam] (Opcional) O setor já identificado no index.js.
 */
async function registrarUso(numero, nomeFuncao, setorParam = null) {
    try {
        let setorFinal = setorParam;

        // Lógica de Fallback: Se o index.js não mandou o setor, tentamos achar aqui
        // (Isso mantem compatibilidade caso alguma parte do código antigo chame essa função)
        if (!setorFinal) {
            const representantes = lerJson(REPRESENTANTES_PATH, []);
            // Limpeza básica para tentar achar
            const numeroLimpo = String(numero).replace('@c.us', '').replace(/\D/g, '');
            
            const representante = representantes.find(rep => {
                const repTel = String(rep.telefone || "").replace(/\D/g, '');
                return (rep.lid && rep.lid === numero) || (repTel && numeroLimpo.endsWith(repTel));
            });
            
            setorFinal = representante ? representante.setor : 'Não Identificado';
        }

        const logUso = lerJson(LOG_USO_PATH, []);
        const timestamp = new Date();

        const novoRegistro = {
            timestamp: timestamp.toISOString(),
            data: timestamp.toLocaleDateString('pt-BR'), // Ex: 11/02/2026
            hora: timestamp.toLocaleTimeString('pt-BR'), // Ex: 14:30:00
            telefone: numero.replace('@c.us', ''),
            setor: setorFinal,
            funcao: nomeFuncao
        };

        logUso.push(novoRegistro);
        escreverJson(LOG_USO_PATH, logUso);
        
        console.log(`📝 [LOG] Setor: ${setorFinal} | Ação: ${nomeFuncao}`);
        
    } catch (error) {
        console.error('Erro ao registrar o uso:', error);
    }
}

module.exports = {
    lerJson,
    escreverJson,
    registrarUso,
    REPRESENTANTES_PATH,
    ETAPAS_PATH,
    ATENDIDOS_PATH,
    STAFFS_PATH,
    LOG_USO_PATH
};