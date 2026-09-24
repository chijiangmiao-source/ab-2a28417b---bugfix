// 验收样例重放：互补规范化、最大兼容集、候选三分类。
// 每个场景打印 PASS/FAIL 与关键证据，任一失败则以非零码退出。
import { analyze, parseSpecies, parseSplits } from '../src/lib/splits';

let failures = 0;

function check(name: string, cond: boolean, detail: string): void {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}  ——  ${detail}`);
  if (!cond) failures++;
}

function header(title: string): void {
  console.log(`\n【${title}】`);
}

// ---------------------------------------------------------------- 场景一
header('场景一：互补规范化（互补分裂视为同一项并拒绝重复）');
{
  const sp = parseSpecies('A B C D E');
  const r = parseSplits(['8: C D E', '6: A B', '4: B C'].join('\n'), sp.names);

  const c1 = r.candidates[0];
  check(
    '规范侧选取',
    c1 !== undefined && c1.label === 'C D E' && c1.flipped === false,
    `「8: C D E」规范化为 ${c1?.display ?? '∅'}`,
  );
  check(
    '互补重复拒绝',
    r.lineErrors.length === 1 &&
      r.lineErrors[0].line === 2 &&
      r.lineErrors[0].message.includes('重复') &&
      r.lineErrors[0].text === '6: A B',
    `第 2 行「6: A B」为 #1 的互补，被拒并保留原文`,
  );
  const c2 = r.candidates[1];
  check(
    '取补标记',
    c2 !== undefined && c2.label === 'B C' && c2.flipped === false && r.candidates.length === 2,
    `第 3 行「4: B C」规范化后为 ${c2?.display ?? '∅'}，共 ${r.candidates.length} 个有效候选`,
  );
}

// ---------------------------------------------------------------- 场景二
header('场景二：最大兼容集（逐条高权贪心会堵死更优组合）');
{
  // x=AB(9) 与 y=AC(5)、z=BE(5) 均冲突；y、z、w=DF(2) 两两兼容。
  // 逐条贪心先拿 x 只得 11，精确解为 y+z+w = 12。
  const sp = parseSpecies('A B C D E F');
  const r = parseSplits(['9: A B', '5: A C', '5: B E', '2: D F'].join('\n'), sp.names);
  const an = analyze(
    r.candidates.map((c) => c.mask),
    r.candidates.map((c) => c.weight),
    r.candidates.map((c) => c.label),
    sp.names.length,
  );
  check(
    '总权重最大',
    an.score.weight === 12,
    `最优总权重 ${an.score.weight}（贪心仅 11：先取 #1 后只剩 #4 可兼容）`,
  );
  check('数量次优', an.score.count === 3, `分裂数量 ${an.score.count}`);
  const chosenLabels = an.chosen.map((i) => r.candidates[i].label);
  check(
    '展示解内容',
    an.chosen.length === 3 &&
      an.chosen.includes(1) &&
      an.chosen.includes(2) &&
      an.chosen.includes(3),
    `展示解 = { ${chosenLabels.join(' ; ')} }（#2 #3 #4，绕开高权陷阱 #1）`,
  );
  check(
    '陷阱候选从不选',
    an.verdicts[0] === 'never',
    `#1 (权重 9) 分类 = ${an.verdicts[0]}`,
  );
}

// ---------------------------------------------------------------- 场景三
header('场景三：候选三分类（必选 / 可选 / 从不选）与字典序展示解');
{
  // r=AB(10) 必选；o1=CD(5) 与 o2=CE(5) 互换（各同优解取其一）；z=AC(12) 与 r 冲突从不选。
  const sp = parseSpecies('A B C D E F');
  const r = parseSplits(['10: A B', '5: C D', '5: C E', '12: A C'].join('\n'), sp.names);
  const an = analyze(
    r.candidates.map((c) => c.mask),
    r.candidates.map((c) => c.weight),
    r.candidates.map((c) => c.label),
    sp.names.length,
  );
  check(
    '最优得分',
    an.score.weight === 15 && an.score.count === 2,
    `总权重 ${an.score.weight}、数量 ${an.score.count}（同优解 {r,o1} 与 {r,o2}）`,
  );
  check(
    '三分类',
    an.verdicts.join(',') === 'required,optional,optional,never',
    `#1=${an.verdicts[0]} #2=${an.verdicts[1]} #3=${an.verdicts[2]} #4=${an.verdicts[3]}`,
  );
  const chosenLabels = an.chosen.map((i) => r.candidates[i].label);
  check(
    '字典序最小展示解',
    chosenLabels.join('|') === 'C D|C D E F',
    `展示解规范序列 = [${chosenLabels.map((s) => `"${s}"`).join(', ')}]，` +
      `小于另一同优解 ["C D E F", "C E"]`,
  );
}

