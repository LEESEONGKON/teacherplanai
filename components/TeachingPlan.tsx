import React, { useState, useEffect } from 'react';
import { PlanData, TeachingPlanItem } from '../types';
import { generateNotesFromMaterial } from '../services/geminiService';
import { Plus, Trash2, GripVertical, Sparkles, FileText, X, Copy, Check, RotateCcw } from 'lucide-react';

interface Props {
  data: PlanData;
  onChange: (data: PlanData) => void;
}

const TeachingPlan: React.FC<Props> = ({ data, onChange }) => {
  // Batch Delete & Undo State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [backupPlan, setBackupPlan] = useState<TeachingPlanItem[] | null>(null);
  const [showUndo, setShowUndo] = useState(false);

  // Notes Generator Modal State
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [notesStandard, setNotesStandard] = useState('');
  const [notesFile, setNotesFile] = useState<File | null>(null);
  const [generatedNotes, setGeneratedNotes] = useState('');
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Clear undo history after 5 seconds
  useEffect(() => {
    if (showUndo) {
      const timer = setTimeout(() => {
        setShowUndo(false);
        setBackupPlan(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showUndo]);

  const addRow = () => {
    const newRow: TeachingPlanItem = {
      id: Date.now().toString(),
      unit: '',
      standard: '',
      element: '',
      method: ['지필'],
      teachingMethod: '',
      notes: '',
      remarks: '',
      period: '',
      hours: ''
    };
    onChange({
      ...data,
      teachingPlans: [...data.teachingPlans, newRow]
    });
  };

  const removeRow = (id: string) => {
    // Backup for undo
    setBackupPlan(data.teachingPlans);
    setShowUndo(true);

    onChange({
      ...data,
      teachingPlans: data.teachingPlans.filter(row => row.id !== id)
    });
    
    // Remove from selection if present
    if (selectedIds.has(id)) {
        const newSet = new Set(selectedIds);
        newSet.delete(id);
        setSelectedIds(newSet);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allIds = data.teachingPlans.map(row => row.id);
      setSelectedIds(new Set(allIds));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectRow = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    
    if (window.confirm(`선택한 ${selectedIds.size}개 항목을 삭제하시겠습니까?`)) {
      // Backup for undo
      setBackupPlan(data.teachingPlans);
      setShowUndo(true);

      const newPlans = data.teachingPlans.filter(row => !selectedIds.has(row.id));
      onChange({
        ...data,
        teachingPlans: newPlans
      });
      setSelectedIds(new Set());
    }
  };

  const handleUndo = () => {
    if (backupPlan) {
      onChange({
        ...data,
        teachingPlans: backupPlan
      });
      setBackupPlan(null);
      setShowUndo(false);
      setSelectedIds(new Set()); // Reset selection just in case
    }
  };

  const updateRow = (id: string, field: keyof TeachingPlanItem, value: any) => {
    onChange({
      ...data,
      teachingPlans: data.teachingPlans.map(row => 
        row.id === id ? { ...row, [field]: value } : row
      )
    });
  };

  const toggleMethod = (id: string, method: string) => {
    const row = data.teachingPlans.find(r => r.id === id);
    if (!row) return;
    
    const currentMethods = row.method || [];
    const newMethods = currentMethods.includes(method)
      ? currentMethods.filter(m => m !== method)
      : [...currentMethods, method];
    
    updateRow(id, 'method', newMethods);
  };

  const handleGenerateNotes = async () => {
    if (!notesFile) {
      alert("학습지 파일을 업로드해주세요.");
      return;
    }
    if (!notesStandard) {
      alert("관련 성취기준을 입력해주세요.");
      return;
    }

    setIsGeneratingNotes(true);
    setGeneratedNotes('');
    setCopySuccess(false);

    try {
      const result = await generateNotesFromMaterial(notesFile, notesStandard, data.subject);
      setGeneratedNotes(result);
    } catch (e) {
      alert("생성 중 오류가 발생했습니다.");
    } finally {
      setIsGeneratingNotes(false);
    }
  };

  const copyNotesToClipboard = () => {
    navigator.clipboard.writeText(generatedNotes);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const uniqueStandards: string[] = Array.from(new Set(data.teachingPlans.map(p => p.standard).filter((s): s is string => !!s)));

  return (
    <>
      <div className="space-y-6 animate-fade-in relative">
        {/* Top Controls */}
        <div>
          {/* Notes Assistant Button Card */}
          <div className="w-full bg-white p-6 rounded-lg shadow-sm border border-green-100 bg-green-50">
            <h3 className="text-lg font-bold text-green-900 mb-2 flex items-center gap-2">
              <FileText className="w-5 h-5 text-green-600" />
              수업-평가 연계 주안점 생성 도우미
            </h3>
            <p className="text-xs text-green-700 mb-3">
              실제 학습지 파일을 올리면 성취기준과 분석하여 [도입]-[수업]-[평가] 단계의 주안점을 만들어줍니다.
            </p>
            <button
              onClick={() => setShowNotesModal(true)}
              className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-bold text-sm shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              <Sparkles size={16} />
              도우미 열기
            </button>
          </div>
        </div>

        {/* Undo Notification */}
        {showUndo && (
           <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-4 z-50 animate-fade-in">
              <span>항목이 삭제되었습니다.</span>
              <button 
                onClick={handleUndo}
                className="flex items-center gap-1 text-yellow-400 font-bold hover:text-yellow-300 underline"
              >
                 <RotateCcw size={16} /> 실행 취소 (복구)
              </button>
              <button onClick={() => setShowUndo(false)} className="text-gray-400 hover:text-white">
                <X size={16} />
              </button>
           </div>
        )}

        {/* Table Section */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800">{data.subject || ''}과 교수학습-평가 계획 및 방법</h2>
            
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <button
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-1 bg-red-100 text-red-600 hover:bg-red-200 px-3 py-1.5 rounded-md text-xs font-bold transition-colors"
                >
                  <Trash2 size={14} /> 선택 항목 삭제 ({selectedIds.size})
                </button>
              )}
              <button
                onClick={addRow}
                className="flex items-center gap-2 text-indigo-600 font-medium hover:bg-indigo-50 px-3 py-1.5 rounded transition-colors text-xs border border-indigo-200"
              >
                <Plus size={14} /> 행 추가
              </button>
            </div>
          </div>
          
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-center w-12 border-r">
                   <input 
                      type="checkbox"
                      checked={data.teachingPlans.length > 0 && selectedIds.size === data.teachingPlans.length}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                   />
                </th>
                <th className="px-3 py-3 text-left font-medium text-gray-500 uppercase tracking-wider w-24">단원명<br/>(로마자)</th>
                <th className="px-3 py-3 text-left font-medium text-gray-500 uppercase tracking-wider w-48">교육과정 성취기준</th>
                <th className="px-3 py-3 text-left font-medium text-gray-500 uppercase tracking-wider w-32">평가 요소</th>
                <th className="px-3 py-3 text-left font-medium text-gray-500 uppercase tracking-wider w-24">평가 방법</th>
                <th className="px-3 py-3 text-left font-medium text-gray-500 uppercase tracking-wider w-32">수업 방법</th>
                <th className="px-3 py-3 text-left font-medium text-gray-500 uppercase tracking-wider w-48">수업-평가 연계 주안점<br/>[도입]-[수업]-[평가]</th>
                <th className="px-3 py-3 text-left font-medium text-gray-500 uppercase tracking-wider w-24">비고</th>
                <th className="px-3 py-3 text-left font-medium text-gray-500 uppercase tracking-wider w-32">시기(시수)</th>
                <th className="px-3 py-3 text-center font-medium text-gray-500 uppercase tracking-wider w-12">삭제</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.teachingPlans.map((row, index) => (
                <tr key={row.id} className={`hover:bg-gray-50 ${selectedIds.has(row.id) ? 'bg-indigo-50' : ''}`}>
                  <td className="px-3 py-4 text-center border-r relative">
                     <div className="absolute left-1 top-1/2 -translate-y-1/2 text-gray-300">
                        <GripVertical size={12} />
                     </div>
                     <input 
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => handleSelectRow(row.id)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer ml-2"
                     />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <textarea
                      value={row.unit}
                      onChange={(e) => updateRow(row.id, 'unit', e.target.value)}
                      className="w-full text-xs border-gray-300 rounded p-1 h-32 resize-none"
                      placeholder="I. 수와 연산"
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <textarea
                      value={row.standard}
                      onChange={(e) => updateRow(row.id, 'standard', e.target.value)}
                      className="w-full text-xs border-gray-300 rounded p-1 h-32 resize-none"
                      placeholder="[9수01-01] 성취기준..."
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <textarea
                      value={row.element}
                      onChange={(e) => updateRow(row.id, 'element', e.target.value)}
                      className="w-full text-xs border-gray-300 rounded p-1 h-32 resize-none"
                      placeholder="핵심 평가 요소"
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-col gap-1">
                      {['지필', '수행', '기타'].map(m => (
                        <label key={m} className="flex items-center gap-1 text-xs cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={(row.method || []).includes(m)}
                            onChange={() => toggleMethod(row.id, m)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          {m}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <textarea
                      value={row.teachingMethod}
                      onChange={(e) => updateRow(row.id, 'teachingMethod', e.target.value)}
                      className="w-full text-xs border-gray-300 rounded p-1 h-32 resize-none"
                      placeholder="강의식, 모둠활동..."
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <textarea
                      value={row.notes}
                      onChange={(e) => updateRow(row.id, 'notes', e.target.value)}
                      className="w-full text-xs border-gray-300 rounded p-1 h-32 resize-none font-mono leading-relaxed"
                      placeholder="[도입]...&#13;&#10;[수업]...&#13;&#10;[평가]..."
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <textarea
                      value={row.remarks || ''}
                      onChange={(e) => updateRow(row.id, 'remarks', e.target.value)}
                      className="w-full text-xs border-gray-300 rounded p-1 h-32 resize-none"
                      placeholder="자유 기재"
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      type="text"
                      value={row.period}
                      onChange={(e) => updateRow(row.id, 'period', e.target.value)}
                      placeholder="3월 1주~3월 2주"
                      className="w-full text-xs border-gray-300 rounded p-1 mb-1"
                    />
                    <input
                      type="text"
                      value={row.hours}
                      onChange={(e) => updateRow(row.id, 'hours', e.target.value)}
                      placeholder="(4/14)"
                      className="w-full text-xs border-gray-300 rounded p-1 text-center font-mono"
                    />
                  </td>
                  <td className="px-3 py-2 text-center align-top pt-8">
                    <button 
                      onClick={() => removeRow(row.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <button
            onClick={addRow}
            className="mt-4 flex items-center gap-2 text-indigo-600 font-medium hover:bg-indigo-50 px-4 py-2 rounded transition-colors"
          >
            <Plus size={18} />
            행 추가하기
          </button>
        </div>
      </div>

      {/* Notes Generator Modal - Moved outside the container to fix positioning */}
      {showNotesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
              <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                <Sparkles className="text-green-600" size={20} />
                수업-평가 연계 주안점 생성 도우미
              </h3>
              <button onClick={() => setShowNotesModal(false)} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="bg-blue-50 p-3 rounded text-sm text-blue-800 mb-4">
                선생님이 사용하시는 학습지나 수업 자료를 업로드하고 관련 성취기준을 입력하면, 
                <strong>[도입]-[수업]-[평가]</strong> 형식의 연계 주안점을 AI가 작성해줍니다.
                <br/>(각 단계별 50자 내외로 생성됩니다)
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">관련 성취기준</label>
                <div className="space-y-2">
                  <select 
                    className="w-full border-gray-300 rounded-md shadow-sm p-2 border text-sm"
                    onChange={(e) => setNotesStandard(e.target.value)}
                    value={notesStandard}
                  >
                    <option value="">성취기준 선택 또는 직접 입력</option>
                    {uniqueStandards.map((std, idx) => (
                      <option key={idx} value={std}>
                        {std.length > 50 ? std.substring(0, 50) + '...' : std}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={notesStandard}
                    onChange={(e) => setNotesStandard(e.target.value)}
                    className="w-full border-gray-300 rounded-md shadow-sm p-2 border h-20 text-sm"
                    placeholder="직접 입력: [9수01-01] 소인수분해의 뜻을 알고..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">학습지/수업자료 업로드</label>
                <input 
                  type="file" 
                  accept=".pdf, .txt, .jpg, .png"
                  onChange={(e) => {
                    if(e.target.files) setNotesFile(e.target.files[0]);
                  }}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-green-600 file:text-white hover:file:bg-green-700"
                />
              </div>

              <button
                onClick={handleGenerateNotes}
                disabled={isGeneratingNotes || !notesFile || !notesStandard}
                className={`w-full py-2 rounded-md font-bold text-white shadow-sm transition-colors flex justify-center items-center gap-2 ${
                  isGeneratingNotes || !notesFile || !notesStandard
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {isGeneratingNotes ? '생성 중...' : 'AI 생성하기'}
              </button>

              {generatedNotes && (
                <div className="mt-4 animate-fade-in">
                  <label className="block text-sm font-bold text-gray-700 mb-1">생성 결과</label>
                  <div className="relative">
                    <textarea
                      readOnly
                      value={generatedNotes}
                      className="w-full bg-gray-50 border-gray-300 rounded-md shadow-sm p-3 border h-40 text-sm font-mono leading-relaxed"
                    />
                    <button
                      onClick={copyNotesToClipboard}
                      className="absolute top-2 right-2 p-2 bg-white border border-gray-200 rounded shadow-sm hover:bg-gray-100 transition-colors text-gray-600"
                      title="복사하기"
                    >
                      {copySuccess ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 text-right">
                    * 위 내용을 복사하여 계획표의 '수업-평가 연계 주안점' 칸에 붙여넣으세요.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TeachingPlan;