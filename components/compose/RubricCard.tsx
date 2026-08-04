import React, { useRef, useState } from 'react';
import { Plus, Trash2, Sparkles, Info } from 'lucide-react';
import {
  generateCriteriaFromRubric,
  generateRubricItems,
  suggestCoreIdeas,
  createId,
} from '../../services/geminiService';
import { LEVEL_KEYS, LevelKey } from '../../services/curriculumData';
import { EMPTY_LEVELS, EVALUATION_METHODS, PlanRow, TaskDraft } from './types';
import CopyButton from './CopyButton';
import Card from './Card';

interface Props {
  subject: string;
  rows: PlanRow[];
  scale: '3' | '5' | null;
  tasks: TaskDraft[];
  onChange: (tasks: TaskDraft[]) => void;
}

const KOREAN = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차'];

const RubricCard: React.FC<Props> = ({ subject, rows, scale, tasks, onChange }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const keys = LEVEL_KEYS[scale || '5'];

  const addTask = () => onChange([...tasks, {
    id: createId('task'),
    name: '',
    standardCodes: [],
    coreIdea: '',
    criteria: { ...EMPTY_LEVELS },
    methods: [],
    elements: [{ id: createId('el'), element: '', items: [{ id: createId('cr'), criteria: '', score: '' }] }],
    totalScore: '',
    baseScore: '*기본 점수 ○점, 기본 점수를 부여할 수 없는 경우(미인정 결과, 불성실한 수업 참여 등) ○점',
  }]);

  const patch = (id: string, part: Partial<TaskDraft>) =>
    onChange(tasks.map(t => (t.id === id ? { ...t, ...part } : t)));

  const removeTask = (id: string) => {
    if (!window.confirm('이 수행평가 과제를 삭제할까요?')) return;
    onChange(tasks.filter(t => t.id !== id));
  };

  const toggleStd = (t: TaskDraft, code: string) => patch(t.id, {
    standardCodes: t.standardCodes.includes(code)
      ? t.standardCodes.filter(c => c !== code)
      : [...t.standardCodes, code],
  });

  const toggleMethod = (t: TaskDraft, m: string) => patch(t.id, {
    methods: t.methods.includes(m) ? t.methods.filter(x => x !== m) : [...t.methods, m],
  });

  const standardTexts = (t: TaskDraft) =>
    t.standardCodes.map(c => rows.find(r => r.code === c)?.standard || c);

  const runCoreIdea = async (t: TaskDraft) => {
    if (t.standardCodes.length === 0) { alert('성취기준을 먼저 선택해주세요.'); return; }
    setBusy(t.id + ':idea');
    try {
      const ideas = await suggestCoreIdeas(subject, standardTexts(t), t.name || '수행평가');
      if (ideas.length === 0) { alert('제안된 핵심 아이디어가 없습니다.'); return; }
      const pick = window.prompt(`핵심 아이디어 제안입니다. 번호를 입력하세요 (1~${ideas.length}).\n\n` +
        ideas.map((x, i) => `${i + 1}. ${x}`).join('\n\n'), '1');
      const idx = Number(pick) - 1;
      if (Number.isInteger(idx) && ideas[idx]) patch(t.id, { coreIdea: ideas[idx] });
    } catch (e: any) {
      alert(`제안 중 오류가 발생했습니다.\n${e?.message || e}`);
    } finally { setBusy(null); }
  };

  const runCriteria = async (t: TaskDraft) => {
    if (t.elements.every(el => !el.element)) { alert('채점 요소를 먼저 입력해주세요.'); return; }
    setBusy(t.id + ':criteria');
    try {
      const res = await generateCriteriaFromRubric(
        t.name || '수행평가',
        t.elements.map(el => ({ id: el.id, element: el.element, items: el.items })) as any,
        'general',
        scale || '5'
      );
      const next = { ...EMPTY_LEVELS };
      keys.forEach(k => { next[k] = (res as any)[k] || ''; });
      patch(t.id, { criteria: next });
    } catch (e: any) {
      alert(`생성 중 오류가 발생했습니다.\n${e?.message || e}`);
    } finally { setBusy(null); }
  };

  const runItems = async (t: TaskDraft, elId: string) => {
    const el = t.elements.find(x => x.id === elId);
    if (!el || !el.element.trim()) { alert('채점 요소 이름을 먼저 입력해주세요.'); return; }
    setBusy(t.id + ':' + elId);
    try {
      const items = await generateRubricItems(el.element, t.name || '');
      if (items.length === 0) { alert('생성된 채점 기준이 없습니다.'); return; }
      patch(t.id, {
        elements: t.elements.map(x => x.id === elId
          ? { ...x, items: items.map(i => ({ id: createId('cr'), criteria: i.criteria, score: String(i.score ?? '') })) }
          : x),
      });
    } catch (e: any) {
      alert(`생성 중 오류가 발생했습니다.\n${e?.message || e}`);
    } finally { setBusy(null); }
  };

  const cell = 'border border-black p-1.5 text-[11px] align-top';
  const inputCls = 'w-full resize-y border-0 p-0 text-[11px] focus:ring-0 bg-transparent';

  return (
    <Card
      no={4}
      title="수행평가 영역별 세부 기준"
      desc="과제별로 성취기준·평가기준·채점 기준을 만듭니다. 실제 문서와 같은 표 형태로 복사됩니다."
      right={<CopyButton targetRef={wrapRef} disabled={tasks.length === 0} label="전체 표 복사" />}
    >
      {!subject ? (
        <p className="text-sm text-gray-500 py-6 text-center border border-dashed border-gray-300 rounded-lg">
          위에서 과목을 선택하세요.
        </p>
      ) : (
        <>
          <div className="space-y-6">
            {tasks.map((t, ti) => (
              <div key={t.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2 no-copy">
                  <span className="font-bold text-sm text-gray-800">{KOREAN[ti] || ti + 1}.</span>
                  <input
                    value={t.name}
                    onChange={e => patch(t.id, { name: e.target.value })}
                    placeholder="수행평가 과제명 (예: 프랑스 혁명 평가 논술)"
                    className="flex-1 border border-gray-300 rounded p-1.5 text-xs font-bold"
                  />
                  <button onClick={() => removeTask(t.id)} className="text-gray-300 hover:text-red-500 p-1">
                    <Trash2 size={15} />
                  </button>
                </div>

                <table className="w-full border-collapse mb-2">
                  <tbody>
                    <tr>
                      <td className={`${cell} bg-gray-100 font-bold w-24 text-center`}>수행 과제</td>
                      <td className={cell} colSpan={3}>{t.name}</td>
                    </tr>
                    <tr>
                      <td className={`${cell} bg-gray-100 font-bold text-center`}>성취기준</td>
                      <td className={cell} colSpan={3}>
                        <div className="no-copy flex flex-wrap gap-1 mb-1">
                          {rows.map(r => (
                            <button
                              key={r.code}
                              onClick={() => toggleStd(t, r.code)}
                              className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${
                                t.standardCodes.includes(r.code)
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
                              }`}
                            >{r.code}</button>
                          ))}
                          {rows.length === 0 && <span className="text-[11px] text-gray-400">1번에서 성취기준을 추가하면 여기에 나타납니다</span>}
                        </div>
                        {standardTexts(t).map((s, i) => <div key={i}>{s}</div>)}
                      </td>
                    </tr>
                    <tr>
                      <td className={`${cell} bg-gray-100 font-bold text-center`} rowSpan={keys.length}>평가 기준</td>
                      <td className={`${cell} text-center font-bold w-8`}>{keys[0]}</td>
                      <td className={cell} colSpan={2}>
                        <textarea rows={2} className={inputCls} value={t.criteria[keys[0]] || ''}
                          onChange={e => patch(t.id, { criteria: { ...t.criteria, [keys[0]]: e.target.value } })} />
                      </td>
                    </tr>
                    {keys.slice(1).map(k => (
                      <tr key={k}>
                        <td className={`${cell} text-center font-bold`}>{k}</td>
                        <td className={cell} colSpan={2}>
                          <textarea rows={2} className={inputCls} value={t.criteria[k] || ''}
                            onChange={e => patch(t.id, { criteria: { ...t.criteria, [k]: e.target.value } })} />
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td className={`${cell} bg-gray-100 font-bold text-center`}>핵심 아이디어</td>
                      <td className={cell} colSpan={3}>
                        <textarea rows={1} className={inputCls} value={t.coreIdea}
                          onChange={e => patch(t.id, { coreIdea: e.target.value })} />
                      </td>
                    </tr>
                    <tr>
                      <td className={`${cell} bg-gray-100 font-bold text-center`}>평가 방법</td>
                      <td className={cell} colSpan={3}>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {EVALUATION_METHODS.map(m => (
                            <label key={m} className="text-[11px] cursor-pointer select-none">
                              <span className="no-copy">
                                <input type="checkbox" checked={t.methods.includes(m)}
                                  onChange={() => toggleMethod(t, m)} className="mr-1 w-3 h-3 align-middle" />
                              </span>
                              <span>{t.methods.includes(m) ? 'v' : '□'} {m}</span>
                            </label>
                          ))}
                        </div>
                      </td>
                    </tr>
                    <tr className="bg-gray-100 font-bold text-center">
                      <td className={cell}>채점 요소</td>
                      <td className={cell} colSpan={1}>채점 기준</td>
                      <td className={`${cell} w-14`}>배점</td>
                      <td className={`${cell} w-28`}>총점</td>
                    </tr>
                    {t.elements.map((el, ei) => (
                      <React.Fragment key={el.id}>
                        {el.items.map((it, ii) => (
                          <tr key={it.id}>
                            {ii === 0 && (
                              <td className={cell} rowSpan={el.items.length}>
                                <textarea rows={2} className={inputCls} value={el.element}
                                  placeholder={`${ei + 1}. 채점 요소`}
                                  onChange={e => patch(t.id, {
                                    elements: t.elements.map(x => x.id === el.id ? { ...x, element: e.target.value } : x),
                                  })} />
                                <button
                                  onClick={() => runItems(t, el.id)}
                                  disabled={busy === t.id + ':' + el.id}
                                  className="no-copy mt-1 text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-0.5"
                                >
                                  <Sparkles size={10} /> {busy === t.id + ':' + el.id ? '생성 중…' : '채점 기준 생성'}
                                </button>
                              </td>
                            )}
                            <td className={cell}>
                              <textarea rows={1} className={inputCls} value={it.criteria}
                                placeholder="상: …"
                                onChange={e => patch(t.id, {
                                  elements: t.elements.map(x => x.id === el.id
                                    ? { ...x, items: x.items.map(y => y.id === it.id ? { ...y, criteria: e.target.value } : y) }
                                    : x),
                                })} />
                            </td>
                            <td className={`${cell} text-center`}>
                              <input className={`${inputCls} text-center`} value={it.score}
                                onChange={e => patch(t.id, {
                                  elements: t.elements.map(x => x.id === el.id
                                    ? { ...x, items: x.items.map(y => y.id === it.id ? { ...y, score: e.target.value } : y) }
                                    : x),
                                })} />
                            </td>
                            {ei === 0 && ii === 0 && (
                              <td className={`${cell} text-center`} rowSpan={t.elements.reduce((n, x) => n + x.items.length, 0)}>
                                <textarea rows={2} className={`${inputCls} text-center`} value={t.totalScore}
                                  placeholder="예: 4점~20점 중 모든 점수"
                                  onChange={e => patch(t.id, { totalScore: e.target.value })} />
                              </td>
                            )}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                    <tr>
                      <td className={cell} colSpan={4}>
                        <textarea rows={1} className={inputCls} value={t.baseScore}
                          onChange={e => patch(t.id, { baseScore: e.target.value })} />
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div className="no-copy flex flex-wrap gap-2">
                  <button onClick={() => runCoreIdea(t)} disabled={busy === t.id + ':idea'}
                    className="text-[11px] px-2 py-1 rounded border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold flex items-center gap-1 disabled:opacity-40">
                    <Sparkles size={11} /> 핵심 아이디어 제안
                  </button>
                  <button onClick={() => runCriteria(t)} disabled={busy === t.id + ':criteria'}
                    className="text-[11px] px-2 py-1 rounded border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold flex items-center gap-1 disabled:opacity-40">
                    <Sparkles size={11} /> 평가 기준 {keys.join('·')} 생성
                  </button>
                  <button onClick={() => patch(t.id, {
                    elements: [...t.elements, { id: createId('el'), element: '', items: [{ id: createId('cr'), criteria: '', score: '' }] }],
                  })} className="text-[11px] px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 flex items-center gap-1">
                    <Plus size={11} /> 채점 요소 추가
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* 한글 붙여넣기용 사본 (화면 밖) */}
          <div className="copy-source" ref={wrapRef} aria-hidden="true">
            {tasks.map((t, ti) => {
              const totalRows = t.elements.reduce((n, x) => n + x.items.length, 0) || 1;
              return (
                <div key={t.id} style={{ marginBottom: 16 }}>
                  <p style={{ fontWeight: 'bold', margin: '0 0 4px' }}>{KOREAN[ti] || ti + 1}. {t.name}</p>
                  <table>
                    <tbody>
                      <tr><th style={{ width: 90 }}>수행 과제</th><td colSpan={3}>{t.name}</td></tr>
                      <tr><th>성취기준</th><td colSpan={3}>{standardTexts(t).join('\n')}</td></tr>
                      {keys.map((k, i) => (
                        <tr key={k}>
                          {i === 0 && <th rowSpan={keys.length}>평가 기준</th>}
                          <td style={{ width: 28, textAlign: 'center', fontWeight: 'bold' }}>{k}</td>
                          <td colSpan={2}>{t.criteria[k] || ''}</td>
                        </tr>
                      ))}
                      <tr><th>핵심 아이디어</th><td colSpan={3}>{t.coreIdea}</td></tr>
                      <tr>
                        <th>평가 방법</th>
                        <td colSpan={3}>
                          {EVALUATION_METHODS.map(m => `${t.methods.includes(m) ? 'v' : '□'} ${m}`).join('   ')}
                        </td>
                      </tr>
                      <tr>
                        <th>채점 요소</th><th>채점 기준</th><th style={{ width: 50 }}>배점</th><th style={{ width: 110 }}>총점</th>
                      </tr>
                      {t.elements.map((el, ei) => el.items.map((it, ii) => (
                        <tr key={it.id}>
                          {ii === 0 && <td rowSpan={el.items.length}>{el.element}</td>}
                          <td>{it.criteria}</td>
                          <td style={{ textAlign: 'center' }}>{it.score}</td>
                          {ei === 0 && ii === 0 && (
                            <td rowSpan={totalRows} style={{ textAlign: 'center' }}>{t.totalScore}</td>
                          )}
                        </tr>
                      )))}
                      <tr><td colSpan={4}>{t.baseScore}</td></tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>

          <button onClick={addTask}
            className="w-full mt-3 py-2.5 rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 text-xs font-bold flex items-center justify-center gap-1.5">
            <Plus size={14} /> 수행평가 과제 추가
          </button>

          <p className="mt-3 text-[11px] text-gray-500 flex items-start gap-1.5">
            <Info size={13} className="shrink-0 mt-0.5" />
            <span>평가 기준 단계(A~E / A~C)는 <strong>3번 카드</strong>에서 정한 단계를 따릅니다. AI 생성 문안은 검토 후 사용하세요.</span>
          </p>
        </>
      )}
    </Card>
  );
};

export default RubricCard;
