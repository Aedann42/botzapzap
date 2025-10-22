// enviarResumoPDV.js
const ExcelJS = require('exceljs');
const path = require('path');

// Importa o seu módulo de manipulação de dados
const dataHandler = require('../utils/dataHandler'); // Caminho relativo

// --- Constantes de Configuração ---
const UNB_SETOR_4 = '1046853';
const UNB_OUTROS_SETOR = '296708';
const CAMINHO_ARQUIVO_EXCEL = path.join(
    '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2025\\10 - OUTUBRO\\_GERADOR PDF\\',
    'Acomp Tarefas do Dia.xlsx'
);

// --- Funções Auxiliares ---
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

/**
 * Tenta encontrar o setor do usuário no REPRESENTANTES.JSON e, se falhar, em STAFFS.JSON.
 * (Lógica de busca combinada, inalterada)
 */
function buscarSetorEUNB(telefoneDoUsuario) {
    
    const telLimpoUsuario = telefoneDoUsuario.replace('@c.us', '').replace(/\D/g, ''); 
    console.log(`[DEBUG] Telefone do Usuário (message.from limpo): ${telLimpoUsuario}`);

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
    
    // 3. RETORNA RESULTADO
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
    console.log('🔍 Código NB recebido do usuário:', codigoPDV);

    const dadosFiltro = buscarSetorEUNB(message.from);

    if (!dadosFiltro) {
        await client.sendMessage(message.from, '❌ Não foi possível identificar seu Setor. Seu telefone não está cadastrado. Por favor, avise o APR.');
        return;
    }

    const UNB_Filtro = dadosFiltro.UNB;
    const setorDoUsuario = dadosFiltro.setor;
    console.log(`✅ Setor do Usuário: ${setorDoUsuario}. UNB de Filtro: ${UNB_Filtro}.`);
    
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