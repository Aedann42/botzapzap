const fs = require('fs');
const path = require('path');
const os = require('os');
const csv = require('csv-parser');
const proj4 = require('proj4');

// Definindo o sistema de coordenadas da Prefeitura (UTM 23S) para Lat/Lng (WGS84)
proj4.defs("EPSG:31983", "+proj=utm +zone=23 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");

// Cores para o terminal
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const RESET = '\x1b[0m';

// ============================================================================
// 📁 CAMINHOS DOS ARQUIVOS
// ============================================================================
const BASE_PDVS_PATH = path.join(__dirname, '..', '..', 'data', 'Base_PDVs_Atualizada.csv');
const PASTA_BANCO_DADOS = 'C:\\botzapzap\\botzapzap\\data\\hist';
const VAGAS_PJF_PATH = 'C:\\botzapzap\\botzapzap\\data\\pjfcargaedescarga.json';
const LOG_APROVACOES_PATH = path.join(__dirname, '..', '..', 'utils', 'rotasAprovadasLog.json');

const PATH_DOCS_PC = path.join(os.homedir(), 'Documents', 'pedidosDataDeEntrega.csv');
const PATH_REDE_APR = '\\\\revenda.local\\VENDAS\\APR\\pedidosDataDeEntrega.csv';

// ============================================================================
// 🔒 FUNÇÕES DE TRAVA: BLOQUEIO DE 30 DIAS
// ============================================================================
async function verificarBloqueio30Dias(nb, diasLimite) {
    try {
        if (!fs.existsSync(LOG_APROVACOES_PATH)) return false; 

        const logData = JSON.parse(fs.readFileSync(LOG_APROVACOES_PATH, 'utf-8'));
        
        if (logData[nb]) {
            const dataUltimaAprovacao = new Date(logData[nb].data);
            const dataAtual = new Date();
            const diffTempo = Math.abs(dataAtual - dataUltimaAprovacao);
            const diffDias = Math.ceil(diffTempo / (1000 * 60 * 60 * 24));
            
            if (diffDias <= diasLimite) return true; 
        }
        return false; 
    } catch (error) {
        return false; 
    }
}

function registrarLogAprovacao(nb) {
    try {
        let logData = {};
        if (fs.existsSync(LOG_APROVACOES_PATH)) {
            logData = JSON.parse(fs.readFileSync(LOG_APROVACOES_PATH, 'utf-8'));
        }
        logData[nb] = { data: new Date().toISOString() };
        fs.writeFileSync(LOG_APROVACOES_PATH, JSON.stringify(logData, null, 2));
    } catch (error) {
        console.error(`${RED}❌ Falha ao salvar log de aprovação: ${error.message}${RESET}`);
    }
}

// ============================================================================
// 🚚 FUNÇÕES DE CARGA E DESCARGA (PJF)
// ============================================================================
function normalizarTexto(texto) {
    if (!texto) return '';
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function carregarVagasPJF() {
    try {
        if (!fs.existsSync(VAGAS_PJF_PATH)) {
            return { vagas: [], bairrosAtendidos: new Set() };
        }

        const rawData = fs.readFileSync(VAGAS_PJF_PATH, 'utf-8');
        const geojson = JSON.parse(rawData);
        
        let vagas = [];
        let bairrosAtendidos = new Set();

        geojson.features.forEach(feature => {
            if (feature.geometry && feature.geometry.coordinates) {
                const [lng, lat] = proj4("EPSG:31983", "EPSG:4326", feature.geometry.coordinates);
                const bairroNormalizado = normalizarTexto(feature.properties.Bairro);
                
                bairrosAtendidos.add(bairroNormalizado);
                
                vagas.push({ rua: feature.properties.Rua, bairro: bairroNormalizado, tipologia: feature.properties.Tipologia, lat: lat, lng: lng });
            }
        });

        console.log(`${GREEN}✅ Carregadas ${vagas.length} vagas de Carga/Descarga da PJF.${RESET}`);
        return { vagas, bairrosAtendidos };

    } catch (e) {
        return { vagas: [], bairrosAtendidos: new Set() };
    }
}

const dbVagas = carregarVagasPJF();

// ============================================================================
// ⚙️ FUNÇÕES AUXILIARES E LEITURA DE DADOS
// ============================================================================
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
        const conteudo = fs.readFileSync(BASE_PDVS_PATH, 'utf-8').replace(/^\uFEFF/, '');
        const linhas = conteudo.split(/\r?\n/).filter(l => l.trim() !== '');
        const separador = linhas[0].includes(';') ? ';' : ',';
        
        const headersRaw = linhas[0].split(separador);
        const headers = headersRaw.map(h => {
            let clean = h.trim();
            if (clean.toUpperCase().includes('LATITUDE')) return 'Latitude';
            if (clean.toUpperCase().includes('LONGITUDE')) return 'Longitude';
            if (clean.toUpperCase().includes('MUNIC')) return 'Municipio';
            return clean;
        });

        return linhas.slice(1).map(linha => {
            const valores = linha.split(separador);
            let obj = {};
            headers.forEach((h, i) => { obj[h] = valores[i] ? valores[i].trim() : ''; });
            return obj;
        });
    } catch (error) {
        return null;
    }
}

