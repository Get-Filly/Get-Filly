import { useTranslations } from "next-intl";
import { ComingSoonChannel } from "../_components/coming-soon-channel";
import { TikTokUploadPanel } from "../_components/tiktok-upload-panel";
import { BackToReportsLink } from "../../_components/back-to-reports-link";

export default function TikTokMarketingPage() {
  const t = useTranslations("dash_marketing_tiktok_page");
  return (
    <>
      {/* Werkende upload-flow (Content Posting API → concept naar de inbox).
          De insights eronder zijn nog mock (wachten op TikTok-approval). */}
      <div className="page-full">
        <BackToReportsLink />
        <TikTokUploadPanel />
      </div>
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
    </>
  );
}
