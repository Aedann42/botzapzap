// enviarRelatoriosImagem.js
const path = require('path');
const fs = require('fs');
const { MessageMedia } = require('whatsapp-web.js');

// --- Variáveis para Gerenciamento da Fila de Envio de Relatórios de Imagem ---
let isSendingImageReports = false; // Semáforo para controlar o envio de Imagens
const imageReportSendQueue = []; // Fila de requisições de envio de Imagem

// Função para processar a próxima requisição na fila de envio de relatórios de Imagem
async function processNextImageReportSendRequest() {
    if (imageReportSendQueue.length === 0) {
        isSendingImageReports = false; // Não há mais requisições, libera o semáforo
        return;
    }

    const nextRequest = imageReportSendQueue.shift(); // Pega a primeira requisição da fila
    isSendingImageReports = true; // Marca que estamos processando

    const { client, message, pastaSetor, arquivos } = nextRequest; // Desestrutura a requisição

    try {
        await client.sendMessage(message.from, '🔄 Enviando relatórios em imagens, aguarde...');

        for (const nomeArquivo of arquivos) {
            const caminhoCompleto = path.join(pastaSetor, nomeArquivo);
            if (!fs.existsSync(caminhoCompleto)) {
                console.warn(`⚠️ Arquivo de imagem não encontrado para envio: ${caminhoCompleto}`);
                continue; // Pula para o próximo arquivo
            }
            const media = MessageMedia.fromFilePath(caminhoCompleto);

            // Pequeno atraso para evitar rate-limit e sobrecarga
            await new Promise(resolve => setTimeout(resolve, 500)); // Espera 500ms entre arquivos

            await client.sendMessage(message.from, media, {
                caption: nomeArquivo,
            });
        }

        await client.sendMessage(message.from, '✅ Relatórios em imagens enviados com sucesso.');
    } catch (error) {
        console.error('❌ Erro ao enviar relatórios em imagens:', error);
        await client.sendMessage(message.from, '❌ Ocorreu um erro ao enviar os relatórios em imagens. Tente novamente mais tarde.');
    } finally {
        // Quando a requisição atual termina, chama a próxima na fila
        processNextImageReportSendRequest();
    }
}

module.exports = async function enviarRelatoriosImagem(client, message) {
    const numero = message.from.replace('@c.us', '');

    const representantes = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'representantes.json'), 'utf8'));
    const pessoa = representantes.find(rep => rep.telefone === numero);

    if (!pessoa) {
        await client.sendMessage(message.from, 'Seu número não está cadastrado como representante.');
        return;
    }

    const pastaBase = String.raw`\\VSRV-DC01\Arquivos\VENDAS\METAS E PROJETOS\2025\11 - NOVEMBRO\_GERADOR PDF\IMAGENS`;
    const pastaSetor = path.join(pastaBase, String(pessoa.setor));

    if (!fs.existsSync(pastaSetor)) {
        await client.sendMessage(message.from, 'Não encontrei documentos em imagem para seu setor.');
        return;
    }

    const arquivos = fs.readdirSync(pastaSetor);

    if (arquivos.length === 0) {
        await client.sendMessage(message.from, 'Nenhum documento em imagem encontrado para seu setor.');
        return;
    }

    // Adiciona a requisição à fila
    imageReportSendQueue.push({ client, message, pastaSetor, arquivos });

    // Inicia o processamento da fila se não houver nada rodando
    if (!isSendingImageReports) {
        processNextImageReportSendRequest();
    } else {
        await client.sendMessage(message.from, 'Já estou enviando outros relatórios. Por favor, aguarde na fila...');
    }
};