import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
type Guard = (leave: () => void) => void;
const Context = createContext<{ register: (guard: Guard) => () => void; requestLeave: Guard }>({ register: () => () => {}, requestLeave: leave => leave() });
export function TabLeaveProvider({ children }: { children: ReactNode }) {
  const current = useRef<Guard | null>(null);
  const value = useMemo(() => ({ register(guard: Guard) { current.current = guard; return () => { if (current.current === guard) current.current = null; }; }, requestLeave(leave: () => void) { if (current.current) current.current(leave); else leave(); } }), []);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useTabLeave = () => useContext(Context);
