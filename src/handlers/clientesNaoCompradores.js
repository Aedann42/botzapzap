// src/handlers/clientesNaoCompradores.js

const ExcelJS = require('exceljs');
const csv = require('csv-parser');
const path = require('path');
const fs = require('fs');

// --- CONFIGURAÇÃO DE CAMINHOS ---
const PASTA_PERFORMANCE = '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2026\\3 - MARÇO\\_GERADOR PDF';
const ARQUIVO_PERFORMANCE = path.join(PASTA_PERFORMANCE, 'Acomp Performance.xlsx');
const PASTA_BANCO_DADOS = 'C:\\botzapzap\\botzapzap\\data\\hist';

// --- MAPEAMENTO NUMERADO DO MENU ---
const MAPA_OPCOES = {
    '1': 'AMBEV', '2': 'MKTP', '3': 'CERV', '4': 'MATCH', 
    '5': 'CERV RGB', '6': 'CERV 1/1', '7': 'CERV 300', 
    '8': 'MEGABRANDS', '9': 'NAB', '10': 'RED BULL', '11': 'R$ MKTP'
};

const COLUNAS_PRODUTIVIDADE = {
    'AMBEV': 'L', 'MKTP': 'M', 'CERV': 'N', 'MATCH': 'O', 
    'CERV RGB': 'P', 'CERV 1/1': 'Q', 'CERV 300': 'R', 
    'MEGABRANDS': 'S', 'NAB': 'T', 'RED BULL': 'U', 'R$ MKTP': 'V'
};

