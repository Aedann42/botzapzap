// src/handlers/enviarCts.js (VERSÃO FINAL BLINDADA)

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs'); // <--- Faltava isso

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
    
    // 1. Validação Inicial
    if (!representante || !representante.setor) {
        console.log('[CT] Erro: Representante sem setor definido.');
        await client.sendMessage(message.from, '❌ Não consegui identificar seu setor no cadastro.');
        return;
    }

    const setorUsuario = representante.setor;
    console.log(`🔍 Buscando CTs para o setor: ${setorUsuario}`);

    // 2. Definição do Caminho do Arquivo
    const arquivo = path.join(
        '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2026\\ 1 - janeiro\\',
        '_CT 2025 - Controle Bonificacao.xlsx'
    );

    await client.sendMessage(
        message.from,
        `⏳ Buscando contratos de bonificação para o setor *${setorUsuario}*...`
    );

    return new Promise((resolve, reject) => {
        const requestHandler = async () => {
            try {
                // 3. Verificação de Existência do Arquivo
                if (!fs.existsSync(arquivo)) {
                    console.error(`[CT] Arquivo não encontrado: ${arquivo}`);
                    await client.sendMessage(message.from, '❌ O arquivo de Bonificação (CT) não foi encontrado na rede.');
                    resolve();
                    return;
                }

                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.readFile(arquivo);
                console.log('✅ Planilha de Bonificação (CT) carregada.');

                const aba = workbook.getWorksheet('Base CT');
                
                if (!aba) {
                    console.error('❌ Aba "Base CT" não encontrada.');
                    await client.sendMessage(message.from, '❌ A aba de dados "Base CT" não existe na planilha.');
                    resolve();
                    return;
                }

                const contratosEncontrados = [];

                aba.eachRow((row, rowNumber) => {
                    if (rowNumber === 1) return;

                    const rnPlanilha = getCellValueAsString(row.getCell(2)); // Coluna B = Setor/RN

                    // Comparação flexível (string e trim)
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
                        const produtos = ct.BoniProdutos;
                        const pago = ct.BonifPago;
                        
                        // Cálculo de Progresso: (Pago / Produtos) * 100
                        const percentualPago = produtos > 0 ? Math.round((pago / produtos) * 100) : 0;
                        const barraProgresso = gerarBarraProgresso(percentualPago);

                        return (
                            `🏪 *PDV:* ${ct.codPdv} - ${ct.Cliente}\n` +
                            `🔖 *Marca:* ${ct.Marca}\n` +
                            `💰 *Total Contrato:* ${formatarMoeda(ct.VrTotalContrato)}\n` +
                            `📦 *Meta Produtos:* ${formatarMoeda(produtos)}\n` +
                            `💸 *Pago:* ${formatarMoeda(pago)}\n` +
                            `📊 *Saldo:* ${formatarMoeda(ct.Saldos)}\n` +
                            `📈 *Progresso:* ${percentualPago}% ${barraProgresso}`
                        );
                    }).join('\n\n------------------------------\n\n');

                    const resposta = `🎁 *CONTRATOS DE BONIFICAÇÃO (CT)*\n` +
                                     `📍 Setor: ${setorUsuario}\n\n` +
                                     `${detalhesContratos}`;

                    await client.sendMessage(message.from, resposta);

                } else {
                    await client.sendMessage(message.from, `⚠️ Nenhum contrato de bonificação encontrado para o setor *${setorUsuario}*.`);
                }
                resolve();

            } catch (err) {
                console.error('❌ Erro ao processar planilha CT:', err);
                await client.sendMessage(message.from, '❌ Erro ao ler a planilha de contratos.');
                reject(err);
            }
        };

        excelRequestQueue.push(requestHandler);
        if (!isProcessingExcel) {
            processNextExcelRequest();
        }
    });
};