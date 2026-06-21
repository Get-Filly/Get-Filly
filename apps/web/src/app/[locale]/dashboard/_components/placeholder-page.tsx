import { useTranslations } from "next-intl";

type Props = {
  icon: string;
  title: string;
  desc: string;
};

export function PlaceholderPage({ icon, title, desc }: Props) {
  const t = useTranslations("dash__components_placeholder_page");

  return (
    <div className="page-ph">
      <div className="ph-icon">{icon}</div>
      <div className="ph-title">{title}</div>
      <div className="ph-desc">{desc}</div>
      <div className="ph-badge">{t("comingSoon")}</div>
    </div>
  );
}
