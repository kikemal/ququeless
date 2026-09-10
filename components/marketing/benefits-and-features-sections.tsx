import { Container } from "@/components/ui/container";

const benefits = [
  {
    title: "Mobile-first join",
    body: "Designed for a phone camera and a few taps—not another app to install.",
  },
  {
    title: "Live status",
    body: "Queue position and call status update while the ticket page stays open.",
  },
  {
    title: "Multi-tenant ready",
    body: "Architecture isolates each business so staff only see their own queues.",
  },
  {
    title: "Accessible by design",
    body: "Clear hierarchy, keyboard focus, and readable type for everyday use.",
  },
] as const;

const features = [
  "Business signup and staff dashboard",
  "Services and queues configuration",
  "QR-based public join links",
  "Anonymous customer tickets",
  "Call next, skip, and complete flows",
  "Realtime queue updates",
] as const;

export function BenefitsAndFeaturesSections() {
  return (
    <>
      <section
        id="benefits"
        className="scroll-mt-20 border-y border-border bg-surface py-20 sm:py-24"
      >
        <Container>
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Key benefits
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted">
              A focused product surface: join quickly, wait calmly, serve in
              order.
            </p>
          </div>
          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            {benefits.map((benefit) => (
              <article key={benefit.title}>
                <h3 className="font-display text-xl font-semibold text-foreground">
                  {benefit.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-muted">
                  {benefit.body}
                </p>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <section id="features" className="scroll-mt-20 py-20 sm:py-24">
        <Container>
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Simple feature overview
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted">
              Phase 0 ships the product shell. These capabilities land in the
              phases ahead.
            </p>
          </div>
          <ul className="mt-10 columns-1 gap-x-12 sm:columns-2">
            {features.map((feature) => (
              <li
                key={feature}
                className="mb-3 break-inside-avoid border-b border-border py-3 text-base text-foreground"
              >
                {feature}
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </>
  );
}
