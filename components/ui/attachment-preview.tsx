/**
 * Attachment Preview Component
 * Displays different types of file attachments (images, videos, audio, links)
 */

'use client';

import { detectAttachmentType } from '@/lib/utils/message-utils';

interface AttachmentPreviewProps {
  url: string;
  className?: string;
}

export function AttachmentPreview({ url, className = '' }: AttachmentPreviewProps) {
  const type = detectAttachmentType(url);

  if (type === 'image') {
    return (
      <img
        src={url}
        alt="Attachment"
        className={`max-h-64 w-full rounded border border-white/10 object-contain ${className}`}
        loading="lazy"
      />
    );
  }

  if (type === 'video') {
    return (
      <video
        controls
        src={url}
        className={`max-h-64 w-full rounded border border-white/10 ${className}`}
      >
        Your browser does not support the video tag.
      </video>
    );
  }

  if (type === 'audio') {
    return (
      <audio controls src={url} className={`w-full ${className}`}>
        Your browser does not support the audio element.
      </audio>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-2 text-green-300 underline decoration-dotted underline-offset-2 ${className}`}
    >
      Open attachment
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 13v6a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h6" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 3h6v6" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14L21 3" />
      </svg>
    </a>
  );
}
