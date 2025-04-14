import React from 'react';
import { useAuth } from '../../AuthContext';

interface SidebarProps {
  className?: string;
}

const Sidebar: React.FC<SidebarProps> = ({ className = '' }) => {
  const { auth } = useAuth();
  if (!auth.isAuthenticated) return null;

  return (
    <div className={`w-64 h-screen bg-gray-100 p-4 ${className}`}>
      <h2 className="text-xl font-bold mb-4">Dashboard Sidebar</h2>
      <nav>
        <ul className="space-y-2">
          <li>
            <a href="#" className="block p-2 hover:bg-gray-200 rounded">Dashboard</a>
          </li>
          <li>
            <a href="#" className="block p-2 hover:bg-gray-200 rounded">Projects</a>
          </li>
          <li>
            <a href="#" className="block p-2 hover:bg-gray-200 rounded">Team</a>
          </li>
          <li>
            <a href="#" className="block p-2 hover:bg-gray-200 rounded">Settings</a>
          </li>
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar;