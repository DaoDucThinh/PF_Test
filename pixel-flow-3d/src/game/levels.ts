export interface PaletteEntry {
  name: string;
  hex: number;
}

export const PALETTE: Record<string, PaletteEntry> = {
  R: { name: 'Red', hex: 0xff3b4e },
  O: { name: 'Orange', hex: 0xff8c1a },
  Y: { name: 'Yellow', hex: 0xffd23a },
  G: { name: 'Green', hex: 0x22b84a },
  L: { name: 'Lime', hex: 0x9be33a },
  C: { name: 'Sky', hex: 0x55cfff },
  B: { name: 'Blue', hex: 0x2f62ff },
  V: { name: 'Violet', hex: 0x9a5cff },
  P: { name: 'Pink', hex: 0xff74c4 },
  W: { name: 'White', hex: 0xf7f4ee },
  K: { name: 'Black', hex: 0x34364f },
  N: { name: 'Brown', hex: 0x9a5b2e },
  S: { name: 'Cream', hex: 0xffd6a0 },
};

export interface Theme {
  floor: number;
  floorDots: number;
  platform: number;
  accent: number;
}

export interface LevelDef {
  name: string;
  art: string[];
  bg?: string;
  lanes: number;
  capacity: number;
  slots: number;
  theme: Theme;
}

export interface PigSpec {
  color: string;
  ammo: number;
}

export interface Cell {
  col: number;
  row: number;
  color: string;
}

export interface BuiltLevel {
  def: LevelDef;
  index: number;
  cols: number;
  rows: number;
  cells: (Cell | null)[];
  lanes: PigSpec[][];
}

const THEMES: Theme[] = [
  { floor: 0xbfd8ff, floorDots: 0xaecaf7, platform: 0xf4f6ff, accent: 0x6a7dff },
  { floor: 0xffd3e6, floorDots: 0xf9c0d9, platform: 0xfff6fa, accent: 0xff6fae },
  { floor: 0xcff3d9, floorDots: 0xbbe9c8, platform: 0xf6fff8, accent: 0x34c06a },
  { floor: 0xffe6b8, floorDots: 0xf8d89f, platform: 0xfffaf0, accent: 0xff9a2e },
  { floor: 0xdccfff, floorDots: 0xcbbbfa, platform: 0xf9f6ff, accent: 0x8a5cff },
];

function proc(cols: number, rows: number, fn: (x: number, y: number) => string): string[] {
  const out: string[] = [];
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) line += fn(x, y);
    out.push(line);
  }
  return out;
}

const sunflower = proc(16, 17, (x, y) => {
  const cx = 7.5;
  const cy = 6.5;
  const dx = x - cx;
  const dy = y - cy;
  const d = Math.hypot(dx, dy);
  const a = Math.atan2(dy, dx);
  if (d < 2.4) return (x + y) % 3 === 0 ? 'K' : 'N';
  const petal = 3.4 + 2.8 * Math.pow(Math.abs(Math.cos(a * 4)), 0.8);
  if (d < petal && y < 12) return d < 3.3 ? 'O' : Math.floor((a + Math.PI + Math.PI / 8) / (Math.PI / 4)) % 2 === 0 ? 'Y' : 'O';
  if (y > 10 && (x === 7 || x === 8)) return 'G';
  const lx = x - 4.5;
  const ly = y - 13;
  if (lx * lx / 7 + ly * ly / 1.5 < 1) return 'L';
  const rx = x - 11;
  const ry = y - 12;
  if (rx * rx / 6 + ry * ry / 1.3 < 1) return 'L';
  if (y >= 15) return 'G';
  return '.';
});

