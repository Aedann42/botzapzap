const fs = require('fs');
const { logAcao } = require('../utils/logger');

/**
 * Compara o nome do WhatsApp com o banco e atualiza se for diferente.
 */
const autoHealingNome = (message, representante, representantes, caminhoJson) => {
    
    if (!message || !message._data) return;
    
    const nomeWhatsApp = message._data.notifyName;
    const repNomeAtual = representante.nome || representante.Nome || representante.NOME || '';


    // Verifica se o nome do Zap existe e é diferente do registrado (e não é apenas o número)
    if (nomeWhatsApp && nomeWhatsApp.trim() !== repNomeAtual.trim() && nomeWhatsApp !== (message.from.split('@')[0])) {
        
        // Atualiza mantendo o formato original da chave no seu JSON
        if (representante.hasOwnProperty('Nome')) representante.Nome = nomeWhatsApp;
        else if (representante.hasOwnProperty('NOME')) representante.NOME = nomeWhatsApp;
        else representante.nome = nomeWhatsApp;

        try {
            fs.writeFileSync(caminhoJson, JSON.stringify(representantes, null, 2));
            logAcao('SISTEMA', `Auto-Healing: Nome de "${repNomeAtual}" atualizado para "${nomeWhatsApp}"`);
        } catch (err) {
            console.log('⚠️ Erro ao atualizar nome no JSON:', err.message);
        }
    }
};

module.exports = autoHealingNome;