// src/handlers/enviarGiroEquipamentosPdv.js (VERSÃO FINAL BLINDADA)

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

// --- CAMINHOS SEGUROS ---
const CAMINHO_REPRESENTANTES = path.join(process.cwd(), 'data', 'representantes.json');
const CAMINHO_STAFFS = path.join(process.cwd(), 'data', 'staffs.json');

const CAMINHO_ARQUIVO_EXCEL = path.join(
    '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2026\\ 1 - janeiro\\_GERADOR PDF',
    'Acomp Giro de Equipamentos.xlsx'
);

// Constantes
const UNB_SETOR_4 = '1046853';
const UNB_OUTROS_SETOR = '296708';

// --- Funções Auxiliares ---

function formatarMoeda(valor) {
    if (typeof valor !== 'number' || isNaN(valor)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function formatarData(valorCelula) {
    if (!valorCelula) return 'N/A';
    if (valorCelula instanceof Date) {
        return valorCelula.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    }
    if (typeof valorCelula === 'number') {
        const excelEpoch = new Date(1899, 11, 30);
        const dataCalculada = new Date(excelEpoch.getTime() + valorCelula * 86400000);
        // Ajuste de fuso
        const dataCorrigida = new Date(dataCalculada.getTime() + (dataCalculada.getTimezoneOffset() * 60000));
        return dataCorrigida.toLocaleDateString('pt-BR');
    }
    return String(valorCelula);
}

function getCellValueAsString(cell) {
    if (!cell || !cell.value) return '';
    const value = cell.value;
    if (typeof value === 'object') {
        if (value.richText) return value.richText.map(rt => rt.text).join('').trim();
        if (value instanceof Date) return value.toLocaleDateString('pt-BR');
    }
    return String(value).trim();
}

function gerarBarraProgresso(percentual) {
    const totalBlocos = 10;
    const blocosPreenchidos = Math.round((percentual / 100) * totalBlocos);
    return '▰'.repeat(blocosPreenchidos) + '▱'.repeat(Math.max(0, totalBlocos - blocosPreenchidos));
}

function lerJsonSeguro(caminho) {
    try {
        return JSON.parse(fs.readFileSync(caminho, 'utf-8'));
    } catch (e) {
        console.error(`Erro ao ler JSON ${caminho}:`, e);
        return [];
    }
}

/**
 * Busca o setor do usuário usando a lógica Híbrida (Telefone ou LID)
 */
function buscarSetorEUNB(idMensagem) {
    let telefoneLimpo = idMensagem.includes('@') ? idMensagem.split('@')[0] : idMensagem;

    let usuarioEncontrado = null;
    let fonte = 'Nenhum';

    // 1. Busca em REPRESENTANTES (Híbrido)
    const representantes = lerJsonSeguro(CAMINHO_REPRESENTANTES);
    usuarioEncontrado = representantes.find(r => 
        String(r.telefone).trim() === String(telefoneLimpo).trim() || 
        (r.lid && r.lid === idMensagem)
    );

    if (usuarioEncontrado) fonte = 'Representantes';

    // 2. Se não achou, busca em STAFFS
    if (!usuarioEncontrado) {
        const staffs = lerJsonSeguro(CAMINHO_STAFFS);
        usuarioEncontrado = staffs.find(s => 
            String(s.telefone).trim() === String(telefoneLimpo).trim()
        );
        if (usuarioEncontrado) fonte = 'Staffs';
    }

    if (!usuarioEncontrado) {
        console.log(`[Giro] Usuário não identificado: ${telefoneLimpo}`);
        return null;
    }

    const setor = String(usuarioEncontrado.setor).trim();
    const primeiroDigito = setor.charAt(0);
    let UNB_Filtro = (primeiroDigito === '4') ? UNB_SETOR_4 : UNB_OUTROS_SETOR;

    console.log(`[Giro] Usuário identificado em ${fonte}. Setor: ${setor} -> UNB: ${UNB_Filtro}`);
    return { UNB: UNB_Filtro, setor: setor };
}

// --- Fila de Excel ---
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
        console.error("[Giro] Erro na fila do Excel:", error);
    } finally {
        processNextExcelRequest();
    }
}

