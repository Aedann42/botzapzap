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

## Histórico de Atualizações

A seguir, um resumo da jornada de desenvolvimento do projeto, mostrando a evolução contínua da ferramenta.

### [Pré-lançamento] - 2025-04-09
- **Adicionado:**
  - Reinício do projeto e setup no servidor.
  - O repositório foi limpo para remover arquivos pesados e desnecessários.

### [1.0.0] - 2025-04-17
- **Adicionado:**
  - Lançamento da primeira versão estável do bot.
  - Funcionalidades essenciais: Relatórios em PDF/Imagem, acesso à Remuneração, Contatos e Suporte.
  - Autorização de usuários baseada no `representantes.json`.
  - Adição de emojis no menu para uma interface mais amigável.

### [1.0.1] - 2025-05-23
- **Adicionado:**
  - **Função 5:** Listar tarefas de PDV diretamente de um arquivo `.xlsx` na rede.
- **Corrigido:**
  - Melhorada a lógica para lidar com múltiplas solicitações simultâneas, evitando instabilidade.
  - Ajustes em caminhos de arquivos e mensagens de retorno ao usuário.

### [1.0.2] - 2025-07-25
- **Adicionado:**
  - Comando `menu` para que os usuários possam solicitar a lista de opções a qualquer momento.
- **Alterado:**
  - O texto do menu foi modularizado para o arquivo `menuOptions.js`, facilitando futuras edições.
  - O bot agora marca como "vistas" as mensagens de grupos em que não é mencionado.

### [1.0.3] - 2025-08-28
- **Adicionado:**
  - Verificação de data dos arquivos para garantir que o bot sempre envie a versão mais recente dos relatórios.
- **Alterado:**
  - Refatoração do código com melhor organização de pastas (`utils`) para facilitar a manutenção.

### [1.0.4] - 2025-09-05
- **Adicionado:**
  - **Fila de Espera para Relatórios:** Se um relatório não está pronto, o usuário é notificado e avisado automaticamente quando o arquivo fica disponível.
- **Alterado:**
  - Otimizada a fila de envio de planilhas de remuneração para garantir a entrega de todas as solicitações.

### [1.2.0] - 2025-09-11
- **Adicionado:**
  - **Módulo de Operador:** Permite que um administrador, via WhatsApp Web, execute comandos (`/representante <comando>`) em nome de um usuário para prestar suporte.
  - **Campanha de Ativação Proativa:** Comando `/ativar` para o operador enviar uma mensagem de onboarding para todos os representantes que ainda não utilizaram o bot.
- **Alterado:**
  - **Bypass de Autenticação:** Comandos executados pelo operador pulam etapas de verificação (como a solicitação de matrícula), tornando o suporte mais ágil.
  - Lógica de captura do código do PDV foi aprimorada.
- **Corrigido:**
  - A campanha `/ativar` agora adiciona corretamente os usuários contatados ao `atendidos.json`, evitando que sejam notificados em looping.
