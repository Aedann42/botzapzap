const fs = require('fs');
const path = require('path');
const { lerJson, escreverJson, ETAPAS_PATH } = require('../utils/dataHandler.js');

// Configuração de Caminhos
const CAMINHO_SOLICITACOES = path.join(process.cwd(), 'data', 'solicitacoes.json');
const CAMINHO_SENHAS = path.join(process.cwd(), 'data', 'senhaRemuneracao.json');
const CAMINHO_REPRESENTANTES = path.join(process.cwd(), 'data', 'representantes.json');

// 🔥 Usando String.raw para o Node não cortar as barras invertidas da rede!
const CAMINHO_SYNC_CSV = String.raw`C:\botzapzap\botzapzap\data\planificadorRotasRns.csv`;
const LID_YURI = '178520986747062@lid';

/**
 * FLUXO DE SOLICITAÇÃO (USUÁRIO)
 */
async function processarTroca(client, message, representante) {
    const numero = message.from;
    const texto = message.body.trim();
    let etapas = lerJson(ETAPAS_PATH, {});
    const etapaUser = etapas[numero];

    console.log(`\n[MUDANÇA SETOR] -----------------------------------------`);
    console.log(`[MUDANÇA SETOR] Usuário ${numero} entrou na etapa: ${etapaUser?.etapa}`);

    if (['cancelar', 'sair'].includes(texto.toLowerCase())) {
        delete etapas[numero];
        escreverJson(ETAPAS_PATH, etapas);
        await client.sendMessage(numero, '🚫 Alteração de setor/matrícula cancelada.');
        return;
    }

    // PASSO 1: Recebe o Setor e pede a Matrícula
    if (etapaUser.etapa === 'troca_setor_passo1') {
        const novoSetor = texto.replace(/\D/g, '');
        if (!novoSetor) return await client.sendMessage(numero, '❗ Digite apenas os números do setor.');

        etapas[numero] = { etapa: 'troca_setor_passo2', novoSetor: novoSetor };
        escreverJson(ETAPAS_PATH, etapas);
        await client.sendMessage(numero, `Você vai assumir o setor *${novoSetor}*.\nAgora, digite sua *Matrícula* nova para vincular a este setor:`);
        return;
    }

    // PASSO 2: Recebe a Matrícula e gera solicitação para o Yuri
    if (etapaUser.etapa === 'troca_setor_passo2') {
        const novaMatricula = texto.replace(/\D/g, '');
        if (!novaMatricula) return await client.sendMessage(numero, '❗ Digite apenas números para a matrícula.');

        const telefoneLimpo = numero.includes('@') ? numero.split('@')[0] : numero;
        const novoSetor = etapaUser.novoSetor;

        if (!fs.existsSync(CAMINHO_SOLICITACOES)) escreverJson(CAMINHO_SOLICITACOES, {});
        
        const solicitacoes = lerJson(CAMINHO_SOLICITACOES, {});
        solicitacoes[telefoneLimpo] = {
            telefone: telefoneLimpo,
            id_whatsapp: numero,
            nome: representante.Nome || representante.nome || 'Representante', // Garante que o nome não fique undefined
            setor_novo: novoSetor,
            matricula_nova: novaMatricula,
            data: new Date().toLocaleString('pt-BR')
        };
        
        escreverJson(CAMINHO_SOLICITACOES, solicitacoes);

        await client.sendMessage(numero, `✅ Solicitação enviada!\n\nPedido para o setor *${novoSetor}* com a matrícula *${novaMatricula}* foi encaminhado para aprovação.\nAguarde a confirmação automática.`);

        const msgAdmin = `🚨 *SOLICITAÇÃO DE SETOR/MATRÍCULA*\n\n👤 *Nome:* ${solicitacoes[telefoneLimpo].nome}\n📱 *Contato:* ${telefoneLimpo}\n🔄 *Setor:* ${novoSetor}\n🔑 *Matrícula:* ${novaMatricula}\n\nPara aprovar, responda:\n*/aprovar ${telefoneLimpo}*`;
        await client.sendMessage(LID_YURI, msgAdmin);

        delete etapas[numero];
        escreverJson(ETAPAS_PATH, etapas);
    }
}

