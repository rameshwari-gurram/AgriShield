import React from 'react';
import { Link } from 'react-router-dom';
import { HelpCircle, ArrowLeft } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
        <HelpCircle className="w-8 h-8" />
      </div>
      <div>
        <h1 className="text-3xl font-bold text-slate-900">404 - Page Not Found</h1>
        <p className="text-slate-500 mt-2 text-sm max-w-md">
          The route you are trying to access does not exist in AgriShield Parametric.
        </p>
      </div>
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition shadow-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Overview
      </Link>
    </div>
  );
};
