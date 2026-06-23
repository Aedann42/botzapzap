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

const { 
    processarAnaliseRota, 
    salvarPedidoEntrega, 
    formatarMoeda, 
    obterEstatisticasPdv, 
    verificarBloqueio30Dias 
} = require('./analiseRotasHandler');

const { REGRAS_FATURAMENTO, REGRAS_DISTANCIA, REGRAS_TEMPO } = require('../utils/regrasEntrega');

// ========================================================================================
// 📊 FUNÇÃO DE ESTATÍSTICA: CONTAR CONSULTAS DO DIA NO LOG
// ========================================================================================
function exibirContagemConsultasHoje() {
    try {
        const LOG_USO_PATH = path.join(__dirname, '..', '..', 'logs', 'log_uso.json');
        
        if (!fs.existsSync(LOG_USO_PATH)) return;

        const logsData = JSON.parse(fs.readFileSync(LOG_USO_PATH, 'utf-8'));
        
        const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

        const qtdHoje = logsData.filter(log => 
            log.data === hoje && 
            log.funcao && 
            log.funcao.includes('Análise de Rotas')
        ).length;

        console.log(chalk.cyan(`\n📊 [OPERAÇÃO] Total de 'Análise de Rotas' solicitadas hoje (${hoje}): ${qtdHoje}\n`));

    } catch (erro) {
        console.error(chalk.red(`❌ Erro ao ler contagem do log_uso.json: ${erro.message}`));
    }
}

// ========================================================================================
// 🛡️ FUNÇÃO DE VALIDAÇÃO: DIAS CONSECUTIVOS
// ========================================================================================
function temDiasSeguidos(diasArray) {
    if (!diasArray || diasArray.length < 2) return false;
    const mapa = { 'SEG': 1, 'TER': 2, 'QUA': 3, 'QUI': 4, 'SEX': 5, 'SAB': 6 };
    const indexes = diasArray.map(d => mapa[d]).sort((a, b) => a - b);
    
    for (let i = 0; i < indexes.length - 1; i++) {
        if (indexes[i + 1] - indexes[i] === 1) return true;
    }
    return false;
}

