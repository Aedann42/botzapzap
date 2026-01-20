# BotZapZap - Assistente Virtual para Equipes de Vendas

![Status](https://img.shields.io/badge/status-ativo-green)
![Node.js](https://img.shields.io/badge/Node.js-18.x-blue?logo=node.js)
![Library](https://img.shields.io/badge/library-whatsapp--web.js-brightgreen)

Um bot de WhatsApp robusto e proativo, criado para automatizar tarefas, distribuir informações e agilizar a comunicação com a equipe de vendas da Tarumã.

---

##  Contexto e o Problema

Em um ambiente de vendas dinâmico, a agilidade no acesso à informação é crucial. A equipe de representantes comerciais frequentemente precisava solicitar manualmente relatórios diários, consultar dados de remuneração e tirar dúvidas repetitivas, gerando um fluxo de trabalho manual e, por vezes, lento para a equipe de back-office. Havia a necessidade de uma ferramenta que centralizasse essas informações e as entregasse de forma instantânea e segura, 24/7.

## A Solução

O **BotZapZap** foi desenvolvido para ser o assistente virtual de cada representante. Integrado diretamente ao WhatsApp, ele automatiza as tarefas mais comuns, fornecendo dados essenciais com apenas alguns comandos. O projeto transforma o WhatsApp em uma poderosa ferramenta de produtividade, liberando tempo tanto para os vendedores em campo quanto para a equipe administrativa.

## Funcionalidades Principais

Este bot foi construído com uma série de funcionalidades pensadas para resolver problemas reais do dia a dia da equipe:

-   **Distribuição Automatizada de Relatórios:** Envia relatórios de acompanhamento diário em formato PDF ou Imagem, buscando os arquivos mais recentes diretamente da rede interna da empresa assim que são gerados. Vale ressaltar que apenas um numero específico pode ter acesso a sua pasta de relatórios garantindo assim segurança e pratícidade.

-   **Consulta Segura de Remuneração:** Permite que o representante consulte sua planilha de remuneração. A camada de segurança, que solicita a matrícula pessoal do representante como senha, foi uma **ideia implementada em colaboração com o Gerente Comercial da Tarumã**, garantindo a total confidencialidade dos dados. Essa função foi adicionada pois eventualmente ocorrem alterações de qual é o representante de alguma rota porem o telefone é sempre o mesmo.

-   **Consulta de Tarefas de PDV:** O bot acessa uma planilha na rede e retorna as tarefas pendentes para um Ponto de Venda (PDV) específico, agilizando o trabalho de campo.

-   **Módulo de Operador e Suporte Ágil:** Um operador logado no WhatsApp Web pode assumir o controle para ajudar um representante.
    -   Com o comando `/representante <comando>`, o operador executa ações em nome do usuário.
    -   O sistema possui um **bypass de autenticação inteligente**: se o operador aciona a consulta de remuneração para um usuário, o bot pula a etapa de pedir a matrícula, confiando na autorização do operador e tornando o suporte instantâneo.

-   **Campanha de Ativação Proativa:** Com o comando `/ativar`, o bot envia uma mensagem de boas-vindas para todos os representantes cadastrados que ainda não interagiram, incentivando a adoção da ferramenta.

-   **Fila de Espera Inteligente:** Caso um relatório ainda não esteja pronto, o bot adiciona o usuário a uma fila e o notifica automaticamente assim que o arquivo estiver disponível, garantindo que nenhuma solicitação seja perdida.

-   **Interação Natural:** O bot utiliza saudações que variam conforme o horário e um banco de frases para tornar a conversa menos robótica, além de um comando `menu` para reapresentar as opções a qualquer momento.

## Tecnologias Utilizadas

-   **Backend:** Node.js
-   **Biblioteca Principal:** `whatsapp-web.js` (para interação com o WhatsApp Web)
-   **Módulos:** `qrcode-terminal`, `fs`, `path`

## O Processo de Desenvolvimento

Este projeto nasceu de uma necessidade real e foi moldado pela colaboração. Ele não foi construído em um vácuo; pelo contrário, a maior parte das funcionalidades e melhorias surgiu de forma iterativa, **coletando feedback direto dos representantes de vendas**. Esse ciclo de ouvir as dores do usuário final e traduzi-las em automação foi a chave para criar uma ferramenta que eles de fato usam e valorizam.

A colaboração com a gestão também foi fundamental. A implementação da camada de segurança na consulta de remuneração, por sugestão do gerente comercial, mostra como o desenvolvimento técnico esteve alinhado às necessidades de negócio e segurança da empresa. Este bot é um exemplo prático de como a tecnologia pode ser aplicada para resolver problemas concretos, demonstrando iniciativa, capacidade de ouvir o usuário e habilidade para entregar uma solução completa e funcional.

## Como Executar o Projeto

1.  Clone o repositório:
    ```bash
    git clone [https://github.com/Aedann42/botzapzap.git](https://github.com/Aedann42/botzapzap.git)
    ```
2.  Navegue até a pasta do projeto e instale as dependências:
    ```bash
    cd botzapzap
    npm install
    ```
3.  Inicie o bot:
    ```bash
    node index.js
    ```
4.  Escaneie o QR Code que aparecerá no terminal com o seu celular WhatsApp.

---

Agora sim! Com o Push feito, suas alterações de Janeiro estão oficialmente no histórico.

Aqui está o changelog completo, desde o início do projeto até os 9 commits que você acabou de subir hoje, tudo padronizado.

📜 Histórico de Atualizações do Projeto
🚀 Versão [ Pré-lançamento ] — 📅 09 de Abril de 2025
✨ Adicionado:

🏁 Setup Inicial: Reinício do projeto e configuração no servidor.

🧹 Limpeza: O repositório foi limpo para remover arquivos pesados e desnecessários.

🚀 Versão [ 1.0.0 ] — 📅 17 de Abril de 2025
✨ Adicionado:

🤖 Lançamento Oficial: Primeira versão estável do bot.

📦 Funcionalidades Essenciais: Relatórios em PDF/Imagem, acesso à Remuneração, Contatos e Suporte.

🔐 Segurança: Autorização de usuários baseada no arquivo representantes.json.

🎨 Interface: Adição de emojis no menu para uma experiência mais amigável.

🚀 Versão [ 1.0.1 ] — 📅 23 de Maio de 2025
✨ Adicionado:

📋 Tarefas de PDV: Função para listar tarefas diretamente de um arquivo .xlsx na rede.

🐛 Corrigido:

⚡ Estabilidade: Melhorada a lógica para lidar com múltiplas solicitações simultâneas.

🔧 Ajustes Técnicos: Correção em caminhos de arquivos e mensagens de retorno.

🚀 Versão [ 1.0.2 ] — 📅 25 de Julho de 2025
✨ Adicionado:

📱 Menu Sob Demanda: Comando menu para solicitar a lista de opções a qualquer momento. Usuario precisa usar a palavra MENU.

🛠 Alterado:

🧩 Modularização: Texto do menu movido para menuOptions.js para facilitar edições.

👀 Limpeza de Visualização: O bot agora marca como "vistas" as mensagens de grupos onde não é mencionado.

🚀 Versão [ 1.0.3 ] — 📅 28 de Agosto de 2025
✨ Adicionado:

🕒 Verificação de Versão: Garantia de que o bot sempre envie a versão mais recente dos arquivos.

🛠 Alterado:

📂 Refatoração: Melhor organização de pastas (utils) para facilitar a manutenção do código.

🚀 Versão [ 1.0.4 ] — 📅 05 de Setembro de 2025
✨ Adicionado:

⏳ Fila de Espera: Notificação automática quando um relatório solicitado fica disponível.

🛠 Alterado:

📨 Otimização: Melhoria na fila de envio de remuneração para garantir a entrega de todas as solicitações.

🚀 Versão [ 1.2.0 ] — 📅 11 de Setembro de 2025
✨ Adicionado:

👨‍💻 Módulo Operador: Administradores podem executar comandos em nome de usuários via WhatsApp Web (/rep).

📢 Campanha de Ativação: Comando /ativar para onboarding proativo de representantes.

🛠 Alterado:

⏩ Bypass de Autenticação: Comandos do operador pulam etapas de verificação para agilizar o suporte (/rep).

🧠 Captura de Dados: Lógica de captura do código do PDV aprimorada.

🐛 Corrigido:

🔄 Looping de Notificação: A campanha /ativar agora registra corretamente os usuários contatados.

🚀 Versão [ 1.2.1 ] — 📅 16 de Setembro de 2025
🛠 Alterado:

📅 Lógica Inteligente: O comando /ativar agora verifica o uso real nos últimos 7 dias (logs) em vez de zerar diariamente.

🚀 Versão [ 1.2.2 ] — 📅 26 de Setembro de 2025
✨ Adicionado:

🔍 Novas Funções: Consulta de Coleta TTC PDV e Conferência de CT.

🎩 Exceções: Adicionados staffs (que seriam os Gerentes de Vendas da empresa e o Gerente Comercial) para pular a saudação inicial.

🐛 Corrigido:

💬 Feedback: Ajuste na mensagem automática de disponibilidade de relatório.

🚀 Versão [ 1.2.3 ] — 📅 06 de Outubro de 2025
🛠 Alterado:

📂 Remuneração Completa: Envio de TODOS os arquivos da pasta do usuário (filtrando temporários).

🐛 Corrigido:

🚦 Fila Dupla: Corrigido bug que misturava filas de PDF e Imagem, resolvendo notificações cruzadas incorretas.

🚀 Versão [ 1.2.4 ] — 📅 15 de Outubro de 2025
✨ Adicionado:

⚙️ Giro de Equipamentos: Nova função para enviar dados de giro dos PDVs pois há meta de SPO (programa de excelencia da Ambev).

🚀 Versão [ 1.2.5 ] — 📅 22 de Outubro de 2025
✨ Adicionado:

⏰ Lembrete de Ponto: Nova função automatizada com node-cron.

🛠 Alterado:

🏷️ Filtro por Revenda: Implementação de lógica para diferenciar informações conforme a revenda do representante.

🚀 Versão [ 1.2.6 ] — 📅 24 de Outubro de 2025
🛠 Alterado:

🏗️ Infraestrutura: Atualização crítica na biblioteca de conexão para suportar envio em grupos no novo formato do WhatsApp.

🚀 Versão [ 1.2.7 ] — 📅 31 de Outubro de 2025
✨ Adicionado:

📢 Expansão do Lembrete: Inclusão de novos setores na regra de notificações de ponto.

📘 Documentação: Atualização do README.md.

🚀 Versão [ 1.2.8 ] — 📅 04 de Novembro de 2025
🛠 Alterado:

📅 Fonte de Dados: Ajuste na origem das informações para o a pasta do mês atual.

🚀 Versão [ 1.3.0 ] — 📅 26 de Novembro de 2025
🛠 Alterado (Grande Atualização):

🧠 Nova Lógica (LID): Alteração estrutural para usar o LID como chave principal.

✍️ Dados Manuais: Suporte para processar LIDs coletados manualmente pois após atualização o whatsapp parou de olhar o telefone do usuário e tem usado um LID que parece aleatório.

🚀 Versão [ 1.3.1 ] — 📅 03 de Dezembro de 2025
🛠 Alterado:

📊 Refinamento: Melhoria na lógica do Resumo PDV e mês vigente.

🚀 Versão [ 1.3.2 ] — 📅 12 de Dezembro de 2025
✨ Adicionado:

💬 Contexto (Quote): Envio de Remuneração - O bot agora responde citando a mensagem original do usuário para melhor organização visual e entendimento do erro.

🚀 Versão [ 1.3.3 ] — 📅 17 de Dezembro de 2025
🛠 Alterado:

⚠️ Aviso de Sistema: Mensagem temporária no menu alertando sobre instabilidade na API do WhatsApp.

🚀 Versão [ 1.4.0 ] — 📅 20 de Janeiro de 2026
✨ Adicionado:

🤖 Automação de Extras: Início da implementação da mecânica para o bot digitar "extras" de forma autônoma, convertendo audios em texto e texto para um padrão intelegível pelo setor de faturamento [ainda não foi implementado pois a IA confunde muito as palavras]

📝 Padronização de Logs: Unificação do formato de registros para facilitar o monitoramento e debug.

🛠 Alterado:

⚡ Performance: Removido o delay proposital para tentar melhorar a velocidade de resposta do bot.

🧹 Limpeza de Código: Removida a função checkDateReports (considerada obsoleta) e correção de redundâncias no código.

🔧 Manutenção: Ajustes diversos de início de mês e modificações técnicas na função de envio (client.sendS...) pois uma atualização acabou quebrando ela.