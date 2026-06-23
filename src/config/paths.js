// src/config/paths.js
const path = require('path');
const os = require('os');

module.exports = {
    // Arquivos Locais de Dados
    BASE_PDVS: 'C:\\botzapzap\\botzapzap\\data\\Base_PDVs_Atualizada.csv',
    PEDIDOS_CSV: 'C:\\botzapzap\\botzapzap\\data\\pedidosDataDeEntrega.csv',
    PASTA_HISTORICO: 'C:\\botzapzap\\botzapzap\\data\\hist',
    VAGAS_PJF_JSON: 'C:\\botzapzap\\botzapzap\\data\\pjfcargaedescarga.json',
    
    // Outputs de Carga
    OUTPUT_DOCS_LOCAL: path.join(os.homedir(), 'Documents', 'pedidosDataDeEntrega.csv'),
    OUTPUT_REDE_APR: '\\\\revenda.local\\VENDAS\\APR\\pedidosDataDeEntrega.csv',
    
    // Logs e Controle de Estado
    ETAPAS_JSON: path.join(__dirname, '..', '..', 'data', 'etapas.json'), // Ajuste conforme seu projeto
    LOG_USO_JSON: path.join(__dirname, '..', '..', 'logs', 'log_uso.json'),
    LOG_ROTAS_30DIAS: path.join(__dirname, '..', '..', 'utils', 'rotasAprovadasLog.json'),
    
    // Caminhos de Rede para Validação de Relatórios
    REDE_PDF_GIRO: String.raw`\\revenda.local\publico\Arquivos\VENDAS\METAS E PROJETOS\2026\6 - JUNHO\_GERADOR PDF\ACOMPS\411\411_GiroEquipamentos.pdf`,
    REDE_IMG_MATINAL: String.raw`\\revenda.local\publico\Arquivos\VENDAS\METAS E PROJETOS\2026\6 - JUNHO\_GERADOR PDF\IMAGENS\GV4\MATINAL_GV4_page_1.jpg`
};