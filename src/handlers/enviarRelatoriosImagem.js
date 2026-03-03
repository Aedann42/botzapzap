const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');

async function enviarRelatoriosImagem(client, message, representante) {
    const numero = message.from;

    // 🚨 CONFIRA SE ESTE CAMINHO ESTÁ CERTO NO SEU SERVIDOR
    const BASE_PATH = String.raw`\\VSRV-DC01\Arquivos\VENDAS\METAS E PROJETOS\2026\3 - MARÇO\_GERADOR PDF\IMAGENS`;

    try {
        // CORREÇÃO: Mudamos de .rota para .setor
        if (!representante || !representante.setor) {
            await client.sendMessage(numero, '❌ Não consegui identificar seu setor para buscar imagens.');
            return;
        }

        const setor = representante.setor.toString();
        
        // CUIDADO: Verifique se na pasta de IMAGENS as subpastas são pelo número do setor ("411") 
        // ou se usam outro nome (ex: "GV4", "ROTA_411").
        // Se for igual ao PDF ("411"), o código abaixo funciona:
        const pastaSetor = path.join(BASE_PATH, setor);

        if (!fs.existsSync(pastaSetor)) {
            console.log(`[enviarRelatoriosImagem.js] Pasta não encontrada: ${pastaSetor}`);
            await client.sendMessage(numero, `⚠️ A pasta de imagens do setor ${setor} não foi encontrada.`);
            return;
        }

        const arquivos = fs.readdirSync(pastaSetor);
        const imagens = arquivos.filter(file => file.match(/\.(jpg|jpeg|png)$/i));

        if (imagens.length === 0) {
            await client.sendMessage(numero, '⚠️ Nenhuma imagem encontrada hoje.');
            return;
        }

        await client.sendMessage(numero, '🖼️ Enviando seus relatórios em Imagem...');

        for (const file of imagens) {
            const media = MessageMedia.fromFilePath(path.join(pastaSetor, file));
            await client.sendMessage(numero, media);
        }

    } catch (error) {
        console.error('[Imagem] Erro:', error);
        await client.sendMessage(numero, '❌ Erro ao buscar relatório de imagem.');
    }
}

module.exports = enviarRelatoriosImagem;