import { useCallback, useEffect, useReducer, useRef } from 'react';
import { ApiError, chipAction } from './api/client.ts';
import { DEFAULT_CHIPS } from './chips.ts';
import type { Aggregate, Consultation, Phase, ServerState, SummaryRow, TurnResult, createClient } from './api/client.ts';

export type Client = ReturnType<typeof createClient>;

const UNREACHABLE_TEXT = 'Could not reach the assistant. Your message was not sent.';

// Chips with no request behind them: they only put the pending question and the default chips back.
const RESTORE_LABELS = new Set(['Keep draft', 'Continue without the name', 'Continue with my general experience', 'None of these']);

/** True once the server has paused the questions after a crisis disclosure. */
export function isCrisis(server: ServerState | null | undefined): boolean {
  return server?.stopped === 'crisis';
}

export type ThreadItem = { role: 'agent' | 'student' | 'status'; text: string };

export type SessionState = {
  phase: Phase;
  consultation: Consultation | null;
  overall: string | null;
  thread: ThreadItem[];
  chips: string[];
  options: string[];
  counter: string;
  serverState: ServerState | null;
  /** The server state before the latest turn, so the system view can mark what changed. */
  previousServerState: ServerState | null;
  summary: SummaryRow[];
  account: { id: string; ref_code: string } | null;
  aggregate: Aggregate | null;
  busy: boolean;
  error: string | null;
  /** Unavailable replies in a row; two bring up the written fallback. */
  unavailableStreak: number;
  /** A message that did not go through, handed back to the composer. Cleared once the composer has taken it. */
  draft: { text: string } | null;
  /** Indices of the written fallback's answers the server has already taken. */
  fallbackPosted: number[];
};

export type SessionEvent =
  | { type: 'loaded'; consultation: Consultation; phase?: Phase; serverState?: ServerState }
  | { type: 'phase'; phase: Phase }
  | { type: 'overall'; value: string | null }
  | { type: 'student'; text: string }
  | { type: 'turn'; result: TurnResult }
  | { type: 'busy'; value: boolean }
  | { type: 'unreachable' }
  | { type: 'rejected'; message: string }
  | { type: 'discardStudent'; text: string }
  | { type: 'restoreDraft'; text: string }
  | { type: 'draftTaken' }
  | { type: 'fallbackPosted'; index: number }
  | { type: 'restore' }
  | { type: 'summary'; rows: SummaryRow[] }
  | { type: 'submitted'; account: { id: string; ref_code: string }; aggregate: Aggregate }
  | { type: 'error'; message: string };

export const initialSession: SessionState = {
  phase: 'consent',
  consultation: null,
  overall: null,
  thread: [],
  chips: [],
  options: [],
  counter: '',
  serverState: null,
  previousServerState: null,
  summary: [],
  account: null,
  aggregate: null,
  busy: false,
  error: null,
  unavailableStreak: 0,
  draft: null,
  fallbackPosted: [],
};

