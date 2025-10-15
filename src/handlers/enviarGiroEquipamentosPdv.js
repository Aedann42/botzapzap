// enviarGiroEquipamentosPdv.js
const ExcelJS = require('exceljs');
const path = require('path');

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
    if (typeof cell.value === 'object' && cell.value.richText) {
        return cell.value.richText.map(rt => rt.text).join('').trim();
    }
    return String(cell.value).trim();
}

function gerarBarraProgresso(percentual) {
    const totalBlocos = 10;
    const blocosPreenchidos = Math.round((percentual / 100) * totalBlocos);
    return '▰'.repeat(blocosPreenchidos) + '▱'.repeat(totalBlocos - blocosPreenchidos);
}
// --- Fim das Funções Auxiliares ---

// --- Fila de requisições ---
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

    // !!! ATENÇÃO: Verifique se este é o caminho e nome correto da sua planilha de giro !!!
    const arquivo = path.join(
        '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2025\\10 - OUTUBRO\\_GERADOR PDF',
        'Acomp Giro de Equipamentos.xlsx' // <<<--- NOME DO ARQUIVO ATUALIZADO
    );

    await client.sendMessage(
        message.from,
        `⏳ Buscando dados de giro de equipamentos para o PDV *${codigoPDV}*... um momento.`
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

                // Itera nas linhas para encontrar o PDV correspondente
                aba.eachRow((row, rowNumber) => {
                    if (rowNumber > 1) { // Pula o cabeçalho
                        const codPdvPlanilha = getCellValueAsString(row.getCell('B')); // Coluna "N BASE"
                        if (codPdvPlanilha === codigoPDV) {
                            pdvRow = row;
                            return false; // Para a iteração assim que encontra o PDV
                        }
                    }
                });

                if (pdvRow) {
                    // --- Extração dos Dados do PDV ---
                    const headerInfo = {
                        chave: getCellValueAsString(pdvRow.getCell('A')),
                        nBase: getCellValueAsString(pdvRow.getCell('B')),
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
                                 `🏪 *PDV:* ${headerInfo.razaoSocial}\n` +
                                 `👨‍💼 *GV:* ${headerInfo.gv} | *RN:* ${headerInfo.rn}\n` +
                                 `🗓️ *Última Visita:* ${formatarData(headerInfo.visita)}\n` +
                                 `---`;

                    let sopiBody = '';
                    // Condição para exibir o bloco SOPI: só mostra se houver meta ou venda real
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
                    // Condição para exibir o bloco VISA: só mostra se houver meta ou venda real
                    if (visaInfo.meta > 0 || visaInfo.real > 0) {
                        visaBody = `\n🥤 *VISA*\n` +
                                   `*Meta:* ${formatarMoeda(visaInfo.meta)}\n` +
                                   `*Real:* ${formatarMoeda(visaInfo.real)}\n` +
                                   `*Gap:* ${formatarMoeda(visaInfo.gap)}\n` +
                                   `*Giro OK?* ${visaInfo.giroOk}\n` +
                                   `*Venda Zero?* ${visaInfo.vendaZero}\n` +
                                   `---`;
                    }
                    
                    // O valor na planilha para percentual deve ser um número (ex: 0.85 para 85%)
                    const percentualFormatado = sopivInfo.percentualGiro * 100;
                    const barra = gerarBarraProgresso(percentualFormatado);
                    const summary = `\n📈 *Resumo SOPIV (Total)*\n` +
                                  `*Giro OK?* ${sopivInfo.giroOk}\n` +
                                  `*Venda Zero?* ${sopivInfo.vendaZero}\n` +
                                  `*% Giro Atingido:* ${percentualFormatado.toFixed(0)}% ${barra}`;

                    const resposta = header + sopiBody + visaBody + summary;
                    await client.sendMessage(message.from, resposta);

                } else {
                    await client.sendMessage(message.from, `⚠️ Nenhum dado de giro de equipamento encontrado para o PDV *${codigoPDV}*. Verifique o código e tente novamente.`);
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