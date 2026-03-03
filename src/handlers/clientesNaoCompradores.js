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

function obterDiaVisitaHoje() {
    const diasDaSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
    const hoje = new Date().getDay(); // 0 é Domingo, 1 é Segunda...
    return diasDaSemana[hoje];
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
    const diaHoje = obterDiaVisitaHoje();

    console.log(`\n==================================================`);
    console.log(`🚀 [NAO COMPRADORES] Setor ${setorDoUsuario} | Ind: ${indicadorDesejado} | Dia: ${diaHoje}`);
    console.log(`==================================================`);

    // Se for fim de semana, já avisa de cara para não gastar processamento
    if (diaHoje === 'SAB' || diaHoje === 'DOM') {
        await client.sendMessage(numero, `🏖️ Bom descanso! Hoje é ${diaHoje} e não há visitas programadas na rota regular.`);
        return;
    }

    await client.sendMessage(numero, `⏳ Gerando lista de não compradores de *HOJE (${diaHoje})* para *${indicadorDesejado}*...\n_Isso pode levar alguns segundos._`);

    try {
        // ==========================================
        // PASSO 1: LER ACOMP PERFORMANCE (Filtrando por HOJE)
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
            const visitaPlanilha = row.getCell('F').text.trim().toUpperCase();

            // 🔥 O SEGREDO ESTÁ AQUI: Só entra se for do setor, zerado E se a visita tiver a sigla de hoje
            if (setorPlanilha === setorDoUsuario && valorIndicador === 0 && visitaPlanilha.includes(diaHoje)) {
                const chave = row.getCell('A').text.trim();
                
                if (chave) {
                    clientesZerados.push({
                        chave: chave,
                        razaoSocial: row.getCell('C').text,
                        visita: visitaPlanilha,
                        historicoMesPassado: [],
                        faturamentoTotal: 0,
                        skusUnicos: new Set(),
                        produtosAgregados: {} // Criado para somar faturamento de cada produto
                    });
                    chavesParaBuscar.add(chave);
                }
            }
        });

        console.log(`✅ Encontrados ${clientesZerados.length} clientes zerados COM VISITA HOJE no setor ${setorDoUsuario}.`);

        if (clientesZerados.length === 0) {
            await client.sendMessage(numero, `🎉 *Sensacional!* Nenhum cliente da sua rota de *HOJE (${diaHoje})* está zerado em ${indicadorDesejado}.`);
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
                            const nomeProduto = linha['Desc.Produto'] || 'Produto Desconhecido';

                            cliente.historicoMesPassado.push({
                                produto: nomeProduto,
                                totalVenda: valor
                            });
                            
                            cliente.faturamentoTotal += valor;
                            cliente.skusUnicos.add(codProduto); 
                            
                            // Acumula o valor por produto para conseguirmos fazer a %
                            if (!cliente.produtosAgregados[nomeProduto]) {
                                cliente.produtosAgregados[nomeProduto] = 0;
                            }
                            cliente.produtosAgregados[nomeProduto] += valor;
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
        
        // Ordena por maior faturamento do cliente
        clientesZerados.sort((a, b) => b.faturamentoTotal - a.faturamentoTotal);

        // Conta quantos têm venda zero no mês passado
        const pdvsZeroAbsoluto = clientesZerados.filter(c => c.historicoMesPassado.length === 0).length;

        let msg = `📉 *NÃO COMPRADORES HOJE | ${indicadorDesejado}*\n`;
        msg += `📍 Setor: ${setorDoUsuario}  |  🗓️ Ref: ${mesReferencia}\n`;
        msg += `🛑 *Total de não compradores na rota hoje (${diaHoje}): ${clientesZerados.length}*\n`;
        
        // AVISO DINÂMICO DE VENDAS ZERO MANTIDO
        if (pdvsZeroAbsoluto > 0) {
            msg += `\n🚨 *AVISO:* ${pdvsZeroAbsoluto} PDVs da sua rota de hoje ainda não compraram este mês e também são *venda zero* no mês passado!\n`;
        }
        
        msg += `-------------------------------------------\n\n`;

        clientesZerados.forEach((c, index) => {
            msg += `🏪 ${index + 1}. ${c.razaoSocial}\n`;
            msg += `🗝️ Chave: ${c.chave}  |  📅 Visita: ${c.visita}\n\n`;
            
            if (c.historicoMesPassado.length === 0) {
                msg += `⚠️ _Sem histórico de faturamento em ${mesReferencia}._\n`;
            } else {
                msg += `📊 *Resumo do Mês Passado:*\n`;
                msg += `📦 SKUs Distintos: ${c.skusUnicos.size}\n`;
                msg += `💵 Faturado: ${formatarMoeda(c.faturamentoTotal)}\n\n`;
                
                msg += `🛒 *Principais Itens Levados:*\n`;
                
                // Transforma o objeto agregado em array, ordena por valor, recorta os 3 primeiros e calcula a %
                const top3Produtos = Object.entries(c.produtosAgregados)
                    .sort((a, b) => b[1] - a[1]) // Ordena pelo faturamento de cada item (maior pro menor)
                    .slice(0, 3) // Pega os 3 maiores
                    .map(item => {
                        const nomeItem = item[0];
                        const valorItem = item[1];
                        // Calcula a porcentagem do peso do item em relação ao faturamento total do cliente
                        const percentual = c.faturamentoTotal > 0 ? ((valorItem / c.faturamentoTotal) * 100).toFixed(1) : 0;
                        return `▫️ ${nomeItem}\n   └ ${formatarMoeda(valorItem)} (${percentual}%)`;
                    })
                    .join('\n');
                
                msg += `${top3Produtos}\n`;
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