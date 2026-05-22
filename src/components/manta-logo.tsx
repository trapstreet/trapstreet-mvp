type MantaLogoProps = {
  className?: string;
};

export function MantaLogo({ className = "" }: MantaLogoProps) {
  return (
    <img
      alt=""
      className={className}
      src="/trapstreet-manta-outline.png"
    />
  );
}
