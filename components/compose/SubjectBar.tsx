import React, { useEffect, useState } from 'react';
import { BookOpen, Loader2, AlertCircle } from 'lucide-react';
import {
  CurriculumData,
  SchoolLevel,
  SCHOOL_LEVEL_LABEL,
  isApproved,
  loadCurriculum,
} from '../../services/curriculumData';

interface Props {
  schoolLevel: SchoolLevel;
  subject: string;
  onChange: (next: { schoolLevel: SchoolLevel; subject: string }) => void;
  onCurriculum: (data: CurriculumData | null) => void;
}

/** 상단에서 학교급·과목을 한 번만 고르면 아래 네 카드가 모두 그 과목 기준으로 동작한다. */
const SubjectBar: React.FC<Props> = ({ schoolLevel, subject, onChange, onCurriculum }) => {
  const [curriculum, setCurriculum] = useState<CurriculumData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    onCurriculum(null);

    loadCurriculum(schoolLevel)
      .then(data => {
        if (cancelled) return;
        setCurriculum(data);
        onCurriculum(data);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('교육과정 데이터 로드 실패', err);
        setError('교육과정 데이터를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolLevel]);

  const subjectCount = curriculum?.subjects.length ?? 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 sm:p-5">
      <div className="flex flex-col lg:flex-row lg:items-end gap-4">
        <div className="lg:w-64">
          <label className="block text-xs font-bold text-gray-700 mb-1.5">학교급</label>
          <div className="flex gap-2">
            {(['middle', 'high'] as SchoolLevel[]).map(level => (
              <button
                key={level}
                onClick={() => onChange({ schoolLevel: level, subject: '' })}
                className={`flex-1 px-3 py-2 rounded-lg border text-sm font-bold transition-colors ${
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

        <div className="flex-1">
          <label className="block text-xs font-bold text-gray-700 mb-1.5">
            과목 {subjectCount > 0 && <span className="font-normal text-gray-400">({subjectCount}개)</span>}
          </label>
          <select
            value={subject}
            onChange={e => onChange({ schoolLevel, subject: e.target.value })}
            disabled={loading || !curriculum}
            className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
          >
            <option value="">— 과목을 선택하세요 —</option>
            {curriculum?.subjects.map(s => (
              <option key={s.name} value={s.name}>
                {isApproved(s) ? `${s.name} — 학교자율시간 승인 과목` : s.name} ({s.standards.length})
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <p className="mt-3 text-xs text-gray-500 flex items-center gap-1.5">
          <Loader2 size={13} className="animate-spin" /> 교육과정 데이터를 불러오는 중…
        </p>
      )}
      {error && (
        <p className="mt-3 text-xs text-red-700 flex items-center gap-1.5">
          <AlertCircle size={13} /> {error}
        </p>
      )}
      {!loading && !error && !subject && (
        <p className="mt-3 text-xs text-gray-500 flex items-center gap-1.5">
          <BookOpen size={13} /> 과목을 선택하면 아래 네 가지 작성 도구가 모두 활성화됩니다.
        </p>
      )}
    </div>
  );
};

export default SubjectBar;
