// A small boxed message for the terminal, so the one URL you actually need is impossible to miss.
const on = !process.env.NO_COLOR;
const paint = (code, s) => (on ? `\x1b[${code}m${s}\x1b[0m` : s);

export function banner(lines) {
  const inner = Math.max(...lines.map((l) => l.length)) + 2;
  const row = (l, i) => paint('36', '│') + ' ' + (i === 0 ? paint('1', l) : l) + ' '.repeat(inner - l.length - 1) + paint('36', '│');
  return ['', paint('36', `┌${'─'.repeat(inner)}┐`), ...lines.map(row), paint('36', `└${'─'.repeat(inner)}┘`), ''].join('\n');
}
