import React from 'react';

const DashboardPage: React.FC = () => {
  return (
    <div className="flex flex-col h-screen">
      <header className="p-4 bg-black text-white flex justify-between items-center">
        <h1 className="text-lg font-semibold">SpaceWH Member Dashboard</h1>
        <div className="flex gap-4">
          <button className="hover:underline">Settings</button>
          <button className="hover:underline">Persona</button>
          <button className="hover:underline">Upload</button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex">
        <iframe
          src="http://localhost:8080"  // Open WebUI URL
          title="Chat"
          className="flex-1 border-none"
        />
      </main>
    </div>
  );
};

export default DashboardPage;