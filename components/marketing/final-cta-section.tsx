import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export function FinalCtaSection() {
  return (
    <section className="border-t border-border bg-atmosphere py-20 sm:py-24">
      <Container className="max-w-3xl text-center">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Ready when your next guest walks in
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-muted">
          Start with QueueLess and replace the physical line with a digital
          queue your customers can join from their phone.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button href="/signup" size="lg">
            Get started
          </Button>
          <Button href="/login" variant="secondary" size="lg">
            Log in
          </Button>
        </div>
      </Container>
    </section>
  );
}
