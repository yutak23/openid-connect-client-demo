const path = require('path');
const nodeExternals = require('webpack-node-externals');
const ESLintPlugin = require('eslint-webpack-plugin');

module.exports = {
	devtool: 'source-map',
	target: 'node',
	externals: [nodeExternals()],
	mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
	name: 'openid-connect-client-demo',
	entry: {
		index: './src/index.js'
	},
	output: {
		path: path.resolve(__dirname, 'dist'),
		filename: '[name].js',
		clean: true
	},
	module: {
		rules: [
			{
				test: /\.m?js$/,
				exclude: /node_modules/,
				use: {
					loader: 'babel-loader'
				}
			}
		]
	},
	plugins: [new ESLintPlugin({ exclude: 'node_modules' })]
};
