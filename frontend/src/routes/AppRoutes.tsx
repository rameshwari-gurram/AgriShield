import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { HomePage } from '../pages/HomePage';
import { HealthDashboardPage } from '../pages/HealthDashboardPage';
import { FarmerListPage } from '../pages/farmers/FarmerListPage';
import { FarmerRegisterPage } from '../pages/farmers/FarmerRegisterPage';
import { FarmerDetailPage } from '../pages/farmers/FarmerDetailPage';
import { NotFoundPage } from '../pages/NotFoundPage';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<HomePage />} />
        <Route path="health" element={<HealthDashboardPage />} />
        <Route path="farmers" element={<FarmerListPage />} />
        <Route path="farmers/register" element={<FarmerRegisterPage />} />
        <Route path="farmers/:id" element={<FarmerDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
};
