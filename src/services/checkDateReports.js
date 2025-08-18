// /checkDateReports.js
const fs = require('fs');

// O caminho do arquivo a ser verificado está definido aqui dentro.
const ARQUIVO_CHECK_RELATORIOS = '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2025\\8 - AGOSTO\\_GERADOR PDF\\IMAGENS\\GV4\\MATINAL_GV4_page_3.jpg';

/**
 * Verifica se o arquivo de relatório principal foi modificado na data de hoje.
 * @returns {Promise<boolean>} Retorna `true` se o arquivo foi atualizado hoje, `false` caso contrário.
 */
async function verificarAtualizacaoDiaria() {
    try {
        // Verifica se o arquivo existe. Se não, já retorna falso.
        if (!fs.existsSync(ARQUIVO_CHECK_RELATORIOS)) {
            console.log(`[VERIFICAÇÃO] Arquivo não encontrado: ${ARQUIVO_CHECK_RELATORIOS}`);
            return false;
        }

        // Obtém as informações do arquivo
        const stats = fs.statSync(ARQUIVO_CHECK_RELATORIOS);
        const dataModificacao = new Date(stats.mtime);
        const hoje = new Date();

        // Compara ano, mês e dia.
        const foiAtualizadoHoje = dataModificacao.getFullYear() === hoje.getFullYear() &&
                                 dataModificacao.getMonth() === hoje.getMonth() &&
                                 dataModificacao.getDate() === hoje.getDate();
        
        return foiAtualizadoHoje;

    } catch (error) {
        console.error(`[VERIFICAÇÃO] Erro ao acessar o arquivo de relatório:`, error);
        // Em caso de qualquer erro (ex: permissão de acesso negada), assume que não está pronto.
        return false;
    }
}

// Exporta a função para que ela possa ser usada em outros arquivos.
module.exports = verificarAtualizacaoDiaria;