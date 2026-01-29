'use client';

import { useState, useRef } from 'react';
import type { BlueprintAttachment, BlueprintSection } from '@/lib/supabase';

interface BlueprintImageUploadProps {
  section: BlueprintSection;
  attachments: BlueprintAttachment[];
  onUpload: (file: File, screenLabel?: string) => Promise<BlueprintAttachment | null>;
  onDelete: (attachmentId: string) => Promise<boolean>;
}

export default function BlueprintImageUpload({
  attachments,
  onUpload,
  onDelete,
}: BlueprintImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [screenLabel, setScreenLabel] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      await onUpload(file, screenLabel || undefined);
      setScreenLabel('');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (attachmentId: string) => {
    if (!confirm('Delete this image?')) return;
    await onDelete(attachmentId);
  };

  // Get public URL for attachment
  const getAttachmentUrl = (attachment: BlueprintAttachment) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return `${supabaseUrl}/storage/v1/object/public/blueprint-attachments/${attachment.storage_path}`;
  };

  return (
    <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
        Inspiration Screenshots (Optional)
      </h4>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Upload screenshots from competitor apps for design reference. These will be mentioned in the generated wireframes.
      </p>

      {/* Upload Form */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="text"
          value={screenLabel}
          onChange={(e) => setScreenLabel(e.target.value)}
          placeholder="Screen label (e.g., Onboarding 1, Paywall)"
          className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
        >
          {uploading ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Uploading...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Upload Image
            </>
          )}
        </button>
      </div>

      {/* Attachments Grid */}
      {attachments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="relative group aspect-[9/16] bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden"
            >
              <img
                src={getAttachmentUrl(attachment)}
                alt={attachment.screen_label || attachment.file_name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                <span className="text-white text-xs text-center px-2">
                  {attachment.screen_label || attachment.file_name}
                </span>
                <button
                  onClick={() => handleDelete(attachment.id)}
                  className="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              {attachment.screen_label && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                  <span className="text-white text-xs truncate block">
                    {attachment.screen_label}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {attachments.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-4">
          No screenshots uploaded yet
        </p>
      )}
    </div>
  );
}
