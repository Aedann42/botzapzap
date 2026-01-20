// src/handlers/enviarGiroEquipamentosPdv.js
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

// --- CAMINHOS SEGUROS ---
const CAMINHO_REPRESENTANTES = path.join(process.cwd(), 'data', 'representantes.json');
const CAMINHO_STAFFS = path.join(process.cwd(), 'data', 'staffs.json');

const CAMINHO_ARQUIVO_EXCEL = path.join(
    '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2026\\1 - janeiro\\_GERADOR PDF',
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
    const blocosPreenchidos = Math.min(10, Math.max(0, Math.round((percentual / 100) * totalBlocos)));
    return '▰'.repeat(blocosPreenchidos) + '▱'.repeat(Math.max(0, totalBlocos - blocosPreenchidos));
}

function lerJsonSeguro(caminho) {
    try {
        return JSON.parse(fs.readFileSync(caminho, 'utf-8'));
    } catch (e) {
        console.error(`[LOG] Erro ao ler JSON ${caminho}:`, e);
        return [];
    }
}

function buscarSetorEUNB(idMensagem) {
    let telefoneLimpo = idMensagem.includes('@') ? idMensagem.split('@')[0] : idMensagem;
    let usuarioEncontrado = null;

    const representantes = lerJsonSeguro(CAMINHO_REPRESENTANTES);
    usuarioEncontrado = representantes.find(r => 
        String(r.telefone).trim() === String(telefoneLimpo).trim() || 
        (r.lid && r.lid === idMensagem)
    );

    if (!usuarioEncontrado) {
        const staffs = lerJsonSeguro(CAMINHO_STAFFS);
        usuarioEncontrado = staffs.find(s => String(s.telefone).trim() === String(telefoneLimpo).trim());
    }

    if (!usuarioEncontrado) return null;

    const setor = String(usuarioEncontrado.setor).trim();
    const UNB_Filtro = (setor.charAt(0) === '4') ? UNB_SETOR_4 : UNB_OUTROS_SETOR;

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
        console.error("[LOG] Erro na fila do Excel:", error);
    } finally {
        processNextExcelRequest();
    }
}

