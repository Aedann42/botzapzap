const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const BASE_PDVS_PATH = path.join(__dirname, '..', '..', 'data', 'Base_PDVs_Atualizada.csv');
const PEDIDOS_PATH = 'C:\\botzapzap\\botzapzap\\data\\pedidosDataDeEntrega.csv';
const PASTA_BANCO_DADOS = 'C:\\botzapzap\\botzapzap\\data\\hist';

// --- FUNÇÕES AUXILIARES DE FORMATAÇÃO ---
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

// --- FUNÇÕES DE LEITURA BLINDADA ---
function lerBaseCSV() {
    try {
        const conteudo = fs.readFileSync(BASE_PDVS_PATH, 'utf-8').replace(/^\uFEFF/, '');
        const linhas = conteudo.split(/\r?\n/).filter(l => l.trim() !== '');
        const separador = linhas[0].includes(';') ? ';' : ',';
        
        // 🔥 A MÁGICA AQUI: Forçamos o nosso próprio cabeçalho perfeito.
        // O código ignora os erros de codificação (Municpio) e as colunas vazias (;;) do arquivo original.
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
        console.error(`🚨 [ERRO CRÍTICO] Arquivo de PDVs não encontrado: ${BASE_PDVS_PATH}`);
        return null;
    }
}

