import { describe, expect, it } from 'vitest';
import {
  analyze,
  compatible,
  parseSpecies,
  parseSplits,
  popcount,
  solveMaxCompatible,
} from '../src/lib/splits';

const SPECIES6 = 'A B C D E F';

function analyzeOk(species: string, splits: string) {
  const sp = parseSpecies(species);
  expect(sp.errors).toEqual([]);
  const r = parseSplits(splits, sp.names);
  expect(r.errors).toEqual([]);
  expect(r.lineErrors).toEqual([]);
  const an = analyze(
    r.candidates.map((c) => c.mask),
    r.candidates.map((c) => c.weight),
    r.candidates.map((c) => c.label),
    sp.names.length,
  );
  return { sp, r, an };
}

describe('parseSpecies', () => {
  it('接受 4–12 个唯一 ASCII 名（空白/逗号分隔）', () => {
    const r = parseSpecies('A, B  C\nD E');
    expect(r.errors).toEqual([]);
    expect(r.names).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('拒绝重复名', () => {
    const r = parseSpecies('A B C D B');
    expect(r.errors.some((e) => e.includes('重复'))).toBe(true);
  });

  it('拒绝非 ASCII 与保留字符', () => {
    expect(parseSpecies('A B C β').errors.some((e) => e.includes('非法'))).toBe(true);
    expect(parseSpecies('A B C D|E').errors.length).toBeGreaterThan(0);
    expect(parseSpecies('A B C D:E').errors.length).toBeGreaterThan(0);
  });

  it('拒绝数量越界', () => {
    expect(parseSpecies('A B C').errors.some((e) => e.includes('4–12'))).toBe(true);
    const thirteen = Array.from({ length: 13 }, (_, i) => `s${i}`).join(' ');
    expect(parseSpecies(thirteen).errors.some((e) => e.includes('4–12'))).toBe(true);
  });
});

describe('parseSplits', () => {
  const names = parseSpecies('A B C D E').names;

  it('单侧录入时另一侧取补集，并做互补规范化', () => {
    const r = parseSplits('3: A B', names);
    expect(r.lineErrors).toEqual([]);
    expect(r.candidates).toHaveLength(1);
    const c = r.candidates[0];
    expect(c.weight).toBe(3);
    expect(c.flipped).toBe(true); // 录入侧含首个物种 A，已取补
    expect(c.label).toBe('C D E');
    expect(c.display).toBe('C D E | A B');
  });

  it('双侧录入且并集须覆盖全部物种', () => {
    const ok = parseSplits('3: C D E | A B', names);
    expect(ok.lineErrors).toEqual([]);
    expect(ok.candidates[0].label).toBe('C D E');
    const bad = parseSplits('3: A B | C D', names);
    expect(bad.lineErrors.some((e) => e.message.includes('并集'))).toBe(true);
  });

  it('互补分裂视为同一项并拒绝重复', () => {
    const r = parseSplits('3: A B\n4: C D E', names);
    expect(r.candidates).toHaveLength(1);
    expect(r.lineErrors).toHaveLength(1);
    expect(r.lineErrors[0].line).toBe(2);
    expect(r.lineErrors[0].message).toContain('重复');
    expect(r.lineErrors[0].text).toBe('4: C D E'); // 保留原文
  });

  it('拒绝平凡分裂（两侧均须 ≥2）', () => {
    expect(parseSplits('2: A', names).lineErrors.some((e) => e.message.includes('平凡'))).toBe(
      true,
    );
    expect(
      parseSplits('2: A B C D', names).lineErrors.some((e) => e.message.includes('平凡')),
    ).toBe(true);
  });

  it('拒绝未知物种与分裂内重复', () => {
    expect(
      parseSplits('2: A Z', names).lineErrors.some((e) => e.message.includes('未知物种')),
    ).toBe(true);
    expect(
      parseSplits('2: A B B', names).lineErrors.some((e) => e.message.includes('重复')),
    ).toBe(true);
  });

  it('拒绝非正整数权重', () => {
    for (const line of ['0: A B', 'x: A B', '-3: A B', '2.5: A B']) {
      expect(parseSplits(line, names).lineErrors.length).toBeGreaterThan(0);
    }
  });

  it('冒号可省略，空行跳过', () => {
    const r = parseSplits('\n3 A B\n\n', names);
    expect(r.lineErrors).toEqual([]);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].weight).toBe(3);
  });

  it('有效候选数量约束为 1–28', () => {
    expect(parseSplits('', names).errors.some((e) => e.includes('至少需要 1 个'))).toBe(true);
    const many = parseSpecies(Array.from({ length: 12 }, (_, i) => `s${i}`).join(' ')).names;
    const lines: string[] = [];
    for (let i = 1; i < 12 && lines.length < 29; i++) {
      for (let j = i + 1; j < 12 && lines.length < 29; j++) {
        lines.push(`1: s${i} s${j}`);
      }
    }
    expect(lines).toHaveLength(29);
    const r = parseSplits(lines.join('\n'), many);
    expect(r.candidates).toHaveLength(29);
    expect(r.errors.some((e) => e.includes('≤ 28'))).toBe(true);
  });
});

