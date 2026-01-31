/**
 * Start Crawl Service API Route
 *
 * Spawns the Python crawl service as a background process.
 * Only works in local development environment.
 */

import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export const dynamic = 'force-dynamic';

// Track if we've already started the service
let serviceProcess: ReturnType<typeof spawn> | null = null;

export async function POST(request: Request) {
  // Only allow on localhost (security measure for deployed environments)
  const host = request.headers.get('host') || '';
  const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('192.168.');

  if (!isLocalhost) {
    return NextResponse.json(
      { error: 'Crawler can only be started from localhost' },
      { status: 403 }
    );
  }

  // Check if service is already running
  try {
    const healthCheck = await fetch('http://localhost:8000/health', {
      signal: AbortSignal.timeout(2000),
    });
    if (healthCheck.ok) {
      return NextResponse.json({
        success: true,
        message: 'Crawler is already running',
        alreadyRunning: true
      });
    }
  } catch {
    // Service not running, proceed to start
  }

  try {
    const crawlServicePath = path.join(process.cwd(), 'crawl-service');

    // Determine the right Python command based on OS
    const isWindows = process.platform === 'win32';
    const pythonCmd = isWindows ? 'python' : 'python3';

    // Spawn uvicorn as a detached process
    serviceProcess = spawn(
      pythonCmd,
      ['-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', '8000'],
      {
        cwd: crawlServicePath,
        detached: true,
        stdio: 'ignore',
        shell: isWindows, // Use shell on Windows for better compatibility
        windowsHide: true, // Hide the console window on Windows
      }
    );

    // Unref so the parent process can exit independently
    serviceProcess.unref();

    // Wait a moment for the service to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify it started
    try {
      const healthCheck = await fetch('http://localhost:8000/health', {
        signal: AbortSignal.timeout(5000),
      });
      if (healthCheck.ok) {
        return NextResponse.json({
          success: true,
          message: 'Crawler started successfully',
          pid: serviceProcess.pid
        });
      }
    } catch {
      // Service didn't respond yet, but process may still be starting
    }

    return NextResponse.json({
      success: true,
      message: 'Crawler process started (may take a few seconds to initialize)',
      pid: serviceProcess.pid
    });

  } catch (error) {
    console.error('Failed to start crawler:', error);
    return NextResponse.json(
      {
        error: 'Failed to start crawler',
        details: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Make sure Python and dependencies are installed. Run: cd crawl-service && pip install -r requirements.txt'
      },
      { status: 500 }
    );
  }
}