export function sessionReducer(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case 'loaded': {
      const server = event.serverState ?? null;
      const phase = event.phase ?? server?.phase ?? 'consent';
      const overall = typeof server?.overall === 'string' ? server.overall : null;
      // A reload mid-chat: the student's answers and the question still waiting are rebuilt from the server.
      const resumed = phase === 'chat' && server !== null;
      const pending = typeof server?.pending_question === 'string' && server.pending_question !== '' ? server.pending_question : null;
      const thread: ThreadItem[] = [];
      if (resumed) {
        const transcript = Array.isArray(server.transcript) ? server.transcript : [];
        for (const text of transcript) if (typeof text === 'string') thread.push({ role: 'student', text });
        if (pending !== null) thread.push({ role: 'agent', text: pending });
      }
      return {
        ...initialSession,
        consultation: event.consultation,
        phase,
        overall,
        thread,
        chips: resumed && pending !== null ? DEFAULT_CHIPS : [],
        counter: typeof server?.counter === 'string' ? server.counter : '',
        serverState: server,
      };
    }
    case 'phase':
      return { ...state, phase: event.phase, error: null };
    case 'overall':
      return { ...state, overall: event.value };
    case 'student':
      return { ...state, thread: [...state.thread, { role: 'student', text: event.text }], chips: [], options: [] };
    case 'turn': {
      const { result } = event;
      return {
        ...state,
        phase: result.unavailable ? 'unavailable' : result.phase,
        unavailableStreak: result.unavailable ? state.unavailableStreak + 1 : 0,
        // An unavailable notice is the system speaking about itself, not a question: it is a status line.
        thread: [...state.thread, { role: result.unavailable ? 'status' : 'agent', text: result.reply }],
        chips: result.chips,
        options: result.options,
        counter: result.counter,
        previousServerState: state.serverState,
        serverState: result.state,
        error: null,
      };
    }
    case 'unreachable':
      return {
        ...state,
        phase: 'unavailable',
        unavailableStreak: state.unavailableStreak + 1,
        thread: [...state.thread, { role: 'status', text: UNREACHABLE_TEXT }],
        chips: state.chips.length > 0 ? state.chips : DEFAULT_CHIPS,
        options: [],
        error: null,
      };
    case 'rejected':
      return {
        ...state,
        thread: [...state.thread, { role: 'status', text: event.message }],
        chips: state.chips.length > 0 ? state.chips : DEFAULT_CHIPS,
        error: null,
      };
    case 'discardStudent': {
      let at = -1;
      state.thread.forEach((item, i) => {
        if (item.role === 'student' && item.text === event.text) at = i;
      });
      return at === -1 ? state : { ...state, thread: state.thread.filter((_, i) => i !== at) };
    }
    case 'restoreDraft':
      return { ...state, draft: { text: event.text } };
    case 'draftTaken':
      return { ...state, draft: null };
    case 'fallbackPosted':
      return { ...state, fallbackPosted: [...state.fallbackPosted, event.index] };
    case 'restore': {
      const pending = state.serverState?.pending_question;
      return {
        ...state,
        thread: typeof pending === 'string' && pending !== '' ? [...state.thread, { role: 'agent', text: pending }] : state.thread,
        chips: DEFAULT_CHIPS,
        options: [],
      };
    }
    case 'busy':
      return { ...state, busy: event.value, error: event.value ? null : state.error };
    case 'summary':
      return { ...state, summary: event.rows, error: null };
    case 'submitted':
      return { ...state, phase: 'receipt', account: event.account, aggregate: event.aggregate, error: null };
    case 'error':
      return { ...state, busy: false, error: event.message };
  }
}

/** What a failed turn request means for the thread: a 4xx is the server refusing (its detail is shown and never counts toward the fallback); anything else is the assistant being out of reach. */
export function failureEvent(e: unknown): SessionEvent {
  if (e instanceof ApiError && e.status >= 400 && e.status < 500) return { type: 'rejected', message: e.message };
  return { type: 'unreachable' };
}

// A failed withdraw or contact is shown beside its own control, so the hook hands the message to the caller instead of the global error.
function actionMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Could not reach the assistant.';
}

function messageOf(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return 'Could not reach the server. Check your connection and try again.';
}

type Emit = (event: SessionEvent) => void;