describe('compatible（四交集判定）', () => {
  it('四分类单元上的三个非平凡分裂两两不兼容', () => {
    // 物种 [A,B,C,D]：AB|CD、AC|BD、AD|BC 的规范掩码
    const cd = 0b1100;
    const bd = 0b1010;
    const bc = 0b0110;
    expect(compatible(cd, bd, 4)).toBe(false);
    expect(compatible(cd, bc, 4)).toBe(false);
    expect(compatible(bd, bc, 4)).toBe(false);
    expect(compatible(cd, cd, 4)).toBe(true);
  });

  it('一侧包含关系或不相交时兼容', () => {
    // 物种 [A,B,C,D,E]：AB|CDE 规范为 CDE，DE|ABC 规范为 DE
    const cde = 0b11100;
    const de = 0b11000;
    expect(compatible(cde, de, 5)).toBe(true);
  });
});

describe('solveMaxCompatible / analyze', () => {
  it('高权陷阱：精确解胜过逐条贪心', () => {
    // x=AB(9) 与 y=AC(5)、z=BE(5) 均冲突；y、z、w=DF(2) 两两兼容
    const { an } = analyzeOk(SPECIES6, ['9: A B', '5: A C', '5: B E', '2: D F'].join('\n'));
    expect(an.score).toEqual({ weight: 12, count: 3 }); // 贪心先拿 9 只得 11
    expect(an.chosen).toEqual([1, 2, 3]);
    expect(an.verdicts).toEqual(['never', 'required', 'required', 'required']);
  });

  it('三分类：必选 / 可选 / 从不选，且展示解字典序最小', () => {
    // r=AB(10) 必选；o1=CD(5)、o2=CE(5) 互换（各同优解取其一）；z=AC(12) 与 r 冲突从不选
    const { r, an } = analyzeOk(SPECIES6, ['10: A B', '5: C D', '5: C E', '12: A C'].join('\n'));
    expect(an.score).toEqual({ weight: 15, count: 2 });
    expect(an.verdicts).toEqual(['required', 'optional', 'optional', 'never']);
    // 两个同优解 {r,o1}、{r,o2}：规范序列 ["C D","C D E F"] < ["C D E F","C E"]
    // chosen 按规范标签字典序给出：o1("C D") 在 r("C D E F") 之前
    expect(new Set(an.chosen)).toEqual(new Set([0, 1]));
    expect(an.chosen.map((i) => r.candidates[i].label)).toEqual(['C D', 'C D E F']);
  });

  it('总权重相同则分裂数量多者优', () => {
    // p=AB(4) 与 q=AC(2)、r=BE(2) 均冲突；q、r 兼容
    const { an } = analyzeOk(SPECIES6, ['4: A B', '2: A C', '2: B E'].join('\n'));
    expect(an.score).toEqual({ weight: 4, count: 2 });
    expect(an.chosen).toEqual([1, 2]);
    expect(an.verdicts).toEqual(['never', 'required', 'required']);
  });

  it('兼容矩阵对称且对角为真', () => {
    const { an } = analyzeOk(SPECIES6, ['10: A B', '5: C D', '5: C E', '12: A C'].join('\n'));
    const m = an.compat.length;
    for (let i = 0; i < m; i++) {
      expect(an.compat[i][i]).toBe(true);
      for (let j = 0; j < m; j++) expect(an.compat[i][j]).toBe(an.compat[j][i]);
    }
    expect(an.compat[0][1]).toBe(true); // r 与 o1 兼容
    expect(an.compat[1][2]).toBe(false); // o1 与 o2 冲突
    expect(an.compat[0][3]).toBe(false); // r 与 z 冲突
  });

  it('约束求解：不可行返回 null，禁用约束生效', () => {
    const { r, sp } = analyzeOk(SPECIES6, ['10: A B', '5: C D', '5: C E', '12: A C'].join('\n'));
    const masks = r.candidates.map((c) => c.mask);
    const weights = r.candidates.map((c) => c.weight);
    const n = sp.names.length;
    expect(solveMaxCompatible(masks, weights, n, [0, 3])).toBeNull(); // r 与 z 冲突
    expect(solveMaxCompatible(masks, weights, n, [], new Set([0]))).toEqual({
      weight: 12,
      count: 1,
    }); // 禁用 r 后只剩 z=12
  });
});

