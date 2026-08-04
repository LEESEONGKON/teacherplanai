import React, { useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Info, Check } from 'lucide-react';
import {
  AchievementScale,
  LEVEL_KEYS,
  LevelKey,
  loadAchievementLevels,
} from '../../services/curriculumData';
import { EMPTY_LEVELS, PlanRow, UNASSESSED_METHODS, UnassessedItem } from './types';
import CopyButton from './CopyButton';
import Card from './Card';

interface Props {
  subject: string;
  rows: PlanRow[];
  scale: AchievementScale | null;
  items: UnassessedItem[];
  onChange: (items: UnassessedItem[]) => void;
}

const UnassessedCard: React.FC<Props> = ({ subject, rows, scale, items, onChange }) => {
  const copyRef = useRef<HTMLDivElement>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const keys = LEVEL_KEYS[scale || '5'];
  const used = useMemo(() => new Set(items.map(i => i.code)), [items]);
  const candidates = rows.filter(r => !used.has(r.code));

  /** 선택한 성취기준의 공식 성취수준을 내장 데이터에서 그대로 가져온다. */
  const addStandards = async (codes: string[]) => {
    if (codes.length === 0) return;
    setBusy(true);
    try {
      let byCode: Record<string, Partial<Record<LevelKey, string>>> = {};
      try {
        const store = await loadAchievementLevels();
        byCode = store.subjects[subject.trim()]?.standards || {};
      } catch (e) {
        console.warn('성취수준 데이터 로드 실패', e);
      }

      const added: UnassessedItem[] = codes.map(code => {
        const row = rows.find(r => r.code === code);
        const levels = { ...EMPTY_LEVELS };
        const src = byCode[code];
        if (src) keys.forEach(k => { levels[k] = src[k] || ''; });
        return {
          code,
          standard: row?.standard || code,
          levels,
          methods: [],
          otherDetail: '',
        };
      });

      onChange([...items, ...added]);
      const filled = added.filter(a => keys.some(k => a.levels[k])).length;
      if (filled < added.length) {
        alert(
          `${added.length}개를 추가했습니다.\n` +
          `그중 ${added.length - filled}개는 내장 성취수준 자료가 없어 비어 있습니다. 직접 입력해주세요.`
        );
      }
    } finally {
      setBusy(false);
      setPicking(false);
    }
  };

  const patch = (code: string, part: Partial<UnassessedItem>) =>
    onChange(items.map(i => (i.code === code ? { ...i, ...part } : i)));

  const remove = (code: string) => onChange(items.filter(i => i.code !== code));

  const toggleMethod = (item: UnassessedItem, m: string) => patch(item.code, {
    methods: item.methods.includes(m) ? item.methods.filter(x => x !== m) : [...item.methods, m],
  });

  const methodLine = (item: UnassessedItem) =>
    UNASSESSED_METHODS
      .map(m => {
        const mark = item.methods.includes(m) ? 'v' : '□';
        return m === '기타' ? `${mark} 기타( ${item.otherDetail} )` : `${mark} ${m}`;
      })
      .join('\n');

  const cell = 'border border-black p-1.5 text-[11px] align-top';
  const inputCls = 'w-full resize-y border-0 p-0 text-[11px] focus:ring-0 bg-transparent';

  return (
    <Card
      no={5}
      title="정기시험·수행평가로 평가하지 않는 성취기준"
      desc="이 표의 평가 기준은 성취기준별 성취수준 원문입니다. 성취기준을 고르면 공식 문안이 그대로 채워집니다."
      right={<CopyButton targetRef={copyRef} disabled={items.length === 0} label="표 복사" />}
    >
      {!subject ? (
        <p className="text-sm text-gray-500 py-6 text-center border border-dashed border-gray-300 rounded-lg">
          위에서 과목을 선택하세요.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center border border-dashed border-gray-300 rounded-lg">
          먼저 <strong>1번</strong>에서 성취기준을 추가하세요. 그 중 평가하지 않는 것을 고릅니다.
        </p>
      ) : (
        <>
          {/* 고르기 */}
          {picking ? (
            <div className="border border-indigo-200 bg-indigo-50 rounded-lg p-3 mb-4">
              <p className="text-xs font-bold text-indigo-900 mb-2">평가하지 않는 성취기준을 고르세요</p>
              <div className="max-h-56 overflow-y-auto bg-white rounded border border-indigo-100 divide-y divide-gray-100">
                {candidates.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-5">추가할 수 있는 성취기준이 없습니다.</p>
                )}
                {candidates.map(r => (
                  <button
                    key={r.code}
                    onClick={() => addStandards([r.code])}
                    disabled={busy}
                    className="w-full text-left px-2.5 py-2 text-xs hover:bg-indigo-50 flex gap-2 disabled:opacity-50"
                  >
                    <span className="font-mono font-bold text-indigo-700 shrink-0">{r.code}</span>
                    <span className="text-gray-700">{r.standard.replace(/^\[[^\]]+\]\s*/, '')}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setPicking(false)}
                className="mt-2 text-xs text-gray-500 hover:text-gray-700"
              >
                닫기
              </button>
            </div>
          ) : (
            <button
              onClick={() => setPicking(true)}
              className="w-full mb-4 py-2.5 rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Plus size={14} /> 평가하지 않는 성취기준 추가
            </button>
          )}

          {/* 편집 */}
          {items.map(item => (
            <div key={item.code} className="border border-gray-200 rounded-lg p-3 mb-3">
              <div className="flex items-start gap-2 mb-2">
                <span className="font-mono font-bold text-xs text-indigo-700 pt-1">{item.code}</span>
                <span className="flex-1 text-xs text-gray-700">{item.standard.replace(/^\[[^\]]+\]\s*/, '')}</span>
                <button onClick={() => remove(item.code)} className="text-gray-300 hover:text-red-500 p-0.5">
                  <Trash2 size={14} />
                </button>
              </div>

              <table className="w-full border-collapse mb-2">
                <tbody>
                  {keys.map(k => (
                    <tr key={k}>
                      <td className={`${cell} w-8 text-center font-bold bg-gray-50`}>{k}</td>
                      <td className={cell}>
                        <textarea
                          rows={2}
                          className={inputCls}
                          value={item.levels[k] || ''}
                          placeholder={`${k} 수준 진술`}
                          onChange={e => patch(item.code, { levels: { ...item.levels, [k]: e.target.value } })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-[11px] font-bold text-gray-600">평가 방법</span>
                {UNASSESSED_METHODS.map(m => (
                  <label key={m} className="text-[11px] cursor-pointer flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={item.methods.includes(m)}
                      onChange={() => toggleMethod(item, m)}
                      className="w-3 h-3 rounded text-indigo-600"
                    />
                    {m}
                  </label>
                ))}
                {item.methods.includes('기타') && (
                  <input
                    value={item.otherDetail}
                    onChange={e => patch(item.code, { otherDetail: e.target.value })}
                    placeholder="기타 내용 (예: 학생상호평가)"
                    className="border border-gray-300 rounded px-2 py-0.5 text-[11px] w-44"
                  />
                )}
              </div>
            </div>
          ))}

          {/* 한글 붙여넣기용 사본 (화면 밖) */}
          <div className="copy-source" ref={copyRef} aria-hidden="true">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>정기시험 또는 수행평가로{'\n'}평가하지 않는 성취기준</th>
                  <th colSpan={2}>평가 기준(성취기준별 성취수준)</th>
                  <th style={{ width: '18%' }}>평가 방법</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => keys.map((k, i) => (
                  <tr key={item.code + k}>
                    {i === 0 && <td rowSpan={keys.length}>{item.standard}</td>}
                    <td style={{ width: 28, textAlign: 'center', fontWeight: 'bold' }}>{k}</td>
                    <td>{item.levels[k] || ''}</td>
                    {i === 0 && <td rowSpan={keys.length}>{methodLine(item)}</td>}
                  </tr>
                )))}
              </tbody>
            </table>
          </div>

          {items.length > 0 && (
            <p className="mt-1 text-[11px] text-gray-500 flex items-start gap-1.5">
              <Info size={13} className="shrink-0 mt-0.5" />
              <span>
                <Check size={11} className="inline text-green-600" /> 진술은 <strong>공식 성취수준 원문</strong>입니다.
                단계(A~E / A~C)는 <strong>3번 카드</strong> 설정을 따릅니다.
              </span>
            </p>
          )}
        </>
      )}
    </Card>
  );
};

export default UnassessedCard;
