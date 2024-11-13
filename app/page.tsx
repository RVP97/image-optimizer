"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import imageCompression from "browser-image-compression";
import { Download } from "lucide-react";
import { useRef, useState } from "react";

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

interface CompressionOptions {
  maxWidthOrHeight: number;
  useWebWorker: true;
  initialQuality: number;
  fileType: "image/webp";
  options: {
    lossless: boolean;
  };
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleButtonClick = () => {
    fileInputRef.current?.click();
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
          const size =
            file.size < 1024 * 1024
              ? `${(file.size / 1024).toFixed(1)} KB`
              : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

          return {
            file,
            previewUrl: URL.createObjectURL(file),
            dimensions,
            size,
          };
        })
      );
      setUploadedImages((prev) => [...prev, ...newImages]);
    }
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(event.target.files || []);
    const newImages = await Promise.all(
      files.map(async (file) => {
        const dimensions = await getImageDimensions(file);
        const size =
          file.size < 1024 * 1024
            ? `${(file.size / 1024).toFixed(1)} KB`
            : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

        return {
          file,
          previewUrl: URL.createObjectURL(file),
          dimensions,
          size,
        };
      })
    );
    setUploadedImages((prev) => [...prev, ...newImages]);
  };

  const handleOptimize = async () => {
    setIsOptimizing(true);

    const optimizedImages = await Promise.all(
      uploadedImages.map(async ({ file }) => {
        const options: CompressionOptions = {
          maxWidthOrHeight: Math.max(width, height),
          useWebWorker: true,
          initialQuality: isLossless ? 1 : quality,
          fileType: "image/webp",
          options: {
            lossless: isLossless,
          },
        };
        const compressedFile = await imageCompression(file, options);
        const webpDataUrl = await toDataUrlWebp(compressedFile);

        const size =
          compressedFile.size < 1024 * 1024
            ? `${(compressedFile.size / 1024).toFixed(1)} KB`
            : `${(compressedFile.size / (1024 * 1024)).toFixed(1)} MB`;

        return {
          dataUrl: webpDataUrl,
          fileName: file.name.replace(/\.[^/.]+$/, "") + ".webp",
          dimensions: { width, height },
          size,
        };
      })
    );

    setProcessedImages(optimizedImages);
    setIsOptimizing(false);
  };

  const toDataUrlWebp = async (file: Blob | MediaSource) => {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);

    await new Promise((resolve) => {
      img.onload = resolve;
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = width;
    canvas.height = height;

    // Calculate scaling to maintain aspect ratio
    const originalRatio = img.width / img.height;
    const targetRatio = width / height;

    let drawWidth = width;
    let drawHeight = height;

    if (originalRatio > targetRatio) {
      // Image is wider than target
      drawWidth = height * originalRatio;
      drawHeight = height;
    } else {
      // Image is taller than target
      drawWidth = width;
      drawHeight = width / originalRatio;
    }

    // Center the image
    const x = (width - drawWidth) / 2;
    const y = (height - drawHeight) / 2;

    if (ctx) {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, width, height);

      ctx.drawImage(img, x, y, drawWidth, drawHeight);
    }

    return canvas.toDataURL("image/webp", {
      quality: isLossless ? 1 : quality,
      lossless: isLossless,
    });
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
    file: File
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
      // Add small delay between downloads to prevent browser blocking
      setTimeout(() => {
        handleDownload(image.dataUrl, image.fileName);
      }, 100);
    });
  };

  return (
    <div className="container mx-auto py-10 space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-4">Upload and Resize Images</h2>

        <div className="flex gap-4 mb-4">
          <div className="flex-1 space-y-2">
            <label htmlFor="width" className="text-sm font-medium">
              Width (px)
            </label>
            <Input
              id="width"
              type="number"
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
              min="1"
            />
          </div>
          <div className="flex-1 space-y-2">
            <label htmlFor="height" className="text-sm font-medium">
              Height (px)
            </label>
            <Input
              id="height"
              type="number"
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
              min="1"
            />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex justify-between items-center">
              <label htmlFor="quality" className="text-sm font-medium">
                Quality ({Math.round(quality * 100)}%)
              </label>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Lossless</label>
                <Switch checked={isLossless} onCheckedChange={setIsLossless} />
              </div>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      isLossless && "cursor-not-allowed opacity-50"
                    )}
                  >
                    <Slider
                      id="quality"
                      min={10}
                      max={100}
                      step={1}
                      value={[quality * 100]}
                      onValueChange={(value) => setQuality(value[0] / 100)}
                      className={cn(
                        "py-4 cursor-grab",
                        isLossless && "pointer-events-none"
                      )}
                      disabled={isLossless}
                    />
                  </div>
                </TooltipTrigger>
                {isLossless && (
                  <TooltipContent>
                    <p>Quality slider is disabled in lossless mode</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Drag and drop your images here, or
            </p>
            <Button onClick={handleButtonClick}>Choose Images</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
          {uploadedImages.length > 0 && (
            <div className="col-span-full mb-4 flex gap-4">
              <Button onClick={handleOptimize} disabled={isOptimizing}>
                {isOptimizing ? "Optimizing..." : "Optimize Images"}
              </Button>
              {processedImages.length > 0 && (
                <Button
                  variant="outline"
                  onClick={handleDownloadAll}
                  className="flex gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download All
                </Button>
              )}
            </div>
          )}

          {(processedImages.length > 0 ? processedImages : uploadedImages).map(
            (image, index) => (
              <Card key={index} className="p-4 space-y-3">
                <div className="relative w-full pt-[56.25%]">
                  <img
                    src={"dataUrl" in image ? image.dataUrl : image.previewUrl}
                    alt="Image"
                    className="absolute inset-0 w-full h-full object-contain bg-gray-50 rounded-md"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm text-muted-foreground">
                    <span className="truncate">
                      {"fileName" in image
                        ? image.fileName
                        : (image as UploadedImage).file.name}
                    </span>
                    <span>{image.size}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      {image.dimensions?.width} × {image.dimensions?.height}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleDownload(
                          "dataUrl" in image ? image.dataUrl : image.previewUrl,
                          "fileName" in image ? image.fileName : image.file.name
                        )
                      }
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </div>
              </Card>
            )
          )}
        </div>
      </Card>
    </div>
  );
};

export default ImageResizeTool;
