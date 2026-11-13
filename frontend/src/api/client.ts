// Typed fetch client for the Kopichat backend. Types, createClient, chipAction, ApiError; nothing else.

export type Phase = 'consent' | 'overall' | 'chat' | 'summary' | 'receipt' | 'deleted' | 'done' | 'unavailable';

export type DimState = {
  score: 0 | 1 | 2;
  state: 'provided' | 'explicit_none' | 'not_applicable' | 'declined' | 'not_asked';
  /** Check name to the student's quoted span, or null when not given. Keys keep the order received. */
  checks: Record<string, string | null>;
};

// The server's conversation state. The screens read `phase` and little else; the system view reads the rest.
export type ServerState = {
  phase?: Phase;
  dims?: Record<string, DimState>;
  interpretation?: { cause: string | null; uncertain: boolean };
  resolved_dates?: Record<string, string>;
  follow_ups_used?: number;
  last_target?: string | null;
  pending_question?: string | null;
  approved?: boolean;
  [key: string]: unknown;
};

export type Consultation = {
  id: string;
  title: string;
  why: string;
  closing_date: string;
  overall_options: string[];
  /** The short name a link carries (?topic=study). Older servers leave it out. */
  topic?: string;
  /** The overall question in this consultation's words. Older servers leave it out. */
  overall_question?: string;
};

/** Who sees an approved account's words: NUSSU's team only, or also other students on the noticeboard. */
export type Visibility = 'nussu' | 'board';
export const DEFAULT_VISIBILITY: Visibility = 'nussu';

/** A session that has already sent its account also carries what the receipt needs. */
export type SessionInfo = {
  consultation: Consultation;
  state: ServerState;
  llm: string;
  account?: { id: string; ref_code: string };
  aggregate?: Aggregate;
  summary_rows?: SummaryRow[];
};

export type TurnResult = {
  reply: string;
  chips: string[];
  options: string[];
  state: ServerState;
  counter: string;
  phase: Phase;
  /** The reply is the server's unavailable notice (the model could not be reached or is not configured). */
  unavailable: boolean;
};

export type SummaryRow = {
  key: string;
  label: string;
  text: string;
  status: 'quoted' | 'not_given' | 'skipped' | 'explicit_none' | 'edited';
};

export type Aggregate = {
  provisional: true;
  theme: string;
  /** The student's own choice, said back on the receipt. Older servers leave it out. */
  visibility?: Visibility;
  /** The account is waiting for a reviewer: classification was unsure or fell back. */
  needs_review?: boolean;
  /** `pending`: a new group a reviewer has not named yet; its name reads "New group, pending review". */
  group: { name: string | null; pending?: boolean; count: number; others: { id: string; excerpt: string }[] };
  contributors: number;
  seeds: number;
  differing: { id: string; excerpt: string; note: string; theme?: string }[];
  /** Other accounts in the consultation, for the receipt's noticeboard. Older servers leave it out. */
  board?: { id: string; excerpt: string; theme: string }[];
  coverage: { how_often: { said: number; of: number } };
  closing_line: string;
};

/** The written fallback's answers, by dimension. Empty answers are left out. */
export type FallbackAnswers = Partial<Record<'q1_what' | 'q2_often' | 'q3_effect' | 'q4_basis' | 'q5_better', string>>;

export type SubmitResult = { account: { id: string; ref_code: string }; aggregate: Aggregate };

/** NUSSU reviewer view: one group in the list. `id` is "ungrouped" for the accounts no group holds yet. */
export type ReviewGroup = { id: string; name: string; theme: string; pending: boolean; count: number; has_art: boolean };

/** Where a consultation's accounts came from, for the reviewer page's head. Older servers leave it out. */
export type ReviewContext = {
  opens: string | null;
  closes: string;
  closes_note: string | null;
  reach: string;
  /** Accounts still in the consultation (withdrawn ones left out), and how many of them are fictional seeds. */
  accounts: number;
  seeds: number;
};

