// enviarRelatorios.js
const path = require('path');
const fs = require('fs');
const { MessageMedia } = require('whatsapp-web.js');

module.exports = async function enviarRelatorios(client, message) {
  const numero = message.from.replace('@c.us', '');

  // Carrega os dados dos representantes
  const representantes = JSON.parse(fs.readFileSync('./representantes.json', 'utf8'));
  const pessoa = representantes.find(rep => rep.telefone === numero);

  if (!pessoa) {
    await client.sendMessage(message.from, 'Seu número não está cadastrado como representante.');
    return;
  }

  // Caminho com unidade T:
  const pastaSetor = path.join(
    'T:\\Setor',
    String(pessoa.setor)
  );

  if (!fs.existsSync(pastaSetor)) {
    await client.sendMessage(message.from, 'Não encontrei documentos para seu setor.');
    return;
  }

  const arquivos = fs.readdirSync(pastaSetor).filter(file => file.endsWith('.jpg'));

  if (arquivos.length === 0) {
    await client.sendMessage(message.from, 'Nenhum documento encontrado para seu setor.');
    return;
  }

  await client.sendMessage(message.from, '🔄 Enviando relatórios, aguarde...');

  for (const nomeArquivo of arquivos) {
    const caminhoCompleto = path.join(pastaSetor, nomeArquivo);
    const media = MessageMedia.fromFilePath(caminhoCompleto);

    await client.sendMessage(message.from, media, {
      caption: nomeArquivo,
    });
  }

  await client.sendMessage(message.from, '✅ Relatórios enviados com sucesso.');
};
