import React, { useState } from 'react';
import { Sparkles, Upload, AlertTriangle, CornerDownLeft } from 'lucide-react';
import { generateNotesFromMaterial } from '../../services/geminiService';
import { PlanRow } from './types';
import CopyButton from './CopyButton';
import Card from './Card';

interface Props {
  subject: string;
  rows: PlanRow[];
  onApply: (code: string, notes: string) => void;
}

const WorksheetCard: React.FC<Props> = ({ subject, rows, onApply }) => {
  const [code, setCode] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);

  const target = rows.find(r => r.code === code) || null;

  const handleGenerate = async () => {
    if (!file) { alert('학습지 파일을 선택해주세요.'); return; }
    if (!target) { alert('성취기준을 선택해주세요.'); return; }

    setBusy(true);
    setResult('');
    try {
      const text = await generateNotesFromMaterial(file, target.standard, subject);
      if (!text.trim()) {
        alert('생성된 내용이 없습니다. 잠시 후 다시 시도해주세요.');
        return;
      }
      setResult(text.trim());
    } catch (e: any) {
      console.error(e);
      alert(`생성 중 오류가 발생했습니다.\n${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      no={2}
      title="학습지로 주안점 만들기"
      desc="실제 수업에 쓰는 학습지를 올리면 그 내용에 맞춘 [도입]·[수업]·[평가] 주안점을 만듭니다."
      right={<CopyButton text={result} disabled={!result} label="주안점 복사" />}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center border border-dashed border-gray-300 rounded-lg">
          먼저 <strong>1번</strong>에서 성취기준을 추가하세요. 그 중 하나를 골라 주안점을 만듭니다.
        </p>
      ) : (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-4 flex gap-2">
            <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-900 leading-relaxed">
              올린 파일은 <strong>Google AI로 전송</strong>됩니다.
              학생 이름·학번 등 개인정보가 담긴 자료는 올리지 마세요.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">성취기준</label>
              <select
                value={code}
                onChange={e => { setCode(e.target.value); setResult(''); }}
                className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-white"
              >
                <option value="">— 성취기준 선택 —</option>
                {rows.map(r => (
                  <option key={r.code} value={r.code}>
                    {r.code} {r.standard.replace(/^\[[^\]]+\]\s*/, '').slice(0, 40)}…
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">학습지 파일 (PDF · 이미지 · 텍스트)</label>
              <input
                type="file"
                accept=".pdf,.txt,.jpg,.jpeg,.png"
                onChange={e => { setFile(e.target.files?.[0] || null); setResult(''); }}
                className="block w-full text-[11px] text-gray-600 file:mr-2 file:py-1.5 file:px-2.5 file:rounded file:border-0 file:text-[11px] file:font-semibold file:bg-indigo-600 file:text-white cursor-pointer"
              />
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={busy || !file || !target}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300"
          >
            {busy
              ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> 학습지 분석 중…</>
              : <><Upload size={14} /> 학습지로 주안점 만들기</>}
          </button>

          {result && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-gray-700">생성 결과</span>
                {target && (
                  <button
                    onClick={() => { onApply(target.code, result); alert(`${target.code} 행의 주안점에 넣었습니다.`); }}
                    className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                  >
                    <CornerDownLeft size={12} /> 1번 표의 이 성취기준 행에 넣기
                  </button>
                )}
              </div>
              <textarea
                value={result}
                onChange={e => setResult(e.target.value)}
                rows={6}
                className="w-full border border-gray-300 rounded-lg p-2.5 text-xs leading-relaxed font-mono whitespace-pre-wrap focus:ring-2 focus:ring-indigo-500"
              />
              <p className="mt-1.5 text-[11px] text-gray-400 flex items-center gap-1">
                <Sparkles size={11} /> AI가 생성한 문안입니다. 검토 후 사용하세요.
              </p>
            </div>
          )}
        </>
      )}
    </Card>
  );
};

export default WorksheetCard;