// --- Módulo Principal ---
module.exports = async (client, message) => {
    const codigoPDV = message.body.replace(/\D/g, '');
    
    if (!codigoPDV) {
        await client.sendMessage(message.from, '⚠️ Envie o código do PDV (apenas números).');
        return;
    }
    
    console.log(`[LOG START] Nova solicitação de Giro para PDV: ${codigoPDV}`);

    const dadosFiltro = buscarSetorEUNB(message.from);
    if (!dadosFiltro) {
        console.log(`[LOG] Usuário ${message.from} não identificado.`);
        await client.sendMessage(message.from, '❌ Não identifiquei seu Setor. Contate o APR.');
        return;
    }

    const { UNB: UNB_Filtro } = dadosFiltro;
    const CHAVE_BUSCA = `${UNB_Filtro}_${codigoPDV}`;
    console.log(`[LOG] Identificado Setor ${dadosFiltro.setor}. Chave de Busca: ${CHAVE_BUSCA}`);

    await client.sendMessage(message.from, `⏳ Consultando Giro para PDV *${codigoPDV}* em Base_SPO e Base_Total...`);

    const requestHandler = async () => {
        try {
            if (!fs.existsSync(CAMINHO_ARQUIVO_EXCEL)) {
                console.log(`[LOG] Arquivo não encontrado em: ${CAMINHO_ARQUIVO_EXCEL}`);
                await client.sendMessage(message.from, '❌ Arquivo de Giro não encontrado no servidor.');
                return;
            }

            console.log(`[LOG] Abrindo arquivo Excel...`);
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(CAMINHO_ARQUIVO_EXCEL);
            
            let pdvRow = null;
            let abaEncontrada = "";
            const abasParaBusca = ['Base_SPO', 'Base_Total'];

            for (const nomeAba of abasParaBusca) {
                console.log(`[LOG] Procurando na aba: ${nomeAba}...`);
                const aba = workbook.getWorksheet(nomeAba);
                
                if (!aba) {
                    console.log(`[LOG] Aba ${nomeAba} não existe no arquivo.`);
                    continue;
                }

                aba.eachRow((row, rowNumber) => {
                    if (rowNumber > 1 && !pdvRow) {
                        const chavePlanilha = getCellValueAsString(row.getCell(1));
                        if (chavePlanilha === CHAVE_BUSCA) {
                            pdvRow = row;
                            abaEncontrada = nomeAba;
                        }
                    }
                });

                if (pdvRow) {
                    console.log(`[LOG] PDV encontrado na aba ${nomeAba}!`);
                    break;
                }
            }

            if (pdvRow) {
                console.log(`[LOG] Extraindo dados da linha encontrada...`);
                
                const header = {
                    nBase: getCellValueAsString(pdvRow.getCell(2)),
                    razaoSocial: getCellValueAsString(pdvRow.getCell(3)),
                    gv: getCellValueAsString(pdvRow.getCell(4)),
                    rn: getCellValueAsString(pdvRow.getCell(5)),
                    visita: pdvRow.getCell(6).value,
                };

                const sopi = {
                    meta: parseFloat(pdvRow.getCell(8).value) || 0,
                    real: parseFloat(pdvRow.getCell(9).value) || 0,
                    gap: parseFloat(pdvRow.getCell(10).value) || 0,
                    ok: getCellValueAsString(pdvRow.getCell(11)),
                    zero: getCellValueAsString(pdvRow.getCell(12)),
                };

                const visa = {
                    meta: parseFloat(pdvRow.getCell(14).value) || 0,
                    real: parseFloat(pdvRow.getCell(15).value) || 0,
                    gap: parseFloat(pdvRow.getCell(16).value) || 0,
                    ok: getCellValueAsString(pdvRow.getCell(17)),
                    zero: getCellValueAsString(pdvRow.getCell(18)),
                };

                // NOVAS COLUNAS CHOPEIRA (Conforme imagem: X, Y, Z, AA, AB)
                const chopeira = {
                    meta: parseFloat(pdvRow.getCell(24).value) || 0, // X
                    real: parseFloat(pdvRow.getCell(25).value) || 0, // Y
                    gap: parseFloat(pdvRow.getCell(26).value) || 0,  // Z
                    ok: getCellValueAsString(pdvRow.getCell(27)),   // AA
                    zero: getCellValueAsString(pdvRow.getCell(28)), // AB
                };

                const resumo = {
                    ok: getCellValueAsString(pdvRow.getCell(20)),
                    zero: getCellValueAsString(pdvRow.getCell(21)),
                    percentual: (parseFloat(pdvRow.getCell(22).value) || 0) * 100,
                };

                console.log(`[LOG] Construindo mensagem de resposta...`);
                let msg = `📋 *Giro de Equipamentos - PDV ${header.nBase}*\n` +
                          `📍 *Fonte:* Aba ${abaEncontrada}\n\n` +
                          `🏪 ${header.razaoSocial}\n` +
                          `👨‍💼 GV: ${header.gv} | RN: ${header.rn}\n` +
                          `🗓️ Última Visita: ${formatarData(header.visita)}\n` +
                          `---`;

                if (sopi.meta > 0 || sopi.real > 0) {
                    msg += `\n🍺 *SOPI (Cerveja)*\n` +
                           `Meta: ${formatarMoeda(sopi.meta)} | Real: ${formatarMoeda(sopi.real)}\n` +
                           `Gap: ${formatarMoeda(sopi.gap)}\n` +
                           `Giro OK? ${sopi.ok} | Venda Zero? ${sopi.zero}\n---`;
                }

                if (visa.meta > 0 || visa.real > 0) {
                    msg += `\n🥤 *VISA*\n` +
                           `Meta: ${formatarMoeda(visa.meta)} | Real: ${formatarMoeda(visa.real)}\n` +
                           `Gap: ${formatarMoeda(visa.gap)}\n` +
                           `Giro OK? ${visa.ok} | Venda Zero? ${visa.zero}\n---`;
                }

                // BLOCO CHOPEIRA
                if (chopeira.meta > 0 || chopeira.real > 0) {
                    msg += `\n🍺 *CHOPEIRA*\n` +
                           `Meta: ${formatarMoeda(chopeira.meta)} | Real: ${formatarMoeda(chopeira.real)}\n` +
                           `Gap: ${formatarMoeda(chopeira.gap)}\n` +
                           `Giro OK? ${chopeira.ok} | Venda Zero? ${chopeira.zero}\n---`;
                }

                const barra = gerarBarraProgresso(resumo.percentual);
                msg += `\n📈 *RESUMO GERAL*\n` +
                       `Giro OK? ${resumo.ok} | Venda Zero? ${resumo.zero}\n` +
                       `% Atingido: ${resumo.percentual.toFixed(0)}% ${barra}`;

                await client.sendMessage(message.from, msg);
                console.log(`[LOG SUCCESS] Mensagem enviada para PDV ${header.nBase}`);

            } else {
                console.log(`[LOG] PDV ${codigoPDV} não encontrado em nenhuma das abas.`);
                await client.sendMessage(message.from, `⚠️ PDV *${codigoPDV}* não encontrado nas abas Base_SPO e Base_Total.`);
            }

        } catch (err) {
            console.error('[LOG ERROR] Erro crítico no handler:', err);
            await client.sendMessage(message.from, '❌ Erro ao processar dados de Giro. Tente novamente.');
        }
    };

    excelRequestQueue.push(requestHandler);
    if (!isProcessingExcel) processNextExcelRequest();
};