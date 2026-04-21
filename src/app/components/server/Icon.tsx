import { type ComponentProps } from "react";
import { type StaticImageData } from "next/image";

type IconProps = Omit<ComponentProps<"img">, "src"> & {
  src: StaticImageData;
};

const EMPTY_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E`;

/**
 * Render a mono-color SVG icon tinted by the current text color.
 *
 * Use a CSS mask over a currentColor background.
 *
 * @param src - Next.js StaticImageData import of the SVG asset.
 * @param width - Override width; defaults to the intrinsic width from the import.
 * @param height - Override height; default to the intrinsic height from the import.
 * @returns
 */
export default function Icon({
  src,
  width,
  height,
  style,
  ...props
}: IconProps) {
  return (
    <img
      width={width ?? src.width}
      height={height ?? src.height}
      src={EMPTY_SVG}
      style={{
        ...style,
        backgroundColor: "currentcolor",
        mask: `url("${src.src}") no-repeat center / contain`,
      }}
      {...props}
    />
  );
}
