// src/utils/stats.js
const fs = require('fs');
const path = require('path');

// Nosso objeto de dados puro com todas as opções
let stats = {
    total: 0,
    menus: 0,            // Para chamadas do "Menu"
    pdfs: 0,             // 1
    imagens: 0,          // 2
    duvida: 0,           // 3
    remuneracao: 0,      // 4
    tarefasPdv: 0,       // 5
    telefones: 0,        // 6
    coletaTtc: 0,        // 7
    bonificacao: 0,      // 8
    giro: 0,             // 9
    alterarSetor: 0,     // 10
    naoCompradores: 0,   // 11
    erros: 0
};

// Carrega os dados salvos do log_uso.json quando o bot liga
const carregarStatsDoLog = () => {
    // Apontando para a pasta 'logs' como você corrigiu
    const caminhoLog = path.join(__dirname, '..', '..', 'logs', 'log_uso.json'); 
    
    if (fs.existsSync(caminhoLog)) {
        try {
            const rawData = fs.readFileSync(caminhoLog, 'utf-8');
            const historico = JSON.parse(rawData);
            
            // Cria a data no formato exato que está no JSON (DD/MM/YYYY)
            const hojeObj = new Date();
            const dia = String(hojeObj.getDate()).padStart(2, '0');
            const mes = String(hojeObj.getMonth() + 1).padStart(2, '0');
            const ano = hojeObj.getFullYear();
            const hojeBR = `${dia}/${mes}/${ano}`; 
            
            // Filtra só os que aconteceram hoje
            const logsDeHoje = historico.filter(log => log.data === hojeBR); 

            // Atualiza os números principais baseados nas strings exatas do seu print/código
            stats.total = logsDeHoje.length;
            
            stats.menus = logsDeHoje.filter(log => log.funcao === 'Menu').length;
            stats.pdfs = logsDeHoje.filter(log => log.funcao === 'Relatório PDF').length;
            stats.imagens = logsDeHoje.filter(log => log.funcao === 'Relatório Imagem').length;
            stats.remuneracao = logsDeHoje.filter(log => log.funcao === 'Remuneração').length;
            stats.duvida = logsDeHoje.filter(log => log.funcao === 'Suporte Manual').length;
            stats.telefones = logsDeHoje.filter(log => log.funcao === 'Lista Contatos').length;
            stats.bonificacao = logsDeHoje.filter(log => log.funcao === 'Consulta CT').length;
            stats.alterarSetor = logsDeHoje.filter(log => log.funcao === 'Início Troca Setor').length;
            
            // Tratamento especial: junta o "Início" com a "Consulta" final para essas opções
            stats.tarefasPdv = logsDeHoje.filter(log => log.funcao === 'Início PDV' || log.funcao === 'Consulta PDV').length;
            stats.coletaTtc = logsDeHoje.filter(log => log.funcao === 'Início TTC' || log.funcao === 'Consulta TTC').length;
            stats.giro = logsDeHoje.filter(log => log.funcao === 'Início Giro' || log.funcao === 'Consulta Giro').length;
            stats.naoCompradores = logsDeHoje.filter(log => log.funcao === 'Início Clientes Nao Compradores' || log.funcao === 'Consulta Nao Compradores').length;

            console.log(`📂 [SISTEMA] Histórico lido com sucesso! ${stats.total} interações resgatadas de hoje.`);
            
        } catch (error) {
            console.log(`⚠️ [ERRO CRÍTICO] Falha ao tentar ler o log_uso.json: ${error.message}`);
        }
    } else {
        console.log(`⚠️ [AVISO] Arquivo não encontrado no caminho exato: ${caminhoLog}`);
    }
};

// Incrementa as estatísticas de forma dinâmica enquanto o bot roda
const registrarEstatistica = (chave) => {
    stats.total++; // Sempre soma no total geral
    if (stats[chave] !== undefined) {
        stats[chave]++; // Soma na categoria específica (ex: stats.pdfs++)
    }
};

// Retorna o objeto completo para o logger desenhar o painel
const getStats = () => stats;

module.exports = { carregarStatsDoLog, registrarEstatistica, getStats };