async function obterFaturamentoMesPassado(chave) {
    const mesPassado = obterAbaMesPassado();
    const arquivoCsv = path.join(PASTA_BANCO_DADOS, `2026_${mesPassado}.csv`);
    
    if (!fs.existsSync(arquivoCsv)) {
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
            .on('error', (err) => resolve({ faturamento: 0, mes: mesPassado, erro: true }));
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
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
            headers: { 'User-Agent': 'RotasPDVLogistica/1.0 (seu_email@dominio.com)' }
        });
        const data = await res.json();
        if (data && data.address) {
            const rua = data.address.road || data.address.pedestrian || "Rua desconhecida";
            const num = data.address.house_number || "S/N";
            return `${rua}, ${num}`;
        }
        return "Endereço não encontrado";
    } catch (e) { 
        return "Erro ao buscar endereço"; 
    }
}

// ============================================================================
// 🗺️ ANÁLISE DE ROTA PRINCIPAL E ESTATÍSTICAS
// ============================================================================
async function obterEstatisticasPdv(nbBusca) {
    const pdvData = lerBaseCSV();
    if (!pdvData) return { erro: "❌ *Erro de Sistema:* A base de clientes não foi encontrada." };
    
    let pdvBase = pdvData.find(p => p['Chave'] === nbBusca);
    if (!pdvBase) return { erro: `❌ O NB *${nbBusca}* não foi encontrado na base atual.` };

    const bairro = pdvBase['BAIRRO'] || 'Desconhecido';
    const municipio = pdvBase['Municipio'] || 'Desconhecido';
    const fantasia = pdvBase['FANTASIA'] || 'Não Cadastrado';
    
    const chaves = Object.keys(pdvBase);
    const chaveEscolta = chaves.find(k => k.toUpperCase().includes('ESCOLTA'));
    const escolta = chaveEscolta && pdvBase[chaveEscolta] ? pdvBase[chaveEscolta].trim() : 'NÃO';
    
    const chaveDoc = chaves.find(k => k.toUpperCase().includes('CPF') || k.toUpperCase().includes('CNPJ') || k.toUpperCase() === 'DOCUMENTO');
    const documento = chaveDoc ? pdvBase[chaveDoc].trim() : '';

    const prefixoFilial = nbBusca.split('_')[0] + '_';

    const diasDaSemana = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
    let diasAtuais = diasDaSemana.filter(d => pdvBase[d] === '1');

    const historico = await obterFaturamentoMesPassado(nbBusca);

    const vizinhos = pdvData.filter(p => p['BAIRRO'] === bairro && p['Municipio'] === municipio && p['Chave'].startsWith(prefixoFilial));
    const contagemDias = { SEG: 0, TER: 0, QUA: 0, QUI: 0, SEX: 0, SAB: 0 };
    vizinhos.forEach(v => { diasDaSemana.forEach(d => { if (v[d] === '1') contagemDias[d]++; }); });

    return { sucesso: true, bairro, municipio, contagemDias, fantasia, escolta, diasAtuais, historico, documento };
}

