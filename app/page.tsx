"use client";

import imageCompression from "browser-image-compression";
import { Download, ImageIcon, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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

/** Picker + drag-and-drop: cover common types; extensions catch empty/wrong MIME (e.g. some .jpg exports). */
const RASTER_IMAGE_ACCEPT =
  "image/*,.jpg,.jpeg,.jpe,.jfif,.pjpeg,.pjp,.png,.webp,.gif,.bmp,.avif,.ico";

const RASTER_IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "jpe",
  "jfif",
  "pjpeg",
  "pjp",
  "png",
  "webp",
  "gif",
  "bmp",
  "avif",
  "ico",
]);

function fileExtensionLower(name: string): string | undefined {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return undefined;
  return name.slice(dot + 1).toLowerCase();
}

function isProcessableRasterImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const ext = fileExtensionLower(file.name);
  return ext !== undefined && RASTER_IMAGE_EXTENSIONS.has(ext);
}

/** MIME → download extension (JPEG uses .jpg, not .jpeg from the subtype string). */
const OUTPUT_FORMAT_EXTENSION: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

function outputFileExtension(mimeType: string): string {
  return OUTPUT_FORMAT_EXTENSION[mimeType] ?? mimeType.split("/")[1] ?? "bin";
}

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

    const files = Array.from(e.dataTransfer.files).filter(
      isProcessableRasterImageFile,
    );
    if (files.length === 0) return;

    const newImages: UploadedImage[] = [];
    for (const file of files) {
      const dimensions = await getImageDimensions(file);
      if (!dimensions) continue;
      newImages.push({
        file,
        previewUrl: URL.createObjectURL(file),
        dimensions,
        size: formatFileSize(file.size),
      });
    }
    if (newImages.length > 0) {
      setUploadedImages((prev) => [...prev, ...newImages]);
    }
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files || []).filter(
      isProcessableRasterImageFile,
    );
    const newImages: UploadedImage[] = [];
    for (const file of files) {
      const dimensions = await getImageDimensions(file);
      if (!dimensions) continue;
      newImages.push({
        file,
        previewUrl: URL.createObjectURL(file),
        dimensions,
        size: formatFileSize(file.size),
      });
    }
    if (newImages.length > 0) {
      setUploadedImages((prev) => [...prev, ...newImages]);
    }
    event.target.value = "";
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
        const extension = outputFileExtension(fileFormat);

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
  ): Promise<{ width: number; height: number } | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        URL.revokeObjectURL(url);
        resolve(width > 0 && height > 0 ? { width, height } : null);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
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
    <main className="isolate min-h-dvh bg-background">
      <div className="border-b border-foreground/6">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
          <div className="max-w-2xl">
            <p className="text-sm text-pretty text-muted-foreground">
              Local · no upload
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Image optimizer
            </h1>
            <p className="mt-4 text-base text-pretty text-muted-foreground sm:text-lg">
              Resize, convert, compress, and scale up in the browser. Your files
              never leave this device.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,17.5rem)_1fr] lg:gap-16 xl:grid-cols-[minmax(0,19rem)_1fr]">
          <aside className="min-w-0 lg:border-r lg:border-foreground/6 lg:pr-10 xl:pr-14">
            <div className="lg:sticky lg:top-8">
              <h2 className="text-sm font-semibold text-foreground">
                Settings
              </h2>
              <p className="mt-2 text-sm text-pretty text-muted-foreground">
                Applied to each file in the queue.
              </p>

              <div className="mt-8 flex flex-col gap-0 divide-y divide-foreground/6">
                <section className="flex flex-col gap-4 pb-8">
                  <h3 className="text-sm font-medium text-foreground">
                    Target frame
                  </h3>
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex min-w-0 flex-col gap-2">
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
                            preserveOriginalDimensions && "opacity-50",
                          )}
                        />
                      </div>
                      <div className="flex min-w-0 flex-col gap-2">
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
                            preserveOriginalDimensions && "opacity-50",
                          )}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-t border-foreground/6 pt-4">
                      <label
                        htmlFor="preserve-dimensions"
                        className="text-sm font-medium text-foreground"
                      >
                        Preserve dimensions
                      </label>
                      <Switch
                        id="preserve-dimensions"
                        checked={preserveOriginalDimensions}
                        onCheckedChange={setPreserveOriginalDimensions}
                        className="shrink-0"
                      />
                    </div>
                  </div>
                  <p className="text-sm text-pretty text-muted-foreground">
                    Pixels. With preserve off, output fits inside the frame.
                    With preserve on, width and height are ignored—encode at
                    native size.
                  </p>
                </section>

                <section className="flex flex-col gap-4 py-8">
                  <h3 className="text-sm font-medium text-foreground">
                    Format
                  </h3>
                  <label htmlFor="file-format" className="sr-only">
                    Output format
                  </label>
                  <Select value={fileFormat} onValueChange={setFileFormat}>
                    <SelectTrigger id="file-format" className="w-full">
                      <SelectValue placeholder="Format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="image/webp">WebP (.webp)</SelectItem>
                      <SelectItem value="image/jpeg">JPEG (.jpg)</SelectItem>
                      <SelectItem value="image/png">PNG (.png)</SelectItem>
                    </SelectContent>
                  </Select>
                </section>

                <section className="flex flex-col gap-4 py-8">
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
                  <div className="flex flex-wrap items-center gap-4">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "min-w-0 flex-1",
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
                            <p>Unavailable in lossless mode</p>
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
                </section>

                <section className="flex flex-col gap-4 py-8">
                  <h3 className="text-sm font-medium text-foreground">
                    Upscale
                  </h3>
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
                      <SelectValue placeholder="Multiplier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1×</SelectItem>
                      <SelectItem value="2">2×</SelectItem>
                      <SelectItem value="3">3×</SelectItem>
                      <SelectItem value="4">4×</SelectItem>
                      <SelectItem value="5">5×</SelectItem>
                      <SelectItem value="6">6×</SelectItem>
                      <SelectItem value="8">8×</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-pretty text-muted-foreground">
                    {preserveOriginalDimensions
                      ? "Scales native pixel dimensions. Canvas smoothing only—not generative upscaling."
                      : upscaleMultiplier === 1
                        ? "Output canvas matches your target frame; image is letterboxed as needed."
                        : "After fitting inside the frame, width and height are multiplied by this value."}
                  </p>
                </section>
              </div>
            </div>
          </aside>

          <div className="flex min-w-0 flex-col gap-8">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "rounded-xl border-2 border-dashed border-foreground/10 bg-muted/25 px-6 py-16 text-center transition-colors sm:px-10 sm:py-20",
                isDragging && "border-foreground/25 bg-muted/40",
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                name="images"
                accept={RASTER_IMAGE_ACCEPT}
                multiple
                onChange={handleFileChange}
                className="sr-only"
              />
              <div className="mx-auto flex max-w-sm flex-col items-center gap-6">
                <div className="flex size-11 items-center justify-center rounded-lg border border-foreground/8 bg-background text-muted-foreground">
                  <Upload className="size-5" aria-hidden />
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-base font-medium text-foreground">
                    Drop files to add
                  </p>
                  <p className="text-sm text-pretty text-muted-foreground">
                    JPEG, PNG, WebP, GIF, AVIF, BMP, ICO—batches welcome.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleButtonClick}
                >
                  <ImageIcon className="size-4" aria-hidden />
                  Browse
                </Button>
              </div>
            </div>

            {uploadedImages.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 border-t border-foreground/6 pt-8">
                <Button
                  type="button"
                  onClick={handleOptimize}
                  disabled={isOptimizing}
                >
                  {isOptimizing ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Working…
                    </>
                  ) : (
                    <>
                      Process{" "}
                      <span className="tabular-nums">
                        {uploadedImages.length}
                      </span>{" "}
                      {uploadedImages.length === 1 ? "file" : "files"}
                    </>
                  )}
                </Button>
                {processedImages.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDownloadAll}
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
                  Clear
                </Button>
              </div>
            )}

            {imageCount > 0 && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-foreground/6 pb-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    {showingProcessed ? "Output" : "Queue"}
                  </h3>
                  <p className="tabular-nums text-sm text-muted-foreground">
                    {imageCount} {imageCount === 1 ? "item" : "items"}
                  </p>
                </div>
                <ul className="grid list-none grid-cols-1 gap-px bg-foreground/6 p-px sm:grid-cols-2 lg:grid-cols-3">
                  {gallery.map((image) => (
                    <li
                      key={
                        "dataUrl" in image
                          ? image.dataUrl.slice(0, 64)
                          : image.previewUrl
                      }
                      className="bg-background"
                    >
                      <div className="flex h-full flex-col border border-foreground/6">
                        <div className="relative aspect-[4/3] bg-muted/40">
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
                          <div className="flex min-h-0 flex-col gap-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {"fileName" in image
                                ? image.fileName
                                : (image as UploadedImage).file.name}
                            </p>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                              <span className="tabular-nums">
                                {image.dimensions?.width}×
                                {image.dimensions?.height}
                              </span>
                              <span className="tabular-nums">{image.size}</span>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full"
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
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
};

export default ImageResizeTool;
