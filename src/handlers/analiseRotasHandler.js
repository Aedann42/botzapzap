const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// Cores para o terminal
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

const BASE_PDVS_PATH = path.join(__dirname, '..', '..', 'data', 'Base_PDVs_Atualizada.csv');
const PEDIDOS_PATH = 'C:\\botzapzap\\botzapzap\\data\\pedidosDataDeEntrega.csv';
const PASTA_BANCO_DADOS = 'C:\\botzapzap\\botzapzap\\data\\hist';

// --- FUNÇÕES AUXILIARES ---
function formatarMoeda(valor) {
    if (typeof valor !== 'number' || isNaN(valor)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function obterAbaMesPassado() {
    const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    let mesPassado = new Date().getMonth() - 1;
    if (mesPassado < 0) mesPassado = 11; 
    return meses[mesPassado];
}

function lerBaseCSV() {
    try {
        console.log(`${BLUE}--- Lendo base de PDVs... ---${RESET}`);
        const conteudo = fs.readFileSync(BASE_PDVS_PATH, 'utf-8').replace(/^\uFEFF/, '');
        const linhas = conteudo.split(/\r?\n/).filter(l => l.trim() !== '');
        const separador = linhas[0].includes(';') ? ';' : ',';
        
        const headers = [
            'Chave', 'UNB', 'Cod PDV', 'CPF/CNPJ', 'FANTASIA', 'ENDERECO', 'BAIRRO', 'Municipio', 
            'Freq.Visita', 'SETOR', 'DIA', 'KM CASA ROTA', 'CASA REVENDA', 'KM TT NOVO', 
            'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'TT', 'Latitude', 'Longitude'
        ];

        return linhas.slice(1).map(linha => {
            const valores = linha.split(separador);
            let obj = {};
            headers.forEach((h, i) => { obj[h] = valores[i] ? valores[i].trim() : ''; });
            return obj;
        });
    } catch (error) {
        console.error(`${RED}🚨 [ERRO CRÍTICO] Arquivo de PDVs não encontrado: ${BASE_PDVS_PATH}${RESET}`);
        return null;
    }
}

async function obterFaturamentoMesPassado(chave) {
    const mesPassado = obterAbaMesPassado();
    const arquivoCsv = path.join(PASTA_BANCO_DADOS, `2026_${mesPassado}.csv`);
    
    if (!fs.existsSync(arquivoCsv)) {
        console.log(`${YELLOW}⚠️ Histórico de faturamento não encontrado para ${mesPassado}.${RESET}`);
        return { faturamento: 0, mes: mesPassado, erro: true };
    }

    return new Promise((resolve) => {
        let faturamento = 0;
        fs.createReadStream(arquivoCsv)
            .pipe(csv({ separator: ';', mapHeaders: ({ header }) => header.trim().replace(/^[\u200B\u200C\u200D\u200E\u200F\uFEFF]/,"") }))
            .on('data', (linha) => {
                if (String(linha['Chave'] || '').trim() === chave) {
                    const strValor = String(linha['Total Venda'] || '0').replace(',', '.');
                    faturamento += parseFloat(strValor) || 0;
                }
            })
            .on('end', () => resolve({ faturamento, mes: mesPassado, erro: false }))
            .on('error', (err) => {
                console.error(`${RED}❌ Erro ao ler CSV de faturamento: ${err.message}${RESET}`);
                resolve({ faturamento: 0, mes: mesPassado, erro: true });
            });
    });
}

function calcHaversine(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function obterEndereco(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
        const data = await res.json();
        if (data && data.address) {
            const rua = data.address.road || data.address.pedestrian || "Rua desconhecida";
            const num = data.address.house_number || "S/N";
            return `${rua}, ${num}`;
        }
        return "Endereço não encontrado";
    } catch (e) { 
        console.error(`${RED}❌ Erro Nominatim: ${e.message}${RESET}`);
        return "Erro ao buscar endereço"; 
    }
}

// =========================================================
// ANALISE DE ROTA COM LOGS DETALHADOS
// =========================================================

async function processarAnaliseRota(nbBusca, diaEscolhido) {
    console.log(`${BLUE}--- Iniciando Análise de Rota para NB: ${nbBusca} (${diaEscolhido}) ---${RESET}`);
    
    const pdvData = lerBaseCSV();
    if (!pdvData) return { erro: "❌ *Erro de Sistema:* A base de clientes (CSV) não pôde ser carregada pelo servidor." };
    
    let pdvBase = pdvData.find(p => p['Chave'] === nbBusca);

    if (!pdvBase) {
        console.log(`${RED}❌ PDV ${nbBusca} não existe no CSV.${RESET}`);
        return { erro: `❌ O NB *${nbBusca}* não foi encontrado na base de dados.` };
    }

    if (!pdvBase['Latitude'] || !pdvBase['Longitude']) {
        console.log(`${RED}❌ PDV ${nbBusca} sem coordenadas.${RESET}`);
        return { erro: `❌ O PDV *${nbBusca}* está cadastrado, mas não possui Latitude/Longitude para traçar rota.` };
    }

    const baseLat = parseFloat(pdvBase['Latitude'].replace(',', '.'));
    const baseLng = parseFloat(pdvBase['Longitude'].replace(',', '.'));
    const prefixoFilial = nbBusca.split('_')[0] + '_';

    // Filtrar PDVs do dia
    let pdvsDoDia = pdvData.filter(p => 
        p[diaEscolhido] === '1' && 
        p['Chave'] !== nbBusca && 
        p['Latitude'] && 
        p['Chave'].startsWith(prefixoFilial)
    );
    
    if (pdvsDoDia.length === 0) {
        console.log(`${YELLOW}⚠️ Nenhum PDV encontrado para o dia ${diaEscolhido}${RESET}`);
        return { erro: `❌ Não existem outros clientes da sua operação com entrega programada para ${diaEscolhido}.` };
    }

    console.log(`${GREEN}✅ Encontrados ${pdvsDoDia.length} candidatos potenciais no dia.${RESET}`);

    // Cálculo Haversine (Distância em linha reta)
    pdvsDoDia.forEach(p => {
        p.distReta = calcHaversine(baseLat, baseLng, parseFloat(p['Latitude'].replace(',', '.')), parseFloat(p['Longitude'].replace(',', '.')));
    });

    pdvsDoDia.sort((a, b) => a.distReta - b.distReta);
    const top5 = pdvsDoDia.slice(0, 5);

    let vencedor = null;
    let menorDist = Infinity;
    let errosOSRM = 0;

    console.log(`${BLUE}--- Consultando API de Rotas (OSRM) para os 5 mais próximos ---${RESET}`);

    for (let c of top5) {
        const cLat = parseFloat(c['Latitude'].replace(',', '.'));
        const cLng = parseFloat(c['Longitude'].replace(',', '.'));
        c.distRuas = c.distReta; 
        
        try {
            const resOsrm = await fetch(`https://router.project-osrm.org/route/v1/driving/${baseLng},${baseLat};${cLng},${cLat}?overview=false`);
            
            if (!resOsrm.ok) throw new Error(`HTTP ${resOsrm.status}`);
            
            const dataOsrm = await resOsrm.json();
            
            if (dataOsrm.routes && dataOsrm.routes.length > 0) {
                c.distRuas = dataOsrm.routes[0].distance;
                console.log(`${GREEN}📍 Sucesso: ${c['Chave']} está a ${(c.distRuas/1000).toFixed(2)}km por ruas.${RESET}`);
            } else {
                console.log(`${YELLOW}⚠️ OSRM não encontrou caminho para ${c['Chave']}.${RESET}`);
            }
        } catch (e) {
            errosOSRM++;
            console.log(`${RED}⚠️ Falha na API OSRM para o PDV ${c['Chave']}: ${e.message}${RESET}`);
        }

        if (c.distRuas < menorDist) {
            menorDist = c.distRuas;
            vencedor = c;
        }
    }

    if (!vencedor) {
        return { erro: "❌ Erro ao calcular rota: O serviço de mapas não respondeu e não há dados de GPS válidos." };
    }

    if (errosOSRM === top5.length) {
        console.log(`${YELLOW}⚠️ Todos os cálculos foram baseados em 'Linha Reta' pois a API de estradas falhou.${RESET}`);
    }

    const vLat = parseFloat(vencedor['Latitude'].replace(',', '.'));
    const vLng = parseFloat(vencedor['Longitude'].replace(',', '.'));
    vencedor.endereco = await obterEndereco(vLat, vLng);

    vencedor['Check In - Latitude'] = vencedor['Latitude'];
    vencedor['Check In - Longitude'] = vencedor['Longitude'];

    const historico = await obterFaturamentoMesPassado(nbBusca);
    let diasAtuais = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'].filter(d => pdvBase[d] === '1');

    console.log(`${GREEN}🏁 Processo concluído. Vencedor: ${vencedor['Chave']}${RESET}`);

    return { 
        sucesso: true, 
        origem: { chave: nbBusca, lat: baseLat, lng: baseLng, dias: diasAtuais.join(', ') || 'Nenhum', faturamento: historico.faturamento, mesHisto: historico.mes },
        vencedor: vencedor,
        candidatos: top5.filter(c => c['Chave'] !== vencedor['Chave']) 
    };
}

// Funções restantes (obterEstatisticasPdv, salvarPedidoEntrega) mantidas com a mesma lógica...
async function obterEstatisticasPdv(nbBusca) {
    const pdvData = lerBaseCSV();
    if (!pdvData) return { erro: "❌ *Erro de Sistema:* A base de clientes não foi encontrada." };
    
    let pdvBase = pdvData.find(p => p['Chave'] === nbBusca);
    if (!pdvBase) return { erro: `❌ O NB *${nbBusca}* não foi encontrado na base atual.` };

    const bairro = pdvBase['BAIRRO'] || 'Desconhecido';
    const municipio = pdvBase['Municipio'] || 'Desconhecido';
    const fantasia = pdvBase['FANTASIA'] || 'Não Cadastrado';
    const prefixoFilial = nbBusca.split('_')[0] + '_';

    const diasDaSemana = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
    let diasAtuais = diasDaSemana.filter(d => pdvBase[d] === '1');

    const historico = await obterFaturamentoMesPassado(nbBusca);

    const vizinhos = pdvData.filter(p => 
        p['BAIRRO'] === bairro && 
        p['Municipio'] === municipio && 
        p['Chave'].startsWith(prefixoFilial)
    );

    const contagemDias = { SEG: 0, TER: 0, QUA: 0, QUI: 0, SEX: 0, SAB: 0 };
    vizinhos.forEach(v => {
        diasDaSemana.forEach(d => { if (v[d] === '1') contagemDias[d]++; });
    });

    return { sucesso: true, bairro, municipio, contagemDias, fantasia, diasAtuais, historico };
}

function salvarPedidoEntrega(chave, setor, dia, chaveMaisProximo, distancia, lat, lng, faturamento) {
    const dataAtual = new Date().toLocaleString('pt-BR');
    const linha = `${chave};${setor};${dia};${dataAtual};${chaveMaisProximo};${distancia};${lat};${lng};${faturamento}\n`;
    
    try {
        if (!fs.existsSync(PEDIDOS_PATH)) {
            fs.writeFileSync(PEDIDOS_PATH, "Chave;Setor;DiaSolicitado;DataSolicitacao;ChaveMaisProximo;DistanciaMetros;LatMaisProximo;LngMaisProximo;FaturamentoMesPassado\n");
        }
        fs.appendFileSync(PEDIDOS_PATH, linha);
        console.log(`${GREEN}💾 Pedido salvo com sucesso em CSV.${RESET}`);
    } catch (e) {
        console.error(`${RED}❌ Erro ao salvar arquivo de pedido: ${e.message}${RESET}`);
    }
}

module.exports = {
    processarAnaliseRota,
    salvarPedidoEntrega,
    formatarMoeda,
    obterEstatisticasPdv
};