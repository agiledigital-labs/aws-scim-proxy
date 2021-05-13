import webpack from 'webpack';
import slsw from 'serverless-webpack';
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin';
import { join } from 'path';
import TerserPlugin from 'terser-webpack-plugin';

const config: webpack.Configuration = {
  entry: slsw.lib.entries,
  mode: 'development',
  stats: 'minimal',
  target: 'node',
  devtool: 'source-map',
  resolve: {
    extensions: ['.ts', '.js'],
    plugins: [new TsconfigPathsPlugin()],
  },
  output: {
    libraryTarget: 'commonjs',
    path: join(__dirname, '.webpack'),
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        loader: 'ts-loader',
        options: {
          configFile: 'tsconfig.webpack.json',
        },
      },
    ],
  },
  optimization: {
    minimize: true,
    minimizer: [
      // @ts-ignore
      new TerserPlugin({
        terserOptions: {
          compress: { drop_console: !(process.env.TRACE_LOGGING == 'true') },
        },
      }),
    ],
  },
};

module.exports = config;
