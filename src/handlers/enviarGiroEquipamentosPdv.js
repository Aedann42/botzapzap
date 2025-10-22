// enviarGiroEquipamentosPdv.js
const ExcelJS = require('exceljs');
const path = require('path');

// Importa o seu módulo de manipulação de dados
const dataHandler = require('../utils/dataHandler'); // Caminho relativo

// --- Constantes de Configuração ---
const UNB_SETOR_4 = '1046853';
const UNB_OUTROS_SETOR = '296708';
const CAMINHO_ARQUIVO_EXCEL = path.join(
    '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2025\\10 - OUTUBRO\\_GERADOR PDF',
    'Acomp Giro de Equipamentos.xlsx'
);

// --- Funções Auxiliares ---

function formatarMoeda(valor) {
    if (typeof valor !== 'number' || isNaN(valor)) {
        return 'R$ 0,00';
    }
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(valor);
}

function formatarData(valorCelula) {
    if (!valorCelula) return 'N/A';

    if (valorCelula instanceof Date) {
        return valorCelula.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    }

    if (typeof valorCelula === 'number') {
        const excelEpoch = new Date(1899, 11, 30);
        const dataCalculada = new Date(excelEpoch.getTime() + valorCelula * 86400000);
        const offset = dataCalculada.getTimezoneOffset() * 60000;
        const dataCorrigida = new Date(dataCalculada.getTime() + offset);
        return dataCorrigida.toLocaleDateString('pt-BR');
    }

    return 'Data inválida';
}

function getCellValueAsString(cell) {
    if (!cell || !cell.value) return '';
    const value = cell.value;
    
    if (typeof value === 'object') {
        if (value.richText) {
            return value.richText.map(rt => rt.text).join('').trim();
        }
        if (value instanceof Date) {
             return value.toLocaleDateString('pt-BR');
        }
    }
    return String(value).trim();
}

function gerarBarraProgresso(percentual) {
    const totalBlocos = 10;
    const blocosPreenchidos = Math.round((percentual / 100) * totalBlocos);
    return '▰'.repeat(blocosPreenchidos) + '▱'.repeat(totalBlocos - blocosPreenchidos);
}

/**
 * Tenta encontrar o setor do usuário no REPRESENTANTES.JSON e, se falhar, em STAFFS.JSON.
 * (Função copiada dos códigos anteriores, inalterada)
 */
function buscarSetorEUNB(telefoneDoUsuario) {
    
    const telLimpoUsuario = telefoneDoUsuario.replace('@c.us', '').replace(/\D/g, ''); 
    console.log(`[DEBUG] Telefone do Usuário (message.from limpo): ${telLimpoUsuario}`);

    let usuarioEncontrado = null;
    let fonte = 'Nenhum';

    // 1. TENTA BUSCAR EM REPRESENTANTES.JSON
    const representantes = dataHandler.lerJson(dataHandler.REPRESENTANTES_PATH, []); 
    if (Array.isArray(representantes)) {
        usuarioEncontrado = representantes.find(s => {
            const telLimpoJson = String(s.telefone).replace(/\D/g, '');
            return telLimpoJson === telLimpoUsuario;
        });
        if (usuarioEncontrado) {
            fonte = 'Representantes';
        }
    }

    // 2. SE NÃO ENCONTROU, TENTA BUSCAR EM STAFFS.JSON
    if (!usuarioEncontrado) {
        const staffs = dataHandler.lerJson(dataHandler.STAFFS_PATH, []); 
        if (Array.isArray(staffs)) {
            usuarioEncontrado = staffs.find(s => {
                const telLimpoJson = String(s.telefone).replace(/\D/g, '');
                return telLimpoJson === telLimpoUsuario;
            });
            if (usuarioEncontrado) {
                fonte = 'Staffs';
            }
        }
    }
    
    // 3. RETORNA RESULTADO
    if (!usuarioEncontrado) {
        console.log(`❌ Telefone limpo ${telLimpoUsuario} não encontrado em nenhum arquivo JSON.`);
        return null;
    }

    const setor = String(usuarioEncontrado.setor).trim();
    const primeiroDigitoSetor = setor[0];
    let UNB_Filtro = '';

    if (primeiroDigitoSetor === '4') {
        UNB_Filtro = UNB_SETOR_4; // '1046853'
    } else {
        UNB_Filtro = UNB_OUTROS_SETOR; // '296708'
    }
    
    console.log(`✅ Usuário encontrado em ${fonte}. Setor: ${setor}.`);

    return { UNB: UNB_Filtro, setor: setor };
}
// --- Fim das Funções Auxiliares ---

