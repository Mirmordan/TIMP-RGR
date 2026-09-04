import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

const MAX_MESSAGE = 500;

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[rgr] fatal:', error.message.slice(0, MAX_MESSAGE), info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    const message = (error.message || String(error)).slice(0, MAX_MESSAGE);

    const buttonStyle: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: 36,
      padding: '0 16px',
      fontFamily: 'var(--font-body)',
      fontSize: 12,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border)',
      background: 'transparent',
      color: 'var(--text-muted)',
      textDecoration: 'none',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    };

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'var(--bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-6)',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 640,
            background: 'var(--surface-1)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow), var(--shadow-inset)',
            padding: 'var(--space-8)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--danger)',
              marginBottom: 'var(--space-5)',
            }}
          >
            [ rgr ] &mdash; fatal error
          </div>
          <div
            style={{
              color: 'var(--text)',
              fontSize: 13,
              lineHeight: 1.6,
              marginBottom: 'var(--space-4)',
            }}
          >
            Что-то сломалось в интерфейсе. Данных это не затронуло.
          </div>
          <pre
            style={{
              color: 'var(--text-dim)',
              fontSize: 12,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              overflow: 'auto',
              maxHeight: '30vh',
              background: 'var(--bg)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-3)',
              margin: '0 0 var(--space-5)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {message}
          </pre>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <button type="button" style={buttonStyle} onClick={this.handleReload}>
              Перезагрузить
            </button>
            <a href="/" style={buttonStyle}>
              На главную
            </a>
          </div>
        </div>
      </div>
    );
  }
}
