export function InvitationHearts() {
  return (
    <svg
      className="invitation-hearts"
      viewBox="0 0 200 88"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        className="invitation-hearts__left"
        d="M 72 74 C 72 74 46 54 46 36 C 46 22 58 12 72 22 C 86 12 98 22 98 36 C 98 54 72 74 72 74 Z"
        transform="rotate(-10 72 44)"
      />
      <path
        className="invitation-hearts__right"
        d="M 128 74 C 128 74 102 54 102 36 C 102 22 114 12 128 22 C 142 12 154 22 154 36 C 154 54 128 74 128 74 Z"
        transform="rotate(10 128 44)"
      />
    </svg>
  );
}
