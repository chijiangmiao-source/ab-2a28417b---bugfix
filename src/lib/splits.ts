// 核心领域逻辑：物种与候选分裂解析、互补规范化、四交集兼容性判定、
// 精确最大兼容集求解（先总权重、再数量、最后规范序列字典序），以及候选三分类。
// 纯函数实现，不依赖 DOM / 网络，可在浏览器与 Node（verify 验收）中复用。

export interface SpeciesParse {
  names: string[];
  errors: string[];
}

export interface Candidate {
  id: number; // 有效候选序号（1 起）
  line: number; // 原始输入行号（1 起）
  weight: number;
  mask: number; // 规范掩码：不含首个物种的一侧
  flipped: boolean; // 录入侧是否含首个物种（即规范化时是否取了补）
  side: string[]; // 规范侧物种名（字典序）
  rest: string[]; // 另一侧物种名（字典序）
  label: string; // 规范标签：规范侧名以空格连接，用于排序与字典序比较
  display: string; // 展示形式 "侧 | 余"
}

export interface LineError {
  line: number;
  text: string; // 原始行文本（保留原文）
  message: string;
}

export interface SplitParse {
  candidates: Candidate[];
  lineErrors: LineError[];
  errors: string[]; // 全局错误（数量约束等）
}

export interface Score {
  weight: number;
  count: number;
}

export type Verdict = 'required' | 'optional' | 'never';

export interface Analysis {
  score: Score;
  chosen: number[]; // 展示解的候选下标（0 起，按规范标签字典序）
  verdicts: Verdict[];
  compat: boolean[][];
}

const NAME_RE = /^[\x21-\x7E]+$/; // 可打印 ASCII、不含空白

export function fullMask(n: number): number {
  return (1 << n) - 1;
}

