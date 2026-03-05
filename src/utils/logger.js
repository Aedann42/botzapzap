// src/utils/logger.js
const chalk = require('chalk');
const { carregarStatsDoLog, registrarEstatistica, getStats } = require('./stats');

// Função Matrix Original
const logMatrix = (...args) => {
    const mensagens = args.map(arg => 
        typeof arg === 'object' ? chalk.green.bold(JSON.stringify(arg, null, 2)) : chalk.green.bold(arg)
    );
    console.log(...mensagens);
};

// Verifica se a memória está estourando
const monitorarMemoria = () => {
    const usado = process.memoryUsage().heapUsed / 1024 / 1024;
    if (usado > 3500) {
        console.log(chalk.red.bold(`⚠️ PERIGO: O bot está prestes a estourar a memória! [${Math.round(usado)}MB]`));
    }
};

// Atualiza o título da janela do Windows
const atualizarStatusPainel = () => {
    const atual = getStats(); 
    const uptime = Math.round(process.uptime() / 60);
    const memoria = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    
    process.stdout.write(
        `\x1b]0;BOT ZAPZAP | Atendimentos: ${atual.total} | RAM: ${memoria}MB | Ativo: ${uptime}min\x07`
    );
};

// A Função Central: Conecta a estatística com a cor do terminal
const logAcao = (tipo, mensagem) => {
    const dicionarioDeChaves = {
        'PDF': 'pdfs',
        'IMAGEM': 'imagens',
        'DUVIDA': 'duvida',
        'REMUNERACAO': 'remuneracao',
        'PDV': 'tarefasPdv',
        'TELEFONES': 'telefones',
        'COLETA': 'coletaTtc',
        'BONIFICACAO': 'bonificacao',
        'GIRO': 'giro',
        'ALTERAR_SETOR': 'alterarSetor',
        'NAO_COMPRADORES': 'naoCompradores',
        'ERRO': 'erros'
    };

    const chaveStat = dicionarioDeChaves[tipo.toUpperCase()];
    
    if (chaveStat) {
        registrarEstatistica(chaveStat);
    } else {
        registrarEstatistica('total');
    }

    switch (tipo.toUpperCase()) {
        case 'PDF': console.log(chalk.green.bold(`[1 - PDF] ${mensagem}`)); break;
        case 'IMAGEM': console.log(chalk.greenBright(`[2 - IMAGEM] ${mensagem}`)); break;
        case 'DUVIDA': console.log(chalk.yellow(`[3 - SUPORTE] ${mensagem}`)); break;
        case 'REMUNERACAO': console.log(chalk.yellow.bold(`[4 - FINANCEIRO] ${mensagem}`)); break;
        case 'PDV': console.log(chalk.red.bold(`[5 - PDV] ${mensagem}`)); break;
        case 'TELEFONES': console.log(chalk.red(`[6 - CONTATOS] ${mensagem}`)); break;
        case 'COLETA': console.log(chalk.magenta.bold(`[7 - TTC] ${mensagem}`)); break;
        case 'BONIFICACAO': console.log(chalk.magenta(`[8 - CT/BONIF] ${mensagem}`)); break;
        case 'GIRO': console.log(chalk.cyan(`[9 - GIRO] ${mensagem}`)); break;
        case 'ALTERAR_SETOR': console.log(chalk.redBright(`[10 - SETOR] ${mensagem}`)); break;
        case 'NAO_COMPRADORES': console.log(chalk.greenBright.bold(`[11 - INDICADORES] ${mensagem}`)); break;
        case 'ERRO': console.log(chalk.bgRed.white.bold(`[ERRO] ${mensagem}`)); break;
        default: console.log(chalk.gray(`[SISTEMA] ${mensagem}`)); break;
    }

    atualizarStatusPainel();
};

// Da a partida no sistema inteiro e mostra o resumo
const iniciarPainel = () => {
    carregarStatsDoLog(); // Lê o JSON primeiro para restaurar o total do dia
    
    const s = getStats(); // Pega os números que acabaram de ser lidos
    
    // Desenha o Dashboard completo no terminal
    console.log(chalk.cyan('\n================================================='));
    console.log(chalk.cyan.bold('  📊 RESUMO DE ATENDIMENTOS HOJE (RECUPERADOS)'));
    console.log(chalk.cyan('================================================='));
    console.log(chalk.greenBright.bold(` ► TOTAL GERAL:          ${s.total} interações`));
    console.log(chalk.gray('-------------------------------------------------'));
    console.log(chalk.white(` ► [Menu] Menus Enviados:   ${s.menus || 0}`));
    console.log(chalk.white(` ► [1] Relatórios PDF:      ${s.pdfs || 0}`));
    console.log(chalk.white(` ► [2] Relatórios Imagem:   ${s.imagens || 0}`));
    console.log(chalk.white(` ► [3] Suporte/Dúvidas:     ${s.duvida || 0}`));
    console.log(chalk.white(` ► [4] Remuneração:         ${s.remuneracao || 0}`));
    console.log(chalk.white(` ► [5] Consultas PDV:       ${s.tarefasPdv || 0}`));
    console.log(chalk.white(` ► [6] Lista Contatos:      ${s.telefones || 0}`));
    console.log(chalk.white(` ► [7] Coleta TTC:          ${s.coletaTtc || 0}`));
    console.log(chalk.white(` ► [8] CT/Bonificação:      ${s.bonificacao || 0}`));
    console.log(chalk.white(` ► [9] Consulta Giro:       ${s.giro || 0}`));
    console.log(chalk.white(` ► [10] Alterar Setor:      ${s.alterarSetor || 0}`));
    console.log(chalk.white(` ► [11] Não Compradores:    ${s.naoCompradores || 0}`));
    
    // Se tiver algum erro logado no dia, ele destaca em vermelho no final
    if (s.erros > 0) {
        console.log(chalk.gray('-------------------------------------------------'));
        console.log(chalk.bgRed.white.bold(` ► ERROS REGISTRADOS:       ${s.erros} `));
    }
    
    console.log(chalk.cyan('=================================================\n'));

    // Inicia os loops de atualização a cada 10 seg e memória a cada 5 min
    setInterval(atualizarStatusPainel, 10000);
    setInterval(monitorarMemoria, 5 * 60 * 1000);
    
    // Já força a barra de título a ficar com os números certos na mesma hora
    atualizarStatusPainel();
};

// 👇 ESTA É A LINHA QUE DEVE TER SUMIDO. ELA É A CHAVE MESTRA!
module.exports = { logAcao, iniciarPainel, logMatrix };