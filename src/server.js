import 'source-map-support/register';
import axios from 'axios';
import express from 'express';
import * as helmet from 'helmet';
import config from 'config';
import https from 'https';
import fs from 'fs';
import appRoot from 'app-root-path';
import qs from 'qs';
import camelcaseKeys from 'camelcase-keys';

import expressSession from 'express-session';
import connectRedis from 'connect-redis';
import Redis from 'ioredis';

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

app.set('view engine', 'ejs');
app.set('views', appRoot.resolve('src/views'));

const redis = new Redis();
const RedisStore = connectRedis(expressSession);
const store = new RedisStore({ client: redis });

app.use(
	expressSession({
		...config.get('redis.session'),
		secret: process.env.COOKIE_SECRET,
		store
	})
);
app.use(helmet.hidePoweredBy());
app.use(helmet.xssFilter());

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
	const {
		session,
		query: { code }
	} = req;

	try {
		const { data: openidConfig } = await axios.get(config.get('discovery'));

		const params = new URLSearchParams();
		params.append('client_id', process.env.CLIENT_ID);
		params.append('client_secret', process.env.CLIENT_SECRET);
		params.append('grant_type', 'authorization_code');
		params.append('code', code);
		params.append('redirect_uri', config.get('redirectUri'));

		const { data } = await axios.post(openidConfig.token_endpoint, params);
		const camelCaseData = camelcaseKeys(data);

		const regenerate = (oldSession) => {
			return new Promise((resolve, reject) => {
				oldSession.regenerate((err) => {
					if (err) throw reject(err);
					const { session: newSession } = req;
					newSession.accessToken = camelCaseData.accessToken;
					resolve(newSession);
				});
			});
		};
		await regenerate(session);
		res.render('./redirect.ejs', camelCaseData);
	} catch (error) {
		res.end(error.message);
	}
});

app.get('/calendarList', async (req, res) => {
	const { session } = req;

	try {
		const { data } = await axios.get(
			'https://www.googleapis.com/calendar/v3/users/me/calendarList',
			{
				headers: {
					Authorization: `Bearer ${session.accessToken}`
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
