/**
 * Simula comportamento humano sorteando entre Digitar ou Gravar Áudio.
 * @param {object} message - O objeto da mensagem original do WhatsApp.
 * @param {string} modo - 'typing', 'recording' ou 'aleatorio' (padrão).
 */
const simularHumano = async (message, modo = 'aleatorio') => {
    try {
        const chat = await message.getChat();
        
        // 1. Sorteio da Ação
        let acaoFinal = modo;
        if (modo === 'aleatorio') {
            acaoFinal = Math.random() > 0.5 ? 'typing' : 'recording';
        }

        // 2. Definição de Tempos Aleatórios (Mantidos conforme sua preferência)
        // Áudio: 3s a 6s | Digitação: 1.5s a 4s
        const tempoMin = acaoFinal === 'recording' ? 3000 : 1500;
        const tempoMax = acaoFinal === 'recording' ? 6000 : 4000;
        
        const delay = Math.floor(Math.random() * (tempoMax - tempoMin + 1)) + tempoMin;

        // 3. Execução do Estado (Ligar o "interruptor")
        if (acaoFinal === 'recording') {
            await chat.sendStateRecording();
        } else {
            await chat.sendStateTyping();
        }

        // 4. LÓGICA TURBO: Em vez de dar 'await' e travar o bot agora, 
        // criamos uma promessa que representa esse tempo.
        const promessaDoTempoHumano = new Promise(resolve => setTimeout(resolve, delay));

        // 5. Retornamos uma função que "limpa" o estado.
        // O bot pode chamar isso quando acabar de enviar o arquivo.
        return async () => {
            try {
                // Se o envio do arquivo foi mais rápido que o tempo sorteado, 
                // ele espera o restinho do tempo aqui para manter a segurança do Meta.
                await promessaDoTempoHumano; 
                await chat.clearState();
            } catch (e) {}
        };
        
    } catch (error) {
        console.log('⚠️ [AVISO] Falha ao simular ação humana:', error.message);
        return async () => {}; // Retorna função vazia para não quebrar o fluxo
    }
};

module.exports = simularHumano;