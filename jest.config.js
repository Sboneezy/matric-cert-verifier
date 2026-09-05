module.exports = {
    testEnvironment: "node",
    setupFilesAfterEnv: [
        "<rootDir>/jest.setup.js"
    ],
    testMatch: [
        "<rootDir>/tests/**/*.test.js"
    ],
    transform: {},
    verbose: true,
    extensionsToTreatAsEsm: []
};