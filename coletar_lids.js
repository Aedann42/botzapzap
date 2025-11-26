const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// --- CONFIGURAÇÃO AUTOMÁTICA DE CAMINHOS ---
let caminhoJsonReal = '';
const caminhosPossiveis = [
    './representantes.json',
    './data/representantes.json',
    './src/data/representantes.json',
    './src/utils/representantes.json'
];

for (const c of caminhosPossiveis) {
    if (fs.existsSync(c)) {
        caminhoJsonReal = c;
        break;
    }
}

if (!caminhoJsonReal) {
    console.error('❌ ERRO: Não encontrei o arquivo representantes.json.');
    process.exit(1);
}

const ARQUIVO_SAIDA = './representantes_atualizados.json';

const lerJson = (caminho) => {
    try {
        const data = fs.readFileSync(caminho, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Erro ao ler JSON:', error);
        return [];
    }
};

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: '.session' }),
    puppeteer: { headless: true, args: ['--no-sandbox'] }
});

client.on('qr', qr => {
    console.log('📱 Leia o QR Code abaixo:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('✅ Conectado!');
    console.log(`📂 Lendo JSON de: ${caminhoJsonReal}`);

    const representantes = lerJson(caminhoJsonReal);
    let atualizados = 0;

    console.log('🔍 Buscando conversas ativas (getChats)...');
    
    try {
        // 🚀 MUDANÇA: Usamos getChats() em vez de getContacts() para evitar o crash
        const chats = await client.getChats();
        console.log(`💬 Conversas encontradas: ${chats.length}`);

        for (const chat of chats) {
            const id = chat.id._serialized; // O ID da conversa

            // Só nos interessa se for um chat privado e LID
            if (chat.isGroup || !id.endsWith('@lid')) continue;

            // Tenta descobrir o número de telefone vinculado a este chat
            // Em chats LID, às vezes o número está escondido, mas vamos tentar achar
            let numeroVinculado = null;

            // Tenta pegar o número através das informações de contato do chat
            try {
                const contact = await chat.getContact();
                if (contact && contact.number) {
                    numeroVinculado = contact.number;
                }
            } catch (err) {
                // Se falhar ao pegar o contato, ignoramos esse chat
                continue;
            }

            if (numeroVinculado) {
                // Procura este número no seu JSON
                const index = representantes.findIndex(r => r.telefone === numeroVinculado);

                if (index !== -1) {
                    const rep = representantes[index];
                    // Se achamos e ainda não tem LID salvo...
                    if (rep.lid !== id) {
                        console.log(`🆕 LID Encontrado! Tel: ${numeroVinculado} -> LID: ${id}`);
                        representantes[index].lid = id;
                        atualizados++;
                    }
                }
            }
        }

        if (atualizados > 0) {
            fs.writeFileSync(ARQUIVO_SAIDA, JSON.stringify(representantes, null, 4));
            console.log('------------------------------------------------');
            console.log(`✅ SUCESSO! ${atualizados} LIDs coletados.`);
            console.log(`💾 Salvo em: ${ARQUIVO_SAIDA}`);
            console.log('👉 Substitua seu arquivo original por este.');
            console.log('------------------------------------------------');
        } else {
            console.log('⚠️ Nenhum LID novo encontrado nas conversas ativas.');
            console.log('DICA: Use o comando manual "/rep [numero] menu" para forçar o aprendizado.');
        }

    } catch (error) {
        console.error('❌ Erro fatal ao buscar chats:', error.message);
    }

    process.exit(0);
});

client.initialize();