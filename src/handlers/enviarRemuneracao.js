// enviarRemuneracao.js (CORRIGIDO PARA LIDs)

const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const { lerJson, escreverJson, REPRESENTANTES_PATH, ETAPAS_PATH } = require('../utils/dataHandler.js');

const SENHA_REMUNERACAO_PATH = path.join(__dirname, '..', '..', 'data', 'senhaRemuneracao.json');
let isSendingRemuneracao = false;
const remuneracaoSendQueue = [];

// ✅ FUNÇÃO MODIFICADA PARA ENVIAR MÚLTIPLOS ARQUIVOS
async function processNextRemuneracaoRequest() {
    if (remuneracaoSendQueue.length === 0) {
        isSendingRemuneracao = false;
        console.log('[Remuneração Fila] Fila vazia. Processamento em pausa.');
        return;
    }

    isSendingRemuneracao = true;
    const { client, message, matricula } = remuneracaoSendQueue.shift();
    const numero = message.from; // Este é o LID

    console.log(`[Remuneração Fila] Processando solicitação para ${numero} (Matrícula: ${matricula})`);

    try {
        // --- 🚀 CORREÇÃO LID (1/3) ---
        // Precisamos obter o contato para traduzir o LID para o número de telefone
        const contact = const variavel = contact.number;;
        const telefoneLimpo = contact.number; // Este é o número de telefone real (ex: 5532...)
        
        if (!telefoneLimpo) {
            console.error(`[Remuneração Fila] Falha ao obter número de telefone do ID: ${numero}`);
            await client.sendMessage(numero, '❌ Ocorreu um erro ao recuperar seus dados. Tente novamente.');
            return; // Finaliza o processamento
        }
        // --- FIM CORREÇÃO ---

        const representantes = lerJson(REPRESENTANTES_PATH, []);
        
        // const telefone = numero.replace('@c.us', ''); // <-- LINHA ANTIGA
        // Usamos o 'telefoneLimpo' obtido acima
        const representante = representantes.find(r => r.telefone === telefoneLimpo); 

        if (!representante || !representante.setor) {
            await client.sendMessage(numero, '❌ Ocorreu um erro ao recuperar seus dados (representante não encontrado pelo telefone). Tente novamente.');
            return; // Finaliza o processamento para este usuário
        }
        
        const setor = representante.setor.toString();
        
        // 1. Caminho para o DIRETÓRIO (pasta) do setor
        const diretorioPath = path.join(
            String.raw`\\VSRV-DC01\Arquivos\VENDAS\METAS E PROJETOS\2025\11 - NOVEMBRO\_GERADOR PDF\REMUNERACAO`,
            setor
        );

        console.log("📁 Tentando acessar a pasta em:", diretorioPath);

        // 2. Verifica se a PASTA existe
        if (!fs.existsSync(diretorioPath)) {
            await client.sendMessage(numero, `❌ A pasta de remuneração para o setor ${setor} não foi encontrada. Por favor, contate o administrador.`);
            return; // Finaliza o processamento para este usuário
        }

        // 3. Lê todos os arquivos da pasta
        const arquivos = fs.readdirSync(diretorioPath);

        if (arquivos.length === 0) {
            await client.sendMessage(numero, `⚠️ A pasta do setor ${setor} foi encontrada, mas está vazia. Nenhum arquivo para enviar.`);
            return; // Finaliza o processamento para este usuário
        }

        await client.sendMessage(numero, `🔄 Encontrei !!! 🏋️ Preparando para envio, aguarde ⏰...`);

        // 4. Faz um loop e envia CADA arquivo encontrado
        for (const nomeArquivo of arquivos) {
            const caminhoCompletoArquivo = path.join(diretorioPath, nomeArquivo);
            
            // Ignora arquivos temporários ou de sistema, se necessário
            if (nomeArquivo.startsWith('~') || nomeArquivo.startsWith('.')|| nomeArquivo.toLowerCase() ==='thumbs.db') {
                console.log(`[Remuneração Fila] Ignorando arquivos temporários: ${nomeArquivo}`);
                continue; // Pula para o próximo arquivo
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
        console.log(`[Remuneração Fila] ${arquivos.length} arquivo(s) enviados com sucesso para ${numero}.`);

    } catch (err) {
        console.error("❌ Erro inesperado ao processar remuneração na fila:", err);
        await client.sendMessage(numero, "❌ Ocorreu um erro ao enviar sua planilha de remuneração. Por favor, tente novamente mais tarde.");
    } finally {
        // Chama o próximo da fila, independentemente de sucesso ou falha
        processNextRemuneracaoRequest();
    }
}

// NENHUMA MUDANÇA DAQUI PARA BAIXO... EXCETO ONDE INDICADO
async function enviarRemuneracao(client, message) {
    const numero = message.from; // Este é o LID
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
        
        // --- 🚀 CORREÇÃO LID (2/3) ---
        // O mockMessage criado no index.js tem a função getContact()
        const contact = const variavel = contact.number;;
        const telefoneLimpo = contact.number;
        
        if (!telefoneLimpo) {
            console.error(`[Remuneração Operador] Falha ao obter número de telefone do ID: ${numero}`);
            await client.sendMessage(numero, '❌ Cadastro do representante não encontrado ou sem setor definido. Não é possível continuar.');
            return;
        }
        // --- FIM CORREÇÃO ---
        
        const representantes = lerJson(REPRESENTANTES_PATH, []);
        // const telefone = numero.replace('@c.us', ''); // <-- LINHA ANTIGA
        const representante = representantes.find(r => r.telefone === telefoneLimpo); // <-- LINHA CORRIGIDA

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
        
        // --- 🚀 CORREÇÃO LID (3/3) ---
        const contact = const variavel = contact.number;;
        const telefoneLimpo = contact.number;
        
        if (!telefoneLimpo) {
            console.error(`[Remuneração Matrícula] Falha ao obter número de telefone do ID: ${numero}`);
            await client.sendMessage(numero, '❌ Ocorreu um erro ao verificar seus dados. Tente novamente.');
            return;
        }
        // --- FIM CORREÇÃO ---
        
        const representantes = lerJson(REPRESENTANTES_PATH, []);
        const senhaRemuneracao = lerJson(SENHA_REMUNERACAO_PATH, []);
        
        // const telefone = numero.replace('@c.us', ''); // <-- LINHA ANTIGA
        const representante = representantes.find(r => r.telefone === telefoneLimpo); // <-- LINHA CORRIGIDA
        const setor = representante?.setor?.toString();

        const credencialValida = senhaRemuneracao.find(
            item => item.setor?.toString() === setor && item.senha?.toString() === matricula
        );

        if (!credencialValida) {
            // Se 'setor' for undefined (representante não encontrado), ele falhará aqui.
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