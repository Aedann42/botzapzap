/**
 * ===========================================================================
 * ⚙️ REGRAS DE NEGÓCIO - ANÁLISE DE ROTAS E ENTREGAS ⚙️
 * ===========================================================================
 */

const REGRAS_FATURAMENTO = {
    dias_1: 0.00,           // Mínimo para ter 1 dia de entrega (R$ 0 a 999.99)
    dias_2: 1000.00,        // Mínimo para ter 2 dias de entrega (R$ 1.000 a 19.999.99)
    dias_3_ou_mais: 20000.00 // Mínimo para ter 3 ou mais dias (A partir de R$ 20.000)
};

const REGRAS_DISTANCIA = {
    limite_metros: 300      // Distância máxima permitida (em metros) do PDV candidato
};

const REGRAS_TEMPO = {
    dias_bloqueio_alteracao: 30 // Impede nova solicitação se houve outra neste período
};

module.exports = {
    REGRAS_FATURAMENTO,
    REGRAS_DISTANCIA,
    REGRAS_TEMPO
};