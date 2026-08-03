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

📜 CHANGELOG — BotZapZap
Todas as alterações notáveis deste projeto estão documentadas abaixo em ordem cronológica.

[ 0.1.0 ] — 📅 09 de Abril de 2025
✨ Adicionado
Setup Inicial: Configuração do ambiente de desenvolvimento Node.js e estrutura do projeto no servidor.

Higienização do Repositório: Remoção de arquivos pesados e desnecessários do histórico inicial.

[ 1.0.0 ] — 📅 17 de Abril de 2025
✨ Adicionado
Lançamento Oficial (v1.0.0): Primeira versão estável em ambiente de produção.

Funcionalidades Base: Envio de relatórios em PDF/Imagem, consulta de remuneração protegida por matrícula, contatos de emergência e suporte.

Camada de Autenticação: Controle de acesso de usuários baseado no arquivo representantes.json.

Interface do Usuário: Adição de emojis ao menu interativo para melhor usabilidade.

[ 1.0.1 ] — 📅 23 de Maio de 2025
✨ Adicionado
Consulta de Tarefas de PDV: Leitura direta de arquivos .xlsx na rede interna para listagem de pendências em pontos de venda.

🐛 Corrigido
Estabilidade e Concorrência: Ajuste na lógica assíncrona para suportar requisições simultâneas de múltiplos usuários.

Ajustes de Infraestrutura: Correção na resolução de caminhos de arquivos e mensagens de retorno.

[ 1.0.2 ] — 📅 25 de Julho de 2025
✨ Adicionado
Menu Sob Demanda: Comando MENU para reagendar e reexibir a lista de opções a qualquer momento.

🛠️ Alterado
Modularização: Isolamento do texto e das opções do menu no arquivo menuOptions.js.

Gerenciamento de Grupos: O bot passa a marcar como vistas as mensagens de grupos onde não foi diretamente mencionado, mantendo a caixa limpa.

[ 1.0.3 ] — 📅 28 de Agosto de 2025
✨ Adicionado
Verificação de Versão de Arquivos: Garantia de que o bot sempre entregue a versão mais recente dos relatórios e planilhas disponíveis na rede.

🛠️ Alterado
Refatoração Módulo utils: Reorganização interna de arquivos utilitários para facilitar a manutenção.

[ 1.0.4 ] — 📅 05 de Setembro de 2025
✨ Adicionado
Fila de Espera Assíncrona: Sistema de notificação automática disparado assim que um relatório solicitado é gerado na rede.

🛠️ Alterado
Otimização da Fila de Remuneração: Aprimoramento do fluxo de entrega para garantir o envio de todas as solicitações em momentos de pico.

[ 1.1.0 ] — 📅 11 de Setembro de 2025
✨ Adicionado
Módulo Operador (/rep): Permite que supervisores executem comandos em nome de um representante comercial diretamente pelo WhatsApp Web.

Campanha de Ativação Proativa (/ativar): Comando para onboarding e engajamento inicial de representantes cadastrados.

🛠️ Alterado
Bypass de Autenticação: Operadores autorizados saltam as etapas de verificação ao prestar suporte a representantes.

Captura de Dados: Melhoria na lógica de identificação do código do PDV.

🐛 Corrigido
Looping de Notificação: Correção na campanha /ativar para registrar corretamente os usuários que já receberam a mensagem.

[ 1.1.1 ] — 📅 16 de Setembro de 2025
🛠️ Alterado
Lógica do Onboarding: O comando /ativar passa a verificar o histórico de logs dos últimos 7 dias em vez de zerar os dados diariamente.

[ 1.1.2 ] — 📅 26 de Setembro de 2025
✨ Adicionado
Consultas Logísticas: Novas funções para consulta de Coleta TTC em PDVs e Conferência de Cartões de Transporte (CT).

Perfil de Gestão (Bypass de Saudação): Cargos executivos (Gerente Comercial e Gerentes de Vendas) adicionados em lista de exceção para navegação direta.

🐛 Corrigido
Refinamento na mensagem de confirmação de disponibilidade de relatórios.

