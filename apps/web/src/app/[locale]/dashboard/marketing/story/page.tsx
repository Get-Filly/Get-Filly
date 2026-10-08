"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/ui/page-header";
import { BackToReportsLink } from "../../_components/back-to-reports-link";
import { StoryComposer } from "../_components/story-composer";

export default function StoryPage() {
  const t = useTranslations("dash_story_composer");
  return (
    <div className="page-full">
      <BackToReportsLink />
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <Suspense fallback={null}>
        <StoryComposer />
      </Suspense>
    </div>
  );
}
