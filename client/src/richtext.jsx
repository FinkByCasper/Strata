import React from 'react';

// Tiny, safe markdown subset (**bold**, *italic*, `code`, "- " lists). Output is React elements
// only, never raw HTML, so shared diagrams can't inject markup.
const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

function inline(text) {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

export function RichText({ text }) {
  if (!text) return null;
  const blocks = [];
  let list = null;
  text.split('\n').forEach((line, i) => {
    const m = /^\s*[-*]\s+(.*)$/.exec(line);
    if (m) {
      if (!list) { list = []; blocks.push(<ul key={`l${i}`}>{list}</ul>); }
      list.push(<li key={i}>{inline(m[1])}</li>);
    } else {
      list = null;
      if (line.trim()) blocks.push(<p key={i}>{inline(line)}</p>);
    }
  });
  return <div className="rich">{blocks}</div>;
}
