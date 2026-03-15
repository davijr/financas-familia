# CLAUDE.md — PDF Password Remover

Instruções para o agente Claude Code ao trabalhar neste repositório.

---

## Visão geral do projeto

Aplicação web **client-side** para remoção de senha de PDFs. Sem backend, sem build step, sem frameworks. Apenas HTML/CSS/JS com bibliotecas via CDN.

- **URL de produção:** https://davijr.github.io/financas-familia/
- **Deploy:** GitHub Pages via GitHub Actions (push em `main` → deploy automático)

---

## Stack e documentação oficial

| Tecnologia | Versão | Documentação |
|---|---|---|
| pdf.js (Mozilla) | 4.9.155 | https://mozilla.github.io/pdf.js/ |
| jsPDF | 2.5.1 | https://rawgit.com/MrRio/jsPDF/master/docs/ |
| JSZip | 3.10.1 | https://stuk.github.io/jszip/ |
| GitHub Actions | — | https://docs.github.com/en/actions |
| GitHub Pages | — | https://docs.github.com/en/pages |

**Regra obrigatória:** Antes de qualquer alteração nas bibliotecas, consultar a documentação oficial via MCP context7.

---

## Estrutura de arquivos

```
index.html          # Entry point — não adicionar frameworks aqui
js/app.js           # Toda a lógica da aplicação
css/style.css       # Todos os estilos — design system com CSS custom properties
.github/workflows/  # Não modificar sem necessidade — pipeline de deploy
```

---

## Regras de desenvolvimento

### O que NÃO fazer
- **Não adicionar frameworks** (React, Vue, Angular etc.) — o projeto é intencionalmente vanilla JS
- **Não adicionar build step** (Webpack, Vite, etc.) — os arquivos são servidos diretamente
- **Não mudar versões de CDN** sem testar — versões fixas garantem estabilidade
- **Não adicionar dependências de backend** — tudo deve rodar no navegador
- **Não criar arquivos de configuração desnecessários** (tsconfig, package.json, etc.)

### O que fazer
- Manter o código em `js/app.js` e `css/style.css` sem fragmentar em múltiplos arquivos
- Usar `async/await` para todo código assíncrono
- Exibir feedback visual de progresso para operações longas (renderização por página)
- Tratar erros de senha separando `PasswordException` código 1 (sem senha) e código 2 (senha errada)
- Manter UI responsiva — breakpoint em 480px

### Fluxo de processamento (não alterar sem boa razão)
1. pdf.js descriptografa com `password` na config de `getDocument()`
2. Renderização em canvas com escala `2.0` para qualidade
3. Conversão canvas → JPEG via `toDataURL('image/jpeg', 0.95)`
4. jsPDF monta novo PDF com `addImage()` por página
5. 1 arquivo → blob URL direto; N arquivos → JSZip → blob URL

---

## Regras de negócio críticas

1. **Mesma senha para todos os arquivos do lote** — não implementar senhas individuais por arquivo
2. **Sem quebra de senha** — exibir erro claro se a senha estiver errada
3. **Sucesso parcial permitido** — se alguns arquivos falharem, os que passaram devem ser disponibilizados para download
4. **Nenhum dado sai do navegador** — validar em qualquer nova feature

---

## Nomenclatura de arquivos

- PDFs processados: `[nome-original]_sem_senha.pdf`
- Batch download: `PDFs_sem_senha.zip`

---

## Deploy e CI/CD

- Branch de produção: `main`
- Qualquer push em `main` aciona o deploy automático
- Não há ambientes de staging — testar localmente antes de fazer push
- Para testar localmente: abrir `index.html` diretamente no navegador ou usar `npx serve .`

---

## Padrão de commits

Usar mensagens descritivas em português ou inglês:
- `feat: descrição` — nova funcionalidade
- `fix: descrição` — correção de bug
- `chore: descrição` — manutenção, atualização de deps
- `docs: descrição` — documentação
