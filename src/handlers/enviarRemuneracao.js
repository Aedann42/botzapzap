// src/handlers/enviarRemuneracao.js
const fsSync = require('fs');
const fs = require('fs').promises; // Usando promises para não travar o bot
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const { escreverJson, ETAPAS_PATH, registrarUso } = require('../utils/dataHandler.js');

const CAMINHO_REPRESENTANTES = path.join(process.cwd(), 'data', 'representantes.json');
const CAMINHO_SENHAS = path.join(process.cwd(), 'data', 'representantes.json');

let isSendingRemuneracao = false;
const remuneracaoSendQueue = [];

// Utilitários de Log no Terminal
const getTime = () => new Date().toLocaleTimeString('pt-BR');
const logRemuneracao = (numero, msg) => console.log(`[${getTime()}] 💰 [REMUNERAÇÃO] [${numero}] ${msg}`);
const logFila = (msg) => console.log(`[${getTime()}] 🚦 [FILA-REM] ${msg}`);

async function lerJsonSeguroAsync(caminho) {
    try {
        const data = await fs.readFile(caminho, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        console.error(`[${getTime()}] ❌ Erro ao ler JSON em ${caminho}:`, e);
        return [];
    }
}

async function processNextRemuneracaoRequest() {
    if (remuneracaoSendQueue.length === 0) {
        isSendingRemuneracao = false;
        logFila('Fila vazia. Processamento em pausa.');
        return;
    }

    isSendingRemuneracao = true;
    const { client, message, matricula } = remuneracaoSendQueue.shift();
    const numero = message.from; 

    logFila(`Processando solicitação para ${numero} (Matrícula: ${matricula})`);

    try {
        const telefoneLimpo = numero.includes('@') ? numero.split('@')[0] : numero;

        const representantes = await lerJsonSeguroAsync(CAMINHO_REPRESENTANTES);
        const representante = representantes.find(r => 
            String(r.telefone).trim() === String(telefoneLimpo).trim() || 
            (r.lid && r.lid === numero)
        );

        if (!representante || !representante.setor) {
            logRemuneracao(numero, `❌ Usuário não encontrado ou sem setor.`);
            await client.sendMessage(numero, '❌ Seus dados não foram encontrados no cadastro de representantes ou você não possui setor definido.');
            return; 
        }
        
        const setor = String(representante.setor); // Forma segura de converter
        
        const diretorioPath = path.join(
            String.raw`\\VSRV-DC01\Arquivos\VENDAS\METAS E PROJETOS\2026\5 - MAIO\_GERADOR PDF\REMUNERACAO`,
            setor
        );

        logRemuneracao(numero, `📂 Tentando acessar a pasta em: ${diretorioPath}`);

        try {
            await fs.access(diretorioPath);
        } catch (e) {
            logRemuneracao(numero, `⚠️ A pasta do setor ${setor} não foi encontrada.`);
            await client.sendMessage(numero, `❌ A pasta de remuneração para o setor ${setor} não foi encontrada no servidor.`);
            return;
        }

        const arquivos = await fs.readdir(diretorioPath);
        const arquivosValidos = arquivos.filter(nome => 
            !nome.startsWith('~') && !nome.startsWith('.') && nome.toLowerCase() !== 'thumbs.db'
        );

        if (arquivosValidos.length === 0) {
            logRemuneracao(numero, `⚠️ A pasta do setor ${setor} foi encontrada, mas está vazia.`);
            await client.sendMessage(numero, `⚠️ A pasta do setor ${setor} foi encontrada, mas está vazia.`);
            return; 
        }

        await client.sendMessage(numero, `🔄 Encontrei! 🏋️ Preparando para envio, aguarde ⏰...`);

        // Envia os arquivos
        for (const nomeArquivo of arquivosValidos) {
            const caminhoCompletoArquivo = path.join(diretorioPath, nomeArquivo);
            const media = MessageMedia.fromFilePath(caminhoCompletoArquivo);
            
            logRemuneracao(numero, `📤 Enviando arquivo: "${nomeArquivo}"`);
            await client.sendMessage(numero, media, {
                sendMediaAsDocument: true,
                caption: `📄 Segue o arquivo: ${nomeArquivo}`
            });
        }

        await client.sendMessage(numero, '✅ Todos os seus arquivos foram enviados com sucesso!');
        logRemuneracao(numero, `✅ Fluxo concluído. Arquivos enviados com sucesso.`);

        // Salva o registro de uso da funcionalidade e printa bonitão no terminal
        try {
            await registrarUso(telefoneLimpo, 'Remuneração', setor);
        } catch (erroLog) {
            console.error(`[${getTime()}] ❌ Erro ao registrar log de uso:`, erroLog);
        }

    } catch (err) {
        console.error(`[${getTime()}] ❌ [ERRO-FILA] [${numero}] Erro inesperado:`, err);
        await client.sendMessage(numero, "❌ Ocorreu um erro ao enviar sua planilha. Por favor, tente novamente mais tarde.");
    } finally {
        // Sempre chama o próximo da fila, mesmo se der erro no atual
        processNextRemuneracaoRequest();
    }
}

async function enviarRemuneracao(client, message) {
    const numero = message.from; 
    const texto = message.body.trim();
    const isOperatorRequest = message._operator_triggered === true;

    try {
        function lerEtapas() {
            try { return JSON.parse(fsSync.readFileSync(ETAPAS_PATH, 'utf-8')); } catch { return {}; }
        }
        
        let etapas = lerEtapas();
        const etapaAtual = etapas[numero] ? etapas[numero].etapa : undefined;

        if (texto.toLowerCase() === 'cancelar' || texto.toLowerCase() === 'sair') {
            if (etapas[numero]) {
                delete etapas[numero];
                escreverJson(ETAPAS_PATH, etapas);
                logRemuneracao(numero, `🛑 Operação cancelada pelo usuário.`);
                await client.sendMessage(numero, '🚫 Operação de remuneração cancelada.');
            }
            return;
        }

        if (isOperatorRequest) {
            logRemuneracao(numero, `👨‍💻 Operador solicitou o envio forçado (BYPASS).`);
            remuneracaoSendQueue.push({ client, message, matricula: 'BYPASS_OPERADOR' });

            if (!isSendingRemuneracao) {
                processNextRemuneracaoRequest();
            } else {
                logFila(`Usuário ${numero} adicionado à fila pelo operador.`);
                await client.sendMessage(numero, '👍 Você foi adicionado à fila.');
            }
            return; 
        }

        if (etapaAtual === 'remuneracao') {
            const matricula = texto.replace(/\D/g, '');

            if (!/^\d+$/.test(matricula) || matricula.length === 0) {
                await client.sendMessage(numero, '❗ Por favor, digite apenas os *números* da sua matrícula.');
                return;
            }
            
            const telefoneLimpo = numero.includes('@') ? numero.split('@')[0] : numero;
            
            const representantes = await lerJsonSeguroAsync(CAMINHO_REPRESENTANTES);
            const senhaRemuneracao = await lerJsonSeguroAsync(CAMINHO_SENHAS);
            
            const representante = representantes.find(r => 
                String(r.telefone).trim() === String(telefoneLimpo).trim() || 
                (r.lid && r.lid === numero)
            );

            const setor = representante?.setor ? String(representante.setor) : null;

            if (!setor) {
                await client.sendMessage(numero, `❌ Seu cadastro não possui setor definido.`);
                delete etapas[numero];
                escreverJson(ETAPAS_PATH, etapas);
                return;
            }

            const credencialValida = senhaRemuneracao.find(
                item => String(item.setor) === setor && String(item.matricula) === matricula
            );

            if (!credencialValida) {
                logRemuneracao(numero, `❌ Tentativa de acesso negada. Matrícula incorreta: ${matricula}`);
                await client.sendMessage(numero, `❌ Você digitou "${matricula}". Matrícula incorreta para o seu setor. Peça a opção 4 novamente!`);
                delete etapas[numero];
                escreverJson(ETAPAS_PATH, etapas);
                return;
            }

            logRemuneracao(numero, `🔓 Credenciais validadas (Matrícula: ${matricula}). Indo para a fila.`);
            delete etapas[numero];
            escreverJson(ETAPAS_PATH, etapas);

            remuneracaoSendQueue.push({ client, message, matricula });
            
            if (!isSendingRemuneracao) {
                processNextRemuneracaoRequest();
            } else {
                logFila(`Usuário ${numero} adicionado à fila.`);
                await client.sendMessage(numero, '👍 Você foi adicionado à fila. Aguarde o envio.');
            }
            return; 
        }

        logRemuneracao(numero, `Iniciou o fluxo de remuneração. Aguardando matrícula.`);
        etapas[numero] = { etapa: 'remuneracao' };
        escreverJson(ETAPAS_PATH, etapas);
        await client.sendMessage(numero, 'Por favor, informe sua *matrícula* para continuar (apenas números).');

    } catch (error) {
        console.error(`[${getTime()}] ❌ Erro Crítico em enviarRemuneracao:`, error);
        await client.sendMessage(numero, '❌ Ocorreu um erro interno ao processar sua solicitação.');
    }
}

module.exports = enviarRemuneracao;