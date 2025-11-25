// enviarColetaTtcPdv.js (CORRIGIDO PARA LIDs)
const ExcelJS = require('exceljs');
const path = require('path');

// Importa o seu módulo de manipulação de dados (Assumindo que está em '../utils/dataHandler')
const dataHandler = require('../utils/dataHandler'); 

// --- Constantes de Configuração ---
const UNB_SETOR_4 = '1046853';
const UNB_OUTROS_SETOR = '296708';
const CAMINHO_ARQUIVO_EXCEL = path.join(
    '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2025\\11 - NOVEMBRO\\_GERADOR PDF',
    'Acomp Coleta TTC.xlsx'
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
 * @param {string} telefoneLimpoDoUsuario - O telefone JÁ LIMPO do usuário (e.g., "5532...").
 * @returns {{UNB: string, setor: string} | null} Objeto com a UNB de filtro e o setor, ou null.
 */
function buscarSetorEUNB(telefoneLimpoDoUsuario) { // <-- PARÂMETRO MUDADO
    
    // const telLimpoUsuario = telefoneDoUsuario.replace('@c.us', '').replace(/\D/g, ''); // <-- LINHA ANTIGA
    
    // --- 🚀 CORREÇÃO LID (1/2) ---
    // A função agora recebe o número já limpo, então usamos ele direto.
    const telLimpoUsuario = telefoneLimpoDoUsuario; 
    console.log(`[DEBUG] Telefone do Usuário (já limpo): ${telLimpoUsuario}`);
    // --- FIM CORREÇÃO ---

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
    
    // 3. RETORNA RESULTADO (Lógica inalterada)
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
    
    // --- 🚀 CORREÇÃO LID (2/2) ---
    // Obtemos o contato e o número de telefone AQUI (na função async)
    let contact;
    try {
        contact = const variavel = contact.number;;
    } catch (e) {
        console.error(`[enviarColetaTtcPdv] Falha crítica ao obter contato: ${message.from}`, e);
        await client.sendMessage(message.from, '❌ Ocorreu um erro ao verificar sua identidade. Tente novamente.');
        return;
    }

    const numeroTelefoneLimpo = contact.number; // Ex: "5532..."

    if (!numeroTelefoneLimpo) {
        console.log(`[enviarColetaTtcPdv] Falha ao obter número de telefone do ID: ${message.from}.`);
        await client.sendMessage(message.from, '❌ Ocorreu um erro ao verificar seus dados. Tente novamente.');
        return;
    }
    // --- FIM CORREÇÃO ---


    // 1. OBTENÇÃO DO FILTRO UNB
    // const dadosFiltro = buscarSetorEUNB(message.from); // <-- LINHA ANTIGA
    // Agora passamos o número JÁ LIMPO para a função síncrona
    const dadosFiltro = buscarSetorEUNB(numeroTelefoneLimpo); 

    if (!dadosFiltro) {
        await client.sendMessage(message.from, '❌ Não foi possível identificar seu Setor. Seu telefone não está cadastrado. Por favor, avise o APR.');
        return;
    }

    const UNB_Filtro = dadosFiltro.UNB;
    const setorDoUsuario = dadosFiltro.setor;
    console.log(`✅ Setor do Usuário: ${setorDoUsuario}. UNB de Filtro: ${UNB_Filtro}.`);

    // ----------------------------------------------------------------------

    const arquivo = CAMINHO_ARQUIVO_EXCEL;

    await client.sendMessage(
        message.from,
        `⏳ Buscando dados de coleta para o PDV *${codigoPDV}* (Filtro UNB: ${UNB_Filtro})... um momento.`
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
                let dataMaisRecente = null; 

                aba.eachRow((row, rowNumber) => {
                    if (rowNumber === 1) return;

                    const codPdvPlanilha = getCellValueAsString(row.getCell(2)); // Coluna B
                    const codUnbPlanilha = getCellValueAsString(row.getCell(1)); // Coluna A (Nova Coluna para o filtro)
                    
                    // APLICAÇÃO DO FILTRO COMBINADO: PDV (Coluna B) E UNB (Coluna A)
                    if (codPdvPlanilha === codigoPDV && codUnbPlanilha === UNB_Filtro) {
                        totalSKUs++;

                        // Colunas HEADER (1 a 5)
                        if (!pdvInfo) {
                            pdvInfo = {
                                codUnb: codUnbPlanilha, // Usando a Coluna 1 (A)
                                codPdv: codPdvPlanilha,
                                nomePdv: getCellValueAsString(row.getCell(3)),
                                codSetor: getCellValueAsString(row.getCell(4)),
                                frequencia: getCellValueAsString(row.getCell(5)),
                            };
                        }

                        // Lógica para encontrar a data mais recente (Coluna 11)
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
                        
                        // Colunas de LINHA (6 a 15)
                        const ttcAderido = parseFloat(row.getCell(8).value) || 0;
                        const ttcColetado = parseFloat(row.getCell(9).value) || 0;
                        const situacao = getCellValueAsString(row.getCell(10));
                        const tipoColeta = getCellValueAsString(row.getCell(12)); 
                        const dataVigencia = row.getCell(13).value; 
                        const falsoFoco = getCellValueAsString(row.getCell(14)); 
                        const periodoBonus = getCellValueAsString(row.getCell(15)); 
                        
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
                            `📌 *Situação:* ${emojiSituacao} ${situacao}\n` +
                            `🗓️ *Data Coleta:* ${formatarData(valorDataColeta)}\n` +
                            `🏷️ *Tipo Coleta:* ${tipoColeta}\n` + 
                            `📅 *Data Vigência:* ${formatarData(dataVigencia)}\n` + 
                            `⚠️ *Falso Foco:* ${falsoFoco}\n` + 
                            `💰 *Período Bônus:* ${periodoBonus}` 
                        );
                    }
                });

                if (totalSKUs > 0) {
                    // Lógica para calcular os dias desde a última coleta
                    let diasDesdeUltimaColeta = 'N/A';
                    if (dataMaisRecente) {
                        const hoje = new Date();
                        hoje.setHours(0, 0, 0, 0); 
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
                    
                    const percentualAderido = totalSKUs > 0 ? Math.round((totalAderido / totalSKUs) * 100) : 0;
                    const barra = gerarBarraProgresso(percentualAderido);

                    // Cabeçalho com as informações do PDV
                    const header = `📋 *Relatório de Coleta TTC para o PDV ${pdvInfo.codPdv}*\n\n` +
                        `🏪 *PDV:* ${pdvInfo.nomePdv}\n` +
                        `🏢 *UNB:* ${pdvInfo.codUnb}\n` +
                        `📍 *Setor:* ${pdvInfo.codSetor}\n` +
                        `🔄 *Frequência:* ${pdvInfo.frequencia}\n` +
                        `⏳ *Última Coleta:* ${diasDesdeUltimaColeta}\n`;

                    // Resumo
                    const summary = `\n📊 *Resumo Geral:*\n` +
                        `*Total de SKUs:* ${totalSKUs}\n` +
                        `*SKUs Aderidos:* ${totalAderido}\n` +
                        `*Aderência:* ${percentualAderido}% ${barra}\n`;

                    // Detalhes dos SKUs
                    const body = `\n📦 *Detalhes dos SKUs:*\n\n${skusDetalhes.join('\n\n')}`;

                    const resposta = header + summary + body;
                    await client.sendMessage(message.from, resposta);

                } else {
                    await client.sendMessage(message.from, `⚠️ Nenhum dado de coleta encontrado para o PDV *${codigoPDV}* e UNB *${UNB_Filtro}*. Verifique o código e tente novamente.`);
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