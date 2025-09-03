// enviarRelatoriosPdf.js
const path = require('path');
const fs = require('fs');
const { MessageMedia } = require('whatsapp-web.js');

/**
 * Verifica se um arquivo deve ser enviado com base na extensão.
 * @param {string} nomeArquivo O nome do arquivo a ser verificado.
 * @returns {boolean} Retorna 'true' se a extensão do arquivo não estiver na lista de bloqueadas.
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

    const { client, message, arquivosParaEnviar, nomePastaGeral } = nextRequest;
    
    // CORREÇÃO: Declaramos a variável aqui para que seja visível em todo o escopo da função
    const numeroLimpo = message.from.split('@')[0];

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

        // LOG FINAL OTIMIZADO
        console.log(`[${path.basename(__filename)}] Envio concluído para ${numeroLimpo}: ${arquivosParaEnviar.length} arquivos enviados ${nomePastaGeral ? `(usando pasta geral ${nomePastaGeral})` : '(sem pasta geral)'}.`);

    } catch (error) {
        console.error('❌ Erro ao enviar relatórios:', error);
        await client.sendMessage(message.from, '❌ Ocorreu um erro ao enviar os relatórios. Tente novamente mais tarde.');
    } finally {
        processNextPdfReportSendRequest();
    }
}

// --- Função Principal Exportada ---
module.exports = async function enviarRelatoriosPdf(client, message) {
    const numero = message.from.replace('@c.us', '');
    const representantes = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'representantes.json'), 'utf8'));
    const pessoa = representantes.find(rep => rep.telefone === numero);

    if (!pessoa) {
        await client.sendMessage(message.from, 'Seu número não está cadastrado como representante.');
        return;
    }

    const pastaBase = String.raw`\\VSRV-DC01\Arquivos\VENDAS\METAS E PROJETOS\2025\9 - SETEMBRO\_GERADOR PDF\ACOMPS`;
    const pastaSetor = path.join(pastaBase, String(pessoa.setor));
    let arquivosParaEnviar = [];

    if (fs.existsSync(pastaSetor)) {
        const arquivosDoSetor = fs.readdirSync(pastaSetor);
        arquivosDoSetor.forEach(arquivo => {
            if (isArquivoValidoParaEnvio(arquivo)) {
                arquivosParaEnviar.push(path.join(pastaSetor, arquivo));
            }
        });
    }

    const setorStr = String(pessoa.setor);
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
    
    pdfReportSendQueue.push({ client, message, arquivosParaEnviar, nomePastaGeral });

    if (!isSendingPdfReports) {
        processNextPdfReportSendRequest();
    } else {
        await client.sendMessage(message.from, 'Já estou enviando outros relatórios. Você foi adicionado à fila e seus arquivos serão enviados em breve.');
    }
};