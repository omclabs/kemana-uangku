import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const AmountVisibilityContext = createContext<{ visible: boolean; toggle: () => void }>({
  visible: true,
  toggle: () => {},
});

const STORAGE_KEY = 'ku-amounts-visible';

function initialVisible(): boolean {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === null ? true : saved === 'true';
}

export function AmountVisibilityProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState<boolean>(initialVisible);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(visible));
  }, [visible]);

  const toggle = () => setVisible((v) => !v);

  return (
    <AmountVisibilityContext.Provider value={{ visible, toggle }}>{children}</AmountVisibilityContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAmountVisibility = () => useContext(AmountVisibilityContext);
