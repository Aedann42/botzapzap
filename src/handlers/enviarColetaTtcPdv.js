// enviarColetaTtcPdv.js
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

    const arquivo = path.join(
        '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2025\\10 - OUTUBRO\\_GERADOR PDF',
        'Acomp Coleta TTC.xlsx'
    );

    await client.sendMessage(
        message.from,
        `⏳ Buscando dados de coleta para o PDV *${codigoPDV}*... um momento.`
    );

    return new Promise(async (resolve, reject) => {
        const requestHandler = async () => {
            try {
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.readFile(arquivo);
                console.log('✅ Planilha de coleta carregada com sucesso.');

                const aba = workbook.worksheets[0];
                if (!aba) {
                    console.error('❌ Nenhuma aba encontrada na planilha.');
                    await client.sendMessage(message.from, '❌ Não foi possível encontrar a aba de dados. Avise o APR.');
                    resolve();
                    return;
                }

                let pdvInfo = null;
                const skusDetalhes = [];
                let totalSKUs = 0;
                let totalAderido = 0;
                let dataMaisRecente = null; // <-- ADICIONADO: Variável para guardar a data mais recente

                aba.eachRow((row, rowNumber) => {
                    if (rowNumber === 1) return;

                    const codPdvPlanilha = getCellValueAsString(row.getCell(2));

                    if (codPdvPlanilha === codigoPDV) {
                        totalSKUs++;

                        if (!pdvInfo) {
                            pdvInfo = {
                                codUnb: getCellValueAsString(row.getCell(1)),
                                codPdv: codPdvPlanilha,
                                nomePdv: getCellValueAsString(row.getCell(3)),
                                codSetor: getCellValueAsString(row.getCell(4)),
                                frequencia: getCellValueAsString(row.getCell(5)),
                            };
                        }

                        // --- Lógica para encontrar a data mais recente --- // <-- ADICIONADO
                        const valorDataColeta = row.getCell(11).value;
                        let dataAtualDaLinha = null;

                        if (valorDataColeta instanceof Date) {
                            dataAtualDaLinha = valorDataColeta;
                        } else if (typeof valorDataColeta === 'number') {
                            const excelEpoch = new Date(1899, 11, 30);
                            dataAtualDaLinha = new Date(excelEpoch.getTime() + valorDataColeta * 86400000);
                        }
                        
                        if (dataAtualDaLinha && (!dataMaisRecente || dataAtualDaLinha > dataMaisRecente)) {
                            dataMaisRecente = dataAtualDaLinha;
                        }
                        // --- Fim da lógica da data ---

                        const ttcAderido = parseFloat(row.getCell(8).value) || 0;
                        const ttcColetado = parseFloat(row.getCell(9).value) || 0;
                        const situacao = getCellValueAsString(row.getCell(10));
                        const difTTC = ttcColetado - ttcAderido;

                        if (situacao.toUpperCase() === 'ADERIDO') {
                            totalAderido++;
                        }

                    // Adiciona um emoji com base na situação
                    const emojiSituacao = situacao.toUpperCase() === 'ADERIDO' ? '✅' : '❌';

                    skusDetalhes.push(
                        `*SKU:* ${getCellValueAsString(row.getCell(6))} - ${getCellValueAsString(row.getCell(7))}\n` +
                        `📈 *TTC Aderido:* ${formatarMoeda(ttcAderido)}\n` +
                        `📥 *TTC Coletado:* ${formatarMoeda(ttcColetado)}\n` +
                        `📊 *Diferença:* ${formatarMoeda(difTTC)}\n` +
                        `📌 *Situação:* ${emojiSituacao} ${situacao}\n` + // <-- LINHA ALTERADA
                        `🗓️ *Data Coleta:* ${formatarData(valorDataColeta)}`
                    );
                    }
                });

                if (totalSKUs > 0) {
                    // --- Lógica para calcular os dias desde a última coleta --- // <-- ADICIONADO
                    let diasDesdeUltimaColeta = 'N/A';
                    if (dataMaisRecente) {
                        const hoje = new Date();
                        hoje.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas o dia
                        dataMaisRecente.setHours(0, 0, 0, 0);

                        const diffEmMilissegundos = hoje.getTime() - dataMaisRecente.getTime();
                        const diffEmDias = Math.round(diffEmMilissegundos / (1000 * 60 * 60 * 24));

                        if (diffEmDias === 0) {
                            diasDesdeUltimaColeta = 'Hoje';
                        } else if (diffEmDias === 1) {
                            diasDesdeUltimaColeta = 'Ontem (1 dia atrás)';
                        } else {
                            diasDesdeUltimaColeta = `${diffEmDias} dias atrás`;
                        }
                    }
                    // --- Fim do cálculo de dias ---

                    const percentualAderido = totalSKUs > 0 ? Math.round((totalAderido / totalSKUs) * 100) : 0;
                    const barra = gerarBarraProgresso(percentualAderido);

                    // <-- ALTERADO: Adicionada a nova linha no cabeçalho -->
                    const header = `📋 *Relatório de Coleta TTC para o PDV ${pdvInfo.codPdv}*\n\n` +
                        `🏪 *PDV:* ${pdvInfo.nomePdv}\n` +
                        `🏢 *UNB:* ${pdvInfo.codUnb}\n` +
                        `📍 *Setor:* ${pdvInfo.codSetor}\n` +
                        `🔄 *Frequência:* ${pdvInfo.frequencia}\n` +
                        `⏳ *Última Coleta:* ${diasDesdeUltimaColeta}\n`;

                    const summary = `\n📊 *Resumo Geral:*\n` +
                        `*Total de SKUs:* ${totalSKUs}\n` +
                        `*SKUs Aderidos:* ${totalAderido}\n` +
                        `*Aderência:* ${percentualAderido}% ${barra}\n`;

                    const body = `\n📦 *Detalhes dos SKUs:*\n\n${skusDetalhes.join('\n\n')}`;

                    const resposta = header + summary + body;
                    await client.sendMessage(message.from, resposta);

                } else {
                    await client.sendMessage(message.from, `⚠️ Nenhum dado de coleta encontrado para o PDV *${codigoPDV}*. Verifique o código e tente novamente.`);
                }
                resolve();

            } catch (err) {
                console.error('❌ Erro ao consultar a planilha de coleta:', err);
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