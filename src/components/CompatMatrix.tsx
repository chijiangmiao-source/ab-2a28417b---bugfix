import type { Candidate } from '../lib/splits';

interface Props {
  candidates: Candidate[];
  compat: boolean[][];
  highlight: ReadonlySet<number>;
  onHighlight: (ids: number[]) => void;
}

export function CompatMatrix({ candidates, compat, highlight, onHighlight }: Props) {
  return (
    <div className="panel">
      <h2>兼容矩阵</h2>
      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th aria-label="候选编号" />
              {candidates.map((c) => (
                <th key={c.id}>{c.id}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {candidates.map((c, i) => (
              <tr key={c.id}>
                <th
                  className={highlight.has(i) ? 'hl' : ''}
                  onMouseEnter={() => onHighlight([i])}
                  onMouseLeave={() => onHighlight([])}
                >
                  {c.id}
                </th>
                {candidates.map((d, j) => {
                  const self = i === j;
                  const ok = compat[i][j];
                  const cls = [
                    'cell',
                    self ? 'self' : ok ? 'ok' : 'no',
                    !self && (highlight.has(i) || highlight.has(j)) ? 'hl' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <td
                      key={d.id}
                      className={cls}
                      title={
                        self
                          ? `#${c.id} ${c.display}`
                          : `#${c.id} ${c.label} 与 #${d.id} ${d.label}：${ok ? '兼容' : '冲突'}`
                      }
                      onMouseEnter={() => onHighlight(self ? [i] : [i, j])}
                      onMouseLeave={() => onHighlight([])}
                    >
                      {self ? '·' : ok ? '✓' : '✗'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="legend">
        ✓ 兼容（四种两侧交集至少一个为空）　✗ 冲突　· 自身。悬停单元格或表行可与分裂表联动高亮。
      </p>
    </div>
  );
}
