type GuestNameBadgeProps = {
  name?: string;
  className?: string;
};

/** Badge personnalisé — nom de l’invité (invitations & dress codes). */
export function GuestNameBadge({ name = "", className = "" }: GuestNameBadgeProps) {
  const display = name.trim();
  if (!display) return null;

  return (
    <p
      className={`invitation-guest-badge${className ? ` ${className}` : ""}`}
      aria-label={`Invité : ${display}`}
    >
      {display}
    </p>
  );
}