// --- Módulo Principal ---
module.exports = async (client, message) => {
    const codigoPDV = message.body.replace(/\D/g, '');
    
    if (!codigoPDV) {
        await client.sendMessage(message.from, '⚠️ Por favor, envie o código do PDV (apenas números).');
        return;
    }
    
    // 1. Identificação
    const dadosFiltro = buscarSetorEUNB(message.from);

    if (!dadosFiltro) {
        await client.sendMessage(message.from, '❌ Não foi possível identificar seu Setor. Avise o APR.');
        return;
    }

    const { UNB: UNB_Filtro } = dadosFiltro;
    
    // 2. Chave de Busca Combinada
    const CHAVE_BUSCA = `${UNB_Filtro}_${codigoPDV}`;
    console.log(`[Giro] Buscando Chave: ${CHAVE_BUSCA}`);

    await client.sendMessage(message.from, `⏳ Consultando Giro de Equipamentos para PDV *${codigoPDV}*...`);

    const requestHandler = async () => {
        try {
            if (!fs.existsSync(CAMINHO_ARQUIVO_EXCEL)) {
                await client.sendMessage(message.from, '❌ Arquivo de Giro de Equipamentos não encontrado.');
                return;
            }

            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(CAMINHO_ARQUIVO_EXCEL);
            
            const aba = workbook.worksheets[0];
            if (!aba) {
                await client.sendMessage(message.from, '❌ Planilha vazia ou inválida.');
                return;
            }

            let pdvRow = null;

            // Busca pela CHAVE na coluna A
            aba.eachRow((row, rowNumber) => {
                if (rowNumber > 1) {
                    const chavePlanilha = getCellValueAsString(row.getCell(1)); // Coluna A
                    if (chavePlanilha === CHAVE_BUSCA) {
                        pdvRow = row;
                        return false; // Encontrou, para o loop
                    }
                }
            });

            if (pdvRow) {
                // Extração de dados (Mapeamento das colunas conforme seu original)
                const headerInfo = {
                    chave: getCellValueAsString(pdvRow.getCell(1)), // A
                    nBase: getCellValueAsString(pdvRow.getCell(2)), // B
                    razaoSocial: getCellValueAsString(pdvRow.getCell(3)), // C
                    gv: getCellValueAsString(pdvRow.getCell(4)), // D
                    rn: getCellValueAsString(pdvRow.getCell(5)), // E
                    visita: pdvRow.getCell(6).value, // F
                };

                const sopiInfo = {
                    meta: parseFloat(pdvRow.getCell(8).value) || 0, // H
                    real: parseFloat(pdvRow.getCell(9).value) || 0, // I
                    gap: parseFloat(pdvRow.getCell(10).value) || 0, // J
                    giroOk: getCellValueAsString(pdvRow.getCell(11)), // K
                    vendaZero: getCellValueAsString(pdvRow.getCell(12)), // L
                };

                const visaInfo = {
                    meta: parseFloat(pdvRow.getCell(14).value) || 0, // N
                    real: parseFloat(pdvRow.getCell(15).value) || 0, // O
                    gap: parseFloat(pdvRow.getCell(16).value) || 0, // P
                    giroOk: getCellValueAsString(pdvRow.getCell(17)), // Q
                    vendaZero: getCellValueAsString(pdvRow.getCell(18)), // R
                };

                const sopivInfo = {
                    giroOk: getCellValueAsString(pdvRow.getCell(20)), // T
                    vendaZero: getCellValueAsString(pdvRow.getCell(21)), // U
                    percentualGiro: parseFloat(pdvRow.getCell(22).value) || 0, // V
                };

                // Montagem da Resposta
                let resposta = `📋 *Giro de Equipamentos - PDV ${headerInfo.nBase}*\n\n` +
                               `🏪 ${headerInfo.razaoSocial}\n` +
                               `👨‍💼 GV: ${headerInfo.gv} | RN: ${headerInfo.rn}\n` +
                               `🗓️ Última Visita: ${formatarData(headerInfo.visita)}\n` +
                               `---`;

                if (sopiInfo.meta > 0 || sopiInfo.real > 0) {
                    resposta += `\n🍺 *SOPI (Cerveja)*\n` +
                                `Meta: ${formatarMoeda(sopiInfo.meta)} | Real: ${formatarMoeda(sopiInfo.real)}\n` +
                                `Gap: ${formatarMoeda(sopiInfo.gap)}\n` +
                                `Giro OK? ${sopiInfo.giroOk} | Venda Zero? ${sopiInfo.vendaZero}\n---`;
                }

                if (visaInfo.meta > 0 || visaInfo.real > 0) {
                    resposta += `\n🥤 *VISA*\n` +
                                `Meta: ${formatarMoeda(visaInfo.meta)} | Real: ${formatarMoeda(visaInfo.real)}\n` +
                                `Gap: ${formatarMoeda(visaInfo.gap)}\n` +
                                `Giro OK? ${visaInfo.giroOk} | Venda Zero? ${visaInfo.vendaZero}\n---`;
                }

                const percentual = sopivInfo.percentualGiro * 100;
                const barra = gerarBarraProgresso(percentual);

                resposta += `\n📈 *RESUMO GERAL*\n` +
                            `Giro OK? ${sopivInfo.giroOk}\n` +
                            `Venda Zero? ${sopivInfo.vendaZero}\n` +
                            `% Atingido: ${percentual.toFixed(0)}% ${barra}`;

                await client.sendMessage(message.from, resposta);

            } else {
                await client.sendMessage(message.from, `⚠️ Nenhum dado de giro encontrado para PDV *${codigoPDV}* (Chave: ${CHAVE_BUSCA}).`);
            }

        } catch (err) {
            console.error('[Giro] Erro:', err);
            await client.sendMessage(message.from, '❌ Erro ao ler planilha de Giro. Tente mais tarde.');
        }
    };

    excelRequestQueue.push(requestHandler);
    if (!isProcessingExcel) {
        processNextExcelRequest();
    }
};