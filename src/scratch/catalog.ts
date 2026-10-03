export type Mechanic =
  "double" | "all" | "mixed" | "candy" | "line" | "diamond" | "seven";
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Zone extends Rect {
  kind: "round" | "lucky";
  index: number;
}
export interface ScratchGame {
  id: string;
  mechanic: Mechanic;
  title: string;
  subtitle: string;
  family: string;
  ink: string;
  paper: string;
  accent: string;
  emblem: string;
  rule: string;
  source: string;
  art: string;
  artSource: string;
  crop: Rect;
  ratio: number;
  zones: Zone[];
  patches: Rect[];
  tiers: number[];
  denomination: number;
  ticketsPerBook: number;
  bonus: number;
  luckyCount: number;
  partialTiers?: boolean;
  printStyle?: "burst-v2";
}
const hb = (id: number) =>
  `https://www.yzfcw.com/game/gglNewsContent?classficationId=82&newsId=${id}`;
const full = { x: 0, y: 0, w: 1, h: 1 };
const grid = (
  cols: number,
  rows: number,
  x: number,
  y: number,
  w: number,
  h: number,
  dx: number,
  dy: number,
  offset = 0,
): Zone[] =>
  Array.from({ length: cols * rows }, (_, i) => ({
    x: x + (i % cols) * dx,
    y: y + Math.floor(i / cols) * dy,
    w,
    h,
    kind: "round",
    index: offset + i,
  }));
