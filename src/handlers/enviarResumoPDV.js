// enviarResumoPDV.js (PADRONIZADO)
const ExcelJS = require('exceljs');
const path = require('path');

// REMOVIDO: O 'dataHandler' não é mais necessário aqui.
// const dataHandler = require('../utils/dataHandler'); 

// --- Constantes de Configuração ---
const UNB_SETOR_4 = '1046853';
const UNB_OUTROS_SETOR = '296708';
const CAMINHO_ARQUIVO_EXCEL = path.join(
    '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2025\\11 - NOVEMBRO\\_GERADOR PDF\\',
    'Acomp Tarefas do Dia.xlsx'
);

// --- Funções Auxiliares (Inalteradas) ---
function excelSerialToDate(serial) {
    const excelEpoch = new Date(1899, 11, 30);
    return new Date(excelEpoch.getTime() + serial * 86400000).toLocaleDateString('pt-BR');
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
// --- Fim das Funções Auxiliares ---

// --- REMOVIDA ---
// A função buscarSetorEUNB(telefoneDoUsuario) foi removida.
// --- FIM ---

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
// ✅ ALTERADO: Agora recebe 'representante' como parâmetro
module.exports = async (client, message, representante) => {
    
    const codigoPDV = message.body.replace(/\D/g, ''); 
    console.log('🔍 Código NB recebido do usuário:', codigoPDV);

    // --- 🚀 LÓGICA DE FILTRO ATUALIZADA ---
    // A função 'buscarSetorEUNB' foi removida.
    // A lógica agora usa o objeto 'representante' injetado.

    if (!representante || !representante.setor) {
        console.error(`[ResumoPDV] Erro: Objeto 'representante' (ou seu setor) está faltando para ${message.from}.`);
        await client.sendMessage(message.from, '❌ Não foi possível identificar seu Setor. Seu telefone não está cadastrado. Por favor, avise o APR.');
        return;
    }

    const setorDoUsuario = String(representante.setor).trim();
    const primeiroDigitoSetor = setorDoUsuario[0];
    let UNB_Filtro = '';

    if (primeiroDigitoSetor === '4') {
        UNB_Filtro = UNB_SETOR_4; // '1046853'
    } else {
        UNB_Filtro = UNB_OUTROS_SETOR; // '296708'
    }
    
    console.log(`✅ Setor do Usuário: ${setorDoUsuario}. UNB de Filtro: ${UNB_Filtro}.`);
    // --- FIM DA LÓGICA DE FILTRO ---
    
    // --------------------------------------------------------------------------------------------------

    await client.sendMessage(
        message.from,
        `⏳ Buscando tarefas do NB ${codigoPDV} (Filtro UNB: ${UNB_Filtro}), aguarde um momento...`
    );

    const arquivo = CAMINHO_ARQUIVO_EXCEL;

    return new Promise(async (resolve, reject) => {
        const requestHandler = async () => {
            try {
                // Leitura direta do arquivo (Modelo de Rollback)
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.readFile(arquivo);
                console.log('✅ Planilha carregada com sucesso.');

                const aba = workbook.getWorksheet('BI - BEES Force Tasks');
                if (!aba) {
                    console.error('❌ Aba "BI - BEES Force Tasks" não encontrada.');
                    await client.sendMessage(message.from, '❌ Não foi possível encontrar a aba de tarefas. Avise o APR.');
                    resolve();
                    return;
                }

                let linhas = [];
                let correspondencias = 0;
                let totalCompletas = 0;
                let totalValidadas = 0;
                let revenda = '';
                let nomefantasia = ''; // Captura o Nome Fantasia

                aba.eachRow((row, rowNumber) => {
                    if (rowNumber === 1) return; // Pula o cabeçalho
                    
                    const nbPlanilha = String(row.getCell(5).value).trim();  // Coluna 5 (E) - NB
                    const unbPlanilha = String(row.getCell(4).value).trim(); // Coluna 4 (D) - UNB

                    const codigo = String(codigoPDV).trim();

                    // Aplica o filtro combinado
                    if (
                        parseInt(nbPlanilha, 10) === parseInt(codigo, 10) &&
                        unbPlanilha === UNB_Filtro
                    ) {
                        correspondencias++;

                        // Captura revenda e nomefantasia APENAS na primeira linha de correspondência
                        if (!revenda) {
                            revenda = getCellValueAsString(row.getCell(4)); // Coluna 4 (D)
                        }
                        if (!nomefantasia) {
                            nomefantasia = getCellValueAsString(row.getCell(6)); // Coluna 6 (F) - Nome Fantasia
                        }

                        // Extração de dados da tarefa
                        const dataCriacaoValor = row.getCell(1).value;
                        let dataCriacao = 'Data inválida';
                        if (typeof dataCriacaoValor === 'object' && dataCriacaoValor instanceof Date) {
                            dataCriacao = dataCriacaoValor.toLocaleDateString('pt-BR');
                        } else if (typeof dataCriacaoValor === 'number') {
                            dataCriacao = excelSerialToDate(dataCriacaoValor);
                        }

                        const tarefa = getCellValueAsString(row.getCell(17)) || '-'; 
                        const completa = row.getCell(18).value === 1 ? '✅ Sim' : '❌ Não'; 
                        const validada = row.getCell(19).value === 1 ? '✅ Sim' : '❌ Não'; 
                        const categoria = getCellValueAsString(row.getCell(13)) || '-'; 

                        if (row.getCell(18).value === 1) totalCompletas++; 
                        if (row.getCell(19).value === 1) totalValidadas++; 

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
                
                const nomeFantasiaFormatado = nomefantasia || 'Não informado'; 

                const resposta = correspondencias > 0
                    ? `📊 *Resumo das Tarefas para o NB ${codigoPDV} (UNB: ${UNB_Filtro}):*\n` +
                      `🏬 *Código da revenda:* ${revenda}\n` +
                      `🏷️ *Nome Fantasia:* ${nomeFantasiaFormatado}\n` +
                      `Em caso de divergencia no cod da revenda averiguar com o APR, pode ser que a revenda seja outra \n`+
                      `• Total de tarefas: ${correspondencias}\n` +
                      `• Completas: ${totalCompletas}\n` +
                      `• Validadas: ${totalValidadas}\n` +
                      `• Validação: ${percentualValidadas}% ${barra}\n\n` +
                      `📋 *Detalhes das tarefas:*\n\n${linhas.join('\n\n')}`
                    : `⚠️ Nenhuma tarefa encontrada para o NB ${codigoPDV} com o filtro UNB ${UNB_Filtro}. Verifique se o código está correto.`;

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