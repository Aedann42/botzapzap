// enviarResumoPDV.js
const ExcelJS = require('exceljs');
const path = require('path');

// --- Funções Auxiliares ---
function excelSerialToDate(serial) {
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + serial * 86400000).toLocaleDateString('pt-BR');
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

// --- Módulo principal ---
module.exports = async (client, message) => {
    const codigoPDV = message.body.trim(); // <- mantém como string limpa
    console.log('🔍 Código NB recebido do usuário:', codigoPDV);

    const arquivo = path.join(
        '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2025\\7 - JULHO\\_GERADOR PDF\\',
        'Acomp Tarefas do Dia.xlsx'
    );

    await client.sendMessage(
        message.from,
        `⏳ Buscando tarefas do NB ${codigoPDV}, aguarde um momento...`
    );

    return new Promise(async (resolve, reject) => {
        const requestHandler = async () => {
            try {
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.readFile(arquivo);
                console.log('✅ Planilha carregada com sucesso.');

                // Log das abas
                console.log('🔍 Nomes das abas encontradas no arquivo Excel:');
                workbook.eachSheet((sheet, sheetId) => {
                    console.log(`- Aba ${sheetId}: "${sheet.name}"`);
                });

                const aba = workbook.getWorksheet('BI - BEES Force Tasks');
                if (!aba) {
                    console.error('❌ Aba "BI - BEES Force Tasks" não encontrada.');
                    await client.sendMessage(message.from, '❌ Não foi possível encontrar a aba de tarefas. Avise o APR.');
                    resolve();
                    return;
                }

                let linhas = [];
                let totalLinhas = 0;
                let correspondencias = 0;
                let totalCompletas = 0;
                let totalValidadas = 0;
                let revenda = '';

                aba.eachRow((row, rowNumber) => {
                    if (rowNumber === 1) return;
                    totalLinhas++;

                    const nbPlanilha = String(row.getCell(5).value).trim(); // <- pega diretamente o valor do NB
                    const codigo = String(codigoPDV).trim();

                    if (nbPlanilha === codigo) {
                        correspondencias++;

                        if (!revenda) {
                            revenda = getCellValueAsString(row.getCell(4));
                        }

                        const dataCriacaoValor = row.getCell(1).value;
                        let dataCriacao = 'Data inválida';
                        if (typeof dataCriacaoValor === 'object' && dataCriacaoValor instanceof Date) {
                            dataCriacao = dataCriacaoValor.toLocaleDateString('pt-BR');
                        } else if (typeof dataCriacaoValor === 'number') {
                            dataCriacao = excelSerialToDate(dataCriacaoValor);
                        }

                        const tarefa = getCellValueAsString(row.getCell(19)) || '-';
                        const completa = row.getCell(20).value === 1 ? '✅ Sim' : '❌ Não';
                        const validada = row.getCell(21).value === 1 ? '✅ Sim' : '❌ Não';
                        const categoria = getCellValueAsString(row.getCell(26)) || '-';

                        if (row.getCell(20).value === 1) totalCompletas++;
                        if (row.getCell(21).value === 1) totalValidadas++;

                        linhas.push(
                            `🗓️ *Data Criação:* ${dataCriacao}\n` +
                            `📝 *Tarefa:* ${tarefa}\n` +
                            `✅ *Completa:* ${completa}\n` +
                            `🔎 *Validada:* ${validada}\n` +
                            `🏷️ *Categoria:* ${categoria}`
                        );
                    }
                });

                const percentualValidadas = correspondencias > 0
                    ? Math.round((totalValidadas / correspondencias) * 100)
                    : 0;
                const barra = gerarBarraProgresso(percentualValidadas);

                const resposta = correspondencias > 0
                    ? `📊 *Resumo das Tarefas para o NB ${codigoPDV}:*\n` +
                      `🏬 *Código da revenda:* ${revenda}\n` +
                      `Em caso de divergencia no cod da revenda averiguar com o APR, pode ser que a revenda seja outra \n`+
                      `• Total de tarefas: ${correspondencias}\n` +
                      `• Completas: ${totalCompletas}\n` +
                      `• Validadas: ${totalValidadas}\n` +
                      `• Validação: ${percentualValidadas}% ${barra}\n\n` +
                      `📋 *Detalhes das tarefas:*\n\n${linhas.join('\n\n')}`
                    : `⚠️ Nenhuma tarefa encontrada para o NB ${codigoPDV}. Verifique se o código está correto.`;

                await client.sendMessage(message.from, resposta);
                resolve();
            } catch (err) {
                console.error('❌ Erro ao consultar tarefas:', err);
                await client.sendMessage(message.from, '❌ Erro ao consultar tarefas. Avise o APR.');
                reject(err);
            }
        };

        excelRequestQueue.push(requestHandler);

        if (!isProcessingExcel) {
            processNextExcelRequest();
        }
    });
};
