import { useState } from 'react';
import {
  backspace,
  displayValue,
  evaluate,
  initialCalculatorState,
  pressDigit,
  pressEqual,
  pressOperator,
  reset,
  toggleSign,
  type CalculatorState,
  type Operator,
} from '../lib/calculator';
import { XMarkIcon } from './icons';

interface CalculatorProps {
  initialValue?: number;
  onConfirm: (value: number) => void;
  onClose: () => void;
}

export default function Calculator({ initialValue, onConfirm, onClose }: CalculatorProps) {
  const [state, setState] = useState<CalculatorState>(() =>
    initialValue ? { tokens: [], current: String(initialValue) } : initialCalculatorState
  );

  function handleDigit(digit: string) {
    setState((s) => pressDigit(s, digit));
  }

  function handleOperator(operator: Operator) {
    setState((s) => pressOperator(s, operator));
  }

  function handleEqual() {
    setState((s) => pressEqual(s));
  }

  function handleOk() {
    onConfirm(evaluate(state));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-[28px] border border-line bg-surface p-4 shadow-[0_-12px_30px_-18px_rgba(43,39,51,.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Calculator</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-xl p-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-3 rounded-2xl border border-line bg-surface-2 px-3 py-4 text-right text-2xl font-semibold text-ink">
          {displayValue(state)}
        </div>

        <div className="grid grid-cols-4 gap-2">
          <CalcButton label="7" onClick={() => handleDigit('7')} />
          <CalcButton label="8" onClick={() => handleDigit('8')} />
          <CalcButton label="9" onClick={() => handleDigit('9')} />
          <CalcButton label="/" variant="operator" onClick={() => handleOperator('/')} />

          <CalcButton label="4" onClick={() => handleDigit('4')} />
          <CalcButton label="5" onClick={() => handleDigit('5')} />
          <CalcButton label="6" onClick={() => handleDigit('6')} />
          <CalcButton label="*" variant="operator" onClick={() => handleOperator('*')} />

          <CalcButton label="1" onClick={() => handleDigit('1')} />
          <CalcButton label="2" onClick={() => handleDigit('2')} />
          <CalcButton label="3" onClick={() => handleDigit('3')} />
          <CalcButton label="-" variant="operator" onClick={() => handleOperator('-')} />

          <CalcButton label="C" variant="clear" onClick={() => setState(reset())} />
          <CalcButton label="⌫" variant="clear" onClick={() => setState((s) => backspace(s))} />
          <CalcButton label="+/-" variant="operator" onClick={() => setState((s) => toggleSign(s))} />
          <CalcButton label="+" variant="operator" onClick={() => handleOperator('+')} />

          <CalcButton label="0" onClick={() => handleDigit('0')} />
          <CalcButton label="." onClick={() => handleDigit('.')} />
          <CalcButton label="=" variant="equal" className="col-span-2" onClick={handleEqual} />
        </div>

        <button
          type="button"
          onClick={handleOk}
          className="mt-3 w-full rounded-2xl bg-gradient-to-br from-accent to-accent-2 px-4 py-3 text-base font-medium text-white shadow-[0_8px_16px_-6px_var(--accent)]"
        >
          OK
        </button>
      </div>
    </div>
  );
}

function CalcButton({
  label,
  onClick,
  variant = 'default',
  className = '',
}: {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'operator' | 'clear' | 'equal';
  className?: string;
}) {
  const variantClass = {
    default: 'border border-line bg-surface text-ink',
    operator: 'border border-transparent bg-income-soft text-accent',
    clear: 'border border-transparent bg-expense-soft text-expense',
    equal: 'border border-transparent bg-gradient-to-br from-accent to-accent-2 text-white',
  }[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl py-3 text-lg font-medium active:opacity-70 ${variantClass} ${className}`}
    >
      {label}
    </button>
  );
}
