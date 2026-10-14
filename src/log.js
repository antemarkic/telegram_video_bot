// Pregledan terminalski log svih interakcija s vanjskim svijetom.
export const ICONS = {
  message: '✉️ ', // dolazna poruka
  output: '🖨️ ', // odgovor koji bot šalje
  twitter: '🐦',
  dropbox: '📦',
};

const MAX = Number(process.env.LOG_MAX) || 400;

const clip = (text) => {
  const s = typeof text === 'string' ? text : JSON.stringify(text);
  return s.length > MAX ? `${s.slice(0, MAX)}… (+${s.length - MAX} znakova)` : s;
};

export function log(kind, text) {
  const time = new Date().toLocaleTimeString('hr-HR', { hour12: false });
  const [first, ...rest] = clip(text).split('\n');
  console.log(`${time} ${ICONS[kind]} ${first}${rest.map((l) => `\n${' '.repeat(12)}${l}`).join('')}`);
}
