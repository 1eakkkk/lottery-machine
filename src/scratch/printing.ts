// Monochrome line work follows the visual language of public scratched ticket samples.
// Persisted mark identifiers remain unchanged: presentation never alters prize evaluation.
const paths: Record<string, string> = {
  peach:
    '<path d="M32 18C13 7 4 31 15 47c9 14 25 14 34 0C62 29 49 9 32 18Zm0 0c-3 12-4 27 0 36M30 14C28 3 40 3 48 8c-7 7-12 8-18 6Z"/>',
  clover:
    '<path d="M32 31C6 28 11 4 27 12l5 12 5-12c16-8 21 16-5 19Zm0 0c27-5 28 18 13 21l-13-10-13 10c-15-3-14-26 13-21Zm0 9c2 11-2 16-9 21"/>',
  lantern:
    '<path d="M20 13h24M20 51h24M32 5v8m0 38v9M32 14C8 15 8 48 32 50c24-2 24-35 0-36Zm0 1c-14 4-14 28 0 34m0-34c14 4 14 28 0 34M26 54v7m12-7v7"/>',
  coin: '<circle cx="32" cy="32" r="24"/><circle cx="32" cy="32" r="19"/><path d="M26 25h12v14H26Z"/>',
  flower:
    '<path d="M32 25c-15-25-28-4-10 8-26 10-3 29 10 8 14 21 36 2 10-8 18-12 5-33-10-8Z"/><circle cx="32" cy="33" r="6"/><path d="M32 43v17m0-10c9-9 18-8 18-8-2 9-8 11-18 11"/>',
  cloud:
    '<path d="M15 46C-1 41 8 26 19 28c-1-18 25-23 30-6 17-4 23 18 9 25H15Zm4-16c8-8 16-2 13 5m8-8c6-5 13-1 11 5"/>',
  leaf: '<path d="M10 48C5 16 31 10 56 8c-2 26-10 51-35 47M9 59 48 18M23 46l-7-18m17 8 17 3m-9-12-4-13"/>',
  star: '<path d="m32 7 7 16 18 2-13 13 4 18-16-9-16 9 4-18L7 25l18-2Z"/>',
  cookie:
    '<path d="M56 29C50 28 44 22 45 15 19-2-1 24 12 46c15 25 49 11 44-17Z"/><circle cx="23" cy="21" r="2"/><circle cx="20" cy="38" r="2"/><circle cx="35" cy="44" r="2"/><circle cx="35" cy="27" r="2"/><circle cx="46" cy="38" r="2"/>',
  tea: '<path d="M12 26h34c3 35-34 35-34 0Zm34 3c21-7 21 21-3 14M9 55h41M23 23c-8-8 8-7 0-17m9 17c-8-8 8-7 0-17m9 17c-8-8 8-7 0-17"/>',
  cake: '<path d="m7 24 32-13 19 13-31 13Zm0 0v27l20 10 31-14V24M7 33l20 10 31-13M7 42l20 10 31-13m-31-2v24M31 18c-4-9 12-13 12-4s-9 7-12 4Z"/>',
  cherry:
    '<circle cx="20" cy="43" r="12"/><circle cx="45" cy="43" r="12"/><path d="M20 39c1-14 7-26 15-32 0 17 2 25 10 32M35 9c11-5 20 0 24 5-12 6-19 4-24-5M14 40l3-3m22 3 3-3"/>',
  pear: '<path d="M26 22C16 22 16 34 9 43 3 57 22 62 33 59 49 62 62 52 54 41 46 32 47 18 37 21c-3 2-8 2-11 1ZM33 22c-4-6 2-13 6-18M38 10c6-7 14-6 20-3-8 10-15 10-20 3Z"/>',
  candy:
    '<path d="m9 24 8 8-8 9-5-8Zm46 0-8 8 8 9 5-8ZM19 21h26l4 11-4 12H19l-4-12Zm6 0-6 23m14-23-6 23m14-23-6 23m10-22-6 22"/>',
  diamond:
    '<path d="m5 23 12-14h30l12 14-27 35Zm0 0h54M17 9l6 14 9 35 9-35 6-14M23 23l9-14 9 14"/>',
  fist: '<path d="M16 54V30c-9-2-10-14-4-15 5-1 8 6 10 9V12c0-9 10-9 10 0V9c0-9 10-8 10 0v4c0-8 10-7 10 1v12c10-1 9 14 2 23l-4 9H20Zm7-28h22c10 0 12 10 2 13H31m0-13v-8m11 8V18"/>',
};
const aliases: Record<string, string> = {
  福: "peach",
  安: "clover",
  乐: "lantern",
  吉: "coin",
  花: "flower",
  云: "cloud",
  叶: "leaf",
  星: "star",
  饼: "cookie",
  茶: "tea",
  糕: "cake",
  果: "cherry",
  糖果: "candy",
  "◇": "diamond",
  给力手势: "fist",
};
const labels: Record<string, string> = {
  peach: "桃",
  clover: "四叶草",
  lantern: "灯笼",
  coin: "铜钱",
  flower: "花",
  cloud: "云",
  leaf: "叶",
  star: "星",
  cookie: "饼干",
  tea: "茶杯",
  cake: "蛋糕",
  cherry: "樱桃",
  pear: "梨",
  candy: "糖果",
  diamond: "钻石",
  fist: "给力手势",
};
export function markHtml(mark: string): string {
  const icon = aliases[mark];
  if (icon)
    return `<span class="print-symbol" role="img" aria-label="${labels[icon]}"><svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${paths[icon]}</svg></span>`;
  if (mark === "积分") return "";
  const number = /^[0-9]+$/.test(mark),
    caption =
      mark === "喜"
        ? "XI"
        : mark === "囍"
          ? "SHUANGXI"
          : mark === "红"
            ? "HONG"
            : number
              ? romanNumber(Number(mark))
              : "";
  return `<span class="print-mark ${number ? "print-number" : "print-special"}"><b>${mark}</b><small>${caption}</small></span>`;
}
const syllables = [
  "LING",
  "YI",
  "ER",
  "SAN",
  "SI",
  "WU",
  "LIU",
  "QI",
  "BA",
  "JIU",
];
export function romanNumber(n: number): string {
  if (n < 10) return syllables[n];
  if (n < 20) return "SHI" + (n % 10 ? syllables[n % 10] : "");
  if (n < 100)
    return (
      syllables[Math.floor(n / 10)] + "SHI" + (n % 10 ? syllables[n % 10] : "")
    );
  for (const [value, name] of [
    [100000000, "YI"],
    [10000, "WAN"],
    [1000, "QIAN"],
    [100, "BAI"],
  ] as const)
    if (n >= value) {
      const rest = n % value;
      return (
        romanNumber(Math.floor(n / value)) +
        name +
        (rest ? (rest < value / 10 ? "LING" : "") + romanNumber(rest) : "")
      );
    }
  return "";
}
export function amountHtml(value: number, large = false): string {
  const size =
    String(value).length > 5 ? 2.8 : String(value).length > 3 ? 3.4 : 4.2;
  return `<div class="printed-award ${large ? "award-direct" : ""}" style="--amount-size:${size}cqw"><strong>¥${value}</strong><small>${romanNumber(value)}</small></div>`;
}
