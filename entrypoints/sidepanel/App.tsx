import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, LogOut, RefreshCw } from 'lucide-react';
import { AuthRequiredError, setAuthExpiredHandler } from '../../lib/authSession';
import { DevCreds, clearDevCreds, getDevCreds, setDevCreds } from '../../lib/devAuth';
import {
  confirmSignInWithNewPassword,
  getAuthErrorMessage,
  hasCognitoSession,
  signInWithGoogle,
  signInWithPassword,
  signOutCognito,
} from '../../lib/cognitoAuth';
import { OrgContext, clearOrgContext, getOrgContext, setOrgContext } from '../../lib/orgContext';
import {
  SavedFormDraft,
  clearFormDraft,
  fileToDraftPhoto,
  loadFormDraft,
  photoFileFromDraft,
  saveFormDraft,
} from '../../lib/formDraft';
import { getViewedNotificationIds, markNotificationViewedLocally } from '../../lib/notificationViews';
import { CapturePayload, getActiveTabCapture, takePendingCapture } from '../../lib/capture';
import {
  CONTENT_KINDS,
  CONTENT_TYPE_LABELS,
  CTA_TYPE_OPTIONS,
  ContentKind,
} from '../../lib/contentTypes';
import {
  AdminNotification,
  DraftItem,
  OrgOption,
  SeedUser,
  approveDraft,
  createDraft,
  discardDraft,
  fetchDrafts,
  fetchMyCustomers,
  fetchMyTenants,
  fetchNotifications,
  fetchSeedUsers,
  fetchUnreadNotificationCount,
  notificationAppUrl,
  uploadStagingPhoto,
} from '../../lib/api';
import { formatDateRangeLabel, parseDateRange, toDateTimeLocal, withDefaultEnd } from '../../lib/dateParse';
import RichTextEditor from './RichTextEditor';

type Screen = 'loading' | 'login' | 'org-picker' | 'capture';

// What MainPanel/PanelHeader actually need to render -- true for both a dev
// session (DevCreds, minus the email) and a real Cognito session (the
// customer/tenant the user picked in OrgPicker). Keeping this separate from
// DevCreds is what lets the rest of the capture UI stay oblivious to which
// auth path got it here. customerName/tenantName are only ever populated on
// the Cognito path (OrgPicker/OrgSwitcherPill both come from the real
// /my-customers, /my-tenants API, which has real display names) -- dev mode
// only ever has the slugs the user typed in.
interface ActiveOrg {
  customerSlug: string;
  tenantSlug: string;
  customerName?: string;
  tenantName?: string;
}

