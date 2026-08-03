import React, { useEffect, useState } from 'react';
import { PlanData, GradeLevel, EvaluationPlanRow, PerformanceTask } from '../types';
import { Plus, Trash2, AlertCircle, Sparkles, Upload, BookOpen, Check } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { extractEvaluationPlanFromFile, extractAchievementLevelsFromFile, createId } from '../services/geminiService';
import { getLevelSubjects, loadAchievementLevels, aggregateLevels, extractStandardCode, LevelKey } from '../services/curriculumData';

interface Props {
  data: PlanData;
  // Accepts an updater so effects can derive from the latest state instead of a
  // captured snapshot. App passes setData directly, so this is source-compatible.
  onChange: React.Dispatch<React.SetStateAction<PlanData>>;
}

// Pure helper: derives the performance-task list from evaluation rows.
// Kept outside the component so it can be called from functional state updates.
const syncPerformanceTasks = (rows: EvaluationPlanRow[], existingTasks: PerformanceTask[]): PerformanceTask[] => {
  const perfRows = rows.filter(r => r.category === '수행평가');

  return perfRows.map(row => {
    const existingById = existingTasks.find(t => t.id === row.id);
    if (existingById) {
      // Do NOT force overwrite the name.
      // This allows Tab 5 (Rubrics) to have a specific task name (e.g. from file)
      // that differs from the generic Area Name in Tab 4.
      return existingById;
    }

    // Try to find by name match if ID match fails (legacy support)
    const existingByName = existingTasks.find(t => t.name === row.name);
    if (existingByName) {
      return { ...existingByName, id: row.id, name: row.name };
    }

    // Create new if not found
    return {
      id: row.id,
      name: row.name || '수행평가',
      standards: [],
      description: '',
      criteria: { A: '', B: '', C: '', D: '', E: '' },
      method: [],
      rubricType: 'general',
      rubricElements: [],
      baseScore: '*기본 점수 ○점, 기본 점수를 부여할 수 없는 경우(미인정 결과, 불성실한 수업 참여 등) ○점'
    };
  });
};

