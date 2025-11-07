// enviarRelatoriosPdf.js (CORRIGIDO PARA LIDs)
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
    
    // --- 🚀 CORREÇÃO LID (1/2) ---
    // Corrigindo a variável para o LOG no final
    let numeroTelefoneLimpo;
    try {
        const contact = await message.getContact();
        // Usa o número do telefone para o log. Se falhar, usa o ID antigo (split) como fallback.
        numeroTelefoneLimpo = contact.number || message.from.split('@')[0];
    } catch (e) {
        console.warn(`[enviarRelatoriosPdf] Falha ao obter contato para log, usando ID: ${message.from}`);
        numeroTelefoneLimpo = message.from.split('@')[0]; // Fallback
    }
    // --- FIM CORREÇÃO ---
    
    // const numeroLimpo = message.from.split('@')[0]; // <-- LINHA ANTIGA

    try {
        await client.sendMessage(message.from, '🔄 Enviando relatórios, aguarde...');

        for (const caminhoCompleto of arquivosParaEnviar) {
            if (!fs.existsSync(caminhoCompleto)) {
                console.warn(`⚠️ Arquivo não encontrado para envio: ${caminhoCompleto}`);
                continue;
            }
            
            const media = MessageMedia.fromFilePath(caminhoCompleto);
            const nomeArquivo = path.basename(caminhoCompleto);

            await new Promise(resolve => setTimeout(resolve, 500)); // Pequeno delay

            await client.sendMessage(message.from, media, {
                caption: nomeArquivo,
                sendMediaAsDocument: true
            });
        }

        await client.sendMessage(message.from, '✅ Relatórios enviados com sucesso.');

        // LOG FINAL OTIMIZADO (usando 'numeroTelefoneLimpo' corrigido)
        console.log(`[${path.basename(__filename)}] Envio concluído para ${numeroTelefoneLimpo}: ${arquivosParaEnviar.length} arquivos enviados ${nomePastaGeral ? `(usando pasta geral ${nomePastaGeral})` : '(sem pasta geral)'}.`);

    } catch (error) {
        console.error('❌ Erro ao enviar relatórios:', error);
        await client.sendMessage(message.from, '❌ Ocorreu um erro ao enviar os relatórios. Tente novamente mais tarde.');
    } finally {
        processNextPdfReportSendRequest();
    }
}

// --- Função Principal Exportada ---
module.exports = async function enviarRelatoriosPdf(client, message) {
    // const numero = message.from.replace('@c.us', ''); // <-- LINHA ANTIGA

    // --- 🚀 CORREÇÃO LID (2/2) ---
    // Esta é a correção principal para AUTORIZAÇÃO
    let contact;
    try {
        contact = await message.getContact();
    } catch (e) {
        console.error(`[enviarRelatoriosPdf] Falha crítica ao obter contato para o ID: ${message.from}.`, e);
        await client.sendMessage(message.from, '❌ Ocorreu um erro ao verificar sua identidade. Tente novamente.');
        return; 
    }

    const numeroTelefoneLimpo = contact.number; // Ex: "5532..."

    if (!numeroTelefoneLimpo) {
        console.log(`[enviarRelatoriosPdf] Falha ao obter número de telefone do ID: ${message.from}.`);
        await client.sendMessage(message.from, '❌ Ocorreu um erro ao verificar seus dados. Tente novamente.');
        return; 
    }
    // --- FIM CORREÇÃO ---

    const representantes = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'representantes.json'), 'utf8'));
    
    // Usamos o 'numeroTelefoneLimpo' para a verificação
    const pessoa = representantes.find(rep => rep.telefone === numeroTelefoneLimpo);

    if (!pessoa) {
        await client.sendMessage(message.from, 'Seu número não está cadastrado como representante.');
        return;
    }

    const pastaBase = String.raw`\\VSRV-DC01\Arquivos\VENDAS\METAS E PROJETOS\2025\11 - NOVEMBRO\_GERADOR PDF\ACOMPS`;
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