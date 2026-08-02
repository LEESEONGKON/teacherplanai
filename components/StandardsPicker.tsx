import React, { useEffect, useMemo, useState } from 'react';
import { PlanData, TeachingPlanItem } from '../types';
import { BookOpen, Check, Search, Plus, Info, AlertCircle, Loader2 } from 'lucide-react';
import {
  CurriculumData,
  CurriculumStandard,
  SchoolLevel,
  SCHOOL_LEVEL_LABEL,
  extractStandardCode,
  formatStandard,
  loadCurriculum,
} from '../services/curriculumData';
import { createId } from '../services/geminiService';

interface Props {
  data: PlanData;
  onChange: React.Dispatch<React.SetStateAction<PlanData>>;
}

const StandardsPicker: React.FC<Props> = ({ data, onChange }) => {
  const [schoolLevel, setSchoolLevel] = useState<SchoolLevel>('middle');
  const [curriculum, setCurriculum] = useState<CurriculumData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [subjectName, setSubjectName] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Load the requested school level on demand
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    loadCurriculum(schoolLevel)
      .then(loaded => {
        if (cancelled) return;
        setCurriculum(loaded);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Curriculum load failed', err);
        setLoadError('교육과정 데이터를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [schoolLevel]);

  // Match the subject typed on the 기본 정보 tab when the data arrives
  useEffect(() => {
    if (!curriculum) return;
    setSelected(new Set());
    setDomainFilter('');

    const names = curriculum.subjects.map(s => s.name);
    if (subjectName && names.includes(subjectName)) return;

    const typed = (data.subject || '').trim();
    const exact = names.find(n => n === typed);
    const loose = typed ? names.find(n => n.replace(/\s/g, '') === typed.replace(/\s/g, '')) : undefined;
    setSubjectName(exact || loose || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curriculum]);

  const subject = useMemo(
    () => curriculum?.subjects.find(s => s.name === subjectName) || null,
    [curriculum, subjectName]
  );

  const domains = useMemo(
    () => (subject ? Array.from(new Set(subject.standards.map(s => s.d).filter(Boolean))) : []),
    [subject]
  );

  // Codes already present in the teaching plan, so we never insert duplicates
  const existingCodes = useMemo(() => {
    const set = new Set<string>();
    for (const p of data.teachingPlans) {
      const code = extractStandardCode(p.standard);
      if (code) set.add(code);
    }
    return set;
  }, [data.teachingPlans]);

  const visible = useMemo(() => {
    if (!subject) return [];
    const kw = keyword.trim();
    return subject.standards.filter(s => {
      if (domainFilter && s.d !== domainFilter) return false;
      if (kw && !(s.t.includes(kw) || s.c.includes(kw))) return false;
      return true;
    });
  }, [subject, domainFilter, keyword]);

  const grouped = useMemo(() => {
    const map = new Map<string, CurriculumStandard[]>();
    for (const s of visible) {
      const key = s.d || '기타';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries());
  }, [visible]);

  const selectableVisible = visible.filter(s => !existingCodes.has(s.c));
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every(s => selected.has(s.c));

  const toggle = (code: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        selectableVisible.forEach(s => next.delete(s.c));
      } else {
        selectableVisible.forEach(s => next.add(s.c));
      }
      return next;
    });
  };

  const handleAdd = () => {
    if (!subject || selected.size === 0) return;

    const picked = subject.standards.filter(s => selected.has(s.c) && !existingCodes.has(s.c));
    if (picked.length === 0) {
      alert('추가할 새 성취기준이 없습니다. (이미 계획에 포함된 항목입니다)');
      return;
    }

    const rows: TeachingPlanItem[] = picked.map(s => ({
      id: createId('std'),
      unit: s.d,                 // 교육과정상 '영역'. 교과서 단원명은 사용자가 직접 수정한다.
      standard: formatStandard(s),
      element: '',
      method: [],
      teachingMethod: '',
      notes: '',
      remarks: '',
      period: '',
      hours: '',
    }));

    onChange(prev => ({ ...prev, teachingPlans: [...prev.teachingPlans, ...rows] }));
    setSelected(new Set());
    alert(
      `${rows.length}개의 성취기준을 교수학습 계획에 추가했습니다.\n\n` +
      `'3. 교수학습 계획' 탭에서 평가요소·수업방법·주안점을 채우세요.\n` +
      `(해당 탭의 [선택 행 AI로 채우기] 버튼을 쓸 수 있습니다)`
    );
  };

  const newlySelectedCount = selected.size;

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold text-gray-800 mb-2 flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-indigo-600" />
          2. 성취기준 선택
        </h2>
        <p className="text-gray-600 text-sm mb-6">
          <strong>2022 개정 교육과정</strong>의 성취기준이 앱에 내장되어 있습니다.
          과목을 고르고 필요한 성취기준을 선택하면 교수학습 계획에 그대로 추가됩니다.
          <span className="text-indigo-700 font-medium"> AI나 API 키 없이 즉시 동작하며, 공식 원문 그대로입니다.</span>
        </p>

        {/* School level + subject */}
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-bold text-gray-800 mb-1">학교급</label>
            <div className="flex gap-2">
              {(['middle', 'high'] as SchoolLevel[]).map(level => (
                <button
                  key={level}
                  onClick={() => setSchoolLevel(level)}
                  className={`flex-1 px-4 py-2 rounded-md border text-sm font-bold transition-colors ${
                    schoolLevel === level
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {SCHOOL_LEVEL_LABEL[level]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-800 mb-1">
              과목 {curriculum && <span className="font-normal text-gray-500">({curriculum.subjects.length}개)</span>}
            </label>
            <select
              value={subjectName}
              onChange={e => { setSubjectName(e.target.value); setSelected(new Set()); setDomainFilter(''); }}
              disabled={isLoading || !curriculum}
              className="w-full border border-gray-300 rounded-md p-2 text-sm bg-white focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
            >
              <option value="">— 과목을 선택하세요 —</option>
              {curriculum?.subjects.map(s => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.standards.length})
                </option>
              ))}
            </select>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> 교육과정 데이터를 불러오는 중...
          </div>
        )}

        {loadError && (
          <div className="bg-red-50 border-l-4 border-red-400 p-3 text-sm text-red-800 flex items-center gap-2">
            <AlertCircle size={16} /> {loadError}
          </div>
        )}

        {!isLoading && !loadError && subject && (
          <>
            {/* Filters */}
            <div className="grid md:grid-cols-2 gap-4 mb-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">영역</label>
                <select
                  value={domainFilter}
                  onChange={e => setDomainFilter(e.target.value)}
                  className="w-full border border-gray-300 rounded-md p-2 text-sm bg-white focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">전체 영역</option>
                  {domains.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">검색</label>
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={keyword}
                    onChange={e => setKeyword(e.target.value)}
                    placeholder="키워드 또는 코드 (예: 함수, 9수02)"
                    className="w-full border border-gray-300 rounded-md p-2 pl-8 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Select all */}
            <div className="flex items-center justify-between border-y border-gray-200 py-2 mb-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-gray-700">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  disabled={selectableVisible.length === 0}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                표시된 {visible.length}개 전체 선택
              </label>
              <span className="text-xs text-gray-500">
                선택 {newlySelectedCount}개
                {existingCodes.size > 0 && ` · 이미 추가됨 ${visible.filter(s => existingCodes.has(s.c)).length}개`}
              </span>
            </div>

            {/* Standard list */}
            <div className="max-h-[28rem] overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
              {grouped.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-8">조건에 맞는 성취기준이 없습니다.</p>
              )}
              {grouped.map(([domain, list]) => (
                <div key={domain}>
                  <div className="bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-600 sticky top-0 border-b border-gray-200">
                    {domain} <span className="font-normal text-gray-400">({list.length})</span>
                  </div>
                  {list.map(s => {
                    const already = existingCodes.has(s.c);
                    const checked = selected.has(s.c);
                    return (
                      <label
                        key={s.c + s.t.slice(0, 8)}
                        className={`flex items-start gap-3 px-3 py-2 text-sm transition-colors ${
                          already ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'hover:bg-indigo-50 cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={already}
                          onChange={() => toggle(s.c)}
                          className="mt-1 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 shrink-0 disabled:opacity-50"
                        />
                        <span>
                          <span className="font-mono font-bold text-indigo-700 mr-1">{s.c}</span>
                          {s.t}
                          {already && <span className="ml-2 text-[11px] text-green-600 font-bold whitespace-nowrap">✓ 추가됨</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>

            <button
              onClick={handleAdd}
              disabled={newlySelectedCount === 0}
              className={`w-full mt-4 py-3 rounded-lg font-bold text-white flex justify-center items-center gap-2 transition-all ${
                newlySelectedCount === 0
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 shadow-md transform hover:scale-[1.01]'
              }`}
            >
              <Plus size={18} />
              선택한 {newlySelectedCount}개를 교수학습 계획에 추가
            </button>
          </>
        )}

        {!isLoading && !loadError && !subject && (
          <p className="text-sm text-gray-500 text-center py-10 border border-dashed border-gray-300 rounded-md">
            위에서 과목을 선택하면 성취기준 목록이 나타납니다.
          </p>
        )}

        {/* Notes + attribution */}
        <div className="mt-6 space-y-2">
          <div className="bg-blue-50 border-l-4 border-blue-400 p-3 text-xs text-blue-900 flex gap-2">
            <Info size={14} className="shrink-0 mt-0.5" />
            <span>
              <strong>단원명</strong>에는 교육과정상 <strong>영역</strong>이 들어갑니다.
              <code className="mx-1 px-1 bg-white rounded border border-blue-200">I. 수와 연산</code>처럼 로마숫자가 붙은 단원명은
              교육과정이 아니라 <strong>교과서별</strong>로 다르므로, 교수학습 계획 탭에서 직접 수정하세요.
            </span>
          </div>
          {curriculum && (
            <p className="text-[11px] text-gray-400 leading-relaxed">
              출처: {curriculum.source} 데이터 가공: {curriculum.generatedFrom}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default StandardsPicker;
