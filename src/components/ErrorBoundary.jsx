import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught error:', error, info);
    this.setState({ info });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '24px',
          background: '#1e1e2e',
          color: '#ff6b6b',
          borderRadius: '12px',
          fontFamily: 'monospace',
          maxHeight: '400px',
          overflow: 'auto',
          border: '2px solid #ff6b6b',
          margin: '8px'
        }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px', color: '#ff9f43' }}>
            ⚠️ Render Xatosi: {this.props.name || 'Component'}
          </div>
          <div style={{ fontSize: '13px', color: '#ff6b6b', marginBottom: '8px', whiteSpace: 'pre-wrap' }}>
            {this.state.error?.message}
          </div>
          <details style={{ marginTop: '8px' }}>
            <summary style={{ cursor: 'pointer', color: '#74b9ff' }}>Stack trace</summary>
            <pre style={{ fontSize: '11px', color: '#a29bfe', whiteSpace: 'pre-wrap', marginTop: '8px' }}>
              {this.state.error?.stack}
            </pre>
          </details>
          {this.state.info && (
            <details style={{ marginTop: '8px' }}>
              <summary style={{ cursor: 'pointer', color: '#74b9ff' }}>Component tree</summary>
              <pre style={{ fontSize: '11px', color: '#81ecec', whiteSpace: 'pre-wrap', marginTop: '8px' }}>
                {this.state.info.componentStack}
              </pre>
            </details>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: null, info: null })}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              background: '#6c5ce7',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Qayta urinish
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
