import { AudienceSections } from "@/components/marketing/audience-sections";
import { BenefitsAndFeaturesSections } from "@/components/marketing/benefits-and-features-sections";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { HeroSection } from "@/components/marketing/hero-section";
import { HowItWorksSection } from "@/components/marketing/how-it-works-section";

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <HowItWorksSection />
      <AudienceSections />
      <BenefitsAndFeaturesSections />
      <FinalCtaSection />
    </>
  );
}
