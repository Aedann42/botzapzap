// enviarResumoPDV.js
const ExcelJS = require('exceljs');
const path = require('path');

// Caminho atualizado para DEZEMBRO conforme sua solicitação
const CAMINHO_ARQUIVO_EXCEL = path.join(
    '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2026\\2 - FEVEREIRO\\_GERADOR PDF\\',
    'Acomp Tarefas do Dia.xlsx'
);

// --- Configuração de Filtros UNB ---
const UNB_SETOR_4 = '1046853';
const UNB_OUTROS_SETOR = '296708';

// --- Funções Auxiliares ---
function formatarDataExcel(serial) {
    if (!serial) return '-';
    if (serial instanceof Date) return serial.toLocaleDateString('pt-BR');
    if (typeof serial === 'number') {
        // Conversão de data serial do Excel
        const excelEpoch = new Date(1899, 11, 30);
        return new Date(excelEpoch.getTime() + serial * 86400000).toLocaleDateString('pt-BR');
    }
    return String(serial);
}

function getVal(row, colLetra) {
    const cell = row.getCell(colLetra);
    const val = cell.value;
    if (!val && val !== 0) return '';
    if (typeof val === 'object') {
        if (val.richText) return val.richText.map(t => t.text).join('').trim();
        if (val instanceof Date) return formatarDataExcel(val);
        if (val.result !== undefined) return val.result; // Fórmula
    }
    return String(val).trim();
}

function getValNumber(row, colLetra) {
    const val = row.getCell(colLetra).value;
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
}

function checkStatus(val) {
    // A imagem diz: 0 é não, 1 é sim
    return val == 1 ? '✅ Sim' : '❌ Não';
}

