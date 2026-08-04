import React, { useRef, useState } from 'react';
import { Copy, Check, X } from 'lucide-react';

/**
 * 표/텍스트를 한글(HWP)에 붙여넣을 수 있는 형태로 클립보드에 넣는다.
 *
 * execCommand('copy') 는 폐기 예고된 API지만, 선택 영역을 서식째(text/html)
 * 복사해 주어 한글에서 표 모양이 그대로 살아난다. 이 페이지의 결과물이
 * 곧 한글 붙여넣기이므로, 검증된 이 경로를 유지한다.
 */
export const copyNodeToClipboard = async (node: HTMLElement | null): Promise<boolean> => {
  if (!node) return false;

  // 1순위: 선택 + execCommand. 브라우저가 계산된 표 서식을 text/html 로 함께 실어 주어
  // 한글에서 표 모양이 그대로 살아난다.
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    selection.removeAllRanges();
    if (ok) return true;
  }

  // 2순위: 최신 클립보드 API. 표 서식을 직접 실어 보낸다.
  try {
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      const html = `<meta charset="utf-8">${node.innerHTML}`;
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([node.innerText], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
  } catch {
    /* 아래 최후 수단으로 */
  }

  // 최후: 서식 없이 글자만이라도 넘긴다.
  try {
    await navigator.clipboard.writeText(node.innerText);
    return true;
  } catch {
    return false;
  }
};

export const copyTextToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

interface Props {
  /** 복사할 DOM 노드를 돌려주는 함수 (표 복사용) */
  targetRef?: React.RefObject<HTMLElement>;
  /** 순수 텍스트 복사용 */
  text?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

const CopyButton: React.FC<Props> = ({ targetRef, text, label = '한글로 복사', disabled, className }) => {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const timer = useRef<number | null>(null);

  const flash = (next: 'ok' | 'fail') => {
    setState(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 1800);
  };

  const handle = async () => {
    const ok = text !== undefined
      ? await copyTextToClipboard(text)
      : await copyNodeToClipboard(targetRef?.current ?? null);
    flash(ok ? 'ok' : 'fail');
  };

  const tone =
    state === 'ok' ? 'bg-green-600 hover:bg-green-600 text-white border-green-600'
    : state === 'fail' ? 'bg-red-100 text-red-700 border-red-300'
    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50';

  return (
    <button
      onClick={handle}
      disabled={disabled}
      title="복사한 뒤 한글 문서에서 붙여넣기(Ctrl+V) 하세요"
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-bold transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${tone} ${className || ''}`}
    >
      {state === 'ok' ? <Check size={14} /> : state === 'fail' ? <X size={14} /> : <Copy size={14} />}
      {state === 'ok' ? '복사됨 — 한글에 붙여넣기' : state === 'fail' ? '복사 실패' : label}
    </button>
  );
};

export default CopyButton;
