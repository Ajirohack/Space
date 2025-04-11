import React, { useState } from 'react';
import { useAuth } from '../AuthContext';

const OnboardingPage: React.FC = () => {
  const [code, setCode] = useState('');
  const [responses, setResponses] = useState('');
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const { setAuth } = useAuth();

  const handleSubmit = async () => {
    // Form validation
    if (!code.trim()) {
      setStatus('error');
      setErrorMessage('Please enter your invitation code');
      return;
    }

    if (!responses.trim()) {
      setStatus('error');
      setErrorMessage('Please provide your responses');
      return;
    }

    if (!voiceConsent) {
      setStatus('error');
      setErrorMessage('Please provide consent for voice processing');
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/submit-onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, responses, voice_consent: voiceConsent })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setAuth(prev => ({
          ...prev,
          onboardingSubmitted: true
        }));
        setStatus('success');
      } else {
        // Use API error message if available
        const message = json.message || json.detail || 'Submission failed. Please try again.';
        setErrorMessage(message);
        setStatus('error');
      }
    } catch (error) {
      // Handle network errors or other exceptions
      console.error("Submission error:", error);
      const message = error instanceof Error ?
        `Network error: ${error.message}` :
        'Submission failed due to a network issue';
      setErrorMessage(message);
      setStatus('error');
    }
  };

  const handleRecord = () => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech Recognition not supported');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setResponses((prev) => prev + ' ' + transcript);
    };

    recognition.onerror = (event: any) => {
      console.error(event.error);
    };

    recognition.start();
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen p-4 bg-gray-100">
      <h1 className="text-2xl font-bold mb-4">AI Onboarding Interview</h1>
      <input
        placeholder="Invitation Code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="mb-2 p-2 rounded border w-64"
      />
      <textarea
        placeholder="Your responses..."
        value={responses}
        onChange={(e) => setResponses(e.target.value)}
        className="mb-2 p-2 rounded border w-64 h-32"
      />
      <button
        onClick={handleRecord}
        className="mb-2 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-700"
      >
        Record Speech
      </button>
      <label className="mb-4 flex items-center gap-2">
        <input
          type="checkbox"
          checked={voiceConsent}
          onChange={(e) => setVoiceConsent(e.target.checked)}
        />
        I consent to voice recording & AI verification
      </label>
      <button
        onClick={handleSubmit}
        className="mb-4 px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
        disabled={status === 'loading'}
      >
        Submit Onboarding
      </button>
      {status === 'loading' && <div>Submitting...</div>}
      {status === 'error' && <div className="text-red-500">{errorMessage}</div>}
      {status === 'success' && (
        <div className="text-green-600">Onboarding submitted! Await admin approval.</div>
      )}
    </div>
  );
};

export default OnboardingPage;