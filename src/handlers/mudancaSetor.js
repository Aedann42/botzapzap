const fs = require('fs');
const path = require('path');
const { lerJson, escreverJson, ETAPAS_PATH } = require('../utils/dataHandler.js');

const CAMINHO_SOLICITACOES = path.join(process.cwd(), 'data', 'solicitacoes.json');
const CAMINHO_SENHAS = path.join(process.cwd(), 'data', 'senhaRemuneracao.json');

// 🔥 Usando String.raw para o Node não cortar as barras invertidas da rede!
const CAMINHO_SYNC_CSV = String.raw`\\VSRV-DC01\Arquivos\VENDAS\METAS E PROJETOS\2026\3 - MARÇO\_GERADOR PDF\atualizacoes_feristas.csv`;
const LID_YURI = '178520986747062@lid';

async function processarTroca(client, message, representante) {
    const numero = message.from;
    const texto = message.body.trim();
    let etapas = lerJson(ETAPAS_PATH, {});
    const etapaUser = etapas[numero];

    console.log(`\n[MUDANÇA SETOR] -----------------------------------------`);
    console.log(`[MUDANÇA SETOR] Usuário ${numero} entrou na etapa: ${etapaUser.etapa}`);

    if (['cancelar', 'sair'].includes(texto.toLowerCase())) {
        console.log(`[MUDANÇA SETOR] Cancelado pelo usuário.`);
        delete etapas[numero];
        escreverJson(ETAPAS_PATH, etapas);
        await client.sendMessage(numero, '🚫 Alteração de setor/matrícula cancelada.');
        return;
    }

    // PASSO 1: Recebe o Setor e pede a Matrícula
    if (etapaUser.etapa === 'troca_setor_passo1') {
        const novoSetor = texto.replace(/\D/g, '');
        console.log(`[MUDANÇA SETOR] Passo 1: Recebeu setor -> ${novoSetor}`);
        
        if (!novoSetor) return await client.sendMessage(numero, '❗ Digite apenas os números do setor.');
        
        etapas[numero] = { etapa: 'troca_setor_passo2', novoSetor: novoSetor };
        escreverJson(ETAPAS_PATH, etapas);
        await client.sendMessage(numero, `Você vai assumir o setor *${novoSetor}*.\nAgora, digite sua *Matrícula* nova para vincular a este setor:`);
        return;
    }

    // PASSO 2: Recebe a Matrícula, salva e avisa o admin
    if (etapaUser.etapa === 'troca_setor_passo2') {
        const novaMatricula = texto.replace(/\D/g, '');
        console.log(`[MUDANÇA SETOR] Passo 2: Recebeu matrícula -> ${novaMatricula}`);

        if (!novaMatricula) return await client.sendMessage(numero, '❗ Digite apenas números para a matrícula.');

        const telefoneLimpo = numero.includes('@') ? numero.split('@')[0] : numero;
        const novoSetor = etapaUser.novoSetor;

        if (!fs.existsSync(CAMINHO_SOLICITACOES)) {
            console.log(`[MUDANÇA SETOR] Criando arquivo solicitacoes.json pois não existia.`);
            escreverJson(CAMINHO_SOLICITACOES, {});
        }
        
        const solicitacoes = lerJson(CAMINHO_SOLICITACOES, {});

        solicitacoes[telefoneLimpo] = {
            telefone: telefoneLimpo,
            id_whatsapp: numero,
            nome: representante.nome,
            setor_novo: novoSetor,
            matricula_nova: novaMatricula,
            data: new Date().toLocaleString('pt-BR')
        };
        
        console.log(`[MUDANÇA SETOR] Salvando solicitação no JSON:`, solicitacoes[telefoneLimpo]);
        escreverJson(CAMINHO_SOLICITACOES, solicitacoes);

        await client.sendMessage(numero, `✅ Solicitação enviada!\n\nPedido para o setor *${novoSetor}* com a matrícula *${novaMatricula}* foi encaminhado para aprovação do APR.\nAguarde a confirmação automática por aqui.`);

        const msgAdmin = `🚨 *SOLICITAÇÃO DE SETOR/MATRÍCULA*\n\n👤 *Nome:* ${representante.nome}\n📱 *Contato:* ${telefoneLimpo}\n🔄 *Setor:* ${novoSetor}\n🔑 *Matrícula:* ${novaMatricula}\n\nPara aprovar, responda:\n*/aprovar ${telefoneLimpo}*`;
        await client.sendMessage(LID_YURI, msgAdmin);

        delete etapas[numero];
        escreverJson(ETAPAS_PATH, etapas);
        console.log(`[MUDANÇA SETOR] Fluxo do usuário finalizado com sucesso.\n`);
    }
}