async function processarAnaliseRota(nbBusca, diaEscolhido) {
    const pdvData = lerBaseCSV();
    if (!pdvData) return { erro: "❌ *Erro de Sistema:* A base de clientes (CSV) não pôde ser carregada." };
    
    let pdvBase = pdvData.find(p => p['Chave'] === nbBusca);

    if (!pdvBase) return { erro: `❌ O NB *${nbBusca}* não foi encontrado na base de dados.` };
    if (!pdvBase['Latitude'] || !pdvBase['Longitude']) return { erro: `❌ O PDV *${nbBusca}* não possui Latitude/Longitude para traçar rota.` };

    const baseLat = parseFloat(pdvBase['Latitude'].replace(',', '.'));
    const baseLng = parseFloat(pdvBase['Longitude'].replace(',', '.'));
    const prefixoFilial = nbBusca.split('_')[0] + '_';

    const municipioNorm = normalizarTexto(pdvBase['Municipio']);
    const bairroNorm = normalizarTexto(pdvBase['BAIRRO']);

    let usarVagasOficiais = false;
    let vagaMaisProxima = null;

    if (municipioNorm === 'JUIZ DE FORA' && dbVagas.bairrosAtendidos.has(bairroNorm)) {
        usarVagasOficiais = true;
        let menorDistVaga = Infinity;
        dbVagas.vagas.forEach(v => {
            const dist = calcHaversine(baseLat, baseLng, v.lat, v.lng);
            if (dist < menorDistVaga) { menorDistVaga = dist; vagaMaisProxima = v; }
        });
    }

    let pdvsDoDia = pdvData.filter(p => p[diaEscolhido] === '1' && p['Chave'] !== nbBusca && p['Latitude'] && p['Chave'].startsWith(prefixoFilial));
    if (pdvsDoDia.length === 0) return { erro: `❌ Não existem outros clientes da operação com entrega para ${diaEscolhido}.` };

    pdvsDoDia.forEach(p => {
        const cLat = parseFloat(p['Latitude'].replace(',', '.'));
        const cLng = parseFloat(p['Longitude'].replace(',', '.'));
        if (usarVagasOficiais && vagaMaisProxima) {
            p.distReta = calcHaversine(vagaMaisProxima.lat, vagaMaisProxima.lng, cLat, cLng);
        } else {
            p.distReta = calcHaversine(baseLat, baseLng, cLat, cLng);
        }
    });

    pdvsDoDia.sort((a, b) => a.distReta - b.distReta);
    const top5 = pdvsDoDia.slice(0, 5);

    for (let c of top5) { c.distRuas = c.distReta; }
    top5.sort((a, b) => a.distRuas - b.distRuas);
    const vencedor = top5[0];

    if (!vencedor) return { erro: "❌ Erro ao calcular rotas." };

    const vLat = parseFloat(vencedor['Latitude'].replace(',', '.'));
    const vLng = parseFloat(vencedor['Longitude'].replace(',', '.'));
    vencedor.endereco = await obterEndereco(vLat, vLng);
    
    if (usarVagasOficiais && vagaMaisProxima) {
        vencedor.msgCargaDescarga = `🅿️ *Regra Ativa (PJF):* O entregador utilizará a vaga de carga/descarga na *${vagaMaisProxima.rua}*.\n📍 _A distância de ${(vencedor.distRuas).toFixed(0)}m foi calculada partindo da vaga até o destino._`;
    } else {
        vencedor.msgCargaDescarga = `⚠️ *Aviso:* Mapa de carga e descarga PJF não aplicável a esta região.`;
    }

    const historico = await obterFaturamentoMesPassado(nbBusca);
    let diasAtuais = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'].filter(d => pdvBase[d] === '1');

    return { 
        sucesso: true, 
        origem: { chave: nbBusca, lat: baseLat, lng: baseLng, dias: diasAtuais.join(', ') || 'Nenhum', faturamento: historico.faturamento, mesHisto: historico.mes },
        vencedor: vencedor
    };
}

function salvarPedidoEntrega(chave, documento, diasFinaisArray) {
    const partes = chave.split('_');
    const unb = partes[0] || '';
    const clientCode = partes[1] || '';
    
    const mon = diasFinaisArray.includes('SEG') ? '1' : '';
    const tue = diasFinaisArray.includes('TER') ? '1' : '';
    const wed = diasFinaisArray.includes('QUA') ? '1' : '';
    const thu = diasFinaisArray.includes('QUI') ? '1' : '';
    const fri = diasFinaisArray.includes('SEX') ? '1' : '';
    const sat = diasFinaisArray.includes('SAB') ? '1' : '';
    const sun = ''; 
    
    const colsVazias = Array(16).fill('').join(';');
    const linha = `${unb};${clientCode};${documento};${mon};${tue};${wed};${thu};${fri};${sat};${sun};${colsVazias}\n`;
    const header = "UNB;ClientCode;Document;Mon;Tue;Wed;Thu;Fri;Sat;Sun;MinValueMon;MinValueTue;MinValueWed;MinValueThu;MinValueFri;MinValueSat;MinValueSun;AddAmountMon;AddAmountTue;AddAmountWed;AddAmountThu;AddAmountFri;AddAmountSat;AddAmountSun;DeliveryFrequency;ClickAndCollectActive\n";

    const destinos = [PATH_DOCS_PC, PATH_REDE_APR];

    destinos.forEach(caminho => {
        try {
            const dir = path.dirname(caminho);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            if (!fs.existsSync(caminho)) {
                fs.writeFileSync(caminho, header);
            }
            fs.appendFileSync(caminho, linha);
        } catch (e) {
            console.error(`${RED}❌ Aviso: Não foi possível salvar em ${caminho}.${RESET}`);
        }
    });

    registrarLogAprovacao(chave);
}

module.exports = {
    verificarBloqueio30Dias,
    processarAnaliseRota,
    salvarPedidoEntrega,
    formatarMoeda,
    obterEstatisticasPdv
};