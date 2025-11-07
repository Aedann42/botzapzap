// enviarRelatoriosPdf.js (PADRONIZADO)
const path = require('path');
const fs = require('fs');
const { MessageMedia } = require('whatsapp-web.js');

/**
 * Verifica se um arquivo deve ser enviado com base na extensão.
 * (Função auxiliar inalterada)
 */
function isArquivoValidoParaEnvio(nomeArquivo) {
    const extensoesBloqueadas = ['.webp', '.db'];
    const extensao = path.extname(nomeArquivo).toLowerCase();
    return !extensoesBloqueadas.includes(extensao);
}

// --- Variáveis para Gerenciamento da Fila ---
let isSendingPdfReports = false;
const pdfReportSendQueue = [];

// --- Função para processar a próxima requisição na fila ---
async function processNextPdfReportSendRequest() {
    if (pdfReportSendQueue.length === 0) {
        isSendingPdfReports = false;
        return;
    }

    const nextRequest = pdfReportSendQueue.shift();
    isSendingPdfReports = true;

    // ✅ CORREÇÃO: Desestruturamos o 'representante' para usar no log
    const { client, message, arquivosParaEnviar, nomePastaGeral, representante } = nextRequest;
    
    // ✅ CORREÇÃO: Usamos o telefone do representante para o log
    const numeroLimpoParaLog = representante ? representante.telefone : message.from.split('@')[0];

    try {
        await client.sendMessage(message.from, '🔄 Enviando relatórios, aguarde...');

        for (const caminhoCompleto of arquivosParaEnviar) {
            if (!fs.existsSync(caminhoCompleto)) {
                console.warn(`⚠️ Arquivo não encontrado para envio: ${caminhoCompleto}`);
                continue;
            }
            
            const media = MessageMedia.fromFilePath(caminhoCompleto);
            const nomeArquivo = path.basename(caminhoCompleto);

            await new Promise(resolve => setTimeout(resolve, 500));

            await client.sendMessage(message.from, media, {
                caption: nomeArquivo,
                sendMediaAsDocument: true
            });
        }

        await client.sendMessage(message.from, '✅ Relatórios enviados com sucesso.');

        // ✅ LOG FINAL CORRIGIDO
        console.log(`[${path.basename(__filename)}] Envio concluído para ${numeroLimpoParaLog}: ${arquivosParaEnviar.length} arquivos enviados ${nomePastaGeral ? `(usando pasta geral ${nomePastaGeral})` : '(sem pasta geral)'}.`);

    } catch (error) {
        console.error('❌ Erro ao enviar relatórios:', error);
        await client.sendMessage(message.from, '❌ Ocorreu um erro ao enviar os relatórios. Tente novamente mais tarde.');
    } finally {
        processNextPdfReportSendRequest();
    }
}

// --- Função Principal Exportada (PADRONIZADA) ---
// ✅ ALTERADO: Agora recebe 'representante' como parâmetro
module.exports = async function enviarRelatoriosPdf(client, message, representante) {
    
    // --- 🚀 LÓGICA DE AUTORIZAÇÃO ATUALIZADA ---
    // A lógica de 'const numero = message.from.replace...' foi REMOVIDA.
    // Usamos o objeto 'representante' que foi injetado.

    if (!representante || !representante.setor) {
        // Verificação de segurança
        console.error(`[RelatoriosPdf] Erro: Objeto 'representante' (ou seu setor) está faltando para ${message.from}.`);
        await client.sendMessage(message.from, 'Seu número não está cadastrado ou seu setor não foi definido. Avise o APR.');
        return;
    }
    // --- FIM DA ATUALIZAÇÃO ---


    const pastaBase = String.raw`\\VSRV-DC01\Arquivos\VENDAS\METAS E PROJETOS\2025\11 - NOVEMBRO\_GERADOR PDF\ACOMPS`;
    
    // ✅ CORRIGIDO: Usa o setor do 'representante' injetado
    const pastaSetor = path.join(pastaBase, String(representante.setor));
    let arquivosParaEnviar = [];

    if (fs.existsSync(pastaSetor)) {
        const arquivosDoSetor = fs.readdirSync(pastaSetor);
        arquivosDoSetor.forEach(arquivo => {
            if (isArquivoValidoParaEnvio(arquivo)) {
                arquivosParaEnviar.push(path.join(pastaSetor, arquivo));
            }
        });
    }

    // ✅ CORRIGIDO: Usa o setor do 'representante' injetado
    const setorStr = String(representante.setor);
    const primeiroDigito = setorStr[0];
    let nomePastaGeral = null;

    switch (primeiroDigito) {
        case '1': nomePastaGeral = 'GV1'; break;
        case '2': nomePastaGeral = 'GV2'; break;
        case '3': nomePastaGeral = 'GV3'; break;
        case '4': case '5': case '6': case '7': case '8': case '9': nomePastaGeral = 'GV4'; break;
    }

    if (nomePastaGeral) {
        const caminhoPastaGeral = path.join(pastaBase, nomePastaGeral);
        if (fs.existsSync(caminhoPastaGeral)) {
            const arquivosDaPastaGeral = fs.readdirSync(caminhoPastaGeral);
            for (const nomeArquivo of arquivosDaPastaGeral.reverse()) {
                if (isArquivoValidoParaEnvio(nomeArquivo)) {
                    arquivosParaEnviar.unshift(path.join(caminhoPastaGeral, nomeArquivo));
                }
            }
        }
    }

    if (arquivosParaEnviar.length === 0) {
        await client.sendMessage(message.from, 'Nenhum documento válido encontrado para seu setor.');
        return;
    }
    
    // ✅ CORREÇÃO: Passa o 'representante' para a fila (para o log)
    pdfReportSendQueue.push({ client, message, arquivosParaEnviar, nomePastaGeral, representante });

    if (!isSendingPdfReports) {
        processNextPdfReportSendRequest();
    } else {
        await client.sendMessage(message.from, 'Já estou enviando outros relatórios. Você foi adicionado à fila e seus arquivos serão enviados em breve.');
    }
};