// --- Fila de requisições (Inalterada) ---
let isProcessingExcel = false;
const excelRequestQueue = [];

async function processNextExcelRequest() {
    if (excelRequestQueue.length === 0) {
        isProcessingExcel = false;
        return;
    }
    const nextRequest = excelRequestQueue.shift();
    isProcessingExcel = true;
    try {
        await nextRequest();
    } catch (error) {
        console.error("Erro ao processar requisição da fila do Excel:", error);
    } finally {
        processNextExcelRequest();
    }
}
// --- Fim da Fila de requisições ---

// --- Módulo principal ---
module.exports = async (client, message) => {
    const codigoPDV = message.body.replace(/\D/g, '');
    console.log('🔍 Código PDV recebido do usuário:', codigoPDV);
    
    // 1. OBTENÇÃO DO FILTRO UNB
    const dadosFiltro = buscarSetorEUNB(message.from);

    if (!dadosFiltro) {
        await client.sendMessage(message.from, '❌ Não foi possível identificar seu Setor. Seu telefone não está cadastrado. Por favor, avise o APR.');
        return;
    }

    const UNB_Filtro = dadosFiltro.UNB;
    const setorDoUsuario = dadosFiltro.setor;
    
    // 2. CRIAÇÃO DA CHAVE DE BUSCA COMBINADA
    const CHAVE_BUSCA = `${UNB_Filtro}_${codigoPDV}`;
    console.log(`✅ Chave de Busca Final (UNB_PDV): ${CHAVE_BUSCA}`);

    // ----------------------------------------------------------------------

    const arquivo = CAMINHO_ARQUIVO_EXCEL;

    await client.sendMessage(
        message.from,
        `⏳ Buscando dados de giro de equipamentos para o PDV *${codigoPDV}* (Chave: ${CHAVE_BUSCA})... um momento.`
    );

    return new Promise(async (resolve, reject) => {
        const requestHandler = async () => {
            try {
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.readFile(arquivo);
                console.log('✅ Planilha de giro de equipamentos carregada com sucesso.');

                const aba = workbook.worksheets[0];
                if (!aba) {
                    console.error('❌ Nenhuma aba encontrada na planilha.');
                    await client.sendMessage(message.from, '❌ Não foi possível encontrar a aba de dados. Avise o APR.');
                    resolve();
                    return;
                }

                let pdvRow = null;

                // Itera nas linhas para encontrar a CHAVE DE BUSCA correspondente
                aba.eachRow((row, rowNumber) => {
                    if (rowNumber > 1) { // Pula o cabeçalho
                        // Coluna 'A' contém a chave UNB_PDV (ex: 296708_5)
                        const chavePlanilha = getCellValueAsString(row.getCell('A')); 
                        
                        // --- NOVA CONDIÇÃO DE FILTRO: CHAVE COMPLETA ---
                        if (chavePlanilha === CHAVE_BUSCA) {
                            pdvRow = row;
                            return false; // Para a iteração assim que encontra
                        }
                    }
                });

                if (pdvRow) {
                    // --- Extração dos Dados do PDV ---
                    // NOTA: A coluna 'B' agora representa o PDV, 'A' a Chave
                    const headerInfo = {
                        chave: getCellValueAsString(pdvRow.getCell('A')),
                        nBase: getCellValueAsString(pdvRow.getCell('B')), // Coluna B: N BASE
                        razaoSocial: getCellValueAsString(pdvRow.getCell('C')),
                        gv: getCellValueAsString(pdvRow.getCell('D')),
                        rn: getCellValueAsString(pdvRow.getCell('E')),
                        visita: pdvRow.getCell('F').value,
                    };

                    const sopiInfo = {
                        meta: parseFloat(pdvRow.getCell('H').value) || 0,
                        real: parseFloat(pdvRow.getCell('I').value) || 0,
                        gap: parseFloat(pdvRow.getCell('J').value) || 0,
                        giroOk: getCellValueAsString(pdvRow.getCell('K')),
                        vendaZero: getCellValueAsString(pdvRow.getCell('L')),
                    };

                    const visaInfo = {
                        meta: parseFloat(pdvRow.getCell('N').value) || 0,
                        real: parseFloat(pdvRow.getCell('O').value) || 0,
                        gap: parseFloat(pdvRow.getCell('P').value) || 0,
                        giroOk: getCellValueAsString(pdvRow.getCell('Q')),
                        vendaZero: getCellValueAsString(pdvRow.getCell('R')),
                    };

                    const sopivInfo = {
                        giroOk: getCellValueAsString(pdvRow.getCell('T')),
                        vendaZero: getCellValueAsString(pdvRow.getCell('U')),
                        percentualGiro: parseFloat(pdvRow.getCell('V').value) || 0,
                    };

                    // --- Montagem da Mensagem de Resposta ---
                    const header = `📋 *Giro de Equipamentos - PDV ${headerInfo.nBase}*\n\n` +
                                 `🏢 *Chave (UNB_PDV):* ${headerInfo.chave}\n` + // Adiciona a chave
                                 `🏪 *PDV:* ${headerInfo.razaoSocial}\n` +
                                 `👨‍💼 *GV:* ${headerInfo.gv} | *RN:* ${headerInfo.rn}\n` +
                                 `🗓️ *Última Visita:* ${formatarData(headerInfo.visita)}\n` +
                                 `---`;

                    let sopiBody = '';
                    if (sopiInfo.meta > 0 || sopiInfo.real > 0) {
                        sopiBody = `\n🍺 *SOPI (Cerveja)*\n` +
                                 `*Meta:* ${formatarMoeda(sopiInfo.meta)}\n` +
                                 `*Real:* ${formatarMoeda(sopiInfo.real)}\n` +
                                 `*Gap:* ${formatarMoeda(sopiInfo.gap)}\n` +
                                 `*Giro OK?* ${sopiInfo.giroOk}\n` +
                                 `*Venda Zero?* ${sopiInfo.vendaZero}\n` +
                                 `---`;
                    }

                    let visaBody = '';
                    if (visaInfo.meta > 0 || visaInfo.real > 0) {
                        visaBody = `\n🥤 *VISA*\n` +
                                 `*Meta:* ${formatarMoeda(visaInfo.meta)}\n` +
                                 `*Real:* ${formatarMoeda(visaInfo.real)}\n` +
                                 `*Gap:* ${formatarMoeda(visaInfo.gap)}\n` +
                                 `*Giro OK?* ${visaInfo.giroOk}\n` +
                                 `*Venda Zero?* ${visaInfo.vendaZero}\n` +
                                 `---`;
                    }
                    
                    const percentualFormatado = sopivInfo.percentualGiro * 100;
                    const barra = gerarBarraProgresso(percentualFormatado);
                    const summary = `\n📈 *Resumo SOPIV (Total)*\n` +
                                     `*Giro OK?* ${sopivInfo.giroOk}\n` +
                                     `*Venda Zero?* ${sopivInfo.vendaZero}\n` +
                                     `*% Giro Atingido:* ${percentualFormatado.toFixed(0)}% ${barra}`;

                    const resposta = header + sopiBody + visaBody + summary;
                    await client.sendMessage(message.from, resposta);

                } else {
                    await client.sendMessage(message.from, `⚠️ Nenhum dado de giro de equipamento encontrado para o PDV *${codigoPDV}* com a chave *${CHAVE_BUSCA}*. Verifique se o código está correto ou se há dados para seu UNB.`);
                }
                resolve();

            } catch (err) {
                console.error('❌ Erro ao consultar a planilha de giro:', err);
                await client.sendMessage(message.from, '❌ Ocorreu um erro ao processar sua solicitação. Avise o APR.');
                reject(err);
            }
        };

        excelRequestQueue.push(requestHandler);
        if (!isProcessingExcel) {
            processNextExcelRequest();
        }
    });
};