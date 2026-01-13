const fs = require('fs');
const path = require('path');
const tradutorService = require('../services/tradutorPedidoService');
// IMPORTANTE: Importar o serviço de transcrição
const transcricaoService = require('../services/transcricaoService');

const JANELAS = ["13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"];

function calcularProximaJanela() {
    const agora = new Date();
    const minutosAtuais = agora.getHours() * 60 + agora.getMinutes();
    for (let janela of JANELAS) {
        const [h, m] = janela.split(':').map(Number);
        if (h * 60 + m > minutosAtuais) return janela.replace(':', 'h');
    }
    return "13h00"; 
}

function buscarArquivoPendente(telefone) {
    const hoje = new Date().toISOString().split('T')[0];
    const pastaData = path.join(process.cwd(), 'pedidos', hoje);
    if (!fs.existsSync(pastaData)) return null;
    const caminho = path.join(pastaData, `${telefone}_PENDENTE.json`);
    return fs.existsSync(caminho) ? caminho : null;
}

module.exports = {

    iniciarProcessamentoPedido: async (client, message) => {
        await client.sendMessage(message.from, 
            `📝 *PEDIDO INTELIGENTE* \n\n` +
            `1. Fale o NB e os itens.\n` +
            `2. O robô vai olhar a tabela e montar o pedido.\n\n` +
            `Ex: "NB 50, 10 caixas de Skol Litrão"\n` +
            `Digite *FIM* para enviar.`
        );
        return true; 
    },

    processarMensagem: async (client, message) => {
        const telefone = message.from.split('@')[0];
        const texto = message.body ? message.body.trim().toUpperCase() : "";
        
        // --- LIMPAR ---
        if (texto === "LIMPAR" || texto === "EDITAR") {
            const rascunho = buscarArquivoPendente(telefone);
            if (rascunho) { 
                fs.unlinkSync(rascunho); 
                await client.sendMessage(message.from, "🗑️ Limpo!"); 
            }
            return 'CONTINUAR';
        }

        // --- FIM ---
        if (texto === "FIM") {
            const rascunho = buscarArquivoPendente(telefone);
            if (!rascunho) {
                await client.sendMessage(message.from, "⚠️ Nada para enviar.");
                return 'CONTINUAR';
            }
            try {
                const janelaFinal = calcularProximaJanela();
                const dados = JSON.parse(fs.readFileSync(rascunho, 'utf-8'));
                dados.janela_analise = janelaFinal;
                dados.status = "AGUARDANDO_PROCESSAMENTO"; 
                
                const hoje = new Date().toISOString().split('T')[0];
                const pastaData = path.join(process.cwd(), 'pedidos', hoje);
                let nomeFinal = `${telefone}_${janelaFinal}.json`;
                
                if (fs.existsSync(path.join(pastaData, nomeFinal))) {
                    nomeFinal = `${telefone}_${janelaFinal}_${Date.now()}.json`;
                }
                
                fs.writeFileSync(rascunho, JSON.stringify(dados, null, 2)); 
                fs.renameSync(rascunho, path.join(pastaData, nomeFinal)); 
                await client.sendMessage(message.from, `✅ Enviado para: *${janelaFinal}*`);
                return 'FINALIZAR';
            } catch (err) { return 'FINALIZAR'; }
        }

        // SALVAR DADOS
        const hoje = new Date().toISOString().split('T')[0];
        const pastaData = path.join(process.cwd(), 'pedidos', hoje);
        if (!fs.existsSync(pastaData)) fs.mkdirSync(pastaData, { recursive: true });
        let caminhoArquivo = path.join(pastaData, `${telefone}_PENDENTE.json`);
        
        if (!fs.existsSync(caminhoArquivo)) {
            const template = {
                "telefone": telefone, "nb_cliente": "", "condicao_pagamento": "", 
                "itens_processados": false, "dados_brutos": "" 
            };
            for (let i = 1; i <= 40; i++) template[`código item ${i}`] = "";
            fs.writeFileSync(caminhoArquivo, JSON.stringify(template, null, 2));
        }

        let conteudo = "";
        if (message.hasMedia) {
            const media = await message.downloadMedia();
            if (media && (media.mimetype.includes('audio') || media.mimetype.includes('ogg'))) {
                const nomeAudio = `${telefone}_PENDENTE_${Date.now()}.ogg`;
                fs.writeFileSync(path.join(pastaData, nomeAudio), media.data, 'base64');
                conteudo = `[AUDIO_PENDENTE:${nomeAudio}]\n`;
            }
        } else if (texto !== "FIM") {
            conteudo = message.body + "\n";
        }

        if (conteudo) {
            const json = JSON.parse(fs.readFileSync(caminhoArquivo, 'utf-8'));
            json.dados_brutos += conteudo;
            fs.writeFileSync(caminhoArquivo, JSON.stringify(json, null, 2));
            await message.react('👍');
        }
        return 'CONTINUAR';
    },

    executarConversaoLote: async (client, janelaAlvo) => {
        console.log(`[HANDLER] 🚀 Janela ${janelaAlvo}: Iniciando processamento...`);
        
        // 1. FORÇA A PADRONIZAÇÃO ANTES DE QUALQUER COISA
        // Isso garante que Texto Bruto -> vire CSV antes de lermos
        await transcricaoService.processarAudiosPendentes();

        const hoje = new Date().toISOString().split('T')[0];
        const pastaData = path.join(process.cwd(), 'pedidos', hoje);

        if (!fs.existsSync(pastaData)) return;

        const arquivos = fs.readdirSync(pastaData).filter(f => f.includes(`_${janelaAlvo}`) && f.endsWith('.json'));

        for (const arquivo of arquivos) {
            try {
                const caminho = path.join(pastaData, arquivo);
                let json = JSON.parse(fs.readFileSync(caminho, 'utf-8'));

                if (json.itens_processados) continue;

                // Agora json.dados_brutos JÁ DEVE ESTAR em formato CSV (X/Y/Z)
                // O tradutorPedidoService APENAS quebra a string, ele não usa IA.
                const itens = tradutorService.traduzirTextoParaItens(json.dados_brutos);
                
                if (itens.length > 0) {
                    if (itens[0].nb && itens[0].nb !== "0") json.nb_cliente = itens[0].nb;
                    if (itens[0].pagamento) json.condicao_pagamento = itens[0].pagamento;
                }

                itens.forEach(item => {
                    const i = item.index;
                    if (i <= 40) {
                        json[`código item ${i}`] = item.codigo;
                        json[`quantidade item ${i}`] = item.quantidade;
                        json[`valor item ${i}`] = item.valor;
                    }
                });

                json.itens_processados = true;
                json.data_processamento = new Date().toLocaleString('pt-BR');
                
                fs.writeFileSync(caminho, JSON.stringify(json, null, 2));

                const tel = json.telefone + "@c.us";
                if (itens.length > 0) {
                    const resumo = itens.map(it => `📦 ${it.quantidade}x Cód ${it.codigo}`).join('\n');
                    await client.sendMessage(tel, `✅ *PEDIDO PROCESSADO (${janelaAlvo})*\n\n${resumo}`);
                } else {
                    await client.sendMessage(tel, `⚠️ Janela ${janelaAlvo}: Não identifiquei itens na tabela. Verifique se o nome está correto.`);
                }

            } catch (err) { 
                console.error(`Erro arquivo ${arquivo}:`, err); 
            }
        }
    }
};