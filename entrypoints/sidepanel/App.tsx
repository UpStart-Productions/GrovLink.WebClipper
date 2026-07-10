import { useEffect, useState } from 'react';
import { DevCreds, clearDevCreds, getDevCreds, setDevCreds } from '../../lib/devAuth';
import { CapturePayload, getActiveTabCapture, takePendingCapture } from '../../lib/capture';
import { SeedUser, createDraftEvent, fetchSeedUsers } from '../../lib/api';

type Screen = 'loading' | 'login' | 'capture';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [creds, setCreds] = useState<DevCreds | null>(null);

  useEffect(() => {
    getDevCreds().then((existing) => {
      if (existing) {
        setCreds(existing);
        setScreen('capture');
      } else {
        setScreen('login');
      }
    });
  }, []);

  if (screen === 'loading') {
    return <div className="panel-body">Loading…</div>;
  }

  if (screen === 'login' || !creds) {
    return (
      <DevLogin
        onSignedIn={(c) => {
          setCreds(c);
          setScreen('capture');
        }}
      />
    );
  }

  return (
    <CapturePanel
      creds={creds}
      onSwitchOrg={async () => {
        await clearDevCreds();
        setCreds(null);
        setScreen('login');
      }}
    />
  );
}

function DevLogin({ onSignedIn }: { onSignedIn: (creds: DevCreds) => void }) {
  const [email, setEmail] = useState('affiliate@loveincnewberg.test');
  const [customerSlug, setCustomerSlug] = useState('loveinc');
  const [tenantSlug, setTenantSlug] = useState('newberg');
  const [error, setError] = useState<string | null>(null);
  const [seedUsers, setSeedUsers] = useState<SeedUser[] | null>(null);
  const [loadingSeed, setLoadingSeed] = useState(false);

  async function handleContinue() {
    setError(null);
    if (!email.trim() || !customerSlug.trim() || !tenantSlug.trim()) {
      setError('All three fields are required.');
      return;
    }
    const creds: DevCreds = {
      email: email.trim(),
      customerSlug: customerSlug.trim(),
      tenantSlug: tenantSlug.trim(),
    };
    await setDevCreds(creds);
    onSignedIn(creds);
  }

  async function handleLoadSeedUsers() {
    setLoadingSeed(true);
    setError(null);
    try {
      const users = await fetchSeedUsers();
      setSeedUsers(users);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingSeed(false);
    }
  }

  return (
    <div className="panel">
      <div className="login-wrap">
        <div className="login-mark">G</div>
        <p className="login-title">Sign in to GrovLink</p>
        <p className="login-sub">
          Local dev mode — this uses your API's dev auth headers, not real Cognito
          login yet. See the README for why.
        </p>
        <div className="login-form">
          <div className="field-group">
            <label className="field-label">Email</label>
            <input
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="affiliate@loveincnewberg.test"
            />
          </div>
          <div className="field-row">
            <div className="field-group">
              <label className="field-label">Customer slug</label>
              <input
                className="field-input"
                value={customerSlug}
                onChange={(e) => setCustomerSlug(e.target.value)}
                placeholder="loveinc"
              />
            </div>
            <div className="field-group">
              <label className="field-label">Tenant slug</label>
              <input
                className="field-input"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                placeholder="newberg"
              />
            </div>
          </div>
          <button className="btn-primary" onClick={handleContinue}>
            Continue
          </button>
          <button className="btn-secondary" onClick={handleLoadSeedUsers} disabled={loadingSeed}>
            {loadingSeed ? 'Loading…' : 'Load users from local DB'}
          </button>
          {seedUsers && (
            <div className="seed-users">
              {seedUsers.length === 0 && (
                <div className="seed-user-row">No users found — run the seed script.</div>
              )}
              {seedUsers.map((u) => (
                <div
                  key={u.email}
                  className="seed-user-row"
                  onClick={() => setEmail(u.email)}
                  title="Click to use this email"
                >
                  <span>{u.email}</span>
                  <span className="seed-user-role">{u.role}</span>
                </div>
              ))}
            </div>
          )}
          {error && <div className="login-error">{error}</div>}
        </div>
        <p className="helper-text">
          Once real login is wired up, you'll stay signed in for about a year — no
          repeat logins for normal day-to-day use.
        </p>
      </div>
    </div>
  );
}

