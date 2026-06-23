// src/handlers/optionsRouter.js
const chalk = require('chalk');
const fs = require('fs');
const paths = require('../config/paths');
const { registrarUso } = require('../utils/dataHandler');
const simularHumano = require('./simularHumano');
const verificarArquivoAtualizado = require('../services/checkDateReports');

// Importação dos Handlers das opções
const enviarRelatoriosPdf = require('./enviarRelatoriosPdf');
const enviarRelatoriosImagem = require('./enviarRelatoriosImagem');
const enviarRemuneracao = require('./enviarRemuneracao');
const enviarListaContatos = require('./enviarListaContatos');
const enviarCts = require('./enviarCts');
const clientesNaoCompradores = require('./clientesNaoCompradores');

// Função auxiliar segura para atualizar o etapas.json (Blinda contra JSON vazio)
function ativarEtapa(numero, nomeEtapa) {
    let etapas = {};
    try {
        if (fs.existsSync(paths.ETAPAS_JSON)) {
            const conteudo = fs.readFileSync(paths.ETAPAS_JSON, 'utf-8');
            if (conteudo && conteudo.trim() !== '') {
                etapas = JSON.parse(conteudo);
            }
        }
    } catch (e) {
        console.error(chalk.red(`[DEBUG] Aviso ao ler etapas.json: ${e.message}`));
    }
    
    etapas[numero] = { etapa: nomeEtapa };
    fs.writeFileSync(paths.ETAPAS_JSON, JSON.stringify(etapas, null, 2));
    console.log(chalk.blue(`[STATE] Usuário ${numero} entrou na etapa: ${nomeEtapa}`));
}