// --- FUNÇÕES AUXILIARES ---
function formatarMoeda(valor) {
    if (typeof valor !== 'number' || isNaN(valor)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function obterAbaMesPassado() {
    const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    const dataAtual = new Date();
    let mesPassado = dataAtual.getMonth() - 1;
    if (mesPassado < 0) mesPassado = 11; 
    return meses[mesPassado];
}

// --- FUNÇÃO PRINCIPAL ---
module.exports = async (client, message, representante) => {
    const numero = message.from;
    const opcaoDigitada = message.body.trim();
    const indicadorDesejado = MAPA_OPCOES[opcaoDigitada];

    if (!indicadorDesejado) {
        await client.sendMessage(numero, `⚠️ Opção inválida. Digite de 1 a 11.`);
        return;
    }

    if (!representante || !representante.setor) {
        await client.sendMessage(numero, '❌ Cadastro não identificado. Fale com o suporte.');
        return;
    }

    const setorDoUsuario = String(representante.setor).trim();
    const colunaAlvo = COLUNAS_PRODUTIVIDADE[indicadorDesejado];
    const mesReferencia = obterAbaMesPassado();
    const arquivoHistoricoCsv = path.join(PASTA_BANCO_DADOS, `2026_${mesReferencia}.csv`);

    console.log(`\n==================================================`);
    console.log(`🚀 [NAO COMPRADORES] Iniciando busca para Setor ${setorDoUsuario} | Indicador: ${indicadorDesejado}`);
    console.log(`==================================================`);

    await client.sendMessage(numero, `⏳ Gerando lista de não compradores para *${indicadorDesejado}*...\n_Isso pode levar alguns segundos._`);

    try {
        // ==========================================
        // PASSO 1: LER ACOMP PERFORMANCE
        // ==========================================
        if (!fs.existsSync(ARQUIVO_PERFORMANCE)) throw new Error("Arquivo Performance não encontrado");
        
        console.log(`[1/3] Lendo arquivo de Performance...`);
        const workbookPerf = new ExcelJS.Workbook();
        await workbookPerf.xlsx.readFile(ARQUIVO_PERFORMANCE);
        const abaBase = workbookPerf.getWorksheet('Base') || workbookPerf.worksheets[0];

        let clientesZerados = [];
        let chavesParaBuscar = new Set(); 

        abaBase.eachRow((row, rowNumber) => {
            if (rowNumber < 4) return; 

            const setorPlanilha = row.getCell('E').text.trim();
            const valorIndicador = parseFloat(row.getCell(colunaAlvo).value) || 0;

            if (setorPlanilha === setorDoUsuario && valorIndicador === 0) {
                const chave = row.getCell('A').text.trim();
                
                if (chave) {
                    clientesZerados.push({
                        chave: chave,
                        razaoSocial: row.getCell('C').text,
                        visita: row.getCell('F').text,
                        historicoMesPassado: [],
                        faturamentoTotal: 0,
                        skusUnicos: new Set() // Set para não duplicar os códigos dos produtos
                    });
                    chavesParaBuscar.add(chave);
                }
            }
        });

        console.log(`✅ Encontrados ${clientesZerados.length} clientes zerados no setor ${setorDoUsuario}.`);

        if (clientesZerados.length === 0) {
            await client.sendMessage(numero, `🎉 *Parabéns!* Nenhum cliente do setor ${setorDoUsuario} está zerado em ${indicadorDesejado}.`);
            return;
        }

        // ==========================================
        // PASSO 2: LER HISTÓRICO CSV
        // ==========================================
        if (!fs.existsSync(arquivoHistoricoCsv)) {
            console.error(`❌ ERRO: Arquivo CSV não encontrado em: ${arquivoHistoricoCsv}`);
            await client.sendMessage(numero, `⚠️ O arquivo de histórico (*2026_${mesReferencia}.csv*) não foi encontrado na pasta do sistema.\nAvise o administrador.`);
            return;
        }

        console.log(`[2/3] Lendo histórico CSV (${mesReferencia})...`);

        await new Promise((resolve, reject) => {
            fs.createReadStream(arquivoHistoricoCsv)
                .pipe(csv({ 
                    separator: ';',
                    mapHeaders: ({ header }) => header.trim().replace(/^[\u200B\u200C\u200D\u200E\u200F\uFEFF]/,"") 
                })) 
                .on('data', (linha) => {
                    const chaveLinha = String(linha['Chave'] || '').trim();
                    
                    if (chaveLinha && chavesParaBuscar.has(chaveLinha)) {
                        const cliente = clientesZerados.find(c => c.chave === chaveLinha);
                        if (cliente) {
                            const strValor = String(linha['Total Venda'] || '0').replace(',', '.');
                            const valor = parseFloat(strValor) || 0;

                            const codProduto = linha['Cod.Produto'] || linha['Desc.Produto'] || 'Sem Código';

                            cliente.historicoMesPassado.push({
                                produto: linha['Desc.Produto'] || 'Produto Desconhecido',
                                totalVenda: valor
                            });
                            
                            cliente.faturamentoTotal += valor;
                            cliente.skusUnicos.add(codProduto); // Adiciona o SKU único na coleção
                        }
                    }
                })
                .on('end', () => resolve())
                .on('error', (erro) => reject(erro));
        });

        console.log(`✅ Leitura CSV concluída e cruzamento feito.\n`);

        // ==========================================
        // PASSO 3: ORDENAR E MONTAR MENSAGEM
        // ==========================================
        console.log(`[3/3] Montando mensagem visual...`);
        
        // Ordena por maior faturamento
        clientesZerados.sort((a, b) => b.faturamentoTotal - a.faturamentoTotal);

        // Conta quantos tem venda zero no mês passado
        const pdvsZeroAbsoluto = clientesZerados.filter(c => c.historicoMesPassado.length === 0).length;

        let msg = `📉 *NÃO COMPRADORES | ${indicadorDesejado}*\n`;
        msg += `📍 Setor: ${setorDoUsuario}  |  🗓️ Ref: ${mesReferencia}\n`;
        msg += `🛑 *Total de não compradores na rota: ${clientesZerados.length}*\n`;
        
        // AVISO DINÂMICO DE VENDAS ZERO
        if (pdvsZeroAbsoluto > 0) {
            msg += `\n🚨 *AVISO:* ${pdvsZeroAbsoluto} PDVs ainda não compraram este mês e são *venda zero* no mês passado!\n`;
        }
        
        msg += `-------------------------------------------\n\n`;

        clientesZerados.forEach((c, index) => {
            msg += `🏪 *${index + 1}. ${c.razaoSocial}*\n`;
            msg += `🗝️ Chave: ${c.chave}  |  📅 Visita: ${c.visita}\n\n`;
            
            if (c.historicoMesPassado.length === 0) {
                msg += `⚠️ _Sem histórico de faturamento em ${mesReferencia}._\n`;
            } else {
                msg += `📊 *Resumo do Mês Passado:*\n`;
                msg += `📦 SKUs Distintos: ${c.skusUnicos.size}\n`;
                msg += `💵 Faturado: ${formatarMoeda(c.faturamentoTotal)}\n\n`;
                
                msg += `🛒 *Principais Itens Levados:*\n`;
                
                // Exibe até os 3 principais produtos (removendo as duplicatas da visualização)
                const itensVisualizacao = [...new Set(c.historicoMesPassado.map(h => h.produto))];
                const exemplos = itensVisualizacao.slice(0, 3).map(p => `▫️ ${p}`).join('\n');
                
                msg += `${exemplos}\n`;
            }
            msg += `\n➖ ➖ ➖ ➖ ➖ ➖ ➖ ➖ ➖ ➖\n\n`;
        });

        await client.sendMessage(numero, msg);
        console.log(`✅ Mensagem final enviada para ${numero}!`);

    } catch (error) {
        console.error('❌ [ClientesNaoCompradores] Erro Crítico:', error);
        await client.sendMessage(numero, '❌ Ocorreu um erro interno ao processar os arquivos. Avise o suporte.');
    }
};