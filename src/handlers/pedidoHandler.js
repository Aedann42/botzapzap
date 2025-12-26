const fs = require('fs');
const path = require('path');
const tabelaPrecosService = require('../services/tabelaPrecosService');

// Configuração das Janelas de Horário
const JANELAS = ["13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"];

/**
 * Calcula qual é a próxima janela disponível baseada no horário atual
 */
function calcularProximaJanela() {
    const agora = new Date();
    const minutosAtuais = agora.getHours() * 60 + agora.getMinutes();

    for (let janela of JANELAS) {
        const [h, m] = janela.split(':').map(Number);
        const minutosJanela = h * 60 + m;

        if (minutosJanela > minutosAtuais) {
            return janela.replace(':', 'h');
        }
    }
    return "13h00"; // Se passar das 16h30, aponta para a primeira do dia seguinte
}

module.exports = {
    /**
     * Passo 1: Cria o JSON inicial (esqueleto) e coloca o usuário em estado 'wait'
     */
    iniciarProcessamentoPedido: async (client, message) => {
        const telefone = message.from.split('@')[0];
        const janela = calcularProximaJanela();
        const hoje = new Date().toISOString().split('T')[0];
        const pastaData = path.join(process.cwd(), 'pedidos', hoje);

        console.log(`[HANDLER] 📝 Iniciando pedido para ${telefone}. Janela alvo: ${janela}`);

        try {
            // Cria a pasta do dia se não existir
            if (!fs.existsSync(pastaData)) {
                fs.mkdirSync(pastaData, { recursive: true });
                console.log(`[HANDLER] 📂 Pasta criada: ${pastaData}`);
            }

            const caminhoArquivo = path.join(pastaData, `${telefone}_${janela}.json`);
            
            // Estrutura do JSON conforme solicitado (campos 1 a 99)
            const template = {
                "confirmado pelo representante": false,
                "janela_analise": janela,
                "dados_brutos": "", // Onde acumularemos as mensagens
                "itens_processados": false,
                "data_inicio": new Date().toLocaleString('pt-BR')
            };

            for (let i = 1; i <= 99; i++) {
                template[`código item ${i}`] = "";
                template[`quantidade item ${i}`] = "";
                template[`valor item ${i}`] = "";
            }

            fs.writeFileSync(caminhoArquivo, JSON.stringify(template, null, 2));
            console.log(`[HANDLER] ✅ JSON Criado: ${caminhoArquivo}`);

            await client.sendMessage(message.from, `📝 *MODO PEDIDO ATIVADO*\n\nSua janela de análise é: *${janela}*\n\nPode enviar os itens (texto ou áudio) que eu vou anotando.\n\nPara sair, digite *MENU*.`);
            
            return { proximaJanela: janela };
        } catch (e) {
            console.error(`[HANDLER] ❌ Erro ao iniciar pedido:`, e.message);
        }
    },

    /**
     * Passo 2: Apenas armazena o texto enviado no campo 'dados_brutos'
     */
    armazenarTextoBruto: async (client, message, janela) => {
        const telefone = message.from.split('@')[0];
        const hoje = new Date().toISOString().split('T')[0];
        const caminhoArquivo = path.join(process.cwd(), 'pedidos', hoje, `${telefone}_${janela}.json`);

        if (!fs.existsSync(caminhoArquivo)) {
            console.error(`[HANDLER] ❌ Tentativa de salvar dados em arquivo inexistente: ${caminhoArquivo}`);
            return;
        }

        try {
            let pedidoJson = JSON.parse(fs.readFileSync(caminhoArquivo, 'utf-8'));
            
            // Acumula a mensagem atual com as anteriores
            pedidoJson.dados_brutos += message.body + "\n";
            
            fs.writeFileSync(caminhoArquivo, JSON.stringify(pedidoJson, null, 2));
            console.log(`[HANDLER] ✍️ Dados brutos acumulados para ${telefone}`);
        } catch (e) {
            console.error(`[HANDLER] ❌ Erro ao salvar dados brutos:`, e.message);
        }
    },

    /**
     * Passo 3: Converte o texto em códigos usando a tabela de preços (chamado por CRON ou comando manual)
     */
    executarConversaoLote: async (client, janelaAlvo) => {
        // Importa o tradutor aqui para evitar dependência circular se houver
        const tradutorService = require('../services/tradutorPedidoService');
        
        console.log(`[JANELA] 🚀 Processando janela: ${janelaAlvo}`);
        const hoje = new Date().toISOString().split('T')[0];
        const pastaData = path.join(process.cwd(), 'pedidos', hoje);

        if (!fs.existsSync(pastaData)) {
            console.log("[JANELA] ℹ️ Sem pedidos para processar hoje.");
            return;
        }

        // CARREGAMENTO DA TABELA - Definida antes do uso para evitar o ReferenceError
        const produtosTabela = await tabelaPrecosService.buscarDadosTabela();
        
        if (!produtosTabela || produtosTabela.length === 0) {
            console.error("[JANELA] ❌ Abortando: Tabela de preços não carregada.");
            return;
        }

        // Busca todos os arquivos da janela alvo
        const arquivos = fs.readdirSync(pastaData).filter(f => f.endsWith(`_${janelaAlvo}.json`));
        console.log(`[JANELA] 📂 Encontrados ${arquivos.length} pedidos.`);

        for (const arquivo of arquivos) {
            try {
                const caminho = path.join(pastaData, arquivo);
                let pedidoJson = JSON.parse(fs.readFileSync(caminho, 'utf-8'));
                
                if (pedidoJson.itens_processados) continue;

                // Traduz o texto acumulado em itens da tabela
                const itensTraduzidos = tradutorService.traduzirTextoParaItens(pedidoJson.dados_brutos, produtosTabela);

                // Preenche os campos do JSON (1 a 99)
                itensTraduzidos.forEach(item => {
                    const idx = item.index;
                    pedidoJson[`código item ${idx}`] = item.codigo;
                    pedidoJson[`quantidade item ${idx}`] = item.quantidade;
                    pedidoJson[`valor item ${idx}`] = item.valor;
                });

                pedidoJson.itens_processados = true;
                pedidoJson.data_processamento = new Date().toLocaleString('pt-BR');
                
                fs.writeFileSync(caminho, JSON.stringify(pedidoJson, null, 2));

                // Notifica o representante
                const telOriginal = arquivo.split('_')[0] + "@c.us";
                if (itensTraduzidos.length > 0) {
                    const lista = itensTraduzidos.map(it => `🔹 ${it.quantidade}x ${it.nomeOriginal}`).join('\n');
                    await client.sendMessage(telOriginal, `🔔 *JANELA ${janelaAlvo} FINALIZADA*\n\nItens identificados:\n${lista}\n\n_Os códigos já foram inseridos no JSON do pedido._`);
                } else {
                    await client.sendMessage(telOriginal, `⚠️ Janela ${janelaAlvo}: Não identifiquei produtos no seu texto bruto.`);
                }
                
                console.log(`[JANELA] ✅ Pedido ${arquivo} processado.`);

            } catch (err) {
                console.error(`[JANELA] ❌ Erro no arquivo ${arquivo}:`, err.message);
            }
        }
    }
};