const rainbow = proc(18, 13, (x, y) => {
  const d = Math.hypot(x - 8.5, (y - 11.5) * 1.05);
  const cloud = (cx: number, cy: number, r: number) => Math.hypot(x - cx, (y - cy) * 1.2) < r;
  if (cloud(2.5, 11, 2.6) || cloud(4.8, 11.8, 2.2) || cloud(0.8, 12.2, 1.8)) return 'W';
  if (cloud(15, 11, 2.6) || cloud(12.6, 11.8, 2.2) || cloud(16.9, 12.2, 1.8)) return 'W';
  const bands = ['V', 'B', 'G', 'Y', 'O', 'R'];
  const i = Math.floor(d - 4);
  if (i >= 0 && i < bands.length) return bands[i];
  if ((x * 7 + y * 13) % 23 === 0 && y < 6) return 'Y';
  return '.';
});

export const LEVELS: LevelDef[] = [
  {
    name: 'Heart',
    lanes: 2,
    capacity: 5,
    slots: 5,
    theme: THEMES[1],
    art: [
      '..RRR.RRR..',
      '.RWWRRRRRR.',
      'RRWRRRRRRRR',
      'RRRRRRRRRRR',
      'RRRRRRRRRPR',
      '.RRRRRRRPR.',
      '..RRRRRPR..',
      '...RRRRR...',
      '....RRR....',
      '.....R.....',
    ],
  },
  {
    name: 'Mushroom',
    lanes: 3,
    capacity: 5,
    slots: 5,
    bg: 'C',
    theme: THEMES[0],
    art: [
      '....RRRR....',
      '..RRWWRRRR..',
      '.RRWWWWRRRR.',
      '.RRRWWRRRWR.',
      'RRRRRRRRWWWR',
      'RWWRRRRRRWRR',
      'RWWWRRRRRRRR',
      '.RRRRRRRRRR.',
      '...SSSSSS...',
      '...SSSSSS...',
      '...SSSSSS...',
      '....SSSS....',
      'LLLLLLLLLLLL',
    ],
  },
  {
    name: 'Strawberry',
    lanes: 3,
    capacity: 5,
    slots: 5,
    bg: 'C',
    theme: THEMES[2],
    art: [
      '....G..G....',
      '...GGGGGG...',
      '..GGLGGLGG..',
      '.RRRGGGGRRR.',
      'RRRYRRRRRYRR',
      'RRRRRRYRRRRR',
      'RYRRRRRRRYRR',
      'RRRRRYRRRRRR',
      '.RRYRRRRRYR.',
      '.RRRRRRYRRR.',
      '..RRYRRRRR..',
      '...RRRRRR...',
      '....RRRR....',
    ],
  },
  {
    name: 'Rubber Duck',
    lanes: 3,
    capacity: 5,
    slots: 5,
    bg: 'C',
    theme: THEMES[3],
    art: [
      '..............',
      '.....YYYY.....',
      '....YYYYYY....',
      '....YYKYYYOO..',
      '....YYYYYOOOO.',
      '.....YYYYOO...',
      '......YYY.....',
      '.Y...YYYYYY...',
      '.YY.YYYYYYYY..',
      '.YYYYYYWWYYYY.',
      '.YYYYYYYWWYYY.',
      '..YYYYYYYYYY..',
      'BBBBBBBBBBBBBB',
      'BWBBBBBBBBBWBB',
      'BBBBBBBBBBBBBB',
    ],
  },
  {
    name: 'Ice Cream',
    lanes: 3,
    capacity: 5,
    slots: 5,
    bg: 'P',
    theme: THEMES[1],
    art: [
      '.....RR.....',
      '.....RR.....',
      '...WWWWWW...',
      '..WWRWWBWW..',
      '.WWWWWWWWYW.',
      '.WBWWYWWWWW.',
      '.WWWWWWRWWW.',
      '.WWYWWWWWBW.',
      'OOOOOOOOOOOO',
      '.ONOONOONOO.',
      '..OONOONOO..',
      '..ONOONOON..',
      '...OONOONO..',
      '...ONOONO...',
      '....OONO....',
      '.....OO.....',
    ],
  },
  {
    name: 'Ginger Cat',
    lanes: 4,
    capacity: 5,
    slots: 5,
    bg: 'V',
    theme: THEMES[4],
    art: [
      '.O..........O.',
      '.OO........OO.',
      '.OPO......OPO.',
      '.OPOOOOOOOOPO.',
      '.OOOOOOOOOOOO.',
      'OOOOOOOOOOOOOO',
      'OOKKOOOOOOKKOO',
      'OOKWOOOOOOKWOO',
      'OOOOOOPPOOOOOO',
      'WWOOOOOOOOOOWW',
      'OOOOOKOOKOOOOO',
      '.OOOOOKKOOOOO.',
      '..OOOOOOOOOO..',
    ],
  },
  {
    name: 'Watermelon',
    lanes: 4,
    capacity: 5,
    slots: 5,
    bg: 'Y',
    theme: THEMES[2],
    art: [
      '................',
      '................',
      'RRRRRRRRRRRRRRRR',
      'RRKRRRRRKRRRRKRR',
      'WRRRRKRRRRRKRRRW',
      'GWRRRRRRRRRRRRWG',
      '.GWRRKRRRRKRRWG.',
      '..GWWRRRRRRWWG..',
      '...GGWWWWWWGG...',
      '.....GGGGGG.....',
      '................',
    ],
  },
  {
    name: 'Froggy',
    lanes: 4,
    capacity: 5,
    slots: 5,
    bg: 'C',
    theme: THEMES[0],
    art: [
      '..GGG....GGG..',
      '.GWWWG..GWWWG.',
      '.GWKWGGGGWKWG.',
      '.GWWWGGGGWWWG.',
      'GGGGGGGGGGGGGG',
      'GGGGGGGGGGGGGG',
      'GPPGGGGGGGGPPG',
      'GGKGGGGGGGGKGG',
      'GGGKKKKKKKKGGG',
      '.GGGGGGGGGGGG.',
      '..GLLLLLLLLG..',
      '.GGLLLLLLLLGG.',
      'GGG.GGGGGG.GGG',
    ],
  },
  {
    name: 'Night Ghost',
    lanes: 4,
    capacity: 5,
    slots: 5,
    bg: 'B',
    theme: THEMES[4],
    art: [
      '.Y............',
      '.....WWWW...Y.',
      '...WWWWWWWW...',
      '..WWWWWWWWWW..',
      '.WWWKKWWWKKWW.',
      '.WWWKKWWWKKWW.',
      'WWWWWWWWWWWWWW',
      'WWWWPWWWWPWWWW',
      'WWWWWWKKWWWWWW',
      'WWWWWWKKWWWWWW',
      'WWWWWWWWWWWWWW',
      'WWWWWWWWWWWWWW',
      'WW.WWW..WWW.WW',
      'W...W.Y..W...W',
      '..Y........Y..',
    ],
  },
  {
    name: 'Sunflower',
    lanes: 4,
    capacity: 5,
    slots: 5,
    bg: 'C',
    theme: THEMES[3],
    art: sunflower,
  },
  {
    name: 'Panda',
    lanes: 4,
    capacity: 5,
    slots: 5,
    bg: 'L',
    theme: THEMES[2],
    art: [
      '.KKK........KKK.',
      'KKKKK......KKKKK',
      'KKKWWWWWWWWWWKKK',
      '.KWWWWWWWWWWWWK.',
      '.WWWWWWWWWWWWWW.',
      'WWKKKWWWWWWKKKWW',
      'WKKWKKWWWWKKWKKW',
      'WKKKKKWWWWKKKKKW',
      'WWKKKWWWWWWKKKWW',
      'WWWWWWWKKWWWWWWW',
      'WWPWWWWKKWWWWPWW',
      '.WWWWWKWWKWWWWW.',
      '..WWWWWWWWWWWW..',
      '....WWWWWWWW....',
    ],
  },
  {
    name: 'Rainbow',
    lanes: 4,
    capacity: 5,
    slots: 5,
    bg: 'C',
    theme: THEMES[0],
    art: rainbow,
  },
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Peel the picture outside-in: each layer is every cube visible from one of the four belt sides. */
export function peelLayers(cols: number, rows: number, cells: (Cell | null)[]): Cell[][] {
  const alive = cells.map((c) => c !== null);
  const layers: Cell[][] = [];
  let remaining = alive.filter(Boolean).length;
  while (remaining > 0) {
    const visible = new Set<number>();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) if (alive[r * cols + c]) { visible.add(r * cols + c); break; }
      for (let c = cols - 1; c >= 0; c--) if (alive[r * cols + c]) { visible.add(r * cols + c); break; }
    }
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) if (alive[r * cols + c]) { visible.add(r * cols + c); break; }
      for (let r = rows - 1; r >= 0; r--) if (alive[r * cols + c]) { visible.add(r * cols + c); break; }
    }
    const layer: Cell[] = [];
    for (const i of visible) {
      alive[i] = false;
      layer.push(cells[i] as Cell);
    }
    remaining -= layer.length;
    layers.push(layer);
  }
  return layers;
}

