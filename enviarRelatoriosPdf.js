// enviarRelatoriosPdf.js
const path = require('path');
const fs = require('fs');
const { MessageMedia } = require('whatsapp-web.js');

// --- Variáveis para Gerenciamento da Fila de Envio de Relatórios PDF ---
let isSendingPdfReports = false; // Semáforo para controlar o envio de PDFs
const pdfReportSendQueue = []; // Fila de requisições de envio de PDF

// Função para processar a próxima requisição na fila de envio de relatórios PDF
async function processNextPdfReportSendRequest() {
    if (pdfReportSendQueue.length === 0) {
        isSendingPdfReports = false; // Não há mais requisições, libera o semáforo
        return;
    }

    const nextRequest = pdfReportSendQueue.shift(); // Pega a primeira requisição da fila
    isSendingPdfReports = true; // Marca que estamos processando

    const { client, message, pastaSetor, arquivos } = nextRequest; // Desestrutura a requisição

    try {
        await client.sendMessage(message.from, '🔄 Enviando relatórios PDF, aguarde...');

        for (const nomeArquivo of arquivos) {
            const caminhoCompleto = path.join(pastaSetor, nomeArquivo);
            if (!fs.existsSync(caminhoCompleto)) {
                console.warn(`⚠️ Arquivo PDF não encontrado para envio: ${caminhoCompleto}`);
                continue; // Pula para o próximo arquivo
            }
            const media = MessageMedia.fromFilePath(caminhoCompleto);

            // Pequeno atraso para evitar rate-limit e sobrecarga
            await new Promise(resolve => setTimeout(resolve, 500)); // Espera 500ms entre arquivos

            await client.sendMessage(message.from, media, {
                caption: nomeArquivo,
                sendMediaAsDocument: true // Importante para PDFs
            });
        }

        await client.sendMessage(message.from, '✅ Relatórios PDF enviados com sucesso.');
    } catch (error) {
        console.error('❌ Erro ao enviar relatórios PDF:', error);
        await client.sendMessage(message.from, '❌ Ocorreu um erro ao enviar os relatórios PDF. Tente novamente mais tarde.');
    } finally {
        // Quando a requisição atual termina, chama a próxima na fila
        processNextPdfReportSendRequest();
    }
}

module.exports = async function enviarRelatoriosPdf(client, message) {
    const numero = message.from.replace('@c.us', '');

    const representantes = JSON.parse(fs.readFileSync('./representantes.json', 'utf8'));
    const pessoa = representantes.find(rep => rep.telefone === numero);

    if (!pessoa) {
        await client.sendMessage(message.from, 'Seu número não está cadastrado como representante.');
        return;
    }

    const pastaBase = String.raw`\\VSRV-DC01\Arquivos\VENDAS\METAS E PROJETOS\2025\7 - JULHO\_GERADOR PDF\ACOMPS`;
    const pastaSetor = path.join(pastaBase, String(pessoa.setor));

    if (!fs.existsSync(pastaSetor)) {
        await client.sendMessage(message.from, 'Não encontrei documentos PDF para seu setor.');
        return;
    }

    const arquivos = fs.readdirSync(pastaSetor);

    if (arquivos.length === 0) {
        await client.sendMessage(message.from, 'Nenhum documento PDF encontrado para seu setor.');
        return;
    }

    // Adiciona a requisição à fila
    pdfReportSendQueue.push({ client, message, pastaSetor, arquivos });

    // Inicia o processamento da fila se não houver nada rodando
    if (!isSendingPdfReports) {
        processNextPdfReportSendRequest();
    } else {
        await client.sendMessage(message.from, 'Já estou enviando outros relatórios. Por favor, aguarde na fila...');
    }
};