async function optionsRouter(client, message, representante, numeroTelefoneLimpo, MENU_TEXT, usuariosAguardandoRelatorio) {
    const textoOriginal = message.body.trim();
    const opcao = textoOriginal.toLowerCase();
    const numero = message.from;
    const MSG_INDISPONIVEL = '⚠️ Relatórios ainda não gerados. Avisarei quando estiverem prontos! 🤖';

    switch (opcao) {
        case '1': {
            console.log(chalk.yellow(`\n[DEBUG] 🚀 Iniciando a Opção 1 (PDF)...`));
            try {
                const pronto = await verificarArquivoAtualizado(paths.REDE_PDF_GIRO);
                if (pronto) {
                    const finalizar = await simularHumano(message);
                    await enviarRelatoriosPdf(client, message, representante);
                    await finalizar();
                    await registrarUso(numeroTelefoneLimpo, 'Relatório PDF', representante.setor);
                    console.log(chalk.green(`[DEBUG] ✅ Opção 1 concluída.`));
                } else {
                    await client.sendMessage(numero, MSG_INDISPONIVEL);
                    usuariosAguardandoRelatorio[numero] = 'pdf';
                    console.log(chalk.yellow(`[DEBUG] ⚠️ Relatório PDF indisponível. Usuário na fila.`));
                }
            } catch (erro) {
                console.error(chalk.bgRed.white(`[ERRO FATAL NA OPÇÃO 1]:`), erro);
                await client.sendMessage(numero, "❌ Erro interno ao buscar o relatório PDF.");
            }
            break;
        }

        case '2': {
            console.log(chalk.yellow(`\n[DEBUG] 🚀 Iniciando a Opção 2 (Imagem)...`));
            try {
                const pronto = await verificarArquivoAtualizado(paths.REDE_IMG_MATINAL);
                if (pronto) {
                    const finalizar = await simularHumano(message);
                    await enviarRelatoriosImagem(client, message, representante);
                    await finalizar();
                    await registrarUso(numeroTelefoneLimpo, 'Relatório Imagem', representante.setor);
                    console.log(chalk.green(`[DEBUG] ✅ Opção 2 concluída.`));
                } else {
                    await client.sendMessage(numero, MSG_INDISPONIVEL);
                    usuariosAguardandoRelatorio[numero] = 'imagem';
                    console.log(chalk.yellow(`[DEBUG] ⚠️ Relatório Imagem indisponível. Usuário na fila.`));
                }
            } catch (erro) {
                console.error(chalk.bgRed.white(`[ERRO FATAL NA OPÇÃO 2]:`), erro);
                await client.sendMessage(numero, "❌ Erro interno ao buscar o relatório de Imagem.");
            }
            break;
        }

        case '3': {
            console.log(chalk.yellow(`\n[DEBUG] 🚀 Iniciando a Opção 3 (Suporte)...`));
            try {
                const finalizar = await simularHumano(message, 'recording');
                await client.sendMessage(numero, 'Envie mensagem para o Yuri APR 3299982517 com nb e print do problema');
                await finalizar();
                console.log(chalk.green(`[DEBUG] ✅ Opção 3 concluída.`));
            } catch (erro) {
                console.error(chalk.bgRed.white(`[ERRO FATAL NA OPÇÃO 3]:`), erro);
            }
            break;
        }

        case '4': {
            console.log(chalk.yellow(`\n[DEBUG] 🚀 Iniciando a Opção 4 (Remuneração)...`));
            try {
                const finalizar = await simularHumano(message);
                await enviarRemuneracao(client, message);
                await finalizar();
                console.log(chalk.green(`[DEBUG] ✅ Opção 4 concluída.`));
            } catch (erro) {
                console.error(chalk.bgRed.white(`[ERRO FATAL NA OPÇÃO 4]:`), erro);
                await client.sendMessage(numero, "❌ Erro interno ao buscar a remuneração.");
            }
            break;
        }

        case '5': {
            console.log(chalk.yellow(`\n[DEBUG] 🚀 Iniciando a Opção 5 (Consulta PDV)...`));
            try {
                const finalizar = await simularHumano(message);
                await client.sendMessage(numero, 'Envie o código do PDV (apenas números):');
                ativarEtapa(numero, 'pdv');
                await finalizar();
                console.log(chalk.green(`[DEBUG] ✅ Opção 5 concluída (Aguardando Input).`));
            } catch (erro) {
                console.error(chalk.bgRed.white(`[ERRO FATAL NA OPÇÃO 5]:`), erro);
            }
            break;
        }

        case '6': {
            console.log(chalk.yellow(`\n[DEBUG] 🚀 Iniciando a Opção 6 (Lista Contatos)...`));
            try {
                const finalizar = await simularHumano(message);
                await enviarListaContatos(client, message);
                await finalizar();
                console.log(chalk.green(`[DEBUG] ✅ Opção 6 concluída.`));
            } catch (erro) {
                console.error(chalk.bgRed.white(`[ERRO FATAL NA OPÇÃO 6]:`), erro);
                await client.sendMessage(numero, "❌ Erro interno ao enviar os contatos.");
            }
            break;
        }

        case '7': {
            console.log(chalk.yellow(`\n[DEBUG] 🚀 Iniciando a Opção 7 (Coleta TTC)...`));
            try {
                const finalizar = await simularHumano(message);
                await client.sendMessage(numero, 'Envie o código do PDV para Coleta TTC:');
                ativarEtapa(numero, 'coleta_ttc');
                await finalizar();
                console.log(chalk.green(`[DEBUG] ✅ Opção 7 concluída (Aguardando Input).`));
            } catch (erro) {
                console.error(chalk.bgRed.white(`[ERRO FATAL NA OPÇÃO 7]:`), erro);
            }
            break;
        }

        case '8': {
            console.log(chalk.yellow(`\n[DEBUG] 🚀 Iniciando a Opção 8 (CT/Bonificação)...`));
            try {
                const finalizar = await simularHumano(message);
                await enviarCts(client, message, representante);
                await finalizar();
                console.log(chalk.green(`[DEBUG] ✅ Opção 8 concluída.`));
            } catch (erro) {
                console.error(chalk.bgRed.white(`[ERRO FATAL NA OPÇÃO 8]:`), erro);
                await client.sendMessage(numero, "❌ Erro interno na consulta de CTs.");
            }
            break;
        }

        case '9': {
            console.log(chalk.yellow(`\n[DEBUG] 🚀 Iniciando a Opção 9 (Giro)...`));
            try {
                const finalizar = await simularHumano(message);
                await client.sendMessage(numero, 'Envie o código do PDV para Giro 🤑:');
                ativarEtapa(numero, 'giro_equipamentos');
                await finalizar();
                console.log(chalk.green(`[DEBUG] ✅ Opção 9 concluída (Aguardando Input).`));
            } catch (erro) {
                console.error(chalk.bgRed.white(`[ERRO FATAL NA OPÇÃO 9]:`), erro);
            }
            break;
        }

        case '10': {
            console.log(chalk.yellow(`\n[DEBUG] 🚀 Iniciando a Opção 10 (Troca de Setor)...`));
            try {
                const finalizar = await simularHumano(message);
                await client.sendMessage(numero, '🔄 *CORRIGIR SETOR*\n\nDigite apenas o *NÚMERO DO SETOR* novo:');
                ativarEtapa(numero, 'troca_setor_passo1');
                await finalizar();
                console.log(chalk.green(`[DEBUG] ✅ Opção 10 concluída (Aguardando Input).`));
            } catch (erro) {
                console.error(chalk.bgRed.white(`[ERRO FATAL NA OPÇÃO 10]:`), erro);
            }
            break;
        }

        case '11': {
            console.log(chalk.yellow(`\n[DEBUG] 🚀 Iniciando a Opção 11 (Não Compradores)...`));
            try {
                const finalizar = await simularHumano(message);
                await clientesNaoCompradores(client, message, representante);
                await finalizar();
                console.log(chalk.green(`[DEBUG] ✅ Opção 11 concluída.`));
            } catch (erro) {
                console.error(chalk.bgRed.white(`[ERRO FATAL NA OPÇÃO 11]:`), erro);
                await client.sendMessage(numero, "❌ Erro interno ao processar indicadores.");
            }
            break;
        }

        case '12': {
            console.log(chalk.yellow(`\n[DEBUG] 🚀 Iniciando a Opção 12 (Análise de Rotas)...`));
            try {
                const finalizar = await simularHumano(message);
                await client.sendMessage(numero, "📍 *Análise de Rotas*\n\nEste é um processo de *DE/PARA*? (Troca CNPJ)\n1️⃣ - SIM\n2️⃣ - NÃO\n\nDigite o número correspondente:");
                ativarEtapa(numero, 'analiseRotas_tipoDePara');
                await finalizar();
                console.log(chalk.green(`[DEBUG] ✅ Opção 12 concluída (Aguardando Input).`));
            } catch (erro) {
                console.error(chalk.bgRed.white(`[ERRO FATAL NA OPÇÃO 12]:`), erro);
                await client.sendMessage(numero, "❌ Erro interno ao preparar Análise de Rotas.");
            }
            break;
        }

        case 'menu': {
            try {
                await client.sendMessage(numero, MENU_TEXT);
            } catch (erro) {
                console.error(chalk.bgRed.white(`[ERRO AO ENVIAR MENU]:`), erro);
            }
            break;
        }

        default: {
            try {
                if (!textoOriginal.startsWith('/')) {
                    await client.sendMessage(numero, `❌ Opção inválida.\n\n${MENU_TEXT}`);
                    console.log(chalk.gray(`[DEBUG] Usuário enviou opção inválida: "${textoOriginal}"`));
                }
            } catch (erro) {
                console.error(chalk.bgRed.white(`[ERRO NO DEFAULT]:`), erro);
            }
            break;
        }
    }
}

module.exports = optionsRouter;