export function buildLevel(index: number): BuiltLevel {
  const loop = Math.floor(index / LEVELS.length);
  const base = LEVELS[index % LEVELS.length];
  const def: LevelDef = loop === 0 ? base : {
    ...base,
    lanes: Math.min(4, base.lanes + 1),
    capacity: Math.max(3, base.capacity - loop),
    slots: Math.max(4, base.slots - (loop > 1 ? 1 : 0)),
  };
  const rows = def.art.length;
  const cols = Math.max(...def.art.map((l) => l.length));
  const cells: (Cell | null)[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let ch = def.art[r][c] ?? '.';
      if (ch === '.' && def.bg) ch = def.bg;
      cells.push(PALETTE[ch] ? { col: c, row: r, color: ch } : null);
    }
  }

  const rand = mulberry32(1337 + index * 7919);
  const layers = peelLayers(cols, rows, cells);
  const total = cells.filter(Boolean).length;
  const tier = Math.min(1, index / 8);
  const unit = Math.max(3, Math.round(total / (12 + tier * 10)));
  const denoms = [unit, unit, Math.round(unit * 1.5), unit * 2];
  const remaining: Record<string, number> = {};
  for (const c of cells) if (c) remaining[c.color] = (remaining[c.color] ?? 0) + 1;
  const acc: Record<string, number> = {};
  const target: Record<string, number> = {};
  const pick = (color: string) => Math.min(denoms[Math.floor(rand() * denoms.length)], remaining[color]);
  const order: PigSpec[] = [];

  for (const layer of layers) {
    const counts = new Map<string, number>();
    for (const c of layer) counts.set(c.color, (counts.get(c.color) ?? 0) + 1);
    for (const [color, n] of counts) {
      acc[color] = (acc[color] ?? 0) + n;
      if (target[color] === undefined) target[color] = pick(color);
      while (remaining[color] > 0 && acc[color] >= target[color]) {
        order.push({ color, ammo: target[color] });
        remaining[color] -= target[color];
        acc[color] -= target[color];
        target[color] = pick(color);
      }
    }
  }
  for (const color of Object.keys(remaining)) {
    if (remaining[color] > 0) order.push({ color, ammo: remaining[color] });
  }

  const swapChance = index === 0 ? 0 : 0.18 + tier * 0.3;
  const reach = 1 + Math.round(tier * 2);
  for (let i = 0; i < order.length - 1; i++) {
    if (rand() < swapChance) {
      const j = Math.min(order.length - 1, i + 1 + Math.floor(rand() * reach));
      [order[i], order[j]] = [order[j], order[i]];
    }
  }

  const lanes: PigSpec[][] = Array.from({ length: def.lanes }, () => []);
  order.forEach((p, i) => lanes[i % def.lanes].push(p));
  return { def, index, cols, rows, cells, lanes };
}
