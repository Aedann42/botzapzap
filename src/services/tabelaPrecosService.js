const ExcelJS = require('exceljs');
const fs = require('fs');

const CAMINHO_TABELA = '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2026\\ 1 - janeiro\\_GERADOR PDF\\TABELA DE PREÇOS - 2025.xlsx';

module.exports = {
    buscarDadosTabela: async () => {
        console.log(`[SERVICE] 🔍 Acessando: ${CAMINHO_TABELA}`);
        try {
            if (!fs.existsSync(CAMINHO_TABELA)) {
                console.error("[SERVICE] ❌ Arquivo .xlsx não encontrado.");
                return null;
            }
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(CAMINHO_TABELA);
            const aba = workbook.worksheets[0];
            const produtos = [];

            aba.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; // Pula cabeçalho
                // Col 4 = Cod | Col 5 = Produto | Col 6 = TTV
                const item = {
                    codigo: String(row.getCell(4).value || '').trim(),
                    produto: String(row.getCell(5).value || '').trim(),
                    valor: row.getCell(6).value || 0
                };
                if (item.codigo && item.produto) produtos.push(item);
            });
            console.log(`[SERVICE] ✅ ${produtos.length} produtos carregados.`);
            return produtos;
        } catch (error) {
            console.error("[SERVICE] 🛑 Erro ExcelJS:", error.message);
            return null;
        }
    }
};