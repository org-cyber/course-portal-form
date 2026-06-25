'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

type Status = 'loading' | 'paid' | 'pending' | 'failed' | 'error';

interface PaymentData {
  status: string;
  reference: string;
  amount: number;
  courseId: string;
  fullName: string;
  email: string;
  createdAt: string;
  emailSent: boolean;
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const reference = searchParams.get('reference');

  const [state, setState] = useState<{
    status: Status;
    data?: PaymentData;
    error?: string;
    emailStatus?: 'sending' | 'sent' | 'failed';
  }>({ status: 'loading' });

  useEffect(() => {
    if (!reference) {
      setState({ status: 'error', error: 'No payment reference found in URL' });
      return;
    }

    let attempts = 0;
    const maxAttempts = 30;
    let intervalId: NodeJS.Timeout;

    const check = async () => {
      try {
        const res = await fetch(`/api/verify-payment?reference=${reference}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Verification failed');
        }

        if (data.status === 'PAID') {
          setState({ status: 'paid', data });
          clearInterval(intervalId);

          // Fallback: trigger email if webhook hasn't sent it yet
          if (!data.emailSent) {
            triggerEmail(reference);
          }
          return;
        }

        if (data.status === 'FAILED') {
          setState({ status: 'failed', data });
          clearInterval(intervalId);
          return;
        }

        attempts++;
        if (attempts >= maxAttempts) {
          setState({ status: 'pending', data });
          clearInterval(intervalId);
        }
      } catch (err: any) {
        setState({ status: 'error', error: err.message });
        clearInterval(intervalId);
      }
    };

    const triggerEmail = async (ref: string) => {
      try {
        setState((prev) => ({ ...prev, emailStatus: 'sending' }));
        const res = await fetch('/api/confirm-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference: ref }),
        });
        if (res.ok) {
          setState((prev) => ({ ...prev, emailStatus: 'sent' }));
        } else {
          setState((prev) => ({ ...prev, emailStatus: 'failed' }));
        }
      } catch {
        setState((prev) => ({ ...prev, emailStatus: 'failed' }));
      }
    };

    check();
    intervalId = setInterval(check, 5000);

    return () => clearInterval(intervalId);
  }, [reference]);

  const naira = state.data ? (state.data.amount / 100).toFixed(2) : '0.00';

  return (
    <div className="container">
      <div className="card" style={{ textAlign: 'center' }}>
        {state.status === 'loading' && (
          <>
            <div
              className="loading"
              style={{
                width: '2rem',
                height: '2rem',
                margin: '0 auto 1rem',
                borderColor: 'var(--primary)',
                borderTopColor: 'transparent',
              }}
            />
            <h1>Verifying Payment...</h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              Please wait while we confirm your transaction.
            </p>
            <p className="file-info">Reference: {reference}</p>
          </>
        )}

        {state.status === 'paid' && state.data && (
          <>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
            <h1>Payment Confirmed!</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Your application has been successfully submitted.
            </p>
            <div
              style={{
                background: 'var(--bg)',
                padding: '1.5rem',
                borderRadius: 'var(--radius)',
                textAlign: 'left',
              }}
            >
              <p>
                <strong>Reference:</strong> {state.data.reference}
              </p>
              <p>
                <strong>Amount Paid:</strong> ₦{naira}
              </p>
              <p>
                <strong>Status:</strong>{' '}
                <span className="status-badge status-paid">PAID</span>
              </p>
              <p>
                <strong>Email:</strong> {state.data.email}
              </p>
            </div>
            <p
              style={{
                marginTop: '1.5rem',
                fontSize: '0.875rem',
                color: 'var(--text-secondary)',
              }}
            >
              {state.emailStatus === 'sending'
                ? 'Sending confirmation email...'
                : state.emailStatus === 'sent'
                ? 'A confirmation email has been sent to your inbox.'
                : state.emailStatus === 'failed'
                ? 'We had trouble sending your confirmation email. Please contact admissions if you do not receive it shortly.'
                : 'A confirmation email has been sent to your inbox.'}
            </p>
          </>
        )}

        {state.status === 'pending' && (
          <>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
            <h1>Payment Processing</h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              Your payment is still being processed. Check your email for updates.
            </p>
            <p className="file-info">Reference: {reference}</p>
          </>
        )}

        {state.status === 'failed' && (
          <>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
            <h1>Payment Failed</h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              There was an issue with your payment. Please try again.
            </p>
            <p className="file-info">Reference: {reference}</p>
            <button
              onClick={() => window.location.href = '/'}
              style={{
                marginTop: '1rem',
                padding: '0.75rem 1.5rem',
                background: 'var(--primary)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius)',
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
          </>
        )}

        {state.status === 'error' && (
          <>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <h1>Something Went Wrong</h1>
            <p style={{ color: 'var(--text-secondary)' }}>{state.error}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="container">
          <div className="card" style={{ textAlign: 'center' }}>
            <div
              className="loading"
              style={{
                width: '2rem',
                height: '2rem',
                margin: '0 auto',
                borderColor: 'var(--primary)',
                borderTopColor: 'transparent',
              }}
            />
          </div>
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
