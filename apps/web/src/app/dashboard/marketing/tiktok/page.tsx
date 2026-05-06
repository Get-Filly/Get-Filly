import { ComingSoonChannel } from "../_components/coming-soon-channel";

export default function TikTokMarketingPage() {
  return (
    <ComingSoonChannel
      channelName="TikTok"
      approvalDescription="TikTok for Business API access (vereist business-verificatie)"
      features={[
        "Plays en views per video (afgelopen 30 dagen)",
        "Watch-time en completion-rate, zit je publiek de hele video uit?",
        "Volgers-groei en for-you-pagina-bereik",
        "Top 5 best-presterende video's met inzicht in trending audio",
        "Beste posttijd voor jouw doelgroep",
        "Hashtag-performance: welke trekken meeste bereik?",
        "Filly's content-suggesties: 'Probeer behind-the-scenes, scoort 4× beter dan eten-shots in jouw segment'",
      ]}
    />
  );
}
