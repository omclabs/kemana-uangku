import type { ReactNode } from 'react';

export default function PageContainer({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl p-4">{children}</div>;
}
