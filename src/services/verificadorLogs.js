const fs = require('fs');
const verificarArquivoAtualizado = require('./checkDateReports');
const enviarRelatoriosPdf = require('../handlers/enviarRelatoriosPdf');
const enviarRelatoriosImagem = require('../handlers/enviarRelatoriosImagem');

const monitorarArquivos = (client, usuariosAguardandoRelatorio, caminhos, CAMINHO_JSON_REAL) => {
    setInterval(async () => {
        if (Object.keys(usuariosAguardandoRelatorio).length === 0) return;

        try {
            const pdfPronto = await verificarArquivoAtualizado(caminhos.pdf);
            const imagemPronta = await verificarArquivoAtualizado(caminhos.imagem);

            if (!pdfPronto && !imagemPronta) return;

            const listaReps = JSON.parse(fs.readFileSync(CAMINHO_JSON_REAL, 'utf-8'));
            const notificados = [];

            for (const userNumero in usuariosAguardandoRelatorio) {
                const tipo = usuariosAguardandoRelatorio[userNumero];
                const rep = listaReps.find(r => {
                    const rTel = String(r.telefone || "").replace(/\D/g, '');
                    const uTel = String(userNumero).replace(/\D/g, '');
                    return uTel.endsWith(rTel) || rTel.endsWith(uTel);
                });

                if (!rep) continue;

                if (tipo === 'pdf' && pdfPronto) {
                    await enviarRelatoriosPdf(client, { from: userNumero }, rep);
                    await client.sendMessage(userNumero, "🎉 O relatório PDF que você pediu chegou!");
                    notificados.push(userNumero);
                } else if (tipo === 'imagem' && imagemPronta) {
                    await enviarRelatoriosImagem(client, { from: userNumero }, rep);
                    await client.sendMessage(userNumero, "🎉 O relatório Imagem que você pediu chegou!");
                    notificados.push(userNumero);
                }
            }
            notificados.forEach(user => delete usuariosAguardandoRelatorio[user]);
        } catch (error) {
            console.error('[ERRO VERIFICADOR]:', error);
        }
    }, 3 * 60 * 1000); // 3 minutos
};

module.exports = monitorarArquivos;