[ 1.1.3 ] — 📅 06 de Outubro de 2025
🛠️ Alterado
Envio de Remuneração Completa: Envio consolidado de todos os arquivos presentes no diretório do usuário (descartando temporários).

🐛 Corrigido
Correção de Fila Dupla: Resolução de bug no gerenciamento de filas que misturava notificações entre arquivos PDF e imagens.

[ 1.1.4 ] — 📅 15 de Outubro de 2025
✨ Adicionado
Giro de Equipamentos de PDV: Módulo para acompanhamento de dados de giro de comodatos, atendendo metas do programa de excelência (SPO Ambev).

[ 1.1.5 ] — 📅 22 de Outubro de 2025
✨ Adicionado
Lembrete Automático de Ponto: Agendamento automatizado de alertas de registro de ponto via node-cron.

🛠️ Alterado
Filtro por Revenda: Segregação das informações e permissões de acordo com a unidade/revenda do representante.

[ 1.1.6 ] — 📅 24 de Outubro de 2025
🛠️ Alterado
Atualização de Infraestrutura de Conexão: Atualização crítica no protocolo da biblioteca do WhatsApp para suportar mensagens em grupos após mudanças na plataforma.

[ 1.1.7 ] — 📅 31 de Outubro de 2025
✨ Adicionado
Expansão dos Lembretes: Inclusão de novos setores operacionais nas regras de notificação de ponto.

Documentação: Atualização completa do README.md.

[ 1.1.8 ] — 📅 04 de Novembro de 2025
🛠️ Alterado
Redirecionamento dinâmico da origem das informações para apontar para o diretório do mês corrente.

[ 1.2.0 ] — 📅 26 de Novembro de 2025
🛠️ Alterado (Migração Estrutural de Autenticação)
Migração para LID (WhatsApp Identifiers): Alteração da chave primária de identificação dos usuários, migrando do número de telefone direto para a chave LID, acompanhando as novas diretrizes de privacidade do WhatsApp.

Tratamento Manual de LIDs: Suporte para cadastro e validação de LIDs coletados manualmente.

[ 1.2.1 ] — 📅 03 de Dezembro de 2025
🛠️ Alterado
Refinamento na lógica do Resumo de PDVs e consolidação do mês vigente.

[ 1.2.2 ] — 📅 12 de Dezembro de 2025
✨ Adicionado
Respostas em Citação (Quote Context): O bot passa a responder citando a mensagem original do usuário ao entregar planilhas de remuneração, facilitando a identificação no histórico do chat.

[ 1.2.3 ] — 📅 17 de Dezembro de 2025
🛠️ Alterado
Inclusão de aviso temporário no menu do usuário informando sobre oscilações conhecidas na API do WhatsApp.

[ 1.3.0 ] — 📅 20 de Janeiro de 2026
✨ Adicionado
Padronização Global de Logs: Registros unificados identificando o nome do arquivo de origem para agilizar o debug.

🛠️ Alterado & Corrigido
Otimização de Performance: Remoção de delays manuais no fluxo de mensagens para reduzir a latência de resposta.

Correção no Envio de Mensagens: Ajuste na função sendSeen devido a quebras causadas por atualizações da biblioteca do Puppeteer.

Restauração de Função: Recuperada a função checkDateReports necessária para validação das datas dos arquivos.

⚠️ Descontinuado / Projeto Cancelado
Automação de "Extras" via Voz/IA (Cancelado): A proposta de converter áudios e textos informais em pedidos de extras padronizados para o faturamento foi descontinuada. Testes operacionais demonstraram que os modelos de reconhecimento de fala apresentavam alta taxa de erro com termos técnicos do setor, inviabilizando a automação segura no ambiente de produção.

[ 1.3.1 ] — 📅 11 de Fevereiro de 2026
🛠️ Alterado
Automação via Google Forms: Desativação pontual do cron interno para transição de gatilhos orientados a formulários.

Recepção de PDVs: Criação de fluxo de boas-vindas para PDVs contendo contatos estratégicos de outros setores.

