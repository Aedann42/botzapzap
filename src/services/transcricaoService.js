require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const CAMINHO_LISTA_PRODUTOS = path.join(process.cwd(), 'data', 'tabelaPrecos.txt');

const axiosInstance = axios.create({
    baseURL: 'https://api.groq.com/openai/v1',
    timeout: 60000,
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` }
});

// --- FUNÇÃO AUXILIAR: FILTRAGEM INTELIGENTE ---
function filtrarTabelaPorContexto(tabelaInteira, textoUsuario) {
    if (!tabelaInteira || !textoUsuario) return "";

    // 1. Quebra o texto do usuário em palavras-chave (ignora palavras curtas)
    const palavrasChave = textoUsuario.split(/[\s,.;]+/)
        .filter(p => p.length > 3) // Ignora 'de', 'da', 'com'
        .map(p => p.toLowerCase());

    if (palavrasChave.length === 0) return tabelaInteira.substring(0, 2000); // Fallback leve

    const linhas = tabelaInteira.split('\n');
    const linhasRelevantes = [];
    let count = 0;

    // 2. Busca linhas na tabela que contenham alguma das palavras-chave
    for (const linha of linhas) {
        const linhaLow = linha.toLowerCase();
        // Se a linha tiver alguma das palavras (ex: 'skol', 'brahma')
        if (palavrasChave.some(p => linhaLow.includes(p))) {
            linhasRelevantes.push(linha);
            count++;
        }
        // Limite de segurança: Máximo 100 produtos para não estourar token
        if (count >= 100) break;
    }

    // Se não achou nada relevante, manda um pedacinho genérico ou nada
    if (linhasRelevantes.length === 0) return "";

    console.log(`[transcricaoService - DEBUG_IA] 📉 Tabela otimizada: Enviando ${linhasRelevantes.length} produtos relevantes para a IA.`);
    return linhasRelevantes.join('\n');
}


// --- 1. TRANSCRIÇÃO ---
async function groqWhisper(caminhoArquivo) {
    console.log(`[transcricaoService - DEBUG_IA] 🎙️ Iniciando Whisper...`);
    try {
        const form = new FormData();
        form.append('file', fs.createReadStream(caminhoArquivo));
        form.append('model', 'whisper-large-v3'); 

        const response = await axiosInstance.post('/audio/transcriptions', form, {
            headers: { ...form.getHeaders() }
        });
        return response.data.text;
    } catch (e) {
        console.error(`[ERRO WHISPER]: ${e.message}`);
        throw new Error("Falha Whisper");
    }
}

// --- 2. PADRONIZAÇÃO ---
async function groqFormatar(textoBruto) {
    if (!textoBruto || textoBruto.length < 2) return "";
    
    // Se já é CSV, retorna
    if (textoBruto.split('/').length >= 4) return textoBruto;

    console.log(`[transcricaoService - DEBUG_IA] 🧠 Preparando contexto para: "${textoBruto}"`);

    let listaProdutos = "";
    try {
        if (fs.existsSync(CAMINHO_LISTA_PRODUTOS)) {
            const tabelaFull = fs.readFileSync(CAMINHO_LISTA_PRODUTOS, 'utf-8');
            // 🚨 AQUI ESTÁ O TRUQUE: FILTRAR ANTES DE ENVIAR
            listaProdutos = filtrarTabelaPorContexto(tabelaFull, textoBruto);
        }
    } catch (e) { console.error("[DEBUG_IA] Erro ler tabela:", e.message); }

const promptSistema = `
    ATUAR COMO: Especialista em pedidos de revenda Ambev.
    SUA MISSÃO: Corrigir erros fonéticos do áudio e formatar para CSV.

    CATÁLOGO RELEVANTE (NOME | CÓDIGO):
    ${listaProdutos}

    --- CORREÇÃO FONÉTICA OBRIGATÓRIA ---
    O transcritor erra muito. Use esta tabela de tradução mental:
    - "creche de escola" / "caixa de escola" / "quebra de escola" -> LEIA COMO: "Caixa de Skol"
    - "escola" / "escol" / "ixkol" -> LEIA COMO: "Skol"
    - "escada" / "iscada" -> LEIA COMO: "Cada" (ex: "30 reais a escada" = "30 reais CADA")
    - "gradil" -> LEIA COMO: "Engradado" ou "Caixa"
    - "meia dúzia" -> LEIA COMO: "6"
    - "um de cada" -> LEIA COMO: Quantidade 1
    -------------------------------------

    TAREFA: Converter texto em CSV: NB/PAGAMENTO/COD/QTD/VALOR

    REGRAS:
    1. NB (Número Base): Procure números isolados (ex: 50, 70, 5010). Se não achar, 0.
    2. PAGAMENTO: "BOLETO X" (X = dias), "DINHEIRO", "A VISTA".
    3. COD: Busque pelo NOME corrigido no catálogo acima.
       - Se o cliente disser "Skol Litrão", busque o código correspondente na lista.
    4. QTD: Se não for dita, padrão é 1. Se disser "10 caixas", é 10.
    5. VALOR: Se disser "a 30 reais", o valor é 30,00.

    Exemplo de Correção:
    Entrada: "NB 50, 10 creche de escola a 30 reais a escada"
    Raciocínio: "creche de escola" = Skol, "escada" = cada.
    Saída: 50/BOLETO 1/9083/10/30,00

    RESPONDA APENAS A LINHA FORMATADA.
    `;

    try {
        const response = await axiosInstance.post('/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: promptSistema },
                { role: "user", content: textoBruto }
            ],
            temperature: 0.1,
            max_tokens: 200 // Resposta curta para economizar
        });

        const csv = response.data.choices[0].message.content.trim().replace(/```/g, '');
        console.log(`[transcricaoService - DEBUG_IA] ✅ Sucesso: ${csv}`);
        return csv;

    } catch (e) {
        if (e.response && e.response.data) {
            console.error(`[ERRO GROQ]:`, JSON.stringify(e.response.data.error, null, 2));
        } else {
            console.error(`[ERRO GROQ]: ${e.message}`);
        }
        return `0/ERRO IA/${textoBruto}/0/0`;
    }
}

