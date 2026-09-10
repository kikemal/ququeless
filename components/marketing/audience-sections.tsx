import { Container } from "@/components/ui/container";

const businessPoints = [
  "Replace physical lines with a managed digital queue.",
  "Call the next guest from a clear staff dashboard.",
  "Keep service flowing without shouting names across the room.",
] as const;

const customerPoints = [
  "Join with a QR scan—no download required.",
  "See your place in line and an estimated wait.",
  "Know when you are called without hovering near the counter.",
] as const;

export function AudienceSections() {
  return (
    <>
      <section
        id="for-businesses"
        className="scroll-mt-20 border-y border-border bg-surface py-20 sm:py-24"
      >
        <Container>
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              For businesses
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted">
              Built for salons, clinics, restaurants, offices, pharmacies, and
              other walk-in spaces that need calmer waiting rooms.
            </p>
          </div>
          <ul className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-10">
            {businessPoints.map((point) => (
              <li
                key={point}
                className="text-base leading-relaxed text-foreground sm:border-l sm:border-border sm:pl-6"
              >
                {point}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section id="for-customers" className="scroll-mt-20 py-20 sm:py-24">
        <Container>
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              For customers
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted">
              The join experience stays short and phone-first so people can get
              in line without friction.
            </p>
          </div>
          <ul className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-10">
            {customerPoints.map((point) => (
              <li
                key={point}
                className="text-base leading-relaxed text-foreground sm:border-l sm:border-border sm:pl-6"
              >
                {point}
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </>
  );
}
