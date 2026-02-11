const fs = require('fs');
const path = require('path');

console.log("🚑 Iniciando PROTOCOLO DE REPARO GERAL (Issues #5759, #5758, #5752)...");

const rootDir = path.resolve(__dirname, 'node_modules', 'whatsapp-web.js', 'src');

const fixes = [
    // -------------------------------------------------------------------------
    // 1. Client.js: Corrige o travamento em 99% e o crash de Ligações (Call)
    // -------------------------------------------------------------------------
    {
        filePath: path.join(rootDir, 'Client.js'),
        name: "Client.js (Race Condition + Call Crash)",
        replacements: [
            {
                // Fix #5758: O bot fica preso em 99% porque perde o evento de sincronia
                original: "window.AuthStore.AppState.on('change:state', (_AppState, state) => { window.onAuthAppStateChangedEvent(state); });",
                new: `const appState = window.AuthStore.AppState;
                      if (appState.hasSynced) { window.onAppStateHasSyncedEvent(); }
                      appState.on('change:hasSynced', (_AppState, hasSynced) => { if (hasSynced) window.onAppStateHasSyncedEvent(); });
                      appState.on('change:state', (_AppState, state) => { window.onAuthAppStateChangedEvent(state); });`
            },
            {
                // Fix #5751: Crash ao tentar ouvir eventos de ligação (Store.Call undefined)
                original: "window.Store.Call.on('add', (call) => { window.onIncomingCall(call); });",
                new: "if (window.Store.Call) { window.Store.Call.on('add', (call) => { window.onIncomingCall(call); }); }"
            },
            {
                // Proteção extra para Newsletter
                original: "await window.Store.NewsletterMetadataCollection.update(channel.id);",
                new: "await window.Store.NewsletterMetadataCollection?.update(channel.id);"
            }
        ]
    },

    // -------------------------------------------------------------------------
    // 2. Utils.js: Corrige o crash ao carregar lista de chats (GroupMetadata)
    // -------------------------------------------------------------------------
    {
        filePath: path.join(rootDir, 'util', 'Injected', 'Utils.js'),
        name: "Utils.js (GroupMetadata Update Crash)",
        replacements: [
            {
                // Fix #5759 & #5752: O WhatsApp removeu o método update direto
                original: "await window.Store.GroupMetadata.update(chatWid);",
                new: "await window.Store.GroupMetadata?.update(chatWid);"
            },
            {
                // Proteção para canais
                original: "await window.Store.NewsletterMetadataCollection.update(chat.id);",
                new: "await window.Store.NewsletterMetadataCollection?.update(chat.id);"
            }
        ]
    },

    // -------------------------------------------------------------------------
    // 3. GroupChat.js: Corrige crash ao ler descrição de grupos
    // -------------------------------------------------------------------------
    {
        filePath: path.join(rootDir, 'structures', 'GroupChat.js'),
        name: "GroupChat.js (DescId Crash)",
        replacements: [
            {
                original: "let descId = window.Store.GroupMetadata.get(chatWid).descId;",
                new: "let descId = window.Store.GroupMetadata?.get(chatWid)?.descId;"
            }
        ]
    },

    // -------------------------------------------------------------------------
    // 4. Puppeteer.js: Blindagem contra erro de 'function already exists'
    // -------------------------------------------------------------------------
    {
        filePath: path.join(rootDir, 'util', 'Puppeteer.js'),
        name: "Puppeteer.js (Blindagem de Binding)",
        contentOverride: `'use strict';
/**
 * Exposes a function to the page if it doesn't already exist
 */
exports.exposeFunctionIfAbsent = async (page, name, func) => {
    try {
        await page.exposeFunction(name, func);
    } catch (err) {
        // Ignora erros de função já existente para não derrubar o bot
        // console.log(\`[Blindagem] Função \${name} já existia.\`);
    }
};` 
    }
];

// Execução dos Reparos
fixes.forEach(fix => {
    if (fs.existsSync(fix.filePath)) {
        // Se for um override completo (como o Puppeteer.js), sobrescreve tudo
        if (fix.contentOverride) {
            fs.writeFileSync(fix.filePath, fix.contentOverride, 'utf8');
            console.log(`🛡️  ${fix.name} -> Arquivo blindado completamente!`);
        } else {
            // Se for substituição de trechos
            let content = fs.readFileSync(fix.filePath, 'utf8');
            let modified = false;

            fix.replacements.forEach(rep => {
                if (content.includes(rep.original)) {
                    content = content.replace(rep.original, rep.new);
                    modified = true;
                }
            });

            if (modified) {
                fs.writeFileSync(fix.filePath, content, 'utf8');
                console.log(`✅ ${fix.name} -> Correções aplicadas!`);
            } else {
                console.log(`⚠️ ${fix.name} -> Nenhuma alteração necessária (já corrigido?).`);
            }
        }
    } else {
        console.error(`❌ ERRO: Arquivo não encontrado: ${fix.filePath}`);
    }
});

console.log("\n🏁 Manutenção concluída. Apague a pasta '.wwebjs_auth' e inicie o bot!");