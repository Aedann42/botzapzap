const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');

// --- Caminhos centralizados para facilitar a manutenção ---
const ETAPAS_PATH = path.join(__dirname, 'etapas.json');
const REPRESENTANTES_PATH = path.join(__dirname, 'representantes.json');
const SENHA_REMUNERACAO_PATH = path.join(__dirname, 'senhaRemuneracao.json');

// --- Função auxiliar para ler JSON de forma segura ---
function lerJson(filePath, defaultValue = {}) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (error) {
        console.error(`Erro ao ler o arquivo JSON ${filePath}:`, error);
        // Opcional: recriar arquivo com valor padrão se houver erro de parsing
        fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
    }
    return defaultValue;
}

// --- Funções para carregar e salvar as etapas ---
function carregarEtapas() {
    return lerJson(ETAPAS_PATH, {});
}

function salvarEtapas(etapas) {
    try {
        fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
    } catch (error) {
        console.error(`Erro ao salvar o arquivo de etapas ${ETAPAS_PATH}:`, error);
    }
}

// --- Função principal para enviar a remuneração ---
async function enviarRemuneracao(client, message) {
    const numero = message.from;
    const texto = message.body.trim();

    let etapas = carregarEtapas();
    const etapaAtual = etapas[numero] ? etapas[numero].etapa : undefined;

    // --- Lógica para cancelar a operação a qualquer momento ---
    if (texto.toLowerCase() === 'cancelar' || texto.toLowerCase() === 'sair') {
        if (etapas[numero]) {
            delete etapas[numero];
            salvarEtapas(etapas);
            await client.sendMessage(numero, '🚫 Operação de remuneração cancelada. Se precisar novamente, digite a opção no menu.');
        } else {
            await client.sendMessage(numero, 'Não há nenhuma operação em andamento para cancelar.');
        }
        return;
    }

    console.log(`[Remuneração] Recebido texto: "${texto}" de ${numero}. Etapa atual: ${etapaAtual}`);

    // --- Se não há uma etapa definida ou a etapa não é 'remuneracao', inicia o fluxo ---
    // Isso pode acontecer se o bot for reiniciado ou se a função for chamada fora do fluxo esperado.
    if (!etapaAtual || etapaAtual !== 'remuneracao') {
        etapas[numero] = { etapa: 'remuneracao' }; // Define a etapa
        salvarEtapas(etapas);
        await client.sendMessage(numero, 'Por favor, informe sua *matrícula* para continuar, lembrando que só pode ter os números na próxima mensagem!');
        return;
    }

    // --- Processa a matrícula quando a etapa é 'remuneracao' ---
    try {
        const matricula = texto.replace(/\D/g, ''); // Remove tudo que não for número

        // Valida se a matrícula contém apenas números após a limpeza
        if (!/^\d+$/.test(matricula)) {
            await client.sendMessage(numero, '❗ Por favor, digite apenas os *números* da sua matrícula.');
            // Não exclui a etapa, esperando uma nova tentativa válida
            return;
        }

        const representantes = lerJson(REPRESENTANTES_PATH, []);
        const senhaRemuneracao = lerJson(SENHA_REMUNERACAO_PATH, []);

        const telefone = numero.replace('@c.us', '');
        const representante = representantes.find(r => r.telefone === telefone);

        if (!representante) {
            await client.sendMessage(numero, '❌ Seu número não está registrado como representante. Não é possível consultar a remuneração.');
            delete etapas[numero];
            salvarEtapas(etapas);
            return;
        }

        const setor = representante.setor?.toString(); // Usa optional chaining para segurança

        if (!setor) {
            await client.sendMessage(numero, '❌ Seu setor não foi encontrado no cadastro. Por favor, contate o administrador.');
            delete etapas[numero];
            salvarEtapas(etapas);
            return;
        }

        const credencialValida = senhaRemuneracao.find(
            item =>
                item.setor?.toString() === setor &&
                item.senha?.toString() === matricula
        );

        if (!credencialValida) {
            await client.sendMessage(numero, '❌ Matrícula incorreta para o seu setor. Por favor, tente novamente digitando a opção 4 ou digite "cancelar".');
            // Não exclui a etapa para permitir nova tentativa
            return;
        }

        // --- Caminho UNC para o arquivo (exemplo) ---
        // Certifique-se de que o caminho está correto para o seu ambiente
        const arquivoPath = path.join(
            '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2025\\7 - JULHO\\_GERADOR PDF\\REMUNERACAO',
            setor,
            `${setor}.pdf`
        );

        console.log("📁 Tentando acessar arquivo em:", arquivoPath);

        if (!fs.existsSync(arquivoPath)) {
            await client.sendMessage(numero, `❌ A planilha de remuneração para o setor ${setor} não foi encontrada. Por favor, tente novamente mais tarde ou contate o administrador.`);
            delete etapas[numero];
            salvarEtapas(etapas);
            return;
        }

        // --- Envia o arquivo PDF ---
        const media = MessageMedia.fromFilePath(arquivoPath);
        await client.sendMessage(numero, media, {
            sendMediaAsDocument: true, // Envia como documento para facilitar download
            caption: `📄 Sua planilha de remuneração do setor ${setor} está aqui!`
        });

        await client.sendMessage(numero, '✅ Sua planilha foi enviada com sucesso!');
        await client.sendSeen(numero); // <- MARCA COMO LIDA
        console.log("✅ Arquivo de remuneração enviado com sucesso.");

    } catch (err) {
        console.error("❌ Erro inesperado ao processar remuneração:", err);
        await client.sendMessage(numero, "❌ Ocorreu um erro ao enviar sua planilha de remuneração. Por favor, tente novamente mais tarde.");
    } finally {
        // --- Sempre limpa a etapa após tentar enviar, seja sucesso ou falha ---
        delete etapas[numero];
        salvarEtapas(etapas);
        console.log(`[Remuneração] Etapa finalizada para ${numero}.`);
    }
}

module.exports = enviarRemuneracao;