const path = require('path')

module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      [
        'babel-preset-expo',
        { unstable_transformImportMeta: true },
      ],
    ],
    plugins: [
      [
        'babel-plugin-module-resolver',
        {
          root: [path.resolve(__dirname)],
          alias: {
            '@finanzas/shared': path.resolve(__dirname, '../shared'),
          },
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
        },
      ],
      'nativewind/babel',
    ],
  }
}
