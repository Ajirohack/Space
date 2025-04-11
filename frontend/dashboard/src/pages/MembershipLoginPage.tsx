import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { Button } from '../shared/components/ui/button.tsx'; // Updated import path with explicit extension
import { Input } from '../shared/components/ui/input.tsx'; // Updated import path with explicit extension
import { Alert, AlertDescription } from '../shared/components/ui/alert.tsx'; // Updated import path with explicit extension

const MembershipLoginPage = () => {
  const [key, setKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { auth } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      return;
    }

    setIsLoading(true);
    try {
      await auth.login(key.trim());
      navigate('/dashboard');
    } catch (error) {
      console.error('Login failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6 rounded-lg border p-6 shadow-lg">
        <h1 className="text-2xl font-bold text-center">Membership Login</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="key" className="text-sm font-medium">
              Membership Key
            </label>
            <Input
              id="key"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Enter your membership key"
              disabled={isLoading}
              required
              className="w-full"
            />
          </div>

          {auth.error && (
            <Alert variant="destructive">
              <AlertDescription>{auth.error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !key.trim()}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default MembershipLoginPage;