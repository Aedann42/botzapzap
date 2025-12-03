// src/handlers/enviarRemuneracao.js (VERSÃO FINAL - BUSCA HÍBRIDA + PATH CORRIGIDO)

const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const { escreverJson, ETAPAS_PATH } = require('../utils/dataHandler.js');

// 🚨 CORREÇÃO DE CAMINHOS: Força o uso da pasta 'data' na raiz para evitar erro de leitura
// process.cwd() pega a pasta onde o bot foi iniciado (C:\botzapzap\botzapzap)
const CAMINHO_REPRESENTANTES = path.join(process.cwd(), 'data', 'representantes.json');
const CAMINHO_SENHAS = path.join(process.cwd(), 'data', 'senhaRemuneracao.json');

let isSendingRemuneracao = false;
const remuneracaoSendQueue = [];

// Função auxiliar para ler JSON com segurança
function lerJsonSeguro(caminho) {
    try {
        const data = fs.readFileSync(caminho, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        console.error(`Erro ao ler JSON em ${caminho}:`, e);
        return [];
    }
}

// ✅ FUNÇÃO PARA ENVIAR MÚLTIPLOS ARQUIVOS
async function processNextRemuneracaoRequest() {
    if (remuneracaoSendQueue.length === 0) {
        isSendingRemuneracao = false;
        console.log('[Remuneração Fila] Fila vazia. Processamento em pausa.');
        return;
    }

    isSendingRemuneracao = true;
    const { client, message, matricula } = remuneracaoSendQueue.shift();
    const numero = message.from; 

    console.log(`[Remuneração Fila] Processando solicitação para ${numero} (Matrícula: ${matricula})`);

    try {
        // --- EXTRAÇÃO MANUAL DE TELEFONE ---
        let telefoneLimpo;
        if (numero.includes('@')) {
            telefoneLimpo = numero.split('@')[0];
        } else {
            telefoneLimpo = numero;
        }

        const representantes = lerJsonSeguro(CAMINHO_REPRESENTANTES);
        
        // --- 🚀 BUSCA HÍBRIDA (A CORREÇÃO PRINCIPAL) ---
        // Procura pelo telefone OU pelo LID
        const representante = representantes.find(r => 
            String(r.telefone).trim() === String(telefoneLimpo).trim() || 
            (r.lid && r.lid === numero)
        );

        if (!representante || !representante.setor) {
            console.log(`[Remuneração] Erro: Usuário não encontrado ou sem setor. ID: ${numero}`);
            await client.sendMessage(numero, '❌ Seus dados não foram encontrados no cadastro de representantes ou você não possui setor definido.');
            return; 
        }
        
        const setor = representante.setor.toString();
        
        // 1. Caminho para o DIRETÓRIO (pasta) do setor
        const diretorioPath = path.join(
            String.raw`\\VSRV-DC01\Arquivos\VENDAS\METAS E PROJETOS\2025\12 - dezembro\_GERADOR PDF\REMUNERACAO`,
            setor
        );

        console.log("📁 Tentando acessar a pasta em:", diretorioPath);

        // 2. Verifica se a PASTA existe
        if (!fs.existsSync(diretorioPath)) {
            await client.sendMessage(numero, `❌ A pasta de remuneração para o setor ${setor} não foi encontrada.`);
            return; 
        }

        // 3. Lê todos os arquivos da pasta
        const arquivos = fs.readdirSync(diretorioPath);

        if (arquivos.length === 0) {
            await client.sendMessage(numero, `⚠️ A pasta do setor ${setor} foi encontrada, mas está vazia. Nenhum arquivo para enviar.`);
            return; 
        }

        await client.sendMessage(numero, `🔄 Encontrei !!! 🏋️ Preparando para envio, aguarde ⏰...`);

        // 4. Faz um loop e envia CADA arquivo encontrado
        for (const nomeArquivo of arquivos) {
            const caminhoCompletoArquivo = path.join(diretorioPath, nomeArquivo);
            
            // Ignora arquivos temporários ou de sistema
            if (nomeArquivo.startsWith('~') || nomeArquivo.startsWith('.')|| nomeArquivo.toLowerCase() ==='thumbs.db') {
                continue; 
            }

            const media = MessageMedia.fromFilePath(caminhoCompletoArquivo);
            
            console.log(`[Remuneração Fila] Enviando arquivo "${nomeArquivo}" para ${numero}.`);
            await client.sendMessage(numero, media, {
                sendMediaAsDocument: true,
                caption: `📄 Segue o arquivo: ${nomeArquivo}`
            });
        }

        await client.sendMessage(numero, '✅ Todos os seus arquivos foram enviados com sucesso!');
        await client.sendSeen(numero);
        console.log(`[Remuneração Fila] Arquivos enviados com sucesso para ${numero}.`);

    } catch (err) {
        console.error("❌ Erro inesperado ao processar remuneração na fila:", err);
        await client.sendMessage(numero, "❌ Ocorreu um erro ao enviar sua planilha de remuneração. Por favor, tente novamente mais tarde.");
    } finally {
        // Chama o próximo da fila
        processNextRemuneracaoRequest();
    }
}

async function enviarRemuneracao(client, message) {
    const numero = message.from; 
    const texto = message.body.trim();
    const isOperatorRequest = message._operator_triggered === true;

    // Função auxiliar local para ler etapas (já que mudamos imports)
    function lerEtapas() {
        try { return JSON.parse(fs.readFileSync(ETAPAS_PATH, 'utf-8')); } catch { return {}; }
    }
    
    let etapas = lerEtapas();
    const etapaAtual = etapas[numero] ? etapas[numero].etapa : undefined;

    if (texto.toLowerCase() === 'cancelar' || texto.toLowerCase() === 'sair') {
        if (etapas[numero]) {
            delete etapas[numero];
            escreverJson(ETAPAS_PATH, etapas);
            await client.sendMessage(numero, '🚫 Operação de remuneração cancelada.');
        }
        return;
    }

    // --- CAMINHO 1: REQUISIÇÃO DIRETA DO OPERADOR ---
    if (isOperatorRequest) {
        console.log(`[OPERADOR] Requisição de remuneração para ${numero}`);
        
        let telefoneLimpo = numero.includes('@') ? numero.split('@')[0] : numero;
        
        const representantes = lerJsonSeguro(CAMINHO_REPRESENTANTES);
        // BUSCA HÍBRIDA AQUI TAMBÉM
        const representante = representantes.find(r => 
            String(r.telefone).trim() === String(telefoneLimpo).trim() || 
            (r.lid && r.lid === numero)
        );

        if (!representante || !representante.setor) {
            await client.sendMessage(numero, '❌ Cadastro do representante não encontrado ou sem setor definido.');
            return;
        }

        // Adiciona à fila diretamente
        remuneracaoSendQueue.push({ client, message, matricula: 'BYPASS_OPERADOR' });

        if (!isSendingRemuneracao) {
            processNextRemuneracaoRequest();
        } else {
            await client.sendMessage(numero, '👍 Você foi adicionado à fila.');
        }
        return; 
    }

    // --- CAMINHO 2: USUÁRIO RESPONDENDO A MATRÍCULA ---
    if (etapaAtual === 'remuneracao') {
        const matricula = texto.replace(/\D/g, '');

        if (!/^\d+$/.test(matricula) || matricula.length === 0) {
            await client.sendMessage(numero, '❗ Por favor, digite apenas os *números* da sua matrícula.');
            return;
        }
        
        let telefoneLimpo = numero.includes('@') ? numero.split('@')[0] : numero;
        
        const representantes = lerJsonSeguro(CAMINHO_REPRESENTANTES);
        const senhaRemuneracao = lerJsonSeguro(CAMINHO_SENHAS);
        
        // BUSCA HÍBRIDA
        const representante = representantes.find(r => 
            String(r.telefone).trim() === String(telefoneLimpo).trim() || 
            (r.lid && r.lid === numero)
        );

        const setor = representante?.setor?.toString();

        const credencialValida = senhaRemuneracao.find(
            item => item.setor?.toString() === setor && item.senha?.toString() === matricula
        );

        if (!credencialValida) {
            await client.sendMessage(numero, '❌ Matrícula incorreta para o seu setor.');
            delete etapas[numero];
            escreverJson(ETAPAS_PATH, etapas);
            return;
        }

        delete etapas[numero];
        escreverJson(ETAPAS_PATH, etapas);

        remuneracaoSendQueue.push({ client, message, matricula });
        console.log(`[Remuneração] Usuário ${numero} adicionado à fila.`);

        if (!isSendingRemuneracao) {
            processNextRemuneracaoRequest();
        } else {
            await client.sendMessage(numero, '👍 Você foi adicionado à fila. Aguarde o envio.');
        }
        return; 
    }

    // --- CAMINHO 3: USUÁRIO INICIANDO O FLUXO NORMALMENTE ---
    etapas[numero] = { etapa: 'remuneracao' };
    escreverJson(ETAPAS_PATH, etapas);
    await client.sendMessage(numero, 'Por favor, informe sua *matrícula* para continuar (apenas números).');
}

module.exports = enviarRemuneracao;