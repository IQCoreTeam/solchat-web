import { ImageResponse } from 'next/og';
import { getSocialImageContent, socialImageAlt, socialImageSize } from './social-image';

export const runtime = 'edge';

export const alt = socialImageAlt;
export const size = socialImageSize;
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    getSocialImageContent(),
    {
      ...size,
    }
  );
}
