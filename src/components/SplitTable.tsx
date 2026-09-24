import type { Candidate, Verdict } from '../lib/splits';

const VERDICT_TEXT: Record<Verdict, string> = {
  required: '必选',
  optional: '可选',
  never: '从不选',
};

interface Props {
  candidates: Candidate[];
  verdicts: Verdict[];
  chosen: ReadonlySet<number>;
  highlight: ReadonlySet<number>;
  onHighlight: (ids: number[]) => void;
}

export function SplitTable({ candidates, verdicts, chosen, highlight, onHighlight }: Props) {
  return (
    <div className="panel">
      <h2>候选分裂表</h2>
      <table className="split-table">
        <thead>
          <tr>
            <th>#</th>
            <th>行</th>
            <th>分裂（规范形式）</th>
            <th>权重</th>
            <th>分类</th>
            <th>展示解</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c, i) => (
            <tr
              key={c.id}
              className={highlight.has(i) ? 'hl' : ''}
              onMouseEnter={() => onHighlight([i])}
              onMouseLeave={() => onHighlight([])}
            >
              <td>{c.id}</td>
              <td>{c.line}</td>
              <td className="mono">
                {c.display}
                {c.flipped && (
                  <span className="flip" title="录入侧含首个物种，已按互补规范化取补">
                    ↺
                  </span>
                )}
              </td>
              <td>{c.weight}</td>
              <td>
                <span className={`badge v-${verdicts[i]}`}>{VERDICT_TEXT[verdicts[i]]}</span>
              </td>
              <td className="chosen">{chosen.has(i) ? '✓' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="legend">
        分类依据全部前两级（总权重、数量）同优解：必选＝出现在每个同优解；可选＝出现在部分同优解；从不选＝不出现在任何同优解。↺＝录入侧已按互补规范化取补。
      </p>
    </div>
  );
}