const EvaluationConfig: React.FC<Props> = ({ data, onChange }) => {
  const isFreeSemester = data.grade === GradeLevel.GRADE_1;
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 성취수준(A~E) 추출용 문서
  const [levelFile, setLevelFile] = useState<File | null>(null);
  const [isExtractingLevels, setIsExtractingLevels] = useState(false);

  // 내장 성취수준 데이터 지원 여부
  const [builtInSubjects, setBuiltInSubjects] = useState<string[] | null>(null);
  const [isApplyingBuiltIn, setIsApplyingBuiltIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLevelSubjects()
      .then(list => { if (!cancelled) setBuiltInSubjects(list); })
      .catch(err => { console.warn('성취수준 데이터 로드 실패', err); if (!cancelled) setBuiltInSubjects([]); });
    return () => { cancelled = true; };
  }, []);

  const builtInAvailable = !!builtInSubjects?.includes((data.subject || '').trim());

  const planCodes = data.teachingPlans
    .map(p => extractStandardCode(p.standard))
    .filter((c): c is string => !!c);

  const handleApplyBuiltInLevels = async () => {
    if (data.achievementScale !== '5') {
      alert(
        '내장된 성취수준 자료는 5단계(A~E) 기준입니다.\n\n' +
        '현재 3단계(A/B/C)로 설정되어 있어 그대로 옮기면 수준의 의미가 달라집니다.\n' +
        "위의 '성취수준 단계'를 5단계로 바꾼 뒤 다시 시도해주세요."
      );
      return;
    }
    if (planCodes.length === 0) {
      alert(
        "'3. 교수학습 계획'에 성취기준이 없습니다.\n\n" +
        "'2. 성취기준 선택' 탭에서 이번 학기에 다룰 성취기준을 먼저 추가해주세요."
      );
      return;
    }

    setIsApplyingBuiltIn(true);
    try {
      const store = await loadAchievementLevels();
      const byCode = store.subjects[data.subject.trim()] || {};

      const covered = planCodes.filter(c => byCode[c]);
      const uncovered = planCodes.filter(c => !byCode[c]);
      if (covered.length === 0) {
        alert('교수학습 계획의 성취기준에 해당하는 성취수준 자료를 찾지 못했습니다.');
        return;
      }

      const keys: LevelKey[] = ['A', 'B', 'C', 'D', 'E'];
      const aggregated = aggregateLevels(byCode, covered, keys);

      const confirmMsg =
        `교수학습 계획의 성취기준 ${covered.length}개에 대한 공식 성취수준을 수준별로 합쳐 아래 표를 채웁니다.\n` +
        (uncovered.length > 0 ? `\n(자료가 없는 성취기준 ${uncovered.length}개는 제외됩니다)\n` : '') +
        `\n기존에 입력된 성취수준은 덮어씁니다. 계속하시겠습니까?`;
      if (!window.confirm(confirmMsg)) return;

      onChange(prev => ({ ...prev, achievementStandards: { ...prev.achievementStandards, ...aggregated } }));
      alert(
        `성취기준 ${covered.length}개의 공식 성취수준을 반영했습니다.\n` +
        `AI가 새로 쓴 문장이 아니라 문서 원문을 그대로 이어붙인 결과입니다.`
      );
    } catch (e: any) {
      console.error(e);
      alert(`성취수준 데이터를 불러오지 못했습니다.\n${e?.message || e}`);
    } finally {
      setIsApplyingBuiltIn(false);
    }
  };

  const handleExtractLevels = async () => {
    if (!levelFile) return;
    if (!data.subject) {
      alert("'1. 기본 정보' 탭에서 과목명을 먼저 입력해주세요. (추출 정확도에 필요합니다)");
      return;
    }
    if (!window.confirm('문서에서 성취수준을 추출해 아래 표에 덮어씁니다. 계속하시겠습니까?')) return;

    setIsExtractingLevels(true);
    try {
      const result = await extractAchievementLevelsFromFile(levelFile, data.achievementScale, data.subject);
      const keys = data.achievementScale === '5'
        ? (['A', 'B', 'C', 'D', 'E'] as const)
        : (['A', 'B', 'C'] as const);

      const filled = keys.filter(k => !!result[k]);
      if (filled.length === 0) {
        alert(
          '문서에서 성취수준을 찾지 못했습니다.\n\n' +
          '· 성취기준만 있고 성취수준(A/B/C) 표가 없는 문서일 수 있습니다.\n' +
          '· 한글(HWP) 파일은 읽을 수 없습니다. PDF로 저장 후 다시 시도해주세요.'
        );
        return;
      }

      onChange(prev => {
        const next = { ...prev.achievementStandards };
        keys.forEach(k => { if (result[k]) next[k] = result[k] as string; });
        return { ...prev, achievementStandards: next };
      });
      setLevelFile(null);
      alert(`${filled.join(', ')} 수준을 문서에서 추출해 채웠습니다.\n내용을 검토한 뒤 필요하면 수정하세요.`);
    } catch (e: any) {
      console.error(e);
      alert(`성취수준 추출 중 오류가 발생했습니다.\n${e?.message || e}`);
    } finally {
      setIsExtractingLevels(false);
    }
  };

  useEffect(() => {
    const perfRows = data.evaluationRows.filter(r => r.category === '수행평가');
    const perfTasks = data.performanceTasks;
    let needsUpdate = false;
    
    if (perfRows.length !== perfTasks.length) {
      needsUpdate = true;
    } else {
      const rowIds = perfRows.map(r => r.id).sort().join(',');
      const taskIds = perfTasks.map(t => t.id).sort().join(',');
      if (rowIds !== taskIds) {
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      console.log("EvaluationConfig: Detected desync between rows and tasks. Repairing...");
      onChange(prev => ({
        ...prev,
        performanceTasks: syncPerformanceTasks(prev.evaluationRows, prev.performanceTasks)
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.evaluationRows.length, data.evaluationRows.map(r => r.id).join(',')]);

  useEffect(() => {
    if (!isFreeSemester) return;

    onChange(prev => {
      const hasWrittenExam = prev.evaluationRows.some(row => row.category === '지필평가');
      if (!hasWrittenExam) return prev;

      const perfRows = prev.evaluationRows.filter(row => row.category === '수행평가');
      if (perfRows.length > 0) {
        return { ...prev, evaluationRows: perfRows };
      }

      const rowId = createId('perf');
      const newRow: EvaluationPlanRow = {
        id: rowId,
        category: '수행평가',
        name: '과정 중심 평가',
        maxScore: '100',
        ratio: 100,
        typeSelect: 0, typeShort: 0, typeEssay: 100, typeOther: 0,
        timing: '수시'
      };
      const newTask: PerformanceTask = {
        id: rowId,
        name: newRow.name,
        standards: [],
        description: '',
        criteria: { A: '', B: '', C: '', D: '', E: '' },
        method: [],
        rubricType: 'general',
        rubricElements: [],
        baseScore: '*기본 점수 ○점, 기본 점수를 부여할 수 없는 경우(미인정 결과, 불성실한 수업 참여 등) ○점'
      };

      return { ...prev, evaluationRows: [newRow], performanceTasks: [newTask] };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFreeSemester]);

  const handleFileUpload = async () => {
    if (!uploadFile) {
        alert("파일을 선택해주세요.");
        return;
    }

    const confirmed = window.confirm("업로드한 파일의 내용으로 현재 평가 계획 목록을 덮어쓰시겠습니까?\n(수행평가 기준 탭의 목록도 함께 초기화됩니다)");
    if (!confirmed) return;

    setIsAnalyzing(true);
    try {
        const newRows = await extractEvaluationPlanFromFile(uploadFile);
        if (newRows.length > 0) {
            onChange(prev => ({
              ...prev,
              evaluationRows: newRows,
              performanceTasks: syncPerformanceTasks(newRows, prev.performanceTasks)
            }));
            alert("평가 계획을 성공적으로 불러왔습니다.");
            setUploadFile(null);
        } else {
            alert("파일에서 유효한 평가 계획 내용을 찾지 못했습니다.");
        }
    } catch (e) {
        console.error(e);
        alert("분석 중 오류가 발생했습니다.");
    } finally {
        setIsAnalyzing(false);
    }
  };

  const addRow = (category: '지필평가' | '수행평가') => {
    let defaultName = '';
    const rowId = createId('row');
    
    if (category === '지필평가') {
      const existingWritten = data.evaluationRows.filter(r => r.category === '지필평가');
      if (data.grade === GradeLevel.GRADE_3 && data.semester === 2) {
          defaultName = existingWritten.length === 0 ? '2학기고사' : `${existingWritten.length + 1}회고사`;
      } else {
          if (existingWritten.length === 0) defaultName = '1회고사 (중간고사)';
          else if (existingWritten.length === 1) defaultName = '2회고사 (기말고사)';
          else defaultName = `${existingWritten.length + 1}회고사`;
      }
    } else {
      defaultName = '수행평가'; 
    }

    const newRow: EvaluationPlanRow = {
      id: rowId,
      category,
      name: defaultName,
      maxScore: '', 
      ratio: 0,
      typeSelect: 0, typeShort: 0, typeEssay: 0, typeOther: 0,
      timing: ''
    };

    let newPerformanceTasks = [...data.performanceTasks];
    if (category === '수행평가') {
      newPerformanceTasks.push({
        id: rowId, 
        name: defaultName,
        standards: [],
        description: '',
        criteria: { A: '', B: '', C: '', D: '', E: '' },
        method: [],
        rubricType: 'general',
        rubricElements: [],
        baseScore: '*기본 점수 ○점, 기본 점수를 부여할 수 없는 경우(미인정 결과, 불성실한 수업 참여 등) ○점'
      });
    }

    onChange({
      ...data,
      evaluationRows: [...data.evaluationRows, newRow],
      performanceTasks: newPerformanceTasks
    });
  };

  const removeRow = (id: string) => {
    const newRows = data.evaluationRows.filter(row => row.id !== id);
    const newTasks = data.performanceTasks.filter(task => task.id !== id);
    onChange({
      ...data,
      evaluationRows: newRows,
      performanceTasks: newTasks
    });
  };

  const updateRow = (id: string, field: keyof EvaluationPlanRow, value: any) => {
    const updatedRows = data.evaluationRows.map(row => 
      row.id === id ? { ...row, [field]: value } : row
    );
    // Note: We intentionally do NOT update performanceTasks name here to keep them independent
    onChange({
      ...data,
      evaluationRows: updatedRows,
      // performanceTasks: updatedTasks // Removed
    });
  };

  const updateStandard = (grade: keyof typeof data.achievementStandards, value: string) => {
    onChange({
      ...data,
      achievementStandards: {
        ...data.achievementStandards,
        [grade]: value
      }
    });
  };

  const totalRatio = data.evaluationRows.reduce((sum, row) => sum + row.ratio, 0);
  
  const chartData = data.evaluationRows.map(row => ({
    name: row.name || (row.category === '지필평가' ? '지필평가' : '수행평가'),
    value: row.ratio
  }));
  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088fe', '#00C49F'];

  const renderTableRows = (category: '지필평가' | '수행평가') => {
    const rows = data.evaluationRows.filter(r => r.category === category);
    
    if (rows.length === 0 && category === '지필평가' && isFreeSemester) {
       return null;
    }

    return (
      <React.Fragment>
        {rows.map((row, idx) => {
            const typeSum = row.typeSelect + row.typeShort + row.typeEssay + row.typeOther;
            const isTypeSumValid = typeSum === row.ratio;

            return (
              <tr key={row.id} className="hover:bg-gray-50">
                {idx === 0 && (
                  <td 
                    className="border p-2 text-center font-bold bg-gray-50 align-middle" 
                    rowSpan={rows.length + 1}
                  >
                    {category}
                  </td>
                )}
                <td className="border p-2">
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => updateRow(row.id, 'name', e.target.value)}
                    className="w-full border-gray-300 rounded p-1 text-sm"
                    placeholder={category === '수행평가' ? '수행평가명 입력' : ''}
                  />
                </td>
                <td className="border p-2">
                  <input
                    type="text"
                    value={row.maxScore}
                    onChange={(e) => updateRow(row.id, 'maxScore', e.target.value)}
                    className="w-full border-gray-300 rounded p-1 text-sm text-center"
                    placeholder="점수"
                  />
                </td>
                <td className="border p-2">
                  <input
                    type="number"
                    value={row.ratio}
                    onChange={(e) => updateRow(row.id, 'ratio', Number(e.target.value))}
                    className="w-full border-gray-300 rounded p-1 text-sm text-center font-bold text-indigo-700"
                  />
                </td>
                
                {/* Type Weights */}
                <td className="border p-2">
                  <input
                    type="number"
                    value={row.typeSelect}
                    onChange={(e) => updateRow(row.id, 'typeSelect', Number(e.target.value))}
                    className="w-full border-gray-300 rounded p-1 text-xs text-center"
                    placeholder="0"
                  />
                </td>
                <td className="border p-2">
                   <input
                    type="number"
                    value={row.typeShort}
                    onChange={(e) => updateRow(row.id, 'typeShort', Number(e.target.value))}
                    className="w-full border-gray-300 rounded p-1 text-xs text-center"
                    placeholder="0"
                  />
                </td>
                <td className="border p-2">
                   <input
                    type="number"
                    value={row.typeEssay}
                    onChange={(e) => updateRow(row.id, 'typeEssay', Number(e.target.value))}
                    className="w-full border-gray-300 rounded p-1 text-xs text-center"
                    placeholder="0"
                  />
                </td>
                <td className="border p-2 bg-gray-50 border-r-2 border-r-gray-300">
                   <input
                    type="number"
                    value={row.typeOther}
                    onChange={(e) => updateRow(row.id, 'typeOther', Number(e.target.value))}
                    className="w-full border-gray-300 rounded p-1 text-xs text-center"
                    placeholder="0"
                  />
                   {!isTypeSumValid && (
                     <div className="text-[10px] text-red-500 text-center mt-1 font-bold whitespace-nowrap">
                       합계≠{row.ratio}
                     </div>
                   )}
                </td>

                <td className="border p-2">
                   <input
                    type="text"
                    value={row.timing}
                    onChange={(e) => updateRow(row.id, 'timing', e.target.value)}
                    className="w-full border-gray-300 rounded p-1 text-sm text-center"
                    placeholder="4월"
                  />
                </td>
                <td className="border p-2 text-center">
                  <button onClick={() => removeRow(row.id)} className="text-red-500 hover:text-red-700">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            );
        })}
        <tr>
             {rows.length === 0 && (
                <td className="border p-2 text-center font-bold bg-gray-50 align-middle">
                    {category}
                </td>
             )}
            <td colSpan={9} className="border p-2 text-center">
                <button 
                    onClick={() => addRow(category)}
                    className="text-xs flex items-center justify-center gap-1 text-indigo-600 hover:bg-indigo-50 w-full py-1 rounded"
                >
                    <Plus size={14} /> {category} 추가
                </button>
            </td>
        </tr>
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        
        {/* SECTION 1: Methods and Ratios */}
        <h2 className="text-xl font-bold text-gray-800 mb-4">1. 평가 방법과 반영비율</h2>
        
        {/* File Upload Section */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-md p-4 mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                기존 평가계획 파일 업로드
              </h3>
              <p className="text-xs text-indigo-700 mt-1">
                작년 평가 계획서나 예시 파일(PDF, 이미지 등)을 업로드하면 내용을 인식하여 자동으로 채워줍니다.
                <br/>
                <span className="text-red-500">* 주의: 파일 적용 시 '4. 수행평가 기준' 목록도 함께 재설정됩니다.</span>
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
               <input 
                  type="file"
                  accept=".pdf, .png, .jpg, .jpeg"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setUploadFile(e.target.files[0]);
                    }
                  }}
                  className="block w-full text-xs text-gray-500
                    file:mr-2 file:py-1.5 file:px-3
                    file:rounded-md file:border-0
                    file:text-xs file:font-semibold
                    file:bg-white file:text-indigo-700
                    hover:file:bg-indigo-50
                  "
                />
              <button 
                onClick={handleFileUpload}
                disabled={!uploadFile || isAnalyzing}
                className={`px-3 py-1.5 rounded-md text-xs font-bold text-white shadow-sm transition-colors flex items-center gap-1 ${
                  !uploadFile 
                  ? 'bg-gray-300 cursor-not-allowed' 
                  : isAnalyzing
                    ? 'bg-indigo-400 cursor-wait'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {isAnalyzing ? '분석 중...' : <><Upload size={12} /> 적용하기</>}
              </button>
            </div>
          </div>
        </div>

        {isFreeSemester && (
           <div className="bg-blue-50 p-4 rounded-md border border-blue-200 mb-6 flex items-start gap-3">
             <AlertCircle className="text-blue-600 shrink-0 mt-0.5" size={20} />
             <div>
                <p className="text-blue-800 font-bold text-sm">1학년 자유학기제 설정 적용 중</p>
                <p className="text-sm text-blue-600 mt-1">
                  1학년은 지필평가를 실시하지 않고, 수행평가 100%로 설정됩니다.
                </p>
             </div>
           </div>
        )}

        {/* ERROR WARNING BANNER */}
        {totalRatio !== 100 && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-md flex items-start gap-3 animate-pulse">
            <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={20} />
            <div>
               <p className="text-red-800 font-bold text-sm">반영비율 합계 오류</p>
               <p className="text-sm text-red-600 mt-1">
                 지필평가와 수행평가 비율의 합계는 반드시 <strong>100%</strong>가 되어야 합니다.<br/>
                 현재 합계: <span className="font-bold underline">{totalRatio}%</span> (차이: {100 - totalRatio}%)
               </p>
            </div>
          </div>
        )}

        <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm border-collapse">
                <thead>
                    <tr className="bg-gray-100 text-gray-600">
                        <th className="border p-2 w-20" rowSpan={2}>평가<br/>방법</th>
                        <th className="border p-2 w-48" rowSpan={2}>평가 영역</th>
                        <th className="border p-2 w-20" rowSpan={2}>영역 만점<br/>(점)</th>
                        <th className="border p-2 w-20" rowSpan={2}>학기말<br/>반영비율<br/>(%)</th>
                        <th className="border p-2" colSpan={4}>평가 유형별 반영 비율(%)</th>
                        <th className="border p-2 w-24" rowSpan={2}>평가 시기</th>
                        <th className="border p-2 w-12" rowSpan={2}>삭제</th>
                    </tr>
                    <tr className="bg-gray-100 text-gray-600 text-xs">
                        <th className="border p-1 w-16">선택형<br/>단답형</th>
                        <th className="border p-1 w-16">서술형</th>
                        <th className="border p-1 w-16">논술형</th>
                        <th className="border p-1 w-16 border-r-2 border-r-gray-300">기타</th>
                    </tr>
                </thead>
                <tbody>
                    {!isFreeSemester && renderTableRows('지필평가')}
                    {renderTableRows('수행평가')}
                    <tr className="bg-gray-50 font-bold">
                        <td className="border p-2 text-center" colSpan={3}>합 계</td>
                        <td className={`border p-2 text-center ${totalRatio === 100 ? 'text-green-600' : 'text-red-500'}`}>
                            {totalRatio}%
                        </td>
                        <td className="border p-2" colSpan={6}></td>
                    </tr>
                </tbody>
            </table>
            {totalRatio !== 100 && (
                <p className="text-red-500 text-xs mt-2 text-right">* 반영비율 합계는 반드시 100%가 되어야 합니다.</p>
            )}
        </div>

        {/* Chart */}
        <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center p-4 mb-8">
             <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    fill="#8884d8"
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" />
                </PieChart>
             </ResponsiveContainer>
        </div>

        <hr className="my-8 border-gray-200" />

        {/* SECTION 2: Achievement Rates */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
             <h2 className="text-xl font-bold text-gray-800">2. 성취율과 성취도</h2>
             <div className="flex gap-4 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => onChange({...data, achievementScale: '5'})}
                  className={`px-3 py-1 text-sm rounded-md transition-all ${data.achievementScale === '5' ? 'bg-white shadow text-indigo-600 font-bold' : 'text-gray-500'}`}
                >
                  5단계 (A-E)
                </button>
                <button
                  onClick={() => onChange({...data, achievementScale: '3'})}
                  className={`px-3 py-1 text-sm rounded-md transition-all ${data.achievementScale === '3' ? 'bg-white shadow text-indigo-600 font-bold' : 'text-gray-500'}`}
                >
                  3단계 (A-C)
                </button>
             </div>
          </div>
          
          <p className="text-sm text-gray-600 mb-2">
            지필평가 및 수행평가의 반영비율 환산 점수의 합계(성취율)에 따라 다음과 같이 평정한다.
          </p>

          <table className="w-full text-sm border-collapse border border-gray-300 text-center">
             <thead className="bg-gray-100">
               <tr>
                 <th className="border border-gray-300 p-2 w-1/2">성취율</th>
                 <th className="border border-gray-300 p-2 w-1/2">성취도</th>
               </tr>
             </thead>
             <tbody>
               {data.achievementScale === '5' ? (
                 <>
                  <tr><td className="border border-gray-300 p-2">90% 이상</td><td className="border border-gray-300 p-2 font-bold">A</td></tr>
                  <tr><td className="border border-gray-300 p-2">80% 이상 ~ 90% 미만</td><td className="border border-gray-300 p-2 font-bold">B</td></tr>
                  <tr><td className="border border-gray-300 p-2">70% 이상 ~ 80% 미만</td><td className="border border-gray-300 p-2 font-bold">C</td></tr>
                  <tr><td className="border border-gray-300 p-2">60% 이상 ~ 70% 미만</td><td className="border border-gray-300 p-2 font-bold">D</td></tr>
                  <tr><td className="border border-gray-300 p-2">60% 미만</td><td className="border border-gray-300 p-2 font-bold">E</td></tr>
                 </>
               ) : (
                 <>
                  <tr><td className="border border-gray-300 p-2">80% 이상</td><td className="border border-gray-300 p-2 font-bold">A</td></tr>
                  <tr><td className="border border-gray-300 p-2">60% 이상 ~ 80% 미만</td><td className="border border-gray-300 p-2 font-bold">B</td></tr>
                  <tr><td className="border border-gray-300 p-2">60% 미만</td><td className="border border-gray-300 p-2 font-bold">C</td></tr>
                 </>
               )}
             </tbody>
          </table>
        </div>

        <hr className="my-8 border-gray-200" />

        {/* SECTION 3: Achievement Standards */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">3. 학기단위 성취수준</h2>
          
           {/* 내장 공식 성취수준으로 채우기 (해당 과목 자료가 있을 때만 노출) */}
           {builtInAvailable && (
             <div className="w-full bg-indigo-50 p-4 rounded-lg border border-indigo-200 mb-4">
               <p className="text-sm text-indigo-900 font-bold mb-1 flex items-center gap-2">
                 <BookOpen size={16} /> 공식 성취수준이 내장된 과목입니다 ({data.subject})
               </p>
               <p className="text-xs text-indigo-700 mb-3 leading-relaxed">
                 교수학습 계획에 담긴 성취기준 <strong>{planCodes.length}개</strong>의 공식 성취수준을
                 수준별로 이어붙여 아래 표를 채웁니다.
                 <br />
                 <strong className="text-indigo-800">AI가 문장을 만들지 않습니다.</strong> 문서 원문을 그대로 사용하며,
                 이는 공식 문서가 '영역별 성취수준'을 구성하는 방식과 같습니다.
               </p>
               <button
                 onClick={handleApplyBuiltInLevels}
                 disabled={isApplyingBuiltIn}
                 className={`px-4 py-2 rounded text-xs font-bold text-white transition-colors flex items-center gap-2 ${
                   isApplyingBuiltIn ? 'bg-gray-300 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700 shadow-sm'
                 }`}
               >
                 {isApplyingBuiltIn
                   ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> 적용 중...</>
                   : <><Check size={14} /> 교수학습 계획의 성취기준으로 채우기</>}
               </button>
             </div>
           )}

           {/* 성취수준 문서에서 자동 채우기 */}
           <div className="w-full bg-green-50 p-4 rounded-lg border border-green-100 mb-6">
             <p className="text-sm text-green-900 font-bold mb-1 flex items-center gap-2">
               <Upload size={16} /> 평가기준 문서에서 자동으로 채우기
             </p>
             <p className="text-xs text-green-700 mb-3 leading-relaxed">
               국가교육과정정보센터(NCIC)의 <strong>「2022 개정 교육과정에 따른 평가기준」</strong> 중
               담당 과목 문서를 올리면 성취수준 진술을 추출해 아래 표를 채웁니다.
               <br />
               <strong className="text-green-800">PDF·이미지·텍스트 파일만 읽을 수 있습니다.</strong>
               한글(HWP) 파일은 한글에서 <strong>[PDF로 저장]</strong> 후 올려주세요.
               <br />
               문서에 성취수준이 없으면 <strong>아무것도 채우지 않습니다</strong> (임의로 지어내지 않습니다).
             </p>

             <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
               <input
                 type="file"
                 accept=".pdf,.txt,.jpg,.jpeg,.png"
                 onChange={e => setLevelFile(e.target.files?.[0] || null)}
                 className="block w-full text-xs text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-green-600 file:text-white hover:file:bg-green-700 cursor-pointer"
               />
               <button
                 onClick={handleExtractLevels}
                 disabled={!levelFile || isExtractingLevels}
                 className={`px-4 py-2 rounded text-xs font-bold text-white whitespace-nowrap transition-colors flex items-center justify-center gap-2 ${
                   !levelFile || isExtractingLevels
                     ? 'bg-gray-300 cursor-not-allowed'
                     : 'bg-green-600 hover:bg-green-700 shadow-sm'
                 }`}
               >
                 {isExtractingLevels
                   ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> 분석 중...</>
                   : <><Sparkles size={14} /> 성취수준 추출</>}
               </button>
             </div>
           </div>

          <table className="w-full text-sm border-collapse border border-gray-300">
            <thead className="bg-gray-100 text-center">
              <tr>
                <th className="border border-gray-300 p-2 w-20">성취수준</th>
                <th className="border border-gray-300 p-2">학기 단위 성취수준 진술</th>
              </tr>
            </thead>
            <tbody>
              {(['A', 'B', 'C', ...(data.achievementScale === '5' ? ['D', 'E'] : [])] as const).map((grade) => (
                <tr key={grade}>
                  <td className="border border-gray-300 p-2 text-center font-bold text-lg">{grade}</td>
                  <td className="border border-gray-300 p-2">
                    <textarea
                      value={data.achievementStandards[grade]}
                      onChange={(e) => updateStandard(grade, e.target.value)}
                      className="w-full p-2 border border-gray-200 rounded resize-y"
                      rows={3}
                      placeholder="학생들이 한 학기 동안 학습한 성취기준에 도달한 정도를 종합하여 나타내는 것으로 작성하세요."
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <hr className="my-8 border-gray-200" />

        {/* SECTION 4: Notes */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            4. 평가 유의사항
          </h2>
          <p className="text-xs text-gray-500 mb-2">
            평가 운영 시 유의해야 할 사항을 자유롭게 수정하세요. 이 내용은 출력 시 표 하단에 포함됩니다.
          </p>
          <textarea
            value={data.evaluationNote}
            onChange={(e) => onChange({...data, evaluationNote: e.target.value})}
            className="w-full h-64 p-4 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm leading-relaxed"
            placeholder="평가 유의사항을 입력하세요."
          />
        </div>

      </div>
    </div>
  );
};

export default EvaluationConfig;