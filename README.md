# PDF Password Remover 🔓

Ferramenta web **gratuita e 100% client-side** para remover senhas de arquivos PDF, com suporte a processamento em lote.

**🔒 Privacidade total** — nenhum arquivo é enviado para servidores. Todo o processamento acontece no navegador do usuário.

## 🌐 Acesse

👉 [**https://davijr.github.io/financas-familia/**](https://davijr.github.io/financas-familia/)

---

## 🚀 Como usar

1. Acesse a página
2. Arraste ou selecione um ou mais PDFs protegidos por senha
3. Digite a senha dos PDFs
4. Clique em **"Remover Senha"**
5. Baixe o PDF desbloqueado (ou ZIP com múltiplos arquivos)

---

## 🛠️ Stack Técnica

| Tecnologia | Versão | Documentação Oficial | Uso no Projeto |
|---|---|---|---|
| **pdf.js** (Mozilla) | 4.9.155 | https://mozilla.github.io/pdf.js/ | Carregar, descriptografar e renderizar páginas do PDF para canvas |
| **jsPDF** (parallax) | 2.5.1 | https://rawgit.com/MrRio/jsPDF/master/docs/ | Montar novo PDF sem proteção a partir de imagens |
| **JSZip** | 3.10.1 | https://stuk.github.io/jszip/ | Empacotar múltiplos PDFs em arquivo ZIP para download |
| **GitHub Pages** | — | https://docs.github.com/en/pages | Hospedagem estática gratuita |
| **GitHub Actions** | — | https://docs.github.com/en/actions | Deploy automático a cada push na branch `main` |
| **HTML5 / CSS3** | — | https://developer.mozilla.org/en-US/docs/Web | Markup semântico, design glassmorphism, responsividade |
| **Vanilla JS** | ES6+ | https://developer.mozilla.org/en-US/docs/Web/JavaScript | Lógica da aplicação (sem frameworks) |

---

## 📐 Arquitetura

```
financas-familia/
├── index.html              # Entry point — HTML semântico com CDN links
├── js/
│   └── app.js              # Lógica da aplicação (ES6+, ~400 linhas)
├── css/
│   └── style.css           # Estilos — glassmorphism, animações, responsivo
└── .github/
    └── workflows/
        └── deploy.yml      # Pipeline de deploy para GitHub Pages
```

**Dependências via CDN (sem build step):**
- `pdf.js` — carregado como ESM module
- `jsPDF` — carregado como UMD (disponível como `window.jspdf`)
- `JSZip` — carregado como UMD (disponível como `window.JSZip`)

---

## 🔄 Fluxo de Processamento

```
Usuário seleciona PDF(s)
        ↓
pdf.js carrega e descriptografa com a senha fornecida
        ↓
Cada página é renderizada em <canvas> (escala 2x para qualidade)
        ↓
Canvas convertido para imagem JPEG (base64)
        ↓
jsPDF monta novo PDF com as imagens (sem proteção)
        ↓
1 arquivo  → download direto (.pdf)
N arquivos → JSZip empacota todos → download (.zip)
```

---

## 📋 Regras de Negócio

### Entrada
- Aceita múltiplos arquivos PDF simultaneamente (drag-and-drop ou seleção)
- Valida tipo MIME (`application/pdf`)
- Impede duplicatas (mesmo nome de arquivo)
- A mesma senha é usada para todos os arquivos do lote

### Processamento
- Usa `pdf.js` com `password` option para descriptografar
- Renderiza cada página com escala `2.0` para manter qualidade
- Converte canvas para JPEG via `toDataURL('image/jpeg', 0.95)`
- Reconstrói PDF com `jsPDF` — uma página por imagem, dimensões preservadas

### Saída
- **1 arquivo processado** → download imediato com sufixo `_sem_senha.pdf`
- **Múltiplos arquivos** → arquivo `PDFs_sem_senha.zip` via JSZip
- **Sucesso parcial** → arquivos que passaram são oferecidos para download; falhas exibem erro individual

### Erros tratados
| Código | Causa | Mensagem exibida |
|---|---|---|
| `PasswordException` (código 1) | Senha não fornecida | "Este PDF requer uma senha." |
| `PasswordException` (código 2) | Senha incorreta | "Senha incorreta para [arquivo]." |
| Outros | Arquivo corrompido ou não-PDF | "Erro ao processar [arquivo]: [detalhe]" |

### Limitações
- Funciona apenas com **senha de abertura** (user password) — não remove restrições de permissão (owner password)
- O PDF resultante é **rasterizado** (páginas como imagem) — texto não é selecionável
- Capacidade limitada pela memória do navegador (tipicamente 50–500 MB por arquivo)
- Requer navegador moderno com suporte a ES6+, Canvas API e Blob API

---

## ⚙️ Deploy

O deploy é automático via GitHub Actions (`.github/workflows/deploy.yml`):

1. Trigger: push na branch `main` ou dispatch manual
2. Permissões: `contents: read`, `pages: write`, `id-token: write`
3. Steps: checkout → setup-pages → upload-artifact → deploy-pages
4. **Sem build step** — arquivos estáticos são publicados diretamente

**Configuração inicial:**
1. Vá em **Settings → Pages**
2. Em **Source**, selecione **GitHub Actions**

---

## ⚠️ Notas de Segurança

- Nenhum dado é transmitido — processamento 100% local no navegador
- Não armazena senhas ou arquivos após o processamento
- Esta ferramenta **não quebra senhas** — o usuário precisa conhecer a senha do PDF
