import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { Html5Qrcode } from 'html5-qrcode';

const InvitationPage: React.FC = () => {
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const { auth, setAuth } = useAuth();
  const [showScanner, setShowScanner] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    // Add class to body when component mounts
    document.body.classList.add('invitation-page');
    // Remove class when component unmounts
    return () => {
      document.body.classList.remove('invitation-page');
    };
  }, []);

  useEffect(() => {
    if (showScanner && !scannerRef.current) {
      scannerRef.current = new Html5Qrcode("qr-reader");
      scannerRef.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
          setCode(decodedText);
          scannerRef.current?.stop();
          setShowScanner(false);
        },
        (error) => {
          console.warn(error);
        }
      ).catch(console.error);
    }
    return () => {
      scannerRef.current?.stop().catch(() => { });
      scannerRef.current = null;
    };
  }, [showScanner]);

  const handleSubmit = async () => {
    setStatus('loading');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/validate-invitation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, pin })
      });
      const json = await res.json();
      if (json.valid) {
        setAuth(prev => ({
          ...prev,
          invitationValidated: true,
          invitedName: json.invitation.invited_name
        }));
        setStatus('success');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen p-4 bg-gray-100">
      <h1 className="text-2xl font-bold mb-4">Membership Invitation</h1>
      <input
        placeholder="Invitation Code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="mb-2 p-2 rounded border w-64"
      />
      <input
        placeholder="4-digit PIN"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        className="mb-4 p-2 rounded border w-64"
      />
      <button
        onClick={() => setShowScanner(true)}
        className="mb-2 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-700"
      >
        Scan QR Code
      </button>
      <button
        onClick={handleSubmit}
        className="mb-4 px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
      >
        Validate
      </button>
      {showScanner && <div id="qr-reader" className="mb-4 w-64 h-64" data-testid="qr-reader" />}
      {status === 'loading' && <div>Validating...</div>}
      {status === 'error' && <div className="text-red-500">Invalid code or PIN</div>}
      {status === 'success' && (
        <div className="text-green-600">
          Welcome, {auth.invitedName}! Proceeding to onboarding...
        </div>
      )}
    </div>
  );
};

export default InvitationPage;