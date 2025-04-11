import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import InvitationPage from './pages/InvitationPage.js';
import OnboardingPage from './pages/OnboardingPage.js';
import MembershipLoginPage from './pages/MembershipLoginPage.js';
import DashboardPage from './pages/DashboardPage.js';
import { AuthProvider, useAuth } from './AuthContext.js';

const ProtectedRoutes = () => {
  const { auth } = useAuth();

  return (
    <Routes>
      <Route path="/" element={<InvitationPage />} />
      <Route
        path="/onboarding"
        element={
          auth.invitationValidated ? <OnboardingPage /> : <Navigate to="/" replace />
        }
      />
      <Route
        path="/login"
        element={
          auth.onboardingSubmitted ? <MembershipLoginPage /> : <Navigate to="/" replace />
        }
      />
      <Route
        path="/dashboard"
        element={
          auth.membershipValidated ? <DashboardPage /> : <Navigate to="/login" replace />
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
