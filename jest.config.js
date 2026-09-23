// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)'
  ],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
    '!src/**/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
}

// ESM-only dependencies that Jest (CommonJS) must compile. next/jest only lets custom config
// append ignore patterns, so its node_modules pattern is rewritten after it is resolved.
const esmOnlyPackages = ['cookie']

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = async () => {
  const config = await createJestConfig(customJestConfig)()
  const extra = esmOnlyPackages.join('|')
  config.transformIgnorePatterns = config.transformIgnorePatterns.map((pattern) => {
    if (pattern === '/node_modules/') return `/node_modules/(?!(${extra})/)`
    if (pattern.startsWith('/node_modules/(?!.pnpm)(?!(')) {
      return pattern.replace('(?!(', `(?!(${extra}|`)
    }
    return pattern
  })
  return config
}
