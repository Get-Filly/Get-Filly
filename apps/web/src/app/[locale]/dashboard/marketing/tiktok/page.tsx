import { useTranslations } from "next-intl";
import { ComingSoonChannel } from "../_components/coming-soon-channel";

export default function TikTokMarketingPage() {
  const t = useTranslations("dash_marketing_tiktok_page");
  return (
    <ComingSoonChannel
      channelName="TikTok"
      approvalDescription={t("approvalDescription")}
      features={[
        t("features.playsViews"),
        t("features.watchTime"),
        t("features.followerGrowth"),
        t("features.topVideos"),
        t("features.bestPostTime"),
        t("features.hashtagPerformance"),
        t("features.fillySuggestions"),
      ]}
    />
  );
}
