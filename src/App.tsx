import { useMemo, useState } from 'react';
import { analyze, parseSpecies, parseSplits } from './lib/splits';
import { SplitTable } from './components/SplitTable';
import { CompatMatrix } from './components/CompatMatrix';

const DEFAULT_SPECIES = 'A B C D E F';
const DEFAULT_SPLITS = ['10: A B', '5: C D', '5: C E', '12: A C'].join('\n');

export default function App() {
  const [speciesText, setSpeciesText] = useState(DEFAULT_SPECIES);
  const [splitsText, setSplitsText] = useState(DEFAULT_SPLITS);
  const [highlight, setHighlight] = useState<ReadonlySet<number>>(new Set());

  const species = useMemo(() => parseSpecies(speciesText), [speciesText]);
  const speciesOk = species.errors.length === 0;

  const splits = useMemo(
    () => (speciesOk ? parseSplits(splitsText, species.names) : null),
    [speciesOk, splitsText, species.names],
  );
  const splitsOk =
    splits !== null && splits.errors.length === 0 && splits.lineErrors.length === 0;

  const analysis = useMemo(() => {
    if (!splitsOk || splits === null) return null;
    return analyze(
      splits.candidates.map((c) => c.mask),
      splits.candidates.map((c) => c.weight),
      splits.candidates.map((c) => c.label),
      species.names.length,
    );
  }, [splitsOk, splits, species.names.length]);

  const chosenSet = useMemo(
    () => new Set(analysis === null ? [] : analysis.chosen),
    [analysis],
  );

  return (
    <div className="app">
      <header>
        <h1>系统发育分裂审计</h1>
        <p>
          同批形态证据提出互相冲突的候选分裂时，逐条接受高权候选可能堵死总证据更强的组合。
          本页在候选分裂中精确选取两两兼容集合：先最大化总权重，再最大化分裂数量，
          并以规范分裂序列字典序最小者作为展示解；同时按全部前两级同优解把候选标为
          必选 / 可选 / 从不选。全部计算在本地浏览器完成，无后端、无在线调用。
        </p>
      </header>

      <section className="inputs">
        <div className="panel">
          <h2>物种列表</h2>
          <textarea
            value={speciesText}
            onChange={(e) => setSpeciesText(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder="4–12 个唯一 ASCII 名，空白或逗号分隔"
          />
          <p className="hint">4–12 个唯一 ASCII 名，空白或逗号分隔；非法输入保留原文，仅提示。</p>
          {species.errors.length > 0 && (
            <ul className="errors">
              {species.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <h2>候选分裂</h2>
          <textarea
            value={splitsText}
            onChange={(e) => setSplitsText(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={'每行：权重: 侧A | 侧B\n例：10: A B | C D E F'}
          />
          <p className="hint">
            每行「权重: 侧A | 侧B」，侧B 可省略（取补集）；两侧均须 ≥2 个物种；互补分裂视为同一项并拒绝重复；1–28
            个有效候选。
          </p>
          {!speciesOk && <p className="hint warn">请先修正物种列表，再解析候选分裂。</p>}
          {splits !== null && splits.lineErrors.length > 0 && (
            <ul className="errors">
              {splits.lineErrors.map((e, i) => (
                <li key={i}>
                  第 {e.line} 行：{e.message}　<code>{e.text}</code>
                </li>
              ))}
            </ul>
          )}
          {splits !== null && splits.errors.length > 0 && (
            <ul className="errors">
              {splits.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {analysis !== null && splits !== null && (
        <section className="results">
          <div className="panel summary">
            <div className="stat">
              <span>最大总权重</span>
              <b>{analysis.score.weight}</b>
            </div>
            <div className="stat">
              <span>分裂数量</span>
              <b>{analysis.score.count}</b>
            </div>
            <div className="stat wide">
              <span>展示解（规范序列字典序最小）</span>
              <b className="mono">
                {analysis.chosen.map((i) => splits.candidates[i].display).join('　；　')}
              </b>
            </div>
          </div>

          <div className="panels">
            <SplitTable
              candidates={splits.candidates}
              verdicts={analysis.verdicts}
              chosen={chosenSet}
              highlight={highlight}
              onHighlight={(ids) => setHighlight(new Set(ids))}
            />
            <CompatMatrix
              candidates={splits.candidates}
              compat={analysis.compat}
              highlight={highlight}
              onHighlight={(ids) => setHighlight(new Set(ids))}
            />
          </div>
        </section>
      )}

      <footer>
        <p>静态页面，仅在浏览器运行；HTTP 健康检查：GET /healthz。</p>
      </footer>
    </div>
  );
}