🔐 Segurança
Ajustes nas regras do .gitignore para dados temporários.

[ 1.3.2 ] — 📅 19 de Fevereiro de 2026
🛠️ Alterado
Sanitização de Documentos PDF: Ajuste no validador de relatórios em PDF para suportar documentos com variação de paginação (ex: arquivos com menos de 3 páginas).

🔐 Segurança
Ocultação de números telefônicos institucionais e mensagens sensíveis de atendimento via .gitignore.

[ 1.4.0 ] — 📅 04 de Março de 2026
✨ Adicionado
Consulta Tática de Não Compradores (Opção 11): Funcionalidade para relatórios imediatos de PDVs que ainda não realizaram pedidos no mês vigente.

Autoatendimento de Alteração de Setor: Permite que o próprio representante solicite a mudança de setor diretamente pelo WhatsApp, integrado a um fluxo de aprovação pendente enviado ao operador principal.

[ 1.4.1 ] — 📅 13 de Março de 2026
✨ Adicionado
Auto-Healing de Nomes (autoHealingNome): Mecanismo autônomo via Puppeteer para coletar e atualizar automaticamente nomes de RNs ausentes no cadastro.

Simulação de Comportamento Humano: Implementação de delays randômicos e padrões de digitação humanizada para mitigar bloqueios da API.

Módulo de Observabilidade & Métricas:

Implementação de logger colorido descolado do fluxo principal.

Monitoramento de uso de memória RAM.

Contador em tempo real de atendimentos realizados.

Lógica de saudação inteligente baseada no histórico recente de interações do log.

[ 1.5.0 ] — 📅 17 de Março de 2026
✨ Adicionado
Análise Geográfica de Distância entre PDVs: Algoritmo que calcula a proximidade entre pontos de venda e identifica entregas ativas na mesma região, auxiliando representantes na solicitação de novos dias/janelas de entrega.

🔐 Segurança & Higienização do Repositório (Data Security Purge)
Expurgo de Dados Sensíveis: Remoção definitiva de planilhas operacionais e arquivos CSV históricos (pedidosDataDeEntrega.csv, Base_PDVs_Atualizada.csv e pasta data) da árvore pública do Git.

Aprimoramento do .gitignore: Bloqueio estrito de dados operacionais e de clientes para conformidade com privacidade.

[ 1.5.1 ] — 📅 09 de Abril de 2026
🛠️ Alterado
Estabilidade do Puppeteer: Adicionado o argumento --disable-gpu nas configurações de inicialização do robô, reduzindo consumo de memória e evitando falhas em ambientes Headless.

Otimização do RotasHandler: Refatoração na lógica de processamento de rotas comerciais.

Atualização de Mês Vigente: Parametrização para Abril/2026.

[ 1.5.2 ] — 📅 07 de Maio de 2026
✨ Adicionado
Filtro Avançado de Oportunidades por Rota: Permissão para que o representante consulte oportunidades filtradas pela rota do dia atual ou pela rota completa (todos os dias).

🐛 Corrigido
Correção no nome do arquivo do contrato de exclusividade.

Atualização de mês vigente para Maio/2026.

[ 1.5.3 ] — 📅 20 de Maio de 2026
🛠️ Alterado
Melhorias de Auditoria: Aprimoramento na estruturação dos logs de sistema para melhor rastreamento de requisições.

[ 1.5.4 ] — 📅 11 de Junho de 2026
🛠️ Alterado
Portabilidade de Caminhos de Rede: Transição de caminhos absolutos de servidor para caminhos relativos, garantindo compatibilidade entre diferentes ambientes de execução.

Atualização de mês vigente para Junho/2026.

[ 2.0.0 ] — 📅 23 de Junho de 2026
✨ Adicionado
Módulo de Automação de Roteirização e Validação Logística: Implementação de motor de análise de rotas para apoio ao planejamento logístico e validação de entregas.

🛠️ Alterado
Refatoração Arquitetural do menuHandler: Desmembramento do arquivo principal de menu em submódulos especializados, facilitando a manutenção e escalabilidade do código.
