import { createContext, useContext } from 'react';

// אצל אוד כל הטקסטים בלשון נקבה
export const Fem = createContext(false);
export const useG = () => {
  const fem = useContext(Fem);
  return (m, f) => (fem ? f : m);
};
