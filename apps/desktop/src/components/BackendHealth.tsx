import { useEffect, useState } from 'react';

interface Props {
  backendUrl?: string;
}

export function BackendHealth({ backendUrl = 'http://127.0.0.1:9876' }: Props) {
  const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [retryIn, setRetryIn] = useState(0);

  const checkHealth = async () => {
    setStatus('checking');
    try {
      const res = await fetch(`${backendUrl}/health`, { 
        method: 'GET',
        signal: AbortSignal.timeout(3000) 
      });
      if (res.ok) {
        setStatus('connected');
        setRetryIn(0);
      } else {
        throw new Error('Bad status');
      }
    } catch {
      setStatus('disconnected');
      // Exponential backoff retry
      const nextRetry = Math.min(30, Math.max(3, retryIn * 1.5 || 3));
      setRetryIn(nextRetry);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(() => {
      if (status === 'disconnected' && retryIn > 0) {
        setRetryIn(r => r - 1);
      }
    }, 1000);

    const healthInterval = setInterval(() => {
      if (retryIn === 0) {
        checkHealth();
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      clearInterval(healthInterval);
    };
  }, [status, retryIn]);

  const color = 
    status === 'connected' ? '#22c55e' : 
    status === 'checking' ? '#eab308' : '#ef4444';

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '4px 10px',
      background: '#25252b',
      borderRadius: 4,
      fontSize: 12,
      border: `1px solid ${color}`
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      <span>
        Backend: <strong>{status}</strong>
        {status === 'disconnected' && retryIn > 0 && ` (retry in ${retryIn}s)`}
      </span>
      <button 
        onClick={checkHealth} 
        style={{ fontSize: 11, padding: '1px 6px', marginLeft: 4 }}
        disabled={status === 'checking'}
      >
        ↻
      </button>
    </div>
  );
}
