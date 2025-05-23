const ExcelJS = require('exceljs');
const path = require('path');

function excelSerialToDate(serial) {
  const excelEpoch = new Date(1899, 11, 30);
  return new Date(excelEpoch.getTime() + serial * 86400000).toLocaleDateString('pt-BR');
}

function normalize(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .toUpperCase()
    .trim();
}

function getCellValueAsString(cell) {
  if (!cell || !cell.value) return '';
  if (typeof cell.value === 'object' && cell.value.richText) {
    return cell.value.richText.map(rt => rt.text).join('').trim();
  }
  return String(cell.value).trim();
}

function gerarBarraProgresso(percentual) {
  const totalBlocos = 10;
  const blocosPreenchidos = Math.round((percentual / 100) * totalBlocos);
  return '▰'.repeat(blocosPreenchidos) + '▱'.repeat(totalBlocos - blocosPreenchidos);
}

module.exports = async (client, message) => {
  const codigoPDV = normalize(message.body);
  console.log('🔍 Código PDV recebido do usuário:', codigoPDV);

  const arquivo = path.join(
    '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2025\\5 - MAIO',
    'Acomp Tarefas do Dia.xlsx'
  );
  console.log('📄 Caminho do arquivo:', arquivo);

  try {
    await client.sendMessage(
      message.from,
      `⏳ Favor aguardar, verificando em sistema as tarefas para o PDV ${codigoPDV}.\nIsso pode levar alguns minutos...`
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(arquivo);
    console.log('✅ Planilha carregada com sucesso.');

    const aba = workbook.getWorksheet('BI - BEES Force Tasks');
    if (!aba) {
      console.error('❌ Aba "BI - BEES Force Tasks" não encontrada.');
      await client.sendMessage(message.from, '❌ Aba de tarefas não encontrada. Avise o APR.');
      return;
    }
    console.log('📊 Aba encontrada: BI - BEES Force Tasks');

    let linhas = [];
    let totalLinhas = 0;
    let correspondencias = 0;
    let totalCompletas = 0;
    let totalValidadas = 0;

    aba.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      totalLinhas++;

      const pdvPlanilha = normalize(getCellValueAsString(row.getCell(5))); // Coluna E
      console.log(`[${rowNumber}] PDV planilha: "${pdvPlanilha}" | PDV usuário: "${codigoPDV}"`);

      if (pdvPlanilha === codigoPDV) {
        correspondencias++;

        const dataCriacaoValor = row.getCell(1).value;
        let dataCriacao = 'Data inválida';
        if (typeof dataCriacaoValor === 'object' && dataCriacaoValor instanceof Date) {
          dataCriacao = dataCriacaoValor.toLocaleDateString('pt-BR');
        } else if (typeof dataCriacaoValor === 'number') {
          dataCriacao = excelSerialToDate(dataCriacaoValor);
        }

        const tarefa = getCellValueAsString(row.getCell(18)) || '-';
        const razao = getCellValueAsString(row.getCell(6)) || '-';
        const setor = getCellValueAsString(row.getCell(8)) || '-';
        const completa = row.getCell(19).value === 1 ? '✅ Sim' : '❌ Não';
        const validada = row.getCell(20).value === 1 ? '✅ Sim' : '❌ Não';
        const categoria = getCellValueAsString(row.getCell(25)) || '-';

        if (row.getCell(19).value === 1) totalCompletas++;
        if (row.getCell(20).value === 1) totalValidadas++;

        linhas.push(
          `🗓️ *Data Criação:* ${dataCriacao}\n` +
          `🏬 *Razão Social:* ${razao}\n` +
          `📍 *Setor:* ${setor}\n` +
          `📝 *Tarefa:* ${tarefa}\n` +
          `✅ *Completa:* ${completa}\n` +
          `🔎 *Validada:* ${validada}\n` +
          `🏷️ *Categoria:* ${categoria}`
        );
      }
    });

    console.log(`🔍 Total de linhas verificadas: ${totalLinhas}`);
    console.log(`✅ Total de correspondências com o PDV: ${correspondencias}`);

    const percentualValidadas = correspondencias > 0 ? Math.round((totalValidadas / correspondencias) * 100) : 0;
    const barra = gerarBarraProgresso(percentualValidadas);

const resposta = correspondencias > 0
  ? `📊 *Resumo das Tarefas para o PDV ${codigoPDV}:*\n` +
    `• Total de tarefas: ${correspondencias}\n` +
    `• Completas: ${totalCompletas}\n` +
    `• Validadas: ${totalValidadas}\n` +
    `• Validação: ${percentualValidadas}% ${barra}\n\n` +
    `📋 *Detalhes das tarefas:*\n\n${linhas.join('\n\n')}`
  : `⚠️ Nenhuma tarefa encontrada para o PDV ${codigoPDV}.\n\nVerifique se o código está correto.`;

    await client.sendMessage(message.from, resposta);
  } catch (err) {
    console.error('❌ Erro ao ler tarefas do PDV:', err);
    await client.sendMessage(message.from, '❌ Erro ao consultar tarefas. Verifique o NB ou entre em contato com o APR.');
  }
};
