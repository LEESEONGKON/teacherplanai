import React, { useEffect, useRef, useState } from 'react';
import { Check, Upload, Sparkles, Info } from 'lucide-react';
import {
  AchievementScale,
  LEVEL_KEYS,
  LevelKey,
  aggregateLevels,
  getLevelSubjectScales,
  loadAchievementLevels,
} from '../../services/curriculumData';
import { extractAchievementLevelsFromFile } from '../../services/geminiService';
import { EMPTY_LEVELS, PlanRow } from './types';
import CopyButton from './CopyButton';
import Card from './Card';

interface Props {
  subject: string;
  rows: PlanRow[];
  scale: AchievementScale | null;
  levels: Record<LevelKey, string>;
  onChange: (next: { scale: AchievementScale | null; levels: Record<LevelKey, string> }) => void;
}

const LevelsCard: React.FC<Props> = ({ subject, rows, scale, levels, onChange }) => {
  const tableRef = useRef<HTMLDivElement>(null);
  const [official, setOfficial] = useState<Record<string, AchievementScale> | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getLevelSubjectScales()
      .then(setOfficial)
      .catch(err => { console.warn('성취수준 데이터 로드 실패', err); setOfficial({}); });
  }, []);

  const officialScale = official?.[subject.trim()];
  const hasBuiltIn = !!officialScale;
  const shown = LEVEL_KEYS[scale || officialScale || '5'];

  const handleApply = async () => {
    if (!officialScale) return;
    if (rows.length === 0) {
      alert("먼저 '1. 교수학습-평가 계획'에서 이번 학기에 다룰 성취기준을 추가해주세요.");
      return;
    }
    setBusy(true);
    try {
      const store = await loadAchievementLevels();
      const byCode = store.subjects[subject.trim()]?.standards || {};
      const codes: string[] = Array.from(new Set<string>(rows.map(r => r.code)));
      const covered = codes.filter(c => byCode[c]);
      const missing = codes.length - covered.length;

      if (covered.length === 0) {
        alert('교수학습 계획의 성취기준에 해당하는 성취수준 자료를 찾지 못했습니다.');
        return;
      }
      const keys = LEVEL_KEYS[officialScale];
      const aggregated = aggregateLevels(byCode, covered, keys);
      const next = { ...EMPTY_LEVELS };
      keys.forEach(k => { next[k] = aggregated[k]; });

      onChange({ scale: officialScale, levels: next });
      alert(
        `성취기준 ${covered.length}개의 공식 성취수준을 ${officialScale}단계로 반영했습니다.` +
        (missing > 0 ? `\n(자료가 없는 성취기준 ${missing}개는 제외)` : '') +
        `\n\nAI가 쓴 문장이 아니라 문서 원문을 그대로 이어붙인 결과입니다.`
      );
    } catch (e: any) {
      console.error(e);
      alert(`성취수준을 불러오지 못했습니다.\n${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const handleExtract = async () => {
    if (!file || !subject) return;
    setBusy(true);
    try {
      const result = await extractAchievementLevelsFromFile(file, scale || '5', subject);
      const keys = LEVEL_KEYS[scale || '5'];
      const filled = keys.filter(k => !!result[k]);
      if (filled.length === 0) {
        alert(
          '문서에서 성취수준을 찾지 못했습니다.\n\n' +
          '· 성취수준 표가 없는 문서일 수 있습니다.\n' +
          '· 한글(HWP)은 읽을 수 없습니다. PDF로 저장 후 다시 시도해주세요.'
        );
        return;
      }
      const next = { ...levels };
      keys.forEach(k => { if (result[k]) next[k] = result[k] as string; });
      onChange({ scale: scale || '5', levels: next });
      setFile(null);
      alert(`${filled.join(', ')} 수준을 문서에서 추출했습니다. 내용을 검토해주세요.`);
    } catch (e: any) {
      console.error(e);
      alert(`추출 중 오류가 발생했습니다.\n${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const setLevel = (k: LevelKey, v: string) => onChange({ scale, levels: { ...levels, [k]: v } });
  const filledCount = shown.filter(k => levels[k]).length;

  return (
    <Card
      no={3}
      title="학기단위 성취수준"
      desc="교수학습 계획에 담은 성취기준의 공식 성취수준을 수준별로 이어붙입니다. AI가 문장을 만들지 않습니다."
      right={<CopyButton targetRef={tableRef} disabled={filledCount === 0} label="표 복사" />}
    >
      {!subject ? (
        <p className="text-sm text-gray-500 py-6 text-center border border-dashed border-gray-300 rounded-lg">
          위에서 과목을 선택하세요.
        </p>
      ) : (
        <>
          {hasBuiltIn ? (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-indigo-900 mb-2.5 leading-relaxed">
                <strong>{subject}</strong>의 공식 성취수준이 내장되어 있습니다
                (<strong>{officialScale}단계</strong>). 계획에 담은 성취기준 <strong>{rows.length}개</strong> 기준으로 채웁니다.
              </p>
              <button
                onClick={handleApply}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300"
              >
                {busy
                  ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> 불러오는 중…</>
                  : <><Check size={14} /> 공식 성취수준 불러오기</>}
              </button>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-green-900 font-bold mb-1 flex items-center gap-1.5">
                <Upload size={13} /> 내장되지 않은 과목입니다
              </p>
              <p className="text-[11px] text-green-800 mb-2.5 leading-relaxed">
                NCIC 「평가기준」 문서를 올리면 성취수준을 추출합니다.
                <strong> PDF·이미지·텍스트만 </strong>읽을 수 있으며, 한글(HWP)은 PDF로 저장 후 올려주세요.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="file"
                  accept=".pdf,.txt,.jpg,.jpeg,.png"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className="block w-full text-[11px] text-gray-600 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-[11px] file:font-semibold file:bg-green-600 file:text-white cursor-pointer"
                />
                <button
                  onClick={handleExtract}
                  disabled={!file || busy}
                  className="px-3 py-1.5 rounded-md text-xs font-bold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 whitespace-nowrap flex items-center gap-1.5"
                >
                  <Sparkles size={13} /> 추출
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-gray-700">성취수준 단계</span>
            <div className="flex bg-gray-100 rounded-md p-0.5">
              {(['5', '3'] as AchievementScale[]).map(s => (
                <button
                  key={s}
                  onClick={() => onChange({ scale: s, levels })}
                  disabled={hasBuiltIn}
                  title={hasBuiltIn ? '이 과목의 공식 단계로 고정됩니다' : undefined}
                  className={`px-2.5 py-1 text-xs rounded transition-all disabled:opacity-60 ${
                    (scale || officialScale) === s ? 'bg-white shadow text-indigo-600 font-bold' : 'text-gray-500'
                  }`}
                >
                  {s === '5' ? '5단계 (A~E)' : '3단계 (A~C)'}
                </button>
              ))}
            </div>
          </div>

          {/* 한글 붙여넣기용 사본 (화면 밖) */}
          <div className="copy-source" ref={tableRef} aria-hidden="true">
            <table>
              <thead>
                <tr><th style={{ width: 70 }}>성취수준</th><th>학기 단위 성취수준 진술</th></tr>
              </thead>
              <tbody>
                {shown.map(k => (
                  <tr key={k}>
                    <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{k}</td>
                    <td>{levels[k] || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <table className="w-full border-collapse text-xs">
            <thead className="bg-gray-100 text-center font-bold">
              <tr>
                <th className="border border-black p-2 w-16">성취수준</th>
                <th className="border border-black p-2">학기 단위 성취수준 진술</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(k => (
                <tr key={k}>
                  <td className="border border-black p-2 text-center font-bold">{k}</td>
                  <td className="border border-black p-1">
                    <textarea
                      value={levels[k] || ''}
                      onChange={e => setLevel(k, e.target.value)}
                      rows={3}
                      className="w-full resize-y border-0 p-1 text-xs focus:ring-0 bg-transparent leading-relaxed"
                      placeholder={`${k} 수준 진술`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-3 text-[11px] text-gray-500 flex items-start gap-1.5">
            <Info size={13} className="shrink-0 mt-0.5" />
            <span>
              공식 문서가 '영역별 성취수준'을 만드는 방식과 같게, 해당 성취기준들의 같은 수준 진술을 이어붙입니다.
              실제 문서에서는 이 표가 <strong>맨 뒤 별도 장</strong>에 들어갑니다.
            </span>
          </p>
        </>
      )}
    </Card>
  );
};

export default LevelsCard;
