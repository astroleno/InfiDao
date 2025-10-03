import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MainPage } from '@/pages/MainPage';
import './App.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="app">
        <MainPage />
      </div>
    </QueryClientProvider>
  );
}

export default App;
