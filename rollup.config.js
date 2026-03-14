const resolve = require('@rollup/plugin-node-resolve').default;
const commonjs = require('@rollup/plugin-commonjs');
const typescript = require('@rollup/plugin-typescript');

// Rollup config in CommonJS to avoid ESM loader issues
module.exports = {
  input: 'event-bus-client/index.ts',
  output: {
    file: 'dist-umd/event-bus-client.js',
    format: 'umd',
    name: 'BusClient',
    sourcemap: true,
    globals: {},
  },
  plugins: [
    resolve({ browser: true, preferBuiltins: false }),
    commonjs(),
    typescript({ tsconfig: './tsconfig.json', compilerOptions: { module: 'ESNext' } }),
  ],
};