// ---------------------------------------------------------------- 场景四
header('场景四：复核批次并列（7 物种 12 候选；CE 与 DE 同权替代，二者均可选）');
{
  // BCDEG(4)、BCDE(3)、CDE(3) 三条共同出现且必选；CE(2) 与 DE(2) 互相替代，
  // 其余 7 个权重 2 候选只在同权重下形成不同兼容关系，均无法进入同优解。
  const sp = parseSpecies('A B C D E F G');
  const lines = [
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
  const r = parseSplits(lines.join('\n'), sp.names);
  check('候选全部合法且恰为 12 条', r.errors.length === 0 && r.lineErrors.length === 0 && r.candidates.length === 12,
    `有效候选 ${r.candidates.length}，行错误 ${r.lineErrors.length}，全局错误 ${r.errors.length}`);
  const an = analyze(
    r.candidates.map((c) => c.mask),
    r.candidates.map((c) => c.weight),
    r.candidates.map((c) => c.label),
    sp.names.length,
  );
  check(
    '最大总权重 12、数量 4',
    an.score.weight === 12 && an.score.count === 4,
    `总权重 ${an.score.weight}、数量 ${an.score.count}`,
  );
  const verdictOf = (label: string) =>
    an.verdicts[r.candidates.findIndex((c) => c.label === label)];
  check(
    '三条共同分裂必选',
    verdictOf('B C D E G') === 'required' &&
      verdictOf('B C D E') === 'required' &&
      verdictOf('C D E') === 'required',
    `BCDEG=${verdictOf('B C D E G')} BCDE=${verdictOf('B C D E')} CDE=${verdictOf('C D E')}`,
  );
  check(
    'CE 与 DE 均为可选（不得一个必选、一个从不选）',
    verdictOf('C E') === 'optional' && verdictOf('D E') === 'optional',
    `C E=${verdictOf('C E')} D E=${verdictOf('D E')}`,
  );
  const chosenLabels = an.chosen.map((i) => r.candidates[i].label);
  check(
    '展示解按字典序采用 CE 而非 DE',
    chosenLabels.includes('C E') && !chosenLabels.includes('D E'),
    `展示解 = [${chosenLabels.map((s) => `"${s}"`).join(', ')}]`,
  );
  // 调整录入顺序（逆序）后按标签对应结论一致
  const r2 = parseSplits([...lines].reverse().join('\n'), sp.names);
  const an2 = analyze(
    r2.candidates.map((c) => c.mask),
    r2.candidates.map((c) => c.weight),
    r2.candidates.map((c) => c.label),
    sp.names.length,
  );
  const profile = (res: typeof an2, parsed: typeof r2) =>
    parsed.candidates
      .map((c, i) => `${c.label}:${res.verdicts[i]}${res.chosen.includes(i) ? '#选' : ''}`)
      .sort()
      .join(',');
  check('录入顺序变化不改变按标签对应的结论', profile(an2, r2) === profile(an, r),
    '逆序录入的三分类与展示解集合与正序一致');
  // 兼容矩阵：CE 与 DE 冲突；三条共同分裂与二者均兼容
  const at = (label: string) => r.candidates.findIndex((c) => c.label === label);
  const matrixOk =
    an.compat[at('C E')][at('D E')] === false &&
    ['B C D E G', 'B C D E', 'C D E'].every(
      (s) => an.compat[at(s)][at('C E')] && an.compat[at(s)][at('D E')],
    );
  check('兼容矩阵可复算并列关系', matrixOk, 'CE ✗ DE；BCDEG/BCDE/CDE 均与 CE、DE 兼容');
}

// ---------------------------------------------------------------- 汇总
console.log('\n==================================================');
if (failures === 0) {
  console.log('样例重放全部通过');
} else {
  console.log(`样例重放失败 ${failures} 项`);
}
console.log('==================================================');
process.exit(failures === 0 ? 0 : 1);
