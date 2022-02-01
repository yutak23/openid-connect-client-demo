import axios from 'axios';
import express from 'express';
import config from 'config';
import https from 'https';
import fs from 'fs';
import appRoot from 'app-root-path';
import qs from 'qs';
import camelcaseKeys from 'camelcase-keys';

import AccessToken from './lib/access-token';

const callback = new URL(config.get('redirectUri'));

const app = express();
const server =
	callback.protocol === 'https:'
		? https.createServer(
				{
					key: fs.readFileSync('./ssl/server.key'),
					cert: fs.readFileSync('./ssl/server.crt')
				},
				app
		  )
		: app;

app.locals.AccessToken = new AccessToken();

app.set('view engine', 'ejs');
app.set('views', appRoot.resolve('src/views'));
app.disable('x-powered-by');

app.get('/', (req, res) => {
	res.render('./index.ejs');
});

app.get('/begin', async (req, res) => {
	const { data: openidConfig } = await axios.get(config.get('discovery'));

	const params = {
		client_id: process.env.CLIENT_ID,
		response_type: 'code',
		scope: config.get('authRequest.scopes').join(' '),
		redirect_uri: config.get('redirectUri')
	};

	res.redirect(
		`${openidConfig.authorization_endpoint}?${qs.stringify(params)}`
	);
});

app.get('/oauth2/callback', async (req, res) => {
	// eslint-disable-next-line no-shadow
	const { AccessToken } = req.app.locals;

	try {
		const { data: openidConfig } = await axios.get(config.get('discovery'));

		const params = new URLSearchParams();
		params.append('client_id', process.env.CLIENT_ID);
		params.append('client_secret', process.env.CLIENT_SECRET);
		params.append('grant_type', 'authorization_code');
		params.append('code', req.query.code);
		params.append('redirect_uri', config.get('redirectUri'));

		const { data } = await axios.post(openidConfig.token_endpoint, params);
		const camelCaseData = camelcaseKeys(data);
		AccessToken.setToken(camelCaseData.accessToken);

		res.render('./redirect.ejs', camelCaseData);
	} catch (error) {
		res.end(error.message);
	}
});

app.get('/calendarList', async (req, res) => {
	// eslint-disable-next-line no-shadow
	const { AccessToken } = req.app.locals;

	try {
		const { data } = await axios.get(
			'https://www.googleapis.com/calendar/v3/users/me/calendarList',
			{
				headers: {
					Authorization: `Bearer ${AccessToken.getToken()}`
				}
			}
		);

		res.status(200).json(data);
	} catch (error) {
		console.log(error);
		res.status(500).json(error.message);
	}
});

server.listen(
	callback.port || (callback.protocol === 'https:' ? 443 : 80),
	// '127.0.0.1',
	() => {
		console.log(
			`Server Start with ${callback.protocol.replace(':', '').toUpperCase()}`
		);
		console.log(
			`Endpoint is ${callback.protocol}//127.0.0.1:${
				callback.port || (callback.protocol === 'https:' ? 443 : 80)
			}${callback.pathname}`
		);
	}
);
