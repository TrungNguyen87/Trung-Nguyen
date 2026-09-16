/**
 * A deliberately tiny markdown renderer.
 *
 * The Streamlit app passed every translated string through st.markdown, so
 * the copy in utils/i18n.py uses **bold**, *italic*, `code`, bullet lists,
 * headings and tables. Rather than rewrite 459 strings, we render the same
 * subset here.
 *
 * Scope is exactly what those strings use - no links, no images, no raw HTML
 * passthrough. Everything is escaped first (unless the caller has already
 * escaped the parts that came from a person), so this can never introduce
 * markup a child or parent typed into an input.
 */

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(text) {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}

function renderTableRow(line, cellTag) {
  const cells = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => `<${cellTag}>${inline(c.trim())}</${cellTag}>`)
    .join("");
  return `<tr>${cells}</tr>`;
}

const isTableRow = (line) => /^\s*\|.*\|\s*$/.test(line);
const isTableDivider = (line) => /^\s*\|[\s:|-]+\|\s*$/.test(line);

/**
 * Render `text` as HTML.
 * @param {string} text
 * @param {{escape?: boolean}} [options] escape:false when the caller has
 *   already escaped the untrusted parts (see i18n.tMd).
 */
export function markdown(text, options = {}) {
  const { escape = true } = options;
  const source = escape ? escapeHtml(text) : text;
  const lines = source.split("\n");
  const out = [];
  let list = null; // "ul" | "ol" | null
  let paragraph = [];

  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  const closeParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      closeParagraph();
      closeList();
      continue;
    }

    // Table: a header row, a |---|---| divider, then any number of rows.
    if (isTableRow(line) && isTableDivider(lines[i + 1] || "")) {
      closeParagraph();
      closeList();
      const head = renderTableRow(line, "th");
      const body = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) {
        body.push(renderTableRow(lines[i], "td"));
        i++;
      }
      i--;
      out.push(
        `<div class="kmg-table-scroll"><table><thead>${head}</thead><tbody>${body.join("")}</tbody></table></div>`,
      );
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeParagraph();
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      closeParagraph();
      closeList();
      out.push("<hr>");
      continue;
    }

    const bullet = trimmed.match(/^[-*+]\s+(.*)$/);
    const numbered = trimmed.match(/^\d+\.\s+(.*)$/);
    if (bullet || numbered) {
      closeParagraph();
      const wanted = bullet ? "ul" : "ol";
      if (list !== wanted) {
        closeList();
        out.push(`<${wanted}>`);
        list = wanted;
      }
      out.push(`<li>${inline((bullet || numbered)[1])}</li>`);
      continue;
    }

    closeList();
    paragraph.push(trimmed);
  }

  closeParagraph();
  closeList();
  return out.join("");
}
