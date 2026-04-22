import React, { useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';

interface FileUploaderProps {
  onUpload: (file: File) => void;
  acceptedTypes?: string;
  maxSize?: number;
  label?: string;
  subText?: string;
  multiple?: boolean;
  isUploading?: boolean;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const DEFAULT_SUBTEXT = 'PNG, JPG, or PDF • Max 50MB';

const FileUploader: React.FC<FileUploaderProps> = ({
  onUpload,
  acceptedTypes,
  maxSize,
  label = 'Upload your artwork',
  subText,
  multiple = false,
  isUploading = false,
  disabled = false,
  className = '',
  style,
}) => {
  const localInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const derivedSubText = subText || (maxSize ? `PNG, JPG, or PDF • Max ${Math.round(maxSize / (1024 * 1024))}MB` : DEFAULT_SUBTEXT);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0 || disabled || isUploading) return;
    if (multiple) {
      Array.from(files).forEach((file) => onUpload(file));
      return;
    }
    onUpload(files[0]);
  };

  const openFilePicker = () => {
    if (disabled || isUploading) return;
    localInputRef.current?.click();
  };

  return (
    <div
      className={[
        'w-full rounded-xl border-2 border-dashed text-center transition-all duration-200 ease-in-out',
        'border-[#E5E7EB] bg-[#FAFAFA] p-6 md:p-8',
        isDragActive ? 'border-[#F97316] bg-[#FFF3E0]' : 'hover:border-[#F97316] hover:bg-[#FFF7ED]',
        (disabled || isUploading) ? 'cursor-not-allowed opacity-80' : 'cursor-pointer',
        className,
      ].join(' ')}
      style={style}
      onClick={openFilePicker}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
        handleFiles(e.dataTransfer.files);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled && !isUploading) setIsDragActive(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
      }}
      onKeyDown={(e) => {
        if (e.repeat) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openFilePicker();
        }
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || isUploading}
    >
      <input
        ref={localInputRef}
        type="file"
        accept={acceptedTypes}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
        disabled={disabled || isUploading}
      />

      {isUploading ? (
        <div className="flex flex-col items-center justify-center">
          <Loader2 className="mb-2 h-8 w-8 animate-spin text-[#F97316] md:h-10 md:w-10" />
          <p className="text-sm font-medium text-gray-600">Uploading...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#F97316] md:h-14 md:w-14" aria-hidden="true">
            <Upload className="h-5 w-5 text-white md:h-6 md:w-6" />
          </div>
          <p className="text-sm font-semibold text-[#111827] md:text-base">{label}</p>
          <p className="mt-1 text-sm text-[#6B7280]">{derivedSubText}</p>
        </div>
      )}
    </div>
  );
};

export default FileUploader;
