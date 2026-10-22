import React, { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { activateFilePicker } from './filePicker';
import { logUx } from '@/lib/uxAnalytics';

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
  choiceCard?: boolean;
}

export interface FileUploaderHandle {
  /**
   * Opens the native file chooser synchronously from the caller's user gesture.
   * The boolean result lets sticky CTAs fall back to scrolling when the input is
   * temporarily unavailable or blocked by an in-progress upload.
   */
  openFilePicker: () => boolean;
  focus: () => void;
}

const DEFAULT_SUBTEXT = 'PNG, JPG, or PDF • Max 50MB';

const FileUploader = forwardRef<FileUploaderHandle, FileUploaderProps>(({
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
  choiceCard = false,
}, ref) => {
  const localInputRef = useRef<HTMLInputElement>(null);
  const descriptionId = useId();
  const [isDragActive, setIsDragActive] = useState(false);
  const [pickerError, setPickerError] = useState(false);

  useEffect(() => {
    const input = localInputRef.current;
    const onCancel = () => logUx('upload_picker_cancelled');
    // React 18 does not delegate a file input's native cancel event.
    input?.addEventListener('cancel', onCancel);
    return () => input?.removeEventListener('cancel', onCancel);
  }, []);

  const derivedSubText = subText || (maxSize ? `PNG, JPG, or PDF • Max ${Math.round(maxSize / (1024 * 1024))}MB` : DEFAULT_SUBTEXT);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0 || disabled || isUploading) return;
    setPickerError(false);
    logUx('upload_file_selected', { count: files.length, fileType: files[0].type, fileBytes: files[0].size });
    if (multiple) {
      Array.from(files).forEach((file) => onUpload(file));
      return;
    }
    onUpload(files[0]);
  };

  const openFilePicker = useCallback((): boolean => {
    const requested = activateFilePicker(localInputRef.current, disabled || isUploading);
    if (!disabled && !isUploading) {
      setPickerError(!requested);
      logUx('upload_picker_requested', { source: 'external_cta', requested });
    }
    return requested;
  }, [disabled, isUploading]);

  useImperativeHandle(ref, () => ({
    openFilePicker,
    focus: () => localInputRef.current?.focus(),
  }), [openFilePicker]);

  return (
    <label
      className={[
        choiceCard ? 'w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm' : 'w-full rounded-xl border-2 border-dashed text-center border-[#E5E7EB] bg-[#FAFAFA] p-6 md:p-8',
        'relative transition-colors duration-200 ease-in-out focus-within:ring-2 focus-within:ring-orange-500 focus-within:ring-offset-2',
        'flex items-center justify-center',
        isDragActive ? 'border-[#F97316] bg-[#FFF3E0]' : 'hover:border-[#F97316] hover:bg-[#FFF7ED]',
        (disabled || isUploading) ? 'cursor-not-allowed opacity-80' : 'cursor-pointer',
        className,
      ].join(' ')}
      style={style}
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
    >
      {/* The actual native control receives the touch. No synthetic click is
          needed for the artwork card, including on mobile Safari. */}
      <input
        ref={localInputRef}
        type="file"
        accept={acceptedTypes}
        multiple={multiple}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        aria-label={label}
        aria-describedby={descriptionId}
        onClick={(event) => {
          event.stopPropagation();
          setPickerError(false);
          logUx('upload_picker_requested', { source: 'native_input', requested: true });
        }}
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
      ) : choiceCard ? (
        <div className="flex w-full items-start gap-4">
          <Upload className="mt-1 h-8 w-8 shrink-0 text-[#18448D]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-[#061A31]">I have artwork</p>
            <p id={descriptionId} className="mt-0.5 text-xs text-slate-600">{derivedSubText}</p>
            <span className="mt-2 flex min-h-11 items-center justify-center rounded-lg bg-orange-500 px-3 text-sm font-bold text-white">{label}</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#F97316] md:h-14 md:w-14" aria-hidden="true">
            <Upload className="h-5 w-5 text-white md:h-6 md:w-6" />
          </div>
          <p className="text-sm font-semibold text-[#111827] md:text-base">{label}</p>
          <p id={descriptionId} className="mt-1 text-sm text-[#6B7280]">{derivedSubText}</p>
        </div>
      )}
      {pickerError && <span role="alert" className="mt-2 text-sm text-red-700">Tap this upload area to choose your file.</span>}
    </label>
  );
});

FileUploader.displayName = 'FileUploader';

export default FileUploader;
