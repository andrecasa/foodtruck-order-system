// Gerador de PDF para docs/landingpage.md
// -----------------------------------------------------------------------------
// Converte o Markdown em um HTML estilizado (identidade visual do order-system)
// e o imprime em PDF via Google Chrome headless.
//
// Uso:
//   node docs/gerar-pdf.mjs
//   node docs/gerar-pdf.mjs --keep-html   # mantém o HTML intermediário para debug
//
// Requisitos: Node >= 20 e Google Chrome instalado (`google-chrome`).
// Não há dependências npm — parser de Markdown simples embutido, suficiente
// para a estrutura usada em landingpage.md (h1/h2/h3, listas, ênfase,
// código inline, blockquote e separadores).
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Configuração ------------------------------------------------------------
const SOURCE_MD = join(__dirname, 'landingpage.md');
const OUTPUT_PDF = join(__dirname, 'landingpage.pdf');
const TEMP_HTML = join(__dirname, '.landingpage.tmp.html');
const CHROME_BIN = process.env.CHROME_BIN || 'google-chrome';
const keepHtml = process.argv.includes('--keep-html');

// --- Markdown -> HTML --------------------------------------------------------
const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Aplica formatação inline: **negrito**, *itálico* e `código`. */
function inline(text) {
  let t = esc(text);
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
  t = t.replace(/`(.+?)`/g, '<code>$1</code>');
  return t;
}

/** Converte o corpo Markdown no corpo HTML correspondente. */
function markdownToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let inList = false;
  // Acumula os parágrafos de um blockquote em curso. Linhas `>` consecutivas
  // (incluindo `>` vazias, que separam parágrafos) formam UM único bloco.
  let quoteParas = null;

  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };
  const closeQuote = () => {
    if (quoteParas !== null) {
      const paras = quoteParas
        .map((p) => p.trim())
        .filter((p) => p !== '')
        .map((p) => `<p>${inline(p)}</p>`)
        .join('\n');
      out.push(`<blockquote>\n${paras}\n</blockquote>`);
      quoteParas = null;
    }
  };
  const closeBlocks = () => {
    closeList();
    closeQuote();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Linhas de citação: `>` sozinho ou `> conteúdo`.
    if (line === '>' || line.startsWith('> ')) {
      closeList();
      if (quoteParas === null) quoteParas = [''];
      const content = line === '>' ? '' : line.slice(2);
      if (content === '') {
        // Separador de parágrafo dentro do bloco: inicia um novo parágrafo.
        if (quoteParas[quoteParas.length - 1] !== '') quoteParas.push('');
      } else {
        // Anexa ao parágrafo corrente (mantém quebras suaves como espaço).
        const idx = quoteParas.length - 1;
        quoteParas[idx] = quoteParas[idx] ? `${quoteParas[idx]} ${content}` : content;
      }
      continue;
    }

    if (line === '') {
      closeBlocks();
      continue;
    }
    if (line === '---') {
      closeBlocks();
      out.push('<hr/>');
      continue;
    }
    if (line.startsWith('### ')) {
      closeBlocks();
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      closeBlocks();
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith('# ')) {
      closeBlocks();
      out.push(`<h1>${inline(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith('- ')) {
      closeQuote();
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    }
    closeBlocks();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeBlocks();
  return out.join('\n');
}

// --- Template / estilo (paleta do design system) -----------------------------
const STYLE = `
  @page { size: A4; margin: 22mm 20mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #1f2933;
    line-height: 1.6;
    font-size: 11.5pt;
    margin: 0;
  }
  h1 {
    font-size: 30pt;
    font-weight: 700;
    color: #2c6e9b;
    margin: 0 0 6pt;
    letter-spacing: -0.5px;
  }
  h1 + p { font-size: 13pt; color: #52606d; }
  h2 {
    font-size: 15pt;
    font-weight: 600;
    color: #1f2933;
    margin: 22pt 0 8pt;
    padding-bottom: 5pt;
    border-bottom: 2px solid #eef3f7;
    break-after: avoid;
    page-break-after: avoid;
  }
  h3 {
    font-size: 12.5pt;
    font-weight: 600;
    color: #2c6e9b;
    margin: 14pt 0 6pt;
    break-after: avoid;
    page-break-after: avoid;
  }
  p { margin: 0 0 8pt; }
  ul { margin: 0 0 10pt; padding-left: 0; list-style: none; }
  li {
    position: relative;
    padding-left: 20pt;
    margin-bottom: 6pt;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  li::before {
    content: "";
    position: absolute;
    left: 4pt;
    top: 7.5pt;
    width: 6pt;
    height: 6pt;
    background: #2c6e9b;
    border-radius: 50%;
  }
  li strong { color: #1f2933; font-weight: 600; }
  em { color: #52606d; }
  code {
    font-family: "SFMono-Regular", Consolas, monospace;
    background: #eef3f7;
    padding: 1pt 4pt;
    border-radius: 3px;
    font-size: 10pt;
  }
  hr { border: none; height: 0; margin: 4pt 0; }
  blockquote {
    margin: 20pt 0 0;
    padding: 14pt 18pt;
    background: #eef3f7;
    border-left: 4px solid #2c6e9b;
    border-radius: 6px;
    font-size: 12.5pt;
    font-weight: 500;
    color: #1f2933;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  blockquote p { margin: 0 0 8pt; }
  blockquote p:last-child { margin-bottom: 0; }
`;

function buildHtml(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<style>${STYLE}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

// --- Execução ----------------------------------------------------------------
const md = readFileSync(SOURCE_MD, 'utf8');
const html = buildHtml(markdownToHtml(md));
writeFileSync(TEMP_HTML, html, 'utf8');

try {
  execFileSync(
    CHROME_BIN,
    [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--no-pdf-header-footer',
      `--print-to-pdf=${OUTPUT_PDF}`,
      TEMP_HTML,
    ],
    { stdio: 'inherit' },
  );
  console.log(`PDF gerado: ${OUTPUT_PDF}`);
} finally {
  if (!keepHtml) rmSync(TEMP_HTML, { force: true });
}
