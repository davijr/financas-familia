# PDF Password Remover 🔓

Ferramenta web gratuita e 100% client-side para remover senhas de arquivos PDF.

**🔒 Privacidade total** — nenhum arquivo é enviado para servidores. Todo o processamento acontece no seu navegador.

## 🌐 Acesse

👉 [**https://davijr.github.io/financas-familia/**](https://davijr.github.io/financas-familia/)

## 🚀 Como usar

1. Acesse a página
2. Arraste ou selecione um PDF protegido por senha
3. Digite a senha do PDF
4. Clique em **"Remover Senha"**
5. Baixe o PDF desbloqueado

## 🛠️ Stack

| Tecnologia | Uso |
|---|---|
| **pdf.js** (Mozilla) | Desencriptar e renderizar páginas do PDF |
| **jsPDF** | Montar novo PDF sem proteção |
| **GitHub Pages** | Hospedagem estática gratuita |
| **GitHub Actions** | Deploy automático a cada push |

## ⚠️ Notas

- O PDF resultante é uma versão "achatada" (páginas renderizadas como imagem), mas perfeitamente legível
- Funciona apenas com PDFs protegidos por **senha de abertura** (user password)
- Você precisa **saber a senha** — esta ferramenta não quebra senhas

## 📦 Deploy

O deploy é automático via GitHub Actions. A cada push na branch `main`, a página é atualizada no GitHub Pages.

Para habilitar pela primeira vez:
1. Vá em **Settings → Pages**
2. Em **Source**, selecione **GitHub Actions**