// ========================================================================================
// 🔄 FUNÇÃO AUXILIAR DE ROTAS: Roda o OSRM e Monta o Relatório
// ========================================================================================
async function finalizarAnaliseETrava(client, numero, etapasObj) {
    const { nbSalvo, diaAdd, diaRemover, diasAtuais } = etapasObj;

    if (!diaAdd && diaRemover) {
        let msg = `✅ *ANÁLISE CONCLUÍDA*\n\n`;
        msg += `Ação solicitada: APENAS REMOÇÃO\n`;
        msg += `🗑️ *Dia a Remover:* ${diaRemover}\n\n`;
        msg += `Você confirma a remoção deste dia de entrega?\nDigite *SIM* para enviar ou *NÃO* para cancelar.`;

        etapasObj.etapa = 'analiseRotas_inclusao';
        let fileState = JSON.parse(fs.readFileSync(ETAPAS_PATH, 'utf-8'));
        fileState[numero] = etapasObj;
        fs.writeFileSync(ETAPAS_PATH, JSON.stringify(fileState, null, 2));
        await client.sendMessage(numero, msg);
        return;
    }

    await client.sendMessage(numero, "⏳ Calculando distâncias até a rota mais próxima no bairro... Aguarde.");
    const resultado = await processarAnaliseRota(nbSalvo, diaAdd);

    if (!resultado || resultado.erro) {
        const erroMsg = resultado ? resultado.erro : "Falha interna ao processar a rota.";
        await client.sendMessage(numero, `⚠️ ${erroMsg}`);
        let fileState = JSON.parse(fs.readFileSync(ETAPAS_PATH, 'utf-8'));
        delete fileState[numero];
        fs.writeFileSync(ETAPAS_PATH, JSON.stringify(fileState, null, 2));
        return;
    }

    const { origem, vencedor } = resultado;
    const distEmMetros = vencedor.distRuas;
    const latDest = parseFloat(vencedor['Latitude'].replace(',', '.')).toFixed(5);
    const lngDest = parseFloat(vencedor['Longitude'].replace(',', '.')).toFixed(5);

    let msg = `✅ *ANÁLISE DE ROTA CONCLUÍDA*\n\n`;
    msg += `📍 *DADOS DO SEU PDV:*\n`;
    msg += `🗝️ *Chave:* ${origem.chave}\n`;
    msg += `📅 *Dias atuais:* ${origem.dias}\n`;
    msg += `💰 *Faturado em ${origem.mesHisto}:* ${formatarMoeda(origem.faturamento)}\n\n`;

    msg += `🏆 *PDV MAIS PRÓXIMO:*\n`;
    msg += `🛣️ *Endereço:* ${vencedor.endereco}\n`;
    msg += `📏 *Distância:* ${distEmMetros.toFixed(0)} metros\n\n`;

    if (vencedor.msgCargaDescarga) msg += `${vencedor.msgCargaDescarga}\n\n`;

    let qtdDiasFuturo = diasAtuais.length;
    if (diaRemover) qtdDiasFuturo -= 1;
    if (diaAdd) qtdDiasFuturo += 1;

    let faturamentoMinimoExigido = 0;
    if (qtdDiasFuturo <= 1) faturamentoMinimoExigido = REGRAS_FATURAMENTO.dias_1;
    else if (qtdDiasFuturo === 2) faturamentoMinimoExigido = REGRAS_FATURAMENTO.dias_2;
    else faturamentoMinimoExigido = REGRAS_FATURAMENTO.dias_3_ou_mais;

    if (distEmMetros < REGRAS_DISTANCIA.limite_metros) {
        if (origem.faturamento >= faturamentoMinimoExigido) {
            msg += `⚠️ *Aviso:* O PDV atende aos requisitos logísticos para ter ${qtdDiasFuturo} dia(s).\n\n`;
            msg += `📋 *RESUMO:*\n`;
            if (diaRemover) msg += `🗑️ *REMOVER:* ${diaRemover}\n`;
            msg += `➕ *ADICIONAR:* ${diaAdd}\n\n`;
            msg += `Deseja *CONFIRMAR* esta solicitação?\nDigite *SIM* ou *NÃO*.`;

            etapasObj.etapa = 'analiseRotas_inclusao';
            let fileState = JSON.parse(fs.readFileSync(ETAPAS_PATH, 'utf-8'));
            fileState[numero] = etapasObj;
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(fileState, null, 2));
            await client.sendMessage(numero, msg);
        } else {
            msg += `\n❌ *Aviso:* Faturamento deste cliente (${formatarMoeda(origem.faturamento)}) está abaixo do exigido (${formatarMoeda(faturamentoMinimoExigido)}) para ${qtdDiasFuturo} dia(s).\n\n_Inclusão negada._`;
            let fileState = JSON.parse(fs.readFileSync(ETAPAS_PATH, 'utf-8'));
            delete fileState[numero];
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(fileState, null, 2));
            await client.sendMessage(numero, msg);
        }
    } else {
        msg += `\n❌ *Aviso:* Rota mais próxima está a mais de ${REGRAS_DISTANCIA.limite_metros}m.\n\n_Inclusão negada._`;
        let fileState = JSON.parse(fs.readFileSync(ETAPAS_PATH, 'utf-8'));
        delete fileState[numero];
        fs.writeFileSync(ETAPAS_PATH, JSON.stringify(fileState, null, 2));
        await client.sendMessage(numero, msg);
    }
}

