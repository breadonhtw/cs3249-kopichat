type Action = { label: string; onClick: () => void; disabled?: boolean };
type Props = { secondary: Action; primary: Action };

export function ActionPair({ secondary, primary }: Props) {
  return (
    <div className="pair">
      <button type="button" className="btn" onClick={secondary.onClick} disabled={secondary.disabled}>
        {secondary.label}
      </button>
      <button type="button" className="btn btn--primary" onClick={primary.onClick} disabled={primary.disabled}>
        {primary.label}
      </button>
    </div>
  );
}
