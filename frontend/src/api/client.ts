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
};

export type SessionInfo = { consultation: Consultation; state: ServerState; llm: string };

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
  group: { name: string | null; count: number; others: { id: string; excerpt: string }[] };
  contributors: number;
  seeds: number;
  differing: { id: string; excerpt: string; note: string }[];
  coverage: { how_often: { said: number; of: number } };
  closing_line: string;
};

export type SubmitResult = { account: { id: string; ref_code: string }; aggregate: Aggregate };

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

function storedSessionId(): string {
  try {
    const existing = globalThis.sessionStorage?.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    globalThis.sessionStorage?.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
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

export function createClient(fetchImpl: typeof fetch = fetch, sessionId: string = storedSessionId()) {
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
  const summaryUrl = `/api/summary/${encodeURIComponent(sessionId)}`;

  return {
    sessionId,
    session: () => post<SessionInfo>('/api/session', {}),
    consent: () => post<{ phase: Phase; state: ServerState }>('/api/consent', { agreed: true }),
    overall: (value: string | null) => post<TurnResult>('/api/overall', { value }),
    turn(message?: string, action?: string) {
      const body: Record<string, unknown> = {};
      if (message !== undefined) body.message = message;
      if (action !== undefined) body.action = action;
      return post<TurnResult>('/api/turn', body);
    },
    summary: () => send<{ rows: SummaryRow[]; approved: boolean }>('GET', summaryUrl),
    editSummary: (key: string, text: string) => send<{ rows: SummaryRow[] }>('PATCH', summaryUrl, { key, text }),
    // Only the summary screen's approve handler may call this.
    submit: () => post<SubmitResult>('/api/submit', { approved: true }),
    withdraw: () => post<{ ok: true }>('/api/withdraw', {}),
    contact: (contact: string) => post<{ ok: true }>('/api/contact', { contact }),
    reset: () => post<{ ok: true }>('/api/admin/reset', {}),
  };
}
