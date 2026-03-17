const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
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
const { processarAnaliseRota, salvarPedidoEntrega, formatarMoeda, obterEstatisticasPdv } = require('./analiseRotasHandler');

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

        // --- ETAPAS DA OPÇÃO 12 (ANÁLISE DE ROTAS) ---
        
        // Etapa 12.1: Recebe o NB e devolve as Estatísticas
        if (etapaAtual === 'analiseRotas_inserirNb') {
            const textoUser = message.body.trim().replace(/\D/g, ''); 
            if (!textoUser) return client.sendMessage(numero, "⚠️ Digite apenas números.");

            const setorStr = representante.setor.toString();
            const primeiroDigito = parseInt(setorStr[0]);
            const prefixo = (primeiroDigito >= 4) ? '1046853_' : '296708_';
            const nbFormatado = prefixo + textoUser;

            await client.sendMessage(numero, "⏳ Buscando informações do cliente e dados da região...");

            // Busca as estatísticas de forma assíncrona
            const stats = await obterEstatisticasPdv(nbFormatado);

            if (stats.erro) {
                await client.sendMessage(numero, stats.erro);
                delete etapas[numero];
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
                return;
            }

            console.log(chalk.cyan(`🗺️ [ROTAS] Setor: ${representante.setor} | NB: ${nbFormatado} | Bairro: ${stats.bairro}`));

            // Formatação dos dias com a seta
            const qtdDias = stats.diasAtuais.length;
            const textoDias = qtdDias > 0 ? stats.diasAtuais.join(', ') : 'Nenhum';

            let msg = `📍 *DADOS DO CLIENTE:*\n`;
            msg += `🗝️ *Chave:* ${nbFormatado}\n`;
            msg += `🏪 *Fantasia:* ${stats.fantasia}\n`;
            msg += `💰 *Faturado em ${stats.historico.mes}:* ${formatarMoeda(stats.historico.faturamento)}\n`;
            msg += `📅 *Entregas Atuais:* ${qtdDias} dia(s) ➡️ ${textoDias}\n\n`;

            msg += `📊 *ESTATÍSTICAS DA REGIÃO*\n`;
            msg += `📍 *Bairro:* ${stats.bairro}\n`;
            msg += `🏙️ *Município:* ${stats.municipio}\n\n`;
            
            msg += `🚚 *Volume de Entregas da Ambev Ativas Neste Bairro:*\n`;
            msg += `▫️ SEG: ${stats.contagemDias.SEG} PDVs\n`;
            msg += `▫️ TER: ${stats.contagemDias.TER} PDVs\n`;
            msg += `▫️ QUA: ${stats.contagemDias.QUA} PDVs\n`;
            msg += `▫️ QUI: ${stats.contagemDias.QUI} PDVs\n`;
            msg += `▫️ SEX: ${stats.contagemDias.SEX} PDVs\n`;
            msg += `▫️ SAB: ${stats.contagemDias.SAB} PDVs\n\n`;

            msg += `📅 *Qual dia de entrega você deseja analisar e possivelmente adicionar?*\n\n`;
            msg += `1️⃣ - SEG\n2️⃣ - TER\n3️⃣ - QUA\n4️⃣ - QUI\n5️⃣ - SEX\n6️⃣ - SAB\n\n`;
            msg += `Digite o número correspondente:`;
                             
            await client.sendMessage(numero, msg);
            
            // Avança para perguntar o dia, mantendo o NB na memória
            etapas[numero] = { etapa: 'analiseRotas_qualDia', nbSalvo: nbFormatado };
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            return;
        }

        // Etapa 12.2: Recebe o Dia, Roteiriza e Aplica Travas
        if (etapaAtual === 'analiseRotas_qualDia') {
            const diasMapa = { '1': 'SEG', '2': 'TER', '3': 'QUA', '4': 'QUI', '5': 'SEX', '6': 'SAB' };
            const diaEscolhido = diasMapa[message.body.trim()];
            
            if (!diaEscolhido) return client.sendMessage(numero, "⚠️ Opção inválida. Digite um número de 1 a 6.");

            const nbSalvo = etapas[numero].nbSalvo;
            await client.sendMessage(numero, "⏳ Traçando rotas asfálticas e analisando histórico... Aguarde.");

            const resultado = await processarAnaliseRota(nbSalvo, diaEscolhido);

            if (resultado.erro) {
                await client.sendMessage(numero, resultado.erro);
                delete etapas[numero];
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
                return;
            }

            const { origem, vencedor, candidatos } = resultado;
            const distEmMetros = vencedor.distRuas;
            const latDest = parseFloat(vencedor['Check In - Latitude'].replace(',', '.')).toFixed(5);
            const lngDest = parseFloat(vencedor['Check In - Longitude'].replace(',', '.')).toFixed(5);

            let msg = `✅ *ANÁLISE DE ROTA CONCLUÍDA*\n\n`;
            
            msg += `📍 *DADOS DO SEU PDV (Origem):*\n`;
            msg += `🗝️ *Chave:* ${origem.chave}\n`;
            msg += `🌐 *Coord:* ${origem.lat.toFixed(5)}, ${origem.lng.toFixed(5)}\n`;
            msg += `📅 *Dias de entrega atuais:* ${origem.dias}\n`;
            msg += `💰 *Faturado em ${origem.mesHisto}:* ${formatarMoeda(origem.faturamento)}\n\n`;

            msg += `🚚 *DIA DESEJADO:* ${diaEscolhido}\n\n`;

            msg += `🏆 *PDV MAIS PRÓXIMO ENCONTRADO*\n`;
            msg += `🗝️ *Chave:* ${vencedor['Chave']}\n`;
            msg += `🛣️ *Endereço:* ${vencedor.endereco}\n`;
            msg += `📏 *Distância (Ruas):* ${distEmMetros.toFixed(0)} metros\n`;
            msg += `🌐 *Coord:* ${latDest}, ${lngDest}\n\n`;

            msg += `🔹 *OUTROS CANDIDATOS NA REGIÃO:*\n`;
            candidatos.forEach((c, index) => {
                const cDist = c.distRuas ? c.distRuas.toFixed(0) + 'm' : 'N/A';
                msg += `${index + 1}️⃣ ${c['Chave']} - ${cDist}\n`;
            });

            // REGRAS DE NEGÓCIO (Travas)
            const LIMITE_METROS = 300; 
            const LIMITE_FATURAMENTO = 999.9999; 

            if (distEmMetros < LIMITE_METROS) {
                if (origem.faturamento >= LIMITE_FATURAMENTO) {
                    msg += `\n⚠️ *Aviso:* O PDV atende aos requisitos de distância (< ${LIMITE_METROS}m) e faturamento mínimo.\n\n` + 
                           `Deseja *SOLICITAR A INCLUSÃO* deste dia de entrega?\n` +
                           `Digite *SIM* para confirmar ou *NÃO* para cancelar e voltar ao menu.`;
                           
                    await client.sendMessage(numero, msg);
                    
                    etapas[numero] = { 
                        etapa: 'analiseRotas_inclusao', 
                        nbSalvo: nbSalvo, 
                        dia: diaEscolhido,
                        chaveMaisProximo: vencedor['Chave'],
                        distancia: distEmMetros.toFixed(0),
                        latVencedor: latDest,
                        lngVencedor: lngDest,
                        faturamento: origem.faturamento
                    };
                    fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
                } else {
                    console.log(chalk.red(`⛔ [ROTAS] Negado por Faturamento (${formatarMoeda(origem.faturamento)})`));
                    msg += `\n❌ *Aviso:* O PDV mais próximo está dentro da distância ideal (< ${LIMITE_METROS}m), porém o faturamento deste cliente (${formatarMoeda(origem.faturamento)}) está abaixo da trava mínima exigida.\n\n_Inclusão não permitida._`;
                    msg += `\n\n*(Retornando ao menu principal...)*`;
                    await client.sendMessage(numero, msg);
                    delete etapas[numero];
                    fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
                }
            } else {
                console.log(chalk.red(`⛔ [ROTAS] Negado por Distância (${distEmMetros.toFixed(0)}m)`));
                msg += `\n❌ *Aviso:* O PDV mais próximo com entrega neste dia está a mais de ${LIMITE_METROS}m.\n\n_Inclusão não permitida._`;
                msg += `\n\n*(Retornando ao menu principal...)*`;
                await client.sendMessage(numero, msg);
                delete etapas[numero];
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            }
            return;
        }

        // Etapa 12.3: Processa a Resposta Final (SIM/NÃO)
        if (etapaAtual === 'analiseRotas_inclusao') {
            const resp = message.body.trim().toUpperCase();
            
            if (resp === 'SIM') {
                const { nbSalvo, dia, chaveMaisProximo, distancia, latVencedor, lngVencedor, faturamento } = etapas[numero];
                const setor = representante.setor;
                
                salvarPedidoEntrega(nbSalvo, setor, dia, chaveMaisProximo, distancia, latVencedor, lngVencedor, faturamento);
                console.log(chalk.green(`✅ [ROTAS] Pedido salvo com sucesso | PDV: ${nbSalvo} | Dia: ${dia}`));
                await client.sendMessage(numero, "✅ Solicitação de inclusão registrada com sucesso! A equipe de rotas será notificada.");
            } else {
                await client.sendMessage(numero, "❌ Solicitação cancelada.");
            }
            
            delete etapas[numero]; 
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            return;
        }
    }

    // ============================================================================================
    // 2. SWITCH DO MENU PRINCIPAL (Opções 1 a 12)
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
        case '12': {
            const finalizar = await simularHumano(message);
            await client.sendMessage(numero, "📍 *Análise de Rotas*\n\nPor favor, digite os números do seu *NB* (código do cliente):");
            etapas[numero] = { etapa: 'analiseRotas_inserirNb' };
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