import { ComingSoonChannel } from "../_components/coming-soon-channel";

export default function InstagramMarketingPage() {
  return (
    <ComingSoonChannel
      channelName="Instagram"
      approvalDescription="Meta App Review met scopes voor Insights"
      features={[
        "Bereik en impressies van je posts en Reels (afgelopen 30 dagen)",
        "Volgers-groei en engagement-rate, met vergelijking tegen horeca-mediaan",
        "Top 5 best-presterende posts met inzicht waarom ze werkten",
        "Beste posttijd-heatmap op basis van wanneer jouw publiek online is",
        "Content-mix-vergelijking: hoeveel beter scoren Reels vs foto's vs carousels?",
        "Publiek-demografie: top steden, leeftijd, geslacht",
        "Filly's wekelijkse acties: 'Maak een Reel woensdag 18:30 — onderbenutte tijd'",
      ]}
    />
  );
}
