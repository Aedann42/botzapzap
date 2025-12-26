/**
 * Service responsável por transformar texto bruto em itens estruturados
 * baseados na tabela de preços.
 */
module.exports = {
    traduzirTextoParaItens: (textoBruto, produtosTabela) => {
        console.log(`[TRADUTOR] 🧠 Iniciando tradução de dados brutos...`);
        
        const itensEncontrados = [];
        let contador = 0;

        // Regex para capturar: [Quantidade] [Nome do Produto]
        // Suporta formatos como "10 skol", "5 brama" em múltiplas linhas ou na mesma linha
        const regex = /(\d+)\s+([a-zA-Záàâãéèêíïóôõöúç\s]+?)(?=\s+\d+\s+|$|\n)/gi;
        let match;

        while ((match = regex.exec(textoBruto)) !== null && contador < 99) {
            const qtd = match[1];
            const termoBusca = match[2].toUpperCase().trim();

            // Busca o melhor match na tabela de preços (Busca por inclusão)
            const produto = produtosTabela.find(p => 
                p.produto.toUpperCase().includes(termoBusca)
            );

            if (produto) {
                contador++;
                itensEncontrados.push({
                    index: contador,
                    codigo: produto.codigo,
                    quantidade: qtd,
                    valor: produto.valor,
                    nomeOriginal: produto.produto
                });
                console.log(`[TRADUTOR] ✨ Match: "${termoBusca}" -> ${produto.produto}`);
            } else {
                console.warn(`[TRADUTOR] ⚠️ Não encontrado: "${termoBusca}"`);
            }
        }

        return itensEncontrados;
    }
};