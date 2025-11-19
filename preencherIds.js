// preencherIds.js
const fs = require('fs');
const path = require('path');

// Ajuste este caminho para onde está seu representantes.json
const REPRESENTANTES_PATH = path.join(__dirname, 'data', 'representantes.json');

console.log('Iniciando preenchimento de IDs...');

try {
    // 1. Ler o arquivo
    const data = fs.readFileSync(REPRESENTANTES_PATH, 'utf8');
    const representantes = JSON.parse(data);

    let atualizados = 0;
    let jaPreenchidos = 0;

    // 2. Fazer um loop e verificar
    for (const rep of representantes) {
        // Verifica se o campo 'id' está vazio ou não existe
        if (!rep.id) {
            
            // 3. Preenche o ID com o formato "telefone + @c.us"
            rep.id = `${rep.telefone}@c.us`;
            
            console.log(`- Atualizado: ${rep.nome || rep.telefone} -> ${rep.id}`);
            atualizados++;
        } else {
            jaPreenchidos++;
        }
    }

    // 4. Salvar o arquivo de volta no disco
    fs.writeFileSync(REPRESENTANTES_PATH, JSON.stringify(representantes, null, 4)); // Usei '4' para ficar igual ao seu exemplo

    console.log('\n--- Concluído! ---');
    console.log(`✅ ${atualizados} IDs foram preenchidos.`);
    console.log(`ℹ️ ${jaPreenchidos} IDs já estavam preenchidos e foram mantidos.`);

} catch (error) {
    console.error('❌ Erro ao processar o arquivo:', error);
}