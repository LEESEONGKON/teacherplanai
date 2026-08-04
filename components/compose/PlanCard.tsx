import React, { useMemo, useRef, useState } from 'react';
import { Sparkles, Plus, Trash2, Search, ChevronDown, ChevronUp, Info } from 'lucide-react';
import {
  CurriculumData,
  CurriculumStandard,
  formatStandard,
} from '../../services/curriculumData';
import { generatePlanDetailsForStandards, createId } from '../../services/geminiService';
import { GradeLevel } from '../../types';
import { PlanRow } from './types';
import CopyButton from './CopyButton';
import Card from './Card';

interface Props {
  curriculum: CurriculumData | null;
  subject: string;
  rows: PlanRow[];
  onRowsChange: (rows: PlanRow[]) => void;
}

const PlanCard: React.FC<Props> = ({ curriculum, subject, rows, onRowsChange }) => {
  const tableRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const subjectData = useMemo(
    () => curriculum?.subjects.find(s => s.name === subject) || null,
    [curriculum, subject]
  );

  const domains = useMemo(
    () => (subjectData ? Array.from(new Set(subjectData.standards.map(s => s.d).filter(Boolean))) : []),
    [subjectData]
  );

  const added = useMemo(() => new Set(rows.map(r => r.code)), [rows]);

  const visible = useMemo(() => {
    if (!subjectData) return [];
    const kw = keyword.trim();
    return subjectData.standards.filter(s => {
      if (domainFilter && s.d !== domainFilter) return false;
      if (kw && !(s.t.includes(kw) || s.c.includes(kw))) return false;
      return true;
    });
  }, [subjectData, domainFilter, keyword]);

  const grouped = useMemo(() => {
    const map = new Map<string, CurriculumStandard[]>();
    for (const s of visible) {
      const key = s.d || '기타';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries());
  }, [visible]);

  const selectable = visible.filter(s => !added.has(s.c));
  const allSelected = selectable.length > 0 && selectable.every(s => checked.has(s.c));

  const toggle = (code: string) => setChecked(prev => {
    const next = new Set(prev);
    next.has(code) ? next.delete(code) : next.add(code);
    return next;
  });

  const toggleAll = () => setChecked(prev => {
    const next = new Set(prev);
    if (allSelected) selectable.forEach(s => next.delete(s.c));
    else selectable.forEach(s => next.add(s.c));
    return next;
  });

  const handleAdd = () => {
    if (!subjectData) return;
    const picked = subjectData.standards.filter(s => checked.has(s.c) && !added.has(s.c));
    if (picked.length === 0) return;
    onRowsChange([
      ...rows,
      ...picked.map(s => ({
        code: s.c,
        unit: s.d,
        standard: formatStandard(s),
        element: '',
        teachingMethod: '',
        notes: '',
      })),
    ]);
    setChecked(new Set());
  };

  const update = (code: string, field: keyof PlanRow, value: string) =>
    onRowsChange(rows.map(r => (r.code === code ? { ...r, [field]: value } : r)));

  const remove = (code: string) => onRowsChange(rows.filter(r => r.code !== code));

  const handleFill = async (onlyEmpty: boolean) => {
    const targets = onlyEmpty
      ? rows.filter(r => !r.element || !r.teachingMethod || !r.notes)
      : rows;
    if (targets.length === 0) {
      alert(onlyEmpty ? '비어 있는 칸이 없습니다.' : '먼저 성취기준을 추가해주세요.');
      return;
    }
    if (!onlyEmpty && !window.confirm(`${targets.length}개 행의 평가요소·수업방법·주안점을 다시 생성합니다.\n기존 내용은 덮어씁니다. 계속할까요?`)) return;

    setBusy(true);
    try {
      const details = await generatePlanDetailsForStandards(
        targets.map(r => ({ id: r.code, unit: r.unit, standard: r.standard })),
        subject,
        GradeLevel.GRADE_2
      );
      if (Object.keys(details).length === 0) {
        alert('생성된 내용이 없습니다. 잠시 후 다시 시도해주세요.');
        return;
      }
      onRowsChange(rows.map(r => {
        const d = details[r.code];
        if (!d) return r;
        return {
          ...r,
          element: onlyEmpty ? (r.element || d.element) : (d.element || r.element),
          teachingMethod: onlyEmpty ? (r.teachingMethod || d.teachingMethod) : (d.teachingMethod || r.teachingMethod),
          notes: onlyEmpty ? (r.notes || d.notes) : (d.notes || r.notes),
        };
      }));
    } catch (e: any) {
      console.error(e);
      alert(`AI 생성 중 오류가 발생했습니다.\n${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const cell = 'border border-black align-top p-1.5 text-[11px] leading-snug';

  return (
    <Card
      no={1}
      title="교수학습-평가 계획"
      desc="성취기준을 고르면 단원명·성취기준이 공식 원문 그대로 채워집니다. 나머지 칸은 AI로 채우거나 직접 입력하세요."
      right={<CopyButton targetRef={tableRef} disabled={rows.length === 0} label="표 복사" />}
    >
      {!subjectData ? (
        <p className="text-sm text-gray-500 py-6 text-center border border-dashed border-gray-300 rounded-lg">
          위에서 과목을 선택하세요.
        </p>
      ) : (
        <>
          {/* 성취기준 고르기 */}
          <div className="border border-gray-200 rounded-lg mb-4">
            <button
              onClick={() => setPickerOpen(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              <span>성취기준 고르기 {rows.length > 0 && <span className="font-normal text-gray-400">· 추가됨 {rows.length}개</span>}</span>
              {pickerOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {pickerOpen && (
              <div className="border-t border-gray-200 p-3">
                <div className="grid sm:grid-cols-2 gap-2 mb-2">
                  <select
                    value={domainFilter}
                    onChange={e => setDomainFilter(e.target.value)}
                    className="border border-gray-300 rounded-md p-2 text-xs bg-white"
                  >
                    <option value="">전체 영역</option>
                    {domains.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={keyword}
                      onChange={e => setKeyword(e.target.value)}
                      placeholder="키워드 또는 코드"
                      className="w-full border border-gray-300 rounded-md p-2 pl-7 text-xs"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs font-bold text-gray-700 py-1.5 border-y border-gray-100">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={selectable.length === 0}
                    className="rounded text-indigo-600 w-4 h-4"
                  />
                  표시된 {visible.length}개 전체 선택
                  <span className="ml-auto font-normal text-gray-400">선택 {checked.size}개</span>
                </label>

                <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                  {grouped.map(([domain, list]) => (
                    <div key={domain}>
                      <div className="bg-gray-50 px-2 py-1 text-[11px] font-bold text-gray-500 sticky top-0">
                        {domain} <span className="font-normal text-gray-400">({list.length})</span>
                      </div>
                      {list.map(s => {
                        const already = added.has(s.c);
                        return (
                          <label
                            key={s.c}
                            className={`flex items-start gap-2 px-2 py-1.5 text-xs ${already ? 'bg-gray-50 text-gray-400' : 'hover:bg-indigo-50 cursor-pointer'}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked.has(s.c)}
                              disabled={already}
                              onChange={() => toggle(s.c)}
                              className="mt-0.5 rounded text-indigo-600 w-3.5 h-3.5 shrink-0 disabled:opacity-50"
                            />
                            <span>
                              <span className="font-mono font-bold text-indigo-700 mr-1">{s.c}</span>
                              {s.t}
                              {already && <span className="ml-1.5 text-[10px] text-green-600 font-bold">✓ 추가됨</span>}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ))}
                  {grouped.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-6">조건에 맞는 성취기준이 없습니다.</p>
                  )}
                </div>

                <button
                  onClick={handleAdd}
                  disabled={checked.size === 0}
                  className="w-full mt-2 py-2 rounded-md text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 flex items-center justify-center gap-1.5"
                >
                  <Plus size={14} /> 선택한 {checked.size}개를 표에 추가
                </button>
              </div>
            )}
          </div>

          {/* AI 채우기 */}
          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <button
                onClick={() => handleFill(true)}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300"
              >
                {busy
                  ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> 생성 중…</>
                  : <><Sparkles size={14} /> 빈 칸 AI로 채우기</>}
              </button>
              <button
                onClick={() => handleFill(false)}
                disabled={busy}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-600 border border-gray-300 hover:bg-gray-50 disabled:opacity-40"
              >
                전체 다시 생성
              </button>
              <span className="text-[11px] text-gray-400">평가요소 · 수업방법 · 주안점만 생성합니다</span>
            </div>
          )}

          {/* 붙여넣을 표 */}
          {rows.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center border border-dashed border-gray-300 rounded-lg">
              성취기준을 추가하면 표가 만들어집니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[11px]" style={{ minWidth: 1100 }}>
                <thead className="bg-gray-100 text-center font-bold">
                  <tr>
                    <th className={cell} rowSpan={2} style={{ width: '9%' }}>단원명</th>
                    <th className={cell} rowSpan={2} style={{ width: '20%' }}>교육과정 성취기준</th>
                    <th className={cell} rowSpan={2} style={{ width: '12%' }}>평가 요소</th>
                    <th className={cell} colSpan={3}>평가 방법</th>
                    <th className={cell} rowSpan={2} style={{ width: '7%' }}>시기<br />(시수/누계)</th>
                    <th className={cell} rowSpan={2} style={{ width: '13%' }}>수업 방법</th>
                    <th className={cell} rowSpan={2} style={{ width: '24%' }}>수업-평가 연계의 주안점</th>
                    <th className={cell} rowSpan={2} style={{ width: '6%' }}>비고</th>
                  </tr>
                  <tr>
                    <th className={cell}>정기<br />시험</th>
                    <th className={cell}>수행</th>
                    <th className={cell}>기타</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.code}>
                      <td className={cell}>{r.unit}</td>
                      <td className={cell}>{r.standard}</td>
                      <td className={cell}>
                        <textarea
                          value={r.element}
                          onChange={e => update(r.code, 'element', e.target.value)}
                          rows={3}
                          className="w-full resize-y border-0 p-0 text-[11px] focus:ring-0 bg-transparent"
                          placeholder="평가 요소"
                        />
                      </td>
                      <td className={cell}></td>
                      <td className={cell}></td>
                      <td className={cell}></td>
                      <td className={cell}></td>
                      <td className={cell}>
                        <textarea
                          value={r.teachingMethod}
                          onChange={e => update(r.code, 'teachingMethod', e.target.value)}
                          rows={3}
                          className="w-full resize-y border-0 p-0 text-[11px] focus:ring-0 bg-transparent"
                          placeholder="수업 방법"
                        />
                      </td>
                      <td className={cell}>
                        <textarea
                          value={r.notes}
                          onChange={e => update(r.code, 'notes', e.target.value)}
                          rows={4}
                          className="w-full resize-y border-0 p-0 text-[11px] focus:ring-0 bg-transparent whitespace-pre-wrap"
                          placeholder="[도입]&#10;[수업]&#10;[평가]"
                        />
                      </td>
                      <td className={`${cell} text-center no-copy`}>
                        <button
                          onClick={() => remove(r.code)}
                          title="이 행 삭제"
                          className="text-gray-300 hover:text-red-500"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 한글 붙여넣기용 사본 (화면 밖) */}
          <div className="copy-source" ref={tableRef} aria-hidden="true">
            <table>
              <thead>
                <tr>
                  <th rowSpan={2}>단원명</th>
                  <th rowSpan={2}>교육과정 성취기준</th>
                  <th rowSpan={2}>평가 요소</th>
                  <th colSpan={3}>평가 방법</th>
                  <th rowSpan={2}>시기(시수/누계)</th>
                  <th rowSpan={2}>수업 방법</th>
                  <th rowSpan={2}>수업-평가 연계의 주안점</th>
                  <th rowSpan={2}>비고</th>
                </tr>
                <tr>
                  <th>정기시험</th><th>수행</th><th>기타</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.code}>
                    <td>{r.unit}</td>
                    <td>{r.standard}</td>
                    <td>{r.element}</td>
                    <td></td><td></td><td></td>
                    <td></td>
                    <td>{r.teachingMethod}</td>
                    <td>{r.notes}</td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[11px] text-gray-500 flex items-start gap-1.5">
            <Info size={13} className="shrink-0 mt-0.5" />
            <span>
              <strong>단원명</strong>에는 교육과정상 <strong>영역</strong>이 들어갑니다. 교과서 단원명(<code>I. …</code>)은
              교과서마다 달라 직접 수정하셔야 합니다. 평가 방법·시기·비고 칸은 붙여넣은 뒤 한글에서 채우세요.
            </span>
          </p>
        </>
      )}
    </Card>
  );
};

export default PlanCard;
