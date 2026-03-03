// src/handlers/clientesNaoCompradores.js

const ExcelJS = require('exceljs');
const csv = require('csv-parser');
const path = require('path');
const fs = require('fs');

// --- CONFIGURAÇÃO DE CAMINHOS ---
const PASTA_PERFORMANCE = '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2026\\3 - MARÇO\\_GERADOR PDF';
const ARQUIVO_PERFORMANCE = path.join(PASTA_PERFORMANCE, 'Acomp Performance.xlsx');

// CAMINHO LOCAL PARA OS ARQUIVOS CSV
const PASTA_BANCO_DADOS = 'C:\\botzapzap\\botzapzap\\data\\hist';

// --- MAPEAMENTO NUMERADO DO MENU ---
const MAPA_OPCOES = {
    '1': 'AMBEV',
    '2': 'MKTP',
    '3': 'CERV',
    '4': 'MATCH',
    '5': 'CERV RGB',
    '6': 'CERV 1/1',
    '7': 'CERV 300',
    '8': 'MEGABRANDS',
    '9': 'NAB',
    '10': 'RED BULL',
    '11': 'R$ MKTP'
};

// --- MAPEAMENTO DE COLUNAS DE PRODUTIVIDADE (Planilha Acomp Performance) ---
const COLUNAS_PRODUTIVIDADE = {
    'AMBEV': 'L',
    'MKTP': 'M',
    'CERV': 'N',
    'MATCH': 'O',
    'CERV RGB': 'P',
    'CERV 1/1': 'Q',
    'CERV 300': 'R',
    'MEGABRANDS': 'S',
    'NAB': 'T',
    'RED BULL': 'U',
    'R$ MKTP': 'V'
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
    
    // Se estivermos em Janeiro (0), o mês passado é Dezembro (11)
    if (mesPassado < 0) mesPassado = 11; 
    
    return meses[mesPassado];
}

