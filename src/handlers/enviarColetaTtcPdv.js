// src/handlers/enviarColetaTtcPdv.js (VERSÃO FINAL BLINDADA)

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

// --- CONFIGURAÇÃO DE CAMINHOS SEGUROS ---
const CAMINHO_REPRESENTANTES = path.join(process.cwd(), 'data', 'representantes.json');
const CAMINHO_STAFFS = path.join(process.cwd(), 'data', 'staffs.json');

const CAMINHO_ARQUIVO_EXCEL = path.join(
    '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2026\\ 1 - janeiro\\_GERADOR PDF',
    'Acomp Coleta TTC.xlsx'
);

// Constantes de Negócio
const UNB_SETOR_4 = '1046853';
const UNB_OUTROS_SETOR = '296708';

// --- Funções Auxiliares de Formatação ---

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
        // Ajuste simples de timezone para data do Excel
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
    // Extrai número limpo (se for @c.us)
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
        console.log(`[TTC] Usuário não identificado: ${telefoneLimpo} (ID: ${idMensagem})`);
        return null;
    }

    const setor = String(usuarioEncontrado.setor).trim();
    const primeiroDigito = setor.charAt(0);
    
    // Lógica de UNB baseada no primeiro dígito do setor
    let UNB_Filtro = (primeiroDigito === '4') ? UNB_SETOR_4 : UNB_OUTROS_SETOR;

    console.log(`[TTC] Usuário identificado em ${fonte}. Setor: ${setor} -> UNB: ${UNB_Filtro}`);
    return { UNB: UNB_Filtro, setor: setor };
}

// --- Fila de Processamento do Excel ---
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
        console.error("[TTC] Erro na fila do Excel:", error);
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

    // 1. Identificação do Usuário
    const dadosFiltro = buscarSetorEUNB(message.from);

    if (!dadosFiltro) {
        await client.sendMessage(message.from, '❌ Não foi possível identificar seu cadastro/setor. Fale com o suporte.');
        return;
    }

    const { UNB: UNB_Filtro, setor: setorDoUsuario } = dadosFiltro;

    await client.sendMessage(message.from, `⏳ Buscando dados TTC para PDV *${codigoPDV}*...`);

    // Adiciona à fila para não travar leitura de arquivo pesado
    const requestHandler = async () => {
        try {
            if (!fs.existsSync(CAMINHO_ARQUIVO_EXCEL)) {
                await client.sendMessage(message.from, '❌ O arquivo de Coleta TTC não foi encontrado no servidor.');
                return;
            }

            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(CAMINHO_ARQUIVO_EXCEL);
            
            const aba = workbook.worksheets[0];
            if (!aba) {
                await client.sendMessage(message.from, '❌ Planilha sem dados.');
                return;
            }

            let pdvInfo = null;
            const skusDetalhes = [];
            let totalSKUs = 0;
            let totalAderido = 0;
            let dataMaisRecente = null; 

            aba.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; // Pula cabeçalho

                // Coluna A (1) = UNB | Coluna B (2) = PDV
                const codUnbPlanilha = getCellValueAsString(row.getCell(1)); 
                const codPdvPlanilha = getCellValueAsString(row.getCell(2)); 
                
                // FILTRO: Bate PDV e Bate UNB do setor do usuário
                if (codPdvPlanilha === codigoPDV && codUnbPlanilha === UNB_Filtro) {
                    totalSKUs++;

                    // Captura dados do cabeçalho na primeira ocorrência
                    if (!pdvInfo) {
                        pdvInfo = {
                            codUnb: codUnbPlanilha,
                            codPdv: codPdvPlanilha,
                            nomePdv: getCellValueAsString(row.getCell(3)),
                            codSetor: getCellValueAsString(row.getCell(4)),
                            frequencia: getCellValueAsString(row.getCell(5)),
                        };
                    }

                    // Data mais recente
                    const valorData = row.getCell(11).value;
                    let dataLinha = null;
                    if (valorData instanceof Date) dataLinha = valorData;
                    else if (typeof valorData === 'number') dataLinha = new Date(new Date(1899, 11, 30).getTime() + valorData * 86400000);

                    if (dataLinha && (!dataMaisRecente || dataLinha > dataMaisRecente)) {
                        dataMaisRecente = dataLinha;
                    }

                    // Dados da Linha
                    const ttcAderido = parseFloat(row.getCell(8).value) || 0;
                    const ttcColetado = parseFloat(row.getCell(9).value) || 0;
                    const situacao = getCellValueAsString(row.getCell(10));
                    const diff = ttcColetado - ttcAderido;

                    if (situacao.toUpperCase().includes('ADERIDO')) {
                        totalAderido++;
                    }

                    const emoji = situacao.toUpperCase().includes('ADERIDO') ? '✅' : '❌';

                    skusDetalhes.push(
                        `*SKU:* ${getCellValueAsString(row.getCell(6))} - ${getCellValueAsString(row.getCell(7))}\n` +
                        `📈 *Meta:* ${formatarMoeda(ttcAderido)} | 📥 *Real:* ${formatarMoeda(ttcColetado)}\n` +
                        `📊 *Dif:* ${formatarMoeda(diff)} | ${emoji} *${situacao}*\n` +
                        `🗓️ *Data:* ${formatarData(valorData)} | 🏷️ *Tipo:* ${getCellValueAsString(row.getCell(12))}`
                    );
                }
            });

            if (totalSKUs > 0) {
                // Cálculo de dias
                let diasTxt = 'N/A';
                if (dataMaisRecente) {
                    const hoje = new Date();
                    hoje.setHours(0,0,0,0);
                    dataMaisRecente.setHours(0,0,0,0);
                    const diffDias = Math.round((hoje - dataMaisRecente) / (1000 * 60 * 60 * 24));
                    diasTxt = diffDias === 0 ? 'Hoje' : (diffDias === 1 ? 'Ontem' : `${diffDias} dias atrás`);
                }

                const perc = Math.round((totalAderido / totalSKUs) * 100);
                const barra = gerarBarraProgresso(perc);

                const header = `📋 *COLETA TTC - PDV ${pdvInfo.codPdv}*\n` +
                               `🏪 ${pdvInfo.nomePdv}\n` +
                               `📍 Setor: ${pdvInfo.codSetor} | 🔄 Freq: ${pdvInfo.frequencia}\n` +
                               `⏳ Última Coleta: ${diasTxt}\n`;

                const resumo = `\n📊 *RESUMO*\n` +
                               `SKUs: ${totalSKUs} | Aderentes: ${totalAderido}\n` +
                               `Aderência: ${perc}% ${barra}\n`;

                const detalhes = `\n📦 *DETALHES*\n\n` + skusDetalhes.join('\n-------------------\n');

                await client.sendMessage(message.from, header + resumo + detalhes);
            } else {
                await client.sendMessage(message.from, `⚠️ Nenhum dado encontrado para PDV *${codigoPDV}* na UNB *${UNB_Filtro}* (Setor ${setorDoUsuario}).`);
            }

        } catch (err) {
            console.error('[TTC] Erro ao processar Excel:', err);
            await client.sendMessage(message.from, '❌ Erro ao ler planilha de dados. Tente novamente mais tarde.');
        }
    };

    excelRequestQueue.push(requestHandler);
    if (!isProcessingExcel) {
        processNextExcelRequest();
    }
};