import { Container } from "@/components/ui/container";

const steps = [
  {
    title: "Create your queue",
    body: "Set up your business, services, and waiting line from a simple dashboard.",
  },
  {
    title: "Share a QR code",
    body: "Customers scan with their phone camera. No app install. No account.",
  },
  {
    title: "Manage in real time",
    body: "Staff call the next customer while everyone watching a ticket sees live updates.",
  },
] as const;

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="scroll-mt-20 py-20 sm:py-24">
      <Container>
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            How it works
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            Three steps from a crowded lobby to a calm digital wait.
          </p>
        </div>

        <ol className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {steps.map((step, index) => (
            <li key={step.title} className="relative">
              <p className="font-display text-sm font-semibold tracking-[0.16em] text-accent uppercase">
                Step {index + 1}
              </p>
              <h3 className="mt-3 font-display text-xl font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="mt-3 text-base leading-relaxed text-muted">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
