import React, { useEffect, useState } from 'react';
import { FileText, Settings, Key, X, Check, ExternalLink, HelpCircle } from 'lucide-react';
import { CurriculumData } from '../../services/curriculumData';
import SubjectBar from './SubjectBar';
import PlanCard from './PlanCard';
import WorksheetCard from './WorksheetCard';
import LevelsCard from './LevelsCard';
import RubricCard from './RubricCard';
import { ComposeState, INITIAL_COMPOSE, PlanRow } from './types';

const DRAFT_KEY = 'TEACHER_COMPOSE_DRAFT_V1';
const API_KEY = 'TEACHER_PLAN_API_KEY';

const normalize = (parsed: any): ComposeState => ({
  ...INITIAL_COMPOSE,
  ...parsed,
  rows: Array.isArray(parsed?.rows) ? parsed.rows : [],
  tasks: Array.isArray(parsed?.tasks) ? parsed.tasks : [],
  levels: { ...INITIAL_COMPOSE.levels, ...(parsed?.levels || {}) },
});

const hasContent = (s: ComposeState) =>
  !!s.subject || s.rows.length > 0 || s.tasks.length > 0 ||
  Object.values(s.levels).some(v => !!v);

const loadDraft = (): ComposeState | null => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? normalize(parsed) : null;
  } catch (e) {
    console.warn('임시 저장 복원 실패', e);
    return null;
  }
};

