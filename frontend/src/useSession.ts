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
      if (!force && (inFlight.current || stateRef.current.busy)) return;
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

  const turn = useCallback(
    (message?: string, action?: string) => run(async (emit) => {
      emit({ type: 'turn', result: await client.turn(message, action) });
    }),
    [client, run],
  );

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
    send: (text: string) => {
      if (inFlight.current) return Promise.resolve();
      dispatch({ type: 'student', text });
      return turn(text);
    },
    chip: (label: string) => {
      const action = chipAction(label);
      return action === null ? Promise.resolve() : turn(undefined, action);
    },
    option: (i: number) => {
      const text = stateRef.current.options[i];
      if (text === undefined || inFlight.current) return Promise.resolve();
      dispatch({ type: 'student', text });
      return turn(text);
    },
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
    withdraw: () => run(async (emit) => {
      await client.withdraw();
      emit({ type: 'phase', phase: 'deleted' });
    }),
    contact: (c: string) => run(async () => { await client.contact(c); }),
    restart: () => run(async (emit) => {
      await client.reset();
      const info = await client.session();
      emit({ type: 'loaded', consultation: info.consultation, phase: info.state.phase, serverState: info.state });
    }),
  };
}