/** One caption line: a stored field quoted as the student left it, or why there is no quote. */
export type StripLine = { who: string; quote: string | null; note: string | null };
export type StripSection = { label: string | null; said: StripLine[]; count: { said: number; of: number | null } };
export type StripArt = { src: string; alt: string; shows?: string };
export type StripPanel = { key: string; title: string; art: StripArt | null; sections: StripSection[] };
export type Strip = {
  group: { id: string; name: string; theme: string; pending: boolean; count: number };
  cover: StripArt | null;
  panels: StripPanel[];
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Chip label -> action sent to /api/turn. Chips are never sent as message text.
const CHIP_ACTIONS: Record<string, string> = {
  'Skip this question': 'skip',
  'Why do you ask?': 'why',
  'Is this anonymous?': 'anonymous',
  'Stop and delete': 'stop',
  'Stop': 'stop',
  'Delete': 'delete',
  'Check my summary': 'finish',
};

/** The action for a chip label, or null when the chip only dismisses a prompt (no request is made). */
export function chipAction(label: string): string | null {
  return CHIP_ACTIONS[label] ?? null;
}

const SESSION_KEY = 'kopichat.session';

/** What the link asked for: which consultation (?topic=study) and, in the user study, a participant code (?p=P03). */
export type Link = { topic: string | null; participant: string | null };

export function linkFrom(search: string): Link {
  const params = new URLSearchParams(search);
  const clean = (value: string | null) => (value ?? '').trim() || null;
  return { topic: clean(params.get('topic')), participant: clean(params.get('p')) };
}

/** The link this page was opened with. Outside a browser there is none. */
export function currentLink(): Link {
  return linkFrom(typeof globalThis.location === 'object' ? globalThis.location.search : '');
}

/** Where a session id is kept. A link with a topic or a participant code gets its own session, so one phone can open
 * both consultations, and a second participant on the same phone never lands on the first one's receipt. */
export function sessionKey(base: string, link: Link): string {
  if (link.topic === null && link.participant === null) return base;
  return `${base}.${link.topic ?? ''}.${link.participant ?? ''}`;
}

/** A random id. `crypto.randomUUID` exists only on https and localhost; a phone that opens the app at the laptop's
 * address over plain http still has `getRandomValues`, so the id is built from that. */
export function newId(c: Pick<Crypto, 'getRandomValues'> & { randomUUID?: () => string } = globalThis.crypto): string {
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = c.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A new session id, remembered for this tab when storage allows. */
export function freshSessionId(key: string = sessionKey(SESSION_KEY, currentLink())): string {
  const fresh = newId();
  try {
    globalThis.sessionStorage?.setItem(key, fresh);
  } catch {
    // storage blocked: the id lives in memory only
  }
  return fresh;
}

export function storedSessionId(key: string = sessionKey(SESSION_KEY, currentLink())): string {
  try {
    const existing = globalThis.sessionStorage?.getItem(key);
    if (existing) return existing;
  } catch {
    // storage blocked: fall through to a fresh id
  }
  return freshSessionId(key);
}

async function failureMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.detail === 'string') return body.detail;
  } catch {
    // not JSON: fall through
  }
  return `Request failed (${res.status})`;
}

