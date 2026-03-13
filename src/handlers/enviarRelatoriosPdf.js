// src/handlers/enviarRelatoriosPdf.js
const fs = require('fs').promises; // Mudamos para a versão Promise (mais rápida)
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');

async function enviarRelatoriosPdf(client, message, representante) {
    const numero = message.from;
    const BASE_PATH = String.raw`\\VSRV-DC01\Arquivos\VENDAS\METAS E PROJETOS\2026\3 - MARÇO\_GERADOR PDF\ACOMPS`;
    
    try {
        if (!representante?.setor) return;

        const setor = representante.setor.toString();
        const pastaGV = `GV${setor.charAt(0)}`;
        const pastasParaVerificar = [
            path.join(BASE_PATH, setor),
            path.join(BASE_PATH, pastaGV)
        ];

        // 1. Removemos o "Buscando..." para ganhar tempo inicial.
        let promessasDeEnvio = [];

        for (const caminhoPasta of pastasParaVerificar) {
            try {
                // Checagem assíncrona (não trava o bot)
                await fs.access(caminhoPasta);
                const arquivos = await fs.readdir(caminhoPasta);
                
                const arquivosPdf = arquivos.filter(file => 
                    file.toLowerCase().endsWith('.pdf') && !file.startsWith('~')
                );

                for (const file of arquivosPdf) {
                    const caminhoCompleto = path.join(caminhoPasta, file);
                    
                    // 2. Criamos a mídia e adicionamos a uma fila de execução
                    const media = MessageMedia.fromFilePath(caminhoCompleto);
                    
                    // 👇 O SEGREDO: Não usamos 'await' aqui dentro do loop!
                    // Lançamos a tarefa de envio e guardamos a promessa dela.
                    promessasDeEnvio.push(
                        client.sendMessage(numero, media, { caption: file })
                    );
                }
            } catch (e) {
                // Pasta não existe, apenas pula para a próxima
                continue;
            }
        }

        if (promessasDeEnvio.length === 0) {
            await client.sendMessage(numero, `⚠️ Nenhum PDF encontrado para o setor ${setor}.`);
            return;
        }

        // 3. Executa todos os envios de uma vez (ou em sequência ultra rápida)
        // Usamos o Promise.all para disparar tudo "no grito"
        await Promise.all(promessasDeEnvio);

        // Mensagem final rápida
        await client.sendMessage(numero, `✅ ${promessasDeEnvio.length} relatórios enviados!`);

    } catch (error) {
        console.error('[Erro crítico]:', error);
    }
}

module.exports = enviarRelatoriosPdf;