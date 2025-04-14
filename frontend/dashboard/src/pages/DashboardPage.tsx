import React from 'react';
import Sidebar from '../shared/sidebar/Sidebar';

const DashboardPage: React.FC = () => {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="p-4 bg-black text-white flex justify-between items-center">
          <h1 className="text-lg font-semibold">SpaceWH Member Dashboard</h1>
          <div className="flex gap-4">
            <button className="hover:underline">Settings</button>
            <button className="hover:underline">Persona</button>
            <button className="hover:underline">Upload</button>
          </div>
        </header>

        <main className="flex-1 overflow-hidden">
          <iframe
            src="http://localhost:5173"
            title="Chat"
            className="w-full h-full border-none"
          />
        </main>
      </div>
    </div>
  );
};

export default DashboardPage;