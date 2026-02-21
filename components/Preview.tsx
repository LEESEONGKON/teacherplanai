import React, { useState, useEffect } from 'react';
import { PlanData, GradeLevel } from '../types';
import { EVALUATION_METHODS, EXTRA_EVALUATION_METHODS } from '../constants';
import { Copy, FileInput, Check } from 'lucide-react';

interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface Props {
  data: PlanData;
  editableMargins?: boolean; // Control visibility of drag handles
  margins: Margins; // Lifted state
  onMarginsChange: (margins: Margins) => void; // State updater
  scale?: number; // Zoom scale (1.0 = 100%)
  showPageBreaks?: boolean; // NEW: Toggle visual guides for page breaks
  enablePageBreakControl?: boolean; // NEW: Toggle manual page break buttons
  oneRubricPerPage?: boolean; // NEW: Toggle auto page break for rubrics
}

const KOREAN_ALPHABET = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];

const Preview: React.FC<Props> = ({ data, editableMargins = false, margins, onMarginsChange, scale = 1.0, showPageBreaks = false, enablePageBreakControl = false, oneRubricPerPage = false }) => {
  const isFreeSemester = data.grade === GradeLevel.GRADE_1;
  const is2022 = data.curriculumType === '2022';
  const use5Levels = data.achievementScale === '5';

  const [dragging, setDragging] = useState<'top' | 'right' | 'bottom' | 'left' | null>(null);
  
  // Track which sections are forced to start on a new page
  const [forcedPageBreaks, setForcedPageBreaks] = useState<Record<string, boolean>>({});

  // Handle Dragging Logic
  useEffect(() => {
    if (!editableMargins) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      e.preventDefault();

      // Conversion: 1mm approx 3.78px
      const pxToMm = (px: number) => px / 3.7795;
      const deltaX = pxToMm(e.movementX);
      const deltaY = pxToMm(e.movementY);

      const next = { ...margins };
      
      if (dragging === 'top') next.top = Math.max(0, margins.top + deltaY);
      if (dragging === 'right') next.right = Math.max(0, margins.right - deltaX);
      if (dragging === 'bottom') next.bottom = Math.max(0, margins.bottom - deltaY);
      if (dragging === 'left') next.left = Math.max(0, margins.left + deltaX);

      onMarginsChange({
          top: Number(next.top.toFixed(1)),
          right: Number(next.right.toFixed(1)),
          bottom: Number(next.bottom.toFixed(1)),
          left: Number(next.left.toFixed(1))
      });
    };

    const handleMouseUp = () => {
      setDragging(null);
    };

    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, editableMargins, margins, onMarginsChange]);


  const copyTableToClipboard = (tableId: string) => {
    const table = document.getElementById(tableId);
    if (!table) return;

    const range = document.createRange();
    range.selectNode(table);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    
    try {
      document.execCommand('copy');
      alert('표가 복사되었습니다. 한글(HWP) 문서에 [붙여넣기] 하세요.');
    } catch (err) {
      alert('복사에 실패했습니다.');
    }
    
    window.getSelection()?.removeAllRanges();
  };

  const formatNotes = (text: string) => {
    if (!text) return '';
    return text
      .replace(/[\r\n\s]*\[수업\]/g, '\n[수업]')
      .replace(/[\r\n\s]*\[평가\]/g, '\n[평가]')
      .replace(/[\r\n\s]*\[도입\]/g, '\n[도입]')
      .trim();
  };

  const togglePageBreak = (sectionId: string) => {
    setForcedPageBreaks(prev => ({
        ...prev,
        [sectionId]: !prev[sectionId]
    }));
  };

  const processedPlans = React.useMemo(() => {
    const plans = data.teachingPlans.map(p => ({ 
        ...p, 
        unitRowSpan: 1, 
        teachingMethodRowSpan: 1, 
        notesRowSpan: 1 
    }));

    for (let i = 0; i < plans.length; i++) {
      if (plans[i].unitRowSpan === 0) continue;
      for (let j = i + 1; j < plans.length; j++) {
        if (plans[j].unit === plans[i].unit) {
          plans[i].unitRowSpan++;
          plans[j].unitRowSpan = 0;
        } else {
          break;
        }
      }
    }

    for (let i = 0; i < plans.length; i++) {
        if (plans[i].teachingMethodRowSpan === 0) continue;
        for (let j = i + 1; j < plans.length; j++) {
          if (plans[j].teachingMethod === plans[i].teachingMethod) {
            plans[i].teachingMethodRowSpan++;
            plans[j].teachingMethodRowSpan = 0;
          } else {
            break;
          }
        }
    }

    for (let i = 0; i < plans.length; i++) {
        if (plans[i].notesRowSpan === 0) continue;
        for (let j = i + 1; j < plans.length; j++) {
          if (plans[j].notes === plans[i].notes) {
            plans[i].notesRowSpan++;
            plans[j].notesRowSpan = 0;
          } else {
            break;
          }
        }
    }

    return plans;
  }, [data.teachingPlans]);

  const renderEvaluationDetailRows = (category: '지필평가' | '수행평가') => {
     const rows = data.evaluationRows.filter(r => r.category === category);
     if (rows.length === 0) return null;

     return rows.map((row, idx) => (
        <tr key={row.id}>
           {idx === 0 && (
             <td className="border border-black p-2" rowSpan={rows.length}>{category}</td>
           )}
           <td className="border border-black p-2">{row.name}</td>
           <td className="border border-black p-2 bg-gray-100"></td>
           <td className="border border-black p-2">{row.ratio}</td>
           <td className="border border-black p-2 bg-gray-100">{row.typeSelect || ''}</td>
           <td className="border border-black p-2">{row.typeShort || ''}</td>
           <td className="border border-black p-2">{row.typeEssay || ''}</td>
           <td className="border border-black p-2">{row.typeOther || ''}</td>
           <td className="border border-black p-2">{row.timing}</td>
        </tr>
     ));
  };

  const finalResultUtilization = (data.resultUtilization || '').replace(/\[교과명\]/g, data.subject || '교과');
  const finalSectionStartNum = data.includeExtraEvaluation ? 7 : 6;

  // Helper to render the Page Break Control Button
  const renderBreakControl = (sectionId: string) => {
    if (!enablePageBreakControl) return null;
    const isForced = !!forcedPageBreaks[sectionId];
    return (
        <button
            onClick={() => togglePageBreak(sectionId)}
            className={`no-print ml-2 text-[10px] px-2 py-0.5 rounded border flex items-center gap-1 transition-colors ${
                isForced 
                ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' 
                : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-100'
            }`}
            title="이 섹션을 강제로 다음 페이지로 넘깁니다"
        >
            {isForced ? <Check size={10} /> : <FileInput size={10} />}
            {isForced ? '다음 페이지에서 시작' : '다음 페이지로 넘기기'}
        </button>
    );
  };

  return (
    <>
      {/* Dynamic Style for Print Margins */}
      <style>{`
        @page { 
            margin: 0 !important; 
            size: A4 landscape;
        }
        @media print {
          body { -webkit-print-color-adjust: exact; }
          .preview-container {
             padding-top: ${margins.top}mm !important;
             padding-right: ${margins.right}mm !important;
             padding-bottom: ${margins.bottom}mm !important;
             padding-left: ${margins.left}mm !important;
             box-shadow: none !important;
             max-width: none !important;
             width: 100% !important;
          }
          /* Apply Scale for Printing */
          .preview-content-scaler {
              zoom: ${scale}; /* Non-standard but works best for print in Chrome/Edge */
              /* Fallback for others if needed, but zoom is preferred for page breaking */
              /* transform: scale(${scale}); transform-origin: top left; width: ${100/scale}%; */
          }
          .no-print { display: none !important; }
          /* Hide dashed lines in print */
          .margin-line { display: none !important; }
          .page-break-guide { display: none !important; } /* Hide red guides in actual print */
          
          /* Forced Page Breaks - Reinforced */
          .force-page-break { 
              break-before: page !important; 
              page-break-before: always !important; 
              display: block !important;
              position: relative !important;
              clear: both !important;
          }
          
          /* Prevent Row Splitting inside Tables - but NOT the whole table */
          tr { break-inside: avoid; page-break-inside: avoid; }
          .keep-row-together td { break-inside: avoid; page-break-inside: avoid; }
          
          /* Ensure headers stick to content if possible */
          h2, h3, h4 { break-after: avoid; page-break-after: avoid; }
        }
      `}</style>

      {/* Root Container: Ensure block display in print to allow page breaks */}
      <div className="flex flex-col items-center print:block print:items-start">
         {editableMargins && (
             <div className="no-print mb-4 text-center">
                <p className="text-sm font-bold text-blue-800 bg-blue-50 px-4 py-2 rounded-full border border-blue-200 inline-block shadow-sm animate-pulse">
                    🖱️ 파란색 점선을 드래그하여 여백을 조절하거나, 상단 '자동 맞춤' 버튼으로 크기를 조절하세요.
                </p>
             </div>
         )}
         
         <div 
            className="preview-container bg-white shadow-lg text-black relative mx-auto"
            style={{ 
                width: '297mm', // A4 Landscape
                minHeight: '210mm',
                paddingTop: `${margins.top}mm`,
                paddingRight: `${margins.right}mm`,
                paddingBottom: `${margins.bottom}mm`,
                paddingLeft: `${margins.left}mm`,
                boxSizing: 'border-box'
            }}
        >
            {/* Visual Page Break Guides (210mm Intervals) */}
            {showPageBreaks && (
                <div className="no-print absolute inset-0 pointer-events-none z-40 page-break-guide overflow-hidden">
                    {/* Render up to 20 pages guides */}
                    {Array.from({length: 20}).map((_, i) => (
                        <div 
                            key={i}
                            className="absolute left-0 w-full border-b-2 border-red-500 border-dashed opacity-50 flex items-end justify-end pr-2"
                            style={{ 
                                top: `${(i + 1) * 210}mm`,
                                height: '0px'
                            }}
                        >
                            <span className="bg-red-100 text-red-600 text-[10px] font-bold px-1 py-0.5 rounded">
                                {i + 1}페이지 끝 / {i + 2}페이지 시작 (210mm)
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Draggable Margin Lines - Only visible if editableMargins is true */}
            {editableMargins && (
                <div className="no-print absolute inset-0 pointer-events-none z-50 overflow-hidden margin-line">
                    {/* Top Line */}
                    <div 
                        className="absolute left-0 w-full h-[2px] border-t-2 border-blue-500 border-dashed cursor-ns-resize pointer-events-auto group hover:border-blue-700 hover:h-[4px]"
                        style={{ top: `${margins.top}mm` }}
                        onMouseDown={() => setDragging('top')}
                    >
                        <div className="absolute left-1/2 -translate-x-1/2 -top-8 bg-black text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-50 font-mono">
                            상단: {margins.top}mm
                        </div>
                    </div>

                    {/* Bottom Line */}
                    <div 
                        className="absolute left-0 w-full h-[2px] border-b-2 border-blue-500 border-dashed cursor-ns-resize pointer-events-auto group hover:border-blue-700 hover:h-[4px]"
                        style={{ bottom: `${margins.bottom}mm` }}
                        onMouseDown={() => setDragging('bottom')}
                    >
                        <div className="absolute left-1/2 -translate-x-1/2 top-2 bg-black text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-50 font-mono">
                            하단: {margins.bottom}mm
                        </div>
                    </div>

                    {/* Left Line */}
                    <div 
                        className="absolute top-0 h-full w-[2px] border-l-2 border-blue-500 border-dashed cursor-ew-resize pointer-events-auto group hover:border-blue-700 hover:w-[4px]"
                        style={{ left: `${margins.left}mm` }}
                        onMouseDown={() => setDragging('left')}
                    >
                        <div className="absolute top-1/2 -translate-y-1/2 -left-24 bg-black text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-50 font-mono">
                            좌측: {margins.left}mm
                        </div>
                    </div>

                    {/* Right Line */}
                    <div 
                        className="absolute top-0 h-full w-[2px] border-r-2 border-blue-500 border-dashed cursor-ew-resize pointer-events-auto group hover:border-blue-700 hover:w-[4px]"
                        style={{ right: `${margins.right}mm` }}
                        onMouseDown={() => setDragging('right')}
                    >
                        <div className="absolute top-1/2 -translate-y-1/2 left-2 bg-black text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-50 font-mono">
                            우측: {margins.right}mm
                        </div>
                    </div>
                </div>
            )}
            
            {/* Wrapper for Scaling Content */}
            <div 
                className="preview-content-scaler"
                style={{
                    // Apply scale immediately for visual preview on screen as well
                    zoom: scale,
                }}
            >

                {/* Header */}
                <div className="text-center mb-8 border-b-2 border-red-300 pb-2">
                    <h1 className="text-2xl font-bold">
                    {data.year}학년도 {data.semester}학기 [{data.subject}]과 교수학습 및 평가 운영 계획
                    </h1>
                </div>

                {/* Copy Button for Basic Info */}
                <div className="no-print flex justify-end mb-2">
                    <button 
                    onClick={() => copyTableToClipboard('basic-table')}
                    className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                    >
                    <Copy size={12} /> HWP 붙여넣기용 복사
                    </button>
                </div>
                
                {/* Basic Info Table */}
                <table id="basic-table" className="w-full border-collapse border border-black text-sm mb-6 text-center">
                    <thead>
                    <tr className="bg-gray-50">
                        <th className="border border-black p-2">학교명</th>
                        <th className="border border-black p-2">과목</th>
                        <th className="border border-black p-2">학년</th>
                        <th className="border border-black p-2">학급</th>
                        <th className="border border-black p-2">주당시수</th>
                        <th className="border border-black p-2">지도교사</th>
                    </tr>
                    </thead>
                    <tbody>
                    <tr>
                        <td className="border border-black p-2">{data.schoolName}</td>
                        <td className="border border-black p-2">{data.subject}</td>
                        <td className="border border-black p-2">{data.grade}학년</td>
                        <td className="border border-black p-2">{data.classRoom}</td>
                        <td className="border border-black p-2">{data.hoursPerWeek}</td>
                        <td className="border border-black p-2">{data.teacherName}</td>
                    </tr>
                    </tbody>
                </table>

                {/* Goals Table (Conditional Render) */}
                {data.includeGoalsSection !== false && (
                    <>
                    <div className="no-print flex justify-end mb-2">
                        <button 
                        onClick={() => copyTableToClipboard('goals-table')}
                        className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                        >
                        <Copy size={12} /> HWP 붙여넣기용 복사
                        </button>
                    </div>
                    <table id="goals-table" className="w-full border-collapse border border-black text-sm mb-10">
                        <tbody>
                        <tr>
                            <th className="border border-black p-3 bg-gray-50 w-1/4 text-center">{data.grade}학년 중점 목표</th>
                            <td className="border border-black p-3 whitespace-pre-wrap">{data.gradeGoal}</td>
                        </tr>
                        <tr>
                            <th className="border border-black p-3 bg-gray-50 w-1/4 text-center">
                            {data.grade}학년 인간상<br/>(핵심 역량)
                            </th>
                            <td className="border border-black p-3 whitespace-pre-wrap">{data.humanIdeal}</td>
                        </tr>
                        <tr>
                            <th className="border border-black p-3 bg-gray-50 w-1/4 text-center">{data.year}년 수업자 수업 중점 목표</th>
                            <td className="border border-black p-3 whitespace-pre-wrap">{data.teacherGoal}</td>
                        </tr>
                        <tr>
                            <th className="border border-black p-3 bg-gray-50 w-1/4 text-center">주요 실천 방안</th>
                            <td className="border border-black p-3 whitespace-pre-wrap">{data.actionPlan}</td>
                        </tr>
                        </tbody>
                    </table>
                    </>
                )}

                {/* Section 1: Teaching Plan */}
                <div 
                    className={`mb-4 ${forcedPageBreaks['section-1'] ? 'force-page-break' : ''}`}
                    style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}
                >
                    <h2 className="text-lg font-bold mb-2 flex items-center justify-between">
                    <span className="flex items-center">
                        <span className="bg-gray-600 text-white rounded-full w-6 h-6 flex items-center justify-center mr-2 text-sm">1</span>
                        {data.subject || ''}과 교수학습-평가 계획 및 방법
                        {renderBreakControl('section-1')}
                    </span>
                    <button 
                        onClick={() => copyTableToClipboard('teaching-table')}
                        className="no-print text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded flex items-center gap-1 transition-colors font-normal"
                    >
                        <Copy size={12} /> HWP 붙여넣기용 복사
                    </button>
                    </h2>
                </div>

                <table id="teaching-table" className="w-full border-collapse border border-black text-xs mb-10 text-center">
                    <thead>
                    <tr className="bg-gray-100">
                        <th className="border border-black p-1" rowSpan={2}>단원명</th>
                        <th className="border border-black p-1" rowSpan={2}>교육과정 성취기준</th>
                        <th className="border border-black p-1" rowSpan={2}>평가 요소</th>
                        <th className="border border-black p-1 w-24" colSpan={3}>평가 방법</th>
                        <th className="border border-black p-1" rowSpan={2}>수업 방법</th>
                        <th className="border border-black p-1" rowSpan={2}>수업-평가 연계의 주안점</th>
                        <th className="border border-black p-1 w-16" rowSpan={2}>비고</th>
                        <th className="border border-black p-1 w-16" rowSpan={2}>시기<br/>(시수/누계)</th>
                    </tr>
                    <tr className="bg-gray-100">
                        <th className="border border-black p-1 w-8">지필</th>
                        <th className="border border-black p-1 w-8">수행</th>
                        <th className="border border-black p-1 w-8">기타</th>
                    </tr>
                    </thead>
                    <tbody>
                    {processedPlans.map((row) => (
                        <tr key={row.id}>
                        {/* Only render unit name if rowSpan > 0 */}
                        {row.unitRowSpan > 0 && (
                            <td className="border border-black p-1 whitespace-pre-wrap text-left align-middle" rowSpan={row.unitRowSpan}>
                            {row.unit}
                            </td>
                        )}
                        <td className="border border-black p-1 whitespace-pre-wrap text-left">{row.standard}</td>
                        <td className="border border-black p-1 whitespace-pre-wrap text-left">{row.element}</td>
                        <td className="border border-black p-1 font-bold">{row.method && row.method.includes('지필') ? '○' : ''}</td>
                        <td className="border border-black p-1 font-bold">{row.method && row.method.includes('수행') ? '○' : ''}</td>
                        <td className="border border-black p-1 font-bold">{row.method && row.method.includes('기타') ? '○' : ''}</td>
                        
                        {/* Merged Teaching Method */}
                        {row.teachingMethodRowSpan > 0 && (
                            <td className="border border-black p-1 whitespace-pre-wrap" rowSpan={row.teachingMethodRowSpan}>
                            {row.teachingMethod}
                            </td>
                        )}
                        
                        {/* Merged Notes (Linkage Points) */}
                        {row.notesRowSpan > 0 && (
                            <td className="border border-black p-1 whitespace-pre-wrap text-left leading-relaxed" rowSpan={row.notesRowSpan}>
                            {formatNotes(row.notes)}
                            </td>
                        )}
                        
                        <td className="border border-black p-1 whitespace-pre-wrap text-left">{row.remarks}</td>
                        <td className="border border-black p-1 whitespace-pre-wrap">
                            {row.period}<br/>
                            {row.hours}
                        </td>
                        </tr>
                    ))}
                    {data.teachingPlans.length === 0 && (
                        <tr><td colSpan={10} className="border border-black p-4 text-gray-400">내용을 입력해주세요.</td></tr>
                    )}
                    </tbody>
                </table>

                {/* Page Break for printing */}
                <div className="page-break"></div>

                {/* Section 2: Evaluation Detail */}
                <div 
                    className={`mb-4 mt-8 ${forcedPageBreaks['section-2'] ? 'force-page-break' : ''}`}
                    style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}
                >
                    <h2 className="text-lg font-bold mb-2 flex items-center justify-between">
                    <span className="flex items-center">
                        <span className="bg-gray-600 text-white rounded-full w-6 h-6 flex items-center justify-center mr-2 text-sm">2</span>
                        {data.subject || ''}과 평가 세부계획
                        {renderBreakControl('section-2')}
                    </span>
                    <button 
                        onClick={() => copyTableToClipboard('eval-ratio-table')}
                        className="no-print text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded flex items-center gap-1 transition-colors font-normal"
                    >
                        <Copy size={12} /> HWP 붙여넣기용 복사
                    </button>
                    </h2>
                    <h3 className="font-bold text-sm mb-2">1. 평가 방법과 반영비율</h3>
                </div>

                <table id="eval-ratio-table" className="w-full border-collapse border border-black text-sm mb-4 text-center">
                    <thead>
                    <tr className="bg-gray-100">
                        <th className="border border-black p-2" rowSpan={2}>평가 방법</th>
                        <th className="border border-black p-2" rowSpan={2}>평가 영역</th>
                        <th className="border border-black p-2" rowSpan={2}>영역 만점<br/>(점)</th>
                        <th className="border border-black p-2" rowSpan={2}>학기말<br/>반영비율<br/>(%)</th>
                        <th className="border border-black p-2" colSpan={4}>평가 유형별 반영 비율(%)</th>
                        <th className="border border-black p-2" rowSpan={2}>평가 시기</th>
                    </tr>
                    <tr className="bg-gray-100">
                        <th className="border border-black p-1">선택형/단답형</th>
                        <th className="border border-black p-1">서술형</th>
                        <th className="border border-black p-1">논술형</th>
                        <th className="border border-black p-1">기타</th>
                    </tr>
                    </thead>
                    <tbody>
                    {!isFreeSemester && renderEvaluationDetailRows('지필평가')}
                    {renderEvaluationDetailRows('수행평가')}
                    <tr className="font-bold bg-gray-50">
                        <td className="border border-black p-2" colSpan={2}>합 계</td>
                        <td className="border border-black p-2"></td>
                        <td className="border border-black p-2">100</td>
                        <td className="border border-black p-2"></td>
                        <td className="border border-black p-2"></td>
                        <td className="border border-black p-2"></td>
                        <td className="border border-black p-2"></td>
                        <td className="border border-black p-2"></td>
                    </tr>
                    </tbody>
                </table>
                <div className="text-xs mb-8">
                    <p>* 동점자 처리 기준: 수행평가는 위 기재된 순서대로 성적 처리를 우선순위로 한다.</p>
                    <p>* 학사 운영 계획 변동 및 감염병 등 상황 변화에 따라 수행평가 시기는 변경될 수 있다.</p>
                </div>

                {/* NEW SECTION 2: Achievement Rates */}
                <div 
                    className={`mt-6 mb-8 ${forcedPageBreaks['section-2-2'] ? 'force-page-break' : ''}`}
                    style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}
                >
                    <h3 className="font-bold text-sm mb-2 flex justify-between">
                        <span className="flex items-center">
                            2. 성취율과 성취도
                            {renderBreakControl('section-2-2')}
                        </span>
                        <button 
                            onClick={() => copyTableToClipboard('achievement-rate-table')}
                            className="no-print text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded flex items-center gap-1 transition-colors font-normal"
                        >
                            <Copy size={12} /> HWP 붙여넣기용 복사
                        </button>
                    </h3>
                    <p className="text-sm mb-1">
                        지필평가 및 수행평가의 반영비율 환산 점수의 합계(성취율)에 따라 다음과 같이 평정한다.
                        {data.achievementScale === '3' && <span className="text-red-500 font-bold ml-1">[3단계 과목만 해당]</span>}
                    </p>
                    <table id="achievement-rate-table" className="w-full border-collapse border border-black text-sm text-center">
                        <thead className="bg-gray-100">
                        <tr>
                            <th className="border border-black p-1 w-1/2">성취율</th>
                            <th className="border border-black p-1 w-1/2">성취도</th>
                        </tr>
                        </thead>
                        <tbody>
                        {data.achievementScale === '5' ? (
                            <>
                            <tr><td className="border border-black p-1">90% 이상</td><td className="border border-black p-1 font-bold">A</td></tr>
                            <tr><td className="border border-black p-1">80% 이상 ~ 90% 미만</td><td className="border border-black p-1 font-bold">B</td></tr>
                            <tr><td className="border border-black p-1">70% 이상 ~ 80% 미만</td><td className="border border-black p-1 font-bold">C</td></tr>
                            <tr><td className="border border-black p-1">60% 이상 ~ 70% 미만</td><td className="border border-black p-1 font-bold">D</td></tr>
                            <tr><td className="border border-black p-1">60% 미만</td><td className="border border-black p-1 font-bold">E</td></tr>
                            </>
                        ) : (
                            <>
                            <tr><td className="border border-black p-1">80% 이상</td><td className="border border-black p-1 font-bold">A</td></tr>
                            <tr><td className="border border-black p-1">60% 이상 ~ 80% 미만</td><td className="border border-black p-1 font-bold">B</td></tr>
                            <tr><td className="border border-black p-1">60% 미만</td><td className="border border-black p-1 font-bold">C</td></tr>
                            </>
                        )}
                        </tbody>
                    </table>
                </div>

                {/* NEW SECTION 3: Achievement Standards */}
                <div 
                    className={`mt-6 mb-8 ${forcedPageBreaks['section-3'] ? 'force-page-break' : ''}`}
                    style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}
                >
                    <h3 className="font-bold text-sm mb-2 flex justify-between">
                    <span className="flex items-center">
                        3. 학기단위 성취수준
                        {renderBreakControl('section-3')}
                    </span>
                    <button 
                        onClick={() => copyTableToClipboard('semester-standard-table')}
                        className="no-print text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded flex items-center gap-1 transition-colors font-normal"
                    >
                        <Copy size={12} /> HWP 붙여넣기용 복사
                    </button>
                    </h3>
                    <table id="semester-standard-table" className="w-full border-collapse border border-black text-sm keep-row-together">
                        <thead className="bg-gray-100 text-center">
                        <tr>
                            <th className="border border-black p-1 w-20">성취수준</th>
                            <th className="border border-black p-1">학기 단위 성취수준 진술</th>
                        </tr>
                        </thead>
                        <tbody>
                        {/* Filter Grades based on Achievement Scale Type */}
                        {(['A', 'B', 'C', ...(use5Levels ? ['D', 'E'] : [])] as const).map((grade) => (
                            <tr key={grade}>
                            <td className="border border-black p-1 text-center font-bold align-middle">{grade}</td>
                            <td className="border border-black p-2 whitespace-pre-wrap leading-relaxed">
                                {data.achievementStandards[grade]}
                            </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>

                {/* SECTION 4: Notes */}
                <div 
                    className={`mt-6 mb-8 ${forcedPageBreaks['section-4'] ? 'force-page-break' : ''}`}
                    style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}
                >
                    <h3 className="font-bold text-sm mb-2 flex items-center">
                        4. 평가 유의사항
                        {renderBreakControl('section-4')}
                    </h3>
                    <div className="border border-black p-4 text-sm whitespace-pre-wrap leading-relaxed">
                    {data.evaluationNote}
                    </div>
                </div>

                {/* Section 5: Rubrics */}
                <div 
                    className={`mb-4 ${forcedPageBreaks['section-5'] ? 'force-page-break' : ''}`}
                    style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}
                >
                    <h3 className="font-bold text-sm mb-2 flex justify-between items-center">
                    <span className="flex items-center">
                        5. {data.subject || ''}과 수행평가 영역별 세부 기준
                        {renderBreakControl('section-5')}
                    </span>
                    <button 
                        onClick={() => copyTableToClipboard('rubrics-container')}
                        className="no-print text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded flex items-center gap-1 transition-colors font-normal"
                    >
                        <Copy size={12} /> HWP 붙여넣기용 복사 (전체)
                    </button>
                    </h3>
                </div>

                <div id="rubrics-container">
                    {data.performanceTasks.map((task, index) => {
                    const headerLabel = KOREAN_ALPHABET[index] || (index + 1);
                    const hasTableDescription = (task.rubricElements || []).some(e => e.description && e.description.trim() !== '');
                    const linkedEvalRow = data.evaluationRows.find(r => r.id === task.id);
                    const headerName = linkedEvalRow ? linkedEvalRow.name : task.name;
                    
                    return (
                        <div 
                            key={task.id} 
                            // CHANGED: Removed 'break-inside-avoid' to allow large tables to split if necessary,
                            // while 'tr { break-inside: avoid }' keeps rows intact.
                            // This prevents the "Orphaned Title" issue where the whole table jumps to next page.
                            className={`mb-8 ${(oneRubricPerPage && index > 0) ? 'force-page-break' : ''}`}
                        >
                        <h4 className="text-sm font-bold mb-2 pl-2" style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}>
                            {headerLabel}. {headerName}
                        </h4>
                        <table className="w-full border-collapse border border-black text-sm table-fixed">
                            <colgroup>
                                <col style={{ width: '15%' }} />
                                <col style={{ width: '5%' }} />
                                {hasTableDescription && <col style={{ width: '35%' }} />}
                                <col style={{ width: hasTableDescription ? '35%' : '70%' }} />
                                <col style={{ width: '10%' }} />
                            </colgroup>
                            
                            <tbody>
                            {/* Row 1: Task Name */}
                            <tr>
                                <th className="border border-black p-2 bg-gray-100 font-bold">수행 과제</th>
                                <td className="border border-black p-2 font-bold" colSpan={hasTableDescription ? 4 : 3}>{task.name}</td>
                            </tr>
                            
                            {/* Row 2: Standards */}
                            <tr>
                                <th className="border border-black p-2 bg-gray-100 font-bold">성취기준</th>
                                <td className="border border-black p-2" colSpan={hasTableDescription ? 4 : 3}>
                                {(task.standards && task.standards.length > 0) 
                                    ? task.standards.map((s, i) => <div key={i}>{s}</div>) 
                                    : task.standards}
                                </td>
                            </tr>

                            {/* Row 2.5: Core Idea */}
                            {is2022 && (
                                <tr>
                                    <th className="border border-black p-2 bg-gray-100 font-bold">핵심 아이디어</th>
                                    <td className="border border-black p-2" colSpan={hasTableDescription ? 4 : 3}>
                                    {task.coreIdea}
                                    </td>
                                </tr>
                            )}

                            {/* Row 3: Evaluation Criteria */}
                            {use5Levels ? (
                                <>
                                    <tr>
                                        <th className="border border-black p-2 bg-gray-100 font-bold" rowSpan={5}>평가 기준</th>
                                        <th className="border border-black p-1 text-center bg-gray-50 font-bold">A</th>
                                        <td className="border border-black p-2" colSpan={hasTableDescription ? 3 : 2}>{task.criteria.A}</td>
                                    </tr>
                                    <tr>
                                        <th className="border border-black p-1 text-center bg-gray-50 font-bold">B</th>
                                        <td className="border border-black p-2" colSpan={hasTableDescription ? 3 : 2}>{task.criteria.B}</td>
                                    </tr>
                                    <tr>
                                        <th className="border border-black p-1 text-center bg-gray-50 font-bold">C</th>
                                        <td className="border border-black p-2" colSpan={hasTableDescription ? 3 : 2}>{task.criteria.C}</td>
                                    </tr>
                                    <tr>
                                        <th className="border border-black p-1 text-center bg-gray-50 font-bold">D</th>
                                        <td className="border border-black p-2" colSpan={hasTableDescription ? 3 : 2}>{task.criteria.D}</td>
                                    </tr>
                                    <tr>
                                        <th className="border border-black p-1 text-center bg-gray-50 font-bold">E</th>
                                        <td className="border border-black p-2" colSpan={hasTableDescription ? 3 : 2}>{task.criteria.E}</td>
                                    </tr>
                                </>
                            ) : (
                                <>
                                    <tr>
                                        <th className="border border-black p-2 bg-gray-100 font-bold" rowSpan={3}>평가 기준</th>
                                        <th className="border border-black p-1 text-center bg-gray-50 font-bold">상</th>
                                        <td className="border border-black p-2" colSpan={hasTableDescription ? 3 : 2}>{task.criteria.A}</td>
                                    </tr>
                                    <tr>
                                        <th className="border border-black p-1 text-center bg-gray-50 font-bold">중</th>
                                        <td className="border border-black p-2" colSpan={hasTableDescription ? 3 : 2}>{task.criteria.B}</td>
                                    </tr>
                                    <tr>
                                        <th className="border border-black p-1 text-center bg-gray-50 font-bold">하</th>
                                        <td className="border border-black p-2" colSpan={hasTableDescription ? 3 : 2}>{task.criteria.C}</td>
                                    </tr>
                                </>
                            )}

                            {/* Row 4: Evaluation Method */}
                            <tr>
                                <th className="border border-black p-2 bg-gray-100 font-bold">평가 방법</th>
                                <td className="border border-black p-2" colSpan={hasTableDescription ? 4 : 3}>
                                <div className="flex flex-wrap gap-x-8 gap-y-1">
                                    {EVALUATION_METHODS.map(method => (
                                    <div key={method} className="flex items-center gap-1">
                                        <span className="text-sm">{task.method.includes(method) ? '☑' : '□'}</span>
                                        <span>{method}</span>
                                    </div>
                                    ))}
                                </div>
                                </td>
                            </tr>

                            {/* Row 5: Detailed Rubric */}
                            <tr>
                                <th className="border border-black p-2 bg-gray-100 font-bold text-center">평가 요소</th>
                                <th 
                                className="border border-black p-2 bg-gray-100 font-bold text-center" 
                                colSpan={hasTableDescription ? 3 : 2}
                                >
                                채점 기준
                                </th>
                                <th className="border border-black p-2 bg-gray-100 font-bold text-center">배점</th>
                            </tr>

                            {(task.rubricElements || []).map((element) => {
                                const hasElementDescription = !!(element.description && element.description.trim() !== '');
                                return (
                                    <React.Fragment key={element.id}>
                                        {element.items.map((item, idx) => (
                                            <tr key={item.id}>
                                            {idx === 0 && (
                                                <td 
                                                    className="border border-black p-2 text-center align-middle font-bold" 
                                                    rowSpan={element.items.length}
                                                >
                                                    {element.element || '평가 요소'}
                                                </td>
                                            )}

                                            {hasTableDescription && idx === 0 && (
                                                hasElementDescription ? (
                                                    <td 
                                                    className="border border-black p-2 text-left align-middle whitespace-pre-wrap"
                                                    rowSpan={element.items.length}
                                                    colSpan={2} 
                                                    >
                                                    {element.description}
                                                    </td>
                                                ) : null 
                                            )}

                                            <td 
                                                className="border border-black p-2 text-left" 
                                                colSpan={
                                                hasTableDescription 
                                                    ? (hasElementDescription ? 1 : 3) 
                                                    : 2
                                                }
                                            >
                                                {item.criteria}
                                            </td>

                                            <td className="border border-black p-2 text-center">{item.score}</td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                );
                            })}
                            
                            {(!task.rubricElements || task.rubricElements.length === 0) && (
                                <tr>
                                    <td className="border border-black p-4 text-center text-gray-400" colSpan={hasTableDescription ? 5 : 4}>채점 기준을 입력해주세요.</td>
                                </tr>
                            )}
                            
                            {/* Footer: Base Score */}
                            <tr>
                                <td className="border border-black p-2 text-xs text-left" colSpan={hasTableDescription ? 5 : 4}>
                                    {task.baseScore}
                                </td>
                            </tr>

                            </tbody>
                        </table>
                        </div>
                    );
                    })}
                </div>

                {/* NEW SECTION 6: Optional Extra Items */}
                {data.includeExtraEvaluation && data.extraEvaluationItems && data.extraEvaluationItems.length > 0 && (
                    <div 
                        className={`mb-4 mt-8 ${forcedPageBreaks['section-6'] ? 'force-page-break' : ''}`}
                        style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}
                    >
                    <h3 className="font-bold text-sm mb-2 flex justify-between items-center">
                        <span className="flex items-center">
                            6. {data.subject || ''}과 지필 또는 수행평가로 평가하지 않는 성취기준에 대한 평가 기준 및 평가 방법
                            {renderBreakControl('section-6')}
                        </span>
                        <button 
                            onClick={() => copyTableToClipboard('extra-eval-table')}
                            className="no-print text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-1 rounded flex items-center gap-1 transition-colors font-normal"
                        >
                            <Copy size={12} /> HWP 붙여넣기용 복사
                        </button>
                    </h3>
                    <table id="extra-eval-table" className="w-full border-collapse border border-black text-sm text-center">
                        <thead className="bg-gray-100">
                        <tr>
                            <th className="border border-black p-2 w-1/4">지필 또는 수행평가로<br/>평가하지 않는 성취기준</th>
                            <th className="border border-black p-2 w-1/2" colSpan={2}>평가 기준(성취기준별 성취수준)</th>
                            <th className="border border-black p-2 w-1/4">평가 방법</th>
                        </tr>
                        </thead>
                        <tbody>
                        {data.extraEvaluationItems.map((item) => (
                            <React.Fragment key={item.id}>
                                <tr>
                                <td className="border border-black p-2 align-middle" rowSpan={3}>
                                    {item.standard}
                                </td>
                                <th className="border border-black p-2 bg-gray-50 w-12 align-middle">상</th>
                                <td className="border border-black p-2 text-left">{item.criteria.upper}</td>
                                <td className="border border-black p-2 align-middle text-left" rowSpan={3}>
                                    <div className="flex flex-col gap-1 text-xs text-left">
                                        {EXTRA_EVALUATION_METHODS.map((m) => (
                                        <div key={m} className="flex items-center gap-1">
                                            <span>{item.method.includes(m) ? '☑' : '□'}</span> 
                                            {m === '기타' ? `기타( ${item.otherMethodDetail || ''} )` : m}
                                        </div>
                                        ))}
                                    </div>
                                </td>
                                </tr>
                                <tr>
                                <th className="border border-black p-2 bg-gray-50 align-middle">중</th>
                                <td className="border border-black p-2 text-left">{item.criteria.middle}</td>
                                </tr>
                                <tr>
                                <th className="border border-black p-2 bg-gray-50 align-middle">하</th>
                                <td className="border border-black p-2 text-left">{item.criteria.lower}</td>
                                </tr>
                            </React.Fragment>
                        ))}
                        </tbody>
                    </table>
                    </div>
                )}

                {/* NEW SECTIONS 7 & 8: Final Remarks (Always visible if data exists) */}
                {(data.absenteePolicy || data.resultUtilization) && (
                    <div 
                        className={`mb-4 mt-8 ${forcedPageBreaks['section-7'] ? 'force-page-break' : ''}`}
                        style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}
                    >
                    <h3 className="font-bold text-sm mb-4 flex items-center">
                        {finalSectionStartNum}. 평가 미응시자(결시자) 및 학적 변동자 처리
                        {renderBreakControl('section-7')}
                    </h3>
                    <div className="border border-black p-4 text-sm whitespace-pre-wrap leading-relaxed mb-8">
                        {data.absenteePolicy}
                    </div>

                    <h3 className="font-bold text-sm mb-4 flex items-center" style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}>
                        {finalSectionStartNum + 1}. 평가 결과의 활용
                        {renderBreakControl('section-8')}
                    </h3>
                    <div className="border border-black p-4 text-sm whitespace-pre-wrap leading-relaxed">
                        {finalResultUtilization}
                    </div>
                    </div>
                )}
            </div>
        </div>
    </div>
    </>
  );
};

export default Preview;