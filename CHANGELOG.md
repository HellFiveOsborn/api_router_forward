# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/spec/v2.0.0.html).

## [Não Lançado]

### Adicionado

- ✨ Página "Playground" para testes interativos das configurações de forward (`frontend/src/components/Playground.jsx`).
- 🎨 Componente `ResponseBodyRenderer` para exibir respostas formatadas (JSON, XML, Texto) no Playground.
- 🔧 Modal `WorkflowStepModal` para visualizar e editar os scripts de validação/manipulação (Headers In, Params In, Response Out).
- 📝 Criação inicial do arquivo `CHANGELOG.md`.
- 📊 Adição de diagrama de fluxo Mermaid ao `README.md`.
- 🖼️ Adição de imagem do Playground (`images/image2.png`) ao `README.md`.

### Modificado

- 💄 Melhorias na interface do usuário do modal `AddForwardModal`.
- 📄 Atualização do `README.md` com novas seções (Playground, Fluxo da Requisição) e imagens.
- ⚙️ Integração dos novos componentes no `App.jsx` e `Dashboard.jsx`.

## [0.1.0] - 2025-04-02

### Adicionado

- 🎉 Implementação inicial completa do projeto Route Forward (Commit: `53adc5da`).
- **Backend:**
    - Servidor Express com Node.js.
    - Banco de dados SQLite para persistência das configurações.
    - Autenticação JWT básica.
    - API RESTful para CRUD de configurações de "forward".
    - Middleware principal de encaminhamento de requisições.
    - Execução segura de scripts JavaScript (validação de headers/parâmetros, manipulação de resposta) usando `vm`.
    - Roteamento flexível (customizado ou baseado em slug/destino).
    - Logging de trace (`X-Forward-Trace`) para depuração.
- **Frontend:**
    - Dashboard em React com Vite.
    - Estilização com TailwindCSS e DaisyUI.
    - Contexto de autenticação (`AuthContext`).
    - Componentes: Login, Dashboard, Lista de Forwards, Modal Adicionar/Editar Forward.
    - Serviço de API para comunicação com o backend.
- Arquivos de configuração (`.env.example`, `.gitignore`, `eslint`, `postcss`, `tailwind`, `vite`).
- `LICENSE` (MIT).
- `README.md` inicial com screenshot (`images/image1.png`).