// --- FUNÇÃO PRINCIPAL ---
module.exports = async (client, message, representante) => {
    const numero = message.from;
    const opcaoDigitada = message.body.trim();
    
    // Converte o número digitado para o nome do indicador (ex: "1" -> "AMBEV")
    const indicadorDesejado = MAPA_OPCOES[opcaoDigitada];

    if (!indicadorDesejado) {
        await client.sendMessage(numero, `⚠️ Opção inválida. Por favor, digite apenas um número de 1 a 11 correspondente ao menu anterior.`);
        return;
    }

    if (!representante || !representante.setor) {
        await client.sendMessage(numero, '❌ Cadastro não identificado. Fale com o suporte.');
        return;
    }

    const setorDoUsuario = String(representante.setor).trim();
    const colunaAlvo = COLUNAS_PRODUTIVIDADE[indicadorDesejado];
    const mesReferencia = obterAbaMesPassado();
    
    // Ex: C:\botzapzap\botzapzap\data\hist\2026_FEV.csv
    const arquivoHistoricoCsv = path.join(PASTA_BANCO_DADOS, `2026_${mesReferencia}.csv`);

    await client.sendMessage(numero, `⏳ Buscando clientes que *zeraram* em *${indicadorDesejado}* no Setor *${setorDoUsuario}*...\n_Analisando arquivos..._`);

    try {
        // ==========================================
        // PASSO 1: LER ACOMP PERFORMANCE (Achar os zerados)
        // ==========================================
        if (!fs.existsSync(ARQUIVO_PERFORMANCE)) throw new Error("Arquivo Performance não encontrado");
        
        const workbookPerf = new ExcelJS.Workbook();
        await workbookPerf.xlsx.readFile(ARQUIVO_PERFORMANCE);
        const abaBase = workbookPerf.getWorksheet('Base') || workbookPerf.worksheets[0];

        let clientesZerados = [];
        let chavesParaBuscar = new Set(); 

        abaBase.eachRow((row, rowNumber) => {
            if (rowNumber < 4) return; // Ignora cabeçalhos

            const setorPlanilha = row.getCell('E').text.trim();
            const valorIndicador = parseFloat(row.getCell(colunaAlvo).value) || 0;

            if (setorPlanilha === setorDoUsuario && valorIndicador === 0) {
                const chave = row.getCell('A').text.trim();
                
                if (chave) {
                    clientesZerados.push({
                        chave: chave,
                        razaoSocial: row.getCell('C').text,
                        visita: row.getCell('F').text, // Dia da visita
                        historicoMesPassado: [] 
                    });
                    chavesParaBuscar.add(chave);
                }
            }
        });

        if (clientesZerados.length === 0) {
            await client.sendMessage(numero, `🎉 *Parabéns!* Nenhum cliente do setor ${setorDoUsuario} está zerado em ${indicadorDesejado}.`);
            return;
        }

        await client.sendMessage(numero, `🔎 Encontrados *${clientesZerados.length}* clientes zerados.\nCruzando com o histórico de ${mesReferencia}...`);

        // ==========================================
        // PASSO 2: LER HISTÓRICO (Lendo o CSV Local em Stream)
        // ==========================================
        if (!fs.existsSync(arquivoHistoricoCsv)) {
            await client.sendMessage(numero, `⚠️ O arquivo de histórico (*2026_${mesReferencia}.csv*) não foi encontrado na pasta do sistema.\nAvise o administrador.`);
            return;
        }

        await new Promise((resolve, reject) => {
            fs.createReadStream(arquivoHistoricoCsv)
                .pipe(csv({ separator: ';' })) 
                .on('data', (linha) => {
                    const chaveLinha = String(linha['Chave']).trim();
                    
                    if (chavesParaBuscar.has(chaveLinha)) {
                        const cliente = clientesZerados.find(c => c.chave === chaveLinha);
                        if (cliente) {
                            cliente.historicoMesPassado.push({
                                produto: linha['Desc.Produto'] || 'Produto Desconhecido',
                                qtdUnit: parseFloat(linha['Qt Unit'] || 0),
                                totalVenda: parseFloat(linha['Total Venda'] || 0)
                            });
                        }
                    }
                })
                .on('end', () => resolve())
                .on('error', (erro) => reject(erro));
        });

        // ==========================================
        // PASSO 3: MONTAR E ENVIAR MENSAGEM
        // ==========================================
        let msg = `📉 *CLIENTES NÃO COMPRADORES - ${indicadorDesejado}*\n`;
        msg += `📍 *Setor:* ${setorDoUsuario} | 🗓️ *Ref Histórico:* ${mesReferencia}\n`;
        msg += `🛑 *Total de Inadimplentes na linha:* ${clientesZerados.length}\n`;
        msg += `----------------------------------\n\n`;

        const limiteExibicao = 15; 
        const clientesMostrar = clientesZerados.slice(0, limiteExibicao);

        clientesMostrar.forEach((c, index) => {
            msg += `*${index + 1}. ${c.razaoSocial}*\n`;
            msg += `🔑 Chave: ${c.chave} | 📅 Visita: ${c.visita}\n`;
            
            if (c.historicoMesPassado.length === 0) {
                msg += `👻 _Sem histórico de compras no mês passado._\n`;
            } else {
                let volumeTotalHist = 0;
                let valorTotalHist = 0;
                
                c.historicoMesPassado.forEach(h => {
                    volumeTotalHist += h.qtdUnit;
                    valorTotalHist += h.totalVenda;
                });

                msg += `📦 *Mês Passado:* Levou ${volumeTotalHist} un. (${formatarMoeda(valorTotalHist)})\n`;
                
                const exemplos = c.historicoMesPassado.slice(0, 2).map(h => `- ${h.produto}`).join('\n');
                msg += `🛒 *Principais itens levados:*\n${exemplos}\n`;
            }
            msg += `..................................\n`;
        });

        if (clientesZerados.length > limiteExibicao) {
            msg += `\n⚠️ _Foram omitidos ${clientesZerados.length - limiteExibicao} clientes para a mensagem não ficar longa demais._`;
        }

        await client.sendMessage(numero, msg);

    } catch (error) {
        console.error('[ClientesNaoCompradores] Erro:', error);
        await client.sendMessage(numero, '❌ Erro ao cruzar planilhas. Verifique os arquivos CSV e XLSX nos caminhos configurados.');
    }
};