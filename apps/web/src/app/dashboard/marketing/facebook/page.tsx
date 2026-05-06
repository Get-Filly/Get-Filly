import { ComingSoonChannel } from "../_components/coming-soon-channel";

export default function FacebookMarketingPage() {
  return (
    <ComingSoonChannel
      channelName="Facebook"
      approvalDescription="Meta App Review met scopes voor Page-insights"
      features={[
        "Page-bereik en impressies per post (afgelopen 30 dagen)",
        "Page-likes en page-volgers-groei",
        "Engagement per post-type: foto, link, video, event",
        "Reactions-mix (👍 ❤️ 😂 😮 😢 😡) — wat trekt jouw publiek aan?",
        "Top 5 best-presterende posts",
        "Publiek-demografie: top steden, leeftijd, geslacht",
        "Filly's vergelijking met Instagram: welk kanaal pakt welk segment?",
      ]}
    />
  );
}