const lucky = (x: number, y: number, w: number, h: number): Zone => ({
  x,
  y,
  w,
  h,
  kind: "lucky",
  index: 0,
});
const common = {
  printStyle: "burst-v2" as const,
  paper: "#ffe4a7",
  accent: "#eac987",
};
export const CATALOG: ScratchGame[] = [
  {
    id: "xxf20",
    mechanic: "double",
    title: "喜相逢 · 20版",
    subtitle: "财运亨通 · 25 个刮区",
    family: "符号",
    ink: "#e60026",
    ...common,
    emblem: "囍",
    rule: "刮出「喜」得下方积分；「囍」得两倍。各格兼中兼得。",
    source: hb(18886),
    art: "/scratch-art/xxf20.jpg",
    artSource: "https://www.yzfcw.com/img/xxf_1675645739294.jpg",
    crop: full,
    ratio: 0.5,
    zones: grid(5, 5, 0.172, 0.396, 0.121, 0.064, 0.136, 0.07),
    patches: [
      { x: 0.76, y: 0.013, w: 0.205, h: 0.043 },
      { x: 0.275, y: 0.336, w: 0.45, h: 0.037 },
      { x: 0.18, y: 0.75, w: 0.64, h: 0.077 },
    ],
    tiers: [800000, 5000, 1000, 500, 200, 100, 50, 40, 30, 20],
    denomination: 20,
    ticketsPerBook: 30,
    bonus: 0,
    luckyCount: 0,
  },
  {
    id: "xxf30",
    mechanic: "double",
    title: "喜相逢 · 30版",
    subtitle: "喜事连连 · 40 个刮区",
    family: "符号",
    ink: "#e60026",
    ...common,
    emblem: "囍",
    rule: "刮出「喜」得下方积分；「囍」得两倍。各格兼中兼得。",
    source: hb(19630),
    art: "/scratch-art/xxf30.jpg",
    artSource:
      "https://www.yzfcw.com/img/979bf490-138a-4dbc-bc08-91ce1e4353c9.jpg",
    crop: full,
    ratio: 0.4,
    zones: grid(5, 8, 0.167, 0.322, 0.125, 0.05, 0.136, 0.0555),
    patches: [
      { x: 0.77, y: 0.014, w: 0.2, h: 0.033 },
      { x: 0.25, y: 0.275, w: 0.49, h: 0.033 },
      { x: 0.183, y: 0.773, w: 0.638, h: 0.07 },
    ],
    tiers: [1000000, 200000, 10000, 900, 600, 300, 100, 80, 60, 50, 40, 30],
    denomination: 30,
    ticketsPerBook: 20,
    bonus: 0,
    luckyCount: 0,
  },
  {
    id: "xxf50",
    mechanic: "double",
    title: "喜相逢 · 50版",
    subtitle: "国泰民安 · 55 个刮区",
    family: "符号",
    ink: "#e60026",
    ...common,
    emblem: "囍",
    rule: "上方五个灯笼刮出积分直接获得；下方「喜」得一倍，「囍」得两倍。两个玩法兼中兼得。",
    source: hb(19626),
    art: "/scratch-art/xxf50.jpg",
    artSource:
      "https://www.yzfcw.com/img/b11ca068-0274-4145-9a16-763e4dae2df5.jpg",
    crop: { x: 0, y: 0, w: 0.5, h: 1 },
    ratio: 1 / 3,
    zones: [
      ...grid(5, 1, 0.17, 0.275, 0.13, 0.042, 0.137, 0),
      ...grid(5, 10, 0.169, 0.355, 0.129, 0.045, 0.137, 0.0465, 5),
    ],
    patches: [
      { x: 0.793, y: 0.011, w: 0.18, h: 0.025 },
      { x: 0.254, y: 0.229, w: 0.49, h: 0.037 },
      { x: 0.193, y: 0.325, w: 0.62, h: 0.027 },
      { x: 0.17, y: 0.822, w: 0.66, h: 0.056 },
    ],
    tiers: [1000000, 10000, 1000, 800, 500, 300, 150, 100, 80, 50],
    denomination: 50,
    ticketsPerBook: 20,
    bonus: 5,
    luckyCount: 0,
  },
  {
    id: "cgl50",
    mechanic: "all",
    title: "超给力 · 50版",
    subtitle: "号码匹配 · 给力手势全中",
    family: "号码",
    ink: "#e90018",
    ...common,
    emblem: "✊",
    rule: "我的号码与任意中奖号码相同获得积分；出现给力手势，获得玩法区所有积分之和，不重复计算号码奖励。",
    source: hb(19628),
    art: "/scratch-art/cgl50.jpg",
    artSource:
      "https://www.yzfcw.com/img/242da10d-f0bb-4fa0-a895-172f764f0480.jpg",
    crop: full,
    ratio: 1 / 3,
    zones: [
      ...grid(5, 10, 0.065, 0.294, 0.152, 0.047, 0.18, 0.063),
      lucky(0.074, 0.2, 0.85, 0.065),
    ],
    patches: [
      { x: 0.79, y: 0.013, w: 0.18, h: 0.02 },
      { x: 0.462, y: 0.161, w: 0.425, h: 0.023 },
      { x: 0.058, y: 0.916, w: 0.883, h: 0.037 },
    ],
    tiers: [1000000, 100000, 10000, 1000, 500, 300, 100, 80, 70, 60, 50],
    denomination: 50,
    ticketsPerBook: 20,
    bonus: 0,
    luckyCount: 5,
  },
  {
    id: "zdh50",
    mechanic: "mixed",
    title: "正当红 · 50版",
    subtitle: "直接揭示积分＋号码匹配",
    family: "号码",
    ink: "#e50022",
    ...common,
    emblem: "红",
    rule: "玩法一刮出积分直接获得；玩法二号码与中奖号码相同，或刮出「红」图符，获得下方积分。两个玩法兼中兼得。",
    source: hb(19629),
    art: "/scratch-art/zdh50.jpg",
    artSource:
      "https://www.yzfcw.com/img/bce1c787-2468-4abf-bc8f-9fff65422504.jpg",
    crop: full,
    ratio: 650 / 1960,
    zones: [
      ...grid(3, 1, 0.175, 0.232, 0.202, 0.066, 0.22, 0),
      ...grid(4, 1, 0.07, 0.29, 0.19, 0.067, 0.22, 0, 3),
      ...grid(3, 1, 0.18, 0.356, 0.2, 0.066, 0.22, 0, 7),
      ...grid(5, 5, 0.087, 0.584, 0.16, 0.048, 0.167, 0.0604, 10),
      lucky(0.3, 0.494, 0.393, 0.076),
    ],
    patches: [
      { x: 0.798, y: 0.01, w: 0.18, h: 0.022 },
      { x: 0.25, y: 0.171, w: 0.5, h: 0.027 },
      { x: 0.04, y: 0.447, w: 0.91, h: 0.014 },
      { x: 0.023, y: 0.905, w: 0.95, h: 0.035 },
    ],
    tiers: [1000000, 100000, 10000, 1000, 500, 150, 100, 50],
    denomination: 50,
    ticketsPerBook: 20,
    bonus: 10,
    luckyCount: 2,
  },
  {
    id: "candy20",
    mechanic: "candy",
    title: "糖果派对 · 20版",
    subtitle: "糖果图符＋三图符匹配",
    family: "符号",
    ink: "#42318d",
    ...common,
    emblem: "◈",
    rule: "玩法一刮出积分直接获得；糖果图符固定获得100积分。玩法二每局三个相同图符获得该局积分，共六局。奖励可叠加。",
    source: hb(19640),
    art: "/scratch-art/candy20.jpg",
    artSource:
      "https://www.yzfcw.com/img/8f96cbc8-3720-46f7-b77d-852ff3032b94.jpg",
    crop: { x: 0, y: 0, w: 1 / 3, h: 1 },
    ratio: 3620 / 3 / 2400,
    zones: [
      ...grid(5, 4, 0.061, 0.316, 0.128, 0.077, 0.184, 0.0757),
      ...grid(2, 3, 0.048, 0.685, 0.414, 0.063, 0.48, 0.063, 20),
    ],
    patches: [
      { x: 0.78, y: 0.015, w: 0.18, h: 0.036 },
      { x: 0.45, y: 0.219, w: 0.4, h: 0.039 },
      { x: 0.145, y: 0.288, w: 0.72, h: 0.025 },
      { x: 0.08, y: 0.624, w: 0.81, h: 0.042 },
      { x: 0.043, y: 0.879, w: 0.92, h: 0.034 },
    ],
    tiers: [500000, 10000, 1000, 500, 200, 100, 50, 30, 20],
    denomination: 20,
    ticketsPerBook: 30,
    bonus: 20,
    luckyCount: 0,
  },
  {
    id: "luck88",
    mechanic: "diamond",
    title: "幸运88 · 30版",
    subtitle: "15 行号码 · 钻石十倍",
    family: "号码",
    ink: "#0378b4",
    ...common,
    emblem: "88",
    rule: "每行任意号码与中奖号码相同得该行积分；钻石图符得该行积分的十倍。同一行计一次，各行兼中兼得。",
    source: hb(19633),
    art: "/scratch-art/luck88.jpg",
    artSource:
      "https://www.yzfcw.com/img/7900d069-7876-41de-961e-535647f6ae2b.jpg",
    crop: { x: 0, y: 0, w: 1 / 3, h: 1 },
    ratio: 0.4,
    zones: [
      { x: 0.297, y: 0.19, w: 0.604, h: 0.044, kind: "round", index: 0 },
      ...grid(1, 14, 0.061, 0.235, 0.84, 0.044, 0, 0.0467, 1),
      lucky(0.045, 0.151, 0.23, 0.084),
    ],
    patches: [
      { x: 0.793, y: 0.012, w: 0.184, h: 0.027 },
      { x: 0.478, y: 0.012, w: 0.31, h: 0.025 },
      { x: 0.091, y: 0.9, w: 0.832, h: 0.037 },
    ],
    tiers: [880000, 100000, 10000, 1000, 600, 500, 300, 100, 60, 50, 30],
    denomination: 30,
    ticketsPerBook: 20,
    bonus: 0,
    luckyCount: 1,
  },
  {
    id: "luck99",
    mechanic: "diamond",
    title: "幸运99 · 50版",
    subtitle: "17 行号码 · 钻石十倍",
    family: "号码",
    ink: "#b67400",
    ...common,
    emblem: "99",
    rule: "每行任意号码与中奖号码相同得该行积分；钻石图符得该行积分的十倍。同一行计一次，各行兼中兼得。",
    source: hb(19624),
    art: "/scratch-art/luck99.jpg",
    artSource:
      "https://www.yzfcw.com/img/c793a35d-af6f-46d4-b24d-00ddb17a196a.jpg",
    crop: { x: 0, y: 0, w: 1 / 3, h: 1 },
    ratio: 3040 / 3 / 3020,
    zones: [
      { x: 0.421, y: 0.163, w: 0.5, h: 0.039, kind: "round", index: 0 },
      ...grid(1, 16, 0.069, 0.207, 0.851, 0.039, 0, 0.04435, 1),
      lucky(0.04, 0.122, 0.34, 0.084),
    ],
    patches: [
      { x: 0.804, y: 0.012, w: 0.17, h: 0.024 },
      { x: 0.501, y: 0.014, w: 0.29, h: 0.02 },
      { x: 0.104, y: 0.915, w: 0.818, h: 0.035 },
    ],
    tiers: [990000, 500000, 100000, 10000, 1000, 800, 500, 200, 150, 100, 50],
    denomination: 50,
    ticketsPerBook: 20,
    bonus: 0,
    luckyCount: 1,
  },
  {
    id: "password30",
    mechanic: "line",
    title: "财富密码 · 30版",
    subtitle: "六局九宫格＋密码匹配",
    family: "连线",
    ink: "#252619",
    ...common,
    emblem: "⌗",
    rule: "前六局任一行、列或斜线有三个相同数字得该局积分，每局计一次；下方我的密码与中奖密码相同得对应积分。两个玩法兼中兼得。",
    source: hb(18531),
    art: "/scratch-art/password30.jpg",
    artSource:
      "https://www.yzfcw.com/img/596250a5-6970-4620-a756-a9e85bbef5d4.jpg",
    crop: full,
    ratio: 748 / 1869,
    zones: [
      ...grid(2, 3, 0.104, 0.19, 0.389, 0.181, 0.41, 0.185),
      ...grid(3, 1, 0.292, 0.818, 0.194, 0.074, 0.209, 0, 6),
      lucky(0.1, 0.818, 0.172, 0.074),
    ],
    patches: [
      { x: 0.743, y: 0.022, w: 0.19, h: 0.027 },
      { x: 0.15, y: 0.057, w: 0.401, h: 0.03 },
      { x: 0.075, y: 0.167, w: 0.85, h: 0.014 },
      { x: 0.075, y: 0.746, w: 0.86, h: 0.051 },
    ],
    tiers: [1000000, 50000, 10000, 1000, 300, 100, 60, 50, 30],
    denomination: 30,
    ticketsPerBook: 20,
    bonus: 6,
    luckyCount: 1,
  },
  {
    id: "tc7",
    mechanic: "seven",
    title: "体彩「7」· 20版",
    subtitle: "绿草票面 · 7 / 77 / 777",
    family: "符号",
    ink: "#6b8723",
    ...common,
    emblem: "7",
    rule: "刮出7得一倍、77得两倍、777得三倍。各格兼中兼得。暂只模拟已核实的部分奖级，完整表待补齐。",
    source:
      "https://www.sport.gov.cn/n20001280/n20745751/n20767297/c21179307/content.html",
    art: "/scratch-art/tc7-four.png",
    artSource: "https://gdlottery.cn/u/cms/www/202608/191415525e79.png",
    crop: { x: 0.75, y: 0, w: 0.25, h: 1 },
    ratio: 0.5,
    zones: grid(5, 4, 0.055, 0.575, 0.145, 0.065, 0.19, 0.073),
    patches: [
      { x: 0.46, y: 0, w: 0.52, h: 0.049 },
      { x: 0.58, y: 0.425, w: 0.4, h: 0.085 },
      { x: 0.025, y: 0.873, w: 0.95, h: 0.05 },
    ],
    tiers: [1000000, 300, 50],
    denomination: 20,
    ticketsPerBook: 30,
    bonus: 0,
    luckyCount: 0,
    partialTiers: true,
  },
];
export const gameById = (id: string) =>
  CATALOG.find((g) => g.id === id) ?? CATALOG[0];
