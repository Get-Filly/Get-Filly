"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  fetchStoryTexts,
  metaPublishStory,
  metaStatus,
  metaUploadStoryImage,
  type BusinessMediaItem,
  type MetaStatus,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { MediaLibraryPicker } from "../../_components/media-library-picker";

// ============================================================
// StoryComposer — foto + korte tekst → Instagram/Facebook Story
// ============================================================
// Stories hebben via de Meta-API geen caption en geen link-sticker, dus alle
// tekst ("Komt dinsdag langs", "Cocktail maandag") wordt hier in het beeld
// gerenderd. Dat gebeurt in de browser (canvas, 1080×1920 = 9:16) zodat de
// serverless API geen beeldbibliotheek nodig heeft. Het resultaat gaat als
// JPEG naar /integrations/meta/story-image en daarna naar /story.
// ============================================================

const W = 1080;
const H = 1920;
// Instagram toont onder- en bovenin de story eigen UI (profielbalk, antwoordveld);
// houd tekst binnen deze veilige marges.
const SAFE_TOP = 250;
const SAFE_BOTTOM = 340;
const SIDE = 90;

type Position = "top" | "middle" | "bottom";
type TextStyle = "shade" | "band" | "light";
type Size = "s" | "m" | "l";

const FONT_SIZE: Record<Size, number> = { s: 76, m: 104, l: 140 };

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = words[0];
    for (const w of words.slice(1)) {
      const test = `${line} ${w}`;
      if (ctx.measureText(test).width <= maxWidth) line = test;
      else {
        lines.push(line);
        line = w;
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawStory(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement | null,
  text: string,
  position: Position,
  style: TextStyle,
  size: Size,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = W;
  canvas.height = H;
  ctx.fillStyle = "#1F4A2D";
  ctx.fillRect(0, 0, W, H);

  if (img) {
    // object-fit: cover
    const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }

  const clean = text.trim();
  if (!clean) return;

  const fs = FONT_SIZE[size];
  const lineHeight = Math.round(fs * 1.18);
  ctx.font = `800 ${fs}px Inter, "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const padX = style === "shade" ? 0 : 56;
  const lines = wrapLines(ctx, clean, W - 2 * SIDE - 2 * padX);
  const blockH = lines.length * lineHeight;
  const padY = style === "shade" ? 0 : 48;

  let top: number;
  if (position === "top") top = SAFE_TOP;
  else if (position === "bottom") top = H - SAFE_BOTTOM - blockH - 2 * padY;
  else top = (H - blockH - 2 * padY) / 2;

  if (style === "shade") {
    // Zachte donkere verloop achter de tekst voor leesbaarheid op elke foto.
    const gTop = Math.max(0, top - 220);
    const gBot = Math.min(H, top + blockH + 220);
    const g = ctx.createLinearGradient(0, gTop, 0, gBot);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.5, "rgba(0,0,0,0.55)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, gTop, W, gBot - gTop);
  } else {
    let maxLine = 0;
    for (const l of lines) maxLine = Math.max(maxLine, ctx.measureText(l).width);
    const bw = maxLine + 2 * padX;
    const bh = blockH + 2 * padY;
    ctx.fillStyle = style === "band" ? "#1F4A2D" : "#FFFFFF";
    const x = (W - bw) / 2;
    ctx.beginPath();
    ctx.roundRect(x, top, bw, bh, 32);
    ctx.fill();
  }

  ctx.fillStyle = style === "light" ? "#18181B" : "#FFFFFF";
  if (style === "shade") {
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 24;
  }
  lines.forEach((l, i) => {
    ctx.fillText(l, W / 2, top + padY + lineHeight * (i + 0.5));
  });
  ctx.shadowBlur = 0;
}

function loadImage(src: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

export function StoryComposer() {
  const t = useTranslations("dash_story_composer");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const date = useSearchParams().get("date") ?? undefined;
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [text, setText] = useState("");
  const [position, setPosition] = useState<Position>("bottom");
  const [style, setStyle] = useState<TextStyle>("shade");
  const [size, setSize] = useState<Size>("m");
  const [toInstagram, setToInstagram] = useState(true);
  const [toFacebook, setToFacebook] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ ok: boolean; errors: string[] } | null>(
    null,
  );

  useEffect(() => {
    metaStatus()
      .then(setStatus)
      .catch(() => setStatus({ connected: false }));
  }, []);

  // Filly's tekstvoorstellen (afgestemd op de gekozen dag, als die is meegegeven).
  useEffect(() => {
    fetchStoryTexts(date)
      .then(setSuggestions)
      .catch(() => setSuggestions([]));
  }, [date]);

  // Herteken de preview bij elke wijziging.
  useEffect(() => {
    if (canvasRef.current) {
      drawStory(canvasRef.current, img, text, position, style, size);
    }
  }, [img, text, position, style, size, status]);

  const setImageFrom = useCallback(
    async (src: string, cors: boolean) => {
      try {
        setError(null);
        setImg(await loadImage(src, cors));
      } catch {
        setError(t("loadError"));
      }
    },
    [t],
  );

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    void setImageFrom(url, false);
  };

  const onPick = (item: BusinessMediaItem) => {
    setPickerOpen(false);
    void setImageFrom(item.url, true);
  };

  const publish = async () => {
    setError(null);
    setDone(null);
    if (!img) return setError(t("noPhoto"));
    if (!toInstagram && !toFacebook) return setError(t("noChannel"));
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("render failed"))),
          "image/jpeg",
          0.92,
        ),
      );
      const imageUrl = await metaUploadStoryImage(blob);
      const res = await metaPublishStory({
        imageUrl,
        toInstagram,
        toFacebook,
      });
      setDone({
        ok: !!(res.instagram || res.facebook),
        errors: res.errors,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (status === null) return <div style={{ color: "var(--tl)" }}>…</div>;

  if (!status.connected || status.expired || !status.page) {
    const msg = !status.connected
      ? t("notConnected")
      : status.expired
        ? t("expired")
        : t("noPage");
    return (
      <Card>
        <CardBody>
          <p style={{ marginBottom: "var(--space-3)" }}>{msg}</p>
          <Link href="/dashboard/account">{t("notConnectedLink")}</Link>
        </CardBody>
      </Card>
    );
  }

  const chip = (active: boolean): React.CSSProperties => ({
    padding: "6px 12px",
    borderRadius: "var(--radius-md)",
    border: `1px solid ${active ? "#1F4A2D" : "var(--color-border, #E4E4E7)"}`,
    background: active ? "#F0F7F2" : "transparent",
    fontSize: 13,
    cursor: "pointer",
  });
  const label: React.CSSProperties = {
    fontWeight: 600,
    fontSize: 13,
    margin: "var(--space-4) 0 var(--space-2)",
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "var(--space-6)",
        flexWrap: "wrap",
        alignItems: "flex-start",
      }}
    >
      {/* Preview 9:16 */}
      <div style={{ width: 270, flexShrink: 0 }}>
        <div
          style={{
            position: "relative",
            width: 270,
            height: 480,
            borderRadius: 16,
            overflow: "hidden",
            border: "1px solid var(--color-border, #E4E4E7)",
          }}
        >
          <canvas
            ref={canvasRef}
            style={{ width: "100%", height: "100%", display: "block" }}
          />
          {!img && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 24,
                textAlign: "center",
                color: "#fff",
                fontSize: 13,
              }}
            >
              {t("emptyPreview")}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 280, maxWidth: 520 }}>
        <div style={{ ...label, marginTop: 0 }}>{t("photo")}</div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <Button variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
            {t("pickPhoto")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            {t("uploadPhoto")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>

        <div style={label}>{t("text")}</div>
        {suggestions === null ? (
          <div style={{ fontSize: 12, color: "var(--text-secondary, #52525B)" }}>
            {t("suggestLoading")}
          </div>
        ) : (
          suggestions.length > 0 && (
            <div style={{ marginBottom: "var(--space-2)" }}>
              <div style={{ fontSize: 12, marginBottom: 6 }}>
                {t("fillySuggests")}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    style={chip(text === s)}
                    onClick={() => setText(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("textPlaceholder")}
          maxLength={120}
          rows={2}
          style={{
            width: "100%",
            padding: 10,
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border, #E4E4E7)",
            font: "inherit",
          }}
        />

        <div style={label}>{t("position")}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["top", "middle", "bottom"] as Position[]).map((p) => (
            <button
              key={p}
              type="button"
              style={chip(position === p)}
              onClick={() => setPosition(p)}
            >
              {t(`pos${p[0].toUpperCase()}${p.slice(1)}`)}
            </button>
          ))}
        </div>

        <div style={label}>{t("style")}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["shade", "band", "light"] as TextStyle[]).map((s) => (
            <button
              key={s}
              type="button"
              style={chip(style === s)}
              onClick={() => setStyle(s)}
            >
              {t(`style${s[0].toUpperCase()}${s.slice(1)}`)}
            </button>
          ))}
        </div>

        <div style={label}>{t("size")}</div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["s", "m", "l"] as Size[]).map((s) => (
            <button
              key={s}
              type="button"
              style={chip(size === s)}
              onClick={() => setSize(s)}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>

        <div style={label}>{t("channels")}</div>
        <label style={{ display: "flex", gap: 8, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={toInstagram}
            onChange={(e) => setToInstagram(e.target.checked)}
          />
          {t("instagram")}
        </label>
        <label style={{ display: "flex", gap: 8, fontSize: 14, marginTop: 6 }}>
          <input
            type="checkbox"
            checked={toFacebook}
            onChange={(e) => setToFacebook(e.target.checked)}
          />
          {t("facebook")} ({status.page.name})
        </label>

        <div style={{ marginTop: "var(--space-5)" }}>
          <Button variant="primary" onClick={publish} disabled={busy}>
            {busy ? t("publishing") : t("publish")}
          </Button>
        </div>

        {error && (
          <p style={{ color: "#B42318", fontSize: 13, marginTop: "var(--space-3)" }}>
            {error}
          </p>
        )}
        {done && (
          <div style={{ fontSize: 13, marginTop: "var(--space-3)" }}>
            {done.ok && <p style={{ color: "#1F4A2D" }}>{t("success")}</p>}
            {done.errors.length > 0 && (
              <>
                <p style={{ color: "#B42318" }}>{t("partial")}</p>
                <ul>
                  {done.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <p
          style={{
            fontSize: 12,
            color: "var(--text-secondary, #52525B)",
            marginTop: "var(--space-4)",
            lineHeight: 1.5,
          }}
        >
          {t("limits")}
        </p>
      </div>

      <MediaLibraryPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={onPick}
        initialFilter="image"
      />
    </div>
  );
}
