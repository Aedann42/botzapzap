// src/handlers/clientesNaoCompradores.js

const ExcelJS = require('exceljs');
const csv = require('csv-parser');
const path = require('path');
const fs = require('fs');

// Importa o sistema de etapas e a nossa função de registrarUso padronizada
const { lerJson, ETAPAS_PATH, registrarUso } = require('../utils/dataHandler.js');

// --- CONFIGURAÇÃO DE CAMINHOS ---
const PASTA_PERFORMANCE = String.raw`\\VSRV-DC01\Arquivos\VENDAS\METAS E PROJETOS\2026\5 - MAIO\_GERADOR PDF`;
const ARQUIVO_PERFORMANCE = path.join(PASTA_PERFORMANCE, 'Acomp Performance.xlsx');
const PASTA_BANCO_DADOS = 'C:\\botzapzap\\botzapzap\\data\\hist';

// --- MAPEAMENTOS ---
const MAPA_OPCOES = {
    '1': 'AMBEV', '2': 'MKTP', '3': 'CERV', '4': 'MATCH', 
    '5': 'CERV RGB', '6': 'CERV 1/1', '7': 'CERV 300', 
    '8': 'MEGABRANDS', '9': 'NAB', '10': 'RED BULL', '11': 'R$ MKTP'
};

const MAPA_DIAS = {
    '0': 'HOJE', '1': 'TODOS', '2': 'SEG', '3': 'TER', 
    '4': 'QUA', '5': 'QUI', '6': 'SEX'
};

const COLUNAS_PRODUTIVIDADE = {
    'AMBEV': 'L', 'MKTP': 'M', 'CERV': 'N', 'MATCH': 'O', 
    'CERV RGB': 'P', 'CERV 1/1': 'Q', 'CERV 300': 'R', 
    'MEGABRANDS': 'S', 'NAB': 'T', 'RED BULL': 'U', 'R$ MKTP': 'V'
};

// --- FUNÇÕES AUXILIARES ---
function salvarEtapas(etapasObj) {
    fs.writeFileSync(ETAPAS_PATH, JSON.stringify(etapasObj, null, 2));
}

