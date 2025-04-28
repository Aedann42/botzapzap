// limparNumeroTeste.js
const fs = require('fs');
const path = require('path');

// Número de teste que você quer remover
const numeroTeste = '553298374229@c.us';

// Caminho para o arquivo atendidos.json
const atendidosPath = path.join(__dirname, 'atendidos.json');

function limparNumeroTeste() {
  if (!fs.existsSync(atendidosPath)) {
    console.log('Arquivo atendidos.json não encontrado.');
    return;
  }

  const dados = JSON.parse(fs.readFileSync(atendidosPath, 'utf8'));

  // Verifica se o número de teste existe no arquivo
  if (dados.includes(numeroTeste)) {
    const dadosAtualizados = dados.filter(numero => numero !== numeroTeste);
    fs.writeFileSync(atendidosPath, JSON.stringify(dadosAtualizados, null, 2));
    console.log(`✅ Número de teste ${numeroTeste} removido de atendidos.json.`);
  } else {
    console.log(`ℹ️ Número de teste ${numeroTeste} não estava no atendidos.json.`);
  }
}

module.exports = limparNumeroTeste;