const ComposeApp: React.FC = () => {
  const [initialDraft] = useState(() => loadDraft());
  const [state, setState] = useState<ComposeState>(initialDraft ?? INITIAL_COMPOSE);
  const [restored, setRestored] = useState(initialDraft !== null && hasContent(initialDraft));
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [curriculum, setCurriculum] = useState<CurriculumData | null>(null);

  const [keyOpen, setKeyOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(API_KEY);
    if (stored) { setKeyInput(stored); setHasKey(true); }
  }, []);

  // 입력이 있을 때만 저장한다. 첫 방문에 기본값을 저장하면 다음 방문에
  // 하지도 않은 작업을 '복원했다'고 알리게 된다.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (hasContent(state)) {
          localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
          setSavedAt(new Date());
        } else {
          localStorage.removeItem(DRAFT_KEY);
          setSavedAt(null);
        }
      } catch (e) {
        console.warn('자동 저장 실패', e);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [state]);

  const patch = (part: Partial<ComposeState>) => setState(prev => ({ ...prev, ...part }));

  const handleReset = () => {
    if (!window.confirm('작성 중인 내용을 모두 지우고 새로 시작할까요?')) return;
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
    setState(INITIAL_COMPOSE);
    setRestored(false);
  };

  const saveKey = () => {
    const v = keyInput.trim();
    if (v) {
      localStorage.setItem(API_KEY, v);
      setHasKey(true);
      setKeyOpen(false);
    } else if (window.confirm('저장된 API 키를 삭제할까요?')) {
      localStorage.removeItem(API_KEY);
      setHasKey(false);
      setKeyInput('');
      setKeyOpen(false);
    }
  };

  const applyNotes = (code: string, notes: string) =>
    patch({ rows: state.rows.map(r => (r.code === code ? { ...r, notes } : r)) });

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800">
      <header className="bg-indigo-700 text-white shadow-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <h1 className="font-bold flex items-center gap-2 text-sm sm:text-base">
            <FileText size={20} />
            <span>교수학습 및 평가 운영 계획 작성 도우미</span>
          </h1>
          <div className="flex items-center gap-2">
            {savedAt && (
              <span className="hidden lg:flex items-center gap-1 text-[11px] text-indigo-200 whitespace-nowrap"
                title="작성 내용은 이 브라우저에만 저장됩니다">
                <Check size={12} /> 자동 저장됨 {savedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <a href="./classic.html"
              className="hidden sm:flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1.5 rounded-md text-xs border border-indigo-500">
              <ExternalLink size={13} /> 이전 버전
            </a>
            <button onClick={() => setKeyOpen(true)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border ${
                hasKey ? 'bg-indigo-600 border-indigo-500 hover:bg-indigo-500'
                       : 'bg-amber-500 border-amber-400 hover:bg-amber-400 text-white'}`}>
              <Settings size={13} /> {hasKey ? 'API 키' : 'API 키 설정'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        {restored && (
          <div className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded-r flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-sm text-amber-900">
              <strong>이전에 작성 중이던 내용을 복원했습니다.</strong>
              <span className="text-xs text-amber-700 ml-2">이 브라우저에만 저장됩니다.</span>
            </p>
            <div className="flex gap-2 shrink-0">
              <button onClick={handleReset}
                className="text-xs font-bold px-3 py-1.5 rounded border border-amber-300 bg-white text-amber-800 hover:bg-amber-100">
                새로 시작
              </button>
              <button onClick={() => setRestored(false)}
                className="text-xs px-3 py-1.5 rounded text-amber-700 hover:bg-amber-100">
                계속 작성
              </button>
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl p-4 text-xs text-gray-600 leading-relaxed">
          만든 내용을 <strong>복사해서 한글(HWP) 문서에 붙여넣는</strong> 방식입니다. 서식은 한글에서 정리하세요.
          <br />
          <strong className="text-indigo-700">성취기준과 학기단위 성취수준은 API 키 없이</strong> 바로 쓸 수 있습니다
          (공식 원문 그대로). 평가요소·수업방법·주안점·채점기준을 AI로 만들 때만 키가 필요합니다.
        </div>

        <SubjectBar
          schoolLevel={state.schoolLevel}
          subject={state.subject}
          onChange={next => patch({ ...next, rows: next.subject !== state.subject ? [] : state.rows })}
          onCurriculum={setCurriculum}
        />

        <PlanCard
          curriculum={curriculum}
          subject={state.subject}
          rows={state.rows}
          onRowsChange={rows => patch({ rows })}
        />

        <WorksheetCard subject={state.subject} rows={state.rows} onApply={applyNotes} />

        <LevelsCard
          subject={state.subject}
          rows={state.rows}
          scale={state.levelScale}
          levels={state.levels}
          onChange={next => patch({ levelScale: next.scale, levels: next.levels })}
        />

        <RubricCard
          subject={state.subject}
          rows={state.rows}
          scale={state.levelScale}
          tasks={state.tasks}
          onChange={tasks => patch({ tasks })}
        />

        <footer className="text-[11px] text-gray-400 leading-relaxed pt-2 pb-8">
          성취기준·성취수준 출처: 교육부 고시 2022 개정 교육과정(국가교육과정정보센터 NCIC 공개) 및
          교육부·한국교육과정평가원 「2022 개정 교육과정에 따른 성취수준」. 공공저작물로 출처를 표기해 이용합니다.
          <br />
          AI가 생성한 문안은 반드시 검토한 뒤 사용하세요. 작성 내용은 서버로 전송되지 않고 이 브라우저에만 저장됩니다.
        </footer>
      </main>

      {keyOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
              <h3 className="font-bold flex items-center gap-2">
                <Key size={18} className="text-indigo-600" /> Google Gemini API 키
              </h3>
              <button onClick={() => setKeyOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-600 mb-3 leading-relaxed">
                AI 생성 기능에만 필요합니다. <strong>성취기준·성취수준은 키 없이</strong> 동작합니다.
                <br />키는 <strong>이 브라우저에만</strong> 저장되며 서버로 전송되지 않습니다.
              </p>
              <input
                type="password"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder="AIza…"
                className="w-full border border-gray-300 rounded-lg p-2.5 mb-3 focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-indigo-700 bg-indigo-50 p-2 rounded mb-4 flex items-center gap-1.5">
                <HelpCircle size={13} />
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline font-bold">
                  Google AI Studio
                </a>
                에서 무료로 발급받을 수 있습니다.
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setKeyOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">취소</button>
                <button onClick={saveKey} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold">저장</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComposeApp;