async function obterFaturamentoMesPassado(chave) {
    const mesPassado = obterAbaMesPassado();
    const arquivoCsv = path.join(PASTA_BANCO_DADOS, `2026_${mesPassado}.csv`);
    let faturamento = 0;

    if (!fs.existsSync(arquivoCsv)) return { faturamento: 0, mes: mesPassado, erro: true };

    return new Promise((resolve) => {
        fs.createReadStream(arquivoCsv)
            .pipe(csv({ separator: ';', mapHeaders: ({ header }) => header.trim().replace(/^[\u200B\u200C\u200D\u200E\u200F\uFEFF]/,"") }))
            .on('data', (linha) => {
                if (String(linha['Chave'] || '').trim() === chave) {
                    const strValor = String(linha['Total Venda'] || '0').replace(',', '.');
                    faturamento += parseFloat(strValor) || 0;
                }
            })
            .on('end', () => resolve({ faturamento, mes: mesPassado, erro: false }))
            .on('error', () => resolve({ faturamento: 0, mes: mesPassado, erro: true }));
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
    } catch (e) { return "Erro ao buscar endereço"; }
}

// =========================================================
// NOVAS FUNÇÕES: ESTATÍSTICAS E ROTA
// =========================================================

async function obterEstatisticasPdv(nbBusca) {
    const pdvData = lerBaseCSV();
    if (!pdvData) return { erro: "❌ *Erro de Sistema:* A base de clientes não foi encontrada." };
    
    let pdvBase = pdvData.find(p => p['Chave'] === nbBusca);
    if (!pdvBase) return { erro: `❌ O NB *${nbBusca}* não foi encontrado na base atual.` };

    const bairro = pdvBase['BAIRRO'] || 'Desconhecido';
    const municipio = pdvBase['Municipio'] || 'Desconhecido'; // Atualizado sem acento
    const fantasia = pdvBase['FANTASIA'] || 'Não Cadastrado';

    const prefixoFilial = nbBusca.split('_')[0] + '_';

    const diasDaSemana = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
    let diasAtuais = [];
    diasDaSemana.forEach(d => { if (pdvBase[d] === '1') diasAtuais.push(d); });

    const historico = await obterFaturamentoMesPassado(nbBusca);

    const vizinhos = pdvData.filter(p => 
        p['BAIRRO'] === bairro && 
        p['Municipio'] === municipio && // Atualizado sem acento
        p['Chave'].startsWith(prefixoFilial)
    );

    const contagemDias = { SEG: 0, TER: 0, QUA: 0, QUI: 0, SEX: 0, SAB: 0 };
    
    vizinhos.forEach(v => {
        if (v['SEG'] === '1') contagemDias.SEG++;
        if (v['TER'] === '1') contagemDias.TER++;
        if (v['QUA'] === '1') contagemDias.QUA++;
        if (v['QUI'] === '1') contagemDias.QUI++;
        if (v['SEX'] === '1') contagemDias.SEX++;
        if (v['SAB'] === '1') contagemDias.SAB++;
    });

    return { sucesso: true, bairro, municipio, contagemDias, fantasia, diasAtuais, historico };
}

async function processarAnaliseRota(nbBusca, diaEscolhido) {
    const pdvData = lerBaseCSV();
    if (!pdvData) return { erro: "❌ *Erro de Sistema:* A base de clientes não foi encontrada." };
    
    let pdvBase = pdvData.find(p => p['Chave'] === nbBusca);
    // Alterado para 'Latitude'
    if (!pdvBase || !pdvBase['Latitude']) return { erro: `❌ O NB *${nbBusca}* não foi encontrado ou não possui coordenadas.` };

    const baseLat = parseFloat(pdvBase['Latitude'].replace(',', '.'));
    const baseLng = parseFloat(pdvBase['Longitude'].replace(',', '.'));

    const prefixoFilial = nbBusca.split('_')[0] + '_';

    const diasDaSemana = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
    let diasAtuais = [];
    diasDaSemana.forEach(d => { if (pdvBase[d] === '1') diasAtuais.push(d); });

    const historico = await obterFaturamentoMesPassado(nbBusca);

    let pdvsDoDia = pdvData.filter(p => 
        p[diaEscolhido] === '1' && 
        p['Chave'] !== nbBusca && 
        p['Latitude'] && // Atualizado
        p['Chave'].startsWith(prefixoFilial)
    );
    
    if (pdvsDoDia.length === 0) return { erro: `❌ Nenhum outro PDV da mesma operação possui entrega marcada para ${diaEscolhido} na base de dados.` };

    pdvsDoDia.forEach(p => {
        p.distReta = calcHaversine(baseLat, baseLng, parseFloat(p['Latitude'].replace(',', '.')), parseFloat(p['Longitude'].replace(',', '.')));
    });

    pdvsDoDia.sort((a, b) => a.distReta - b.distReta);
    const top5 = pdvsDoDia.slice(0, 5);

    let vencedor = null;
    let menorDist = Infinity;

    for (let c of top5) {
        const cLat = parseFloat(c['Latitude'].replace(',', '.'));
        const cLng = parseFloat(c['Longitude'].replace(',', '.'));
        c.distRuas = c.distReta; 
        
        try {
            const resOsrm = await fetch(`https://router.project-osrm.org/route/v1/driving/${baseLng},${baseLat};${cLng},${cLat}?overview=false`);
            const dataOsrm = await resOsrm.json();
            if (dataOsrm.routes && dataOsrm.routes.length > 0) {
                c.distRuas = dataOsrm.routes[0].distance;
            }
        } catch (e) {}

        if (c.distRuas < menorDist) {
            menorDist = c.distRuas;
            vencedor = c;
        }
    }

    if (!vencedor) return { erro: "❌ Não foi possível traçar uma rota viária." };

    const vLat = parseFloat(vencedor['Latitude'].replace(',', '.'));
    const vLng = parseFloat(vencedor['Longitude'].replace(',', '.'));
    vencedor.endereco = await obterEndereco(vLat, vLng);

    // Criamos variáveis virtuais apenas para garantir a compatibilidade com o menuHandler atual
    vencedor['Check In - Latitude'] = vencedor['Latitude'];
    vencedor['Check In - Longitude'] = vencedor['Longitude'];

    return { 
        sucesso: true, 
        origem: { chave: nbBusca, lat: baseLat, lng: baseLng, dias: diasAtuais.join(', ') || 'Nenhum', faturamento: historico.faturamento, mesHisto: historico.mes },
        vencedor: vencedor,
        candidatos: top5.filter(c => c['Chave'] !== vencedor['Chave']) 
    };
}

function salvarPedidoEntrega(chave, setor, dia, chaveMaisProximo, distancia, lat, lng, faturamento) {
    const dataAtual = new Date().toLocaleString('pt-BR');
    const linha = `${chave};${setor};${dia};${dataAtual};${chaveMaisProximo};${distancia};${lat};${lng};${faturamento}\n`;
    
    if (!fs.existsSync(PEDIDOS_PATH)) {
        fs.writeFileSync(PEDIDOS_PATH, "Chave;Setor;DiaSolicitado;DataSolicitacao;ChaveMaisProximo;DistanciaMetros;LatMaisProximo;LngMaisProximo;FaturamentoMesPassado\n");
    }
    fs.appendFileSync(PEDIDOS_PATH, linha);
}

module.exports = {
    processarAnaliseRota,
    salvarPedidoEntrega,
    formatarMoeda,
    obterEstatisticasPdv
};