export function popcount(x: number): number {
  x = x - ((x >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >>> 24;
}

/** 解析物种列表：4–12 个唯一 ASCII 名，空白或逗号分隔。 */
export function parseSpecies(text: string): SpeciesParse {
  const errors: string[] = [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const tok of text.split(/[\s,]+/).filter(Boolean)) {
    if (!NAME_RE.test(tok)) {
      errors.push(`物种名「${tok}」非法：仅允许可打印 ASCII 且不含空白`);
      continue;
    }
    if (tok.includes('|') || tok.includes(':')) {
      errors.push(`物种名「${tok}」含保留字符「|」或「:」`);
      continue;
    }
    if (seen.has(tok)) {
      errors.push(`物种名重复：「${tok}」`);
      continue;
    }
    seen.add(tok);
    names.push(tok);
  }
  if (names.length < 4 || names.length > 12) {
    errors.push(`物种数量须为 4–12，当前有效数量 ${names.length}`);
  }
  return { names, errors };
}

/**
 * 解析候选分裂。每行格式：`权重: 侧A | 侧B`（冒号可省，侧B 可省，省略时取补集）。
 * 非平凡：两侧均 ≥2；互补分裂视为同一项并拒绝重复。
 */
export function parseSplits(text: string, names: string[]): SplitParse {
  const lineErrors: LineError[] = [];
  const errors: string[] = [];
  const candidates: Candidate[] = [];
  const indexOf = new Map<string, number>(names.map((nm, i) => [nm, i]));
  const n = names.length;
  const full = fullMask(n);
  const seenMasks = new Map<number, number>(); // 规范掩码 -> 候选 id

  text.split('\n').forEach((rawLine, li) => {
    const lineNo = li + 1;
    const trimmed = rawLine.trim();
    if (!trimmed) return;
    const fail = (message: string) => lineErrors.push({ line: lineNo, text: rawLine, message });

    // 权重
    let weightStr: string;
    let rest: string;
    const colon = trimmed.indexOf(':');
    if (colon >= 0) {
      weightStr = trimmed.slice(0, colon).trim();
      rest = trimmed.slice(colon + 1);
    } else {
      const m = /^(\S+)\s+([\s\S]+)$/.exec(trimmed);
      if (!m) {
        fail('格式应为「权重: 物种… | 物种…」');
        return;
      }
      weightStr = m[1];
      rest = m[2];
    }
    if (!/^\d+$/.test(weightStr)) {
      fail(`权重须为正整数，收到「${weightStr}」`);
      return;
    }
    const weight = parseInt(weightStr, 10);
    if (weight < 1) {
      fail('权重须为正整数（≥1）');
      return;
    }

    // 两侧
    const parts = rest.split('|');
    if (parts.length > 2) {
      fail('至多允许一个「|」分隔两侧');
      return;
    }
    const sideA = parts[0].split(/[\s,]+/).filter(Boolean);
    const sideB = parts.length === 2 ? parts[1].split(/[\s,]+/).filter(Boolean) : null;
    if (sideA.length === 0) {
      fail('至少给出一侧物种');
      return;
    }
    if (sideB !== null && sideB.length === 0) {
      fail('「|」右侧为空');
      return;
    }

    const all = sideB === null ? sideA : [...sideA, ...sideB];
    for (const nm of all) {
      if (!indexOf.has(nm)) {
        fail(`未知物种：「${nm}」`);
        return;
      }
    }
    const dup = all.find((nm, i) => all.indexOf(nm) !== i);
    if (dup !== undefined) {
      fail(`分裂内物种重复：「${dup}」`);
      return;
    }

    let maskA = 0;
    for (const nm of sideA) maskA |= 1 << (indexOf.get(nm) as number);
    let maskB: number;
    if (sideB === null) {
      maskB = full ^ maskA;
    } else {
      maskB = 0;
      for (const nm of sideB) maskB |= 1 << (indexOf.get(nm) as number);
      if ((maskA | maskB) !== full) {
        fail('两侧并集须覆盖全部物种');
        return;
      }
    }
    const sizeA = popcount(maskA);
    const sizeB = popcount(maskB);
    if (sizeA < 2 || sizeB < 2) {
      fail(`平凡分裂被拒绝（两侧均须 ≥2，当前 ${sizeA} | ${sizeB}）`);
      return;
    }

    // 互补规范化：规范侧 = 不含首个物种的一侧
    let mask = maskA;
    let flipped = false;
    if ((mask & 1) !== 0) {
      mask = full ^ mask;
      flipped = true;
    }
    const prev = seenMasks.get(mask);
    if (prev !== undefined) {
      fail(`与候选 #${prev} 重复（互补分裂视为同一项）`);
      return;
    }

    const side = names.filter((_, i) => ((mask >> i) & 1) === 1).sort();
    const restNames = names.filter((_, i) => ((mask >> i) & 1) === 0).sort();
    const id = candidates.length + 1;
    seenMasks.set(mask, id);
    candidates.push({
      id,
      line: lineNo,
      weight,
      mask,
      flipped,
      side,
      rest: restNames,
      label: side.join(' '),
      display: `${side.join(' ')} | ${restNames.join(' ')}`,
    });
  });

  if (candidates.length === 0) errors.push('至少需要 1 个有效候选分裂');
  if (candidates.length > 28) errors.push(`候选分裂数量须 ≤ 28，当前 ${candidates.length}`);
  return { candidates, lineErrors, errors };
}

/** 兼容性：两个分裂的四种两侧交集至少一个为空。对互补规范化不变。 */
export function compatible(a: number, b: number, n: number): boolean {
  const full = fullMask(n);
  if ((a & b) === 0) return true;
  if ((a & (full ^ b)) === 0) return true;
  if (((full ^ a) & b) === 0) return true;
  if ((full ^ (a | b)) === 0) return true;
  return false;
}

function better(a: Score, b: Score): boolean {
  return a.weight > b.weight || (a.weight === b.weight && a.count > b.count);
}

function sameScore(a: Score, b: Score): boolean {
  return a.weight === b.weight && a.count === b.count;
}

/**
 * 精确求解带约束的最大兼容集：先最大化总权重，再最大化数量。
 * forcedIn 中的候选必选，forcedOut 中的候选禁用；约束不可行时返回 null。
 * 分支定界：候选 ≤28，用位掩码表示剩余候选集；上界 = 当前权重 + 剩余权重和。
 * 剩余权重和与剩余候选数随递归参数递推（O(1) 剪枝判定）；
 * 相容的非平凡分裂集合大小 ≤ n-3（二歧树内部分裂数），用于数量剪枝。
 *
 * 注意：不得按「同权邻居集包含」预删候选——那种支配替换只保持最优得分，
 * 却会抹掉同优解之间的等权替代（如 CE↔DE），使字典序展示解与三分类失真。
 * 得分、展示解与三分类必须在同一批完整候选身份上求解。
 */
export function solveMaxCompatible(
  masks: number[],
  weights: number[],
  n: number,
  forcedIn: number[] = [],
  forcedOut: ReadonlySet<number> = new Set<number>(),
): Score | null {
  const m = masks.length;
  const inSet = new Set(forcedIn);
  for (const i of forcedIn) if (forcedOut.has(i)) return null;
  for (let a = 0; a < forcedIn.length; a++) {
    for (let b = a + 1; b < forcedIn.length; b++) {
      if (!compatible(masks[forcedIn[a]], masks[forcedIn[b]], n)) return null;
    }
  }

  let baseW = 0;
  let baseC = 0;
  for (const i of forcedIn) {
    baseW += weights[i];
    baseC++;
  }

  // 自由候选：未被强制、且与全部必选兼容
  const free: number[] = [];
  for (let i = 0; i < m; i++) {
    if (inSet.has(i) || forcedOut.has(i)) continue;
    let ok = true;
    for (const j of forcedIn) {
      if (!compatible(masks[i], masks[j], n)) {
        ok = false;
        break;
      }
    }
    if (ok) free.push(i);
  }
  free.sort((a, b) => weights[b] - weights[a] || a - b); // 权重降序（同权按序号），尽早找到好解

  const k = free.length;
  const w = free.map((i) => weights[i]);
  const compatBits: number[] = new Array<number>(k);
  for (let i = 0; i < k; i++) {
    let bits = 1 << i;
    for (let j = 0; j < k; j++) {
      if (i !== j && compatible(masks[free[i]], masks[free[j]], n)) bits |= 1 << j;
    }
    compatBits[i] = bits;
  }
  const maxCount = n - 3; // 相容非平凡分裂集的大小上界

  let best: Score = { weight: baseW, count: baseC };
  let initSumW = 0;
  for (let i = 0; i < k; i++) initSumW += w[i];

  // cands：剩余候选位集；sumW/cnt 为其中权重和与数量（随分支递推，免去逐位遍历）。
  function rec(cands: number, sumW: number, cnt: number, cw: number, cc: number): void {
    if (cw + sumW < best.weight) return;
    if (cw + sumW === best.weight && cc + cnt <= best.count) return;
    if (cands === 0) {
      const cur = { weight: cw, count: cc };
      if (better(cur, best)) best = cur;
      return;
    }
    const b = cands & -cands;
    const i = 31 - Math.clz32(b);
    // 选 i：剔除与 i 不兼容的其余候选，并同步扣减它们的权重和与数量。
    if (cc + 1 <= maxCount) {
      const next = cands & compatBits[i] & ~b;
      let dropW = 0;
      let dropCnt = 0;
      for (let mm = cands & ~b & ~compatBits[i]; mm !== 0; ) {
        const db = mm & -mm;
        dropW += w[31 - Math.clz32(db)];
        dropCnt++;
        mm ^= db;
      }
      rec(next, sumW - w[i] - dropW, cnt - 1 - dropCnt, cw + w[i], cc + 1);
    }
    // 不选 i。
    rec(cands & ~b, sumW - w[i], cnt - 1, cw, cc);
  }

  rec((1 << k) - 1, initSumW, k, baseW, baseC);
  return best;
}

/**
 * 完整分析：兼容矩阵、最优得分、字典序最小展示解、候选三分类。
 * 三分类基于全部前两级（总权重、数量）同优解：
 * 必选＝出现在每个同优解；可选＝出现在部分同优解；从不选＝不出现在任何同优解。
 */
export function analyze(
  masks: number[],
  weights: number[],
  labels: string[],
  n: number,
): Analysis {
  const m = masks.length;

  const compat: boolean[][] = [];
  for (let i = 0; i < m; i++) {
    const row: boolean[] = [];
    for (let j = 0; j < m; j++) row.push(i === j || compatible(masks[i], masks[j], n));
    compat.push(row);
  }

  // 得分、展示解、三分类一律在同一批完整候选身份上求解，
  // 不做会抹掉等权替代关系的预删减。
  const best = solveMaxCompatible(masks, weights, n);
  if (best === null) throw new Error('空集恒可行，不应无解');

  // 字典序最小展示解：按规范标签升序贪心，能选则选。
  // 若某同优解含更小标签的分裂而另一解不含，则前者的规范序列必然后缀无关地更小，
  // 故逐步「可行即选」可得到字典序最小序列。
  const order = [...masks.keys()].sort((a, b) =>
    labels[a] < labels[b] ? -1 : labels[a] > labels[b] ? 1 : 0,
  );
  const chosen: number[] = [];
  const forcedOut = new Set<number>();
  for (const i of order) {
    const s = solveMaxCompatible(masks, weights, n, [...chosen, i], forcedOut);
    if (s !== null && sameScore(s, best)) chosen.push(i);
    else forcedOut.add(i);
  }

  // 三分类：含 i 仍达最优 ⇒ 出现在某些同优解；禁 i 后不达最优 ⇒ 每个同优解都含 i。
  const verdicts: Verdict[] = [];
  for (let i = 0; i < m; i++) {
    const withI = solveMaxCompatible(masks, weights, n, [i]);
    const inSome = withI !== null && sameScore(withI, best);
    const withoutI = solveMaxCompatible(masks, weights, n, [], new Set([i]));
    const inAll = !(withoutI !== null && sameScore(withoutI, best));
    if (inAll) verdicts.push('required');
    else if (!inSome) verdicts.push('never');
    else verdicts.push('optional');
  }

  return { score: best, chosen, verdicts, compat };
}
