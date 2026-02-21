import React, { useEffect, useState } from 'react';
import { PlanData, GradeLevel, EvaluationPlanRow, PerformanceTask } from '../types';
import { Plus, Trash2, AlertCircle, Sparkles, Upload } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { extractEvaluationPlanFromFile } from '../services/geminiService';

interface Props {
  data: PlanData;
  onChange: (data: PlanData) => void;
}

const EvaluationConfig: React.FC<Props> = ({ data, onChange }) => {
  const isFreeSemester = data.grade === GradeLevel.GRADE_1;
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Helper to sync performance tasks based on evaluation rows
  const syncPerformanceTasks = (rows: EvaluationPlanRow[]): PerformanceTask[] => {
    const perfRows = rows.filter(r => r.category === '수행평가');
    
    return perfRows.map(row => {
      const existingById = data.performanceTasks.find(t => t.id === row.id);
      if (existingById) {
        // CHANGED: Do NOT force overwrite the name. 
        // This allows Tab 4 (Rubrics) to have a specific task name (e.g. from file) 
        // that differs from the generic Area Name in Tab 3.
        return existingById;
      }
      
      // Try to find by name match if ID match fails (legacy support)
      const existingByName = data.performanceTasks.find(t => t.name === row.name);
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
      const syncedTasks = syncPerformanceTasks(data.evaluationRows);
      onChange({ ...data, performanceTasks: syncedTasks });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.evaluationRows.length, JSON.stringify(data.evaluationRows.map(r => r.id))]);

  useEffect(() => {
    if (isFreeSemester) {
      const hasWrittenExam = data.evaluationRows.some(row => row.category === '지필평가');
      if (hasWrittenExam) {
        const perfRows = data.evaluationRows.filter(row => row.category === '수행평가');
        if (perfRows.length === 0) {
           const rowId = Date.now().toString();
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

           onChange({ 
             ...data, 
             evaluationRows: [newRow],
             performanceTasks: [newTask]
           });
        } else {
           onChange({ ...data, evaluationRows: perfRows });
        }
      }
    }
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
            const newTasks = syncPerformanceTasks(newRows);
            onChange({ 
              ...data, 
              evaluationRows: newRows,
              performanceTasks: newTasks
            });
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
    const rowId = Date.now().toString();
    
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
          
           {/* Hint about File Analysis */}
           <div className="w-full bg-green-50 p-6 rounded-lg border border-green-100 flex flex-col justify-center mb-6">
             <p className="text-sm text-green-800 font-medium mb-1">
               💡 학기단위 성취수준을 자동으로 생성하고 싶으신가요?
             </p>
             <p className="text-xs text-green-600">
               상단의 <strong>[2. 파일 분석]</strong> 탭을 이용하면 영역별 성취수준 파일을 분석하여 이곳에 자동으로 채워줍니다.
             </p>
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