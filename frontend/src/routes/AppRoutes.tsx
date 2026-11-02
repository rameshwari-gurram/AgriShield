import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { HomePage } from '../pages/HomePage';
import { HealthDashboardPage } from '../pages/HealthDashboardPage';
import { DocsPage } from '../pages/docs/DocsPage';
import { RiskAlertsPage } from '../pages/risk/RiskAlertsPage';
import { WeatherOverviewPage } from '../pages/weather/WeatherOverviewPage';
import { AssessmentsPage } from '../pages/assessments/AssessmentsPage';
import { FarmerListPage } from '../pages/farmers/FarmerListPage';
import { FarmerRegisterPage } from '../pages/farmers/FarmerRegisterPage';
import { FarmerDetailPage } from '../pages/farmers/FarmerDetailPage';
import { AdminDashboardPage } from '../pages/dashboard/AdminDashboardPage';
import { FarmListPage } from '../pages/farms/FarmListPage';
import { FarmRegisterPage } from '../pages/farms/FarmRegisterPage';
import { FarmDetailPage } from '../pages/farms/FarmDetailPage';
import { PolicyPortfolioPage } from '../pages/policies/PolicyPortfolioPage';
import { ClaimsPortfolioPage } from '../pages/claims/ClaimsPortfolioPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        {/* Core Farmer-Facing Routes */}
        <Route index element={<HomePage />} />
        <Route path="farms" element={<FarmListPage />} />
        <Route path="farms/register" element={<FarmRegisterPage />} />
        <Route path="farms/:id" element={<FarmDetailPage />} />
        <Route path="policies" element={<PolicyPortfolioPage />} />
        <Route path="claims" element={<ClaimsPortfolioPage />} />
        <Route path="risk" element={<RiskAlertsPage />} />
        <Route path="weather" element={<WeatherOverviewPage />} />
        <Route path="assessments" element={<AssessmentsPage />} />

        {/* Administrative Only Routes */}
        <Route
          path="admin"
          element={
            <ProtectedRoute requiredRole="ADMIN">
              <AdminDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="farmers"
          element={
            <ProtectedRoute requiredRole="ADMIN">
              <FarmerListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="farmers/register"
          element={
            <ProtectedRoute requiredRole="ADMIN">
              <FarmerRegisterPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="farmers/:id"
          element={
            <ProtectedRoute requiredRole="ADMIN">
              <FarmerDetailPage />
            </ProtectedRoute>
          }
        />

        {/* Secondary / Technical Diagnostics Routes */}
        <Route path="health" element={<HealthDashboardPage />} />
        <Route path="docs" element={<DocsPage />} />

        {/* Fallback */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
};
