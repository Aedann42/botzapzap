/**
 * Pega o texto CSV (NB/PAGAMENTO/COD/QTD/VALOR) e vira Objeto JSON
 */
function traduzirTextoParaItens(textoProcessado) {
    console.log("[TRADUTOR] 🔍 Iniciando tradução de texto bruto...");
    
    const linhas = textoProcessado.split('\n');
    const itensEncontrados = [];
    
    // Variáveis "Sticky": Se o NB ou Pagamento aparecerem na linha 1, 
    // valem para as próximas linhas caso elas venham vazias.
    let nbEncontrado = "0";
    let pagamentoEncontrado = "BOLETO";

    let indexItem = 1;

    linhas.forEach((linha, idx) => {
        linha = linha.trim();
        if (!linha) return;

        // DEBUG da linha
        // console.log(`[TRADUTOR] Processando linha ${idx}: ${linha}`);

        // Formato esperado: NB/PAGAMENTO/COD/QTD/VALOR
        const partes = linha.split('/');

        if (partes.length >= 3) { // Precisa ter pelo menos até o código
            
            // 1. NB
            const rawNB = partes[0].replace(/\D/g, ''); 
            if (rawNB && rawNB !== "0") nbEncontrado = rawNB;

            // 2. Pagamento (Novo campo)
            const rawPag = partes[1] ? partes[1].trim().toUpperCase() : "";
            if (rawPag && rawPag.length > 2) pagamentoEncontrado = rawPag;

            // 3. Código
            const codigo = partes[2].trim();
            
            // 4. Quantidade
            const qtde = partes[3] ? partes[3].trim() : "1";
            
            // 5. Valor
            const valor = partes[4] ? partes[4].trim() : "0";

            // Validação básica do código
            if (codigo && codigo !== "0000" && codigo.length > 1) {
                const itemObj = {
                    index: indexItem,
                    nb: nbEncontrado,
                    pagamento: pagamentoEncontrado,
                    codigo: codigo,
                    quantidade: qtde,
                    valor: valor,
                    nomeOriginal: `Item cód ${codigo}`
                };
                
                itensEncontrados.push(itemObj);
                indexItem++;
            } else {
                console.log(`[TRADUTOR] ⚠️ Ignorando linha por código inválido: ${linha}`);
            }
        } else {
             // Logs para linhas que não são CSV (ex: mensagens de erro ou texto solto)
             if(linha.length > 5) console.log(`[TRADUTOR] ℹ️ Linha fora do formato CSV ignorada: "${linha}"`);
        }
    });

    console.log(`[TRADUTOR] ✅ Total de itens extraídos: ${itensEncontrados.length}`);
    return itensEncontrados;
}

module.exports = { traduzirTextoParaItens };