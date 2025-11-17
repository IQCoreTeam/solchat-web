import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    // Validate URL
    let fileUrl: URL;
    try {
      fileUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Fetch the file server-side (bypasses CORS)
    const response = await fetch(fileUrl.toString());

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch file: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Get the file content
    const blob = await response.blob();
    const buffer = Buffer.from(await blob.arrayBuffer());

    // Extract filename from URL
    const filename = fileUrl.pathname.split('/').pop() || 'download';

    // Get content type from response or default
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    // Return the file with download headers
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Download proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to download file' },
      { status: 500 }
    );
  }
}
