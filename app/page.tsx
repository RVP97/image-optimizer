"use client";

import imageCompression from "browser-image-compression";
import {
  Download,
  ImageIcon,
  Loader2,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ProcessedImage {
  dataUrl: string;
  fileName: string;
  dimensions: {
    width: number;
    height: number;
  };
  size: string;
}

interface UploadedImage {
  file: File;
  previewUrl: string;
  dimensions: {
    width: number;
    height: number;
  };
  size: string;
}

type ImageCompressionLibOptions = Parameters<typeof imageCompression>[1];

const ImageResizeTool = () => {
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [width, setWidth] = useState<number>(1200);
  const [height, setHeight] = useState<number>(675);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [quality, setQuality] = useState<number>(0.9);
  const [isLossless, setIsLossless] = useState(false);
  const [fileFormat, setFileFormat] = useState<string>("image/webp");
  const [preserveOriginalDimensions, setPreserveOriginalDimensions] =
    useState(false);
  /** Integer >= 1; applied on canvas after fit-to-target (or on native size if preserve). */
  const [upscaleFactor, setUpscaleFactor] = useState<string>("1");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upscaleMultiplier = Math.max(
    1,
    Math.min(16, Number.parseInt(upscaleFactor, 10) || 1),
  );

  const formatFileSize = (bytes: number) =>
    bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleClearAll = () => {
    for (const img of uploadedImages) {
      URL.revokeObjectURL(img.previewUrl);
    }
    setUploadedImages([]);
    setProcessedImages([]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const newImages = await Promise.all(
        files.map(async (file) => {
          const dimensions = await getImageDimensions(file);
          const size = formatFileSize(file.size);

          return {
            file,
            previewUrl: URL.createObjectURL(file),
            dimensions,
            size,
          };
        }),
      );
      setUploadedImages((prev) => [...prev, ...newImages]);
    }
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files || []);
    const newImages = await Promise.all(
      files.map(async (file) => {
        const dimensions = await getImageDimensions(file);
        const size = formatFileSize(file.size);

        return {
          file,
          previewUrl: URL.createObjectURL(file),
          dimensions,
          size,
        };
      }),
    );
    setUploadedImages((prev) => [...prev, ...newImages]);
  };

  const handleOptimize = async () => {
    setIsOptimizing(true);

    const optimizedImages = await Promise.all(
      uploadedImages.map(async ({ file }) => {
        const baseOpts = {
          useWebWorker: true as const,
          initialQuality: isLossless ? 1 : quality,
          fileType: fileFormat,
          options: {
            lossless: isLossless,
          },
        };

        const maxEdge = Math.max(
          width,
          height,
          width * upscaleMultiplier,
          height * upscaleMultiplier,
        );

        const options: ImageCompressionLibOptions = preserveOriginalDimensions
          ? {
              ...baseOpts,
              alwaysKeepResolution: true,
              maxSizeMB: Number.POSITIVE_INFINITY,
            }
          : {
              ...baseOpts,
              maxWidthOrHeight: maxEdge,
            };

        const compressedFile = await imageCompression(file, options);
        const {
          dataUrl,
          width: outW,
          height: outH,
        } = await blobToDataUrl(compressedFile, {
          targetWidth: width,
          targetHeight: height,
          preserveOriginal: preserveOriginalDimensions,
          upscaleMultiplier,
          mimeType: fileFormat,
          quality,
          lossless: isLossless,
        });

        const outBlob = await (await fetch(dataUrl)).blob();
        const extension = fileFormat.split("/")[1];

        return {
          dataUrl,
          fileName: `${file.name.replace(/\.[^/.]+$/, "")}.${extension}`,
          dimensions: { width: outW, height: outH },
          size: formatFileSize(outBlob.size),
        };
      }),
    );

    setProcessedImages(optimizedImages);
    setIsOptimizing(false);
  };

  const blobToDataUrl = async (
    file: Blob,
    params: {
      targetWidth: number;
      targetHeight: number;
      preserveOriginal: boolean;
      upscaleMultiplier: number;
      mimeType: string;
      quality: number;
      lossless: boolean;
    },
  ): Promise<{ dataUrl: string; width: number; height: number }> => {
    const {
      targetWidth,
      targetHeight,
      preserveOriginal,
      upscaleMultiplier: m,
      mimeType,
      quality: q,
      lossless,
    } = params;

    const img = document.createElement("img");
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image"));
    });

    URL.revokeObjectURL(objectUrl);

    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context unavailable");
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (preserveOriginal) {
      const outW = Math.round(imgW * m);
      const outH = Math.round(imgH * m);
      canvas.width = outW;
      canvas.height = outH;
      if (mimeType === "image/jpeg") {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, outW, outH);
      }
      ctx.drawImage(img, 0, 0, outW, outH);
      const dataUrl = encodeCanvasToDataUrl(canvas, mimeType, q, lossless);
      return { dataUrl, width: outW, height: outH };
    }

    const scaleContain = Math.min(targetWidth / imgW, targetHeight / imgH);

    if (m === 1) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      const drawWidth = imgW * scaleContain;
      const drawHeight = imgH * scaleContain;
      const x = (targetWidth - drawWidth) / 2;
      const y = (targetHeight - drawHeight) / 2;

      ctx.drawImage(img, x, y, drawWidth, drawHeight);

      const dataUrl = encodeCanvasToDataUrl(canvas, mimeType, q, lossless);
      return { dataUrl, width: targetWidth, height: targetHeight };
    }

    const fitW = imgW * scaleContain;
    const fitH = imgH * scaleContain;
    const outW = Math.round(fitW * m);
    const outH = Math.round(fitH * m);

    canvas.width = outW;
    canvas.height = outH;

    if (mimeType === "image/jpeg") {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, outW, outH);
    }

    ctx.drawImage(img, 0, 0, outW, outH);

    const dataUrl = encodeCanvasToDataUrl(canvas, mimeType, q, lossless);
    return { dataUrl, width: outW, height: outH };
  };

  const encodeCanvasToDataUrl = (
    canvas: HTMLCanvasElement,
    mimeType: string,
    q: number,
    lossless: boolean,
  ): string => {
    if (mimeType === "image/webp") {
      return canvas.toDataURL(mimeType, {
        quality: lossless ? 1 : q,
        lossless,
      } as unknown as number);
    }
    if (mimeType === "image/jpeg") {
      return canvas.toDataURL(mimeType, lossless ? 1 : q);
    }
    return canvas.toDataURL(mimeType);
  };

  const handleDownload = (dataUrl: string, fileName: string) => {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getImageDimensions = (
    file: File,
  ): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
    });
  };

  const handleDownloadAll = () => {
    processedImages.forEach((image) => {
      setTimeout(() => {
        handleDownload(image.dataUrl, image.fileName);
      }, 100);
    });
  };

  const showingProcessed = processedImages.length > 0;
  const gallery = showingProcessed ? processedImages : uploadedImages;
  const imageCount = gallery.length;

  return (
    <main className="isolate min-h-dvh bg-linear-to-b from-zinc-100 via-background to-background dark:from-zinc-950 dark:via-background dark:to-background">
      <div className="px-4 py-10 sm:px-6 sm:py-14 lg:py-16">
        <div className="mx-auto max-w-6xl">
          <header className="mb-10 lg:mb-14">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary ring-1 ring-primary/15">
                <Sparkles className="size-3.5" aria-hidden />
                Runs in your browser
              </span>
            </div>
            <h1 className="mt-5 max-w-[35ch] text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Compress images without uploading them
            </h1>
            <p className="mt-4 max-w-[56ch] text-base text-pretty text-muted-foreground sm:text-lg">
              Resize, convert, and shrink files locally. Pick a format, tune
              quality, and download—nothing leaves your device.
            </p>
          </header>

          <div className="grid gap-8 lg:grid-cols-12 lg:items-start lg:gap-10">
            <aside className="flex flex-col gap-6 lg:col-span-5 xl:col-span-4">
              <div className="rounded-2xl bg-card/90 p-6 shadow-sm ring-1 ring-black/5 backdrop-blur-sm dark:bg-card/80 dark:ring-white/10">
                <div className="flex items-center gap-2 text-foreground">
                  <SlidersHorizontal
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                  <h2 className="text-base font-semibold">Output settings</h2>
                </div>
                <p className="mt-1 text-sm text-pretty text-muted-foreground">
                  These apply to every image in your batch.
                </p>

                <div className="mt-6 flex flex-col gap-8">
                  <div className="flex flex-col gap-3">
                    <div className="text-sm font-medium text-foreground">
                      Canvas size
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-2">
                        <label
                          htmlFor="width"
                          className="text-sm text-muted-foreground"
                        >
                          Width
                        </label>
                        <Input
                          id="width"
                          name="width"
                          type="number"
                          inputMode="numeric"
                          value={width}
                          onChange={(e) => setWidth(Number(e.target.value))}
                          min={1}
                          disabled={preserveOriginalDimensions}
                          className={cn(
                            "tabular-nums",
                            preserveOriginalDimensions && "opacity-60",
                          )}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label
                          htmlFor="height"
                          className="text-sm text-muted-foreground"
                        >
                          Height
                        </label>
                        <Input
                          id="height"
                          name="height"
                          type="number"
                          inputMode="numeric"
                          value={height}
                          onChange={(e) => setHeight(Number(e.target.value))}
                          min={1}
                          disabled={preserveOriginalDimensions}
                          className={cn(
                            "tabular-nums",
                            preserveOriginalDimensions && "opacity-60",
                          )}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-pretty text-muted-foreground">
                      Used when preserve original size is off. Units are pixels.
                    </p>
                  </div>

                  <div className="h-px bg-black/5 dark:bg-white/10" />

                  <div className="flex flex-col gap-3">
                    <div className="text-sm font-medium text-foreground">
                      File format
                    </div>
                    <label htmlFor="file-format" className="sr-only">
                      Output format
                    </label>
                    <Select value={fileFormat} onValueChange={setFileFormat}>
                      <SelectTrigger id="file-format" className="w-full">
                        <SelectValue placeholder="Select format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="image/webp">WebP</SelectItem>
                        <SelectItem value="image/jpeg">JPEG</SelectItem>
                        <SelectItem value="image/png">PNG</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label
                        htmlFor="quality"
                        className="text-sm font-medium text-foreground"
                      >
                        Quality
                      </label>
                      <span className="tabular-nums text-sm text-muted-foreground">
                        {Math.round(quality * 100)}%
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "min-w-0 flex-1 py-1",
                                isLossless && "cursor-not-allowed opacity-50",
                              )}
                            >
                              <Slider
                                id="quality"
                                min={10}
                                max={100}
                                step={1}
                                value={[quality * 100]}
                                onValueChange={(value) =>
                                  setQuality(value[0] / 100)
                                }
                                className={cn(
                                  "w-full cursor-grab",
                                  isLossless && "pointer-events-none",
                                )}
                                disabled={isLossless}
                              />
                            </div>
                          </TooltipTrigger>
                          {isLossless && (
                            <TooltipContent>
                              <p>Disabled while lossless is on</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                      <div className="flex shrink-0 items-center gap-2">
                        <label
                          htmlFor="lossless"
                          className="text-sm text-muted-foreground"
                        >
                          Lossless
                        </label>
                        <Switch
                          id="lossless"
                          checked={isLossless}
                          onCheckedChange={setIsLossless}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-black/5 dark:bg-white/10" />

                  <div className="flex flex-col gap-3">
                    <div className="text-sm font-medium text-foreground">
                      Upscale
                    </div>
                    <label htmlFor="upscale-factor" className="sr-only">
                      Upscale multiplier
                    </label>
                    <Select
                      value={upscaleFactor}
                      onValueChange={setUpscaleFactor}
                    >
                      <SelectTrigger
                        id="upscale-factor"
                        className="w-full tabular-nums"
                      >
                        <SelectValue placeholder="Upscale" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1× (no upscale)</SelectItem>
                        <SelectItem value="2">2×</SelectItem>
                        <SelectItem value="3">3×</SelectItem>
                        <SelectItem value="4">4×</SelectItem>
                        <SelectItem value="5">5×</SelectItem>
                        <SelectItem value="6">6×</SelectItem>
                        <SelectItem value="8">8×</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-pretty text-muted-foreground">
                      {preserveOriginalDimensions
                        ? "Multiplies native width and height (browser interpolation, not AI)."
                        : upscaleMultiplier === 1
                          ? "Output matches your target canvas with letterboxing as needed."
                          : "Scales up the image after fitting inside the target size: output is (fit size × multiplier)."}
                    </p>
                  </div>

                  <div className="h-px bg-black/5 dark:bg-white/10" />

                  <div className="flex flex-col gap-4">
                    <div className="text-sm font-medium text-foreground">
                      Advanced
                    </div>
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <label
                            htmlFor="preserve-dimensions"
                            className="text-sm font-medium text-foreground"
                          >
                            Preserve original dimensions
                          </label>
                          <p className="mt-0.5 text-xs text-pretty text-muted-foreground">
                            Skip resizing; only compress and convert.
                          </p>
                        </div>
                        <Switch
                          id="preserve-dimensions"
                          checked={preserveOriginalDimensions}
                          onCheckedChange={setPreserveOriginalDimensions}
                          className="shrink-0"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </aside>

            <div className="flex flex-col gap-6 lg:col-span-7 xl:col-span-8">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "relative overflow-hidden rounded-2xl bg-card/60 px-6 py-14 text-center ring-1 ring-black/5 transition-[box-shadow,background-color] dark:bg-card/40 dark:ring-white/10 sm:px-10 sm:py-16",
                  isDragging &&
                    "bg-primary/5 ring-2 ring-primary/40 dark:bg-primary/10",
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  name="images"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  className="sr-only"
                />
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.12),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.18),transparent)]" />
                <div className="relative mx-auto flex max-w-md flex-col items-center gap-5">
                  <span className="flex size-14 items-center justify-center rounded-2xl bg-background/80 shadow-sm ring-1 ring-black/5 dark:bg-background/60 dark:ring-white/10">
                    <Upload className="size-7 text-primary" aria-hidden />
                  </span>
                  <div className="space-y-2">
                    <p className="text-base font-medium text-foreground sm:text-lg">
                      Drop images here
                    </p>
                    <p className="text-sm text-pretty text-muted-foreground">
                      Or browse—JPEG, PNG, WebP, and more. Batch processing
                      supported.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="default"
                    onClick={handleButtonClick}
                    className="pointer-events-auto ring-1 ring-black/5 dark:ring-white/10"
                  >
                    <ImageIcon className="size-4" aria-hidden />
                    Choose files
                  </Button>
                </div>
              </div>

              {uploadedImages.length > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    onClick={handleOptimize}
                    disabled={isOptimizing}
                    className="shadow-sm"
                  >
                    {isOptimizing ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Optimizing…
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-4" aria-hidden />
                        Optimize {uploadedImages.length} image
                        {uploadedImages.length === 1 ? "" : "s"}
                      </>
                    )}
                  </Button>
                  {processedImages.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleDownloadAll}
                      className="ring-1 ring-black/5 dark:ring-white/10"
                    >
                      <Download className="size-4" aria-hidden />
                      Download all
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={handleClearAll}
                  >
                    Clear queue
                  </Button>
                </div>
              )}

              {imageCount > 0 && (
                <div>
                  <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      {showingProcessed ? "Optimized" : "Ready to process"}
                    </h3>
                    <span className="tabular-nums text-sm text-muted-foreground">
                      {imageCount} file{imageCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {gallery.map((image) => (
                      <li
                        key={
                          "dataUrl" in image
                            ? image.dataUrl.slice(0, 64)
                            : image.previewUrl
                        }
                      >
                        <Card className="overflow-hidden bg-card/90 ring-1 ring-black/5 dark:bg-card/80 dark:ring-white/10">
                          <div className="relative aspect-[4/3] bg-muted/30">
                            {/* biome-ignore lint/performance/noImgElement: blob/data URLs from user files are not suited to next/image */}
                            <img
                              src={
                                "dataUrl" in image
                                  ? image.dataUrl
                                  : image.previewUrl
                              }
                              alt=""
                              className="absolute inset-0 size-full object-contain"
                            />
                          </div>
                          <div className="flex flex-col gap-3 p-4">
                            <div className="flex flex-col gap-1">
                              <span className="truncate text-sm font-medium text-foreground">
                                {"fileName" in image
                                  ? image.fileName
                                  : (image as UploadedImage).file.name}
                              </span>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                <span className="tabular-nums">
                                  {image.dimensions?.width} ×{" "}
                                  {image.dimensions?.height}px
                                </span>
                                <span className="tabular-nums">
                                  {image.size}
                                </span>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-full ring-1 ring-black/5 dark:ring-white/10"
                              onClick={() =>
                                handleDownload(
                                  "dataUrl" in image
                                    ? image.dataUrl
                                    : image.previewUrl,
                                  "fileName" in image
                                    ? image.fileName
                                    : image.file.name,
                                )
                              }
                            >
                              <Download className="size-4" aria-hidden />
                              Download
                            </Button>
                          </div>
                        </Card>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default ImageResizeTool;