// ========================================================================================
// 🤖 FUNÇÃO PRINCIPAL DO BOT
// ========================================================================================
async function handleMenu(client, message, representante, numeroTelefoneLimpo, MENU_TEXT, usuariosAguardandoRelatorio) {
    const texto = message.body.trim();
    const opcao = texto.toLowerCase();
    const numero = message.from;
    const MSG_INDISPONIVEL = '⚠️ Relatórios ainda não gerados. Avisarei quando estiverem prontos! 🤖';
    
    let etapas = {};
    try { etapas = JSON.parse(fs.readFileSync(ETAPAS_PATH, 'utf-8') || '{}'); } catch (e) {}
    const etapaAtual = etapas[numero]?.etapa;

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
        if (etapaAtual.startsWith('nc_')) {
            const finalizar = await simularHumano(message);
            await clientesNaoCompradores(client, message, representante);
            await finalizar();
            return;
        }

        // ========================================================================================
        // --- ETAPAS DA OPÇÃO 12 (ANÁLISE DE ROTAS) ---
        // ========================================================================================
        if (etapaAtual === 'analiseRotas_tipoDePara') {
            if (texto !== '1' && texto !== '2') {
                return client.sendMessage(numero, "⚠️ Opção inválida. Digite 1 para *SIM* ou 2 para *NÃO*.");
            }
            const isDePara = texto === '1';
            if (isDePara) {
                await client.sendMessage(numero, "🔄 *PROCESSO DE DE/PARA*\n\nPor favor, digite os números do *NB ANTIGO*:");
                etapas[numero] = { etapa: 'analiseRotas_inserirNbAntigo_DePara' };
            } else {
                await client.sendMessage(numero, "📍 *ANÁLISE NORMAL DE ROTA*\n\nPor favor, digite os números do seu *NB* (código do cliente):");
                etapas[numero] = { etapa: 'analiseRotas_inserirNb', isDePara: false };
            }
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            return;
        }

        // ========== FLUXO DE/PARA ==========
        if (etapaAtual === 'analiseRotas_inserirNbAntigo_DePara') {
            const textoUser = message.body.trim().replace(/\D/g, ''); 
            if (!textoUser) return client.sendMessage(numero, "⚠️ Digite apenas números.");

            const setorStr = representante.setor.toString();
            const prefixo = (parseInt(setorStr[0]) >= 4) ? '1046853_' : '296708_';
            const nbAntigoFormatado = prefixo + textoUser;

            await client.sendMessage(numero, "⏳ Buscando informações do NB Antigo na base...");
            const stats = await obterEstatisticasPdv(nbAntigoFormatado);

            if (!stats || stats.erro || stats.diasAtuais.length === 0) {
                await client.sendMessage(numero, `❌ *Erro:* NB Antigo não encontrado ou sem dias ativos.`);
                delete etapas[numero];
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
                return;
            }

            // GATILHO DA OPÇÃO 12 NO LOG E PAINEL
            await registrarUso(numeroTelefoneLimpo, `Análise de Rotas (De/Para)`, representante.setor);
            logAcao('ROTAS', `Consultou NB Antigo: ${nbAntigoFormatado} | Setor: ${representante.setor}`);
            exibirContagemConsultasHoje(); // EXIBE CONTAGEM DO DIA

            const textoDias = stats.diasAtuais.join(', ');

            let msg = `📍 *DADOS DO NB ANTIGO:*\n\n`;
            msg += `🗝️ *NB Antigo:* ${nbAntigoFormatado}\n`;
            msg += `🏪 *Fantasia:* ${stats.fantasia}\n`;
            msg += `📅 *Dias Atuais:* ${textoDias}\n\n`;
            msg += `⚠️ *Confirmar transferência de dias?*\nDigite *SIM* ou *NÃO*.`;

            await client.sendMessage(numero, msg);

            etapas[numero] = { 
                etapa: 'analiseRotas_confirmarMesmoLocal_DePara', 
                nbAntigo: nbAntigoFormatado, 
                diasParaCopiarArr: stats.diasAtuais, 
                documentoAntigo: stats.documento 
            };
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            return;
        }

        if (etapaAtual === 'analiseRotas_confirmarMesmoLocal_DePara') {
            if (texto.toUpperCase() === 'SIM') {
                await client.sendMessage(numero, "✅ Confirmado!\nAgora, digite os números do *NOVO NB*:");
                etapas[numero].etapa = 'analiseRotas_inserirNbNovo_DePara';
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            } else {
                await client.sendMessage(numero, "❌ Cancelado.");
                delete etapas[numero];
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            }
            return;
        }

        if (etapaAtual === 'analiseRotas_inserirNbNovo_DePara') {
            const textoUser = message.body.trim().replace(/\D/g, ''); 
            if (!textoUser) return client.sendMessage(numero, "⚠️ Digite apenas números.");

            const setorStr = representante.setor.toString();
            const prefixo = (parseInt(setorStr[0]) >= 4) ? '1046853_' : '296708_';
            const nbNovoFormatado = prefixo + textoUser;

            const { nbAntigo, diasParaCopiarArr, documentoAntigo } = etapas[numero];
            
            salvarPedidoEntrega(nbNovoFormatado, documentoAntigo, diasParaCopiarArr);

            await client.sendMessage(numero, `🎉 *DE/PARA CONCLUÍDO!*\n\n🔄 *Doador:* ${nbAntigo}\n🆕 *Receptor:* ${nbNovoFormatado}\n_Enviado para a carga do sistema._`);
            delete etapas[numero];
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            return;
        }

        // ========== FLUXO NORMAL ==========
        if (etapaAtual === 'analiseRotas_inserirNb') {
            const textoUser = message.body.trim().replace(/\D/g, ''); 
            if (!textoUser) return client.sendMessage(numero, "⚠️ Digite apenas números.");

            const setorStr = representante.setor.toString();
            const prefixo = (parseInt(setorStr[0]) >= 4) ? '1046853_' : '296708_';
            const nbFormatado = prefixo + textoUser;

            await client.sendMessage(numero, "⏳ Buscando informações...");

            const bloqueado = await verificarBloqueio30Dias(nbFormatado, REGRAS_TEMPO.dias_bloqueio_alteracao);
            if (bloqueado) {
                await client.sendMessage(numero, `❌ *Negado:* Alteração recente detectada (Bloqueio de ${REGRAS_TEMPO.dias_bloqueio_alteracao} dias).`);
                delete etapas[numero];
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
                return;
            }

            const stats = await obterEstatisticasPdv(nbFormatado);

            if (!stats || stats.erro) {
                await client.sendMessage(numero, stats ? stats.erro : "⚠️ Erro ao buscar dados.");
                delete etapas[numero];
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
                return;
            }

            // GATILHO DA OPÇÃO 12 NO LOG E PAINEL
            await registrarUso(numeroTelefoneLimpo, `Análise de Rotas`, representante.setor);
            logAcao('ROTAS', `Consultou NB: ${nbFormatado} | Setor: ${representante.setor}`);
            exibirContagemConsultasHoje(); // EXIBE CONTAGEM DO DIA

            let msg = `📍 *DADOS DO CLIENTE:*\n🗝️ *Chave:* ${nbFormatado}\n🏪 *Fantasia:* ${stats.fantasia}\n📅 *Entregas Atuais:* ${stats.diasAtuais.join(', ') || 'Nenhum'}\n\n`;
            msg += `📅 *Qual dia de entrega você deseja adicionar ou alterar?*\n⚠️ _Os dias 🔴 já estão ativos (Clique para REMOVER)._\n\n`;
            
            const diasMapaArr = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
            diasMapaArr.forEach((dia, i) => {
                msg += stats.diasAtuais.includes(dia) ? `🔴 ${i + 1} - ${dia} (Já ativo)\n` : `${i + 1}️⃣ - ${dia}\n`;
            });
            
            await client.sendMessage(numero, msg);
            
            etapas[numero] = { 
                etapa: 'analiseRotas_qualDia', 
                nbSalvo: nbFormatado, 
                documentoPDV: stats.documento,
                diasAtuais: stats.diasAtuais 
            };
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            return;
        }

        if (etapaAtual === 'analiseRotas_qualDia') {
            const diasMapa = { '1': 'SEG', '2': 'TER', '3': 'QUA', '4': 'QUI', '5': 'SEX', '6': 'SAB' };
            const diaEscolhido = diasMapa[message.body.trim()];
            if (!diaEscolhido) return client.sendMessage(numero, "⚠️ Digite um número de 1 a 6.");

            const { diasAtuais } = etapas[numero];

            if (diasAtuais.includes(diaEscolhido)) {
                etapas[numero].etapa = 'analiseRotas_qualDiaAdicaoAposRemocao';
                etapas[numero].diaRemover = diaEscolhido;
                await client.sendMessage(numero, `🗑️ *REMOVER:* ${diaEscolhido}\n\nDeseja *ADICIONAR* outro dia no lugar?\n1️⃣ - SEG\n2️⃣ - TER\n3️⃣ - QUA\n4️⃣ - QUI\n5️⃣ - SEX\n6️⃣ - SAB\n0️⃣ - SÓ REMOVER`);
                fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
                return;
            } else {
                const diasFuturos = [...diasAtuais, diaEscolhido];
                if (temDiasSeguidos(diasFuturos)) return client.sendMessage(numero, "⚠️ *Regra Logística:* Não é permitido dias consecutivos (ex: SEG e TER).");
                etapas[numero].diaRemover = null;
                etapas[numero].diaAdd = diaEscolhido;
                return await finalizarAnaliseETrava(client, numero, etapas[numero]);
            }
        }

        if (etapaAtual === 'analiseRotas_qualDiaAdicaoAposRemocao') {
            const numDigitado = message.body.trim();
            const diasMapa = { '1': 'SEG', '2': 'TER', '3': 'QUA', '4': 'QUI', '5': 'SEX', '6': 'SAB' };
            
            if (numDigitado === '0') {
                etapas[numero].diaAdd = null; 
                return await finalizarAnaliseETrava(client, numero, etapas[numero]);
            }

            const diaAdicionado = diasMapa[numDigitado];
            if (!diaAdicionado || etapas[numero].diaRemover === diaAdicionado || etapas[numero].diasAtuais.includes(diaAdicionado)) {
                return client.sendMessage(numero, "⚠️ Opção inválida ou dia já ativo.");
            }

            const diasFuturos = etapas[numero].diasAtuais.filter(d => d !== etapas[numero].diaRemover);
            diasFuturos.push(diaAdicionado);
            if (temDiasSeguidos(diasFuturos)) return client.sendMessage(numero, "⚠️ *Regra Logística:* Não é permitido dias consecutivos.");

            etapas[numero].diaAdd = diaAdicionado;
            return await finalizarAnaliseETrava(client, numero, etapas[numero]);
        }

        if (etapaAtual === 'analiseRotas_inclusao') {
            if (message.body.trim().toUpperCase() === 'SIM') {
                const { nbSalvo, documentoPDV, diasAtuais, diaAdd, diaRemover } = etapas[numero];
                
                let arrayDiasFinais = diasAtuais.filter(d => d !== diaRemover);
                if (diaAdd) arrayDiasFinais.push(diaAdd);

                salvarPedidoEntrega(nbSalvo, documentoPDV, arrayDiasFinais);
                
                await client.sendMessage(numero, "✅ Solicitação registrada com sucesso no sistema de rotas!");
            } else {
                await client.sendMessage(numero, "❌ Solicitação cancelada.");
            }
            
            delete etapas[numero]; 
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            return;
        }
    }

    // ============================================================================================
    // MENU PRINCIPAL
    // ============================================================================================
    const CAMINHO_CHECK_PDF = String.raw`\\revenda.local\publico\Arquivos\VENDAS\METAS E PROJETOS\2026\6 - JUNHO\_GERADOR PDF\ACOMPS\411\411_GiroEquipamentos.pdf`;
    const CAMINHO_CHECK_IMAGEM = String.raw`\\revenda.local\publico\Arquivos\VENDAS\METAS E PROJETOS\2026\6 - JUNHO\_GERADOR PDF\IMAGENS\GV4\MATINAL_GV4_page_1.jpg`;

    switch (opcao) {
        case '1': {
            const pronto = await verificarArquivoAtualizado(CAMINHO_CHECK_PDF);
            if (pronto) {
                const finalizar = await simularHumano(message);
                await enviarRelatoriosPdf(client, message, representante);
                await finalizar();
            } else await client.sendMessage(numero, MSG_INDISPONIVEL);
            break;
        }
        case '12': {
            const finalizar = await simularHumano(message);
            await client.sendMessage(numero, "📍 *Análise de Rotas*\n\nEste é um processo de *DE/PARA*? (Troca CNPJ)\n1️⃣ - SIM\n2️⃣ - NÃO\n\nDigite o número correspondente:");
            etapas[numero] = { etapa: 'analiseRotas_tipoDePara' };
            fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapas, null, 2));
            await finalizar();
            break;
        }
        case 'menu':
            await client.sendMessage(numero, MENU_TEXT);
            break;
        default:
            if (!texto.startsWith('/')) await client.sendMessage(numero, `❌ Opção inválida.\n\n${MENU_TEXT}`);
            break;
    }
}

module.exports = handleMenu;