describe('7 物种 12 候选并列场景：CE/DE 等权替代（回归）', () => {
  const SPECIES7 = 'A B C D E F G';
  // (权重, 规范侧物种)；规范侧均不含首个物种 A
  const SPEC: ReadonlyArray<readonly [number, string]> = [
    [4, 'B C D E G'],
    [3, 'B C D E'],
    [3, 'C D E'],
    [2, 'C E'],
    [2, 'D E'],
    [1, 'D E F'],
    [1, 'B C'],
    [1, 'B G'],
    [1, 'F G'],
    [1, 'C D F'],
    [1, 'E G'],
    [1, 'B C F'],
  ];
  const REQUIRED_LABELS = ['B C D E', 'B C D E G', 'C D E'];
  const OPTIONAL_LABELS = ['C E', 'D E'];
  const EXPECTED_SEQ = ['B C D E', 'B C D E G', 'C D E', 'C E'];

  function run(lines: string[]) {
    const sp = parseSpecies(SPECIES7);
    expect(sp.errors).toEqual([]);
    const r = parseSplits(lines.join('\n'), sp.names);
    expect(r.errors).toEqual([]);
    expect(r.lineErrors).toEqual([]);
    expect(r.candidates).toHaveLength(12);
    const masks = r.candidates.map((c) => c.mask);
    const weights = r.candidates.map((c) => c.weight);
    const labels = r.candidates.map((c) => c.label);
    const an = analyze(masks, weights, labels, sp.names.length);
    const byLabel = new Map(labels.map((l, i) => [l, i]));
    return { r, an, masks, weights, labels, byLabel };
  }

  /** 仅凭兼容矩阵 + 权重做 2^m 暴力枚举，独立复算得分、规范序列与三分类。 */
  function recomputeViaMatrix(
    compat: boolean[][],
    weights: number[],
    labels: string[],
  ): { weight: number; count: number; seq: string[]; verdicts: string[] } {
    const m = weights.length;
    let bestW = -1;
    let bestC = -1;
    const optimal: number[][] = [];
    for (let s = 0; s < 1 << m; s++) {
      const mem: number[] = [];
      for (let i = 0; i < m; i++) if (s & (1 << i)) mem.push(i);
      let ok = true;
      for (let a = 0; a < mem.length && ok; a++) {
        for (let b = a + 1; b < mem.length; b++) {
          if (!compat[mem[a]][mem[b]]) {
            ok = false;
            break;
          }
        }
      }
      if (!ok) continue;
      const w = mem.reduce((x, i) => x + weights[i], 0);
      if (w > bestW || (w === bestW && mem.length > bestC)) {
        bestW = w;
        bestC = mem.length;
        optimal.length = 0;
        optimal.push(mem);
      } else if (w === bestW && mem.length === bestC) {
        optimal.push(mem);
      }
    }
    const seq = optimal
      .map((mem) => mem.map((i) => labels[i]).sort())
      .sort((a, b) => {
        for (let i = 0; i < Math.min(a.length, b.length); i++)
          if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
        return a.length - b.length;
      })[0];
    const verdicts = weights.map((_, i) => {
      const inAll = optimal.every((mem) => mem.includes(i));
      const inSome = optimal.some((mem) => mem.includes(i));
      return inAll ? 'required' : inSome ? 'optional' : 'never';
    });
    return { weight: bestW, count: bestC, seq, verdicts };
  }

  it('得分 12/4，展示解取 CE，CE 与 DE 均可选，三条共存分裂必选', () => {
    const { r, an, byLabel } = run(SPEC.map(([w, side]) => `${w}: ${side}`));

    expect(an.score).toEqual({ weight: 12, count: 4 });
    expect(an.chosen.map((i) => r.candidates[i].label)).toEqual(EXPECTED_SEQ);

    for (const l of REQUIRED_LABELS) expect(an.verdicts[byLabel.get(l)!]).toBe('required');
    for (const l of OPTIONAL_LABELS) expect(an.verdicts[byLabel.get(l)!]).toBe('optional');
    const optionalOrRequired = new Set([...REQUIRED_LABELS, ...OPTIONAL_LABELS]);
    for (const [, side] of SPEC) {
      if (!optionalOrRequired.has(side)) expect(an.verdicts[byLabel.get(side)!]).toBe('never');
    }

    // 恰有两个同优解，展示解是其中字典序更小者
    const witnessA = ['B C D E G', 'B C D E', 'C D E', 'C E'];
    const witnessB = ['B C D E G', 'B C D E', 'C D E', 'D E'];
    for (const witness of [witnessA, witnessB]) {
      const idx = witness.map((l) => byLabel.get(l)!);
      const wsum = idx.reduce((x, i) => x + r.candidates[i].weight, 0);
      expect(wsum).toBe(12);
      for (let a = 0; a < idx.length; a++)
        for (let b = a + 1; b < idx.length; b++)
          expect(an.compat[idx[a]][idx[b]]).toBe(true);
    }
    // CE 与 DE 互斥，二者只在同优解间替代
    expect(an.compat[byLabel.get('C E')!][byLabel.get('D E')!]).toBe(false);
  });

  it('兼容矩阵可独立复算：重算得分、规范序列、三分类与分析一致', () => {
    const { an, masks, weights, labels } = run(SPEC.map(([w, side]) => `${w}: ${side}`));
    // 矩阵本身与四交集判定逐条一致、对称、对角为真
    expect(an.compat).toHaveLength(12);
    for (let i = 0; i < 12; i++) {
      expect(an.compat[i][i]).toBe(true);
      for (let j = 0; j < 12; j++) {
        expect(an.compat[i][j]).toBe(compatible(masks[i], masks[j], 7));
        expect(an.compat[i][j]).toBe(an.compat[j][i]);
      }
    }
    const rec = recomputeViaMatrix(an.compat, weights, labels);
    expect({ weight: rec.weight, count: rec.count }).toEqual(an.score);
    expect(rec.seq).toEqual(EXPECTED_SEQ);
    expect(rec.seq).toEqual(an.chosen.map((i) => labels[i]));
    expect(rec.verdicts).toEqual(an.verdicts);
  });

  it('录入顺序打乱并从互补侧录入后，按标签对应的结论完全一致', () => {
    const base = run(SPEC.map(([w, side]) => `${w}: ${side}`));

    // 固定置换；其中 4 条改从含 A 的互补侧录入（侧 B 省略，取补集）
    const perm = [10, 0, 7, 3, 5, 11, 1, 8, 4, 2, 9, 6];
    const complementSide: Record<number, string> = {
      0: 'A F', // B C D E G
      3: 'A B D F G', // C E
      5: 'A B C G', // D E F
      11: 'A D E G', // B C F
    };
    const shuffledLines = perm.map((idx) => {
      const [w, side] = SPEC[idx];
      return `${w}: ${complementSide[idx] ?? side}`;
    });
    const reordered = run(shuffledLines);

    // 互补规范化：同一批规范身份（掩码），顺序无关
    expect(new Set(reordered.masks)).toEqual(new Set(base.masks));
    expect(reordered.an.score).toEqual(base.an.score);

    // 展示解规范序列一致（与录入位置无关）
    expect(reordered.an.chosen.map((i) => reordered.labels[i])).toEqual(EXPECTED_SEQ);

    // 三分类按标签一一对应
    for (const [label, bi] of base.byLabel) {
      const ri = reordered.byLabel.get(label)!;
      expect(reordered.an.verdicts[ri], `标签 ${label}`).toBe(base.an.verdicts[bi]);
    }

    // 兼容矩阵按标签重排后一致
    for (const [la, ia] of base.byLabel) {
      for (const [lb, ib] of base.byLabel) {
        expect(reordered.an.compat[reordered.byLabel.get(la)!][reordered.byLabel.get(lb)!]).toBe(
          base.an.compat[ia][ib],
        );
      }
    }
  });
});

