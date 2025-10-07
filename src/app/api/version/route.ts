import { NextResponse } from 'next/server';
import packageJson from '../../../../package.json';

const GITHUB_REPO = 'ismoilovdevml/gitlab-ci-dashboard';

export async function GET() {
  try {
    const currentVersion = packageJson.version;

    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GitLab-CI-Dashboard'
        },
        next: { revalidate: 3600 } // Cache for 1 hour
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch latest version');
    }

    const data = await response.json();
    const latestVersion = data.tag_name.replace('v', '');
    const updateAvailable = compareVersions(currentVersion, latestVersion);

    return NextResponse.json({
      currentVersion,
      latestVersion,
      updateAvailable,
      releaseUrl: data.html_url,
      releaseDate: data.published_at,
      releaseNotes: data.body
    });
  } catch (error) {
    console.error('Version check failed:', error);
    return NextResponse.json({
      currentVersion: packageJson.version,
      latestVersion: packageJson.version,
      updateAvailable: false,
      error: 'Failed to check for updates'
    });
  }
}

function compareVersions(current: string, latest: string): boolean {
  const currentParts = current.split('.').map(Number);
  const latestParts = latest.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    if (latestParts[i] > currentParts[i]) return true;
    if (latestParts[i] < currentParts[i]) return false;
  }

  return false;
}
