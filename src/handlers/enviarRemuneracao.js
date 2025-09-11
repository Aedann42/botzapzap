const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const { lerJson, escreverJson, REPRESENTANTES_PATH, ETAPAS_PATH } = require('../utils/dataHandler.js');

const SENHA_REMUNERACAO_PATH = path.join(__dirname, '..', '..', 'data', 'senhaRemuneracao.json');
let isSendingRemuneracao = false;
const remuneracaoSendQueue = [];

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
        const representantes = lerJson(REPRESENTANTES_PATH, []);
        const telefone = numero.replace('@c.us', '');
        const representante = representantes.find(r => r.telefone === telefone);

        if (!representante || !representante.setor) {
            await client.sendMessage(numero, '❌ Ocorreu um erro ao recuperar seus dados. Tente novamente.');
            return;
        }
        
        const setor = representante.setor.toString();
        
        const arquivoPath = path.join(
            String.raw`\\VSRV-DC01\Arquivos\VENDAS\METAS E PROJETOS\2025\9 - SETEMBRO\_GERADOR PDF\REMUNERACAO`,
            setor,
            `${setor}.pdf`
        );

        console.log("📁 Tentando acessar arquivo em:", arquivoPath);

        if (!fs.existsSync(arquivoPath)) {
            await client.sendMessage(numero, `❌ A planilha de remuneração para o setor ${setor} não foi encontrada. Por favor, contate o administrador.`);
            return;
        }

        await client.sendMessage(numero, '🔄 Sua planilha está sendo preparada para envio, aguarde...');
        const media = MessageMedia.fromFilePath(arquivoPath);
        await client.sendMessage(numero, media, {
            sendMediaAsDocument: true,
            caption: `📄 Sua planilha de remuneração do setor ${setor} está aqui!`
        });

        await client.sendMessage(numero, '✅ Sua planilha foi enviada com sucesso!');
        await client.sendSeen(numero);
        console.log(`[Remuneração Fila] Arquivo enviado com sucesso para ${numero}.`);
    } catch (err) {
        console.error("❌ Erro inesperado ao processar remuneração na fila:", err);
        await client.sendMessage(numero, "❌ Ocorreu um erro ao enviar sua planilha de remuneração. Por favor, tente novamente mais tarde.");
    } finally {
        processNextRemuneracaoRequest();
    }
}

async function enviarRemuneracao(client, message) {
    const numero = message.from;
    const texto = message.body.trim();
    const isOperatorRequest = message._operator_triggered === true;

    let etapas = lerJson(ETAPAS_PATH, {});
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
        console.log(`[OPERADOR] Requisição de remuneração para ${numero}, pulando validação.`);
        // Validações básicas de cadastro, mas sem pedir matrícula
        const representantes = lerJson(REPRESENTANTES_PATH, []);
        const telefone = numero.replace('@c.us', '');
        const representante = representantes.find(r => r.telefone === telefone);

        if (!representante || !representante.setor) {
            await client.sendMessage(numero, '❌ Cadastro do representante não encontrado ou sem setor definido. Não é possível continuar.');
            return;
        }

        // Adiciona à fila diretamente
        remuneracaoSendQueue.push({ client, message, matricula: 'BYPASS_OPERADOR' });
        console.log(`[Remuneração] Usuário ${numero} adicionado à fila pelo operador.`);

        if (!isSendingRemuneracao) {
            processNextRemuneracaoRequest();
        } else {
            await client.sendMessage(numero, '👍 Você foi adicionado à fila. Já estou enviando outra planilha e a sua será a próxima!');
        }
        return; // Finaliza aqui
    }

    // --- CAMINHO 2: USUÁRIO RESPONDENDO A MATRÍCULA ---
    if (etapaAtual === 'remuneracao') {
        const matricula = texto.replace(/\D/g, '');

        if (!/^\d+$/.test(matricula) || matricula.length === 0) {
            await client.sendMessage(numero, '❗ Por favor, digite apenas os *números* da sua matrícula.');
            return;
        }
        
        const representantes = lerJson(REPRESENTANTES_PATH, []);
        const senhaRemuneracao = lerJson(SENHA_REMUNERACAO_PATH, []);
        const telefone = numero.replace('@c.us', '');
        const representante = representantes.find(r => r.telefone === telefone);
        const setor = representante?.setor?.toString();

        const credencialValida = senhaRemuneracao.find(
            item => item.setor?.toString() === setor && item.senha?.toString() === matricula
        );

        if (!credencialValida) {
            await client.sendMessage(numero, '❌ Matrícula incorreta para o seu setor. Para tentar novamente, digite a opção no menu.');
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
            await client.sendMessage(numero, '👍 Você foi adicionado à fila. Já estou enviando outra planilha e a sua será a próxima!');
        }
        return; // Finaliza aqui
    }

    // --- CAMINHO 3: USUÁRIO INICIANDO O FLUXO NORMALMENTE ---
    etapas[numero] = { etapa: 'remuneracao' };
    escreverJson(ETAPAS_PATH, etapas);
    await client.sendMessage(numero, 'Por favor, informe sua *matrícula* para continuar (apenas números).');
}

module.exports = enviarRemuneracao;