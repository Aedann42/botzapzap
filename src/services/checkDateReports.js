// /src/services/checkDateReports.js
const fs = require('fs');

/**
 * Verifica se um arquivo específico foi modificado na data de hoje.
 * @param {string} caminhoDoArquivo O caminho completo do arquivo a ser verificado.
 * @returns {Promise<boolean>} Retorna `true` se o arquivo foi atualizado hoje, `false` caso contrário.
 */
async function verificarArquivoAtualizado(caminhoDoArquivo) {
    try {
        // Verifica se o arquivo existe. Se não, já retorna falso.
        if (!fs.existsSync(caminhoDoArquivo)) {
            console.log(`[VERIFICAÇÃO] Arquivo não encontrado: ${caminhoDoArquivo}`);
            return false;
        }

        // Obtém as informações do arquivo
        const stats = fs.statSync(caminhoDoArquivo);
        const dataModificacao = new Date(stats.mtime);
        const hoje = new Date();

        // Compara ano, mês e dia.
        const foiAtualizadoHoje = dataModificacao.getFullYear() === hoje.getFullYear() &&
                                  dataModificacao.getMonth() === hoje.getMonth() &&
                                  dataModificacao.getDate() === hoje.getDate();
        
        return foiAtualizadoHoje;

    } catch (error) {
        console.error(`[VERIFICAÇÃO] Erro ao acessar o arquivo "${caminhoDoArquivo}":`, error);
        // Em caso de qualquer erro (ex: permissão de acesso negada), assume que não está pronto.
        return false;
    }
}

// Exporta a função para que ela possa ser usada em outros arquivos.
module.exports = verificarArquivoAtualizado;