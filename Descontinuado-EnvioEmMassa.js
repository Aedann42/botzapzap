// EnvioEmMassa.js

const fs = require('fs');
const path = require('path');
const representantes = require('./representantes.json');
const mime = require('mime-types');

const basePath = '\\\\VSRV-DC01\\Arquivos\\VENDAS\\METAS E PROJETOS\\2025\\4 - ABRIL\\_GERADOR PDF\\ACOMPS';

async function enviarArquivo(client, telefone, caminhoArquivo) {
  const buffer = fs.readFileSync(caminhoArquivo);
  const nomeArquivo = path.basename(caminhoArquivo);
  const mimeType = mime.lookup(caminhoArquivo);

  await client.sendMessage(`${telefone}@c.us`, buffer, {
    filename: nomeArquivo,
    mimetype: mimeType,
  });

  console.log(`✅ Enviado: ${nomeArquivo} para ${telefone}`);
}

async function enviarArquivosEmMassa(client) {
  console.log('🚀 Iniciando envio em massa para representantes...\n');

  for (const representante of representantes) {
    const setorCodigo = String(representante.setor).trim();
    const telefone = representante.telefone;

    const pastaSetor = path.join(basePath, setorCodigo);
    console.log("🔍 Verificando pasta:", pastaSetor);

    if (!fs.existsSync(pastaSetor)) {
      console.warn(`⚠️ Pasta não encontrada para setor "${setorCodigo}". Pulando...`);
      continue;
    }

    const arquivos = fs.readdirSync(pastaSetor);
    if (arquivos.length === 0) {
      console.warn(`⚠️ Nenhum arquivo encontrado na pasta do setor "${setorCodigo}". Pulando...`);
      continue;
    }

    for (const arquivo of arquivos) {
      const caminhoCompleto = path.join(pastaSetor, arquivo);
      try {
        await enviarArquivo(client, telefone, caminhoCompleto);
      } catch (err) {
        console.error(`❌ Erro ao enviar ${arquivo} para ${telefone}:`, err.message);
      }
    }
  }

  console.log('\n📤 Envio em massa finalizado!');
}

module.exports = enviarArquivosEmMassa;

if (require.main === module) {
    // Rodando diretamente via terminal
    const { Client, LocalAuth } = require('whatsapp-web.js');
    const client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: { headless: true }
    });
  
    client.on('ready', async () => {
      console.log('✅ Client conectado (modo standalone)');
      await enviarArquivosEmMassa(client);
    });
  
    client.initialize();
  }
  