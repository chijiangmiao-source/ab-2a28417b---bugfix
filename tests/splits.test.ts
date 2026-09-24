import { describe, expect, it } from 'vitest';
import {
  analyze,
  type Analysis,
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

describe('复核批次并列场景（7 物种、12 候选）', () => {
  // 权重 4 的 BCDEG、权重 3 的 BCDE、CDE 三条两两兼容且共同出现；
  // 权重同为 2 的 CE 与 DE 互相替代（彼此冲突，与三条共同分裂均兼容）；
  // 其余 7 个权重 2 候选在相同权重下形成不同的兼容关系，且无法进入同优解。
  const SPECIES7 = 'A B C D E F G';
  const BATCH = [
    '4: B C D E G',
    '3: B C D E',
    '3: C D E',
    '2: C E',
    '2: D E',
    '2: B C F',
    '2: B E',
    '2: C F',
    '2: D E F',
    '2: C D F G',
    '2: B E F G',
    '2: B C F G',
  ];
  // 互补规范化不变性：用含首个物种 A 的一侧（取补）重录若干候选
  const BATCH_FLIPPED = [
    '4: A F', // = B C D E G
    '3: B C D E | A F G',
    '3: A B F G', // = C D E
    '2: C E | A B D F G',
    '2: A B C F G', // = D E
    '2: B C F',
    '2: B E',
    '2: C F',
    '2: D E F',
    '2: C D F G',
    '2: B E F G',
    '2: B C F G',
  ];

  function analyzeBatch(lines: string[]) {
    const sp = parseSpecies(SPECIES7);
    expect(sp.errors).toEqual([]);
    const r = parseSplits(lines.join('\n'), sp.names);
    expect(r.errors).toEqual([]);
    expect(r.lineErrors).toEqual([]);
    expect(r.candidates).toHaveLength(12);
    const an = analyze(
      r.candidates.map((c) => c.mask),
      r.candidates.map((c) => c.weight),
      r.candidates.map((c) => c.label),
      sp.names.length,
    );
    return { sp, r, an };
  }

  function assertBatch(r: ReturnType<typeof analyzeBatch>['r'], an: Analysis) {
    // 得分与数量
    expect(an.score).toEqual({ weight: 12, count: 4 });

    // 规范展示解：三条共同分裂 + 按字典序取 CE（"C E" < "D E"）
    expect(an.chosen.map((i) => r.candidates[i].label)).toEqual([
      'B C D E',
      'B C D E G',
      'C D E',
      'C E',
    ]);

    // 三分类：BCDEG / BCDE / CDE 必选；CE 与 DE 可选；其余从不选
    expect(
      r.candidates.map((c, i) => `${c.weight}:${c.label}=${an.verdicts[i]}`),
    ).toEqual([
      '4:B C D E G=required',
      '3:B C D E=required',
      '3:C D E=required',
      '2:C E=optional',
      '2:D E=optional',
      '2:B C F=never',
      '2:B E=never',
      '2:C F=never',
      '2:D E F=never',
      '2:C D F G=never',
      '2:B E F G=never',
      '2:B C F G=never',
    ]);

    // 兼容矩阵可独立复算：对称、对角为真、与四交集定义一致
    expect(an.compat).toHaveLength(12);
    for (let i = 0; i < 12; i++) {
      expect(an.compat[i]).toHaveLength(12);
      expect(an.compat[i][i]).toBe(true);
      for (let j = 0; j < 12; j++) {
        expect(an.compat[i][j]).toBe(
          i === j || compatible(r.candidates[i].mask, r.candidates[j].mask, 7),
        );
        expect(an.compat[i][j]).toBe(an.compat[j][i]);
      }
    }
    // 关键关系：三条共同分裂与 CE/DE 均兼容；CE 与 DE 冲突
    const at = (label: string) => r.candidates.findIndex((c) => c.label === label);
    for (const s of ['B C D E G', 'B C D E', 'C D E']) {
      expect(an.compat[at(s)][at('C E')]).toBe(true);
      expect(an.compat[at(s)][at('D E')]).toBe(true);
    }
    expect(an.compat[at('C E')][at('D E')]).toBe(false);
  }

  it('得分 12/4、CE 与 DE 均可选、展示解字典序取 CE、三条共同分裂必选', () => {
    const { r, an } = analyzeBatch(BATCH);
    assertBatch(r, an);
  });

  it('调整候选录入顺序后，按规范标签对应的结论完全一致', () => {
    const reversed = analyzeBatch([...BATCH].reverse());
    const shuffled = analyzeBatch([...BATCH.slice(5), ...BATCH.slice(0, 5)]);
    const base = analyzeBatch(BATCH);

    const byLabel = (res: typeof base) => {
      const map = new Map<string, unknown>();
      res.r.candidates.forEach((c, i) =>
        map.set(c.label, {
          weight: c.weight,
          verdict: res.an.verdicts[i],
          chosen: res.an.chosen.includes(i),
        }),
      );
      return map;
    };
    for (const res of [reversed, shuffled]) {
      expect(res.an.score).toEqual(base.an.score);
      expect(byLabel(res)).toEqual(byLabel(base));
      // 展示解的规范标签序列与录入顺序无关
      expect(res.an.chosen.map((i) => res.r.candidates[i].label)).toEqual(
        base.an.chosen.map((i) => base.r.candidates[i].label),
      );
    }
  });

  it('互补规范化（取补录入 / 双侧录入）不改变结论', () => {
    const flipped = analyzeBatch(BATCH_FLIPPED);
    assertBatch(flipped.r, flipped.an);
  });

  it('与 2^12 暴力枚举互算：两组前两级同优解仅在 CE/DE 间替代', () => {
    const { r, an } = analyzeBatch(BATCH);
    const masks = r.candidates.map((c) => c.mask);
    const weights = r.candidates.map((c) => c.weight);
    const labels = r.candidates.map((c) => c.label);
    const opt: number[][] = [];
    let bestW = -1;
    let bestC = -1;
    for (let s = 0; s < 1 << 12; s++) {
      const mem: number[] = [];
      for (let i = 0; i < 12; i++) if (s & (1 << i)) mem.push(i);
      let ok = true;
      for (let a = 0; a < mem.length && ok; a++) {
        for (let b = a + 1; b < mem.length && ok; b++) {
          if (!compatible(masks[mem[a]], masks[mem[b]], 7)) ok = false;
        }
      }
      if (!ok) continue;
      const w = mem.reduce((x, i) => x + weights[i], 0);
      const c = mem.length;
      if (w > bestW || (w === bestW && c > bestC)) {
        bestW = w;
        bestC = c;
        opt.length = 0;
        opt.push(mem);
      } else if (w === bestW && c === bestC) opt.push(mem);
    }
    expect(bestW).toBe(12);
    expect(bestC).toBe(4);
    expect(opt).toHaveLength(2);
    const sets = opt.map((mem) => mem.map((i) => labels[i]).sort());
    expect(sets).toContainEqual(['B C D E', 'B C D E G', 'C D E', 'C E']);
    expect(sets).toContainEqual(['B C D E', 'B C D E G', 'C D E', 'D E']);
    // 暴力三分类与实现一致
    labels.forEach((label, i) => {
      const inAll = opt.every((mem) => mem.includes(i));
      const inSome = opt.some((mem) => mem.includes(i));
      const expected = inAll ? 'required' : inSome ? 'optional' : 'never';
      expect(an.verdicts[i], label).toBe(expected);
    });
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
      // 先取全部规范（不含 s0）非平凡掩码做无放回抽样，避免小 n 下候选池枯竭死循环
      const pool: number[] = [];
      for (let msk = 1; msk < 1 << n; msk++) {
        if ((msk & 1) !== 0) continue;
        const c = popcount(msk);
        if (c >= 2 && c <= n - 2) pool.push(msk);
      }
      const m = 4 + Math.floor(rand() * Math.min(10, pool.length - 3)); // 4–13，覆盖 ≥12 的并列高发规模
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const masks = pool.slice(0, m);
      const weights = masks.map(() => 1 + Math.floor(rand() * 9));
      const labels = masks.map((mask) =>
        Array.from({ length: n }, (_, i) => i)
          .filter((i) => ((mask >> i) & 1) === 1)
          .map((i) => `s${i}`)
          .sort()
          .join(' '),
      );
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
});
