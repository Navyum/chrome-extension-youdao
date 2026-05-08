const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    background: './src/background.js',
    popup: './src/popup.js',
    settings: './src/settings.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'src/popup.html', to: 'popup.html' },
        { from: 'src/popup.css', to: 'popup.css' },
        { from: 'src/settings.html', to: 'settings.html' },
        { from: 'src/settings.css', to: 'settings.css' },
        { from: '_locales', to: '_locales' },
        { from: 'icons', to: 'icons' },
        { from: 'assets', to: 'assets' },
      ],
    }),
  ],
  resolve: {
    extensions: ['.js'],
  },
};
