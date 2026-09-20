import React from 'react';
import { Shield } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-slate-200 mt-auto py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-center sm:text-left">
          <div className="flex items-center space-x-2 text-slate-700">
            <Shield className="w-5 h-5 text-emerald-600" />
            <span className="font-semibold text-slate-800">AgriShield Parametric</span>
            <span className="text-xs text-slate-400">| Module 1: Architecture Foundation</span>
          </div>

          <div className="text-xs text-slate-500">
            Clean Architecture &bull; React &bull; Node.js &bull; FastAPI &bull; PostgreSQL &bull; Prisma
          </div>

          <div className="text-xs text-slate-400">
            &copy; {new Date().getFullYear()} AgriShield Platform. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
};
