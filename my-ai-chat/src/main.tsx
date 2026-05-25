import { StrictMode, Component, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

class RootErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: any) {
    console.error('RootErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ color: '#991b1b', padding: 40, fontFamily: 'system-ui, sans-serif' }}>
          <h2>渲染错误</h2>
          <p style={{ fontWeight: 600 }}>{this.state.error?.message}</p>
          <pre style={{ background: '#fef2f2', padding: 16, borderRadius: 8, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  document.body.innerHTML = '<div style="color:red;padding:20px;font-family:sans-serif;">错误：找不到 #root 元素</div>';
} else {
  import('./App.tsx')
    .then(({ default: App }) => {
      createRoot(rootEl).render(
        <StrictMode>
          <RootErrorBoundary>
            <App />
          </RootErrorBoundary>
        </StrictMode>,
      );
    })
    .catch((err) => {
      console.error('App load error:', err);
      rootEl.innerHTML = `<div style="color:#991b1b;padding:40px;font-family:system-ui,sans-serif;white-space:pre-wrap;">
<h2>加载错误</h2>
<p><strong>${err.message}</strong></p>
<pre style="background:#fef2f2;padding:16px;border-radius:8px;overflow:auto;font-size:12px">${err.stack || ''}</pre>
</div>`;
    });
}
