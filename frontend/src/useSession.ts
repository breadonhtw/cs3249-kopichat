import { useCallback, useEffect, useReducer, useRef } from 'react';
import { ApiError, chipAction } from './api/client.ts';
import type { Aggregate, Consultation, Phase, ServerState, SummaryRow, TurnResult, createClient } from './api/client.ts';

export type Client = ReturnType<typeof createClient>;

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
  summary: SummaryRow[];
  account: { id: string; ref_code: string } | null;
  aggregate: Aggregate | null;
  busy: boolean;
  error: string | null;
};

export type SessionEvent =
  | { type: 'loaded'; consultation: Consultation; phase?: Phase; serverState?: ServerState }
  | { type: 'phase'; phase: Phase }
  | { type: 'overall'; value: string | null }
  | { type: 'student'; text: string }
  | { type: 'turn'; result: TurnResult }
  | { type: 'busy'; value: boolean }
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
  summary: [],
  account: null,
  aggregate: null,
  busy: false,
  error: null,
};

export function sessionReducer(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case 'loaded':
      return {
        ...initialSession,
        consultation: event.consultation,
        phase: event.phase ?? event.serverState?.phase ?? 'consent',
        serverState: event.serverState ?? null,
      };
    case 'phase':
      return { ...state, phase: event.phase, error: null };
    case 'overall':
      return { ...state, overall: event.value };
    case 'student':
      return { ...state, thread: [...state.thread, { role: 'student', text: event.text }], chips: [], options: [] };
    case 'turn':
      return {
        ...state,
        phase: event.result.phase,
        thread: [...state.thread, { role: 'agent', text: event.result.reply }],
        chips: event.result.chips,
        options: event.result.options,
        counter: event.result.counter,
        serverState: event.result.state,
        error: null,
      };
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

function messageOf(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return 'Could not reach the server. Check your connection and try again.';
}

export function useSession(client: Client) {
  const [state, dispatch] = useReducer(sessionReducer, initialSession);
  const stateRef = useRef(state);
  stateRef.current = state;

  const run = useCallback(async (fn: () => Promise<void>) => {
    dispatch({ type: 'busy', value: true });
    try {
      await fn();
    } catch (e) {
      dispatch({ type: 'error', message: messageOf(e) });
      return;
    }
    dispatch({ type: 'busy', value: false });
  }, []);

  const load = useCallback(
    () => run(async () => {
      const info = await client.session();
      dispatch({ type: 'loaded', consultation: info.consultation, phase: info.state.phase, serverState: info.state });
    }),
    [client, run],
  );

  useEffect(() => { void load(); }, [load]);

  const turn = useCallback(
    (message?: string, action?: string) => run(async () => {
      dispatch({ type: 'turn', result: await client.turn(message, action) });
    }),
    [client, run],
  );

  return {
    state,
    consent: () => run(async () => {
      const r = await client.consent();
      dispatch({ type: 'phase', phase: r.phase });
    }),
    overall: (value: string | null) => run(async () => {
      const result = await client.overall(value);
      dispatch({ type: 'overall', value });
      dispatch({ type: 'turn', result });
    }),
    send: (text: string) => {
      dispatch({ type: 'student', text });
      return turn(text);
    },
    chip: (label: string) => {
      const action = chipAction(label);
      return action === null ? Promise.resolve() : turn(undefined, action);
    },
    option: (i: number) => {
      const text = stateRef.current.options[i];
      if (text === undefined) return Promise.resolve();
      dispatch({ type: 'student', text });
      return turn(text);
    },
    skip: () => turn(undefined, 'skip'),
    why: () => turn(undefined, 'why'),
    stop: () => turn(undefined, 'stop'),
    del: () => turn(undefined, 'delete'),
    loadSummary: () => run(async () => {
      dispatch({ type: 'summary', rows: (await client.summary()).rows });
    }),
    edit: (key: string, text: string) => run(async () => {
      dispatch({ type: 'summary', rows: (await client.editSummary(key, text)).rows });
    }),
    approve: () => run(async () => {
      const r = await client.submit();
      dispatch({ type: 'submitted', account: r.account, aggregate: r.aggregate });
    }),
    withdraw: () => run(async () => {
      await client.withdraw();
      dispatch({ type: 'phase', phase: 'deleted' });
    }),
    contact: (c: string) => run(async () => { await client.contact(c); }),
    restart: () => run(async () => {
      await client.reset();
      const info = await client.session();
      dispatch({ type: 'loaded', consultation: info.consultation, phase: info.state.phase, serverState: info.state });
    }),
  };
}