describe('popcount', () => {
  it('基本计数', () => {
    expect(popcount(0)).toBe(0);
    expect(popcount(0b1011)).toBe(3);
    expect(popcount(0xfff)).toBe(12);
  });
});

describe('与暴力枚举对照（随机实例）', () => {
  // 确定性伪随机数，保证可复现
  function lcg(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }

  interface BruteResult {
    weight: number;
    count: number;
    chosenLabels: string[];
    verdicts: string[];
  }

  function bruteForce(masks: number[], weights: number[], labels: string[], n: number): BruteResult {
    const m = masks.length;
    let bestW = -1;
    let bestC = -1;
    const optimal: number[][] = [];
    for (let s = 0; s < 1 << m; s++) {
      const members: number[] = [];
      for (let i = 0; i < m; i++) if ((s & (1 << i)) !== 0) members.push(i);
      let ok = true;
      for (let a = 0; a < members.length && ok; a++) {
        for (let b = a + 1; b < members.length && ok; b++) {
          if (!compatible(masks[members[a]], masks[members[b]], n)) ok = false;
        }
      }
      if (!ok) continue;
      const w = members.reduce((acc, i) => acc + weights[i], 0);
      const c = members.length;
      if (w > bestW || (w === bestW && c > bestC)) {
        bestW = w;
        bestC = c;
        optimal.length = 0;
        optimal.push(members);
      } else if (w === bestW && c === bestC) {
        optimal.push(members);
      }
    }
    const seqOf = (members: number[]) => members.map((i) => labels[i]).sort();
    const lexCmp = (a: string[], b: string[]) => {
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
      }
      return a.length - b.length;
    };
    let chosenLabels: string[] | null = null;
    for (const members of optimal) {
      const sq = seqOf(members);
      if (chosenLabels === null || lexCmp(sq, chosenLabels) < 0) chosenLabels = sq;
    }
    const verdicts = masks.map((_, i) => {
      const inAll = optimal.every((mem) => mem.includes(i));
      const inSome = optimal.some((mem) => mem.includes(i));
      if (inAll) return 'required';
      if (!inSome) return 'never';
      return 'optional';
    });
    return { weight: bestW, count: bestC, chosenLabels: chosenLabels ?? [], verdicts };
  }

  it('200 个随机实例：得分、字典序展示解、三分类均与暴力一致', () => {
    const rand = lcg(20260922);
    for (let t = 0; t < 200; t++) {
      const n = 5 + Math.floor(rand() * 4); // 5–8 个物种
      const m = 4 + Math.floor(rand() * 7); // 4–10 个候选
      const full = (1 << n) - 1;
      const seen = new Set<number>();
      const masks: number[] = [];
      const weights: number[] = [];
      const labels: string[] = [];
      while (masks.length < m) {
        const size = 2 + Math.floor(rand() * (n - 3)); // 2..n-2
        let mask = 0;
        while (popcount(mask) < size) mask |= 1 << Math.floor(rand() * n);
        if ((mask & 1) !== 0) mask = full ^ mask; // 互补规范化
        if (popcount(mask) < 2 || popcount(mask) > n - 2) continue;
        if (seen.has(mask)) continue;
        seen.add(mask);
        masks.push(mask);
        weights.push(1 + Math.floor(rand() * 9));
        labels.push(
          Array.from({ length: n }, (_, i) => i)
            .filter((i) => ((mask >> i) & 1) === 1)
            .map((i) => `s${i}`)
            .sort()
            .join(' '),
        );
      }
      const an = analyze(masks, weights, labels, n);
      const bf = bruteForce(masks, weights, labels, n);
      expect(an.score, `实例 ${t} 得分`).toEqual({ weight: bf.weight, count: bf.count });
      expect(
        an.chosen.map((i) => labels[i]),
        `实例 ${t} 展示解`,
      ).toEqual(bf.chosenLabels);
      expect(an.verdicts, `实例 ${t} 三分类`).toEqual(bf.verdicts);
    }
  });

  it('40 个 ≥12 候选实例（旧支配剪枝的启用阈值）与暴力一致且顺序无关', () => {
    const rand = lcg(20260924);
    for (let t = 0; t < 40; t++) {
      const n = 7 + Math.floor(rand() * 3); // 7–9 个物种
      const full = (1 << n) - 1;
      const pool: number[] = [];
      // 先取全部规范非平凡分裂做候选池，再随机抽取，保证能凑够 ≥12 条
      for (let mask = 0; mask <= full; mask++) {
        if (mask & 1) continue; // 规范侧不含首个物种
        const c = popcount(mask);
        if (c >= 2 && c <= n - 2) pool.push(mask);
      }
      const m = Math.min(pool.length, 12 + Math.floor(rand() * 5)); // 12–16 个候选
      // Fisher–Yates 抽取
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const picked = pool.slice(0, m);
      const make = (ms: number[]) => ({
        masks: ms,
        weights: ms.map(() => 1 + Math.floor(rand() * 9)),
        labels: ms.map(
          (mask) =>
            Array.from({ length: n }, (_, i) => i)
              .filter((i) => ((mask >> i) & 1) === 1)
              .map((i) => `s${i}`)
              .sort()
              .join(' '),
        ),
      });
      const base = make(picked);
      // 权重与候选绑定：换序时同步重排权重
      const order = picked.map((_, i) => i).reverse();
      const shuffledMasks = order.map((i) => base.masks[i]);
      const shuffledWeights = order.map((i) => base.weights[i]);
      const shuffledLabels = order.map((i) => base.labels[i]);

      const an = analyze(base.masks, base.weights, base.labels, n);
      const bf = bruteForce(base.masks, base.weights, base.labels, n);
      expect(an.score, `实例 ${t} 得分`).toEqual({ weight: bf.weight, count: bf.count });
      expect(an.chosen.map((i) => base.labels[i]), `实例 ${t} 展示解`).toEqual(
        bf.chosenLabels,
      );
      expect(an.verdicts, `实例 ${t} 三分类`).toEqual(bf.verdicts);

      // 录入顺序变化：按标签复对齐结论
      const an2 = analyze(shuffledMasks, shuffledWeights, shuffledLabels, n);
      expect(an2.score).toEqual(an.score);
      expect(an2.chosen.map((i) => shuffledLabels[i])).toEqual(
        an.chosen.map((i) => base.labels[i]),
      );
      for (let i = 0; i < m; i++) {
        const j = shuffledLabels.indexOf(base.labels[i]);
        expect(an2.verdicts[j], `实例 ${t} 标签 ${base.labels[i]}`).toBe(an.verdicts[i]);
      }
    }
  });
});
