import { useEffect, useState } from 'react';
import { DevCreds, clearDevCreds, getDevCreds, setDevCreds } from '../../lib/devAuth';
import { CapturePayload, getActiveTabCapture, takePendingCapture } from '../../lib/capture';
import {
  CONTENT_KINDS,
  CONTENT_TYPE_LABELS,
  CTA_TYPE_OPTIONS,
  ContentKind,
} from '../../lib/contentTypes';
import {
  DraftItem,
  SeedUser,
  approveDraft,
  createDraft,
  discardDraft,
  fetchDrafts,
  fetchSeedUsers,
  uploadStagingPhoto,
} from '../../lib/api';
import { formatDateRangeLabel, parseDateRange, toDateTimeLocal, withDefaultEnd } from '../../lib/dateParse';
import RichTextEditor from './RichTextEditor';

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
    <MainPanel
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
        <img className="login-mark" src={chrome.runtime.getURL('grovlink-logo.svg')} alt="GrovLink" />
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
function MainPanel({ creds, onSwitchOrg }: { creds: DevCreds; onSwitchOrg: () => void }) {
  const [tab, setTab] = useState<'capture' | 'queue'>('capture');

  return (
    <div className="panel">
      <PanelHeader creds={creds} onSwitchOrg={onSwitchOrg} />
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
      {tab === 'capture' ? <CapturePanelBody /> : <QueuePanel />}
    </div>
  );
}

function CapturePanelBody() {
  const [contentType, setContentType] = useState<ContentKind>('event');
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
  const [createdId, setCreatedId] = useState<string | null>(null);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState('');

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
        setPhoto(new File([blob], 'captured-image', { type: blob.type || 'image/jpeg' }));
        setPhotoNote('');
      } catch {
        setPhotoNote("Couldn't auto-fetch that image (likely blocked cross-origin) — attach it manually below.");
      }
    }
  }

  // Only for a genuinely fresh session: reset everything, then pull in whatever
  // capture is pending (or fall back to a page-level capture of the active tab).
  async function loadFresh() {
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

  async function handleSave() {
    setStatus('saving');
    setErrorMsg('');
    try {
      // Generated fresh here instead of held in state -- it only needs to exist
      // for the moment of upload, so no capture along the way has to worry about
      // resetting or preserving it.
      const stagingId = crypto.randomUUID();
      if (photoFile) {
        await uploadStagingPhoto(contentType, stagingId, photoFile, photoFile.name || 'photo.jpg');
      }
      const typeLabel = CONTENT_TYPE_LABELS[contentType].toLowerCase();
      const result = await createDraft(contentType, {
        title: title.trim() || `Untitled ${typeLabel}`,
        shortDescription: truncate(shortDescription.trim(), SHORT_DESCRIPTION_MAX) || undefined,
        longDescription: longDescription.trim() || undefined,
        isActive: false,
        stagingId: photoFile ? stagingId : undefined,
        ...(showDateFields
          ? {
              startDate: new Date(startDate).toISOString(),
              endDate: new Date(endDate).toISOString(),
            }
          : {}),
        ...(contentType === 'cta' ? { type: ctaType } : {}),
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
      <div className="success-wrap">
        <div className="success-check">✓</div>
        <p className="success-title">{CONTENT_TYPE_LABELS[contentType]} saved as a draft</p>
        <p className="success-sub">id {createdId ?? '(unknown)'}</p>
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
                at once (e.g. text selected, then an image sent separately). */}
            <div className="kind-badge">
              {quotedText && 'Text captured'}
              {quotedText && photoFile && ' + '}
              {photoFile && 'Photo attached'}
              {!quotedText && !photoFile && 'Captured: full page'}
            </div>
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
      <p className="helper-text">Nothing goes live until someone approves it in the Approve tab.</p>
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
