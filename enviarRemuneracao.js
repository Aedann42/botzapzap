// 📄 enviarRemuneracao.js

const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');

// Caminho para o arquivo de etapas
const etapasPath = path.join(__dirname, 'etapas.json');

// Carrega os dados de representantes e senhas
const representantes = JSON.parse(fs.readFileSync('./representantes.json', 'utf8'));
const senhaRemuneracao = JSON.parse(fs.readFileSync('./senhaRemuneracao.json', 'utf8'));

// Função para carregar as etapas
function carregarEtapas() {
  if (fs.existsSync(etapasPath)) {
    return JSON.parse(fs.readFileSync(etapasPath, 'utf8'));
  }
  return {};
}

// Função para salvar as etapas
function salvarEtapas(etapas) {
  fs.writeFileSync(etapasPath, JSON.stringify(etapas, null, 2));
}

// Função para lidar com a lógica de remuneração
async function enviarRemuneracao(client, message) {
  const numero = message.from;
  const texto = message.body.trim();

  console.log(`Recebido texto: ${texto} de ${numero}`);

  // Carrega o estado atual das etapas
  let etapas = carregarEtapas();
  console.log(`Etapas carregadas: ${JSON.stringify(etapas)}`);

  if (!etapas[numero]) {
    etapas[numero] = { etapa: 'matricula' };
    console.log(`Etapa inicial: matrícula solicitada para ${numero}`);
    await client.sendMessage(numero, 'Por favor, informe sua *matrícula* para continuar:');
    salvarEtapas(etapas);
    return;
  }

  const etapaAtual = etapas[numero];
  console.log(`Etapa atual: ${etapaAtual.etapa} para ${numero}`);

  if (etapaAtual.etapa === 'matricula') {
    const matricula = texto.replace(/\D/g, ''); // Remove tudo que não for número
    const telefone = numero.replace('@c.us', '');
    const representante = representantes.find(r => r.telefone === telefone);

    console.log(`Validando matrícula ${matricula} para ${telefone}`);

    if (!representante) {
      await client.sendMessage(numero, '❌ Representante não encontrado.');
      delete etapas[numero];
      salvarEtapas(etapas);
      return;
    }

    const setor = representante.setor.toString();

    const credencialValida = senhaRemuneracao.find(
      item =>
        item.setor?.toString() === setor &&
        item.senha?.toString() === matricula
    );

    if (!credencialValida) {
      await client.sendMessage(numero, '❌ Matrícula incorreta. Tente novamente digitando *4*.');
      delete etapas[numero];
      salvarEtapas(etapas);
      return;
    }

    const arquivoPath = path.join(
      '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2025\\5 - MAIO\\_GERADOR PDF\\REMUNERACAO',
      setor,
      `${setor}.pdf`
    );

    if (!fs.existsSync(arquivoPath)) {
      await client.sendMessage(numero, `❌ Planilha do setor ${setor} não foi encontrada.`);
      delete etapas[numero];
      salvarEtapas(etapas);
      return;
    }

    const media = MessageMedia.fromFilePath(arquivoPath);
    await client.sendMessage(numero, media, {
      sendMediaAsDocument: true,
      caption: `📄 Planilha de remuneração do setor ${setor}`
    });

    delete etapas[numero];
    salvarEtapas(etapas);
    console.log(`Etapa finalizada para ${numero}`);
  }
}

module.exports = enviarRemuneracao;
