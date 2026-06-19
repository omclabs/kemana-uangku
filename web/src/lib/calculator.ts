export type Operator = '+' | '-' | '*' | '/';

export interface CalculatorState {
  tokens: (number | Operator)[];
  current: string;
}

export const initialCalculatorState: CalculatorState = { tokens: [], current: '' };

function isOperator(token: number | Operator): token is Operator {
  return typeof token === 'string';
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}

export function pressDigit(state: CalculatorState, digit: string): CalculatorState {
  if (digit === '.' && state.current.includes('.')) return state;
  if (digit === '.' && state.current === '') {
    return { ...state, current: '0.' };
  }
  if (digit === '.' && state.current === '-') {
    return { ...state, current: '-0.' };
  }
  if (digit !== '.' && state.current === '0') {
    return { ...state, current: digit };
  }
  if (digit !== '.' && state.current === '-0') {
    return { ...state, current: `-${digit}` };
  }
  return { ...state, current: state.current + digit };
}

// Operator-replace rule: if the last entered token is already an operator
// and another operator is pressed (with no number typed in between), the
// new operator replaces it instead of appending. E.g. "12 *" then "-"
// becomes "12 -", not "12 * -".
export function pressOperator(state: CalculatorState, operator: Operator): CalculatorState {
  if (state.current !== '') {
    return { tokens: [...state.tokens, Number(state.current), operator], current: '' };
  }

  if (state.tokens.length === 0) {
    return state;
  }

  const last = state.tokens[state.tokens.length - 1];
  if (isOperator(last)) {
    return { tokens: [...state.tokens.slice(0, -1), operator], current: '' };
  }

  return { ...state, tokens: [...state.tokens, operator] };
}

// Evaluates left-to-right (no operator precedence), including any
// in-progress `current` number.
export function evaluate(state: CalculatorState): number {
  const tokens = state.current !== '' ? [...state.tokens, Number(state.current)] : state.tokens;
  if (tokens.length === 0) return 0;

  let result = Number(tokens[0]);
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i] as Operator;
    const value = Number(tokens[i + 1] ?? 0);
    switch (op) {
      case '+':
        result += value;
        break;
      case '-':
        result -= value;
        break;
      case '*':
        result *= value;
        break;
      case '/':
        result = value !== 0 ? result / value : result;
        break;
    }
  }
  return result;
}

export function pressEqual(state: CalculatorState): CalculatorState {
  return { tokens: [], current: formatNumber(evaluate(state)) };
}

export function backspace(state: CalculatorState): CalculatorState {
  if (state.current !== '') {
    const nextCurrent = state.current.slice(0, -1);
    return { ...state, current: nextCurrent === '-' ? '' : nextCurrent };
  }

  if (state.tokens.length === 0) {
    return state;
  }

  return { ...state, tokens: state.tokens.slice(0, -1) };
}

export function toggleSign(state: CalculatorState): CalculatorState {
  if (state.current === '') {
    return { ...state, current: '-' };
  }

  return {
    ...state,
    current: state.current.startsWith('-') ? state.current.slice(1) : `-${state.current}`,
  };
}

export function reset(): CalculatorState {
  return { tokens: [], current: '' };
}

export function displayValue(state: CalculatorState): string {
  const parts = state.tokens.map((t) => String(t));
  if (state.current !== '') parts.push(state.current);
  return parts.length > 0 ? parts.join(' ') : '0';
}
