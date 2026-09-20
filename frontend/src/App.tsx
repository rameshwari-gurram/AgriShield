import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AppRoutes } from './routes/AppRoutes';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </BrowserRouter>
  );
};

export default App;
