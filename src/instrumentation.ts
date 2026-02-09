export async function register() {
  // Only run on the server (not edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startLicenseRevalidation } = await import('@/lib/license');
    startLicenseRevalidation();
  }
}
