const fs = require('fs');
const path = require('path');
const { logAcao } = require('../utils/logger');
const { registrarUso, ETAPAS_PATH } = require('../utils/dataHandler');
const simularHumano = require('./simularHumano');
const verificarArquivoAtualizado = require('../services/checkDateReports');

// Importação de TODOS os Handlers
const enviarRelatoriosPdf = require('./enviarRelatoriosPdf');
const enviarRelatoriosImagem = require('./enviarRelatoriosImagem');
const enviarRemuneracao = require('./enviarRemuneracao');
const enviarResumoPDV = require('./enviarResumoPDV');
const enviarListaContatos = require('./enviarListaContatos');
const enviarCts = require('./enviarCts');
const enviarColetaTtcPdv = require('./enviarColetaTtcPdv');
const enviarGiroEquipamentosPdv = require('./enviarGiroEquipamentosPdv');
const clientesNaoCompradores = require('./clientesNaoCompradores');
const { processarTroca } = require('./mudancaSetor');

async function handleMenu(client, message, representante, numeroTelefoneLimpo, MENU_TEXT, usuariosAguardandoRelatorio) {
    const texto = message.body.trim();
    const opcao = texto.toLowerCase();
    const numero = message.from;
    const MSG_INDISPONIVEL = '⚠️ Relatórios ainda não gerados. Avisarei quando estiverem prontos! 🤖';
    
    let etapas = {};
    try { etapas = JSON.parse(fs.readFileSync(ETAPAS_PATH, 'utf-8') || '{}'); } catch (e) {}
    const etapaAtual = etapas[numero]?.etapa;

    // ============================================================================================
    // 1. PROCESSAR RESPOSTAS DE ETAPAS ATIVAS (PDV, Remuneração, etc.)
    // ============================================================================================
    if (etapaAtual && etapaAtual !== 'wait') {
        if (etapaAtual === 'remuneracao') return await enviarRemuneracao(client, message);
        
        if (etapaAtual === 'pdv') {
            const finalizar = await simularHumano(message);
            await enviarResumoPDV(client, message, representante);
            delete etapas[numero];
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
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
            delete etapas[numero];
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await finalizar();
            return;
        }
        
        if (etapaAtual === 'coleta_ttc') {
            const finalizar = await simularHumano(message);
            await enviarColetaTtcPdv(client, message);
            delete etapas[numero];
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await finalizar();
            return;
        }

        if (etapaAtual.startsWith('troca_setor')) {
            return await processarTroca(client, message, representante);
        }

        if (etapaAtual === 'clientes_nao_compradores') {
            const finalizar = await simularHumano(message);
            await clientesNaoCompradores(client, message, representante);
            delete etapas[numero];
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await finalizar();
            return;
        }
    }

    // ============================================================================================
    // 2. SWITCH DO MENU PRINCIPAL (Opções 1 a 11)
    // ============================================================================================
    const CAMINHO_CHECK_PDF = String.raw`\\VSRV-DC01\Arquivos\VENDAS\METAS E PROJETOS\2026\3 - MARÇO\_GERADOR PDF\ACOMPS\410\410_Volume.pdf`;
    const CAMINHO_CHECK_IMAGEM = String.raw`\\VSRV-DC01\Arquivos\VENDAS\METAS E PROJETOS\2026\3 - MARÇO\_GERADOR PDF\IMAGENS\GV4\MATINAL_GV4_page_1.jpg`;

    switch (opcao) {
        case '1': {
            const pronto = await verificarArquivoAtualizado(CAMINHO_CHECK_PDF);
            if (pronto) {
                const finalizar = await simularHumano(message);
                await enviarRelatoriosPdf(client, message, representante);
                await finalizar();
                await registrarUso(numeroTelefoneLimpo, 'Relatório PDF', representante.setor);
            } else {
                await client.sendMessage(numero, MSG_INDISPONIVEL);
                usuariosAguardandoRelatorio[numero] = 'pdf';
            }
            break;
        }
        case '2': {
            const pronto = await verificarArquivoAtualizado(CAMINHO_CHECK_IMAGEM);
            if (pronto) {
                const finalizar = await simularHumano(message);
                await enviarRelatoriosImagem(client, message, representante);
                await finalizar();
                await registrarUso(numeroTelefoneLimpo, 'Relatório Imagem', representante.setor);
            } else {
                await client.sendMessage(numero, MSG_INDISPONIVEL);
                usuariosAguardandoRelatorio[numero] = 'imagem';
            }
            break;
        }
        case '3': {
            const finalizar = await simularHumano(message, 'recording');
            await client.sendMessage(numero, 'Envie mensagem para o Yuri APR 3299982517 com nb e print do problema');
            await finalizar();
            break;
        }
        case '4': {
            const finalizar = await simularHumano(message);
            await enviarRemuneracao(client, message);
            await finalizar();
            break;
        }
        case '5': {
            const finalizar = await simularHumano(message);
            await client.sendMessage(numero, 'Envie o código do PDV (apenas números):');
            etapas[numero] = { etapa: 'pdv' };
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await finalizar();
            break;
        }
        case '6': {
            const finalizar = await simularHumano(message);
            await enviarListaContatos(client, message);
            await finalizar();
            break;
        }
        case '7': {
            const finalizar = await simularHumano(message);
            await client.sendMessage(numero, 'Envie o código do PDV para Coleta TTC:');
            etapas[numero] = { etapa: 'coleta_ttc' };
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await finalizar();
            break;
        }
        case '8': {
            const finalizar = await simularHumano(message);
            await enviarCts(client, message, representante);
            await finalizar();
            break;
        }
        case '9': {
            const finalizar = await simularHumano(message);
            await client.sendMessage(numero, 'Envie o código do PDV para Giro 🤑:');
            etapas[numero] = { etapa: 'giro_equipamentos' };
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await finalizar();
            break;
        }
        case '10': {
            const finalizar = await simularHumano(message);
            await client.sendMessage(numero, '🔄 *CORRIGIR SETOR*\n\nDigite apenas o *NÚMERO DO SETOR* novo:');
            etapas[numero] = { etapa: 'troca_setor_passo1' };
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await finalizar();
            break;
        }
        case '11': {
            const finalizar = await simularHumano(message);
            const menuInd = `📉 *CLIENTES NÃO COMPRADORES*\n\nEscolha o indicador (1-11):\n\n*1* - AMBEV\n*2* - MKTP\n*3* - CERV\n*4* - MATCH\n*5* - CERV RGB\n*6* - CERV 1/1\n*7* - CERV 300\n*8* - MEGABRANDS\n*9* - NAB\n*10* - RED BULL\n*11* - R$ MKTP`;
            await client.sendMessage(numero, menuInd);
            etapas[numero] = { etapa: 'clientes_nao_compradores' };
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await finalizar();
            break;
        }
        case 'menu': {
            await client.sendMessage(numero, MENU_TEXT);
            break;
        }
        default: {
            if (!texto.startsWith('/')) {
                await client.sendMessage(numero, `❌ Opção inválida.\n\n${MENU_TEXT}`);
            }
            break;
        }
    }
}

module.exports = handleMenu;