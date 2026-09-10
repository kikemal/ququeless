import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-atmosphere">
      <Container className="flex min-h-[calc(100svh-4rem)] flex-col justify-center py-16 sm:py-24">
        <div className="max-w-3xl">
          <p className="font-display animate-fade-up text-4xl font-semibold tracking-tight text-foreground sm:text-5xl md:text-6xl">
            QueueLess
          </p>
          <h1 className="mt-5 animate-fade-up animation-delay-100 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-5xl">
            Skip the line. Keep your time.
          </h1>
          <p className="mt-5 max-w-2xl animate-fade-up animation-delay-200 text-lg leading-relaxed text-muted sm:text-xl">
            QueueLess lets customers join a digital queue from their phone and
            helps businesses manage waiting lines in real time.
          </p>
          <div className="mt-9 flex animate-fade-up animation-delay-300 flex-col gap-3 sm:flex-row sm:items-center">
            <Button href="/signup" size="lg">
              Get started
            </Button>
            <Button href="/#how-it-works" variant="secondary" size="lg">
              See how it works
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
