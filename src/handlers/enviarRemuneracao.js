const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');

// Importa as funções e caminhos do nosso módulo de utilitários
const { lerJson, escreverJson, REPRESENTANTES_PATH, ETAPAS_PATH } = require('../utils/dataHandler.js');

// --- Caminhos Específicos deste Módulo ---
const SENHA_REMUNERACAO_PATH = path.join(__dirname, '..', '..', 'data', 'senhaRemuneracao.json');

// --- Variáveis para Gerenciamento da Fila de Remuneração ---
let isSendingRemuneracao = false;
const remuneracaoSendQueue = [];

// --- Função para processar a próxima requisição na fila ---
async function processNextRemuneracaoRequest() {
    if (remuneracaoSendQueue.length === 0) {
        isSendingRemuneracao = false;
        console.log('[Remuneração Fila] Fila vazia. Processamento em pausa.');
        return;
    }

    isSendingRemuneracao = true;
    const { client, message, matricula } = remuneracaoSendQueue.shift();
    const numero = message.from;

    console.log(`[Remuneração Fila] Processando solicitação para ${numero} com matrícula ${matricula}`);

    try {
        const representantes = lerJson(REPRESENTANTES_PATH, []);
        const telefone = numero.replace('@c.us', '');
        const representante = representantes.find(r => r.telefone === telefone);

        // Verificações que já foram feitas, mas é bom garantir
        if (!representante || !representante.setor) {
             await client.sendMessage(numero, '❌ Ocorreu um erro ao recuperar seus dados. Tente novamente.');
             return; // Não continua se os dados essenciais sumiram
        }
        
        const setor = representante.setor.toString();
        
        // --- Caminho UNC para o arquivo ---
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

        // --- Envia o arquivo PDF ---
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
        // --- Processa o próximo da fila, independentemente de sucesso ou falha ---
        processNextRemuneracaoRequest();
    }
}


// --- Função Principal Exportada (agora gerencia a conversa e a fila) ---
async function enviarRemuneracao(client, message) {
    const numero = message.from;
    const texto = message.body.trim();

    let etapas = lerJson(ETAPAS_PATH, {});
    const etapaAtual = etapas[numero] ? etapas[numero].etapa : undefined;

    // --- Lógica para cancelar a operação a qualquer momento ---
    if (texto.toLowerCase() === 'cancelar' || texto.toLowerCase() === 'sair') {
        if (etapas[numero]) {
            delete etapas[numero];
            escreverJson(ETAPAS_PATH, etapas);
            await client.sendMessage(numero, '🚫 Operação de remuneração cancelada.');
        } else {
            await client.sendMessage(numero, 'Não há nenhuma operação em andamento para cancelar.');
        }
        return;
    }

    // Se a etapa não é 'remuneracao', (re)inicia o fluxo
    if (!etapaAtual || etapaAtual !== 'remuneracao') {
        etapas[numero] = { etapa: 'remuneracao' };
        escreverJson(ETAPAS_PATH, etapas);
        await client.sendMessage(numero, 'Por favor, informe sua *matrícula* para continuar (apenas números).');
        return;
    }

    // --- Etapa 'remuneracao': Processa a matrícula e adiciona à fila ---
    const matricula = texto.replace(/\D/g, '');

    if (!/^\d+$/.test(matricula) || matricula.length === 0) {
        await client.sendMessage(numero, '❗ Por favor, digite apenas os *números* da sua matrícula.');
        return;
    }
    
    // Validações antes de adicionar à fila
    const representantes = lerJson(REPRESENTANTES_PATH, []);
    const senhaRemuneracao = lerJson(SENHA_REMUNERACAO_PATH, []);
    const telefone = numero.replace('@c.us', '');
    const representante = representantes.find(r => r.telefone === telefone);

    if (!representante) {
        await client.sendMessage(numero, '❌ Seu número não está registrado.');
        delete etapas[numero];
        escreverJson(ETAPAS_PATH, etapas);
        return;
    }

    const setor = representante.setor?.toString();
    if (!setor) {
        await client.sendMessage(numero, '❌ Seu setor não foi encontrado no cadastro.');
        delete etapas[numero];
        escreverJson(ETAPAS_PATH, etapas);
        return;
    }

    const credencialValida = senhaRemuneracao.find(
        item => item.setor?.toString() === setor && item.senha?.toString() === matricula
    );

    if (!credencialValida) {
        await client.sendMessage(numero, '❌ Matrícula incorreta para o seu setor. Para tentar novamente, digite a opção no menu.');
        delete etapas[numero];
        escreverJson(ETAPAS_PATH, etapas);
        return;
    }

    // --- Lógica de Fila ---
    // Limpa a etapa do usuário, pois a validação foi um sucesso
    delete etapas[numero];
    escreverJson(ETAPAS_PATH, etapas);

    // Adiciona a solicitação à fila
    remuneracaoSendQueue.push({ client, message, matricula });
    console.log(`[Remuneração] Usuário ${numero} adicionado à fila.`);

    if (!isSendingRemuneracao) {
        // Se ninguém estiver sendo processado, inicia o processo
        processNextRemuneracaoRequest();
    } else {
        // Se já houver um processo, apenas avisa o usuário
        await client.sendMessage(numero, '👍 Você foi adicionado à fila. Já estou enviando outra planilha e a sua será a próxima!');
    }
}

module.exports = enviarRemuneracao;