export function createClient(fetchImpl: typeof fetch = fetch, initialSessionId: string = storedSessionId(), link: Link = currentLink()) {
  let sessionId = initialSessionId;
  const topicQuery = link.topic === null ? '' : `?topic=${encodeURIComponent(link.topic)}`;
  // Sent only when the link carried them, so a plain link makes the same request as before.
  const opening: Record<string, unknown> = {};
  if (link.topic !== null) opening.topic = link.topic;
  if (link.participant !== null) opening.participant = link.participant;
  async function send<T>(method: string, url: string, body?: Record<string, unknown>): Promise<T> {
    const init: RequestInit = { method };
    if (body) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const res = await fetchImpl(url, init);
    if (!res.ok) throw new ApiError(res.status, await failureMessage(res));
    return (await res.json()) as T;
  }
  const post = <T>(url: string, body: Record<string, unknown>) => send<T>('POST', url, { session_id: sessionId, ...body });
  const summaryUrl = () => `/api/summary/${encodeURIComponent(sessionId)}`;

  return {
    get sessionId() {
      return sessionId;
    },
    /** Forget this session and use a new id from now on. Nothing on the server is touched. */
    renew: (next: string = freshSessionId()) => {
      sessionId = next;
    },
    session: () => post<SessionInfo>('/api/session', opening),
    consent: () => post<{ phase: Phase; state: ServerState }>('/api/consent', { agreed: true }),
    overall: (value: string | null) => post<TurnResult>('/api/overall', { value }),
    turn(message?: string, action?: string) {
      const body: Record<string, unknown> = {};
      if (message !== undefined) body.message = message;
      if (action !== undefined) body.action = action;
      return post<TurnResult>('/api/turn', body);
    },
    /** The written fallback in one request: the answers go straight to the summary, with no model involved. */
    fallback: (answers: FallbackAnswers) => post<TurnResult>('/api/turn', { action: 'fallback', answers }),
    summary: () => send<{ rows: SummaryRow[]; approved: boolean }>('GET', summaryUrl()),
    editSummary: (key: string, text: string) => send<{ rows: SummaryRow[] }>('PATCH', summaryUrl(), { key, text }),
    // Only the summary screen's approve handler may call this.
    submit: (visibility?: Visibility) =>
      post<SubmitResult>('/api/submit', visibility === undefined ? { approved: true } : { approved: true, visibility }),
    withdraw: () => post<{ ok: true }>('/api/withdraw', {}),
    contact: (contact: string) => post<{ ok: true }>('/api/contact', { contact }),
    reviewGroups: () => send<{ consultation: Consultation; groups: ReviewGroup[]; context?: ReviewContext }>('GET', `/api/review/groups${topicQuery}`),
    reviewStrip: (groupId: string) => send<Strip>('GET', `/api/review/strip/${encodeURIComponent(groupId)}${topicQuery}`),
    reviewLocate: (ref: string) => send<{ ref: string; group_id: string }>('GET', `/api/review/locate/${encodeURIComponent(ref)}`),
    /** The demo reset: restores the seed accounts and clears every session. Only the demo bar may call this. */
    reset: () => post<{ ok: true }>('/api/admin/reset', {}),
  };
}

// --- The matched form (user study): the same consultation and questions as fixed fields, with no model. ---

export type FormField = { dim: string; key: string; label: string; hint: string };
export type FormSent = { ref_code: string; rows: SummaryRow[]; withdrawn: boolean };
export type FormInfo = { consultation: Consultation; fields: FormField[]; submission?: FormSent };
export type FormSubmission = { overall: string | null; answers: Record<string, string>; edited: string[] };

const FORM_SESSION_KEY = 'kopichat.form';

export function createFormClient(
  fetchImpl: typeof fetch = fetch,
  link: Link = currentLink(),
  sessionId: string = storedSessionId(sessionKey(FORM_SESSION_KEY, link)),
) {
  async function post<T>(url: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, ...body }),
    });
    if (!res.ok) throw new ApiError(res.status, await failureMessage(res));
    return (await res.json()) as T;
  }
  const opening: Record<string, unknown> = {};
  if (link.topic !== null) opening.topic = link.topic;
  if (link.participant !== null) opening.participant = link.participant;

  return {
    sessionId,
    /** Opens the form: the server notes the time once, and returns what was already sent if this session sent one. */
    open: () => post<FormInfo>('/api/form/open', opening),
    // Only the review page's Submit may call this.
    submit: (s: FormSubmission) => post<FormSent>('/api/form/submit', { confirmed: true, ...s }),
    withdraw: () => post<{ ok: true }>('/api/form/withdraw', {}),
  };
}