export const ISSUE_SIZE = 600000,
  PRINT_REVISION = "real-sim-2";
export interface PrizeTier {
  units: number;
  count: number;
}
export interface PrizePool {
  id: string;
  size: number;
  tiers: PrizeTier[];
  awardTotal: number;
}
// Published simulation quantities, not official award counts.
export function poolFor(g: ScratchGame, size = ISSUE_SIZE): PrizePool {
  if (
    !Number.isInteger(size) ||
    size < 1000 ||
    size > 2 ** 30 ||
    size % g.ticketsPerBook
  )
    throw Error("Invalid issue size");
  if (g.id === "tc7" && size !== ISSUE_SIZE)
    throw Error("Partial tier edition uses its published simulation size");
  if (g.id === "tc7")
    return {
      id: `${g.id}-${PRINT_REVISION}`,
      size,
      tiers: [
        { units: 1000000, count: 1 },
        { units: 300, count: 7200 },
        { units: 50, count: 92800 },
        { units: 0, count: 499999 },
      ],
      awardTotal: 7800000,
    };
  const awardTotal = (size * g.denomination * 65) / 100,
    tiers = g.tiers.map((units) => ({ units, count: 1 })),
    low = tiers.at(-1)!,
    next = tiers.at(-2)!;
  for (const t of tiers.slice(0, -2))
    t.count = Math.max(1, Math.floor((awardTotal * 0.028) / t.units));
  low.count = size / 5;
  let remaining =
    awardTotal -
    tiers.slice(0, -2).reduce((s, t) => s + t.units * t.count, 0) -
    low.units * low.count;
  next.count = Math.floor(remaining / next.units);
  while (
    next.count >= 0 &&
    (remaining - next.count * next.units) % low.units !== 0
  )
    next.count--;
  if (next.count < 0) throw Error("Cannot balance award total");
  low.count += (remaining - next.count * next.units) / low.units;
  const wins = tiers.reduce((s, t) => s + t.count, 0);
  if (
    wins > size ||
    tiers.reduce((s, t) => s + t.units * t.count, 0) !== awardTotal
  )
    throw Error("Invalid prize group");
  tiers.push({ units: 0, count: size - wins });
  return { id: `${g.id}-${PRINT_REVISION}`, size, tiers, awardTotal };
}
export function poolStats(g: ScratchGame, p = poolFor(g)) {
  const count = (f: (n: number) => boolean) =>
    p.tiers.filter((t) => f(t.units)).reduce((s, t) => s + t.count, 0);
  return {
    size: p.size,
    awardTotal: p.awardTotal,
    winRate: count((n) => n > 0) / p.size,
    equalRate: count((n) => n === g.denomination) / p.size,
    aboveRate: count((n) => n > g.denomination) / p.size,
    zeroRate: count((n) => n === 0) / p.size,
    ratio: p.awardTotal / (p.size * g.denomination),
  };
}
