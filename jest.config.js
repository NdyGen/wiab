module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  collectCoverageFrom: [
    'lib/**/*.ts',
    'drivers/wiab-device/device.ts',
    'drivers/wiab-room-state/device.ts',
    '!lib/types.ts',
    '!**/*.d.ts'
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/'
  ],
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  forceExit: true,
  detectOpenHandles: false,
  testTimeout: 10000,
  moduleNameMapper: {
    '^homey$': '<rootDir>/tests/__mocks__/homey.ts'
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: false,
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    }]
  }
};
