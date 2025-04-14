import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import InvitationPage from './pages/InvitationPage.js';
import OnboardingPage from './pages/OnboardingPage.js';
import MembershipLoginPage from './pages/MembershipLoginPage.js';
import DashboardPage from './pages/DashboardPage.js';
import { AuthProvider } from './AuthContext.js';

const ProtectedRoutes = () => {
  // Allow all pages for testing, remove auth checks
  return (
    <>
      <nav style={{ padding: '1rem', background: '#f3f3f3', marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
        <Link to="/">Invitation</Link>
        <Link to="/onboarding">Onboarding</Link>
        <Link to="/login">Membership Login</Link>
        <Link to="/dashboard">Dashboard</Link>
      </nav>
      <Routes>
        <Route path="/" element={<InvitationPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/login" element={<MembershipLoginPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
};

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <ProtectedRoutes />
    </BrowserRouter>
  </AuthProvider>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