function defaultDateTimeLocal(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CapturePanel({ creds, onSwitchOrg }: { creds: DevCreds; onSwitchOrg: () => void }) {
  const [capture, setCapture] = useState<CapturePayload | null>(null);
  const [title, setTitle] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [startDate, setStartDate] = useState(defaultDateTimeLocal(24));
  const [endDate, setEndDate] = useState(defaultDateTimeLocal(27));
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [createdId, setCreatedId] = useState<string | null>(null);

  async function loadCapture() {
    const staged = await takePendingCapture();
    const resolved = staged ?? (await getActiveTabCapture());
    setCapture(resolved);
    setTitle(resolved?.pageTitle ?? '');
    setShortDescription(resolved?.kind === 'selection' ? resolved.text ?? '' : '');
    setStatus('idle');
    setCreatedId(null);
  }

  useEffect(() => {
    loadCapture();
  }, []);

  async function handleSave() {
    setStatus('saving');
    setErrorMsg('');
    try {
      const result = await createDraftEvent({
        title: title.trim() || 'Untitled event',
        shortDescription: shortDescription.trim() || undefined,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        isActive: false,
      });
      setCreatedId(result.id ?? null);
      setStatus('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="panel">
        <PanelHeader creds={creds} onSwitchOrg={onSwitchOrg} />
        <div className="success-wrap">
          <div className="success-check">✓</div>
          <p className="success-title">Saved as a draft</p>
          <p className="success-sub">
            {creds.tenantSlug} · id {createdId ?? '(unknown)'}
          </p>
          <button className="btn-secondary" style={{ marginTop: 0 }} onClick={loadCapture}>
            Capture another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <PanelHeader creds={creds} onSwitchOrg={onSwitchOrg} />
      <div className="panel-body">
        {capture && (
          <>
            <div className="kind-badge">
              {capture.kind === 'page' && 'Captured: full page'}
              {capture.kind === 'selection' && 'Captured: selected text'}
              {capture.kind === 'image' && 'Captured: image'}
            </div>
            <div className="thumb-row">
              <div className="thumb-img" />
              <div className="thumb-info">
                <p className="thumb-title">{capture.pageTitle || '(untitled page)'}</p>
                <p className="thumb-url">{capture.pageUrl}</p>
              </div>
            </div>
            {capture.kind === 'selection' && capture.text && (
              <div className="quote-box">&ldquo;{capture.text}&rdquo;</div>
            )}
          </>
        )}

        <div className="field-group">
          <label className="field-label">Type</label>
          <div className="type-chips">
            <span className="type-chip active">Event</span>
            <span className="type-chip disabled" title="Not wired up in this stub yet">
              CTA
            </span>
            <span className="type-chip disabled" title="Not wired up in this stub yet">
              Class
            </span>
            <span className="type-chip disabled" title="Not wired up in this stub yet">
              Impact story
            </span>
          </div>
        </div>

        <div className="field-group">
          <label className="field-label">Title</label>
          <input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Start</label>
            <input
              className="field-input"
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label className="field-label">End</label>
            <input
              className="field-input"
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="field-group">
          <label className="field-label">Short description</label>
          <textarea
            className="field-textarea"
            rows={3}
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
          />
        </div>

        <button className="btn-primary" onClick={handleSave} disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Save as draft'}
        </button>
        <p className="helper-text">Nothing goes live until someone approves it in GrovLink.</p>

        {status === 'error' && <div className="form-error">{errorMsg}</div>}
      </div>
    </div>
  );
}

function PanelHeader({ creds, onSwitchOrg }: { creds: DevCreds; onSwitchOrg: () => void }) {
  return (
    <div className="panel-header">
      <span className="org-pill">
        <span className="org-dot">{creds.tenantSlug.slice(0, 2).toUpperCase()}</span>
        {creds.customerSlug} — {creds.tenantSlug}
      </span>
      <button className="link-button" onClick={onSwitchOrg}>
        switch
      </button>
    </div>
  );
}