export function useSession(client: Client) {
  const [state, dispatch] = useReducer(sessionReducer, initialSession);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Set synchronously so two clicks in one frame cannot both start a request.
  const inFlight = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // `ignore` says the caller no longer wants the result (unmounted or superseded): nothing is dispatched then.
  // `force` skips the re-entry guard; only the mount load uses it, because StrictMode re-runs the effect.
  const run = useCallback(
    async (fn: (emit: Emit) => Promise<void>, ignore: () => boolean = () => !alive.current, force = false) => {
      if (!force && inFlight.current) return;
      const emit: Emit = (event) => { if (!ignore()) dispatch(event); };
      inFlight.current = true;
      emit({ type: 'busy', value: true });
      try {
        await fn(emit);
      } catch (e) {
        if (!ignore()) inFlight.current = false;
        emit({ type: 'error', message: messageOf(e) });
        return;
      }
      if (!ignore()) inFlight.current = false;
      emit({ type: 'busy', value: false });
    },
    [],
  );

  const load = useCallback(
    (ignore?: () => boolean, force = false) => run(async (emit) => {
      const info = await client.session();
      emit({ type: 'loaded', consultation: info.consultation, phase: info.state.phase, serverState: info.state });
    }, ignore, force),
    [client, run],
  );

  useEffect(() => {
    let ignore = false;
    void load(() => ignore, true);
    return () => { ignore = true; };
  }, [load]);

  // Sends one turn. False when it did not go through: the unsent message leaves the thread, so a resend does not appear twice.
  const deliver = useCallback(
    async (emit: Emit, message?: string, action?: string): Promise<boolean> => {
      let ok = true;
      try {
        const result = await client.turn(message, action);
        emit({ type: 'turn', result });
        ok = !result.unavailable;
      } catch (e) {
        emit(failureEvent(e));
        ok = false;
      }
      if (!ok && message !== undefined) emit({ type: 'discardStudent', text: message });
      return ok;
    },
    [client],
  );

  const turn = useCallback(
    (message?: string, action?: string) => run(async (emit) => {
      // A message that did not go through is handed back to the composer.
      if (!(await deliver(emit, message, action)) && message !== undefined) emit({ type: 'restoreDraft', text: message });
    }),
    [deliver, run],
  );

  const draftTaken = useCallback(() => dispatch({ type: 'draftTaken' }), []);

  return {
    state,
    retry: () => load(),
    consent: () => run(async (emit) => {
      const r = await client.consent();
      emit({ type: 'phase', phase: r.phase });
    }),
    overall: (value: string | null) => run(async (emit) => {
      const result = await client.overall(value);
      emit({ type: 'overall', value });
      emit({ type: 'turn', result });
    }),
    /** True when the message was sent; false when refused (a request is already in flight), so the composer keeps its text. */
    send: (text: string): boolean => {
      if (inFlight.current || text.trim() === '') return false;
      dispatch({ type: 'student', text });
      void turn(text);
      return true;
    },
    chip: (label: string) => {
      const action = chipAction(label);
      if (action !== null) return turn(undefined, action);
      if (RESTORE_LABELS.has(label) && !inFlight.current) dispatch({ type: 'restore' });
      return Promise.resolve();
    },
    option: (i: number) => {
      const text = stateRef.current.options[i];
      if (text === undefined || inFlight.current) return Promise.resolve();
      dispatch({ type: 'student', text });
      return turn(text);
    },
    /** The written fallback: each unposted answer is a turn in order, then the summary. Stops at the first the server could not take; posted answers are remembered. */
    submitFallback: (items: { index: number; text: string }[]) => run(async (emit) => {
      for (const { index, text } of items) {
        emit({ type: 'student', text });
        if (!(await deliver(emit, text))) return;
        emit({ type: 'fallbackPosted', index });
      }
      await deliver(emit, undefined, 'finish');
    }),
    draftTaken,
    /** The student closes the consultation without deleting; nothing else is sent. */
    close: () => dispatch({ type: 'phase', phase: 'done' }),
    skip: () => turn(undefined, 'skip'),
    why: () => turn(undefined, 'why'),
    stop: () => turn(undefined, 'stop'),
    del: () => turn(undefined, 'delete'),
    loadSummary: () => run(async (emit) => {
      emit({ type: 'summary', rows: (await client.summary()).rows });
    }),
    edit: (key: string, text: string) => run(async (emit) => {
      emit({ type: 'summary', rows: (await client.editSummary(key, text)).rows });
    }),
    approve: () => run(async (emit) => {
      const r = await client.submit();
      emit({ type: 'submitted', account: r.account, aggregate: r.aggregate });
    }),
    /** True once the server has withdrawn the account. On failure `onError` gets the message and the global error is left alone. */
    withdraw: async (onError?: (message: string) => void): Promise<boolean> => {
      let ok = false;
      await run(async (emit) => {
        try {
          await client.withdraw();
          ok = true;
          emit({ type: 'phase', phase: 'deleted' });
        } catch (e) {
          onError?.(actionMessage(e));
        }
      });
      return ok;
    },
    /** True once the server has stored the contact. Same error handling as `withdraw`. */
    contact: async (c: string, onError?: (message: string) => void): Promise<boolean> => {
      let ok = false;
      await run(async () => {
        try {
          await client.contact(c);
          ok = true;
        } catch (e) {
          onError?.(actionMessage(e));
        }
      });
      return ok;
    },
    restart: () => run(async (emit) => {
      await client.reset();
      const info = await client.session();
      emit({ type: 'loaded', consultation: info.consultation, phase: info.state.phase, serverState: info.state });
    }),
  };
}