// Função para o Yuri aprovar e o bot injetar os dados
async function aprovarTroca(client, message, telefoneAlvo) {
    const numeroAdmin = message.from;
    console.log(`\n[APROVAÇÃO] =============================================`);
    console.log(`[APROVAÇÃO] Comando de aprovação acionado por: ${numeroAdmin}`);
    console.log(`[APROVAÇÃO] Telefone alvo para aprovar: ${telefoneAlvo}`);

    const solicitacoes = lerJson(CAMINHO_SOLICITACOES, {});
    const pedido = solicitacoes[telefoneAlvo];

    if (!pedido) {
        console.log(`[APROVAÇÃO] ❌ ERRO: Nenhuma solicitação encontrada no JSON para ${telefoneAlvo}`);
        return await client.sendMessage(numeroAdmin, `❌ Não achei nenhum pedido pendente para: ${telefoneAlvo}`);
    }

    console.log(`[APROVAÇÃO] Pedido localizado: ${pedido.nome} | Novo Setor: ${pedido.setor_novo} | Nova Mat: ${pedido.matricula_nova}`);

    try {
        // --- 1. Atualiza JSON Interno de Senhas ---
        console.log(`[APROVAÇÃO] [1/3] Lendo arquivo senhaRemuneracao.json...`);
        const senhas = lerJson(CAMINHO_SENHAS, []);
        const indexSetor = senhas.findIndex(s => s.setor === pedido.setor_novo);
        
        if (indexSetor > -1) {
            console.log(`[APROVAÇÃO] Setor ${pedido.setor_novo} já existia. Substituindo a matrícula antiga pela nova...`);
            senhas[indexSetor].senha = pedido.matricula_nova;
            senhas[indexSetor].nome = pedido.nome; 
        } else {
            console.log(`[APROVAÇÃO] Setor ${pedido.setor_novo} não existia. Adicionando novo item...`);
            senhas.push({ setor: pedido.setor_novo, nome: pedido.nome, senha: pedido.matricula_nova });
        }
        
        escreverJson(CAMINHO_SENHAS, senhas);
        console.log(`[APROVAÇÃO] Arquivo senhaRemuneracao.json atualizado com sucesso!`);

        // --- 2. Grava o arquivo CSV na Rede para o Excel ---
        console.log(`[APROVAÇÃO] [2/3] Tentando gravar o CSV na rede. Caminho: ${CAMINHO_SYNC_CSV}`);
        const linhaCsv = `${pedido.setor_novo};${pedido.nome};${pedido.matricula_nova}\n`;
        
        try {
            fs.appendFileSync(CAMINHO_SYNC_CSV, linhaCsv, 'utf-8');
            console.log(`[APROVAÇÃO] O CSV foi gravado na rede com sucesso!`);
        } catch (errCsv) {
            console.error(`[APROVAÇÃO] ❌ FALHA GRAVE AO ESCREVER CSV NA REDE! O caminho está acessível?`);
            console.error(errCsv);
            // Avisamos no WhatsApp para você saber que deu erro exatamente aqui
            await client.sendMessage(numeroAdmin, `⚠️ *Aviso Parcial:* Atualizei no sistema, mas não consegui criar o arquivo CSV na rede. Verifique os logs.`);
        }

        // --- 3. Limpa a fila de Pedidos ---
        console.log(`[APROVAÇÃO] [3/3] Removendo o pedido aprovado do solicitacoes.json...`);
        delete solicitacoes[telefoneAlvo];
        escreverJson(CAMINHO_SOLICITACOES, solicitacoes);
        console.log(`[APROVAÇÃO] Limpeza concluída.`);

        // Mensagens finais
        await client.sendMessage(numeroAdmin, `✅ *Aprovado!* Acesso liberado no Bot e exportado para o arquivo CSV do Excel.`);
        await client.sendMessage(pedido.id_whatsapp, `🎉 *Mudança Aprovada!*\n\nSeu setor foi atualizado para *${pedido.setor_novo}* e matrícula *${pedido.matricula_nova}*.\nVocê já pode consultar seu acompanhamento (Opção 4).`);
        console.log(`[APROVAÇÃO] Processo de aprovação 100% concluído.\n=========================================================\n`);

    } catch (error) {
        console.error(`[APROVAÇÃO] ❌ ERRO DESCONHECIDO NO FLUXO:`, error);
        await client.sendMessage(numeroAdmin, `❌ Erro ao processar a aprovação. Olhe o painel.`);
    }
}

module.exports = { processarTroca, aprovarTroca };