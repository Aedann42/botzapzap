// src/utils/dataHandler.js
const fs = require('fs');
const path = require('path');

// --- Caminhos dos Arquivos de Dados ---
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');

const REPRESENTANTES_PATH = path.join(DATA_DIR, 'representantes.json');
const ETAPAS_PATH = path.join(DATA_DIR, 'etapas.json');
const ATENDIDOS_PATH = path.join(DATA_DIR, 'atendidos.json');
const LOG_USO_PATH = path.join(LOGS_DIR, 'log_uso.json');

/**
 * Lê um arquivo JSON de forma segura.
 * @param {string} filePath O caminho completo para o arquivo JSON.
 * @param {*} defaultValue O valor a ser retornado se o arquivo não existir.
 * @returns {object|Array} O conteúdo do arquivo JSON ou o valor padrão.
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
 * @param {string} filePath O caminho completo para o arquivo JSON.
 * @param {object|Array} data Os dados a serem escritos no arquivo.
 */
function escreverJson(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Erro ao salvar o arquivo JSON ${filePath}:`, error);
    }
}

/**
 * Registra o uso de uma funcionalidade no log.
 * @param {string} numero O número do usuário com sufixo @c.us.
 * @param {string} nomeFuncao O nome da função utilizada.
 */
async function registrarUso(numero, nomeFuncao) {
    try {
        const representantes = lerJson(REPRESENTANTES_PATH, []);
        const logUso = lerJson(LOG_USO_PATH, []);

        const numeroLimpo = numero.replace('@c.us', '');
        const representante = representantes.find(rep => rep.telefone === numeroLimpo);
        
        const setor = representante ? representante.setor : 'Não Identificado';

        const timestamp = new Date();
        const novoRegistro = {
            timestamp: timestamp.toISOString(),
            data: timestamp.toISOString().split('T')[0],
            setor: setor,
            funcao: nomeFuncao
        };

        logUso.push(novoRegistro);
        escreverJson(LOG_USO_PATH, logUso);
        console.log(`[LOG] Ação registrada: Setor ${setor} | ${nomeFuncao}`);
    } catch (error) {
        console.error('Erro ao registrar o uso:', error);
    }
}

// Exportamos as funções e os caminhos para serem usados em outros arquivos
module.exports = {
    lerJson,
    escreverJson,
    registrarUso,
    REPRESENTANTES_PATH,
    ETAPAS_PATH,
    ATENDIDOS_PATH,
    LOG_USO_PATH
};