function formatarMoeda(valor) {
    if (typeof valor !== 'number' || isNaN(valor)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function obterAbaMesPassado() {
    const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    let mesPassado = new Date().getMonth() - 1;
    if (mesPassado < 0) mesPassado = 11; 
    return meses[mesPassado];
}

function obterDiaVisitaHoje() {
    const diasDaSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
    return diasDaSemana[new Date().getDay()]; 
}

function extrairDiaSemana(visitaString) {
    const ordem = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];
    for (let d of ordem) {
        if (visitaString.includes(d)) return d;
    }
    return 'OUTRO';
}

// --- FUNÇÃO PRINCIPAL ---
module.exports = async (client, message, representante) => {
    const numero = message.from;
    const textoDigitado = message.body.trim();
    const telefoneLimpo = numero.includes('@') ? numero.split('@')[0] : numero;

    // Utilitário de Log no Terminal (Padrão novo)
    const getTime = () => new Date().toLocaleTimeString('pt-BR');
    const logInd = (msg) => console.log(`[${getTime()}] 📊 [INDICADORES] [${numero}] ${msg}`);
    const logErr = (msg, err) => console.error(`[${getTime()}] ❌ [INDICADORES] [${numero}] ${msg}`, err);

    if (!representante || !representante.setor) {
        await client.sendMessage(numero, '❌ Cadastro não identificado. Fale com o suporte.');
        return;
    }

    let etapas = lerJson(ETAPAS_PATH, {});
    let sessao = etapas[numero] || {};

    // 🛑 GATILHO DE CANCELAMENTO
    if (textoDigitado.toLowerCase() === 'cancelar' || textoDigitado.toLowerCase() === 'sair' || textoDigitado.toLowerCase() === 'menu') {
        delete etapas[numero];
        salvarEtapas(etapas);
        logInd('Operação cancelada pelo usuário.');
        await client.sendMessage(numero, '🛑 Consulta cancelada. Você voltou ao menu principal. Digite "menu" para ver as opções.');
        return;
    }

    // ==========================================
    // ETAPA 1: INÍCIO DO COMANDO (Pedir Indicador)
    // ==========================================
    if (!sessao.etapa || (sessao.etapa !== 'nc_indicador' && sessao.etapa !== 'nc_dia' && sessao.etapa !== 'nc_tipo')) {
        let msgInd = `📉 *ANÁLISE DE INDICADORES*\n\n`;
        msgInd += `Escolha o indicador (1-11):\n\n`;
        msgInd += `1 - AMBEV\n2 - MKTP\n3 - CERV\n4 - MATCH\n5 - CERV RGB\n6 - CERV 1/1\n7 - CERV 300\n8 - MEGABRANDS\n9 - NAB\n10 - RED BULL\n11 - R$ MKTP\n\n`;
        msgInd += `_(Digite o número ou "cancelar")_`;

        await client.sendMessage(numero, msgInd);
        
        etapas[numero] = { etapa: 'nc_indicador' };
        salvarEtapas(etapas);
        
        logInd(`Iniciado fluxo de indicadores. Aguardando escolha do indicador...`);
        return;
    }

    // ==========================================
    // ETAPA 2: VALIDAR INDICADOR E PEDIR O DIA
    // ==========================================
    if (sessao.etapa === 'nc_indicador') {
        const indicadorDesejado = MAPA_OPCOES[textoDigitado];

        if (!indicadorDesejado) {
            await client.sendMessage(numero, `⚠️ *Opção inválida.*\nPor favor, digite um número de *1 a 11*, ou *cancelar* para sair.`);
            return;
        }

        let msgDias = `📊 Você selecionou: *${indicadorDesejado}*\n\n`;
        msgDias += `Para qual dia deseja gerar a lista?\n\n`;
        msgDias += `*0* - Dia de hoje\n`;
        msgDias += `*1* - Todos os dias (Semana Completa)\n`;
        msgDias += `*2* - Segunda\n`;
        msgDias += `*3* - Terça\n`;
        msgDias += `*4* - Quarta\n`;
        msgDias += `*5* - Quinta\n`;
        msgDias += `*6* - Sexta\n\n`;
        msgDias += `_(Digite o número correspondente ou "cancelar")_`;

        await client.sendMessage(numero, msgDias);

        etapas[numero] = { 
            etapa: 'nc_dia', 
            indicador: indicadorDesejado 
        };
        salvarEtapas(etapas);
        
        logInd(`Indicador escolhido: ${indicadorDesejado}. Aguardando dia...`);
        return;
    }

    // ==========================================
    // ETAPA 3: VALIDAR O DIA E PEDIR O TIPO (NOVA ETAPA)
    // ==========================================
    if (sessao.etapa === 'nc_dia') {
        const diaDesejado = MAPA_DIAS[textoDigitado];

        if (!diaDesejado) {
            await client.sendMessage(numero, `⚠️ *Dia inválido.*\nDigite um número de *0 a 6*, ou *cancelar* para sair.`);
            return;
        }

        let msgTipo = `📅 Dia selecionado: *${diaDesejado}*\n\n`;
        msgTipo += `O que você deseja analisar em *${sessao.indicador}*?\n\n`;
        msgTipo += `*1* - 📉 NÃO COMPRARAM (Estão zerados)\n`;
        msgTipo += `*2* - 📈 COMPRARAM (Já positivaram)\n\n`;
        msgTipo += `_(Digite 1 ou 2, ou "cancelar")_`;

        await client.sendMessage(numero, msgTipo);

        etapas[numero] = {
            etapa: 'nc_tipo',
            indicador: sessao.indicador,
            dia: diaDesejado
        };
        salvarEtapas(etapas);

        logInd(`Dia escolhido: ${diaDesejado}. Aguardando tipo de filtro (Comprador/Não Comprador)...`);
        return;
    }

    // ==========================================
    // ETAPA 4: PROCESSAR ARQUIVOS (COMPRADOR OU NÃO COMPRADOR)
    // ==========================================
    if (sessao.etapa === 'nc_tipo') {
        const tipoEscolhido = textoDigitado;

        if (tipoEscolhido !== '1' && tipoEscolhido !== '2') {
            await client.sendMessage(numero, `⚠️ *Opção inválida.*\nDigite *1* para Não Compradores ou *2* para Compradores, ou *cancelar* para sair.`);
            return;
        }

        const isComprador = tipoEscolhido === '2'; // Se for 2, busca os que compraram (>= 1). Se for 1, busca zerados (0).
        const tipoNome = isComprador ? 'COMPRADORES' : 'NÃO COMPRADORES';
        
        const indicadorDesejado = sessao.indicador;
        const diaDesejado = sessao.dia;
        const setorDoUsuario = String(representante.setor).trim();
        const colunaAlvo = COLUNAS_PRODUTIVIDADE[indicadorDesejado];
        const mesReferencia = obterAbaMesPassado();
        const arquivoHistoricoCsv = path.join(PASTA_BANCO_DADOS, `2026_${mesReferencia}.csv`);
        const diaRealHoje = obterDiaVisitaHoje();

        // Limpa a etapa imediatamente para evitar loops
        delete etapas[numero];
        salvarEtapas(etapas);

        // Lógica de definição dos dias
        let diasAlvo = [];
        let nomeDiaExibicao = "";

        if (diaDesejado === 'TODOS') {
            diasAlvo = ['SEG', 'TER', 'QUA', 'QUI', 'SEX'];
            nomeDiaExibicao = 'TODOS OS DIAS';
        } else if (diaDesejado === 'HOJE') {
            if (diaRealHoje === 'SAB' || diaRealHoje === 'DOM') {
                await client.sendMessage(numero, `🏖️ Bom descanso! Hoje é ${diaRealHoje} e não há visitas programadas na rota regular.`);
                logInd(`Cancelado: Tentativa de buscar HOJE no FDS.`);
                return;
            }
            diasAlvo = [diaRealHoje];
            nomeDiaExibicao = `HOJE (${diaRealHoje})`;
        } else {
            diasAlvo = [diaDesejado];
            nomeDiaExibicao = diaDesejado;
        }

        logInd(`🚀 Processando: ${tipoNome} | ${indicadorDesejado} | ${nomeDiaExibicao}`);
        await client.sendMessage(numero, `⏳ Gerando lista de *${tipoNome}* para *${nomeDiaExibicao}* no indicador *${indicadorDesejado}*...\n_Isso pode levar alguns segundos._`);

        try {
            // LER ACOMP PERFORMANCE
            if (!fs.existsSync(ARQUIVO_PERFORMANCE)) throw new Error("Arquivo Performance não encontrado");
            
            logInd(`[1/3] Lendo arquivo de Performance...`);
            const workbookPerf = new ExcelJS.Workbook();
            await workbookPerf.xlsx.readFile(ARQUIVO_PERFORMANCE);
            const abaBase = workbookPerf.getWorksheet('Base') || workbookPerf.worksheets[0];

            let clientesFiltrados = [];
            let chavesParaBuscar = new Set(); 

            abaBase.eachRow((row, rowNumber) => {
                if (rowNumber < 4) return; 

                const setorPlanilha = row.getCell('E').text.trim();
                const valorIndicador = parseFloat(row.getCell(colunaAlvo).value) || 0;
                const visitaPlanilha = row.getCell('F').text.trim().toUpperCase();

                const atendeDia = diasAlvo.some(d => visitaPlanilha.includes(d));

                // A MÁGICA DO FILTRO NOVO AQUI:
                const atendeFiltroDeCompra = isComprador ? (valorIndicador >= 1) : (valorIndicador === 0);

                if (setorPlanilha === setorDoUsuario && atendeFiltroDeCompra && atendeDia) {
                    const chave = row.getCell('A').text.trim();
                    if (chave) {
                        clientesFiltrados.push({
                            chave: chave,
                            razaoSocial: row.getCell('C').text,
                            visita: visitaPlanilha,
                            historicoMesPassado: [],
                            faturamentoTotal: 0,
                            skusUnicos: new Set(),
                            produtosAgregados: {}
                        });
                        chavesParaBuscar.add(chave);
                    }
                }
            });

            logInd(`✅ Encontrados ${clientesFiltrados.length} clientes no filtro.`);

            if (clientesFiltrados.length === 0) {
                if (isComprador) {
                    await client.sendMessage(numero, `⚠️ Nenhum cliente da sua rota de *${nomeDiaExibicao}* comprou ${indicadorDesejado} ainda.`);
                } else {
                    await client.sendMessage(numero, `🎉 *Sensacional!* Nenhum cliente da sua rota de *${nomeDiaExibicao}* está zerado em ${indicadorDesejado}.`);
                }
                // REGISTRO DE USO SE A LISTA FOR VAZIA
                try {
                    const nomeFuncaoLog = isComprador ? `Compradores (${indicadorDesejado})` : `Não Compradores (${indicadorDesejado})`;
                    await registrarUso(telefoneLimpo, nomeFuncaoLog, setorDoUsuario);
                } catch (erroLog) {
                    logErr('Erro ao registrar log de uso:', erroLog);
                }
                return;
            }

            // LER HISTÓRICO CSV
            if (!fs.existsSync(arquivoHistoricoCsv)) {
                logErr(`Arquivo CSV não encontrado: ${arquivoHistoricoCsv}`);
                await client.sendMessage(numero, `⚠️ O arquivo de histórico não foi encontrado. Avise o administrador.`);
                return;
            }

            logInd(`[2/3] Lendo histórico CSV (${mesReferencia})...`);

            await new Promise((resolve, reject) => {
                fs.createReadStream(arquivoHistoricoCsv)
                    .pipe(csv({ 
                        separator: ';',
                        mapHeaders: ({ header }) => header.trim().replace(/^[\u200B\u200C\u200D\u200E\u200F\uFEFF]/,"") 
                    })) 
                    .on('data', (linha) => {
                        const chaveLinha = String(linha['Chave'] || '').trim();
                        if (chaveLinha && chavesParaBuscar.has(chaveLinha)) {
                            const cliente = clientesFiltrados.find(c => c.chave === chaveLinha);
                            if (cliente) {
                                const strValor = String(linha['Total Venda'] || '0').replace(',', '.');
                                const valor = parseFloat(strValor) || 0;
                                const codProduto = linha['Cod.Produto'] || linha['Desc.Produto'] || 'Sem Código';
                                const nomeProduto = linha['Desc.Produto'] || 'Produto Desconhecido';

                                cliente.historicoMesPassado.push({ produto: nomeProduto, totalVenda: valor });
                                cliente.faturamentoTotal += valor;
                                cliente.skusUnicos.add(codProduto); 
                                
                                if (!cliente.produtosAgregados[nomeProduto]) cliente.produtosAgregados[nomeProduto] = 0;
                                cliente.produtosAgregados[nomeProduto] += valor;
                            }
                        }
                    })
                    .on('end', () => resolve())
                    .on('error', (erro) => reject(erro));
            });

            logInd(`✅ Leitura CSV concluída.`);

            // ORDENAR E MONTAR MENSAGEM
            logInd(`[3/3] Montando mensagem visual...`);
            
            const ordemDiasSemana = { 'SEG': 1, 'TER': 2, 'QUA': 3, 'QUI': 4, 'SEX': 5, 'OUTRO': 99 };
            
            clientesFiltrados.sort((a, b) => {
                if (diaDesejado === 'TODOS') {
                    const diaA = ordemDiasSemana[extrairDiaSemana(a.visita)] || 99;
                    const diaB = ordemDiasSemana[extrairDiaSemana(b.visita)] || 99;
                    if (diaA !== diaB) return diaA - diaB; 
                }
                return b.faturamentoTotal - a.faturamentoTotal;
            });

            const pdvsSemHistorico = clientesFiltrados.filter(c => c.historicoMesPassado.length === 0).length;

            let msg = isComprador ? `📈 *COMPRADORES | ${indicadorDesejado}*\n` : `📉 *NÃO COMPRADORES | ${indicadorDesejado}*\n`;
            msg += `📍 Setor: ${setorDoUsuario}  |  🗓️ Ref: ${mesReferencia}\n`;
            msg += `🎯 *Total de PDVs alvos (${nomeDiaExibicao}): ${clientesFiltrados.length}*\n`;
            
            if (pdvsSemHistorico > 0) {
                if (isComprador) {
                    msg += `\n🌟 *RECUPERADOS:* ${pdvsSemHistorico} PDVs desta lista não compraram no mês passado, mas agora compraram!\n`;
                } else {
                    msg += `\n🚨 *AVISO:* ${pdvsSemHistorico} PDVs desta lista também foram *venda zero* no mês passado!\n`;
                }
            }
            
            msg += `-------------------------------------------\n`;

            let diaAtualNoLoop = "";

            clientesFiltrados.forEach((c, index) => {
                if (diaDesejado === 'TODOS') {
                    const diaDoCliente = extrairDiaSemana(c.visita);
                    if (diaDoCliente !== diaAtualNoLoop) {
                        msg += `\n📅 *--- ROTAS DE ${diaDoCliente} ---*\n\n`;
                        diaAtualNoLoop = diaDoCliente;
                    }
                } else {
                    if (index === 0) msg += `\n`; 
                }

                msg += `🏪 *${index + 1}. ${c.razaoSocial}*\n`;
                msg += `🗝️ Chave: ${c.chave}  |  📅 Visita: ${c.visita}\n\n`;
                
                if (c.historicoMesPassado.length === 0) {
                    msg += `⚠️ _Sem histórico de faturamento em ${mesReferencia}._\n`;
                } else {
                    msg += `📊 *Resumo do Mês Passado:*\n`;
                    msg += `📦 SKUs Distintos: ${c.skusUnicos.size}\n`;
                    msg += `💵 Faturado: ${formatarMoeda(c.faturamentoTotal)}\n\n`;
                    
                    msg += `🛒 *Principais Itens Levados:*\n`;
                    const top3Produtos = Object.entries(c.produtosAgregados)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(item => {
                            const percentual = c.faturamentoTotal > 0 ? ((item[1] / c.faturamentoTotal) * 100).toFixed(1) : 0;
                            return `▫️ ${item[0]}\n   └ ${formatarMoeda(item[1])} (${percentual}%)`;
                        }).join('\n');
                    
                    msg += `${top3Produtos}\n`;
                }
                msg += `\n➖ ➖ ➖ ➖ ➖ ➖ ➖ ➖ ➖ ➖\n\n`;
            });

            await client.sendMessage(numero, msg);
            logInd(`✅ Mensagem enviada com sucesso!`);

            // ==========================================
            // REGISTRO NO LOG DE USO (MÉTODO DO DATAHANDLER)
            // ==========================================
            try {
                const nomeFuncaoLog = isComprador ? `Compradores (${indicadorDesejado})` : `Não Compradores (${indicadorDesejado})`;
                await registrarUso(telefoneLimpo, nomeFuncaoLog, setorDoUsuario);
            } catch (erroLog) {
                logErr('Erro ao registrar log de uso:', erroLog);
            }
            // ==========================================

        } catch (error) {
            logErr('Erro Crítico no processamento:', error);
            await client.sendMessage(numero, '❌ Ocorreu um erro interno ao processar os arquivos. Avise o suporte.');
        }
    }
};