// --- Função Principal ---
async function enviarResumoPDV(client, message, representante) {
    const numero = message.from;
    const texto = message.body.trim();
    
    // 1. Extrai apenas números da mensagem (o código do PDV)
    const codigoPdv = texto.replace(/\D/g, '');

    if (!codigoPdv) {
        await client.sendMessage(numero, '⚠️ Por favor, digite o código do PDV (apenas números).');
        return;
    }

    // 2. Validação do Representante e definição do filtro UNB
    if (!representante || !representante.setor) {
        console.error(`[ResumoPDV] Erro: Objeto 'representante' faltando para ${numero}.`);
        await client.sendMessage(numero, '❌ Cadastro não identificado. Avise o APR.');
        return;
    }

    const setor = String(representante.setor).trim();
    const unbFiltro = setor.startsWith('4') ? UNB_SETOR_4 : UNB_OUTROS_SETOR;

    try {
        await client.sendMessage(numero, `🔍 Buscando informações do PDV: *${codigoPdv}* (UNB: ${unbFiltro})... Aguarde.`);

        // 3. Carregar Planilha
        const workbook = new ExcelJS.Workbook();
        // Usa o caminho especificado
        await workbook.xlsx.readFile(CAMINHO_ARQUIVO_EXCEL); 
        
        // Pega a primeira aba (assumindo que é a correta, ou especifique o nome se souber)
        const worksheet = workbook.worksheets[0]; 
        
        if (!worksheet) {
            await client.sendMessage(numero, '❌ Planilha de dados não encontrada ou vazia.');
            return;
        }

        // 4. Variáveis de Agregação
        let headerInfo = null; // Para guardar os dados do Título
        let tarefas = [];      // Para guardar os dados do Corpo
        
        // Contadores
        let totalTarefas = 0;
        let qtdCompletas = 0;
        let qtdValidadas = 0;
        let qtdPreValidadas = 0;
        let pontuacaoTotal = 0;

        // 5. Iterar sobre as linhas
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Pula cabeçalho

            // Coluna E = PDV, Coluna D = UNB
            const pdvPlanilha = getVal(row, 'E');
            const unbPlanilha = getVal(row, 'D');

            // Verifica filtro combinado
            if (pdvPlanilha === codigoPdv && unbPlanilha === unbFiltro) {
                totalTarefas++;

                // Captura dados do cabeçalho (apenas da primeira linha encontrada)
                if (!headerInfo) {
                    headerInfo = {
                        unb: unbPlanilha,           // D
                        pdv: pdvPlanilha,           // E
                        nomeFantasia: getVal(row, 'F'), // F
                        gv: getVal(row, 'G'),       // G
                        setor: getVal(row, 'H')     // H
                    };
                }

                // Dados Numéricos para contagem
                const isCompleta = getValNumber(row, 'R');
                const isValidada = getValNumber(row, 'S');
                const isPreValidada = getValNumber(row, 'T');
                const pontos = getValNumber(row, 'U');

                if (isCompleta === 1) qtdCompletas++;
                if (isValidada === 1) qtdValidadas++;
                if (isPreValidada === 1) qtdPreValidadas++;
                pontuacaoTotal += pontos;

                // Monta o objeto da tarefa (Corpo)
                tarefas.push({
                    dataCriacao: formatarDataExcel(row.getCell('A').value),
                    dataVisita: formatarDataExcel(row.getCell('B').value),
                    dataConclusao: formatarDataExcel(row.getCell('C').value),
                    clusterPrim: getVal(row, 'I'),
                    clusterSec: getVal(row, 'J'),
                    mensalDiaria: getVal(row, 'K'),
                    idTask: getVal(row, 'L'),
                    categoria: getVal(row, 'M'),
                    effectiveness: getVal(row, 'N'),
                    qtdSol: getVal(row, 'O'),
                    qtdComp: getVal(row, 'P'),
                    textoTarefa: getVal(row, 'Q'), // Importante
                    completaStr: checkStatus(isCompleta),
                    validadaStr: checkStatus(isValidada),
                    preValidadaStr: checkStatus(isPreValidada),
                    pontos: pontos,
                    justificativa: getVal(row, 'V'),
                    coluna1: getVal(row, 'W')
                });
            }
        });

        // 6. Montar Mensagem Final
        if (totalTarefas === 0) {
            await client.sendMessage(numero, `⚠️ Nenhuma tarefa encontrada para o PDV *${codigoPdv}* na UNB *${unbFiltro}*.\nVerifique se o código está correto.`);
            return;
        }

        // Bloco Título
        let msg = `📊 *RESUMO DO PDV ${headerInfo.pdv}*\n`;
        msg += `🏢 *Fantasia:* ${headerInfo.nomeFantasia}\n`;
        msg += `👤 *GV:* ${headerInfo.gv} | *Setor:* ${headerInfo.setor}\n`;
        msg += `🆔 *UNB:* ${headerInfo.unb}\n\n`;
        
        msg += `📈 *DESEMPENHO GERAL:*\n`;
        msg += `• Total Tarefas: ${totalTarefas}\n`;
        msg += `• Completas: ${qtdCompletas}\n`;
        msg += `• Validadas: ${qtdValidadas}\n`;
        msg += `• Pré-Validadas: ${qtdPreValidadas}\n`;
        msg += `🏆 *Pontuação Total:* ${pontuacaoTotal}\n`;
        msg += `----------------------------------\n`;

        // Bloco Corpo (Lista de Tarefas)
        msg += `📝 *DETALHAMENTO DAS TAREFAS:*\n`;

        tarefas.forEach((t, i) => {
            msg += `\n*#${i + 1} - ${t.categoria}* (${t.mensalDiaria})\n`;
            msg += `💬 *Tarefa:* ${t.textoTarefa}\n`;
            msg += `📅 Criado: ${t.dataCriacao} | Visita: ${t.dataVisita}\n`;
            if(t.dataConclusao !== '-') msg += `🏁 Conclusão: ${t.dataConclusao}\n`;
            
            msg += `📋 Status: \n Completa:${t.completaStr} | Validada:${t.validadaStr} | Pré validada:${t.preValidadaStr}\n`;
            
            if (t.justificativa) msg += `⚠️ Justificativa: ${t.justificativa}\n`;
            if (t.pontos > 0) msg += `⭐ Pontos: ${t.pontos}\n`;
            
            // Exibindo colunas extras se tiverem dados relevantes
            if (t.qtdSol && t.qtdSol != '0') msg += `📦 Qtd Sol: ${t.qtdSol} | Comp: ${t.qtdComp}\n`;
            
            msg += `_ID: ${t.idTask}_\n`; 
            msg += `..................................\n`;
        });

        await client.sendMessage(numero, msg);

    } catch (error) {
        console.error('[PDV] Erro:', error);
        await client.sendMessage(numero, '❌ Erro ao consultar planilha de PDV. Tente novamente mais tarde.');
    }
}

module.exports = enviarResumoPDV;