// --- PROCESSADOR GERAL ---
const processarAudiosPendentes = async () => {
    // console.log('[ transcricaoService - DEBUG_STEP 1] Iniciando ciclo de IA...');
    const hoje = new Date().toISOString().split('T')[0];
    const pastaData = path.join(process.cwd(), 'pedidos', hoje);

    if (!fs.existsSync(pastaData)) return;

    const arquivos = fs.readdirSync(pastaData).filter(f => f.endsWith('.json'));

    for (const arquivo of arquivos) {
        const caminhoJson = path.join(pastaData, arquivo);
        try {
            let dados = JSON.parse(fs.readFileSync(caminhoJson, 'utf-8'));
            if (dados.itens_processados) continue;

            let textoCompleto = dados.dados_brutos || "";
            let linhas = textoCompleto.split('\n');
            let novasLinhas = [];
            let houveAlteracao = false;

            for (let linha of linhas) {
                let texto = linha.trim();
                if (!texto) continue;

                // 1. Transcreve Audio
                const matchAudio = /\[AUDIO_PENDENTE:(.*?)\]/.exec(texto);
                if (matchAudio) {
                    const nomeAudio = matchAudio[1];
                    const caminhoAudio = path.join(pastaData, nomeAudio);
                    if (fs.existsSync(caminhoAudio)) {
                        try {
                            texto = await groqWhisper(caminhoAudio);
                        } catch (e) { texto = "0/ERRO AUDIO/0/0/0"; }
                    } else { texto = "0/AUDIO OFF/0/0/0"; }
                }

                // 2. Padroniza Texto (Se não for CSV)
                const ehCSV = texto.includes('/') && texto.split('/').length >= 4;
                if (!ehCSV && texto.length > 5) {
                    // Adicionei um pequeno delay para não bater o Rate Limit se tiver muitas linhas
                    await new Promise(r => setTimeout(r, 500)); 
                    const csv = await groqFormatar(texto);
                    novasLinhas.push(csv);
                    houveAlteracao = true;
                } else {
                    novasLinhas.push(texto);
                }
            }

            if (houveAlteracao) {
                dados.dados_brutos = novasLinhas.join('\n');
                fs.writeFileSync(caminhoJson, JSON.stringify(dados, null, 2));
                console.log(`[transcricaoService - SUCESSO] Arquivo ${arquivo} atualizado.`);
            }
        } catch (err) {
            console.error(`[ERRO ARQUIVO] ${arquivo}:`, err.message);
        }
    }
};

module.exports = {
    processarAudiosPendentes,
    groqWhisper,
    groqFormatar
};