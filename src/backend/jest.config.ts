import type { Config } from '@jest/types'; // v29.0.0

const config: Config.InitialOptions = {
  // Use ts-jest preset for TypeScript support
  preset: 'ts-jest',
  
  // Set Node.js as the test environment
  testEnvironment: 'node',
  
  // Define root directories for tests and source files
  roots: [
    '<rootDir>/src',
    '<rootDir>/tests'
  ],
  
  // Test file patterns to match
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx)',
    '**/?(*.)+(spec|test).+(ts|tsx)'
  ],
  
  // TypeScript transformation configuration
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
  
  // Module path aliases mapping (aligned with tsconfig.json paths)
  moduleNameMapper: {
    '@/(.*)': '<rootDir>/src/$1',
    '@api/(.*)': '<rootDir>/src/api/$1',
    '@core/(.*)': '<rootDir>/src/core/$1',
    '@types/(.*)': '<rootDir>/src/types/$1',
    '@config/(.*)': '<rootDir>/src/config/$1',
    '@document-processing/(.*)': '<rootDir>/src/document-processing/$1',
    '@scraping/(.*)': '<rootDir>/src/scraping/$1'
  },
  
  // Code coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  
  // Coverage thresholds (minimum 80% as per requirements)
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // Paths to exclude from coverage reporting
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/tests/',
    '\\.d\\.ts$'
  ],
  
  // Test setup file
  setupFiles: [
    '<rootDir>/tests/setup.ts'
  ],
  
  // Test timeout in milliseconds
  testTimeout: 30000,
  
  // Additional configuration options
  verbose: true,
  clearMocks: true,
  restoreMocks: true,
  
  // Reporter configuration
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'coverage',
        outputName: 'junit.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: true
      }
    ]
  ],
  
  // Global setup/teardown hooks
  globalSetup: '<rootDir>/tests/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/globalTeardown.ts',
  
  // Module file extensions
  moduleFileExtensions: [
    'ts',
    'tsx',
    'js',
    'jsx',
    'json',
    'node'
  ]
};

export default config;