type Props = {
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
};

export function Skeleton({ width, height, style }: Props) {
  return (
    <div
      className="skeleton"
      style={{
        width: width ?? "100%",
        height: height ?? 14,
        ...style,
      }}
    />
  );
}
