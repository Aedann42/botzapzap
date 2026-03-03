// src/handlers/enviarRelatoriosPdf.js (VERSÃO FINAL - COM LÓGICA GV + SETOR)

const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');

async function enviarRelatoriosPdf(client, message, representante) {
    const numero = message.from;

    // 🚨 AJUSTE O CAMINHO BASE CONFORME NECESSÁRIO
    const BASE_PATH = String.raw`\\VSRV-DC01\Arquivos\VENDAS\METAS E PROJETOS\2026\3 - MARÇO\_GERADOR PDF\ACOMPS`;
    
    try {
        if (!representante || !representante.setor) {
            console.log(`[enviarRelatoriosPdf.js - Erro] Setor não definido para ${numero}`);
            await client.sendMessage(numero, '❌ Não consegui identificar seu setor no cadastro.');
            return;
        }

        const setor = representante.setor.toString(); // Ex: "411"
        const primeiroDigito = setor.charAt(0);       // Ex: "4"
        const pastaGV = `GV${primeiroDigito}`;        // Ex: "GV4"

        // Lista de pastas para verificar: [Pasta do Setor, Pasta do Gerente]
        const pastasParaVerificar = [
            { nome: setor, caminho: path.join(BASE_PATH, setor) },
            { nome: pastaGV, caminho: path.join(BASE_PATH, pastaGV) }
        ];

        let totalArquivosEncontrados = 0;

        await client.sendMessage(numero, '📄 Buscando seus relatórios em PDF...');

        // Loop para varrer as duas pastas (Setor e GV)
        for (const pasta of pastasParaVerificar) {
            
            if (!fs.existsSync(pasta.caminho)) {
                console.log(`[enviarRelatoriosPdf.js - Erro] Pasta não encontrada: ${pasta.caminho}`);
                // Não damos return aqui, pois pode existir a outra pasta
                continue; 
            }

            const arquivos = fs.readdirSync(pasta.caminho);
            // Filtra apenas arquivos .pdf
            const arquivosPdf = arquivos.filter(file => file.toLowerCase().endsWith('.pdf'));

            if (arquivosPdf.length > 0) {
                console.log(`[enviarRelatoriosPdf.js] Enviando ${arquivosPdf.length} arquivos da pasta ${pasta.nome}`);
                
                for (const file of arquivosPdf) {
                    const caminhoCompleto = path.join(pasta.caminho, file);
                    
                    // Ignora arquivos temporários
                    if (file.startsWith('~') || file.toLowerCase() === 'thumbs.db') continue;

                    const media = MessageMedia.fromFilePath(caminhoCompleto);
                    await client.sendMessage(numero, media, { caption: file });
                    totalArquivosEncontrados++;
                }
            }
        }

        if (totalArquivosEncontrados === 0) {
            await client.sendMessage(numero, `⚠️ Nenhum relatório PDF encontrado hoje (Verifiquei nas pastas: ${setor} e ${pastaGV}).`);
        } else {
            // Opcional: Avisar que terminou
            await client.sendMessage(numero, '✅ Envio de PDFs concluído.');
        }

    } catch (error) {
        console.error('[enviarRelatoriosPdf.js - Erro crítico]:', error);
        await client.sendMessage(numero, '❌ Ocorreu um erro ao buscar os relatórios PDF.');
    }
}

module.exports = enviarRelatoriosPdf;