// enviarCts.js
const ExcelJS = require('exceljs');
const path = require('path');

// --- Funções Auxiliares ---

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(valor || 0);
}

function getCellValueAsString(cell) {
    if (!cell || !cell.value) return '';
    if (typeof cell.value === 'object' && cell.value.richText) {
        return cell.value.richText.map(rt => rt.text).join('').trim();
    }
    return String(cell.value).trim();
}

function getCellValueAsNumber(cell) {
    if (!cell || !cell.value) return 0;

    const valor = cell.value;

    if (typeof valor === 'object' && valor.result !== undefined) {
        return Number(valor.result) || 0;
    }

    const numero = parseFloat(valor);
    return isNaN(numero) ? 0 : numero;
}

function gerarBarraProgresso(percentual) {
    const totalBlocos = 10;
    const percentualSeguro = Math.min(Math.max(percentual, 0), 100);
    const blocosPreenchidos = Math.round((percentualSeguro / 100) * totalBlocos);
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
module.exports = async (client, message, representante) => {
    const setorUsuario = representante.setor;
    console.log(`🔍 Buscando CTs para o setor: ${setorUsuario}`);

    const arquivo = path.join(
        '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2025\\11 - NOVEMBRO\\',
        '_CT 2025 - Controle Bonificacao.xlsx'
    );

    await client.sendMessage(
        message.from,
        `⏳ Buscando todos os contratos de bonificação para o seu setor (*${setorUsuario}*)...`
    );

    return new Promise(async (resolve, reject) => {
        const requestHandler = async () => {
            try {
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.readFile(arquivo);
                console.log('✅ Planilha de Bonificação (CT) carregada com sucesso.');

                const aba = workbook.getWorksheet('Base CT');
                
                if (!aba) {
                    console.error('❌ A aba "Base CT" não foi encontrada na planilha.');
                    await client.sendMessage(message.from, '❌ Não foi possível encontrar a aba "Base CT" na planilha. Avise o APR.');
                    resolve();
                    return;
                }

                const contratosEncontrados = [];

                aba.eachRow((row, rowNumber) => {
                    if (rowNumber === 1) return;

                    const rnPlanilha = getCellValueAsString(row.getCell(2));

                    if (String(rnPlanilha).trim() === String(setorUsuario).trim()) {
                        const contratoInfo = {
                            codPdv: getCellValueAsString(row.getCell(3)),
                            Cliente: getCellValueAsString(row.getCell(4)),
                            Marca: getCellValueAsString(row.getCell(5)),
                            VrTotalContrato: getCellValueAsNumber(row.getCell(6)),
                            BoniProdutos: getCellValueAsNumber(row.getCell(7)),
                            BonifPago: getCellValueAsNumber(row.getCell(8)),
                            Saldos: getCellValueAsNumber(row.getCell(9))
                        };
                        contratosEncontrados.push(contratoInfo);
                    }
                });

                if (contratosEncontrados.length > 0) {
                    const detalhesContratos = contratosEncontrados.map(ct => {
                        // <-- ALTERAÇÃO DA LÓGICA AQUI -->
                        const produtos = ct.BoniProdutos;
                        const pago = ct.BonifPago;
                        
                        // A porcentagem agora é (PAGO / PRODUTOS)
                        const percentualPago = produtos > 0 ? Math.round((pago / produtos) * 100) : 0;
                        const barraProgresso = gerarBarraProgresso(percentualPago);

                        return (
                            `🏪 *PDV:* ${ct.codPdv} - ${ct.Cliente}\n` +
                            `🔖 *Marca:* ${ct.Marca}\n` +
                            `💰 *Total Contrato:* ${formatarMoeda(ct.VrTotalContrato)}\n` +
                            `📦 *Bonificação (Produtos):* ${formatarMoeda(produtos)}\n` +
                            `💸 *Bonificação (Paga):* ${formatarMoeda(pago)}\n` +
                            `📊 *Saldo:* ${formatarMoeda(ct.Saldos)}\n` +
                            `📈 *Progresso:* ${percentualPago}% ${barraProgresso}`
                        );
                    }).join('\n\n');

                    const resposta = `🎁 *Contratos de Bonificação (CT) para o Setor ${setorUsuario}*\n\n` +
                                   `${detalhesContratos}`;

                    await client.sendMessage(message.from, resposta);

                } else {
                    await client.sendMessage(message.from, `⚠️ Nenhum contrato de bonificação encontrado para o seu setor (*${setorUsuario}*).`);
                }
                resolve();

            } catch (err) {
                console.error('❌ Erro ao consultar a planilha de bonificação:', err);
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