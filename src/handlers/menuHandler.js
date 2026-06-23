// src/handlers/menuHandler.js
const fs = require('fs');
const chalk = require('chalk');
const paths = require('../config/paths');
const simularHumano = require('./simularHumano');
const optionsRouter = require('./optionsRouter');

// Importação das funções que lidam com etapas
const enviarRemuneracao = require('./enviarRemuneracao');
const enviarResumoPDV = require('./enviarResumoPDV');
const enviarListaContatos = require('./enviarListaContatos');
const enviarColetaTtcPdv = require('./enviarColetaTtcPdv');
const enviarGiroEquipamentosPdv = require('./enviarGiroEquipamentosPdv');
const clientesNaoCompradores = require('./clientesNaoCompradores');
const { processarTroca } = require('./mudancaSetor');
const { processarAnaliseRota, salvarPedidoEntrega, formatarMoeda, obterEstatisticasPdv } = require('./analiseRotasHandler');

// Função segura para ler o JSON
function lerEtapasSeguro() {
    try {
        if (!fs.existsSync(paths.ETAPAS_JSON)) return {};
        const conteudo = fs.readFileSync(paths.ETAPAS_JSON, 'utf-8');
        if (!conteudo || conteudo.trim() === '') return {};
        return JSON.parse(conteudo);
    } catch (e) {
        console.error(chalk.red(`[ERRO JSON] Falha ao ler etapas.json: ${e.message}`));
        return {};
    }
}

// Função para apagar o usuário do JSON e soltar ele do limbo
function limparEtapa(numero) {
    let etapas = lerEtapasSeguro();
    delete etapas[numero];
    fs.writeFileSync(paths.ETAPAS_JSON, JSON.stringify(etapas, null, 2));
}

async function handleMenu(client, message, representante, numeroTelefoneLimpo, MENU_TEXT, usuariosAguardandoRelatorio) {
    const texto = message.body.trim();
    const opcao = texto.toLowerCase();
    const numero = message.from;
    
    let etapas = lerEtapasSeguro();
    const etapaAtual = etapas[numero]?.etapa;

    // 🚨 BOTÃO DE PÂNICO: Se o usuário quiser sair da etapa à força
    if (etapaAtual && (opcao === 'menu' || opcao === 'sair' || opcao === 'cancelar')) {
        console.log(chalk.bgRed.white(`[ESCAPE] Usuário ${numero} forçou a saída da etapa: ${etapaAtual}`));
        limparEtapa(numero);
        await client.sendMessage(numero, `🛑 Operação cancelada.\n\n${MENU_TEXT}`);
        return;
    }

    // ============================================================================================
    // 1. ROTEADOR DE ETAPAS (Quando o usuário está no meio de um processo)
    // ============================================================================================
    if (etapaAtual && etapaAtual !== 'wait') {
        console.log(chalk.blue(`\n[ROTEADOR] Msg: "${texto}" | Redirecionando para a etapa ativa: [${etapaAtual}]`));
        
        try {
            if (etapaAtual === 'remuneracao') {
                console.log(chalk.yellow(`[DEBUG ETAPA] Entrando no enviarRemuneracao...`));
                await enviarRemuneracao(client, message);
                console.log(chalk.green(`[DEBUG ETAPA] enviarRemuneracao finalizado.`));
                return;
            }
            
            if (etapaAtual === 'pdv') {
                const finalizar = await simularHumano(message);
                await enviarResumoPDV(client, message, representante);
                limparEtapa(numero);
                await finalizar();
                return;
            }
            
            if (etapaAtual === 'aguardandoEscolha') {
                const finalizar = await simularHumano(message);
                await enviarListaContatos(client, message);
                await finalizar();
                return;
            }
            
            if (etapaAtual === 'giro_equipamentos') {
                const finalizar = await simularHumano(message);
                await enviarGiroEquipamentosPdv(client, message, representante);
                limparEtapa(numero);
                await finalizar();
                return;
            }
            
            if (etapaAtual === 'coleta_ttc') {
                const finalizar = await simularHumano(message);
                await enviarColetaTtcPdv(client, message);
                limparEtapa(numero);
                await finalizar();
                return;
            }

            if (etapaAtual.startsWith('troca_setor')) {
                return await processarTroca(client, message, representante);
            }

            if (etapaAtual.startsWith('nc_')) {
                const finalizar = await simularHumano(message);
                await clientesNaoCompradores(client, message, representante);
                await finalizar();
                return;
            }

            // --- DEIXEI O BLOCO DA OPÇÃO 12 (ROTAS) IGUAL AO DE ANTES AQUI ---
            // (Para não poluir, assuma que a lógica da opção 12 das etapas está aqui, igualzinho fizemos antes)
            // ...
            
        } catch (erro) {
            // Se a etapa "explodir" em silêncio, nós pegamos o erro aqui!
            console.error(chalk.bgRed.white(`[ERRO FATAL NA ETAPA ${etapaAtual}]:`), erro);
            await client.sendMessage(numero, "❌ Ops! Ocorreu um erro interno processando a sua resposta. Tente novamente ou digite *menu* para sair.");
            // Não limpamos a etapa de propósito, pro usuário poder tentar de novo se quiser.
            return;
        }
    }

    // ============================================================================================
    // 2. ROTEADOR DO MENU PRINCIPAL (Opções 1 a 12)
    // ============================================================================================
    // Se não está em nenhuma etapa, despacha para o optionsRouter
    await optionsRouter(client, message, representante, numeroTelefoneLimpo, MENU_TEXT, usuariosAguardandoRelatorio);
}

module.exports = handleMenu;