// "loveinc" -> "Loveinc" -- only used as a fallback for dev-mode sessions,
// which have nothing better than the raw slug to show. Cognito sessions
// always have a real customerName/tenantName from the API instead.
function titleCaseSlug(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatOrgLabel(org: ActiveOrg): string {
  const customer = org.customerName || titleCaseSlug(org.customerSlug);
  const tenant = org.tenantName || titleCaseSlug(org.tenantSlug);
  return `${customer}, ${tenant}`;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [org, setOrg] = useState<ActiveOrg | null>(null);
  const [loginError, setLoginError] = useState('');
  // Tracks which sign-in path is live so "switch" knows exactly what to tear
  // down -- clearing dev creds when a Cognito session is active (or vice
  // versa) would leave stale state around for no reason.
  const [authMode, setAuthMode] = useState<'dev' | 'cognito' | null>(null);

  const handleSessionExpired = useCallback(async () => {
    if (authMode === 'cognito') {
      await signOutCognito();
      await clearOrgContext();
    } else if (authMode === 'dev') {
      await clearDevCreds();
    }
    setOrg(null);
    setAuthMode(null);
    setLoginError('Your session expired. Please sign in again.');
    setScreen('login');
  }, [authMode]);

  useEffect(() => {
    setAuthExpiredHandler(() => {
      void handleSessionExpired();
    });
    return () => setAuthExpiredHandler(null);
  }, [handleSessionExpired]);

  useEffect(() => {
    (async () => {
      if (await hasCognitoSession()) {
        setAuthMode('cognito');
        const savedOrg = await getOrgContext();
        if (savedOrg) {
          try {
            await fetchMyCustomers();
            setOrg(savedOrg);
            setScreen('capture');
          } catch {
            await signOutCognito();
            await clearOrgContext();
            setLoginError('Your session expired. Please sign in again.');
            setScreen('login');
          }
        } else {
          setScreen('org-picker');
        }
        return;
      }
      const devCreds = await getDevCreds();
      if (devCreds) {
        setAuthMode('dev');
        setOrg(devCreds);
        setScreen('capture');
        return;
      }
      setScreen('login');
    })();
  }, []);

  async function handleSwitchOrg() {
    await clearFormDraft();
    if (authMode === 'cognito') {
      await signOutCognito();
      await clearOrgContext();
    } else {
      await clearDevCreds();
    }
    setOrg(null);
    setAuthMode(null);
    setLoginError('');
    setScreen('login');
  }

  if (screen === 'loading') {
    return <div className="panel-body">Loading…</div>;
  }

  if (screen === 'login') {
    return (
      <LoginScreen
        initialError={loginError}
        onDevSignedIn={(c) => {
          setAuthMode('dev');
          setOrg(c);
          setLoginError('');
          setScreen('capture');
        }}
        onCognitoSignedIn={() => {
          setAuthMode('cognito');
          setLoginError('');
          setScreen('org-picker');
        }}
      />
    );
  }

  if (screen === 'org-picker') {
    return (
      <OrgPicker
        onSelected={(ctx) => {
          setOrg(ctx);
          setScreen('capture');
        }}
        onCancel={handleSwitchOrg}
      />
    );
  }

  if (!org) {
    // Shouldn't happen (every path into 'capture' sets org first) -- falls
    // back to login rather than rendering MainPanel with nothing to show.
    setScreen('login');
    return null;
  }

  return (
    <MainPanel
      org={org}
      authMode={authMode}
      onOrgChange={setOrg}
      onSwitchOrg={handleSwitchOrg}
      onSessionExpired={handleSessionExpired}
    />
  );
}

// Top-level sign-in screen: a real Cognito login (password or Google, same
// account as the admin dashboard) front and center, with the old dev-mode
// header-based login tucked behind a toggle for local testing. See README
// for why both exist.
type CognitoFormMode = 'login' | 'new-password-required';

function LoginScreen({
  initialError,
  onDevSignedIn,
  onCognitoSignedIn,
}: {
  initialError?: string;
  onDevSignedIn: (creds: DevCreds) => void;
  onCognitoSignedIn: () => void;
}) {
  const [showDevLogin, setShowDevLogin] = useState(false);
  const [cognitoMode, setCognitoMode] = useState<CognitoFormMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [cognitoBusy, setCognitoBusy] = useState(false);
  const [cognitoError, setCognitoError] = useState(initialError ?? '');

  async function handleEmailPasswordSignIn() {
    setCognitoError('');
    if (!email.trim()) {
      setCognitoError('Email is required.');
      return;
    }
    if (!password) {
      setCognitoError('Password is required.');
      return;
    }

    setCognitoBusy(true);
    try {
      const { needsNewPassword } = await signInWithPassword(email, password);
      if (needsNewPassword) {
        setCognitoMode('new-password-required');
        setNewPassword('');
        setNewPasswordConfirm('');
        setPassword('');
      } else {
        onCognitoSignedIn();
      }
    } catch (err) {
      setCognitoError(getAuthErrorMessage(err));
    } finally {
      setCognitoBusy(false);
    }
  }

  async function handleNewPassword() {
    setCognitoError('');
    const p = newPassword.trim();
    const c = newPasswordConfirm.trim();
    if (p.length < 8) {
      setCognitoError('Password must be at least 8 characters.');
      return;
    }
    if (p !== c) {
      setCognitoError('Passwords do not match.');
      return;
    }

    setCognitoBusy(true);
    try {
      await confirmSignInWithNewPassword(p);
      onCognitoSignedIn();
    } catch (err) {
      setCognitoError(getAuthErrorMessage(err));
    } finally {
      setCognitoBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    setCognitoBusy(true);
    setCognitoError('');
    try {
      await signInWithGoogle();
      onCognitoSignedIn();
    } catch (err) {
      setCognitoError(getAuthErrorMessage(err));
    } finally {
      setCognitoBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="login-wrap">
        <img className="login-mark" src={chrome.runtime.getURL('grovlink-logo.svg')} alt="GrovLink" />
        <p className="login-title">Sign in to GrovLink</p>
        <p className="login-sub">
          Use the same email and password as the GrovLink admin dashboard.
        </p>
        <div className="login-form">
          {cognitoMode === 'login' ? (
            <>
              <div className="field-group">
                <label className="field-label">Email</label>
                <input
                  className="field-input"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="field-group">
                <label className="field-label">Password</label>
                <input
                  className="field-input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <button
                className="btn-primary"
                onClick={handleEmailPasswordSignIn}
                disabled={cognitoBusy || !email.trim() || !password}
              >
                {cognitoBusy ? 'Signing in…' : 'Sign in'}
              </button>
              <div className="divider" style={{ margin: '16px 0' }}>
                <span>or</span>
              </div>
              <button className="btn-secondary" onClick={handleGoogleSignIn} disabled={cognitoBusy}>
                Sign in with Google
              </button>
            </>
          ) : (
            <>
              <p className="login-sub" style={{ textAlign: 'left', marginBottom: 12 }}>
                Your account uses a temporary password. Set a new password to continue.
              </p>
              <div className="field-group">
                <label className="field-label">New password</label>
                <input
                  className="field-input"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
              <div className="field-group">
                <label className="field-label">Confirm new password</label>
                <input
                  className="field-input"
                  type="password"
                  autoComplete="new-password"
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <button
                className="btn-primary"
                onClick={handleNewPassword}
                disabled={cognitoBusy || !newPassword || !newPasswordConfirm}
              >
                {cognitoBusy ? 'Saving…' : 'Set password and sign in'}
              </button>
              <button
                className="link-button"
                style={{ marginTop: 12, display: 'block' }}
                onClick={() => {
                  setCognitoMode('login');
                  setCognitoError('');
                  setNewPassword('');
                  setNewPasswordConfirm('');
                }}
              >
                Back to sign in
              </button>
            </>
          )}
          {cognitoError && <div className="login-error">{cognitoError}</div>}
          {import.meta.env.WXT_API_ENV !== 'production' && cognitoMode === 'login' && (
            <>
              <button
                className="link-button"
                style={{ marginTop: 14, display: 'block' }}
                onClick={() => setShowDevLogin((v) => !v)}
              >
                {showDevLogin ? 'Hide local dev login' : 'Use local dev login instead'}
              </button>
              {showDevLogin && <DevLogin onSignedIn={onDevSignedIn} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Stand-in for real auth, now tucked behind "Use local dev login instead" on
// the main login screen. Renders just the form itself -- LoginScreen owns
// the surrounding logo/title/wrap since it's the one deciding which login
// path is showing.
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
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
      <p className="login-sub" style={{ textAlign: 'left', marginBottom: 12 }}>
        Local dev mode — uses your API's dev auth headers instead of Cognito.
        Only works when the API's NODE_ENV isn't "production."
      </p>
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
  );
}

// Shown right after a fresh Cognito sign-in (or on relaunch if a session
// exists but no org was ever picked). Walks GET /my-customers -> GET
// /my-tenants, auto-advancing past any step that only has one option so a
// single-location nonprofit affiliate never sees a picker with nothing to
// pick from.
function OrgPicker({
  onSelected,
  onCancel,
}: {
  onSelected: (ctx: OrgContext) => void;
  onCancel: () => void;
}) {
  const [customers, setCustomers] = useState<OrgOption[] | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<OrgOption | null>(null);
  const [tenants, setTenants] = useState<OrgOption[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setBusy(true);
      setError('');
      try {
        const list = await fetchMyCustomers();
        setCustomers(list);
        if (list.length === 1) {
          await chooseCustomer(list[0]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    })();
    // Mount-only -- this is a one-time picker flow, not something that reacts
    // to outside state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function chooseCustomer(customer: OrgOption) {
    setSelectedCustomer(customer);
    setTenants(null);
    setError('');
    setBusy(true);
    try {
      const list = await fetchMyTenants(customer.slug);
      setTenants(list);
      if (list.length === 1) {
        await finish(customer, list[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function finish(customer: OrgOption, tenant: OrgOption) {
    const ctx: OrgContext = {
      customerSlug: customer.slug,
      tenantSlug: tenant.slug,
      customerName: customer.name,
      tenantName: tenant.name,
    };
    await setOrgContext(ctx);
    onSelected(ctx);
  }

  return (
    <div className="panel">
      <div className="login-wrap">
        <img className="login-mark" src={chrome.runtime.getURL('grovlink-logo.svg')} alt="GrovLink" />
        <p className="login-title">Choose your organization</p>
        <p className="login-sub">
          {selectedCustomer
            ? `Pick a location within ${selectedCustomer.name}.`
            : "Pick which organization you're working in."}
        </p>
        <div className="login-form">
          {!selectedCustomer && (
            <div className="seed-users">
              {busy && customers === null && <div className="seed-user-row">Loading…</div>}
              {customers?.length === 0 && (
                <div className="seed-user-row">No organizations found for this account.</div>
              )}
              {customers?.map((c) => (
                <div key={c.id} className="seed-user-row" onClick={() => chooseCustomer(c)}>
                  <span>{c.name}</span>
                </div>
              ))}
            </div>
          )}

          {selectedCustomer && (
            <div className="seed-users">
              {busy && tenants === null && <div className="seed-user-row">Loading…</div>}
              {tenants?.length === 0 && <div className="seed-user-row">No locations found.</div>}
              {tenants?.map((t) => (
                <div key={t.id} className="seed-user-row" onClick={() => finish(selectedCustomer, t)}>
                  <span>{t.name}</span>
                </div>
              ))}
            </div>
          )}

          {error && <div className="login-error">{error}</div>}
          <button className="btn-secondary" onClick={onCancel}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

const SHORT_DESCRIPTION_MAX = 200;

// Short description is meant to read as one line -- it's a 200-char preview
// shown elsewhere in GrovLink -- but captured text almost always carries the
// source page's own line breaks (every "block" on the page tends to land on
// its own line once selected). Collapse those to spaces before anything else
// touches the text, so it doesn't show up with odd mid-sentence breaks.
function toSingleLine(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
}

// The backend caps shortDescription at 200 chars on every content type (all
// four *CreateDto classes have the same @MaxLength(200)) but has no limit on
// longDescription. A selected sentence or paragraph easily blows past 200, so
// it goes in full into longDescription, with a capped single-line preview here.
function truncate(text: string, max: number): string {
  const singleLine = toSingleLine(text);
  if (singleLine.length <= max) return singleLine;
  return `${singleLine.slice(0, max - 1).trimEnd()}…`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Plain captured text carries its line breaks as literal "\n" characters, but
// HTML collapses raw whitespace when rendering -- feeding that straight into
// Quill silently swallows every line break. Turning each line into its own
// <p> is what actually preserves them once the text is HTML.
function textToHtml(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<p><br></p>'))
    .join('');
}

function defaultDateTimeLocal(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Owns the shared chrome (header + tab switcher) and which of the two screens
// is showing. Capture and Approve are two different jobs on the same draft
// data -- one produces it, one clears it out -- so they live side by side
// here instead of the capture flow needing to know anything about the queue.
function MainPanel({
  org,
  authMode,
  onOrgChange,
  onSwitchOrg,
  onSessionExpired,
}: {
  org: ActiveOrg;
  authMode: 'dev' | 'cognito' | null;
  onOrgChange: (org: ActiveOrg) => void;
  onSwitchOrg: () => void;
  onSessionExpired: () => void;
}) {
  const [tab, setTab] = useState<'capture' | 'queue'>('capture');
  const [showNotifications, setShowNotifications] = useState(false);
  // null = not loaded yet (badge stays hidden rather than showing a
  // momentary "0"). Refreshed on org switch and on a light poll while the
  // panel's open, since new notifications can arrive from app-user activity
  // (registrations, requests) with no action taken inside the extension.
  const [unreadCount, setUnreadCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const count = await fetchUnreadNotificationCount();
        if (!cancelled) setUnreadCount(count);
      } catch {
        // Silent -- badge just keeps its last known value rather than erroring
        // the whole panel over a background count check.
      }
    }
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [org.customerSlug, org.tenantSlug]);

  return (
    <div className="panel">
      <PanelHeader
        org={org}
        authMode={authMode}
        onOrgChange={onOrgChange}
        onSwitchOrg={onSwitchOrg}
        unreadCount={unreadCount}
        onOpenNotifications={() => setShowNotifications(true)}
      />
      {showNotifications ? (
        <NotificationsPanel
          key={`${org.customerSlug}:${org.tenantSlug}`}
          org={org}
          onBack={() => setShowNotifications(false)}
          onUnreadCountChange={setUnreadCount}
        />
      ) : (
        <div className="tab-row">
          <button
            className={`tab-btn${tab === 'capture' ? ' active' : ''}`}
            onClick={() => setTab('capture')}
          >
            Capture
          </button>
          <button
            className={`tab-btn${tab === 'queue' ? ' active' : ''}`}
            onClick={() => setTab('queue')}
          >
            Approve
          </button>
        </div>
      )}
      {/* Capture stays mounted while notifications are open so form work isn't lost. */}
      <div
        className="panel-tab-pane"
        style={{ display: !showNotifications && tab === 'capture' ? undefined : 'none' }}
      >
        <CapturePanelBody
          key={`${org.customerSlug}:${org.tenantSlug}`}
          org={org}
          onSessionExpired={onSessionExpired}
        />
      </div>
      <div
        className="panel-tab-pane"
        style={{ display: !showNotifications && tab === 'queue' ? undefined : 'none' }}
      >
        <QueuePanel key={`${org.customerSlug}:${org.tenantSlug}`} />
      </div>
    </div>
  );
}

function CapturePanelBody({
  org,
  onSessionExpired,
}: {
  org: ActiveOrg;
  onSessionExpired: () => void;
}) {
  const [contentType, setContentType] = useState<ContentKind>('impact_story');
  const [ctaType, setCtaType] = useState(CTA_TYPE_OPTIONS[0].value);

  const [capture, setCapture] = useState<CapturePayload | null>(null);
  const [title, setTitle] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [longDescription, setLongDescription] = useState('');
  // Drives the quote-box preview specifically. Tracked separately from `capture`
  // so a later image capture (which still updates `capture` for page context)
  // can't make the quote box disappear even though the text is still in the
  // fields below.
  const [quotedText, setQuotedText] = useState('');
  const [startDate, setStartDate] = useState(defaultDateTimeLocal(24));
  const [endDate, setEndDate] = useState(defaultDateTimeLocal(27));
  // Set whenever parseDateRange() finds (or fails to find) a date/time mention
  // in captured text, so it's obvious the Start/End fields were auto-filled
  // and worth double-checking rather than silently guessed.
  const [dateNote, setDateNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [successNote, setSuccessNote] = useState('');
  const [createdId, setCreatedId] = useState<string | null>(null);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState('');
  const persistTimerRef = useRef<number | null>(null);
  const skipNextPersistRef = useRef(false);

  // Only Event and CTA have a meaningful date range in their create DTOs
  // (Class dates come from a schedule rule/sessions, Impact Story has none).
  const showDateFields = contentType === 'event' || contentType === 'cta';

  function setPhoto(file: File | null) {
    setPhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
    setPhotoFile(file);
  }

  async function persistDraft() {
    if (skipNextPersistRef.current) return;
    const draft: SavedFormDraft = {
      orgKey: `${org.customerSlug}:${org.tenantSlug}`,
      contentType,
      ctaType,
      title,
      shortDescription,
      longDescription,
      quotedText,
      startDate,
      endDate,
      dateNote,
      photoNote,
      capture,
      savedAt: Date.now(),
    };
    if (photoFile) {
      try {
        Object.assign(draft, await fileToDraftPhoto(photoFile));
      } catch {
        /* photo too large or unreadable -- still save text fields */
      }
    }
    await saveFormDraft(draft);
  }

  function schedulePersistDraft() {
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      void persistDraft();
    }, 400);
  }

  async function restoreDraft(draft: SavedFormDraft) {
    skipNextPersistRef.current = true;
    setContentType(draft.contentType);
    setCtaType(draft.ctaType);
    setCapture(draft.capture);
    setTitle(draft.title);
    setShortDescription(draft.shortDescription);
    setLongDescription(draft.longDescription);
    setQuotedText(draft.quotedText);
    if (draft.startDate) setStartDate(draft.startDate);
    if (draft.endDate) setEndDate(draft.endDate);
    setDateNote(draft.dateNote);
    setPhotoNote(draft.photoNote);
    setStatus('idle');
    setCreatedId(null);
    const restoredPhoto = await photoFileFromDraft(draft);
    setPhoto(restoredPhoto);
    skipNextPersistRef.current = false;
  }

  // Wipes the whole form -- only appropriate when starting a genuinely new
  // capture session (panel first opening, or "Capture another" after a save).
  // Deliberately leaves contentType/ctaType alone if the user already changed
  // them, other than the very first mount where they're at their defaults anyway.
  function resetForm() {
    setCapture(null);
    setTitle('');
    setShortDescription('');
    setLongDescription('');
    setQuotedText('');
    setPhoto(null);
    setPhotoNote('');
    setDateNote('');
    setStatus('idle');
    setSuccessNote('');
    setCreatedId(null);
  }

  // Merges one incoming capture into whatever's already in the form, touching
  // only the fields relevant to that capture's kind. A 'selection' capture never
  // clears a photo that's already attached, and an 'image' capture never clears
  // text that's already been typed or captured -- this is what lets you select
  // text, send it, then right-click an image and send that too, and end up with
  // both in the same draft instead of the second capture wiping the first.
  async function applyCapture(resolved: CapturePayload | null) {
    if (!resolved) return;
    setCapture(resolved);
    setStatus('idle');
    setCreatedId(null);
    setTitle((prev) => prev || resolved.pageTitle || '');

    // Structured schema.org/Event data straight from the page (see content.ts)
    // is exact and unambiguous -- prefer it over guessing from free text
    // whenever it's there. This is page-level, not tied to what kind of
    // capture this was, so it applies before (and regardless of) the
    // kind-specific branches below -- a right-clicked flyer photo benefits
    // from this exactly as much as a text selection does.
    let usedStructuredDate = false;
    if (resolved.structuredStartDate) {
      const start = new Date(resolved.structuredStartDate);
      const { end, hasExplicitEnd } = withDefaultEnd(start, resolved.structuredEndDate);
      setStartDate(toDateTimeLocal(start));
      setEndDate(toDateTimeLocal(end));
      setDateNote(`From the page's own event data: ${formatDateRangeLabel(start, end, hasExplicitEnd)}.`);
      usedStructuredDate = true;
    }

    if (resolved.kind === 'selection' && resolved.text) {
      setQuotedText(resolved.text);
      setShortDescription(truncate(resolved.text, SHORT_DESCRIPTION_MAX));
      setLongDescription(textToHtml(resolved.text));

      // Only fall back to free-text guessing when the page didn't already
      // hand us an exact structured date -- it's strictly less reliable, and
      // real page text has plenty of ways to fool it (see dateParse.ts).
      if (!usedStructuredDate) {
        const parsed = parseDateRange(resolved.text);
        if (parsed) {
          setStartDate(toDateTimeLocal(parsed.start));
          setEndDate(toDateTimeLocal(parsed.end));
          setDateNote(`Detected from captured text: ${parsed.label}. Double-check before saving.`);
        } else {
          setDateNote('');
        }
      }
    } else if (resolved.kind === 'image' && resolved.imageUrl) {
      // Right-click "Send image to GrovLink" already has an image URL -- try to
      // pull the actual bytes automatically so there's nothing left to do. This
      // only works for images the page allows cross-origin reads on; a lot of
      // real sites don't, so this is a convenience layered on top of the manual
      // picker below, not a replacement for it.
      try {
        const resp = await fetch(resolved.imageUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        setPhoto(new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' }));
        setPhotoNote('');
      } catch {
        setPhotoNote("Couldn't auto-fetch that image (likely blocked cross-origin) — attach it manually below.");
      }
    }
  }

  // Only for a genuinely fresh session: reset everything, then pull in whatever
  // capture is pending (or fall back to a page-level capture of the active tab).
  async function loadFresh() {
    const savedDraft = await loadFormDraft(org.customerSlug, org.tenantSlug);
    if (savedDraft) {
      await restoreDraft(savedDraft);
      return;
    }
    resetForm();
    const staged = await takePendingCapture();
    const resolved = staged ?? (await getActiveTabCapture());
    await applyCapture(resolved);
  }

  useEffect(() => {
    loadFresh();

    // The mount-time load above only covers the panel opening fresh. If the panel
    // is already open when a new selection/image capture comes in, nothing
    // re-renders it -- so also listen for the background script writing a new
    // gl_capture and merge it in when that happens (not a full reload -- see
    // applyCapture). takePendingCapture() clears the key after reading it, which
    // fires this same listener again with newValue undefined -- ignored below so
    // it can't loop.
    function handleStorageChange(
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) {
      if (areaName !== 'session') return;
      if (changes.gl_capture && changes.gl_capture.newValue) {
        takePendingCapture().then(applyCapture);
      }
    }
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  useEffect(() => {
    schedulePersistDraft();
    return () => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    org.customerSlug,
    org.tenantSlug,
    contentType,
    ctaType,
    title,
    shortDescription,
    longDescription,
    quotedText,
    startDate,
    endDate,
    dateNote,
    photoNote,
    capture,
    photoFile,
  ]);

  async function handleSave() {
    setStatus('saving');
    setErrorMsg('');
    try {
      let stagingId: string | undefined;
      let photoWarning = '';
      if (photoFile) {
        stagingId = crypto.randomUUID();
        try {
          await uploadStagingPhoto(contentType, stagingId, photoFile, photoFile.name || 'photo.jpg');
        } catch (err) {
          photoWarning =
            err instanceof Error
              ? `Photo upload failed (${err.message}). Saving the draft without the photo — you can add it in the admin dashboard.`
              : 'Photo upload failed. Saving the draft without the photo.';
          stagingId = undefined;
        }
      }
      const typeLabel = CONTENT_TYPE_LABELS[contentType].toLowerCase();
      const result = await createDraft(contentType, {
        title: title.trim() || `Untitled ${typeLabel}`,
        shortDescription: truncate(shortDescription.trim(), SHORT_DESCRIPTION_MAX) || undefined,
        longDescription: longDescription.trim() || undefined,
        isActive: false,
        stagingId,
        ...(showDateFields
          ? {
              startDate: new Date(startDate).toISOString(),
              endDate: new Date(endDate).toISOString(),
            }
          : {}),
        ...(contentType === 'cta' ? { type: ctaType } : {}),
      });
      setCreatedId(result.id ?? null);
      await clearFormDraft();
      if (photoWarning) {
        setSuccessNote(photoWarning);
      } else {
        setSuccessNote('');
      }
      setStatus('success');
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        onSessionExpired();
        return;
      }
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="success-wrap">
        <div className="success-check">✓</div>
        <p className="success-title">{CONTENT_TYPE_LABELS[contentType]} saved as a draft</p>
        <p className="success-sub">id {createdId ?? '(unknown)'}</p>
        {successNote && <p className="helper-text" style={{ marginTop: 12 }}>{successNote}</p>}
        <button className="btn-secondary" style={{ marginTop: 0 }} onClick={loadFresh}>
          Capture another
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="panel-body">
        {capture && (
          <>
            {/* Reflects what's actually attached right now, not just the most
                recent capture event -- since captures merge, both can be true
                at once (e.g. text selected, then an image sent separately).
                Omitted entirely for a plain page-level capture (no selected
                text, no photo) -- there's nothing meaningful to report in
                that case beyond the page title/URL already shown below. */}
            {(quotedText || photoFile) && (
              <div className="kind-badge">
                {quotedText && 'Text captured'}
                {quotedText && photoFile && ' + '}
                {photoFile && 'Photo attached'}
              </div>
            )}
            <div className="thumb-row">
              {photoPreviewUrl ? (
                <img className="thumb-img" src={photoPreviewUrl} alt="" />
              ) : (
                <div className="thumb-img" />
              )}
              <div className="thumb-info">
                <p className="thumb-title">{capture.pageTitle || '(untitled page)'}</p>
                <p className="thumb-url">{capture.pageUrl}</p>
              </div>
            </div>
          </>
        )}

        <div className="field-group">
          <label className="field-label">Type</label>
          <div className="type-chips">
            {CONTENT_KINDS.map((kind) => (
              <span
                key={kind}
                className={`type-chip${contentType === kind ? ' active' : ''}`}
                onClick={() => setContentType(kind)}
              >
                {CONTENT_TYPE_LABELS[kind]}
              </span>
            ))}
          </div>
        </div>

        {capture && quotedText && (
          <div className="field-group">
            <label className="field-label">
              Captured text
              <span className="char-count"> · reference only, edit the fields below to change what's saved</span>
            </label>
            <div className="quote-box">&ldquo;{quotedText}&rdquo;</div>
          </div>
        )}

        <div className="field-group">
          <label className="field-label">Photo</label>
          {photoPreviewUrl ? (
            <div className="photo-preview-wrap">
              <img className="photo-preview" src={photoPreviewUrl} alt="" />
              <button className="link-button" onClick={() => setPhoto(null)}>
                remove
              </button>
            </div>
          ) : (
            <>
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="field-input"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
              {photoNote && <p className="helper-text" style={{ marginTop: 6, textAlign: 'left' }}>{photoNote}</p>}
            </>
          )}
        </div>

        {contentType === 'cta' && (
          <div className="field-group">
            <label className="field-label">CTA type</label>
            <select className="field-select" value={ctaType} onChange={(e) => setCtaType(e.target.value)}>
              {CTA_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field-group">
          <label className="field-label">Title</label>
          <input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        {showDateFields && (
          <div className="field-group">
            <div className="field-group">
              <label className="field-label">Start</label>
              <input
                className="field-input"
                type="datetime-local"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setDateNote('');
                }}
              />
            </div>
            <div className="field-group">
              <label className="field-label">End</label>
              <input
                className="field-input"
                type="datetime-local"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setDateNote('');
                }}
              />
            </div>
            {dateNote && <p className="helper-text" style={{ marginTop: 6, textAlign: 'left' }}>{dateNote}</p>}
          </div>
        )}

        <div className="field-group">
          <label className="field-label">
            Short description
            <span className="char-count"> · {shortDescription.length}/{SHORT_DESCRIPTION_MAX}</span>
          </label>
          <textarea
            className="field-textarea"
            rows={2}
            maxLength={SHORT_DESCRIPTION_MAX}
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
          />
        </div>

        <div className="field-group">
          <label className="field-label">Long description</label>
          <RichTextEditor
            value={longDescription}
            onChange={setLongDescription}
            placeholder="No limit here -- the full captured text goes by default."
          />
        </div>
      </div>
      <CaptureFooter status={status} errorMsg={errorMsg} onSave={handleSave} />
    </>
  );
}

// Split out of the scrollable body above so it can stay pinned to the bottom
// of the panel (see .panel-footer in style.css) instead of scrolling away
// under a long form -- there's no worse feeling than filling out a form and
// having to scroll to find the Save button again.
function CaptureFooter({
  status,
  errorMsg,
  onSave,
}: {
  status: 'idle' | 'saving' | 'success' | 'error';
  errorMsg: string;
  onSave: () => void;
}) {
  return (
    <div className="panel-footer">
      <button className="btn-primary" onClick={onSave} disabled={status === 'saving'}>
        {status === 'saving' ? 'Saving…' : 'Save as draft'}
      </button>
      <p className="footer-helper-text">Nothing goes live until someone approves it in the Approve tab.</p>
      {status === 'error' && <div className="form-error">{errorMsg}</div>}
    </div>
  );
}

// The approval queue: everything created as a draft (isActive: false) across
// all four content kinds, in one combined list, with one-tap approve/discard.
// This is what makes "Save as draft" in the capture tab a complete loop rather
// than a dead end -- without this, nothing the clipper creates ever goes live.
function QueuePanel() {
  const [items, setItems] = useState<DraftItem[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const drafts = await fetchDrafts();
      setItems(drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function keyFor(item: DraftItem) {
    return `${item.kind}:${item.id}`;
  }

  async function handleApprove(item: DraftItem) {
    setBusyKey(keyFor(item));
    setError('');
    try {
      await approveDraft(item.kind, item.id);
      setItems((prev) => (prev ?? []).filter((i) => !(i.kind === item.kind && i.id === item.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDiscard(item: DraftItem) {
    setBusyKey(keyFor(item));
    setError('');
    try {
      await discardDraft(item.kind, item.id);
      setItems((prev) => (prev ?? []).filter((i) => !(i.kind === item.kind && i.id === item.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="panel-body">
      <div className="queue-toolbar">
        <p className="queue-count">
          {items === null ? 'Loading…' : `${items.length} draft${items.length === 1 ? '' : 's'} waiting`}
        </p>
        <button className="link-button" onClick={load} disabled={loading}>
          refresh
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {items && items.length === 0 && !error && (
        <p className="helper-text" style={{ marginTop: 20 }}>
          Nothing waiting on approval right now.
        </p>
      )}

      <div className="queue-list">
        {(items ?? []).map((item) => {
          const busy = busyKey === keyFor(item);
          return (
            <div className="queue-row" key={keyFor(item)}>
              <div className="queue-row-main">
                <span className="kind-badge queue-kind-badge">{CONTENT_TYPE_LABELS[item.kind]}</span>
                <p className="thumb-title">{item.title}</p>
                {item.shortDescription && <p className="queue-row-desc">{item.shortDescription}</p>}
              </div>
              <div className="queue-row-actions">
                <button
                  className="btn-approve"
                  onClick={() => handleApprove(item)}
                  disabled={busy}
                >
                  {busy ? '…' : 'Approve'}
                </button>
                <button
                  className="btn-discard"
                  onClick={() => handleDiscard(item)}
                  disabled={busy}
                >
                  Discard
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PanelHeader({
  org,
  authMode,
  onOrgChange,
  onSwitchOrg,
  unreadCount,
  onOpenNotifications,
}: {
  org: ActiveOrg;
  authMode: 'dev' | 'cognito' | null;
  onOrgChange: (org: ActiveOrg) => void;
  onSwitchOrg: () => void;
  unreadCount: number | null;
  onOpenNotifications: () => void;
}) {
  return (
    <div className="panel-header">
      <OrgSwitcherPill org={org} authMode={authMode} onOrgChange={onOrgChange} />
      <div className="header-actions">
        <NotificationBell count={unreadCount} onClick={onOpenNotifications} />
        <button type="button" className="icon-button" onClick={onSwitchOrg} aria-label="Log out" title="Log out">
          <LogOut size={17} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

// Plain SVG bell (no icon library in play here) with a small unread-count
// badge. count === null means "haven't loaded yet" -- badge stays hidden
// rather than flashing a 0 before the first fetch resolves.
function NotificationBell({ count, onClick }: { count: number | null; onClick: () => void }) {
  return (
    <button type="button" className="bell-button" onClick={onClick} aria-label="Notifications">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {!!count && <span className="bell-badge">{count > 99 ? '99+' : count}</span>}
    </button>
  );
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// Sorts already-viewed items (locally viewed OR genuinely processed in the
// admin app, i.e. readAt is set) after still-unviewed ones, otherwise
// leaving relative order alone (stable sort) -- this is what makes opening
// something visually "sink" it below the still-unviewed items instead of
// jumping around unpredictably.
function sortByViewed(list: AdminNotification[], viewedIds: Set<string>): AdminNotification[] {
  const isViewed = (n: AdminNotification) => !!n.readAt || viewedIds.has(n.id);
  return [...list].sort((a, b) => (isViewed(a) ? 1 : 0) - (isViewed(b) ? 1 : 0));
}

// Opened from the bell in the header. Read-only against the backend by
// design: the extension never calls the mark-read/unread, approve, or deny
// endpoints -- some notification types (voucher_request, volunteer_interest)
// have real side effects behind those, and more importantly, the admin
// dashboard is the shared, authoritative place notifications get processed
// for everyone on staff. If the extension marked things read on the shared
// backend record, a notification opened here would look already-handled (and
// vanish from unreadOnly views) to every other admin user too, before anyone
// actually did anything with it.
//
// So "read" here is purely local (see lib/notificationViews.ts): the
// "open in app" icon opens the relevant admin-dashboard page in a new tab and
// remembers, in this browser only, that this person has looked at it --
// which fades it and sinks it in this list, without touching readAt.
function NotificationsPanel({
  org,
  onBack,
  onUnreadCountChange,
}: {
  org: ActiveOrg;
  onBack: () => void;
  onUnreadCountChange: (count: number) => void;
}) {
  const [items, setItems] = useState<AdminNotification[] | null>(null);
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [list, viewed] = await Promise.all([
        fetchNotifications({ limit: 50 }),
        getViewedNotificationIds(org),
      ]);
      setViewedIds(viewed);
      setItems(sortByViewed(list, viewed));
      // Backend truth (readAt), not local-viewed -- the badge in the header
      // reflects what's genuinely unprocessed, and only changes when
      // something is actually handled in the admin dashboard.
      onUnreadCountChange(list.filter((n) => !n.readAt).length);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleOpenInApp(item: AdminNotification) {
    // Open first, synchronously with the click, so Chrome doesn't treat the
    // tab creation as unrelated to a user gesture and block it.
    window.open(notificationAppUrl(item), '_blank', 'noopener');
    if (item.readAt || viewedIds.has(item.id)) return;

    setBusyId(item.id);
    setError('');
    try {
      await markNotificationViewedLocally(org, item.id);
      const nextViewed = new Set(viewedIds);
      nextViewed.add(item.id);
      setViewedIds(nextViewed);
      setItems((prev) => sortByViewed(prev ?? [], nextViewed));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="panel-body">
      <div className="queue-toolbar">
        <button type="button" className="icon-button" onClick={onBack} aria-label="Back" title="Back">
          <ArrowLeft size={17} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={load}
          disabled={loading}
          aria-label="Refresh"
          title="Refresh"
        >
          <RefreshCw size={16} strokeWidth={2} className={loading ? 'spin' : undefined} />
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {items && items.length === 0 && !error && (
        <p className="helper-text" style={{ marginTop: 20 }}>
          No notifications yet.
        </p>
      )}

      <div className="queue-list">
        {(items ?? []).map((item) => {
          const busy = busyId === item.id;
          const viewed = !!item.readAt || viewedIds.has(item.id);
          return (
            <div key={item.id} className={`notification-row${viewed ? '' : ' unread'}`}>
              {!viewed && <span className="notification-dot" />}
              <div className="notification-row-main">
                <p className="thumb-title">{item.title}</p>
                {item.body && <p className="queue-row-desc">{item.body}</p>}
                <p className="notification-meta">
                  {item.tenant?.name ? `${item.tenant.name} · ` : ''}
                  {relativeTime(item.createdAt)}
                </p>
              </div>
              <button
                type="button"
                className="icon-button notification-open-button"
                onClick={() => handleOpenInApp(item)}
                disabled={busy}
                aria-label="Open in GrovLink"
                title="Open in GrovLink"
              >
                <ExternalLink size={15} strokeWidth={2} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The org pill in the header. For dev-mode sessions (or a Cognito user who
// only has access to one customer/tenant combo) it's just a label -- there's
// nothing to switch to. For a Cognito user with more than one accessible
// org, it becomes a button that opens a dropdown to switch without a full
// sign-out, walking the same /my-customers -> /my-tenants API as the
// post-login OrgPicker.
function OrgSwitcherPill({
  org,
  authMode,
  onOrgChange,
}: {
  org: ActiveOrg;
  authMode: 'dev' | 'cognito' | null;
  onOrgChange: (org: ActiveOrg) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState<OrgOption[] | null>(null);
  // Prefetched only when there's exactly one customer -- lets a
  // single-affiliate, multi-location user jump straight to the tenant list
  // instead of clicking through a customer list with one entry in it.
  const [soleCustomerTenants, setSoleCustomerTenants] = useState<OrgOption[] | null>(null);
  const [drillCustomer, setDrillCustomer] = useState<OrgOption | null>(null);
  const [drillTenants, setDrillTenants] = useState<OrgOption[] | null>(null);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [error, setError] = useState('');

  // Silent, best-effort prefetch -- this is a progressive-enhancement
  // affordance on top of a working pill, not core functionality worth
  // surfacing an error state for.
  useEffect(() => {
    if (authMode !== 'cognito') return;
    (async () => {
      try {
        const list = await fetchMyCustomers();
        setCustomers(list);
        if (list.length === 1) {
          const tenants = await fetchMyTenants(list[0].slug);
          setSoleCustomerTenants(tenants);
        }
      } catch {
        // Leave customers null -- pill just renders non-interactive below.
      }
    })();
  }, [authMode]);

  const soleCustomer = customers?.length === 1 ? customers[0] : null;
  const hasMultipleOrgs =
    (customers?.length ?? 0) > 1 || (soleCustomer != null && (soleCustomerTenants?.length ?? 0) > 1);

  async function handlePillClick() {
    if (!hasMultipleOrgs) return;
    setError('');
    setOpen(true);
    if (soleCustomer) {
      setDrillCustomer(soleCustomer);
      setDrillTenants(soleCustomerTenants);
    } else {
      setDrillCustomer(null);
      setDrillTenants(null);
    }
  }

  async function chooseCustomer(customer: OrgOption) {
    setDrillCustomer(customer);
    setDrillTenants(null);
    setLoadingTenants(true);
    setError('');
    try {
      const tenants = await fetchMyTenants(customer.slug);
      setDrillTenants(tenants);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingTenants(false);
    }
  }

  async function chooseTenant(customer: OrgOption, tenant: OrgOption) {
    const ctx: OrgContext = {
      customerSlug: customer.slug,
      tenantSlug: tenant.slug,
      customerName: customer.name,
      tenantName: tenant.name,
    };
    await setOrgContext(ctx);
    onOrgChange(ctx);
    setOpen(false);
  }

  return (
    <div className="org-switcher">
      <button
        type="button"
        className={`org-pill${hasMultipleOrgs ? ' org-pill-clickable' : ''}`}
        onClick={handlePillClick}
      >
        {formatOrgLabel(org)}
        {hasMultipleOrgs && <span className="org-pill-caret">▾</span>}
      </button>
      {open && (
        <>
          {/* Catches outside clicks to close the dropdown -- sits under the
              dropdown itself but over everything else. */}
          <div className="org-dropdown-backdrop" onClick={() => setOpen(false)} />
          <div className="org-dropdown">
            {!drillCustomer &&
              customers?.map((c) => (
                <div key={c.id} className="seed-user-row" onClick={() => chooseCustomer(c)}>
                  <span>{c.name}</span>
                </div>
              ))}
            {drillCustomer && (
              <>
                {loadingTenants && <div className="seed-user-row">Loading…</div>}
                {drillTenants?.map((t) => (
                  <div key={t.id} className="seed-user-row" onClick={() => chooseTenant(drillCustomer, t)}>
                    <span>{t.name}</span>
                  </div>
                ))}
              </>
            )}
            {error && (
              <div className="login-error" style={{ margin: 8 }}>
                {error}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
