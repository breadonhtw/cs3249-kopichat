import { ActionPair } from './ActionPair.tsx';

type Props = {
  sentence: string;
  secondary: { label: string; onClick: () => void };
  primary: { label: string; onClick: () => void };
  busy: boolean;
};

/** Replaces the composer in place. Not a modal: the thread stays visible above it. */
export function InlineConfirm({ sentence, secondary, primary, busy }: Props) {
  return (
    <div className="confirm" role="group" aria-label="Confirm">
      <p className="confirm__sentence">{sentence}</p>
      <ActionPair secondary={{ ...secondary, disabled: busy }} primary={{ ...primary, disabled: busy }} />
    </div>
  );
}