/**
 * FLUXO DE APROVAÇÃO (ADMIN/YURI)
 */
async function aprovarTroca(client, message, telefoneAlvo) {
    const numeroAdmin = message.from;
    console.log(`\n[APROVAÇÃO] Iniciando para: ${telefoneAlvo}`);

    const solicitacoes = lerJson(CAMINHO_SOLICITACOES, {});
    const pedido = solicitacoes[telefoneAlvo];

    if (!pedido) {
        return await client.sendMessage(numeroAdmin, `❌ Não achei nenhum pedido pendente para: ${telefoneAlvo}`);
    }

    try {
        // --- 1. Atualiza JSON Interno de Senhas ---
        const senhas = lerJson(CAMINHO_SENHAS, []);
        const idxS = senhas.findIndex(s => s.setor === pedido.setor_novo);
        
        if (idxS > -1) {
            senhas[idxS].senha = pedido.matricula_nova;
            senhas[idxS].nome = pedido.nome; 
        } else {
            senhas.push({ setor: pedido.setor_novo, nome: pedido.nome, senha: pedido.matricula_nova });
        }
        escreverJson(CAMINHO_SENHAS, senhas);

        // --- 2. Atualiza Representantes.json ---
        console.log(`[APROVAÇÃO] [2/4] Atualizando representantes.json...`);
        let representantes = lerJson(CAMINHO_REPRESENTANTES, []);
        
        // CORREÇÃO: Busca pela chave "setor" no seu JSON original
        const idxR = representantes.findIndex(r => r.setor === pedido.setor_novo);

        if (idxR > -1) {
            representantes[idxR].telefone = pedido.telefone;
            representantes[idxR].lid = pedido.id_whatsapp;
            representantes[idxR].matricula = Number(pedido.matricula_nova);
            delete representantes[idxR].Nome; // Remove a chave Nome (maiúsculo conforme seu arquivo)
            
            escreverJson(CAMINHO_REPRESENTANTES, representantes);
            console.log(`[APROVAÇÃO] representantes.json atualizado com sucesso.`);
        } else {
            console.log(`[APROVAÇÃO] ⚠️ Setor ${pedido.setor_novo} não encontrado no arquivo representantes.json`);
        }

        // --- 3. Grava o arquivo CSV na Rede (Formato Excel) ---
        const dataExcel = new Date().toLocaleString('pt-BR').replace(',', ''); 
        const linhaCsv = `${pedido.setor_novo};${pedido.matricula_nova};${dataExcel}\n`;
        
        try {
            fs.appendFileSync(CAMINHO_SYNC_CSV, linhaCsv, 'utf-8');
        } catch (errCsv) {
            await client.sendMessage(numeroAdmin, `⚠️ *Aviso:* Erro ao gravar o CSV na rede.`);
        }

        // --- 4. Limpeza e Finalização ---
        delete solicitacoes[telefoneAlvo];
        escreverJson(CAMINHO_SOLICITACOES, solicitacoes);

        await client.sendMessage(numeroAdmin, `✅ *Aprovado com Sucesso!*`);
        
        // Mensagem final informando sobre o prazo do Excel
        await client.sendMessage(pedido.id_whatsapp, `🎉 *Mudança Aprovada!*\n\nSeu setor foi atualizado para *${pedido.setor_novo}* e sua matrícula para o bot agora é *${pedido.matricula_nova}*.\n\n⚠️ *Nota:* Os dados já estão ativos no Bot, porém no arquivo de Excel (Planificador) a alteração constará apenas *amanhã*.`);

        console.log(`[APROVAÇÃO] Processo 100% concluído.\n`);

    } catch (error) {
        console.error(`[APROVAÇÃO] ❌ ERRO:`, error);
        await client.sendMessage(numeroAdmin, `❌ Erro crítico no fluxo de aprovação.`);
    }
}

module.exports = { processarTroca, aprovarTroca };